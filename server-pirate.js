import express from "express";
import http from "http";
import { Server } from "socket.io";
import { TikTokLiveClient, EventType } from "piratetok-live-js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static("public"));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ROUND_CELEBRATION_MS = 35000;

app.get("/health", (_req,res)=>res.json({ok:true,provider:"piratetok",connected:state.connected,liveUser:state.liveUser||null}));

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

const norm = (s="") => String(s).toLocaleLowerCase("tr-TR")
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
  for (const [alias, team] of aliasMap.entries()) {
    if (alias.length >= 2 && (` ${c} `).includes(` ${alias} `)) return team;
  }
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
  roundEnding: false,
  completedRounds: 0,
  teams: Object.fromEntries(Object.keys(TEAMS).map(id => [id,{score:0,fans:0,wins:0,top:{}}])),
  users: {},
  connected: false,
  liveUser: "",
  liveRoomId: "",
  provider: "PirateTok",
  lastEvent: null
};

const pendingGifts = new Map();
let liveConnection = null;
let roundEnding = false;
let autoResetTimer = null;

function safeUser(data){
  const u=data?.user || {};
  const id=u.userId ?? u.id ?? u.secUid ?? u.uniqueId ?? u.nickname ?? "anon";
  const unique=u.uniqueId ?? u.username ?? u.nickname ?? String(id);
  return {
    uid:String(id),
    name:String(unique||"izleyici"),
    nickname:String(u.nickname||unique||"İzleyici")
  };
}

function ensureUser(user){
  if(!state.users[user.uid]) state.users[user.uid]={name:user.name,nickname:user.nickname,team:null,likes:0,likeAwarded:0,giftPoints:0};
  return state.users[user.uid];
}

function broadcast(){ io.emit("state", state); }

function event(e){
  state.lastEvent={...e, at:Date.now()};
  io.emit("gameEvent", state.lastEvent);
  broadcast();
}

function setTeam(user, teamId){
  const record=ensureUser(user);
  const old=record.team;
  if(old===teamId || !state.teams[teamId]) return;
  if(old && state.teams[old]) state.teams[old].fans=Math.max(0,state.teams[old].fans-1);
  record.team=teamId;
  state.teams[teamId].fans++;
  event({type:"team_join",team:teamId,user:user.name,title:`@${user.name} ${TEAMS[teamId].name} tarafına geçti!`,points:0});
  const list=(pendingGifts.get(user.uid)||[]).filter(x=>x.expiresAt>Date.now());
  if(list.length){
    for(const item of list) applyGift(user,item.payload);
    pendingGifts.delete(user.uid);
  }
}

function award(teamId, points, user, source, eventType="support", extra={}){
  if(!teamId || !state.teams[teamId] || roundEnding) return;
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
    diamondCount:extra.diamondCount||0,
    unitValue:extra.unitValue||0,
    repeatCount:extra.repeatCount||1
  });
}

function getGiftMeta(data){
  const gift=data?.gift || {};
  const giftName=String(gift.name || data?.giftName || `Hediye #${gift.id ?? data?.giftId ?? "?"}`);
  const diamond=Math.max(1,Number(gift.diamondCount ?? data?.diamondCount ?? 1) || 1);
  return {giftName,diamond,giftType:Number(gift.type||0)};
}

function pointsFromDiamonds(d){
  if(d<5) return 10;
  if(d<20) return 30;
  if(d<50) return 100;
  if(d<100) return 225;
  if(d<200) return 450;
  if(d<500) return 900;
  if(d<1000) return 1800;
  if(d<5000) return Math.round(d*3);
  return Math.min(250000, Math.round(d*4));
}

function specialType(d){
  if(d>=5000) return "stadium";
  if(d>=500) return "royal";
  if(d>=100) return "super_goal";
  if(d>=50) return "attack";
  if(d>=5) return "goal";
  return "support";
}

