import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v3Path = path.join(__dirname, "server-lion-v3.js");
const patchedWrapperPath = path.join(__dirname, ".server-lion-v4-wrapper.js");

function patchRuntime(src){
  const giftImgs = {
    rose: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "gift-assets/rose.b64"), "utf8").trim(),
    laser: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "gift-assets/laser.b64"), "utf8").trim(),
    gg: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "gift-assets/gg.b64"), "utf8").trim(),
    tiktok: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "gift-assets/tiktok.b64"), "utf8").trim(),
    cake: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "gift-assets/cake.b64"), "utf8").trim(),
  };

  src = src.replace(
    'conn.on(EventType.chat,data=>{ const lane=laneFromComment(data?.content ?? data?.comment ?? ""); if(lane!==null)setLane(safeUser(data),lane); });',
    'conn.on(EventType.chat,()=>{});'
  );

  const giftLogic = [
    'function normalizeGiftName(name){',
    '  return String(name||"").toLocaleLowerCase("tr-TR").replace(/[ı]/g,"i").replace(/[ğ]/g,"g").replace(/[ü]/g,"u").replace(/[ş]/g,"s").replace(/[ö]/g,"o").replace(/[ç]/g,"c").trim();',
    '}',
    'function giftLaneFromName(name){',
    '  const n=normalizeGiftName(name);',
    '  if(n==="rose" || n.includes("gul") || n.includes("rose")) return 3;',
    '  if(n==="tiktok" || n==="tik tok" || n.includes("tiktok")) return 1;',
    '  if(n==="gg" || n.includes("good game")) return 2;',
    '  if(n.includes("laser") || n.includes("lazer") || n.includes("light stick")) return 0;',
    '  if(n.includes("cake") || n.includes("kek")) return 4;',
    '  return null;',
    '}',
    'function applyGift(user,g){',
    '  if(state.winner!==null) return;',
    '  const lane=giftLaneFromName(g.name);',
    '  if(lane===null) return;',
    '  const points=Math.max(1,Math.min(999,Number(g.repeat)||1));',
    '  state.scores[lane]+=points;',
    '  state.lastGift={lane,points,giftName:g.name,repeat:g.repeat,diamonds:g.diamonds,nickname:user.nick,username:user.name,avatar:user.avatar,at:Date.now()};',
    '  io.emit("gift",state.lastGift);',
    '  push();',
    '}',
    'function resetRound(){'
  ].join('\n');

  src = src.replace(/function applyGift\(user,g\)\{[\s\S]*?\n\}\nfunction resetRound\(\)\{/, giftLogic);

  src = src.replace('Yoruma 1–5 yazıp aslanını seç','HEDİYENİ AT • ÜLKENİ İLERLET');
  src = src.replace('1–5 NUMARA YAZ • HEDİYEN ASLANINI İLERLETSİN','GÜL=KÜRDİSTAN • TIKTOK=TÜRKİYE • GG=SUUDİ • LAZER=TACİKİSTAN • KEK=AZERBAYCAN');

  const giftIcons = [giftImgs.laser, giftImgs.tiktok, giftImgs.gg, giftImgs.rose, giftImgs.cake];
  src = src.replace('function stageHtml(){','function stageHtml(){\n  const giftIcons='+JSON.stringify(giftIcons)+';');

  src = src.replace(
    /  const lanes=lions\.map\(\(lion,i\)=>`<div class="lane"><div class="score" id="score\$\{i\}">[\s\S]*?<\/div>\$\{lionSvg\(lion,i\)\}<\/div>`\)\.join\(""\);/,
    '  const giftNames=["Lazer Çubuğu","TikTok","GG","Gül","Kek"];\n  const lanes=lions.map((lion,i)=>`<div class="lane"><div class="score" id="score${i}"><img class="giftIcon" src="${giftIcons[i]}" alt="${giftNames[i]}" title="${giftNames[i]}"><b>0</b></div>${lionSvg(lion,i)}</div>`).join("");'
  );

  src = src.replace('.score b{font-size:1.35vh}', '.score b{font-size:1.5vh}.giftIcon{width:3.25vh;height:3.25vh;object-fit:contain;display:block;filter:drop-shadow(0 .15vh .18vh #000)}');
  src = src.replace('.score b{font-size:1.08vh}', '.score b{font-size:1.5vh}.giftIcon{width:3.25vh;height:3.25vh;object-fit:contain;display:block;filter:drop-shadow(0 .15vh .18vh #000)}');

  // Lider ulkenin kullanicinin verdigi YouTube sarkisini calmasi icin gorunur resmi YouTube player.
  src = src.replace(
    '.timerBox .musicNow b{color:#ffd75f}',
    '.timerBox .musicNow b{color:#ffd75f}.ytMusic{position:absolute;z-index:14;right:2.2%;top:17%;width:22%;aspect-ratio:16/9;border-radius:.65vh;overflow:hidden;background:#000;border:1px solid #ffffff30;box-shadow:0 0 1.2vh #000}.ytMusic iframe{width:100%!important;height:100%!important;display:block}'
  );
  src = src.replace(
    '<div class="arenaWrap">',
    '<div class="ytMusic"><div id="ytMusicPlayer"></div></div><div class="arenaWrap">'
  );

  const youtubeMusicCode = [
    'let lastState=null,currentLeader=-1,ytPlayer=null,ytReady=false,pendingLeader=-1;',
    'const countryMusic=[',
    '  {name:"Tacikistan",video:"Ld5RxxY1qic"},',
    '  {name:"Türkiye",video:"okQa7hl_xFM"},',
    '  {name:"Suudi Arabistan",video:"cGxGTsj16YM"},',
    '  {name:"Kürdistan",video:"78pp_LF46gY"},',
    '  {name:"Azerbaycan",video:"WWnyBT4ORVM"}',
    '];',
    'function createYTPlayer(){',
    '  if(ytPlayer || !window.YT || !YT.Player) return;',
    '  ytPlayer=new YT.Player("ytMusicPlayer",{height:"100%",width:"100%",playerVars:{controls:1,rel:0,playsinline:1,modestbranding:1,autoplay:0},events:{',
    '    onReady:()=>{ytReady=true;if(pendingLeader>=0)playLeaderMusic(pendingLeader,true);},',
    '    onStateChange:e=>{if(e.data===YT.PlayerState.ENDED && currentLeader>=0){ytPlayer.seekTo(0,true);ytPlayer.playVideo();}}',
    '  }});',
    '}',
    'function initYT(){',
    '  if(window.YT&&YT.Player){createYTPlayer();return;}',
    '  window.onYouTubeIframeAPIReady=createYTPlayer;',
    '  if(!document.querySelector("script[data-yt-api]")){const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.dataset.ytApi="1";document.head.appendChild(s);}',
    '}',
    'function playLeaderMusic(idx,force=false){',
    '  pendingLeader=idx;',
    '  if(idx<0){currentLeader=-1;document.getElementById("musicLeader").textContent="YARIŞ BAŞLIYOR";if(ytReady)ytPlayer.pauseVideo();return;}',
    '  if(!force&&idx===currentLeader)return;',
    '  currentLeader=idx;',
    '  const m=countryMusic[idx];',
    '  document.getElementById("musicLeader").textContent=m.name.toUpperCase();',
    '  if(ytReady){ytPlayer.loadVideoById({videoId:m.video,startSeconds:0});ytPlayer.setVolume(100);ytPlayer.playVideo();}',
    '}',
    'function scheduleLeaderMusic(idx){playLeaderMusic(idx);}',
    'initYT();',
    'function updateRoundUi(s){'
  ].join('\n');

  src = src.replace(
    /let lastState=null,currentLeader=-1,audioCtx=null,musicTimer=null,beatStep=0;[\s\S]*?function updateRoundUi\(s\)\{/,
    youtubeMusicCode
  );

  src = src.replace(
    "addEventListener('pointerdown',ensureAudio,{once:false});\naddEventListener('keydown',ensureAudio,{once:false});",
    "addEventListener('pointerdown',()=>{if(ytReady&&currentLeader>=0)ytPlayer.playVideo()},{once:false});\naddEventListener('keydown',()=>{if(ytReady&&currentLeader>=0)ytPlayer.playVideo()},{once:false});"
  );

  src = src.replace(
    "currentLeader=-1;clearInterval(musicTimer);musicTimer=null;document.getElementById('musicLeader').textContent='YENİ TUR';",
    "currentLeader=-1;pendingLeader=-1;if(ytReady)ytPlayer.pauseVideo();document.getElementById('musicLeader').textContent='YENİ TUR';"
  );

  return src;
}

let wrapper = fs.readFileSync(v3Path, "utf8");
const injection = 'src = (' + patchRuntime.toString() + ')(src);\nfs.writeFileSync(runtimePath, src, "utf8");';
wrapper = wrapper.replace('fs.writeFileSync(runtimePath, src, "utf8");', injection);

fs.writeFileSync(patchedWrapperPath, wrapper, "utf8");
await import(pathToFileURL(patchedWrapperPath).href + `?v=${Date.now()}`);
