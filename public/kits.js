(()=>{
  const META={
    gs:{name:'Galatasaray',brand:'PUMA',badge:'GS',sponsor:'PASİFİK'},
    fb:{name:'Fenerbahçe',brand:'adidas',badge:'FB',sponsor:'OTOKOÇ'},
    bjk:{name:'Beşiktaş',brand:'NIKE',badge:'BJK',sponsor:'BEKO'},
    ts:{name:'Trabzonspor',brand:'JOMA',badge:'TS',sponsor:'PAPARA'},
    amed:{name:'Amedspor',brand:'NIKE',badge:'AMED',sponsor:'AMED'},
    bursa:{name:'Bursaspor',brand:'NB',badge:'BRS',sponsor:'İYİ FİNANS'},
    ksp:{name:'Kasımpaşa',brand:'adidas',badge:'KŞP',sponsor:'AKSA'},
    kocaeli:{name:'Kocaelispor',brand:'adidas',badge:'KOC',sponsor:'SAFIPORT'}
  };

  function buildKits(){
    document.querySelectorAll('.team').forEach(card=>{
      const id=card.dataset.id;
      const m=META[id];
      if(!m || card.querySelector('.kit-wrap')) return;
      const wrap=document.createElement('div');
      wrap.className='kit-wrap';
      wrap.title=`${m.name} 2026-27 iç saha forma tasarımı`;
      wrap.innerHTML=`<div class="kit-shirt kit-${id}"><span class="kit-brand">${m.brand}</span><span class="kit-badge">${m.badge}</span><span class="kit-sponsor">${m.sponsor}</span></div>`;
      card.appendChild(wrap);
      const source=document.createElement('div');
      source.className='kit-source';
      source.textContent='26/27 İÇ SAHA';
      card.appendChild(source);
    });
  }

  function syncLeaderKit(){
    const leaderName=document.querySelector('#leaderName')?.textContent?.trim();
    const body=document.querySelector('.leader-avatar .body');
    if(!body) return;
    body.className='body leader-kit';
    const entry=Object.entries(META).find(([,m])=>m.name===leaderName);
    if(entry) body.classList.add(`kit-${entry[0]}`);
  }

  const start=()=>{
    buildKits();
    syncLeaderKit();
    const teams=document.querySelector('#teams');
    if(teams) new MutationObserver(buildKits).observe(teams,{childList:true,subtree:true});
    const leader=document.querySelector('#leaderName');
    if(leader) new MutationObserver(syncLeaderKit).observe(leader,{childList:true,characterData:true,subtree:true});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
