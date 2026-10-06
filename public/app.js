
const TEAM_META={
  gs:{name:"Galatasaray",a:"#a6131d",b:"#e5a51c",emoji:"🦁"},
  fb:{name:"Fenerbahçe",a:"#08226f",b:"#f3ce16",emoji:"🐤"},
  bjk:{name:"Beşiktaş",a:"#111318",b:"#5d6470",emoji:"🦅"},
  ts:{name:"Trabzonspor",a:"#601322",b:"#2382ac",emoji:"🌊"},
  amed:{name:"Amedspor",a:"#126832",b:"#d44332",emoji:"🔥"},
  bursa:{name:"Bursaspor",a:"#0a6e45",b:"#f2f4ee",emoji:"🐊"},
  ksp:{name:"Kasımpaşa",a:"#164a8a",b:"#f4f7fb",emoji:"⚓"},
  kocaeli:{name:"Kocaelispor",a:"#12643f",b:"#11151a",emoji:"🌊"}
};

let state={roundEndsAt:Date.now()+30*60000,teams:Object.fromEntries(Object.keys(TEAM_META).map(k=>[k,{score:0,fans:0,top:{}}])),connected:false,roundMinutes:30};
let socket=null;
const $=s=>document.querySelector(s);
const teamsEl=$("#teams");
const nf=new Intl.NumberFormat("tr-TR");

function initTeams(){
  teamsEl.innerHTML="";
  for(const [id,m] of Object.entries(TEAM_META)){
    const el=document.createElement("article");
    el.className="team"; el.dataset.id=id;
    el.style.setProperty("--a",m.a);el.style.setProperty("--b",m.b);
    el.innerHTML=`<div class="rank">#-</div><div class="name">${m.name}</div><div class="score">0</div><div class="fans">👥 0 taraftar</div><div class="mascot">${m.emoji}</div><div class="bar"><span></span></div>`;
    teamsEl.appendChild(el);
  }
  $("#testTeam").innerHTML=Object.entries(TEAM_META).map(([id,m])=>`<option value="${id}">${m.name}</option>`).join("");
}
initTeams();

function leaderId(){
  return Object.entries(state.teams||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0))[0]?.[0]||"gs";
}
function render(){
  const ranking=Object.entries(state.teams||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0));
  const max=Math.max(1,...ranking.map(x=>x[1].score||0));
  ranking.forEach(([id,t],idx)=>{
    const el=document.querySelector(`.team[data-id="${id}"]`); if(!el)return;
    el.querySelector(".score").textContent=nf.format(t.score||0);
    el.querySelector(".fans").textContent=`👥 ${nf.format(t.fans||0)} taraftar`;
    el.querySelector(".rank").textContent=`#${idx+1}${idx===0?" 👑":""}`;
    el.querySelector(".bar span").style.width=`${Math.max(3,(t.score||0)/max*100)}%`;
    el.classList.toggle("leader",idx===0 && max>1);
    el.classList.toggle("sad",idx>=6);
    el.querySelector(".mascot").textContent=idx>=6?"😭":TEAM_META[id].emoji;
  });
  const lid=ranking[0]?.[0], lt=ranking[0]?.[1];
  if(lid){
    $("#leaderName").textContent=TEAM_META[lid].name;
    $("#leaderScore").textContent=`${nf.format(lt?.score||0)} PUAN • 👥 ${nf.format(lt?.fans||0)}`;
    $(".leader-panel").style.setProperty("--leaderA",TEAM_META[lid].a);
    $(".leader-panel").style.setProperty("--leaderB",TEAM_META[lid].b);
  }
  $("#connStatus").textContent=state.connected?`● TikTok LIVE bağlı: @${state.liveUser}`:"● Test modu / TikTok bağlı değil";
  $("#connStatus").className=`status ${state.connected?"ok":""}`;
}
function tick(){
  const left=Math.max(0,(state.roundEndsAt||Date.now())-Date.now());
  const s=Math.floor(left/1000), m=Math.floor(s/60), sec=s%60;
  $("#clock").textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  $("#clock").style.color=s<=60?"#ff7373":"";
  requestAnimationFrame(()=>{});
}
setInterval(tick,250); tick();

