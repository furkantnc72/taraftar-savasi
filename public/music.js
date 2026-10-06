// Taraftar Savaşı - lider takım müziği
// YouTube IFrame Player API kullanır. Kullanıcı bir kez sesi açtıktan sonra
// lider değiştikçe takım müziği otomatik değişir.

const TEAM_MUSIC = {
  gs:      { name: "Galatasaray", videoId: "RSaFk6fpWcE" },
  fb:      { name: "Fenerbahçe", videoId: "NJ2TkBrWA04" },
  bjk:     { name: "Beşiktaş", videoId: "1hLsI4Gnb2k" },
  ts:      { name: "Trabzonspor", videoId: "0fHYOEy70s4" },
  amed:    { name: "Amedspor", videoId: "kRgsrBJfmZc" },
  bursa:   { name: "Bursaspor", videoId: "uWueGFqrGO4" },
  ksp:     { name: "Kasımpaşa", videoId: "HsEVcFSLalg" },
  kocaeli: { name: "Kocaelispor", videoId: "oF5qnqZEMf8" }
};

let ytPlayer = null;
let ytReady = false;
let musicEnabled = false;
let currentMusicTeam = null;
let candidateTeam = null;
let candidateSince = 0;
const LEADER_STABLE_MS = 5000;

function getTeamIdFromLeaderName(name) {
  return Object.entries(TEAM_MUSIC).find(([, v]) => v.name === name)?.[0] || null;
}

function hasRealLeader() {
  const scoreText = document.querySelector('#leaderScore')?.textContent || '';
  const digits = scoreText.split('PUAN')[0].replace(/\D/g, '');
  return Number(digits || 0) > 0;
}

function currentLeaderTeam() {
  if (!hasRealLeader()) return null;
  const name = document.querySelector('#leaderName')?.textContent?.trim() || '';
  return getTeamIdFromLeaderName(name);
}

function musicToast(text) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}

function ensureMusicControls() {
  const panel = document.querySelector('#panel');
  if (!panel || document.querySelector('#musicEnableBtn')) return;

  const hr = document.createElement('hr');
  const title = document.createElement('b');
  title.textContent = 'Lider Takım Müziği';
  const info = document.createElement('small');
  info.id = 'musicInfo';
  info.textContent = 'YouTube hazırlanıyor…';

  const row = document.createElement('div');
  row.className = 'row';
  const btn = document.createElement('button');
  btn.id = 'musicEnableBtn';
  btn.textContent = '🔊 Lider müziğini aç';
  btn.disabled = true;
  btn.style.flex = '1';

  btn.addEventListener('click', () => {
    if (!ytReady || !ytPlayer) return;
    musicEnabled = !musicEnabled;

    if (musicEnabled) {
      btn.textContent = '🔇 Lider müziğini kapat';
      document.querySelector('#musicInfo').textContent = 'Açık • Lider 5 sn korununca müzik otomatik değişir.';
      try {
        ytPlayer.unMute();
        ytPlayer.setVolume(65);
      } catch {}
      const leader = currentLeaderTeam();
      if (leader) switchMusic(leader, true);
      musicToast('🔊 Lider takım müziği açıldı');
    } else {
      btn.textContent = '🔊 Lider müziğini aç';
      document.querySelector('#musicInfo').textContent = 'Kapalı';
      currentMusicTeam = null;
      try { ytPlayer.stopVideo(); } catch {}
      musicToast('🔇 Lider takım müziği kapatıldı');
    }
  });

  row.appendChild(btn);
  // TikTok bağlantı bölümünün altına ekle; panel kapanınca yayında görünmez.
  const status = document.querySelector('#connStatus');
  if (status) {
    status.insertAdjacentElement('afterend', hr);
    hr.insertAdjacentElement('afterend', title);
    title.insertAdjacentElement('afterend', info);
    info.insertAdjacentElement('afterend', row);
  } else {
    panel.append(hr, title, info, row);
  }
}

function setupHiddenPlayerHost() {
  if (document.querySelector('#leaderMusicPlayer')) return;
  const host = document.createElement('div');
  host.id = 'leaderMusicPlayer';
  host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
  document.body.appendChild(host);
}

function loadYouTubeApi() {
  setupHiddenPlayerHost();
  if (window.YT && window.YT.Player) {
    createPlayer();
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.async = true;
  document.head.appendChild(s);
}

window.onYouTubeIframeAPIReady = createPlayer;

function createPlayer() {
  if (ytPlayer || !window.YT?.Player) return;
  ytPlayer = new YT.Player('leaderMusicPlayer', {
    width: '1',
    height: '1',
    videoId: TEAM_MUSIC.gs.videoId,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      playsinline: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        ytReady = true;
        try { ytPlayer.setVolume(65); ytPlayer.mute(); } catch {}
        const btn = document.querySelector('#musicEnableBtn');
        if (btn) btn.disabled = false;
        const info = document.querySelector('#musicInfo');
        if (info) info.textContent = 'Hazır • Yayına başlamadan önce bir kez düğmeye bas.';
      },
      onStateChange: (ev) => {
        if (musicEnabled && ev.data === YT.PlayerState.ENDED) {
          try { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); } catch {}
        }
      },
      onError: () => {
        musicToast('⚠️ Bu takımın YouTube videosu gömülü oynatılamadı.');
      }
    }
  });
}

function switchMusic(teamId, force = false) {
  if (!musicEnabled || !ytReady || !TEAM_MUSIC[teamId]) return;
  if (!force && currentMusicTeam === teamId) return;

  currentMusicTeam = teamId;
  try {
    ytPlayer.loadVideoById(TEAM_MUSIC[teamId].videoId, 0);
    ytPlayer.unMute();
    ytPlayer.setVolume(65);
    ytPlayer.playVideo();
    musicToast(`🎵 ${TEAM_MUSIC[teamId].name} lider! Takım şarkısı çalıyor.`);
  } catch {}
}

function watchLeaderMusic() {
  const leader = currentLeaderTeam();
  const now = Date.now();

  if (!leader) {
    candidateTeam = null;
    candidateSince = 0;
    if (musicEnabled && currentMusicTeam) {
      currentMusicTeam = null;
      try { ytPlayer?.stopVideo(); } catch {}
    }
    return;
  }

  if (leader !== candidateTeam) {
    candidateTeam = leader;
    candidateSince = now;
    return;
  }

  if (musicEnabled && leader !== currentMusicTeam && now - candidateSince >= LEADER_STABLE_MS) {
    switchMusic(leader);
  }
}

ensureMusicControls();
loadYouTubeApi();
setInterval(watchLeaderMusic, 500);
