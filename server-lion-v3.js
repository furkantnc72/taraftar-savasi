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

src = src.replace(
  "document.getElementById('runner'+i).style.left=(17+Math.min(1,s.scores[i]/s.finishScore)*69)+'%'",
  "document.getElementById('runner'+i).style.left=(18+Math.min(1,s.scores[i]/s.finishScore)*64)+'%'"
);

fs.writeFileSync(runtimePath, src, "utf8");
await import(pathToFileURL(runtimePath).href + `?v=${Date.now()}`);