function beep(type="support"){
  try{
    const ctx=beep.ctx||(beep.ctx=new (window.AudioContext||window.webkitAudioContext)());
    const now=ctx.currentTime;
    const seq={
      support:[[440,.05],[660,.08]],
      like:[[520,.04],[700,.05]],
      goal:[[392,.08],[523,.08],[784,.18]],
      attack:[[160,.07],[120,.10],[90,.12]],
      super_goal:[[330,.07],[494,.07],[659,.07],[988,.24]],
      royal:[[523,.08],[659,.08],[784,.08],[1047,.3]],
      stadium:[[220,.08],[330,.08],[440,.08],[660,.08],[880,.35]],
      round_end:[[392,.1],[523,.1],[659,.1],[784,.35]]
    }[type]||[[440,.08]];
    let t=now;
    for(const [f,d] of seq){
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type=type==="attack"?"sawtooth":"triangle";o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+d+.02);t+=d*.75;
    }
  }catch{}
}
function particles(kind="✨",count=15){
  const fx=$("#fx");
  for(let i=0;i<count;i++){
    const p=document.createElement("span");p.className="particle";p.textContent=kind;
    p.style.left=(20+Math.random()*60)+"%";p.style.top=(35+Math.random()*35)+"%";
    p.style.setProperty("--x",(Math.random()*360-180)+"px");
    p.style.setProperty("--y",(-80-Math.random()*420)+"px");
    fx.appendChild(p);setTimeout(()=>p.remove(),1600);
  }
}
function flash(){const f=document.createElement("div");f.className="flash";$("#fx").appendChild(f);setTimeout(()=>f.remove(),600)}
function toast(text){
  const t=$("#toast");t.textContent=text;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
}
function gameEvent(e){
  if(!e)return;
  $("#eventText").textContent=e.title||"";
  const high=["goal","attack","super_goal","royal","stadium","round_end"].includes(e.type);
  if(high) toast(e.title);
  if(e.type==="like"){particles("👍",7);beep("like")}
  if(e.type==="support"){particles("✨",10);beep("support")}
  if(e.type==="goal"){particles("⚽",15);beep("goal")}
  if(e.type==="attack"){particles("💥",18);beep("attack");$("#stage").classList.add("shake");setTimeout(()=>$("#stage").classList.remove("shake"),450)}
  if(e.type==="super_goal"){flash();particles("⚽",26);beep("super_goal")}
  if(e.type==="royal"){flash();particles("👑",28);beep("royal")}
  if(e.type==="stadium"){flash();particles("🏆",38);beep("stadium");$("#stage").classList.add("shake");setTimeout(()=>$("#stage").classList.remove("shake"),700)}
  if(e.type==="round_end"){particles("🏆",50);beep("round_end")}
  if(e.type==="team_join"){particles("🙌",9);beep("support")}
  if(e.type==="pending"){toast(e.title);beep("support")}
}

function connectSocket(){
  if(typeof io==="undefined"){
    $("#connStatus").textContent="Sunucu olmadan yerel test modu";
    return;
  }
  socket=io();
  socket.on("state",s=>{state=s;render()});
  socket.on("clock",c=>state.roundEndsAt=c.roundEndsAt);
  socket.on("gameEvent",gameEvent);
  socket.on("connectionError",m=>{$("#connStatus").textContent="Bağlantı hatası: "+m;$("#connStatus").className="status bad"});
  socket.on("connectResult",r=>{
    $("#connStatus").textContent=r.ok?`Bağlandı: @${r.username}`:`Bağlanamadı: ${r.error}`;
    $("#connStatus").className=`status ${r.ok?"ok":"bad"}`;
  });
}
connectSocket();render();

$("#settingsBtn").onclick=()=>$("#panel").classList.remove("hidden");
$("#closePanel").onclick=()=>$("#panel").classList.add("hidden");
$("#connectBtn").onclick=()=>{
  if(!socket)return alert("TikTok bağlantısı için uygulamayı Node.js sunucusuyla aç.");
  socket.emit("connectTikTok",{username:$("#ttUser").value});
};
document.querySelectorAll(".roundBtn").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".roundBtn").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  socket?.emit("setRound",{minutes:Number(b.dataset.min)});
  if(!socket){state.roundMinutes=Number(b.dataset.min);state.roundEndsAt=Date.now()+state.roundMinutes*60000}
});
$("#resetBtn").onclick=()=>socket?.emit("resetRound");

function localSim(kind,opts={}){
  const id=opts.team||$("#testTeam").value,m=TEAM_META[id],t=state.teams[id];
  if(kind==="join")t.fans++;
  if(kind==="like")t.score+=5;
  if(kind==="gift"){
    const d=Number(opts.diamonds||1);
    const pts=d<=1?10:d<=5?25:d<=20?75:d<=100?250:d<=500?750:d<=1500?2000:Math.min(50000,Math.round(d*2.5));
    t.score+=pts;
    const type=d>=1500?"stadium":d>=500?"royal":d>=100?"super_goal":d>=20?"attack":d>=5?"goal":"support";
    gameEvent({type,team:id,title:`@${$("#testUser").value} → ${m.name} +${pts}`});
  }
  render();
}
document.querySelector('[data-test="join"]').onclick=()=>{
  const team=$("#testTeam").value,user=$("#testUser").value;
  if(socket)socket.emit("simulate",{kind:"team",team,user});else localSim("join",{team});
};
document.querySelector('[data-test="like"]').onclick=()=>{
  const team=$("#testTeam").value,user=$("#testUser").value;
  if(socket)socket.emit("simulate",{kind:"like",team,user,amount:200});else{localSim("like",{team});gameEvent({type:"like",title:`👍 @${user} ${TEAM_META[team].name} +5`})}
};
document.querySelectorAll("[data-gift]").forEach(b=>b.onclick=()=>{
  const team=$("#testTeam").value,user=$("#testUser").value,diamonds=Number(b.dataset.gift);
  if(socket)socket.emit("simulate",{kind:"gift",team,user,diamonds,giftName:b.textContent});
  else localSim("gift",{team,diamonds});
});
