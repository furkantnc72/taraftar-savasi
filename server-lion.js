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

const lions = [
  {name:"Almanya", flag:"🇩🇪", code:"DE", colors:["#171717","#d81e2a","#f2c500"]},
  {name:"Türkiye", flag:"🇹🇷", code:"TR", colors:["#e30a17","#e30a17","#e30a17"]},
  {name:"Suudi Arabistan", flag:"🇸🇦", code:"SA", colors:["#0b8f48","#0b8f48","#0b8f48"]},
  {name:"İtalya", flag:"🇮🇹", code:"IT", colors:["#159447","#f7f7f7","#ce2b37"]},
  {name:"Azerbaycan", flag:"🇦🇿", code:"AZ", colors:["#00a3dd","#ef3340","#509e2f"]},
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
function snap(){ return {...state,lions}; }
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
    io.emit("winner",{lane,lion:lions[lane],round:state.round});
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
    userLane.set("test",lane);
    applyGift({id:"test",name:"test_user",nick:"TEST",avatar:""},{name:"Test Hediyesi",diamonds:points*10,repeat:points,giftType:0,repeatEnd:1});
  });
  socket.on("adminLaneTest",({pin,lane=0}={})=>{ if(!authed(pin)) return; setLane({id:"test-select",name:"test_user",nick:"TEST",avatar:""},Math.max(0,Math.min(4,Number(lane)||0))); });
});

app.get("/health",(_req,res)=>res.json({ok:true,connected:state.connected,liveUser:state.liveUser,round:state.round}));
app.get("/",(_req,res)=>res.type("html").send(stageHtml()));
app.get("/admin",(_req,res)=>res.type("html").send(adminHtml()));

function lionSvg(lion,i){
  const [a,b,c]=lion.colors;
  const extra = lion.code==="TR"
    ? '<circle cx="63" cy="37" r="7" fill="#fff"/><circle cx="66" cy="36" r="6" fill="#e30a17"/><text x="71" y="40" fill="#fff" font-size="8">★</text>'
    : lion.code==="AZ"
      ? '<circle cx="62" cy="37" r="6" fill="#fff"/><circle cx="65" cy="37" r="5" fill="#ef3340"/><text x="70" y="40" fill="#fff" font-size="7">★</text>'
      : lion.code==="SA"
        ? '<path d="M51 36h27" stroke="#fff" stroke-width="2"/><path d="M54 41h21" stroke="#fff" stroke-width="1.5"/>'
        : '';
  return '<div class="runner" id="runner'+i+'"><span class="flagBadge">'+lion.flag+'</span><svg viewBox="0 0 130 70" aria-hidden="true"><defs><linearGradient id="f'+i+'" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="'+a+'"/><stop offset=".49" stop-color="'+b+'"/><stop offset="1" stop-color="'+c+'"/></linearGradient></defs><g class="lionbody" fill="url(#f'+i+')" stroke="#120d08" stroke-width="2"><ellipse cx="66" cy="36" rx="31" ry="14"/><circle cx="100" cy="27" r="13"/><circle cx="94" cy="25" r="16" opacity=".95"/><circle cx="101" cy="27" r="9"/><path d="M104 31c8 1 12 5 15 9-7 1-13-1-18-4z"/><path d="M38 35c-15-8-20-3-27-14 3 14 14 20 29 21z"/><path class="leg leg1" d="M48 45l-12 17h9l13-16z"/><path class="leg leg2" d="M67 47l-4 16h9l5-16z"/><path class="leg leg3" d="M82 45l11 16h9L91 43z"/><path class="leg leg4" d="M59 43l-18 8 3 6 22-8z"/></g><circle cx="105" cy="24" r="1.6" fill="#fff"/><circle cx="105" cy="24" r=".8" fill="#111"/>'+extra+'</svg></div>';
}

