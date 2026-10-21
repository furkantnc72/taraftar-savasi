import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v4Path = path.join(__dirname, "server-lion-v4.js");
const patchedPath = path.join(__dirname, ".server-lion-v6-wrapper.js");

let src = fs.readFileSync(v4Path, "utf8");

const marker = "  src = src.replace('Yoruma 1–5 yazıp aslanını seç','HEDİYENİ AT • ÜLKENİ İLERLET');";
const injection = `  const adminTestLogic = [
    '  socket.on("adminTest",({pin,lane=0,points=10}={})=>{',
    '    if(!authed(pin) || state.winner!==null) return;',
    '    lane=Math.max(0,Math.min(4,Number(lane)||0));',
    '    points=Math.max(1,Math.min(999,Number(points)||10));',
    '    state.scores[lane]+=points;',
    '    state.lastGift={lane,points,giftName:"Test Hediyesi",repeat:points,diamonds:points,nickname:"TEST",username:"test_user",avatar:"",at:Date.now()};',
    '    io.emit("gift",state.lastGift);',
    '    push();',
    '  });'
  ].join('\\n');
  src = src.replace(/  socket\\.on\("adminTest",\(\{pin,lane=0,points=10\}=\{\}\\)=>\{[\\s\\S]*?\\n  \}\);/, adminTestLogic);

`;

if (!src.includes(marker)) throw new Error("v4 patch marker bulunamadi");
src = src.replace(marker, injection + marker);

fs.writeFileSync(patchedPath, src, "utf8");
await import(pathToFileURL(patchedPath).href + `?v=${Date.now()}`);
