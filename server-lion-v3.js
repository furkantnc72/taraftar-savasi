import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, "server-lion-v2.js");
const runtimePath = path.join(__dirname, ".server-lion-runtime.js");

let src = fs.readFileSync(sourcePath, "utf8");

src = src.replace(
  '{ name:"Portekiz", flag:"🇵🇹", code:"PT" },',
  '{ name:"Kürdistan", flag:"☀️", code:"KU" },'
);

src = src.replace('if(code==="PT") return `', 'if(code==="KU") return `');

src = src.replace(
`    <rect width="64" height="80" fill="#046a38"/><rect x="64" width="96" height="80" fill="#da291c"/>
    <circle cx="64" cy="40" r="13" fill="#ffcc00"/><circle cx="64" cy="40" r="8" fill="#fff" stroke="#c8102e" stroke-width="2"/><path d="M60 34h8v12h-8z" fill="#c8102e"/>`,
`    <rect width="160" height="27" fill="#d71920"/><rect y="27" width="160" height="26" fill="#ffffff"/><rect y="53" width="160" height="27" fill="#1f8f3a"/>
    <g transform="translate(80 40)" fill="#f6cf19" stroke="#f6cf19" stroke-linecap="round">
      <circle r="9.5" stroke="none"/>
      <g stroke-width="2.5">
        <path d="M0-18V-11"/><path d="M0 18V11"/><path d="M-18 0H-11"/><path d="M18 0H11"/>
        <path d="M-13-13L-8-8"/><path d="M13 13L8 8"/><path d="M13-13L8-8"/><path d="M-13 13L-8 8"/>
        <path d="M-7-16.5L-4.2-10.2"/><path d="M7 16.5L4.2 10.2"/><path d="M7-16.5L4.2-10.2"/><path d="M-7 16.5L-4.2 10.2"/>
        <path d="M-16.5-7L-10.2-4.2"/><path d="M16.5 7L10.2 4.2"/><path d="M16.5-7L10.2-4.2"/><path d="M-16.5 7L-10.2 4.2"/>
      </g>
    </g>`
);

const laneOld = '  const lanes=lions.map((lion,i)=>`<div class="lane"><div class="score" id="score${i}"><span>${lion.flag}</span><b>0</b></div>${lionSvg(lion,i)}</div>`).join("");';
const laneNew = '  const lanes=lions.map((lion,i)=>`<div class="lane"><div class="score" id="score${i}">${lion.code==="KU"?`<span class="kurdMini"><i></i></span>`:`<span>${lion.flag}</span>`}<b>0</b></div>${lionSvg(lion,i)}</div>`).join("");';
src = src.replace(laneOld, laneNew);

src = src.replace(
  '.score span{font-size:.9vh}.score b{font-size:1.08vh}',
  '.score span{font-size:1.25vh}.kurdMini{display:inline-block;position:relative;width:2vh;height:1.25vh;border:.06vh solid #ffffff88;border-radius:.1vh;background:linear-gradient(#d71920 0 33%,#fff 33% 66%,#1f8f3a 66% 100%);overflow:hidden}.kurdMini i{position:absolute;left:50%;top:50%;width:.42vh;height:.42vh;border-radius:50%;background:#f6cf19;transform:translate(-50%,-50%);box-shadow:0 -.3vh 0 -.12vh #f6cf19,0 .3vh 0 -.12vh #f6cf19,.3vh 0 0 -.12vh #f6cf19,-.3vh 0 0 -.12vh #f6cf19}.score b{font-size:1.35vh}'
);

src = src.replace(
  '.arenaWrap{position:absolute;left:16%;right:16%;top:36.5%;height:29%;z-index:6}',
  '.arenaWrap{position:absolute;left:7%;right:7%;top:33.5%;height:36%;z-index:6}'
);

