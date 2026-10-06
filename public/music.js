// Taraftar Savaşı - lider takım müziği
const TEAM_MUSIC = {
  gs:{name:"Galatasaray",videoId:"RSaFk6fpWcE"},
  fb:{name:"Fenerbahçe",videoId:"NJ2TkBrWA04"},
  bjk:{name:"Beşiktaş",videoId:"1hLsI4Gnb2k"},
  ts:{name:"Trabzonspor",videoId:"0fHYOEy70s4"},
  amed:{name:"Amedspor",videoId:"kRgsrBJfmZc"},
  bursa:{name:"Bursaspor",videoId:"uWueGFqrGO4"},
  ksp:{name:"Kasımpaşa",videoId:"HsEVcFSLalg"},
  kocaeli:{name:"Kocaelispor",videoId:"oF5qnqZEMf8"}
};

let ytPlayer=null, ytReady=false, ytLoading=false, pendingEnable=false;
let musicEnabled=false, currentMusicTeam=null, candidateTeam=null, candidateSince=0;
const LEADER_STABLE_MS=5000;

function musicToast(text){
  const t=document.querySelector('#toast'); if(!t)return;
  t.textContent=text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}
function currentLeaderTeam(){
  const scoreText=document.querySelector('#leaderScore')?.textContent||'';
  const score=Number(scoreText.split('PUAN')[0].replace(/\D/g,'')||0);
  if(score<=0) return null;
  const name=document.querySelector('#leaderName')?.textContent?.trim()||'';
  return Object.entries(TEAM_MUSIC).find(([,v])=>v.name===name)?.[0]||null;
}
function setupHost(){
  if(document.querySelector('#leaderMusicPlayer')) return;
  const host=document.createElement('div'); host.id='leaderMusicPlayer';
  host.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
  document.body.appendChild(host);
}
function loadYouTubeApi(){
  if(ytReady||ytLoading) return;
  ytLoading=true; setupHost();
  const info=document.querySelector('#musicInfo'); if(info) info.textContent='YouTube hazırlanıyor…';
  if(window.YT?.Player){ createPlayer(); return; }
  const s=document.createElement('script');
  s.src='https://www.youtube.com/iframe_api'; s.async=true;
  s.onerror=()=>{ytLoading=false; if(info) info.textContent='YouTube yüklenemedi. Tekrar deneyebilirsin.';};
  document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady=createPlayer;
function createPlayer(){
  if(ytPlayer||!window.YT?.Player) return;
  ytPlayer=new YT.Player('leaderMusicPlayer',{
    width:'1',height:'1',videoId:TEAM_MUSIC.gs.videoId,
    playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,rel:0},
    events:{
      onReady:()=>{
        ytReady=true; ytLoading=false;
        try{ytPlayer.setVolume(65);ytPlayer.mute();}catch{}
        const info=document.querySelector('#musicInfo'); if(info) info.textContent='Hazır';
        if(pendingEnable){pendingEnable=false;enableMusic();}
      },
      onStateChange:(ev)=>{
        if(musicEnabled&&ev.data===YT.PlayerState.ENDED){try{ytPlayer.seekTo(0,true);ytPlayer.playVideo();}catch{}}
      },
      onError:()=>musicToast('⚠️ Bu takımın YouTube videosu oynatılamadı.')
    }
  });
}
function switchMusic(teamId,force=false){
  if(!musicEnabled||!ytReady||!TEAM_MUSIC[teamId]) return;
  if(!force&&currentMusicTeam===teamId) return;
  currentMusicTeam=teamId;
  try{ytPlayer.loadVideoById(TEAM_MUSIC[teamId].videoId,0);ytPlayer.unMute();ytPlayer.setVolume(65);ytPlayer.playVideo();}catch{}
  musicToast(`🎵 ${TEAM_MUSIC[teamId].name} lider! Takım şarkısı çalıyor.`);
}
function enableMusic(){
  if(!ytReady){pendingEnable=true;loadYouTubeApi();return;}
  musicEnabled=true;
  const btn=document.querySelector('#musicEnableBtn'); if(btn) btn.textContent='🔇 Lider müziğini kapat';
  const info=document.querySelector('#musicInfo'); if(info) info.textContent='Açık • Lider 5 sn korununca otomatik değişir.';
  try{ytPlayer.unMute();ytPlayer.setVolume(65);}catch{}
  const leader=currentLeaderTeam(); if(leader) switchMusic(leader,true);
  musicToast('🔊 Lider takım müziği açıldı');
}
function disableMusic(){
  musicEnabled=false; currentMusicTeam=null; pendingEnable=false;
  const btn=document.querySelector('#musicEnableBtn'); if(btn) btn.textContent='🔊 Lider müziğini aç';
  const info=document.querySelector('#musicInfo'); if(info) info.textContent='Kapalı';
  try{ytPlayer?.stopVideo();}catch{}
}
function ensureMusicControls(){
  const panel=document.querySelector('#panel'); if(!panel||document.querySelector('#musicEnableBtn')) return;
  const hr=document.createElement('hr');
  const title=document.createElement('b'); title.textContent='Lider Takım Müziği';
  const info=document.createElement('small'); info.id='musicInfo'; info.textContent='Kapalı • Düğmeye basınca YouTube yüklenir.';
  const row=document.createElement('div'); row.className='row';
  const btn=document.createElement('button'); btn.id='musicEnableBtn'; btn.textContent='🔊 Lider müziğini aç'; btn.style.flex='1';
  btn.onclick=()=>musicEnabled?disableMusic():enableMusic();
  row.appendChild(btn);
  const status=document.querySelector('#connStatus');
  if(status){status.insertAdjacentElement('afterend',hr);hr.insertAdjacentElement('afterend',title);title.insertAdjacentElement('afterend',info);info.insertAdjacentElement('afterend',row);} else panel.append(hr,title,info,row);
}
function watchLeaderMusic(){
  const leader=currentLeaderTeam(), now=Date.now();
  if(!leader){candidateTeam=null;candidateSince=0;if(musicEnabled&&currentMusicTeam){currentMusicTeam=null;try{ytPlayer?.stopVideo();}catch{}}return;}
  if(leader!==candidateTeam){candidateTeam=leader;candidateSince=now;return;}
  if(musicEnabled&&leader!==currentMusicTeam&&now-candidateSince>=LEADER_STABLE_MS) switchMusic(leader);
}

ensureMusicControls();
setInterval(watchLeaderMusic,500);
