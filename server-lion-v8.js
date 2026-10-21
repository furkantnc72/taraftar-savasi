import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v4Path = path.join(__dirname, "server-lion-v4.js");
const patchedPath = path.join(__dirname, ".server-lion-v8-wrapper.js");

let src = fs.readFileSync(v4Path, "utf8");

const marker = "  src = src.replace('Yoruma 1–5 yazıp aslanını seç','HEDİYENİ AT • ÜLKENİ İLERLET');";
const adminInjection = `  const oldAdminTest = [
    '  socket.on("adminTest",({pin,lane=0,points=10}={})=>{',
    '    if(!authed(pin))return; lane=Math.max(0,Math.min(4,Number(lane)||0)); points=Math.max(1,Math.min(100,Number(points)||10));',
    '    userLane.set("test",lane); applyGift({id:"test",name:"test_user",nick:"TEST",avatar:""},{name:"Test Hediyesi",diamonds:points*10,repeat:points,giftType:0,repeatEnd:1});',
    '  });'
  ].join('\\n');
  const newAdminTest = [
    '  socket.on("adminTest",({pin,lane=0,points=10}={})=>{',
    '    if(!authed(pin) || state.winner!==null) return;',
    '    lane=Math.max(0,Math.min(4,Number(lane)||0));',
    '    points=Math.max(1,Math.min(999,Number(points)||10));',
    '    state.scores[lane]+=points;',
    '    state.lastGift={lane,points,giftName:"Test Hediyesi",repeat:points,diamonds:points,nickname:"TEST",username:"test_user",avatar:"",at:Date.now()};',
    '    io.emit("gift",state.lastGift);',
    '    push();',
    '    socket.emit("adminResult",{ok:true,message:"Test hediyesi gönderildi"});',
    '  });'
  ].join('\\n');
  if(!src.includes(oldAdminTest)) throw new Error('adminTest eski kodu bulunamadi');
  src = src.replace(oldAdminTest,newAdminTest);

`;

if (!src.includes(marker)) throw new Error("v4 patch marker bulunamadi");
src = src.replace(marker, adminInjection + marker);

const featurePatch = `
  const rankRocketCode = [
    'let rocketTimer=null;',
    'function updateLaneRanks(s){',
    '  const order=[0,1,2,3,4].sort((a,b)=>((Number(s.scores[b])||0)-(Number(s.scores[a])||0))||a-b);',
    '  order.forEach((lane,rank)=>{const score=document.getElementById("score"+lane);const row=score&&score.parentElement;if(row)row.style.top=(rank*20)+"%";});',
    '}',
    'function launchRocket(fromIdx,toIdx,delay){',
    '  setTimeout(()=>{',
    '    if(!lastState||lastState.winner!==null)return;',
    '    const stage=document.querySelector(".stage"),from=document.getElementById("runner"+fromIdx),to=document.getElementById("runner"+toIdx);',
    '    if(!stage||!from||!to)return;',
    '    const sr=stage.getBoundingClientRect(),fr=from.getBoundingClientRect(),tr=to.getBoundingClientRect();',
    '    const x1=fr.left+fr.width*.68-sr.left,y1=fr.top+fr.height*.5-sr.top,x2=tr.left+tr.width*.58-sr.left,y2=tr.top+tr.height*.5-sr.top;',
    '    const dx=x2-x1,dy=y2-y1,ang=Math.atan2(dy,dx)*180/Math.PI;',
    '    const r=document.createElement("i");r.className="rocketFx";r.style.left=x1+"px";r.style.top=y1+"px";',
    '    const base="translate(-50%,-50%) rotate("+ang+"deg)";r.style.transform=base;stage.appendChild(r);',
    '    const end="translate(-50%,-50%) translate("+dx+"px,"+dy+"px) rotate("+ang+"deg)";',
    '    const a=r.animate([{transform:base,opacity:.25},{transform:end,opacity:1}],{duration:900,easing:"cubic-bezier(.2,.7,.25,1)",fill:"forwards"});',
    '    a.onfinish=()=>{r.remove();const row=document.getElementById("score"+toIdx)?.parentElement;if(row){row.classList.remove("rocketHit");void row.offsetWidth;row.classList.add("rocketHit");setTimeout(()=>row.classList.remove("rocketHit"),650)}burst(x2,y2,true);};',
    '  },delay||0);',
    '}',
    'function fireLeaderRockets(){',
    '  if(!lastState||lastState.winner!==null)return;',
    '  const max=Math.max(...lastState.scores);if(max<=0)return;',
    '  const leader=lastState.scores.findIndex(v=>v===max);if(leader<0)return;',
    '  [0,1,2,3,4].filter(i=>i!==leader).forEach((target,n)=>launchRocket(leader,target,n*180));',
    '}',
  ].join('\\n');

  src = src.replace('</style></head>', '.arena .lane{position:absolute!important;left:.5vh;right:.5vh;width:auto;height:20%;transition:top .62s cubic-bezier(.2,.85,.25,1),filter .25s,box-shadow .25s}.rocketFx{position:absolute;z-index:19;width:3.8vh;height:.78vh;background:linear-gradient(90deg,#ff7a00 0 18%,#e8edf2 19% 72%,#ff3b21 73% 100%);clip-path:polygon(0 50%,18% 0,78% 0,100% 50%,78% 100%,18% 100%);box-shadow:0 0 .75vh #ff7300;transform-origin:center;pointer-events:none}.rocketFx:before{content:"";position:absolute;left:-1.8vh;top:15%;width:2vh;height:70%;background:linear-gradient(90deg,transparent,#ff4d00,#fff08a);clip-path:polygon(0 50%,100% 0,100% 100%)}.lane.rocketHit{filter:brightness(1.85);box-shadow:inset 0 0 2vh #ff7a00,0 0 1.3vh #ff3b21}@keyframes rocketHit{0%,100%{filter:brightness(1)}40%{filter:brightness(2.1)}}.lane.rocketHit{animation:rocketHit .6s ease}</style></head>');
  src = src.replace('function updateRoundUi(s){', rankRocketCode+'\\nfunction updateRoundUi(s){');
  src = src.replace('lastState=s;const left=', 'lastState=s;updateLaneRanks(s);const left=');
  src = src.replace("setInterval(()=>{if(lastState)updateRoundUi(lastState)},250);", "setInterval(()=>{if(lastState)updateRoundUi(lastState)},250);if(!rocketTimer)rocketTimer=setInterval(fireLeaderRockets,20000);");
`;

src = src.replace('  return src;\n}', featurePatch + '\n  return src;\n}');

fs.writeFileSync(patchedPath, src, "utf8");
await import(pathToFileURL(patchedPath).href + `?v=${Date.now()}`);
