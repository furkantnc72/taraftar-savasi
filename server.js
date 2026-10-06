
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static("public"));
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TEAMS = {
  gs: { id:"gs", name:"Galatasaray" },
  fb: { id:"fb", name:"Fenerbahçe" },
  bjk:{ id:"bjk",name:"Beşiktaş" },
  ts: { id:"ts", name:"Trabzonspor" },
  amed:{ id:"amed", name:"Amedspor" },
  bursa:{ id:"bursa", name:"Bursaspor" },
  ksp:{ id:"ksp", name:"Kasımpaşa" },
  kocaeli:{ id:"kocaeli", name:"Kocaelispor" },
};

const ALIASES = {
  gs:["gs","galatasaray","galata saray","cimbom","aslan"],
  fb:["fb","fenerbahce","fenerbahçe","fener","kanarya"],
  bjk:["bjk","besiktas","beşiktaş","kartal"],
  ts:["ts","trabzonspor","trabzon","bordo mavi"],
  amed:["amed","amedspor","amed spor"],
  bursa:["bursa","bursaspor","bursa spor","timsah"],
  ksp:["ksp","kşp","kasimpasa","kasımpaşa","kasim pasa","kasım paşa"],
  kocaeli:["kocaeli","kocaelispor","kocaeli spor","korfez","körfez"],
};