src = src.replace(
  '.score{position:absolute;left:0;top:50%;transform:translateY(-50%);height:48%;min-width:13%;',
  '.score{position:absolute;left:0;top:50%;transform:translateY(-50%);height:58%;min-width:16%;'
);

src = src.replace(
  '.runner{position:absolute;left:17%;top:50%;width:26%;',
  '.runner{position:absolute;left:18%;top:50%;width:32%;'
);

// 30-minute authoritative round timer on the server.
src = src.replace(
  'finishScore:FINISH_SCORE, lastGift:null, lastSelection:null, viewers:null',
  'finishScore:FINISH_SCORE, roundEndsAt:Date.now()+30*60*1000, lastGift:null, lastSelection:null, viewers:null'
);

// Disable the old score-100 finish condition: timer decides the winner.
src = src.replace(
`  if(state.scores[lane]>=FINISH_SCORE){
    state.scores[lane]=FINISH_SCORE; state.winner=lane;
    io.emit("winner",{lane,lion:lions[lane],round:state.round});
    clearTimeout(resetTimer); resetTimer=setTimeout(resetRound,RESET_DELAY);
  }
  push();`,
`  push();`
);

src = src.replace(
  'state.scores=[0,0,0,0,0]; state.winner=null; state.round+=1; state.lastGift=null;',
  'state.scores=[0,0,0,0,0]; state.winner=null; state.round+=1; state.roundEndsAt=Date.now()+30*60*1000; state.lastGift=null;'
);

src = src.replace(
  'async function disconnectLive(){',
`function finishTimedRound(){
  if(state.winner!==null) return;
  const max=Math.max(...state.scores);
  const leaders=[];
  state.scores.forEach((v,i)=>{ if(v===max) leaders.push(i); });
  const lane=leaders[Math.floor(Math.random()*leaders.length)] ?? 0;
  state.winner=lane;
  io.emit("winner",{lane,lion:lions[lane],round:state.round,timed:true});
  push();
  clearTimeout(resetTimer);
  resetTimer=setTimeout(resetRound,RESET_DELAY);
}
setInterval(()=>{
  if(state.winner===null && Date.now()>=state.roundEndsAt) finishTimedRound();
},500);

async function disconnectLive(){`
);

// Enlarge and adapt runner position to the current leader rather than score/100.
src = src.replace(
  "document.getElementById('runner'+i).style.left=(17+Math.min(1,s.scores[i]/s.finishScore)*69)+'%'",
  "const mx=Math.max(1,...s.scores);document.getElementById('runner'+i).style.left=(18+(s.scores[i]/mx)*64)+'%'"
);

// Timer + current leader music label.
src = src.replace(
  '.status.on{color:#77ff9e}',
  '.status.on{color:#77ff9e}.timerBox{position:absolute;z-index:15;top:25.5%;left:50%;transform:translateX(-50%);min-width:36%;text-align:center;padding:.65vh 1.4vh;border-radius:1.2vh;background:linear-gradient(180deg,#111d,#020202e8);border:1px solid #ffffff2b;box-shadow:0 0 2vh #000}.timerBox .clock{font-size:3.25vh;font-weight:1000;letter-spacing:.08em;line-height:1;text-shadow:0 0 1.2vh #ffd25d55}.timerBox .musicNow{margin-top:.35vh;font-size:.82vh;font-weight:900;opacity:.9;white-space:nowrap}.timerBox .musicNow b{color:#ffd75f}'
);

src = src.replace(
  '<div class="status" id="status">BEKLENİYOR</div><div class="arenaWrap">',
  '<div class="status" id="status">BEKLENİYOR</div><div class="timerBox"><div class="clock" id="roundClock">30:00</div><div class="musicNow">🎵 LİDER: <b id="musicLeader">YARIŞ BAŞLIYOR</b></div></div><div class="arenaWrap">'
);

