import express from "express";
import http from "http";
import { Server } from "socket.io";
import { TikTokLiveClient, EventType } from "piratetok-live-js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = String(process.env.ADMIN_PIN || "739241");
const FINISH_SCORE = Math.max(20, Number(process.env.FINISH_SCORE || 100));
const RESET_DELAY = Math.max(3000, Number(process.env.RESET_DELAY_MS || 7000));

const dinos = [
  {name:"Alev", emoji:"🦖", color:"#ffb12b"},
  {name:"Kızıl", emoji:"🦖", color:"#ff385b"},
  {name:"Çelik", emoji:"🦕", color:"#d8eff7"},
  {name:"Zehir", emoji:"🦖", color:"#5cf28b"},
  {name:"Buz", emoji:"🦕", color:"#58e9ff"},
];

let state = {
  scores:[0,0,0,0,0], winner:null, round:1, connected:false,
  status:"TikTok hesabı bekleniyor", liveUser:"", roomId:"",
  finishScore:FINISH_SCORE, lastGift:null, lastSelection:null, viewers:null
};
const userLane = new Map();
let live = null;
let reconnectTimer = null;
let resetTimer = null;
let wantedUser = "";

const cleanUser = s => String(s||"").trim().replace(/^@/,"");
function snap(){ return {...state,dinos}; }
function push(){ io.emit("state", snap()); }
function safeUser(data){
  const u=data?.user||{};
  const id=String(u.userId ?? u.id ?? u.secUid ?? u.uniqueId ?? u.nickname ?? "anon");
  const name=String(u.uniqueId ?? u.username ?? u.nickname ?? id);
  const nick=String(u.nickname ?? name);
  const avatar=(u.profilePictureUrls?.[0] || u.avatarThumb?.urlList?.[0] || "");
  return {id,name,nick,avatar};
}
function laneFromComment(text){
  const m=String(text||"").trim().match(/^(?:#|no\s*)?([1-5])(?:\s*(?:numara|no))?$/i);
  return m ? Number(m[1])-1 : null;
}
function setLane(user,lane){
  if(lane<0||lane>4) return;
  userLane.set(user.id,lane);
  state.lastSelection={lane,nickname:user.nick,username:user.name,avatar:user.avatar,at:Date.now()};
  io.emit("selection",state.lastSelection); push();
}
function giftInfo(data){
  const gift=data?.gift||{};
  const name=String(gift.name || data?.giftName || "Hediye");
  const diamonds=Math.max(1,Number(gift.diamondCount ?? data?.diamondCount ?? 1)||1);
  const repeat=Math.max(1,Number(data?.repeatCount ?? 1)||1);
  const giftType=Number(gift.type||0);
  const repeatEnd=Number(data?.repeatEnd ?? 1);
  return {name,diamonds,repeat,giftType,repeatEnd};
}
function pointsFor(g){
  if(g.repeat>1) return Math.min(100,g.repeat);
  return Math.max(1,Math.min(100,Math.ceil(g.diamonds/10)));
}
function applyGift(user,g){
  if(state.winner!==null) return;
  let lane=userLane.get(user.id);
  if(lane===undefined){
    let h=0; for(const c of user.id) h=(h*31+c.charCodeAt(0))>>>0; lane=h%5; userLane.set(user.id,lane);
  }
  const points=pointsFor(g);
  state.scores[lane]+=points;
  state.lastGift={lane,points,giftName:g.name,repeat:g.repeat,diamonds:g.diamonds,nickname:user.nick,username:user.name,avatar:user.avatar,at:Date.now()};
  io.emit("gift",state.lastGift);
  if(state.scores[lane]>=FINISH_SCORE){
    state.scores[lane]=FINISH_SCORE; state.winner=lane;
    io.emit("winner",{lane,dino:dinos[lane],round:state.round});
    clearTimeout(resetTimer);
    resetTimer=setTimeout(resetRound,RESET_DELAY);
  }
  push();
}
function resetRound(){
  clearTimeout(resetTimer); resetTimer=null;
  state.scores=[0,0,0,0,0]; state.winner=null; state.round+=1; state.lastGift=null;
  io.emit("roundReset",{round:state.round}); push();
}
async function disconnectLive(){
  clearTimeout(reconnectTimer); reconnectTimer=null;
  const old=live; live=null;
  try{ await old?.disconnect?.(); }catch{}
  state.connected=false; state.roomId=""; push();
}
function scheduleReconnect(){
  if(!wantedUser || reconnectTimer) return;
  reconnectTimer=setTimeout(async()=>{
    reconnectTimer=null;
    try{ await connectLive(wantedUser); }catch{ scheduleReconnect(); }
  },12000);
}
async function connectLive(username){
  username=cleanUser(username); if(!username) throw new Error("TikTok kullanıcı adı boş.");
  wantedUser=username;
  await disconnectLive();
  state.liveUser=username; state.status="Bağlanıyor"; push();
  const conn=new TikTokLiveClient(username).cdnEU().timeout(15000).maxRetries(8).staleTimeout(90000);
  live=conn;
  conn.on(EventType.chat,data=>{
    const lane=laneFromComment(data?.content ?? data?.comment ?? "");
    if(lane!==null) setLane(safeUser(data),lane);
  });
  conn.on(EventType.gift,data=>{
    const g=giftInfo(data);
    if(g.giftType===1 && g.repeatEnd!==1) return;
    applyGift(safeUser(data),g);
  });
  conn.on(EventType.roomUser,data=>{
    const n=Number(data?.viewerCount ?? data?.userCount);
    if(Number.isFinite(n)){ state.viewers=n; push(); }
  });
  conn.on(EventType.disconnected,()=>{ if(live===conn){state.connected=false;state.status="Bağlantı koptu";push();scheduleReconnect();} });
  conn.on(EventType.reconnecting,()=>{state.status="Yeniden bağlanıyor";push();});
  conn.on(EventType.liveEnded,()=>{state.connected=false;state.status="Canlı yayın sona erdi";push();});
  try{
    const roomId=await conn.connect();
    if(live!==conn) return;
    state.connected=true; state.status="CANLI BAĞLI"; state.roomId=String(roomId||""); push();
  }catch(e){
    if(live===conn) live=null;
    state.connected=false; state.status="Bağlantı kurulamadı"; push(); scheduleReconnect(); throw e;
  }
}
function authed(pin){ return String(pin||"")===ADMIN_PIN; }

io.on("connection",socket=>{
  socket.emit("state",snap());
  socket.on("adminConnect",async ({pin,username}={})=>{
    if(!authed(pin)) return socket.emit("adminResult",{ok:false,error:"PIN yanlış"});
    try{ await connectLive(username); socket.emit("adminResult",{ok:true,message:"TikTok bağlantısı kuruldu"}); }
    catch(e){ socket.emit("adminResult",{ok:false,error:String(e?.message||e)}); }
  });
  socket.on("adminReset",({pin}={})=>{ if(!authed(pin)) return; resetRound(); });
  socket.on("adminTest",({pin,lane=0,points=10}={})=>{
    if(!authed(pin)) return;
    lane=Math.max(0,Math.min(4,Number(lane)||0)); points=Math.max(1,Math.min(100,Number(points)||10));
    applyGift({id:"test",name:"test_user",nick:"TEST",avatar:""},{name:"Test Hediyesi",diamonds:points*10,repeat:points,giftType:0,repeatEnd:1});
    if(userLane.get("test")!==lane){userLane.set("test",lane); state.scores[lane]=Math.max(0,state.scores[lane]-points); state.scores[userLane.get("test")||0]+=0;}
  });
  socket.on("adminLaneTest",({pin,lane=0}={})=>{ if(!authed(pin)) return; setLane({id:"test-select",name:"test_user",nick:"TEST",avatar:""},Math.max(0,Math.min(4,Number(lane)||0))); });
});

app.get("/health",(_req,res)=>res.json({ok:true,connected:state.connected,liveUser:state.liveUser,round:state.round}));
app.get("/",(_req,res)=>res.type("html").send(stageHtml()));
app.get("/admin",(_req,res)=>res.type("html").send(adminHtml()));

function stageHtml(){return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok Dino Race</title><script src="/socket.io/socket.io.js"></script><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif}body{display:grid;place-items:center}.stage{position:relative;height:100vh;aspect-ratio:9/16;max-width:100vw;overflow:hidden;background:radial-gradient(circle at 50% 24%,#17364b 0,#07131e 30%,#02050a 70%,#000 100%)}.stars{position:absolute;inset:0;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:37px 37px;opacity:.22;animation:drift 18s linear infinite}@keyframes drift{to{background-position:80px 120px}}.top{position:absolute;top:5%;left:5%;right:5%;text-align:center}.title{font-size:4.3vh;font-weight:1000;letter-spacing:.06em;text-shadow:0 0 20px #35dcff}.sub{font-size:1.35vh;opacity:.8;margin-top:.4vh}.status{display:inline-block;margin-top:1vh;padding:.5vh 1.5vh;border:1px solid #ffffff22;border-radius:50px;background:#0008;font-weight:800;font-size:1.15vh}.status.on{color:#63ff98;border-color:#63ff9855}.arena{position:absolute;left:5%;right:5%;top:29%;height:39%;padding:1.2vh;border-radius:2vh;background:linear-gradient(#111820ee,#030507ee);border:1px solid #ffffff18;box-shadow:0 0 45px #30c9ff1f,inset 0 0 45px #000}.lane{position:relative;height:20%;border-bottom:1px solid #ffffff22}.lane:last-child{border-bottom:0}.lane:after{content:"";position:absolute;left:12%;right:4%;bottom:0;height:1px;background:linear-gradient(90deg,transparent,#baf7ff,transparent);box-shadow:0 0 8px #6ce7ff}.score{position:absolute;left:1%;top:50%;transform:translateY(-50%);width:9%;text-align:center;padding:.45vh 0;border-radius:.7vh;background:#000;border:1px solid #ffffff18;font-weight:1000;font-size:1.6vh}.runner{position:absolute;left:13%;top:50%;transform:translate(-20%,-50%);font-size:5.8vh;transition:left .55s cubic-bezier(.2,.9,.3,1);filter:drop-shadow(0 .7vh .5vh #000);animation:bob .35s ease-in-out infinite alternate}@keyframes bob{to{transform:translate(-20%,-58%) rotate(2deg)}}.runner.boost{animation:boost .55s ease}@keyframes boost{40%{filter:brightness(2.5) drop-shadow(0 0 1.5vh #fff);transform:translate(-10%,-50%) scale(1.25)}}.finish{position:absolute;right:4%;top:0;bottom:0;width:3%;opacity:.25;background:repeating-conic-gradient(#fff 0 25%,#222 0 50%) 50%/10px 10px}.crowd{position:absolute;left:-3%;right:-3%;bottom:10%;height:18%;background:linear-gradient(transparent,#000 82%);overflow:hidden}.person{position:absolute;bottom:0;font-size:4vh;filter:brightness(.35);animation:cheer .5s ease-in-out infinite alternate}@keyframes cheer{to{transform:translateY(-1.3vh) rotate(6deg)}}.instruction{position:absolute;left:5%;right:5%;bottom:5%;text-align:center;font-size:1.55vh;font-weight:900;text-shadow:0 2px 6px #000}.pick{position:absolute;left:6%;bottom:24%;padding:.8vh 1.4vh;background:#000a;border-radius:3vh;border:1px solid #ffffff15;font-size:1.35vh}.gift{position:absolute;left:6%;top:71%;display:none;align-items:center;gap:1vh;padding:1vh 1.5vh;border-radius:3vh;background:linear-gradient(90deg,#000d,#0004);font-weight:900;font-size:1.4vh}.gift.show{display:flex;animation:gift 2.7s ease both}@keyframes gift{0%{opacity:0;transform:translateX(-4vh)}10%,82%{opacity:1;transform:none}100%{opacity:0}}.gift strong{font-size:2.8vh;color:#ffd75f}.winner{position:absolute;z-index:5;left:50%;top:17%;transform:translateX(-50%);display:none;width:76%;padding:2.2vh;text-align:center;border-radius:2vh;background:radial-gradient(circle at top,#6a4b12,#070707 68%);border:1px solid #ffd45a88;box-shadow:0 0 5vh #ffb82b55}.winner.show{display:block;animation:pop .45s cubic-bezier(.2,1.6,.3,1)}@keyframes pop{from{transform:translateX(-50%) scale(.55);opacity:0}}.winner .crown{font-size:4vh}.winner b{display:block;font-size:4vh;color:#ffd75a}.flash{position:absolute;inset:0;pointer-events:none;background:white;opacity:0}.flash.go{animation:flash .25s}@keyframes flash{0%{opacity:.6}100%{opacity:0}}.fire{position:absolute;left:0;right:0;bottom:24%;display:none;justify-content:space-between;font-size:7vh;filter:drop-shadow(0 0 1vh #ff7b00)}.fire.go{display:flex;animation:fire .9s ease both}@keyframes fire{0%{opacity:0;transform:translateY(3vh)}40%{opacity:1}100%{opacity:0;transform:translateY(-5vh)}}
</style></head><body><main class="stage" id="stage"><div class="stars"></div><div class="top"><div class="title">🦖 DİNO RACE</div><div class="sub">Yoruma 1–5 yaz • Hediyen seçtiğin dinoyu hızlandırsın</div><div class="status" id="status">BEKLENİYOR</div></div><section class="arena" id="arena"><div class="finish"></div>${dinos.map((d,i)=>`<div class="lane"><div class="score" id="score${i}">0</div><div class="runner" id="runner${i}" style="color:${d.color}">${d.emoji}</div></div>`).join("")}</section><div class="winner" id="winner"><div class="crown">👑</div><span>KAZANAN</span><b id="winnerText">1 NUMARA</b><small>Yeni tur otomatik başlayacak</small></div><div class="pick" id="pick">Henüz seçim yok</div><div class="gift" id="gift">🎁 <span id="giftText"></span><strong id="giftPts"></strong></div><div class="crowd" id="crowd"></div><div class="instruction">1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ &nbsp; • &nbsp; SEÇ → HEDİYE AT → YARIŞTIR</div><div class="fire" id="fire"><span>🔥</span><span>🔥</span></div><div class="flash" id="flash"></div></main><script>
const socket=io();const crowd=document.getElementById('crowd');for(let i=0;i<45;i++){let s=document.createElement('span');s.className='person';s.textContent='🙌';s.style.left=(i*2.35-3)+'%';s.style.animationDelay=(Math.random()*.5)+'s';s.style.fontSize=(2.8+Math.random()*2)+'vh';crowd.appendChild(s)}
function draw(s){document.getElementById('status').textContent=s.status||'BEKLENİYOR';document.getElementById('status').classList.toggle('on',!!s.connected);for(let i=0;i<5;i++){document.getElementById('score'+i).textContent=Math.round(s.scores[i]);document.getElementById('runner'+i).style.left=(13+Math.min(1,s.scores[i]/s.finishScore)*78)+'%'}if(s.winner===null)document.getElementById('winner').classList.remove('show')}
function fx(){let f=document.getElementById('flash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go')}socket.on('state',draw);socket.on('selection',d=>{document.getElementById('pick').textContent='💎 '+d.nickname+' → '+(d.lane+1)+' NUMARA'});socket.on('gift',d=>{let r=document.getElementById('runner'+d.lane);r.classList.remove('boost');void r.offsetWidth;r.classList.add('boost');let g=document.getElementById('gift');document.getElementById('giftText').textContent=d.nickname+' • '+d.giftName;document.getElementById('giftPts').textContent='+'+d.points;g.classList.remove('show');void g.offsetWidth;g.classList.add('show');if(d.points>=10){fx();let fire=document.getElementById('fire');fire.classList.remove('go');void fire.offsetWidth;fire.classList.add('go')}});socket.on('winner',d=>{document.getElementById('winnerText').textContent=(d.lane+1)+' NUMARA • '+d.dino.name;document.getElementById('winner').classList.add('show');fx()});socket.on('roundReset',()=>{document.getElementById('winner').classList.remove('show');fx()});
</script></body></html>`}

function adminHtml(){return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dino Race Admin</title><script src="/socket.io/socket.io.js"></script><style>*{box-sizing:border-box}body{margin:0;background:#0b0e13;color:#fff;font-family:Arial,sans-serif;padding:24px}.wrap{max-width:760px;margin:auto}.card{background:#151a22;border:1px solid #ffffff18;border-radius:18px;padding:20px;margin-bottom:16px}h1{margin-top:0}label{display:block;font-size:13px;opacity:.75;margin:10px 0 6px}input,select,button{width:100%;padding:13px;border-radius:10px;border:1px solid #ffffff22;background:#090c11;color:white;font-size:15px}button{cursor:pointer;background:#1565d8;font-weight:800;margin-top:10px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.status{padding:12px;border-radius:10px;background:#090c11;margin-top:12px}.ok{color:#65f29a}.err{color:#ff6a78}.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.box{text-align:center;padding:12px 6px;background:#090c11;border-radius:10px}.box b{display:block;font-size:24px}a{color:#7fc5ff}</style></head><body><div class="wrap"><h1>🦖 TikTok Dino Race</h1><div class="card"><b>Yayın ekranı:</b> <a href="/" target="_blank">siteyi aç</a><div id="live" class="status">Durum bekleniyor…</div></div><div class="card"><h3>TikTok hesabını bağla</h3><label>Yönetici PIN</label><input id="pin" type="password" placeholder="PIN"><label>TikTok kullanıcı adı</label><input id="username" placeholder="@kullaniciadi"><button id="connect">TikTok'a Bağlan</button><div id="result" class="status">Hazır.</div></div><div class="card"><h3>Yarış</h3><div class="scores" id="scores"></div><button id="reset">Yeni Tur / Sıfırla</button></div><div class="card"><h3>Test hediyesi</h3><div class="row"><div><label>Dino</label><select id="lane">${dinos.map((d,i)=>`<option value="${i}">${i+1} - ${d.name}</option>`).join("")}</select></div><div><label>Puan</label><input id="points" type="number" value="10" min="1" max="100"></div></div><button id="test">Test Hediyesi Gönder</button></div></div><script>
const socket=io(),pin=document.getElementById('pin'),res=document.getElementById('result');function p(){return pin.value}socket.on('state',s=>{document.getElementById('live').innerHTML=(s.connected?'🟢 ':'⚪ ')+(s.status||'')+(s.liveUser?' • @'+s.liveUser:'');document.getElementById('scores').innerHTML=s.scores.map((x,i)=>'<div class="box">'+(i+1)+'<b>'+Math.round(x)+'</b></div>').join('')});socket.on('adminResult',r=>{res.textContent=r.ok?'✅ '+r.message:'❌ '+r.error;res.className='status '+(r.ok?'ok':'err')});document.getElementById('connect').onclick=()=>socket.emit('adminConnect',{pin:p(),username:document.getElementById('username').value});document.getElementById('reset').onclick=()=>socket.emit('adminReset',{pin:p()});document.getElementById('test').onclick=()=>socket.emit('adminTest',{pin:p(),lane:Number(document.getElementById('lane').value),points:Number(document.getElementById('points').value)});
</script></body></html>`}

server.listen(PORT,"0.0.0.0",()=>console.log(`Dino Race running on ${PORT}`));