function applyGift(user,data){
  const rec=ensureUser(user);
  if(!rec.team || roundEnding) return;
  const {giftName,diamond}=getGiftMeta(data);
  const repeat=Math.max(1,Number(data?.repeatCount||1));
  const totalValue=diamond*repeat;
  const points=pointsFromDiamonds(diamond)*repeat;
  award(rec.team,points,user,"gift",specialType(totalValue),{
    giftName,
    diamondCount:totalValue,
    unitValue:diamond,
    repeatCount:repeat,
    title:`🎁 @${user.name} → ${TEAMS[rec.team].name} • ${giftName}${repeat>1?` x${repeat}`:""} • ${totalValue} jeton • +${points}`
  });
}

function handleGift(data){
  const {giftType}=getGiftMeta(data);
  const repeatEnd=Number(data?.repeatEnd ?? 1);
  if(giftType===1 && repeatEnd!==1) return;
  const user=safeUser(data), rec=ensureUser(user);
  if(!rec.team){
    const list=pendingGifts.get(user.uid)||[];
    list.push({payload:data, expiresAt:Date.now()+30000});
    pendingGifts.set(user.uid,list);
    event({type:"pending",team:null,user:user.name,points:0,title:`@${user.name}, hediyen bekliyor! 30 sn içinde takımını yaz.`});
    return;
  }
  applyGift(user,data);
}

function handleChat(data){
  const user=safeUser(data);
  ensureUser(user);
  const comment=String(data?.content ?? data?.comment ?? "");
  const team=detectTeam(comment);
  if(team) setTeam(user,team);
}

function handleLike(data){
  const user=safeUser(data), rec=ensureUser(user);
  const delta=Math.max(0,Number(data?.count ?? data?.likeCount ?? 0) || 0);
  if(delta<=0) return;
  rec.likes += delta;
  if(!rec.team || roundEnding) return;
  const chunks=Math.floor(rec.likes/200);
  const due=chunks-rec.likeAwarded;
  if(due>0){
    rec.likeAwarded=chunks;
    const points=due*5;
    award(rec.team,points,user,"like","like",{title:`👍 @${user.name} ${TEAMS[rec.team].name} +${points}`});
  }
}

async function disconnectLive(){
  const conn=liveConnection;
  liveConnection=null;
  try{ await conn?.disconnect?.(); }catch{}
  state.connected=false;
  state.liveUser="";
  state.liveRoomId="";
  broadcast();
}

async function connectLive(username){
  await disconnectLive();
  username=String(username||"").replace(/^@/,"").trim();
  if(!username) throw new Error("TikTok kullanıcı adı boş.");

  const conn=new TikTokLiveClient(username)
    .cdnEU()
    .timeout(15000)
    .maxRetries(10)
    .staleTimeout(90000);

  liveConnection=conn;
  conn.on(EventType.chat, handleChat);
  conn.on(EventType.gift, handleGift);
  conn.on(EventType.like, handleLike);
  conn.on(EventType.liveEnded, ()=>{
    state.connected=false;
    broadcast();
    io.emit("connectionError","TikTok canlı yayını sona erdi.");
  });
  conn.on(EventType.disconnected, ()=>{
    state.connected=false;
    broadcast();
  });
  conn.on(EventType.reconnecting, ()=>{
    io.emit("connectionStatus","TikTok bağlantısı yeniden kuruluyor...");
  });

  try{
    const roomId=await conn.connect();
    if(liveConnection!==conn) return username;
    state.connected=true;
    state.liveUser=username;
    state.liveRoomId=String(roomId||"");
    broadcast();
    return username;
  }catch(err){
    if(liveConnection===conn) liveConnection=null;
    state.connected=false;
    state.liveUser="";
    state.liveRoomId="";
    broadcast();
    throw err;
  }
}

function resetRound(minutes=state.roundMinutes,{fromAuto=false}={}){
  if(!fromAuto && autoResetTimer) clearTimeout(autoResetTimer);
  autoResetTimer=null;
  roundEnding=false;
  state.roundEnding=false;
  state.roundMinutes=Number(minutes)===40?40:30;
  state.roundEndsAt=Date.now()+state.roundMinutes*60*1000;
  for(const t of Object.values(state.teams)){ t.score=0; t.top={}; }
  for(const u of Object.values(state.users)){ u.giftPoints=0; u.likeAwarded=Math.floor((u.likes||0)/200); }
  state.lastEvent=null;
  event({type:"round_start",team:null,user:"",points:0,title:`⚽ Yeni ${state.roundMinutes} dakikalık tur başladı!`});
}

