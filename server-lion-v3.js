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
      <circle r="8.5" stroke="none"/>
      <g stroke-width="2.1">
        <path d="M0-17V-11"/><path d="M0 17V11"/><path d="M-17 0H-11"/><path d="M17 0H11"/>
        <path d="M-12-12L-8-8"/><path d="M12 12L8 8"/><path d="M12-12L8-8"/><path d="M-12 12L-8 8"/>
        <path d="M-6.5-15.7L-4.2-10.2"/><path d="M6.5 15.7L4.2 10.2"/><path d="M6.5-15.7L4.2-10.2"/><path d="M-6.5 15.7L-4.2 10.2"/>
        <path d="M-15.7-6.5L-10.2-4.2"/><path d="M15.7 6.5L10.2 4.2"/><path d="M15.7-6.5L10.2-4.2"/><path d="M-15.7 6.5L-10.2 4.2"/>
      </g>
    </g>`
);

const laneOld = '  const lanes=lions.map((lion,i)=>`<div class="lane"><div class="score" id="score${i}"><span>${lion.flag}</span><b>0</b></div>${lionSvg(lion,i)}</div>`).join("");';
const laneNew = '  const lanes=lions.map((lion,i)=>`<div class="lane"><div class="score" id="score${i}">${lion.code==="KU"?`<span class="kurdMini"><i></i></span>`:`<span>${lion.flag}</span>`}<b>0</b></div>${lionSvg(lion,i)}</div>`).join("");';
src = src.replace(laneOld, laneNew);

src = src.replace(
  '.score span{font-size:.9vh}.score b{font-size:1.08vh}',
  '.score span{font-size:.9vh}.kurdMini{display:inline-block;position:relative;width:1.35vh;height:.85vh;border:.05vh solid #ffffff66;border-radius:.08vh;background:linear-gradient(#d71920 0 33%,#fff 33% 66%,#1f8f3a 66% 100%);overflow:hidden}.kurdMini i{position:absolute;left:50%;top:50%;width:.28vh;height:.28vh;border-radius:50%;background:#f6cf19;transform:translate(-50%,-50%);box-shadow:0 -.22vh 0 -.09vh #f6cf19,0 .22vh 0 -.09vh #f6cf19,.22vh 0 0 -.09vh #f6cf19,-.22vh 0 0 -.09vh #f6cf19}.score b{font-size:1.08vh}'
);

fs.writeFileSync(runtimePath, src, "utf8");
await import(pathToFileURL(runtimePath).href + `?v=${Date.now()}`);
