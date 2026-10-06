(()=>{
  const SHORT={gs:'GS',fb:'FB',bjk:'BJK',ts:'TS',amed:'AMED',bursa:'BURSA',ksp:'KŞP',kocaeli:'KÖRFEZ'};
  const NAME={gs:'Galatasaray',fb:'Fenerbahçe',bjk:'Beşiktaş',ts:'Trabzonspor',amed:'Amedspor',bursa:'Bursaspor',ksp:'Kasımpaşa',kocaeli:'Kocaelispor'};

  function ensureWinsBoard(){
    if(document.querySelector('#winsBoard')) return;
    const leader=document.querySelector('.leader-panel');
    if(!leader) return;
    const board=document.createElement('section');
    board.id='winsBoard';
    board.className='wins-board';
    board.innerHTML='<span class="wins-title">🏆 GALİBİYETLER</span><div id="winsList"></div>';
    leader.insertAdjacentElement('afterend',board);
  }

  function ensureWinBadges(){
    document.querySelectorAll('.team').forEach(card=>{
      if(card.querySelector('.wins-badge')) return;
      const badge=document.createElement('div');
      badge.className='wins-badge';
      badge.textContent='🏆 0';
      card.appendChild(badge);
    });
  }

  function syncWins(){
    ensureWinsBoard();
    ensureWinBadges();
    const teams=state?.teams||{};
    Object.entries(teams).forEach(([id,t])=>{
      const badge=document.querySelector(`.team[data-id="${id}"] .wins-badge`);
      const next=`🏆 ${Number(t?.wins||0)}`;
      if(badge && badge.textContent!==next) badge.textContent=next;
    });
    const sorted=Object.entries(teams).sort((a,b)=>(b[1]?.wins||0)-(a[1]?.wins||0) || (b[1]?.score||0)-(a[1]?.score||0));
    const list=document.querySelector('#winsList');
    const html=sorted.map(([id,t])=>`<span class="win-pill">${SHORT[id]||id} 🏆${Number(t?.wins||0)}</span>`).join('');
    if(list && list.innerHTML!==html) list.innerHTML=html;
  }

  function tierFor(value){
    if(value>=20000) return {n:9,label:'🌠 EFSANE UNIVERSE ŞOVU',count:70,icons:['🌠','🏆','✨','⚡']};
    if(value>=5000) return {n:8,label:'🚀 DEV STADYUM ŞOVU',count:58,icons:['🚀','🎆','🏆','⚡']};
    if(value>=1000) return {n:7,label:'🌌 MEGA HEDİYE',count:48,icons:['🌌','🎆','💎','🏆']};
    if(value>=500) return {n:6,label:'👑 EFSANE HEDİYE',count:40,icons:['👑','💎','✨','🏆']};
    if(value>=200) return {n:5,label:'🔥 BÜYÜK HEDİYE',count:34,icons:['🔥','💥','⚽','🎉']};
    if(value>=100) return {n:4,label:'🏆 GÜÇLÜ HEDİYE',count:28,icons:['🏆','⚽','🎊','✨']};
    if(value>=50) return {n:3,label:'⚽ ORTA HEDİYE',count:22,icons:['⚽','🎊','✨']};
    if(value>=20) return {n:2,label:'💥 GOL DESTEĞİ',count:16,icons:['💥','⚽','✨']};
    if(value>=5) return {n:1,label:'✨ MİNİ ŞOV',count:12,icons:['✨','⚽']};
    return {n:0,label:'🙌 DESTEK',count:8,icons:['✨','🙌']};
  }

  function iconForGift(name,tier){
    const n=String(name||'').toLocaleLowerCase('tr-TR');
    if(n.includes('swan')||n.includes('kuğu')||n.includes('kugu')) return '🦢';
    if(n.includes('rose')||n.includes('gül')||n.includes('gul')||n.includes('rosa')) return '🌹';
    if(n.includes('heart')||n.includes('kalp')) return '❤️';
    if(n.includes('galaxy')||n.includes('galaksi')) return '🌌';
    if(n.includes('lion')||n.includes('aslan')) return '🦁';
    if(n.includes('universe')||n.includes('evren')) return '🌠';
    if(n.includes('rocket')||n.includes('roket')) return '🚀';
    if(n.includes('firework')||n.includes('havai')) return '🎆';
    if(n.includes('money')||n.includes('para')) return '💸';
    return tier.icons[0];
  }

  function addParticle(host,icon,tier){
    const p=document.createElement('span');
    p.className='gift-particle';
    p.textContent=icon;
    const angle=Math.random()*Math.PI*2;
    const power=(100+Math.random()*(tier.n>=6?390:260));
    p.style.setProperty('--gx',`${Math.cos(angle)*power}px`);
    p.style.setProperty('--gy',`${Math.sin(angle)*power-(tier.n>=4?80:30)}px`);
    p.style.setProperty('--gr',`${Math.round(Math.random()*900-450)}deg`);
    p.style.setProperty('--gs',String(.7+Math.random()*(tier.n>=6?1.7:1.05)));
    p.style.setProperty('--dur',`${1.25+Math.random()*1.35}s`);
    p.style.left=`${25+Math.random()*50}%`;
    p.style.top=`${42+Math.random()*28}%`;
    host.appendChild(p);
  }

  function giftSpectacle(e){
    const value=Math.max(1,Number(e?.diamondCount||0));
    if(!value) return;
    const tier=tierFor(value);
    const fx=document.querySelector('#fx');
    const stage=document.querySelector('#stage');
    if(!fx||!stage) return;

    const host=document.createElement('div');
    host.className='gift-spectacle';
    const icon=iconForGift(e.giftName,tier);
    const teamName=NAME[e.team]||'Takım';
    const giver=e.user?`@${e.user}`:'Bir taraftar';
    const card=document.createElement('div');
    card.className='gift-card';
    card.style.setProperty('--giftGlow',tier.n>=6?'#ffd75e99':'#8dc7ff77');
    card.innerHTML=`<div class="gift-kicker">${tier.label}</div><span class="gift-icon">${icon}</span><div class="gift-name">${e.giftName||'TikTok Hediyesi'}</div><div class="gift-meta">${giver} → ${teamName}</div><div class="gift-value">${new Intl.NumberFormat('tr-TR').format(value)} JETON</div>`;
    host.appendChild(card);

    if(tier.n>=3){
      const ring=document.createElement('div'); ring.className='gift-ring'; host.appendChild(ring);
    }
    if(tier.n>=6){
      const rays=document.createElement('div'); rays.className='gift-rays'; host.appendChild(rays);
    }

    for(let i=0;i<tier.count;i++){
      const particleIcon=(i<Math.max(5,Math.floor(tier.count*.28)))?icon:tier.icons[i%tier.icons.length];
      addParticle(host,particleIcon,tier);
    }

    fx.appendChild(host);
    stage.classList.add(`gift-tier-${tier.n}`);
    if(tier.n>=5){
      stage.classList.add('shake');
      setTimeout(()=>stage.classList.remove('shake'),tier.n>=7?900:600);
    }
    setTimeout(()=>{
      host.remove();
      stage.classList.remove(`gift-tier-${tier.n}`);
    },2900);
  }

  function ensureExtraControls(){
    const panel=document.querySelector('#panel');
    if(!panel || document.querySelector('#resetWinsBtn')) return;
    const roundRow=document.querySelector('#resetBtn')?.closest('.row');
    if(roundRow){
      const row=document.createElement('div');
      row.className='row';
      row.style.marginTop='8px';
      row.innerHTML='<button id="resetWinsBtn" class="danger-soft" style="flex:1">🏆 Galibiyetleri sıfırla</button><button id="finishRoundBtn" style="flex:1">⏱️ Turu bitir (test)</button>';
      roundRow.insertAdjacentElement('afterend',row);
    }

    const grid=panel.querySelector('.test-grid');
    if(grid){
      const extras=[
        [99,'99 🪙 Orta'],[150,'150 🪙 Güçlü'],[300,'300 🪙 Büyük'],[699,'699 🪙 Kuğu seviyesi'],
        [1000,'1.000 🪙 Mega'],[5000,'5.000 🪙 Dev'],[30000,'30.000 🪙 Efsane']
      ];
      extras.forEach(([v,label])=>{
        const b=document.createElement('button');
        b.dataset.extraGift=String(v);
        b.textContent=label;
        grid.appendChild(b);
      });
      const guide=document.createElement('div');
      guide.className='value-guide';
      guide.style.gridColumn='1 / -1';
      guide.innerHTML='<b>Hediye efekt kademeleri</b><br>1-4 destek • 5-19 mini • 20-49 gol • 50-99 orta • 100-199 güçlü • 200-499 büyük • 500-999 efsane • 1.000+ mega • 5.000+ dev • 20.000+ universe';
      grid.appendChild(guide);
    }

    document.querySelector('#resetWinsBtn')?.addEventListener('click',()=>{
      if(socket) socket.emit('resetWins');
      else {
        Object.values(state.teams||{}).forEach(t=>t.wins=0);
        syncWins();
        toast('🏆 Galibiyet tablosu sıfırlandı');
      }
    });

    document.querySelector('#finishRoundBtn')?.addEventListener('click',()=>{
      if(socket) socket.emit('finishRound');
      else {
        const r=Object.entries(state.teams||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0));
        if(r[0]){
          r[0][1].wins=(r[0][1].wins||0)+1;
          gameEvent({type:'round_end',team:r[0][0],title:`🏆 ${NAME[r[0][0]]} TURU KAZANDI!`});
          syncWins();
        }
      }
    });

    document.querySelectorAll('[data-extra-gift]').forEach(b=>b.addEventListener('click',()=>{
      const team=document.querySelector('#testTeam')?.value||'gs';
      const user=document.querySelector('#testUser')?.value||'deneme';
      const diamonds=Number(b.dataset.extraGift||1);
      const giftName=diamonds===699?'Kuğu / Swan':`Test Hediyesi ${diamonds}`;
      if(socket) socket.emit('simulate',{kind:'gift',team,user,diamonds,giftName});
      else localSim('gift',{team,diamonds});
    }));
  }

  function setupPanelBehavior(){
    const open=document.querySelector('#settingsBtn');
    const close=document.querySelector('#closePanel');
    open?.addEventListener('click',()=>document.body.classList.add('panel-open'));
    close?.addEventListener('click',()=>document.body.classList.remove('panel-open'));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        document.querySelector('#panel')?.classList.add('hidden');
        document.body.classList.remove('panel-open');
      }
    });
  }

  function hookEvents(){
    if(typeof gameEvent!=='function') return;
    const original=gameEvent;
    const enhanced=(e)=>{
      original(e);
      if(Number(e?.diamondCount||0)>0) giftSpectacle(e);
      if(e?.type==='round_end'||e?.type==='wins_reset') setTimeout(syncWins,0);
    };
    if(socket?.off){
      socket.off('gameEvent',original);
      socket.on('gameEvent',enhanced);
    }
    gameEvent=enhanced;
    if(socket?.on) socket.on('state',()=>setTimeout(syncWins,0));
  }

  ensureWinsBoard();
  ensureWinBadges();
  ensureExtraControls();
  setupPanelBehavior();
  hookEvents();
  syncWins();
  const teams=document.querySelector('#teams');
  if(teams) new MutationObserver(()=>{ensureWinBadges();syncWins();}).observe(teams,{childList:true,subtree:false});
})();