function stageHtml(){
  const lanes=lions.map((lion,i)=>'<div class="lane"><div class="score" id="score'+i+'"><span class="miniFlag">'+lion.flag+'</span><b>0</b></div>'+lionSvg(lion,i)+'</div>').join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok Lion Race</title><script src="/socket.io/socket.io.js"></script><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif}body{display:grid;place-items:center}.stage{position:relative;height:100vh;aspect-ratio:9/16;max-width:100vw;overflow:hidden;background:radial-gradient(ellipse at 50% 38%,#173044 0,#07111d 34%,#02050b 72%,#000 100%)}.stage:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#02071000 0,#02071022 48%,#000 100%);z-index:1;pointer-events:none}.stars{position:absolute;inset:0;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:41px 41px;opacity:.14;animation:drift 22s linear infinite}@keyframes drift{to{background-position:100px 180px}}#fxCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.arenaWrap{position:absolute;left:10%;right:10%;top:35.5%;height:31%;z-index:5}.speaker{position:absolute;top:-4%;bottom:-4%;width:10%;border-radius:.7vh;background:linear-gradient(90deg,#060606,#1a1a1a 48%,#050505);border:1px solid #333;box-shadow:0 0 2vh #000}.speaker.left{left:-10.5%}.speaker.right{right:-10.5%}.speaker:before,.speaker:after{content:"";position:absolute;left:18%;width:64%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#090909 0 35%,#202020 37% 55%,#050505 57%);border:1px solid #333}.speaker:before{top:13%}.speaker:after{bottom:13%}.arena{position:absolute;inset:0;border-radius:.8vh;background:linear-gradient(180deg,#0b0c0eeb,#020304f2);border:1px solid #30353a;box-shadow:0 0 2.5vh #000,inset 0 0 2.5vh #000;padding:.5vh .7vh}.lane{position:relative;height:20%;border-bottom:1px solid #ffffff14}.lane:last-child{border-bottom:0}.lane:after{content:"";position:absolute;left:13%;right:1%;bottom:5%;height:.16vh;background:linear-gradient(90deg,#7a858c44,#efffff,#9bdff8,#efffff,#7a858c44);box-shadow:0 0 .7vh #b7f3ff;opacity:.9}.score{position:absolute;left:0;top:50%;transform:translateY(-50%);height:55%;min-width:11%;display:flex;align-items:center;justify-content:center;gap:.35vh;padding:0 .45vh;border-radius:.5vh;background:#070707;border:1px solid #343434;font-size:1.05vh;z-index:6;box-shadow:inset 0 0 .7vh #000}.score b{font-size:1.25vh}.miniFlag{font-size:1vh}.runner{position:absolute;left:15%;top:50%;width:18%;transform:translate(-20%,-50%);transition:left .62s cubic-bezier(.14,.83,.3,1);filter:drop-shadow(0 .4vh .35vh #000);z-index:7;animation:runbob .26s ease-in-out infinite alternate}.runner svg{width:100%;display:block;overflow:visible}.flagBadge{position:absolute;right:2%;top:-18%;font-size:1.35vh;filter:drop-shadow(0 .15vh .15vh #000);z-index:9}.runner .leg{transform-box:fill-box;transform-origin:top center}.runner .leg1,.runner .leg3{animation:legA .28s linear infinite alternate}.runner .leg2,.runner .leg4{animation:legB .28s linear infinite alternate}@keyframes legA{to{transform:rotate(19deg)}}@keyframes legB{to{transform:rotate(-18deg)}}@keyframes runbob{to{transform:translate(-20%,-55%) scaleX(1.02)}}.runner.boost{animation:boost .55s ease,runbob .26s .55s ease-in-out infinite alternate}@keyframes boost{45%{filter:brightness(1.8) drop-shadow(0 0 1.2vh #fff);transform:translate(-10%,-51%) scale(1.18)}}.crowd{position:absolute;left:-5%;right:-5%;bottom:-2%;height:35%;z-index:3;background:linear-gradient(transparent 0,#01020588 26%,#000 95%);overflow:hidden}.fan{position:absolute;bottom:-1%;width:1.5vh;height:6vh;border-radius:45% 45% 25% 25%;background:#050506;transform-origin:bottom center;animation:cheer .55s ease-in-out infinite alternate;filter:drop-shadow(0 0 .15vh #223)}.fan:before{content:"";position:absolute;left:50%;top:-1.3vh;transform:translateX(-50%);width:1.7vh;height:1.7vh;border-radius:50%;background:#070708}.fan:after{content:"";position:absolute;left:-1.4vh;top:.8vh;width:4.2vh;height:.7vh;background:#050506;border-radius:2vh;transform:rotate(-12deg)}@keyframes cheer{to{transform:translateY(-1.1vh) rotate(5deg)}}.frontGlow{position:absolute;left:0;right:0;bottom:18%;height:12%;z-index:4;background:radial-gradient(ellipse at 50% 100%,#154a7d55,transparent 68%);pointer-events:none}.flame{position:absolute;z-index:8;bottom:31%;width:13%;height:27%;opacity:0;filter:blur(.1vh) drop-shadow(0 0 1.5vh #ff7b00)}.flame.left{left:-1%}.flame.right{right:-1%;transform:scaleX(-1)}.flame i{position:absolute;bottom:0;left:50%;width:35%;height:100%;transform:translateX(-50%);border-radius:50% 50% 15% 15% / 70% 70% 30% 30%;background:radial-gradient(ellipse at 50% 75%,#fff7a4 0 16%,#ffc025 18% 37%,#ff6b00 40% 65%,#e62200 68%,transparent 72%);clip-path:polygon(50% 0,68% 20%,85% 42%,73% 56%,98% 76%,76% 100%,20% 100%,4% 76%,29% 53%,16% 35%,38% 22%)}.flame.go{animation:flameBurst 1.15s ease both}@keyframes flameBurst{0%{opacity:0;transform:translateY(5vh) scale(.4)}25%{opacity:1;transform:translateY(0) scale(1)}75%{opacity:1}100%{opacity:0;transform:translateY(-4vh) scale(.75)}}.flame.right.go{animation:flameBurstR 1.15s ease both}@keyframes flameBurstR{0%{opacity:0;transform:scaleX(-1) translateY(5vh) scale(.4)}25%{opacity:1;transform:scaleX(-1) translateY(0) scale(1)}75%{opacity:1}100%{opacity:0;transform:scaleX(-1) translateY(-4vh) scale(.75)}}.gift{position:absolute;left:5%;top:64%;z-index:10;display:none;align-items:center;gap:1vh;padding:.65vh 1.1vh;border-radius:2vh;background:linear-gradient(90deg,#030303e8,#03030370,transparent);font-weight:900}.gift.show{display:flex;animation:giftin 2.8s ease both}@keyframes giftin{0%{opacity:0;transform:translateX(-3vh)}10%,82%{opacity:1;transform:none}100%{opacity:0}}.note{font-size:3.2vh;line-height:1;text-shadow:-.12vh 0 #20e6e6,.12vh 0 #ff2c73}.giftMeta{font-size:1.05vh}.giftMeta b{display:block;font-size:1.2vh}.gift strong{font-size:2.7vh;margin-left:.2vh}.pick{position:absolute;left:5%;top:71%;z-index:9;font-size:1.05vh;padding:.55vh 1vh;border-radius:1.6vh;background:#050505c7;border:1px solid #ffffff16}.status{position:absolute;z-index:9;top:29%;left:50%;transform:translateX(-50%);font-size:.9vh;opacity:.72;background:#0009;border:1px solid #ffffff18;border-radius:2vh;padding:.35vh .9vh}.status.on{color:#80ffa5}.winner{position:absolute;z-index:20;left:50%;top:25%;transform:translateX(-50%);display:none;width:72%;padding:1.8vh;text-align:center;border-radius:1.5vh;background:radial-gradient(circle at top,#5d4517,#050505 68%);border:1px solid #f4d06c88;box-shadow:0 0 4vh #ffbf2e55}.winner.show{display:block;animation:pop .45s cubic-bezier(.2,1.6,.3,1)}@keyframes pop{from{transform:translateX(-50%) scale(.55);opacity:0}}.winner .crown{font-size:3.7vh}.winner b{display:block;color:#ffd75c;font-size:2.8vh;margin:.5vh}.bottomText{position:absolute;z-index:6;left:10%;right:10%;bottom:7%;text-align:center;font-weight:1000;font-size:1.22vh;text-shadow:0 .2vh .4vh #000;letter-spacing:.03em}.bottomText small{display:block;opacity:.75;margin-top:.5vh;font-size:.9vh}.flash{position:absolute;inset:0;z-index:30;background:#fff;opacity:0;pointer-events:none}.flash.go{animation:flash .24s}@keyframes flash{0%{opacity:.38}100%{opacity:0}}
</style></head><body><main class="stage"><div class="stars"></div><canvas id="fxCanvas"></canvas><div class="status" id="status">BEKLENİYOR</div><div class="arenaWrap"><div class="speaker left"></div><section class="arena">${lanes}</section><div class="speaker right"></div></div><div class="flame left" id="flameL"><i></i></div><div class="flame right" id="flameR"><i></i></div><div class="winner" id="winner"><div class="crown">👑</div><span>KAZANAN</span><b id="winnerText">1 NUMARA</b><small>Yeni tur otomatik başlayacak</small></div><div class="gift" id="gift"><span class="note">♪</span><div class="giftMeta"><b id="giftUser">Hediye</b><span id="giftName"></span></div><strong id="giftPts">x1</strong></div><div class="pick" id="pick">Yoruma 1–5 yazıp aslanını seç</div><div class="frontGlow"></div><div class="crowd" id="crowd"></div><div class="bottomText">GÜÇSÜZ OLAN ALTTA KALIR<small>1–5 NUMARA YAZ • HEDİYEN ASLANINI İLERLETSİN</small></div><div class="flash" id="flash"></div></main><script>
const socket=io();const crowd=document.getElementById('crowd');for(let i=0;i<90;i++){const f=document.createElement('i');f.className='fan';f.style.left=(Math.random()*100)+'%';f.style.height=(3.8+Math.random()*5.5)+'vh';f.style.opacity=(.45+Math.random()*.55);f.style.animationDelay=(Math.random()*.6)+'s';crowd.appendChild(f)}
const canvas=document.getElementById('fxCanvas'),ctx=canvas.getContext('2d');let particles=[];function resize(){const r=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(r.width*devicePixelRatio));canvas.height=Math.max(1,Math.floor(r.height*devicePixelRatio));ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}addEventListener('resize',resize);resize();function burst(x,y,big=false){const n=big?62:32;const cols=['#fff','#ffd56a','#ff6b70','#8ed8ff'];for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=(big?2.6:1.6)+Math.random()*(big?3.5:2.4);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,dec:.008+Math.random()*.012,c:cols[(Math.random()*cols.length)|0],size:.7+Math.random()*1.7})}}setInterval(()=>{const r=canvas.getBoundingClientRect();burst(r.width*(.18+Math.random()*.64),r.height*(.15+Math.random()*.23),Math.random()>.45)},1500);function loop(){const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.018;p.life-=p.dec;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill()}particles=particles.filter(p=>p.life>0);ctx.globalAlpha=1;requestAnimationFrame(loop)}loop();
function draw(s){const st=document.getElementById('status');st.textContent=s.connected?'CANLI • @'+s.liveUser:(s.status||'BEKLENİYOR');st.classList.toggle('on',!!s.connected);for(let i=0;i<5;i++){document.querySelector('#score'+i+' b').textContent=Math.round(s.scores[i]);document.getElementById('runner'+i).style.left=(15+Math.min(1,s.scores[i]/s.finishScore)*73)+'%'}if(s.winner===null)document.getElementById('winner').classList.remove('show')}
function flash(){const f=document.getElementById('flash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go')}function flames(){for(const id of ['flameL','flameR']){const e=document.getElementById(id);e.classList.remove('go');void e.offsetWidth;e.classList.add('go')}}function giftFx(d){const r=document.getElementById('runner'+d.lane);r.classList.remove('boost');void r.offsetWidth;r.classList.add('boost');document.getElementById('giftUser').textContent=d.nickname||'İzleyici';document.getElementById('giftName').textContent=d.giftName||'Hediye';document.getElementById('giftPts').textContent='x'+Math.max(1,d.points);const g=document.getElementById('gift');g.classList.remove('show');void g.offsetWidth;g.classList.add('show');const cr=canvas.getBoundingClientRect();burst(cr.width*(.35+Math.random()*.3),cr.height*.28,true);if(d.points>=8){flash();flames()}}
socket.on('state',draw);socket.on('selection',d=>{document.getElementById('pick').textContent=(d.nickname||'İzleyici')+' → '+(d.lane+1)+' NUMARALI ASLAN'});socket.on('gift',giftFx);socket.on('winner',d=>{document.getElementById('winnerText').textContent=(d.lane+1)+' NUMARA • '+d.lion.flag+' '+d.lion.name;document.getElementById('winner').classList.add('show');flash();flames();const r=canvas.getBoundingClientRect();for(let i=0;i<5;i++)setTimeout(()=>burst(r.width*(.15+Math.random()*.7),r.height*(.13+Math.random()*.32),true),i*180)});socket.on('roundReset',()=>{document.getElementById('winner').classList.remove('show');flash()});
</script></body></html>`;
}

function adminHtml(){
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lion Race Admin</title><script src="/socket.io/socket.io.js"></script><style>*{box-sizing:border-box}body{margin:0;background:#0b0e13;color:#fff;font-family:Arial,sans-serif;padding:24px}.wrap{max-width:760px;margin:auto}.card{background:#151a22;border:1px solid #ffffff18;border-radius:18px;padding:20px;margin-bottom:16px}h1{margin-top:0}label{display:block;font-size:13px;opacity:.75;margin:10px 0 6px}input,select,button{width:100%;padding:13px;border-radius:10px;border:1px solid #ffffff22;background:#090c11;color:white;font-size:15px}button{cursor:pointer;background:#1565d8;font-weight:800;margin-top:10px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.status{padding:12px;border-radius:10px;background:#090c11;margin-top:12px}.ok{color:#65f29a}.err{color:#ff6a78}.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.box{text-align:center;padding:12px 6px;background:#090c11;border-radius:10px}.box b{display:block;font-size:24px}a{color:#7fc5ff}</style></head><body><div class="wrap"><h1>🦁 TikTok Aslan Yarışı</h1><div class="card"><b>Yayın ekranı:</b> <a href="/" target="_blank">siteyi aç</a><div id="live" class="status">Durum bekleniyor…</div></div><div class="card"><h3>TikTok hesabını bağla</h3><label>Yönetici PIN</label><input id="pin" type="password" placeholder="PIN"><label>TikTok kullanıcı adı</label><input id="username" placeholder="@kullaniciadi"><button id="connect">TikTok'a Bağlan</button><div id="result" class="status">Hazır.</div></div><div class="card"><h3>Yarış</h3><div class="scores" id="scores"></div><button id="reset">Yeni Tur / Sıfırla</button></div><div class="card"><h3>Test hediyesi</h3><div class="row"><div><label>Aslan</label><select id="lane">${lions.map((d,i)=>`<option value="${i}">${i+1} - ${d.flag} ${d.name}</option>`).join("")}</select></div><div><label>Puan</label><input id="points" type="number" value="10" min="1" max="100"></div></div><button id="test">Test Hediyesi Gönder</button></div></div><script>
const socket=io(),pin=document.getElementById('pin'),res=document.getElementById('result');function p(){return pin.value}socket.on('state',s=>{document.getElementById('live').innerHTML=(s.connected?'🟢 ':'⚪ ')+(s.status||'')+(s.liveUser?' • @'+s.liveUser:'');document.getElementById('scores').innerHTML=s.scores.map((x,i)=>'<div class="box">'+(i+1)+' '+s.lions[i].flag+'<b>'+Math.round(x)+'</b></div>').join('')});socket.on('adminResult',r=>{res.textContent=r.ok?'✅ '+r.message:'❌ '+r.error;res.className='status '+(r.ok?'ok':'err')});document.getElementById('connect').onclick=()=>socket.emit('adminConnect',{pin:p(),username:document.getElementById('username').value});document.getElementById('reset').onclick=()=>socket.emit('adminReset',{pin:p()});document.getElementById('test').onclick=()=>socket.emit('adminTest',{pin:p(),lane:Number(document.getElementById('lane').value),points:Number(document.getElementById('points').value)});
</script></body></html>`;
}

server.listen(PORT,"0.0.0.0",()=>console.log(`Lion Race running on ${PORT}`));
