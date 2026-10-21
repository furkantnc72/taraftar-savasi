import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v4Path = path.join(__dirname, "server-lion-v4.js");
const patchedPath = path.join(__dirname, ".server-lion-v7-wrapper.js");

let src = fs.readFileSync(v4Path, "utf8");

const marker = "  src = src.replace('Yoruma 1–5 yazıp aslanını seç','HEDİYENİ AT • ÜLKENİ İLERLET');";
const injection = `  const oldAdminTest = [
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
src = src.replace(marker, injection + marker);

fs.writeFileSync(patchedPath, src, "utf8");
await import(pathToFileURL(patchedPath).href + `?v=${Date.now()}`);
