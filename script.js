/* Division IV public-site navigation, settings and live calendar. */
(()=>{
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-site-settings?action=public';
 const baseCalendar='dd8692800e837b4dd367c15738ed95f5fd198e95a30e9d7f1afb98ac3aa3fea5@group.calendar.google.com';
 const base={
  calendar_id:baseCalendar,calendar_timezone:'America/Los_Angeles',
  website_event_request_url:'https://divisionivmasons.org/events/',
  website_inspector_desk_url:'https://divisionivmasons.org/inspectors/',
  website_grand_lodge_url:'https://member.freemason.org/public_lodges/search',
  website_calendar_fallback_url:'https://divisionivmasons.org/calendar/',
  website_site_url:'https://divisionivmasons.org',
  website_navigation:[
   {group:'division',label:'About Division IV',href:'index.html#about'},
   {group:'division',label:'Contact',href:'index.html#contact'},
   {group:'lodges',label:'Lodge Directory',href:'lodges.html'},
   {group:'lodges',label:'Grand Lodge Finder ↗',href:'@grand_lodge'},
   {group:'calendar',label:'View Division IV Calendar',href:'calendar.html'},
   {group:'calendar',label:'Submit / Change Event ↗',href:'@event_requests'}
  ]
 };
 const menu=document.getElementById('menu-toggle');
 const nav=document.getElementById('main-nav');
 const groups=[['division','Division'],['lodges','Lodges'],['calendar','Calendar']];
 const small=window.matchMedia('(max-width:750px)');
 const desktop=()=>window.matchMedia('(min-width:1051px)').matches;
 let userMode=null,config=base,activeGroups=[];
 const validHttps=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
 const resolve=(value,s,group)=>{
  // Normalize legacy paths from previously saved website settings.
  if(value==='@event_requests')return '/events/';
  if(value==='@inspector_desk')return '/inspectors/';
  if(value==='@calendar_fallback')return '/calendar/';
  if(value==='@site_home')return '/';
  if(value==='@grand_lodge')return validHttps(s.website_grand_lodge_url);
  if(value==='index.html')return '/';
  if(typeof value==='string'&&value.startsWith('index.html#'))return '/'+value.slice('index.html'.length);
  if(value==='calendar.html')return '/calendar/';
  if(value==='lodges.html')return '/lodges/';
  if(value==='https://calendar.divisionivmasons.org/')return group==='inspectors'?'/inspectors/':'/events/';
  if(value==='https://calendar.divisionivmasons.org/calendar.html')return '/calendar/';
  if(typeof value==='string'&&value.startsWith('https://headless-odfdmxtmddz-scottyjchristian-1410.wix-site-host.com'))return value.endsWith('/lodges.html')?'/lodges/':value.endsWith('/calendar.html')?'/calendar/':'/';
  if(typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//'))return value;
  return validHttps(value);
 };
 function closeAll(){
  activeGroups.forEach(group=>{
   group.classList.remove('expanded');
   group.querySelector('.nav-trigger')?.setAttribute('aria-expanded','false');
  });
 }
 function setExpanded(group,isOpen){
  group.classList.toggle('expanded',isOpen);
  group.querySelector('.nav-trigger')?.setAttribute('aria-expanded',String(isOpen));
 }
 function closeMenu(){
  if(!nav||!menu)return;
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded','false');
  menu.setAttribute('aria-label','Open menu');
  closeAll();
 }
 function link(name,href,external){
  const a=document.createElement('a');a.textContent=name;a.href=href;
  if(external){a.target='_blank';a.rel='noopener noreferrer';}
  return a;
 }
 function renderNavigation(s){
  if(!nav||!menu)return;
  const onLodges=location.pathname.startsWith('/lodges/');
  const onCalendar=location.pathname.startsWith('/calendar/');
  const onHome=!onCalendar&&!onLodges;
  const items=Array.isArray(s.website_navigation)&&s.website_navigation.length?s.website_navigation:base.website_navigation;
  nav.replaceChildren();
  const home=link('Home','/#home',false);
  home.className='nav-home';
  if(onHome)home.setAttribute('aria-current','page');
  nav.append(home);
  // Inspector access is always a single top-level link, never a public resources dropdown.
  for(const [id,title] of groups){
   const wrapper=document.createElement('div');wrapper.className='nav-group';
   const button=document.createElement('button');button.className='nav-trigger';button.type='button';
   button.textContent=title+' ';
   const chevron=document.createElement('span');chevron.className='nav-chevron';
   chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');button.append(chevron);
   button.setAttribute('aria-controls','nav-'+id);button.setAttribute('aria-expanded','false');
   const submenu=document.createElement('div');submenu.className='nav-submenu';submenu.id='nav-'+id;
   for(const item of items.filter(x=>x&&x.group===id)){
    const dest=resolve(item.href,s,id);
    if(!dest||typeof item.label!=='string'||!item.label.trim())continue;
    const a=link(item.label,dest,dest.startsWith('https://'));
    if((id==='lodges'&&dest==='/lodges/'&&onLodges)||
       (id==='calendar'&&dest==='/calendar/'&&onCalendar))a.setAttribute('aria-current','page');
    a.addEventListener('click',closeMenu);
    submenu.append(a);
   }
   if(!submenu.children.length)continue;
   wrapper.append(button,submenu);nav.append(wrapper);
   button.addEventListener('click',ev=>{
    ev.preventDefault();ev.stopPropagation();
    const opening=!wrapper.classList.contains('expanded');
    closeAll();setExpanded(wrapper,opening);
   });
   button.addEventListener('keydown',ev=>{
    if(ev.key!=='ArrowDown'&&ev.key!=='ArrowUp')return;
    ev.preventDefault();closeAll();setExpanded(wrapper,true);
    const links=submenu.querySelectorAll('a');const a=ev.key==='ArrowDown'?links[0]:links[links.length-1];
    a?.focus();
   });
   wrapper.addEventListener('mouseenter',()=>{
    if(desktop()&&window.matchMedia('(hover:hover)').matches){
     closeAll();setExpanded(wrapper,true);
    }
   });
   wrapper.addEventListener('mouseleave',()=>{if(desktop())setExpanded(wrapper,false)});
   wrapper.addEventListener('focusout',ev=>{
    if(!wrapper.contains(ev.relatedTarget))setExpanded(wrapper,false);
   });
  }
  const desk=link('Inspector Login ↗','/inspectors/',false);
  desk.className='nav-inspector-login';desk.addEventListener('click',closeMenu);
  nav.append(desk);
  activeGroups=[...nav.querySelectorAll('.nav-group')];
 }
 function applyLinkSettings(s){
  document.querySelectorAll('a[href]').forEach(a=>{
   const href=a.getAttribute('href');
   if(href==='https://calendar.divisionivmasons.org/'){
    const isInspector=!!a.closest('#inspectors')||/inspector|sign.?in|desk/i.test(a.textContent);
    const dest=validHttps(isInspector?s.website_inspector_desk_url:s.website_event_request_url);
    if(dest)a.href=dest;
   }else if(href==='https://member.freemason.org/public_lodges/search'){
    const dest=validHttps(s.website_grand_lodge_url);if(dest)a.href=dest;
   }else if(href==='https://calendar.divisionivmasons.org/calendar.html'){
    const dest=validHttps(s.website_calendar_fallback_url);if(dest)a.href=dest;
   }
  });
 }
 function calendarUrl(s,mode){
  const url=new URL('https://calendar.google.com/calendar/embed');
  url.searchParams.set('src',s.calendar_id||base.calendar_id);
  url.searchParams.set('ctz',s.calendar_timezone||base.calendar_timezone);
  url.searchParams.set('mode',mode);
  url.searchParams.set('showTitle','0');url.searchParams.set('showCalendars','0');
  return url.href;
 }
 function applyCalendar(s){
  const frame=document.querySelector('.calendar-embed iframe');
  if(!frame)return;
  const selected=userMode||(small.matches?'AGENDA':'MONTH');
  const url=calendarUrl(s,selected);
  if(frame.getAttribute('src')!==url)frame.setAttribute('src',url);
  document.querySelectorAll('[data-calendar-mode]').forEach(button=>{
   const chosen=button.dataset.calendarMode===selected;
   button.classList.toggle('is-active',chosen);
   button.setAttribute('aria-pressed',String(chosen));
  });
  const id=encodeURIComponent(s.calendar_id||base.calendar_id);
  const google='https://calendar.google.com/calendar/u/0/r?cid='+id;
  const feed='https://calendar.google.com/calendar/ical/'+id+'/public/basic.ics';
  document.querySelectorAll('a[href]').forEach(a=>{
   const v=a.getAttribute('href')||'';
   if(v.startsWith('https://calendar.google.com/calendar/u/0/r?cid='))a.href=google;
   else if(v.startsWith('webcal://calendar.google.com/calendar/ical/'))a.href='webcal://calendar.google.com/calendar/ical/'+id+'/public/basic.ics';
   else if(v.startsWith('https://calendar.google.com/calendar/ical/'))a.href=feed;
  });
 }
 function render(s){
  config={...base,...s};
  renderNavigation(config);
  applyLinkSettings(config);
  applyCalendar(config);
 }
 if(menu&&nav){
  menu.addEventListener('click',()=>{
   const isOpen=!nav.classList.contains('open');
   closeAll();nav.classList.toggle('open',isOpen);
   menu.setAttribute('aria-expanded',String(isOpen));
   menu.setAttribute('aria-label',isOpen?'Close menu':'Open menu');
  });
  document.addEventListener('click',ev=>{
   if(!nav.contains(ev.target)&&!menu.contains(ev.target))closeMenu();
  });
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeMenu();});
  window.addEventListener('resize',()=>{
   if(desktop())closeMenu();
   closeAll();
  });
 }
 document.querySelectorAll('[data-calendar-mode]').forEach(button=>{
  button.addEventListener('click',()=>{
   userMode=button.dataset.calendarMode;
   applyCalendar(config);
  });
 });
 small.addEventListener?.('change',()=>{userMode=null;applyCalendar(config);});
 render(base);
 fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json'}})
  .then(res=>{if(!res.ok)throw Error('Site settings service unavailable');return res.json()})
  .then(data=>{if(data&&data.settings)render(data.settings)})
  .catch(err=>{console.warn('Using saved Division IV website navigation and calendar links',err);});
})();