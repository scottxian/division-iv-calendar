(()=>{
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-lodges?action=public';
 const search=document.getElementById('lodge-search');
 const district=document.getElementById('district-filter');
 const clear=document.getElementById('clear-filters');
 const main=document.querySelector('.directory-main');
 const count=document.getElementById('directory-count');
 const empty=document.getElementById('directory-empty');
 const note=document.querySelector('.directory-note');
 if(!search||!district||!main||!count||!empty)return;
 const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let cards=[],groups=[];
 function refreshIndex(){cards=[...document.querySelectorAll('.lodge-card')];groups=[...document.querySelectorAll('.district-group')];}
 function applyFilter(){
  const query=search.value.trim().replace(/\s+/g,' ').toLowerCase();
  const d=district.value;
  let shown=0;
  for(const card of cards){
   const okay=(!query||card.dataset.filter.includes(query))&&(d==='all'||card.dataset.district===d);
   card.hidden=!okay;
   if(okay)shown++;
  }
  for(const section of groups)section.hidden=![...section.querySelectorAll('.lodge-card')].some(card=>!card.hidden);
  count.textContent='Showing '+shown+' of '+cards.length+' lodges';
  empty.hidden=shown>0;
 }
 function card(l){
  const number=h(l.lodge_number),name=h(l.lodge_name);
  const d=h(l.district||''),city=h(l.city||''),state=h(l.state||'CA'),county=h(l.county||'');
  const street=h(l.address_line1||'');
  const day=h(l.meeting_day||'See official listing'),time=h(l.meeting_time||'');
  const notes=h(l.meeting_notes||'Every month');
  const official=/^https:\/\//i.test(l.official_url||'')?String(l.official_url):'';
  const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([l.address_line1,l.city,l.state].filter(Boolean).join(', '));
  const text=[l.lodge_name,'lodge',l.lodge_number,l.district,l.city,l.county,l.meeting_day,l.meeting_time].join(' ').toLowerCase();
  return '<article class="lodge-card" data-filter="'+h(text)+'" data-district="'+d+'">'+
   '<div class="lodge-card-head"><div><span class="lodge-number">LODGE NO. '+number+'</span><h3>'+name+'</h3></div><span class="district-tag">District '+d+'</span></div>'+
   '<div class="lodge-card-body"><p><span class="lodge-icon">⌖</span><span>'+street+'<br><small>'+city+', '+state+(county?' · '+county+' County':'')+'</small></span></p>'+
   '<p><span class="lodge-icon">◷</span><span>'+day+(time?' at '+time:'')+'<br><small>'+notes+'</small></span></p></div>'+
   '<div class="lodge-card-actions">'+(official?'<a href="'+h(official)+'" target="_blank" rel="noopener noreferrer">Official lodge listing ↗</a>':'')+
   '<a href="'+h(map)+'" target="_blank" rel="noopener noreferrer">Directions ↗</a></div></article>';
 }
 function render(lodges){
  const list=lodges.filter(l=>l&&l.active!==false&&l.lodge_name&&l.lodge_number&&l.district);
  if(!list.length)throw Error('Empty lodge directory');
  const by=new Map();
  list.forEach(l=>{const d=String(l.district);if(!by.has(d))by.set(d,[]);by.get(d).push(l);});
  const districts=[...by.keys()].sort((a,b)=>Number(a)-Number(b));
  const currentChoice=district.value;
  district.replaceChildren(new Option('All districts','all'));
  for(const d of districts)district.add(new Option('District '+d,d));
  district.value=districts.includes(currentChoice)?currentChoice:'all';
  const html=districts.map(d=>{
   const members=by.get(d).sort((a,b)=>String(a.lodge_name).localeCompare(String(b.lodge_name)));
   return '<section class="district-group" data-group="'+h(d)+'"><div class="district-heading"><div><p class="kicker">DIVISION IV</p><h2>District '+h(d)+'</h2></div><span>'+members.length+' '+(members.length===1?'lodge':'lodges')+'</span></div><div class="lodge-grid">'+members.map(card).join('')+'</div></section>';
  }).join('');
  const stub=document.createElement('div');
  stub.innerHTML=html;
  document.querySelectorAll('.district-group').forEach(g=>g.remove());
  main.insertBefore(stub,empty);
  if(note)note.textContent='Showing the Division IV lodge records maintained in Supabase by authorized inspectors. Meeting information may change; confirm with your lodge before traveling.';
  refreshIndex();applyFilter();
 }
 search.addEventListener('input',applyFilter);
 district.addEventListener('change',applyFilter);
 clear.addEventListener('click',()=>{search.value='';district.value='all';applyFilter();search.focus();});
 refreshIndex();applyFilter();
 async function load(){
  try{
   const res=await fetch(endpoint,{method:'GET',cache:'no-store',headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('Lodge records unavailable');
   const data=await res.json();
   if(!Array.isArray(data.lodges)||!data.lodges.length)throw Error('No lodge records');
   render(data.lodges);
  }catch(e){
   if(note)note.textContent='Live lodge updates are temporarily unavailable. Showing the last published directory; please verify details with each lodge.';
   console.warn('Using static lodge directory fallback',e);
  }
 }
 load();
})();