// Inject the 30-minute countdown and original WebAudio stadium tracks.
src = src.replace(
  "socket.on('state',draw);socket.on('selection'",
`let lastState=null,currentLeader=-1,audioCtx=null,musicTimer=null,beatStep=0;
const countryMusic=[
  {name:'Tacikistan',bpm:154,root:57,scale:[0,2,3,7,9],pattern:[0,2,4,3,2,1,3,4]},
  {name:'Türkiye',bpm:160,root:62,scale:[0,1,4,5,7,8,11],pattern:[0,2,4,3,5,4,2,1]},
  {name:'Suudi Arabistan',bpm:150,root:55,scale:[0,1,4,5,7,8,10],pattern:[0,3,4,2,5,4,3,1]},
  {name:'Kürdistan',bpm:158,root:59,scale:[0,2,3,5,7,9,10],pattern:[0,4,3,5,4,2,1,3]},
  {name:'Azerbaycan',bpm:162,root:60,scale:[0,1,4,5,7,8,11],pattern:[0,4,2,5,3,4,1,6]}
];
function ensureAudio(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
}
function tone(freq,dur=.11,vol=.035,type='sawtooth'){
  if(!audioCtx||audioCtx.state!=='running') return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(vol,audioCtx.currentTime+.008);g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur+.02);
}
function kick(){
  if(!audioCtx||audioCtx.state!=='running') return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(130,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(48,audioCtx.currentTime+.1);g.gain.setValueAtTime(.09,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.12);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13);
}
function hat(){
  if(!audioCtx||audioCtx.state!=='running') return;
  const b=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*.035),audioCtx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();s.buffer=b;f.type='highpass';f.frequency.value=6000;g.gain.value=.025;s.connect(f);f.connect(g);g.connect(audioCtx.destination);s.start();
}
function scheduleLeaderMusic(idx){
  if(idx===currentLeader&&musicTimer) return;
  currentLeader=idx;beatStep=0;clearInterval(musicTimer);musicTimer=null;
  if(idx<0) return;
  const m=countryMusic[idx];document.getElementById('musicLeader').textContent=m.name.toUpperCase();ensureAudio();
  const tick=()=>{ensureAudio();const step=beatStep++%16;if(step%4===0)kick();if(step%2===1)hat();if(step%2===0){const n=m.scale[m.pattern[(step/2)%m.pattern.length]%m.scale.length];const midi=m.root+n+(step%8===6?12:0);tone(440*Math.pow(2,(midi-69)/12),.12,.032,step%4===0?'square':'sawtooth');if(step%8===0)tone(440*Math.pow(2,(midi-81)/12),.18,.016,'triangle');}};
  tick();musicTimer=setInterval(tick,60000/m.bpm/2);
}
function updateRoundUi(s){
  lastState=s;const left=Math.max(0,(s.roundEndsAt||Date.now())-Date.now()),sec=Math.ceil(left/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');document.getElementById('roundClock').textContent=mm+':'+ss;
  const max=Math.max(...s.scores),leaders=s.scores.map((v,i)=>v===max?i:-1).filter(i=>i>=0);const leader=max>0?leaders[0]:-1;scheduleLeaderMusic(leader);
}
setInterval(()=>{if(lastState)updateRoundUi(lastState)},250);
addEventListener('pointerdown',ensureAudio,{once:false});
addEventListener('keydown',ensureAudio,{once:false});
const oldDraw=draw;draw=function(s){oldDraw(s);updateRoundUi(s)};
socket.on('state',draw);socket.on('selection'`
);

src = src.replace(
  "socket.on('roundReset',()=>{document.getElementById('winner').classList.remove('show');flash()});",
  "socket.on('roundReset',()=>{document.getElementById('winner').classList.remove('show');currentLeader=-1;clearInterval(musicTimer);musicTimer=null;document.getElementById('musicLeader').textContent='YENİ TUR';flash()});"
);

fs.writeFileSync(runtimePath, src, "utf8");
await import(pathToFileURL(runtimePath).href + `?v=${Date.now()}`);
