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
  return src;
}

let wrapper = fs.readFileSync(v3Path, "utf8");
const injection = 'src = (' + patchRuntime.toString() + ')(src);\nfs.writeFileSync(runtimePath, src, "utf8");';
wrapper = wrapper.replace('fs.writeFileSync(runtimePath, src, "utf8");', injection);

fs.writeFileSync(patchedWrapperPath, wrapper, "utf8");
await import(pathToFileURL(patchedWrapperPath).href + `?v=${Date.now()}`);
