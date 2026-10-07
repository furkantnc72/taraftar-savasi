(()=>{
  const TEAM={
    gs:{name:'Galatasaray',a:'#a80d24',b:'#f28b19',code:'GS'},
    fb:{name:'Fenerbahçe',a:'#102569',b:'#f4d51a',code:'FB'},
    bjk:{name:'Beşiktaş',a:'#111111',b:'#f6f6f3',code:'BJK'},
    ts:{name:'Trabzonspor',a:'#68152b',b:'#55a8d0',code:'TS'},
    amed:{name:'Amedspor',a:'#126b39',b:'#b9272e',code:'AMED'},
    bursa:{name:'Bursaspor',a:'#087342',b:'#f2f2ed',code:'BURSA'},
    ksp:{name:'Kasımpaşa',a:'#184f91',b:'#f5f4ef',code:'KŞP'},
    kocaeli:{name:'Kocaelispor',a:'#0b6c41',b:'#111111',code:'KÖRFEZ'}
  };

  const CELEBRATION_MS=35000;
  let latestState=null;
  let celebrationTimer=null;
  let countdownTimer=null;
  let confettiTimer=null;

  function ensureWinsUi(){
    let board=document.querySelector('#winsBoard');
    if(!board){
      const leader=document.querySelector('.leader-panel');
      if(!leader) return;
      board=document.createElement('section');
      board.id='winsBoard';
      board.className='wins-board';
      board.innerHTML='<span class="wins-title">🏆 TUR GALİBİYETLERİ</span><div id="winsList"></div>';
      leader.insertAdjacentElement('afterend',board);
    }

    document.querySelectorAll('.team').forEach(card=>{
      let badge=card.querySelector('.wins-badge');
      if(!badge){
        badge=document.createElement('div');
        badge.className='wins-badge';
        badge.textContent='🏆 0';
        card.appendChild(badge);
      }
    });
  }

  function renderWins(s){
    if(!s?.teams) return;
    latestState=s;
    ensureWinsUi();

    Object.entries(s.teams).forEach(([id,t])=>{
      const badge=document.querySelector(`.team[data-id="${id}"] .wins-badge`);
      if(badge) badge.textContent=`🏆 ${Number(t?.wins||0)} KAZANÇ`;
    });

    const list=document.querySelector('#winsList');
    if(!list) return;
    const sorted=Object.entries(s.teams)
      .sort((a,b)=>(Number(b[1]?.wins||0)-Number(a[1]?.wins||0)) || (Number(b[1]?.score||0)-Number(a[1]?.score||0)));
    list.innerHTML=sorted.map(([id,t],i)=>
      `<span class="win-pill ${i===0&&Number(t?.wins||0)>0?'win-leader':''}">${TEAM[id]?.code||id} <b>🏆${Number(t?.wins||0)}</b></span>`
    ).join('');
  }

  function ensureCelebration(){
    let root=document.querySelector('#roundChampion');
    if(root) return root;
    root=document.createElement('div');
    root.id='roundChampion';
    root.className='round-champion';
    document.body.appendChild(root);
    return root;
  }

  function confettiBatch(root,count=42){
    const layer=root.querySelector('.champion-confetti');
    if(!layer) return;
    const symbols=['◆','●','★','✦','🏆','⚽','✨'];
    for(let i=0;i<count;i++){
      const p=document.createElement('i');
      p.className='champ-confetti-piece';
      p.textContent=symbols[Math.floor(Math.random()*symbols.length)];
      p.style.left=`${Math.random()*100}%`;
      p.style.setProperty('--dx',`${Math.round(Math.random()*220-110)}px`);
      p.style.setProperty('--rot',`${Math.round(Math.random()*1000-500)}deg`);
      p.style.setProperty('--delay',`${Math.random()*.65}s`);
      p.style.setProperty('--dur',`${2.2+Math.random()*2.2}s`);
      p.style.setProperty('--size',`${12+Math.random()*25}px`);
      layer.appendChild(p);
      setTimeout(()=>p.remove(),5200);
    }
  }

  function firework(root){
    const layer=root.querySelector('.champion-fireworks');
    if(!layer) return;
    const x=15+Math.random()*70;
    const y=15+Math.random()*45;
    const burst=document.createElement('div');
    burst.className='champ-firework';
    burst.style.left=`${x}%`;
    burst.style.top=`${y}%`;
    for(let i=0;i<18;i++){
      const s=document.createElement('span');
      const a=(Math.PI*2*i)/18;
      const d=70+Math.random()*85;
      s.style.setProperty('--x',`${Math.cos(a)*d}px`);
      s.style.setProperty('--y',`${Math.sin(a)*d}px`);
      burst.appendChild(s);
    }
    layer.appendChild(burst);
    setTimeout(()=>burst.remove(),1700);
  }

  function stopCelebration(){
    clearTimeout(celebrationTimer);
    clearInterval(countdownTimer);
    clearInterval(confettiTimer);
    celebrationTimer=countdownTimer=confettiTimer=null;
    const root=document.querySelector('#roundChampion');
    if(root) root.classList.remove('show');
  }

  function startCelebration(e){
    if(!e?.team || !TEAM[e.team]) return;
    stopCelebration();

    const team=TEAM[e.team];
    const root=ensureCelebration();
    const score=Number(latestState?.teams?.[e.team]?.score||0);
    const wins=Number(e.wins ?? latestState?.teams?.[e.team]?.wins ?? 0);

    root.style.setProperty('--ca',team.a);
    root.style.setProperty('--cb',team.b);
    root.innerHTML=`
      <div class="champion-bg"></div>
      <div class="champion-rays"></div>
      <div class="champion-confetti"></div>
      <div class="champion-fireworks"></div>
      <div class="champion-stage">
        <div class="champion-kicker">🏆 TUR ŞAMPİYONU 🏆</div>
        <div class="champion-trophy">🏆</div>
        <div class="champion-name">${team.name}</div>
        <div class="champion-kit-wrap"><div class="kit-shirt kit-${e.team}"></div></div>
        <div class="champion-score">${new Intl.NumberFormat('tr-TR').format(score)} PUAN</div>
        <div class="champion-win-count">TOPLAM <b>${wins}</b> TUR GALİBİYETİ</div>
        <div class="champion-message">TARAFTARLAR ZİRVEYİ ALDI!</div>
        <div class="champion-next">Yeni tur <b id="championCountdown">35</b> saniye sonra</div>
      </div>`;

    root.classList.add('show');
    confettiBatch(root,80);
    firework(root); firework(root); firework(root);
    confettiTimer=setInterval(()=>{
      confettiBatch(root,28);
      if(Math.random()>.35) firework(root);
    },1100);

    const started=Date.now();
    countdownTimer=setInterval(()=>{
      const left=Math.max(0,Math.ceil((CELEBRATION_MS-(Date.now()-started))/1000));
      const el=document.querySelector('#championCountdown');
      if(el) el.textContent=String(left);
    },250);

    celebrationTimer=setTimeout(stopCelebration,CELEBRATION_MS);
  }

  function onRoundEvent(e){
    if(e?.type!=='round_end') return;
    if(e.team){
      if(latestState?.teams?.[e.team] && e.wins!=null){
        latestState.teams[e.team].wins=Number(e.wins);
        renderWins(latestState);
      }
      startCelebration(e);
    }
  }

  ensureWinsUi();
  try{ if(typeof state!=='undefined') renderWins(state); }catch{}

  if(typeof socket!=='undefined' && socket){
    socket.on('state',renderWins);
    socket.on('gameEvent',onRoundEvent);
  }

  // Socket sonradan oluşursa kısa süre kontrol et.
  let tries=0;
  const wait=setInterval(()=>{
    tries++;
    if(typeof socket!=='undefined' && socket){
      clearInterval(wait);
      socket.on('state',renderWins);
      socket.on('gameEvent',onRoundEvent);
    }else if(tries>20){
      clearInterval(wait);
    }
  },250);
})();