const norm = (s="") => s.toLocaleLowerCase("tr-TR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/ı/g,"i").replace(/ş/g,"s").replace(/ğ/g,"g")
  .replace(/ü/g,"u").replace(/ö/g,"o").replace(/ç/g,"c")
  .replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();

const aliasMap = new Map();
for (const [team, aliases] of Object.entries(ALIASES)) {
  for (const a of aliases) aliasMap.set(norm(a), team);
}

function editDistance(a,b){
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return dp[m][n];
}

function detectTeam(comment=""){
  const c=norm(comment);
  if(aliasMap.has(c)) return aliasMap.get(c);

  // exact alias as a standalone token/phrase
  for (const [alias, team] of aliasMap.entries()) {
    if (alias.length >= 2 && (` ${c} `).includes(` ${alias} `)) return team;
  }

  // small typo tolerance only for longer aliases to avoid false positives
  let best=null;
  for(const [alias,team] of aliasMap.entries()){
    if(alias.length < 5 || Math.abs(alias.length-c.length)>2) continue;
    const d=editDistance(alias,c);
    const max=alias.length>=9?2:1;
    if(d<=max && (!best || d<best.d)) best={team,d};
  }
  return best?.team || null;
}

const state = {
  roundMinutes: 30,
  roundEndsAt: Date.now() + 30*60*1000,
  teams: Object.fromEntries(Object.keys(TEAMS).map(id => [id,{score:0,fans:0,top:{}}])),
  users: {},
  connected: false,
  liveUser: "",
  lastEvent: null
};

const pendingGifts = new Map(); // uid -> [{payload, expiresAt}]
let liveConnection = null;

function safeUser(data){
  const u=data?.user || {};
  return {
    uid: String(u.userId || data?.userId || u.uniqueId || data?.uniqueId || "anon"),
    name: String(u.uniqueId || data?.uniqueId || u.nickname || data?.nickname || "izleyici"),
    nickname: String(u.nickname || data?.nickname || u.uniqueId || data?.uniqueId || "İzleyici")
  };
}

function ensureUser(user){
  if(!state.users[user.uid]) state.users[user.uid]={name:user.name,nickname:user.nickname,team:null,likes:0,likeAwarded:0,giftPoints:0};
  return state.users[user.uid];
}

function broadcast(){
  io.emit("state", state);
}

function setTeam(user, teamId){
  const record=ensureUser(user);
  const old=record.team;
  if(old===teamId) return;

  if(old && state.teams[old]) state.teams[old].fans=Math.max(0,state.teams[old].fans-1);
  record.team=teamId;
  state.teams[teamId].fans++;

  event({
    type:"team_join",
    team:teamId,
    user:user.name,
    title:`@${user.name} ${TEAMS[teamId].name} tarafına geçti!`,
    points:0
  });

  // Apply unexpired gifts that arrived before team selection
  const list=(pendingGifts.get(user.uid)||[]).filter(x=>x.expiresAt>Date.now());
  if(list.length){
    for(const item of list) applyGift(user,item.payload);
    pendingGifts.delete(user.uid);
  }
}

function award(teamId, points, user, source, eventType="support", extra={}){
  if(!teamId || !state.teams[teamId]) return;
  const team=state.teams[teamId];
  team.score += points;

  if(user){
    const rec=ensureUser(user);
    if(source==="gift") rec.giftPoints += points;
    team.top[user.name]=(team.top[user.name]||0)+points;
  }

  event({
    type:eventType, team:teamId, points, user:user?.name || "",
    title: extra.title || `${TEAMS[teamId].name} +${points}`,
    giftName:extra.giftName||"",
    diamondCount:extra.diamondCount||0
  });
}

function event(e){
  state.lastEvent={...e, at:Date.now()};
  io.emit("gameEvent", state.lastEvent);
  broadcast();
}

function getGiftMeta(data){
  const ext=data?.extendedGiftInfo || {};
  const details=data?.giftDetails || {};
  const giftName=String(ext.name || details.giftName || details.name || data?.giftName || `Hediye #${data?.giftId ?? "?"}`);
  const diamond=Number(
    ext.diamondCount ?? ext.diamond_count ??
    details.diamondCount ?? details.diamond_count ??
    data?.diamondCount ?? data?.diamond_count ?? 1
  ) || 1;
  return {giftName,diamond};
}

function pointsFromDiamonds(d){
  // Unknown gifts never go to waste. Tuned so likes stay meaningful but gifts dominate.
  if(d<=1) return 10;
  if(d<=5) return 25;
  if(d<=20) return 75;
  if(d<=100) return 250;
  if(d<=500) return 750;
  if(d<=1500) return 2000;
  return Math.min(50000, Math.round(d*2.5));
}

function specialType(d){
  if(d>=1500) return "stadium";
  if(d>=500) return "royal";
  if(d>=100) return "super_goal";
  if(d>=20) return "attack";
  if(d>=5) return "goal";
  return "support";
}

function applyGift(user,data){
  const rec=ensureUser(user);
  if(!rec.team) return;
  const {giftName,diamond}=getGiftMeta(data);
  const repeat=Math.max(1,Number(data?.repeatCount||1));
  const points=pointsFromDiamonds(diamond)*repeat;
  award(rec.team,points,user,"gift",specialType(diamond),{
    giftName,
    diamondCount:diamond,
    title:`@${user.name} → ${TEAMS[rec.team].name} • ${giftName} +${points}`
  });
}

function handleGift(data){
  // Streakable gifts emit repeatedly. Process only the final streak event when indicated.
  const giftType=Number(data?.giftType ?? data?.extendedGiftInfo?.giftType ?? 0);
  if(giftType===1 && data?.repeatEnd===false) return;

  const user=safeUser(data), rec=ensureUser(user);
  if(!rec.team){
    const list=pendingGifts.get(user.uid)||[];
    list.push({payload:data, expiresAt:Date.now()+30000});
    pendingGifts.set(user.uid,list);
    event({
      type:"pending",
      team:null,user:user.name,points:0,
      title:`@${user.name}, hediyen bekliyor! 30 sn içinde takımını yaz.`
    });
    return;
  }
  applyGift(user,data);
}

function handleChat(data){
  const user=safeUser(data);
  ensureUser(user);
  const comment=String(data?.comment||"");
  const team=detectTeam(comment);
  if(team) setTeam(user,team);
}

function handleLike(data){
  const user=safeUser(data), rec=ensureUser(user);
  const delta=Math.max(0,Number(data?.likeCount ?? data?.count ?? 1) || 1);
  rec.likes += delta;
  if(!rec.team) return;

  const chunks=Math.floor(rec.likes/200);
  const due=chunks-rec.likeAwarded;
  if(due>0){
    rec.likeAwarded=chunks;
    const points=due*5;
    award(rec.team,points,user,"like","like",{
      title:`👍 @${user.name} ${TEAMS[rec.team].name} +${points}`
    });
  }
}

async function disconnectLive(){
  try{ await liveConnection?.disconnect?.(); }catch{}
  liveConnection=null;
  state.connected=false;
  state.liveUser="";
  broadcast();
}

async function connectLive(username){
  await disconnectLive();
  username=String(username||"").replace(/^@/,"").trim();
  if(!username) throw new Error("TikTok kullanıcı adı boş.");

  const conn=new TikTokLiveConnection(username,{enableExtendedGiftInfo:true});
  liveConnection=conn;

  conn.on(WebcastEvent.CHAT, handleChat);
  conn.on(WebcastEvent.GIFT, handleGift);
  conn.on(WebcastEvent.LIKE, handleLike);
  conn.on(ControlEvent.STREAM_END, ()=>{
    state.connected=false; broadcast();
  });
  conn.on(ControlEvent.DISCONNECTED, ()=>{
    state.connected=false; broadcast();
  });
  conn.on(ControlEvent.ERROR, err=>{
    io.emit("connectionError", String(err?.message||err));
  });

  await conn.connect();
  state.connected=true;
  state.liveUser=username;
  broadcast();
  return username;
}

function resetRound(minutes=state.roundMinutes){
  state.roundMinutes=Number(minutes)===40?40:30;
  state.roundEndsAt=Date.now()+state.roundMinutes*60*1000;
  for(const t of Object.values(state.teams)){ t.score=0;t.top={}; }
  for(const u of Object.values(state.users)){ u.giftPoints=0; u.likeAwarded=Math.floor((u.likes||0)/200); }
  state.lastEvent=null;
  event({type:"round_start",team:null,user:"",points:0,title:`Yeni ${state.roundMinutes} dakikalık tur başladı!`});
}

io.on("connection", socket=>{
  socket.emit("state",state);

  socket.on("connectTikTok", async ({username}={})=>{
    try{
      await connectLive(username);
      socket.emit("connectResult",{ok:true,username:state.liveUser});
    }catch(e){
      socket.emit("connectResult",{ok:false,error:String(e?.message||e)});
    }
  });

  socket.on("disconnectTikTok", async ()=>{ await disconnectLive(); });
  socket.on("setRound", ({minutes}={})=>resetRound(minutes));
  socket.on("resetRound", ()=>resetRound(state.roundMinutes));

  // Test controls
  socket.on("simulate", payload=>{
    const name=String(payload?.user||"test_user").replace(/^@/,"");
    const uid=`test:${name}`;
    const user={uid,name,nickname:name};
    ensureUser(user);

    if(payload?.kind==="team") setTeam(user,payload.team||"gs");
    if(payload?.kind==="chat") handleChat({user:{userId:uid,uniqueId:name},comment:payload.comment||"gs"});
    if(payload?.kind==="like"){
      const rec=ensureUser(user);
      if(payload.team && !rec.team) setTeam(user,payload.team);
      handleLike({user:{userId:uid,uniqueId:name},likeCount:Number(payload.amount||200)});
    }
    if(payload?.kind==="gift"){
      const rec=ensureUser(user);
      if(payload.team && !rec.team) setTeam(user,payload.team);
      handleGift({
        user:{userId:uid,uniqueId:name},
        giftId:999,
        giftType:0,
        repeatCount:1,
        repeatEnd:true,
        extendedGiftInfo:{name:payload.giftName||"Test Hediyesi",diamondCount:Number(payload.diamonds||1)}
      });
    }
  });
});

setInterval(()=>{
  if(Date.now()>=state.roundEndsAt){
    const winner=Object.entries(state.teams).sort((a,b)=>b[1].score-a[1].score)[0]?.[0];
    if(winner) event({type:"round_end",team:winner,user:"",points:0,title:`🏆 ${TEAMS[winner].name} TURU KAZANDI!`});
    resetRound(state.roundMinutes);
  } else {
    io.emit("clock",{roundEndsAt:state.roundEndsAt});
  }
},1000);

server.listen(PORT,()=>console.log(`Taraftar Savaşı: http://localhost:${PORT}`));
