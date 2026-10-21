import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v4Path = path.join(__dirname, "server-lion-v4.js");
const patchedPath = path.join(__dirname, ".server-lion-v5-wrapper.js");

let src = fs.readFileSync(v4Path, "utf8");

const adminTestPatch = String.raw`
  const adminTestLogic = [
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
  src = src.replace(/  socket\\.on\\("adminTest",[\\s\\S]*?\\n  \\}\\);/, adminTestLogic);
`;

src = src.replace('  return src;\n}', adminTestPatch + '\n  return src;\n}');

fs.writeFileSync(patchedPath, src, "utf8");
await import(pathToFileURL(patchedPath).href + `?v=${Date.now()}`);
