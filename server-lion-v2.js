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
  { name:"Tacikistan", flag:"🇹🇯", code:"TJ" },
  { name:"Türkiye", flag:"🇹🇷", code:"TR" },
  { name:"Suudi Arabistan", flag:"🇸🇦", code:"SA" },
  { name:"Portekiz", flag:"🇵🇹", code:"PT" },
  { name:"Azerbaycan", flag:"🇦🇿", code:"AZ" },
];

let state = {
  scores:[0,0,0,0,0], winner:null, round:1, connected:false,
  status:"TikTok hesabı bekleniyor", liveUser:"", roomId:"",
  finishScore:FINISH_SCORE, lastGift:null, lastSelection:null, viewers:null
};
const userLane = new Map();
let live = null, reconnectTimer = null, resetTimer = null, wantedUser = "";

const cleanUser = s => String(s||"").trim().replace(/^@/,"");
const snap = () => ({...state,lions});
const push = () => io.emit("state",snap());

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
  return {
    name:String(gift.name || data?.giftName || "Hediye"),
    diamonds:Math.max(1,Number(gift.diamondCount ?? data?.diamondCount ?? 1)||1),
    repeat:Math.max(1,Number(data?.repeatCount ?? 1)||1),
    giftType:Number(gift.type||0), repeatEnd:Number(data?.repeatEnd ?? 1)
  };
}
function pointsFor(g){
  if(g.repeat>1) return Math.min(100,g.repeat);
  return Math.max(1,Math.min(100,Math.ceil(g.diamonds/10)));
}
function applyGift(user,g){
  if(state.winner!==null) return;
  let lane=userLane.get(user.id);
  if(lane===undefined){
    let h=0; for(const c of user.id) h=(h*31+c.charCodeAt(0))>>>0;
    lane=h%5; userLane.set(user.id,lane);
  }
  const points=pointsFor(g);
  state.scores[lane]+=points;
  state.lastGift={lane,points,giftName:g.name,repeat:g.repeat,diamonds:g.diamonds,nickname:user.nick,username:user.name,avatar:user.avatar,at:Date.now()};
  io.emit("gift",state.lastGift);
  if(state.scores[lane]>=FINISH_SCORE){
    state.scores[lane]=FINISH_SCORE; state.winner=lane;
    io.emit("winner",{lane,lion:lions[lane],round:state.round});
    clearTimeout(resetTimer); resetTimer=setTimeout(resetRound,RESET_DELAY);
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
  reconnectTimer=setTimeout(async()=>{ reconnectTimer=null; try{await connectLive(wantedUser)}catch{scheduleReconnect()} },12000);
}
async function connectLive(username){
  username=cleanUser(username); if(!username) throw new Error("TikTok kullanıcı adı boş.");
  wantedUser=username; await disconnectLive();
  state.liveUser=username; state.status="Bağlanıyor"; push();
  const conn=new TikTokLiveClient(username).cdnEU().timeout(15000).maxRetries(8).staleTimeout(90000);
  live=conn;
  conn.on(EventType.chat,data=>{ const lane=laneFromComment(data?.content ?? data?.comment ?? ""); if(lane!==null)setLane(safeUser(data),lane); });
  conn.on(EventType.gift,data=>{ const g=giftInfo(data); if(g.giftType===1 && g.repeatEnd!==1)return; applyGift(safeUser(data),g); });
  conn.on(EventType.roomUser,data=>{ const n=Number(data?.viewerCount ?? data?.userCount); if(Number.isFinite(n)){state.viewers=n;push()} });
  conn.on(EventType.disconnected,()=>{if(live===conn){state.connected=false;state.status="Bağlantı koptu";push();scheduleReconnect()}});
  conn.on(EventType.reconnecting,()=>{state.status="Yeniden bağlanıyor";push()});
  conn.on(EventType.liveEnded,()=>{state.connected=false;state.status="Canlı yayın sona erdi";push()});
  try{
    const roomId=await conn.connect(); if(live!==conn)return;
    state.connected=true; state.status="CANLI BAĞLI"; state.roomId=String(roomId||""); push();
  }catch(e){ if(live===conn)live=null; state.connected=false;state.status="Bağlantı kurulamadı";push();scheduleReconnect();throw e; }
}
const authed = pin => String(pin||"")===ADMIN_PIN;

io.on("connection",socket=>{
  socket.emit("state",snap());
  socket.on("adminConnect",async({pin,username}={})=>{
    if(!authed(pin))return socket.emit("adminResult",{ok:false,error:"PIN yanlış"});
    try{await connectLive(username);socket.emit("adminResult",{ok:true,message:"TikTok bağlantısı kuruldu"})}
    catch(e){socket.emit("adminResult",{ok:false,error:String(e?.message||e)})}
  });
  socket.on("adminReset",({pin}={})=>{if(authed(pin))resetRound()});
  socket.on("adminTest",({pin,lane=0,points=10}={})=>{
    if(!authed(pin))return; lane=Math.max(0,Math.min(4,Number(lane)||0)); points=Math.max(1,Math.min(100,Number(points)||10));
    userLane.set("test",lane); applyGift({id:"test",name:"test_user",nick:"TEST",avatar:""},{name:"Test Hediyesi",diamonds:points*10,repeat:points,giftType:0,repeatEnd:1});
  });
});

app.get("/health",(_req,res)=>res.json({ok:true,connected:state.connected,liveUser:state.liveUser,round:state.round}));
app.get("/",(_req,res)=>res.type("html").send(stageHtml()));
app.get("/admin",(_req,res)=>res.type("html").send(adminHtml()));

function flagArt(code){
  if(code==="TJ") return `
    <rect width="160" height="27" fill="#cc0000"/><rect y="27" width="160" height="26" fill="#fff"/><rect y="53" width="160" height="27" fill="#006600"/>
    <g fill="#f8c300"><path d="M78 35l3 5 3-5 3 5 3-5-1 9H79z"/><circle cx="69" cy="37" r="1.3"/><circle cx="73" cy="34" r="1.3"/><circle cx="77" cy="32" r="1.3"/><circle cx="83" cy="32" r="1.3"/><circle cx="87" cy="34" r="1.3"/><circle cx="91" cy="37" r="1.3"/></g>`;
  if(code==="TR") return `
    <rect width="160" height="80" fill="#e30a17"/>
    <circle cx="76" cy="38" r="13" fill="#fff"/><circle cx="81" cy="35" r="11" fill="#e30a17"/>
    <polygon points="94,29 96.5,35 103,35.3 98,39.5 99.6,46 94,42.4 88.4,46 90,39.5 85,35.3 91.5,35" fill="#fff"/>`;
  if(code==="SA") return `
    <rect width="160" height="80" fill="#0b8f48"/>
    <text x="78" y="34" fill="#fff" font-size="8" text-anchor="middle" direction="rtl" font-family="serif">لا إله إلا الله محمد رسول الله</text>
    <path d="M48 48h61c-6 5-15 7-27 6H52z" fill="#fff"/><circle cx="108" cy="48" r="2" fill="#fff"/>`;
  if(code==="PT") return `
    <rect width="64" height="80" fill="#046a38"/><rect x="64" width="96" height="80" fill="#da291c"/>
    <circle cx="64" cy="40" r="13" fill="#ffcc00"/><circle cx="64" cy="40" r="8" fill="#fff" stroke="#c8102e" stroke-width="2"/><path d="M60 34h8v12h-8z" fill="#c8102e"/>`;
  return `
    <rect width="160" height="27" fill="#00b5e2"/><rect y="27" width="160" height="26" fill="#ef3340"/><rect y="53" width="160" height="27" fill="#509e2f"/>
    <circle cx="77" cy="40" r="10" fill="#fff"/><circle cx="81" cy="38" r="8.5" fill="#ef3340"/><polygon points="94,34 96,38 100,38.5 97,41.5 98,46 94,43.5 90,46 91,41.5 88,38.5 92,38" fill="#fff"/>`;
}

function lionSvg(lion,i){
  const clip=`lionClip${i}`;
  return `<div class="runner" id="runner${i}" title="${lion.name}">
  <svg viewBox="0 0 160 80" aria-hidden="true">
    <defs><clipPath id="${clip}">
      <path d="M42 29C53 20 82 18 105 25c8 2 13 7 16 13-5 11-19 17-42 17H52c-12-1-20-7-21-14 0-5 4-9 11-12z"/>
      <circle cx="116" cy="28" r="17"/><path d="M122 21c9-5 20-2 27 5l-2 13-17 5-12-9z"/>
      <path d="M54 49l-14 22h10l17-19z"/><path d="M77 51L69 72h10l10-21z"/><path d="M94 50l15 21h10l-12-25z"/><path d="M62 46L35 56l4 8 29-9z"/>
      <path d="M43 33C30 30 25 19 15 20c-8 1-9 8-5 12 4 4 9 2 11-2-2 9 7 15 22 16z"/>
    </clipPath></defs>
    <g clip-path="url(#${clip})">${flagArt(lion.code)}</g>
    <g fill="none" stroke="#130d08" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M42 29C53 20 82 18 105 25c8 2 13 7 16 13-5 11-19 17-42 17H52c-12-1-20-7-21-14 0-5 4-9 11-12z"/>
      <circle cx="116" cy="28" r="17"/><path d="M122 21c9-5 20-2 27 5l-2 13-17 5-12-9z"/>
      <path class="leg leg1" d="M54 49l-14 22h10l17-19"/><path class="leg leg2" d="M77 51L69 72h10l10-21"/>
      <path class="leg leg3" d="M94 50l15 21h10l-12-25"/><path class="leg leg4" d="M62 46L35 56l4 8 29-9"/>
      <path d="M43 33C30 30 25 19 15 20c-8 1-9 8-5 12 4 4 9 2 11-2-2 9 7 15 22 16"/>
    </g>
    <path d="M105 17c4-9 15-13 25-9-3 3-4 6-4 9" fill="#3a2417" opacity=".62"/>
    <circle cx="137" cy="27" r="1.8" fill="#fff"/><circle cx="137.4" cy="27" r=".8" fill="#111"/>
    <path d="M146 35l7 2-7 3" fill="#c9b49a" stroke="#130d08" stroke-width="1.5"/>
  </svg></div>`;
}

function stageHtml(){
  const lanes=lions.map((lion,i)=>`<div class="lane"><div class="score" id="score${i}"><span>${lion.flag}</span><b>0</b></div>${lionSvg(lion,i)}</div>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok Aslan Yarışı</title><script src="/socket.io/socket.io.js"></script><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif}body{display:grid;place-items:center}.stage{position:relative;height:100vh;aspect-ratio:9/16;max-width:100vw;overflow:hidden;background:radial-gradient(ellipse at 50% 37%,#17344b 0,#08131e 38%,#020408 72%,#000 100%)}.stage:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,#0008 78%,#000 100%);pointer-events:none}.stars{position:absolute;inset:0;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:38px 38px;opacity:.15}#fx{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.arenaWrap{position:absolute;left:16%;right:16%;top:36.5%;height:29%;z-index:6}.speaker{position:absolute;top:-4%;bottom:-4%;width:13%;background:linear-gradient(90deg,#050505,#181818,#040404);border:1px solid #292929;box-shadow:0 0 2vh #000}.speaker.left{left:-13.5%}.speaker.right{right:-13.5%}.speaker:before,.speaker:after{content:"";position:absolute;left:15%;width:70%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#060606 0 35%,#222 37% 54%,#050505 56%);border:1px solid #333}.speaker:before{top:12%}.speaker:after{bottom:12%}.arena{position:absolute;inset:0;background:#050607f2;border:1px solid #2b3034;box-shadow:0 0 2.5vh #000,inset 0 0 2vh #000;padding:.35vh .5vh}.lane{position:relative;height:20%;border-bottom:1px solid #ffffff12}.lane:last-child{border-bottom:0}.lane:after{content:"";position:absolute;left:15%;right:1%;bottom:5%;height:.14vh;background:linear-gradient(90deg,#64707844,#eaffff,#83dfff,#eaffff,#64707844);box-shadow:0 0 .55vh #c9f7ff}.score{position:absolute;left:0;top:50%;transform:translateY(-50%);height:48%;min-width:13%;display:flex;align-items:center;justify-content:center;gap:.25vh;padding:0 .35vh;border-radius:.35vh;background:#080808;border:1px solid #343434;z-index:8}.score span{font-size:.9vh}.score b{font-size:1.08vh}.runner{position:absolute;left:17%;top:50%;width:26%;transform:translate(-22%,-50%);transition:left .58s cubic-bezier(.17,.86,.25,1);z-index:9;filter:drop-shadow(0 .42vh .35vh #000);animation:bob .24s ease-in-out infinite alternate}.runner svg{width:100%;display:block;overflow:visible}.runner .leg{transform-box:fill-box;transform-origin:top center}.runner .leg1,.runner .leg3{animation:legA .25s linear infinite alternate}.runner .leg2,.runner .leg4{animation:legB .25s linear infinite alternate}@keyframes legA{to{transform:rotate(18deg)}}@keyframes legB{to{transform:rotate(-18deg)}}@keyframes bob{to{transform:translate(-22%,-55%) scaleX(1.025)}}.runner.boost{animation:boost .5s ease,bob .24s .5s ease-in-out infinite alternate}@keyframes boost{45%{filter:brightness(1.7) drop-shadow(0 0 1vh #fff);transform:translate(-12%,-51%) scale(1.13)}}.crowd{position:absolute;left:-5%;right:-5%;bottom:-2%;height:34%;z-index:3;overflow:hidden;background:linear-gradient(transparent,#000 92%)}.fan{position:absolute;bottom:-1%;width:1.5vh;height:6vh;border-radius:50% 50% 20% 20%;background:#040406;transform-origin:bottom;animation:cheer .5s ease-in-out infinite alternate;filter:drop-shadow(0 0 .2vh #223)}.fan:before{content:"";position:absolute;left:50%;top:-1.3vh;transform:translateX(-50%);width:1.6vh;height:1.6vh;border-radius:50%;background:#070709}.fan:after{content:"";position:absolute;left:-1.3vh;top:.7vh;width:4vh;height:.65vh;background:#050507;border-radius:2vh;transform:rotate(-12deg)}@keyframes cheer{to{transform:translateY(-1vh) rotate(5deg)}}.status{position:absolute;z-index:10;top:31%;left:50%;transform:translateX(-50%);font-size:.82vh;opacity:.75;background:#000a;border:1px solid #ffffff18;border-radius:2vh;padding:.3vh .8vh}.status.on{color:#77ff9e}.gift{position:absolute;left:7%;top:64%;z-index:12;display:none;align-items:center;gap:.7vh;padding:.6vh 1vh;border-radius:2vh;background:linear-gradient(90deg,#020202ed,#02020288,transparent);font-weight:900}.gift.show{display:flex;animation:gin 2.6s ease both}@keyframes gin{0%{opacity:0;transform:translateX(-3vh)}10%,82%{opacity:1;transform:none}100%{opacity:0}}.gift .note{font-size:3vh;text-shadow:-.12vh 0 #21e6e6,.12vh 0 #ff2b76}.gift b{display:block;font-size:1vh}.gift span{font-size:.9vh}.gift strong{font-size:2.6vh}.pick{position:absolute;left:7%;top:70.5%;z-index:10;font-size:.95vh;padding:.5vh .9vh;border-radius:1.5vh;background:#030303c7;border:1px solid #ffffff17}.flame{position:absolute;z-index:11;bottom:30%;width:13%;height:29%;opacity:0;filter:drop-shadow(0 0 1.3vh #ff6a00)}.flame.left{left:-1%}.flame.right{right:-1%;transform:scaleX(-1)}.flame i{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 75%,#fff59b 0 14%,#ffc11d 17% 35%,#ff6800 38% 62%,#d91900 66%,transparent 70%);clip-path:polygon(50% 0,69% 19%,86% 43%,72% 56%,98% 76%,74% 100%,23% 100%,3% 77%,28% 54%,15% 35%,38% 22%)}.flame.go{animation:fl 1.1s ease both}@keyframes fl{0%{opacity:0;transform:translateY(5vh) scale(.4)}25%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-4vh) scale(.7)}}.flame.right.go{animation:flr 1.1s ease both}@keyframes flr{0%{opacity:0;transform:scaleX(-1) translateY(5vh) scale(.4)}25%{opacity:1;transform:scaleX(-1)}75%{opacity:1}100%{opacity:0;transform:scaleX(-1) translateY(-4vh) scale(.7)}}.winner{position:absolute;z-index:20;left:50%;top:26%;transform:translateX(-50%);display:none;width:70%;padding:1.6vh;text-align:center;border-radius:1.5vh;background:radial-gradient(circle at top,#654a18,#050505 70%);border:1px solid #ffd76e88;box-shadow:0 0 4vh #ffbd2f55}.winner.show{display:block;animation:pop .4s cubic-bezier(.2,1.6,.3,1)}@keyframes pop{from{transform:translateX(-50%) scale(.55);opacity:0}}.winner b{display:block;font-size:2.4vh;color:#ffd75f;margin:.4vh}.bottomText{position:absolute;z-index:7;left:8%;right:8%;bottom:7%;text-align:center;font-weight:1000;font-size:1.2vh;text-shadow:0 .2vh .5vh #000}.bottomText small{display:block;font-size:.85vh;opacity:.7;margin-top:.4vh}.flash{position:absolute;z-index:30;inset:0;background:#fff;opacity:0;pointer-events:none}.flash.go{animation:flash .22s}@keyframes flash{0%{opacity:.35}100%{opacity:0}}
</style></head><body><main class="stage"><div class="stars"></div><canvas id="fx"></canvas><div class="status" id="status">BEKLENİYOR</div><div class="arenaWrap"><div class="speaker left"></div><section class="arena">${lanes}</section><div class="speaker right"></div></div><div class="flame left" id="flameL"><i></i></div><div class="flame right" id="flameR"><i></i></div><div class="winner" id="winner"><div>👑</div><span>KAZANAN</span><b id="winnerText">1 NUMARA</b><small>Yeni tur otomatik başlayacak</small></div><div class="gift" id="gift"><span class="note">♪</span><div><b id="giftUser">Hediye</b><span id="giftName"></span></div><strong id="giftPts">x1</strong></div><div class="pick" id="pick">Yoruma 1–5 yazıp aslanını seç</div><div class="crowd" id="crowd"></div><div class="bottomText">GÜÇSÜZ OLAN ALTTA KALIR<small>1–5 NUMARA YAZ • HEDİYEN ASLANINI İLERLETSİN</small></div><div class="flash" id="flash"></div></main><script>
const socket=io(),crowd=document.getElementById('crowd');for(let i=0;i<90;i++){const f=document.createElement('i');f.className='fan';f.style.left=Math.random()*100+'%';f.style.height=(4+Math.random()*5)+'vh';f.style.opacity=.4+Math.random()*.6;f.style.animationDelay=Math.random()*.5+'s';crowd.appendChild(f)}
const cv=document.getElementById('fx'),ctx=cv.getContext('2d');let ps=[];function rs(){const r=cv.getBoundingClientRect();cv.width=Math.floor(r.width*devicePixelRatio);cv.height=Math.floor(r.height*devicePixelRatio);ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}addEventListener('resize',rs);rs();function burst(x,y,big=false){const cols=['#fff','#ffd66a','#ff6f78','#8fdcff'];for(let i=0;i<(big?64:34);i++){const a=Math.random()*Math.PI*2,s=(big?2.5:1.5)+Math.random()*(big?3.3:2.2);ps.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,d:.008+Math.random()*.012,c:cols[(Math.random()*cols.length)|0],z:.7+Math.random()*1.6})}}setInterval(()=>{const r=cv.getBoundingClientRect();burst(r.width*(.18+Math.random()*.64),r.height*(.14+Math.random()*.23),Math.random()>.45)},1500);(function loop(){const r=cv.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);for(const p of ps){p.x+=p.vx;p.y+=p.vy;p.vy+=.018;p.l-=p.d;ctx.globalAlpha=Math.max(0,p.l);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.z,0,Math.PI*2);ctx.fill()}ps=ps.filter(p=>p.l>0);ctx.globalAlpha=1;requestAnimationFrame(loop)})();
function draw(s){const st=document.getElementById('status');st.textContent=s.connected?'CANLI • @'+s.liveUser:(s.status||'BEKLENİYOR');st.classList.toggle('on',!!s.connected);for(let i=0;i<5;i++){document.querySelector('#score'+i+' b').textContent=Math.round(s.scores[i]);document.getElementById('runner'+i).style.left=(17+Math.min(1,s.scores[i]/s.finishScore)*69)+'%'}if(s.winner===null)document.getElementById('winner').classList.remove('show')}
function flash(){const e=document.getElementById('flash');e.classList.remove('go');void e.offsetWidth;e.classList.add('go')}function flames(){for(const id of ['flameL','flameR']){const e=document.getElementById(id);e.classList.remove('go');void e.offsetWidth;e.classList.add('go')}}
socket.on('state',draw);socket.on('selection',d=>document.getElementById('pick').textContent=(d.nickname||'İzleyici')+' → '+(d.lane+1)+' NUMARALI ASLAN');socket.on('gift',d=>{const r=document.getElementById('runner'+d.lane);r.classList.remove('boost');void r.offsetWidth;r.classList.add('boost');document.getElementById('giftUser').textContent=d.nickname||'İzleyici';document.getElementById('giftName').textContent=d.giftName||'Hediye';document.getElementById('giftPts').textContent='x'+Math.max(1,d.points);const g=document.getElementById('gift');g.classList.remove('show');void g.offsetWidth;g.classList.add('show');const cr=cv.getBoundingClientRect();burst(cr.width*(.35+Math.random()*.3),cr.height*.28,true);if(d.points>=8){flash();flames()}});socket.on('winner',d=>{document.getElementById('winnerText').textContent=(d.lane+1)+' NUMARA • '+d.lion.flag+' '+d.lion.name;document.getElementById('winner').classList.add('show');flash();flames();const r=cv.getBoundingClientRect();for(let i=0;i<5;i++)setTimeout(()=>burst(r.width*(.15+Math.random()*.7),r.height*(.13+Math.random()*.32),true),i*170)});socket.on('roundReset',()=>{document.getElementById('winner').classList.remove('show');flash()});
</script></body></html>`;
}

function adminHtml(){
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aslan Yarışı Admin</title><script src="/socket.io/socket.io.js"></script><style>*{box-sizing:border-box}body{margin:0;background:#0b0e13;color:#fff;font-family:Arial,sans-serif;padding:24px}.wrap{max-width:760px;margin:auto}.card{background:#151a22;border:1px solid #ffffff18;border-radius:18px;padding:20px;margin-bottom:16px}h1{margin-top:0}label{display:block;font-size:13px;opacity:.75;margin:10px 0 6px}input,select,button{width:100%;padding:13px;border-radius:10px;border:1px solid #ffffff22;background:#090c11;color:#fff;font-size:15px}button{cursor:pointer;background:#1565d8;font-weight:800;margin-top:10px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.status{padding:12px;border-radius:10px;background:#090c11;margin-top:12px}.ok{color:#65f29a}.err{color:#ff6a78}.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.box{text-align:center;padding:12px 6px;background:#090c11;border-radius:10px}.box b{display:block;font-size:24px}a{color:#7fc5ff}</style></head><body><div class="wrap"><h1>🦁 TikTok Aslan Yarışı</h1><div class="card"><b>Yayın ekranı:</b> <a href="/" target="_blank">siteyi aç</a><div id="live" class="status">Durum bekleniyor…</div></div><div class="card"><h3>TikTok hesabını bağla</h3><label>Yönetici PIN</label><input id="pin" type="password" placeholder="PIN"><label>TikTok kullanıcı adı</label><input id="username" placeholder="@kullaniciadi"><button id="connect">TikTok'a Bağlan</button><div id="result" class="status">Hazır.</div></div><div class="card"><h3>Yarış</h3><div class="scores" id="scores"></div><button id="reset">Yeni Tur / Sıfırla</button></div><div class="card"><h3>Test hediyesi</h3><div class="row"><div><label>Aslan</label><select id="lane">${lions.map((d,i)=>`<option value="${i}">${i+1} - ${d.flag} ${d.name}</option>`).join("")}</select></div><div><label>Puan</label><input id="points" type="number" value="10" min="1" max="100"></div></div><button id="test">Test Hediyesi Gönder</button></div></div><script>const socket=io(),pin=document.getElementById('pin'),res=document.getElementById('result');function p(){return pin.value}socket.on('state',s=>{document.getElementById('live').innerHTML=(s.connected?'🟢 ':'⚪ ')+(s.status||'')+(s.liveUser?' • @'+s.liveUser:'');document.getElementById('scores').innerHTML=s.scores.map((x,i)=>'<div class="box">'+(i+1)+' '+s.lions[i].flag+'<b>'+Math.round(x)+'</b></div>').join('')});socket.on('adminResult',r=>{res.textContent=r.ok?'✅ '+r.message:'❌ '+r.error;res.className='status '+(r.ok?'ok':'err')});document.getElementById('connect').onclick=()=>socket.emit('adminConnect',{pin:p(),username:document.getElementById('username').value});document.getElementById('reset').onclick=()=>socket.emit('adminReset',{pin:p()});document.getElementById('test').onclick=()=>socket.emit('adminTest',{pin:p(),lane:Number(document.getElementById('lane').value),points:Number(document.getElementById('points').value)});</script></body></html>`;
}

server.listen(PORT,"0.0.0.0",()=>console.log(`Lion Race v2 running on ${PORT}`));