function finishRound(){
  if(roundEnding) return;
  roundEnding=true;
  state.roundEnding=true;
  state.roundEndsAt=Date.now();

  const ranking=Object.entries(state.teams).sort((a,b)=>b[1].score-a[1].score);
  const bestScore=ranking[0]?.[1]?.score || 0;
  const tied=ranking.filter(([,t])=>t.score===bestScore);

  if(bestScore<=0){
    event({type:"round_end",team:null,user:"",points:0,celebrationMs:ROUND_CELEBRATION_MS,title:"⏱️ Tur bitti • Bu tur puan çıkmadı."});
  }else if(tied.length>1){
    event({type:"round_end",team:null,user:"",points:0,celebrationMs:ROUND_CELEBRATION_MS,title:`🤝 Tur berabere bitti: ${tied.map(([id])=>TEAMS[id].name).join(" • ")}`});
  }else{
    const winner=tied[0][0];
    state.teams[winner].wins=(state.teams[winner].wins||0)+1;
    state.completedRounds=(state.completedRounds||0)+1;
    event({
      type:"round_end",team:winner,user:"",points:0,wins:state.teams[winner].wins,celebrationMs:ROUND_CELEBRATION_MS,
      title:`🏆 ${TEAMS[winner].name} TURU KAZANDI! • Toplam ${state.teams[winner].wins} galibiyet`
    });
  }

  io.emit("clock",{roundEndsAt:state.roundEndsAt});
  autoResetTimer=setTimeout(()=>resetRound(state.roundMinutes,{fromAuto:true}),ROUND_CELEBRATION_MS);
}

function resetWins(){
  for(const t of Object.values(state.teams)) t.wins=0;
  state.completedRounds=0;
  event({type:"wins_reset",team:null,user:"",points:0,title:"🏆 Galibiyet tablosu sıfırlandı."});
}

io.on("connection", socket=>{
  socket.emit("state",state);

  socket.on("connectTikTok", async ({username}={})=>{
    try{
      await connectLive(username);
      socket.emit("connectResult",{ok:true,username:state.liveUser,provider:"PirateTok"});
    }catch(e){
      const msg=String(e?.message||e||"Bilinmeyen bağlantı hatası");
      socket.emit("connectResult",{ok:false,error:msg});
    }
  });

  socket.on("disconnectTikTok", async ()=>{ await disconnectLive(); });
  socket.on("setRound", ({minutes}={})=>resetRound(minutes));
  socket.on("resetRound", ()=>resetRound(state.roundMinutes));
  socket.on("resetWins", resetWins);
  socket.on("finishRound", finishRound);

  socket.on("simulate", payload=>{
    const name=String(payload?.user||"test_user").replace(/^@/,"");
    const uid=`test:${name}`;
    const user={uid,name,nickname:name};
    ensureUser(user);
    if(payload?.kind==="team") setTeam(user,payload.team||"gs");
    if(payload?.kind==="chat") handleChat({user:{userId:uid,uniqueId:name,nickname:name},content:payload.comment||"gs"});
    if(payload?.kind==="like"){
      const rec=ensureUser(user);
      if(payload.team && !rec.team) setTeam(user,payload.team);
      handleLike({user:{userId:uid,uniqueId:name,nickname:name},count:Number(payload.amount||200)});
    }
    if(payload?.kind==="gift"){
      const rec=ensureUser(user);
      if(payload.team && !rec.team) setTeam(user,payload.team);
      handleGift({
        user:{userId:uid,uniqueId:name,nickname:name},repeatCount:1,repeatEnd:1,
        gift:{id:999,type:0,name:payload.giftName||"Test Hediyesi",diamondCount:Number(payload.diamonds||1)}
      });
    }
  });
});

setInterval(()=>{
  if(roundEnding){
    io.emit("clock",{roundEndsAt:state.roundEndsAt});
    return;
  }
  if(Date.now()>=state.roundEndsAt) finishRound();
  else io.emit("clock",{roundEndsAt:state.roundEndsAt});
},1000);

server.listen(PORT,"0.0.0.0",()=>console.log(`Taraftar Savaşı (PirateTok): http://localhost:${PORT}`));
