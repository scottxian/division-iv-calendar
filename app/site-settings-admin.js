/* Division IV administrator website settings and inspector calendar sync overview. */
(()=>{
 const e=id=>document.getElementById(id);
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-site-settings';
 const settingNames=['website_site_url','website_event_request_url','website_inspector_desk_url',
  'website_grand_lodge_url','website_calendar_fallback_url','calendar_id','calendar_timezone'];
 const groups=[['division','Division'],['lodges','Lodges'],['calendar','Calendar']];
 let saved=null;
 function message(msg,bad=false){
  const n=e('website-settings-message');if(!n)return;
  n.textContent=msg;n.classList.toggle('website-settings-error',bad);
 }
 async function request(action,body){
  const headers={};
  if(action!=='public'){
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error('Administrator sign-in required');
   headers.Authorization='Bearer '+session.access_token;
   headers.apikey=KEY;
  }
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await fetch(endpoint+'?action='+encodeURIComponent(action),{
   method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const result=await res.json().catch(()=>({error:'Invalid website settings response'}));
  if(!res.ok||result.error)throw Error(result.error||'Website settings request failed');
  return result.settings;
 }
 const destinations=[
  ['','Custom website path or HTTPS URL','Enter /calendar/, /events/, or a complete HTTPS URL.'],
  ['/#about','About Division IV','About section on the homepage'],
  ['/#home','Homepage','Home section of the website'],
  ['/lodges/','Lodge Directory','Public lodge directory'],
  ['/calendar/','Public Calendar','Live embedded public calendar'],
  ['@event_requests','Saved: Event Submission Link','Automatically uses the calendar submission URL configured above'],
  ['@grand_lodge','Saved: Grand Lodge Finder','Uses the official Grand Lodge directory address above'],
  ['@calendar_fallback','Saved: Backup Calendar','Uses the backup public calendar URL above'],
  ['@site_home','Saved: Website Homepage','Uses the website URL above']
 ];
 const destinationMap=new Map(destinations.map(([value,label,description])=>[value,description]));
 function previewURL(value){
  const form=e('website-settings-form');
  const field=name=>String(form?.elements[name]?.value||'').trim();
  const savedAliases={
   '@event_requests':field('website_event_request_url'),
   '@inspector_desk':field('website_inspector_desk_url'),
   '@grand_lodge':field('website_grand_lodge_url'),
   '@calendar_fallback':field('website_calendar_fallback_url'),
   '@site_home':field('website_site_url')
  };
  const raw=Object.hasOwn(savedAliases,value)?savedAliases[value]:value;
  if(!raw)return '';
  try{
   const site=field('website_site_url');
   const url=new URL(raw,site.replace(/\/+$/,'')+'/');
   return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';
  }catch{return ''}
 }
 function navRow(item){
  const box=document.createElement('div');box.className='website-menu-row';
  const groupLabel=document.createElement('label');groupLabel.className='website-menu-field';
  groupLabel.append(document.createTextNode('Top dropdown'));
  const group=document.createElement('select');group.className='website-menu-group';
  group.setAttribute('aria-label','Top dropdown');
  for(const [key,label] of groups)group.add(new Option(label,key));
  group.value=item.group||'division';groupLabel.append(group);
  const titleLabel=document.createElement('label');titleLabel.className='website-menu-field';
  titleLabel.append(document.createTextNode('Text visitors see'));
  const title=document.createElement('input');title.type='text';title.className='website-menu-label';
  title.maxLength=65;title.required=true;title.placeholder='Example: View Calendar';
  title.value=item.label||'';title.setAttribute('aria-label','Menu link label');
  titleLabel.append(title);
  const destination=document.createElement('div');destination.className='website-menu-target';
  const destTitle=document.createElement('label');destTitle.textContent='Where this link goes';
  const choices=document.createElement('select');choices.className='website-menu-preset';
  choices.setAttribute('aria-label','Choose link destination');
  for(const [value,label] of destinations)choices.add(new Option(label,value));
  const href=document.createElement('input');href.type='text';href.className='website-menu-href';
  href.value=item.href||'';href.maxLength=1000;href.placeholder='/calendar/ or https://...';
  href.setAttribute('aria-label','Menu link destination');
  choices.value=href.value!==''&&destinationMap.has(href.value)?href.value:'';
  const help=document.createElement('small');help.className='website-menu-destination-hint';
  const preview=document.createElement('a');preview.className='secondary website-menu-preview';
  preview.target='_blank';preview.rel='noopener noreferrer';preview.textContent='Preview ↗';
  preview.setAttribute('aria-label','Preview destination for this menu link');
  const refresh=()=>{
   const url=previewURL(href.value.trim());
   if(url){preview.href=url;preview.removeAttribute('aria-disabled');preview.title=url;}
   else{preview.removeAttribute('href');preview.setAttribute('aria-disabled','true');preview.title='Enter a valid destination';}
  };
  const showDest=()=>{
   const v=choices.value;
   if(v){href.value=v;href.classList.add('hidden');help.textContent=destinationMap.get(v);}
   else{href.classList.remove('hidden');help.textContent='For custom links, type a path (such as /calendar/) or a complete HTTPS URL.';}
   refresh();
  };
  choices.addEventListener('change',()=>{
   if(!choices.value)href.value='';
   showDest();
   if(!choices.value)href.focus();
  });
  href.addEventListener('input',refresh);
  title.addEventListener('input',()=>preview.setAttribute('aria-label','Preview destination for '+(title.value||'this menu link')));
  destination.append(destTitle,choices,href,help);
  const controlWrap=document.createElement('div');controlWrap.className='website-menu-buttons';
  const header=document.createElement('span');header.className='website-menu-field-title';
  header.textContent='Order & preview';
  const controls=document.createElement('div');controls.className='website-menu-actions';
  for(const [text,action] of [['↑','up'],['↓','down'],['×','remove']]){
   const button=document.createElement('button');button.type='button';button.className='secondary';
   button.textContent=text;button.title=action==='up'?'Move up':action==='down'?'Move down':'Remove menu link';
   button.setAttribute('aria-label',button.title);
   button.onclick=()=>{
    const parent=e('website-menu-links');
    if(action==='remove'){
     if(parent.children.length===1){message('Keep at least one menu link.',true);return;}
     box.remove();
    }else if(action==='up'&&box.previousElementSibling)parent.insertBefore(box,box.previousElementSibling);
    else if(action==='down'&&box.nextElementSibling)parent.insertBefore(box.nextElementSibling,box);
   };
   controls.append(button);
  }
  controls.append(preview);controlWrap.append(header,controls);
  box.append(groupLabel,titleLabel,destination,controlWrap);
  showDest();
  box.addEventListener('website-preview-refresh',refresh);
  return box;
 }
 function showNavigation(items){
  const root=e('website-menu-links');root.replaceChildren();
  (items||[]).forEach(item=>root.append(navRow(item)));
 }
 function currentNavigation(){
  return [...e('website-menu-links').children].map(row=>({
   group:row.querySelector('.website-menu-group').value,
   label:row.querySelector('.website-menu-label').value.trim(),
   href:row.querySelector('.website-menu-href').value.trim()
  }));
 }
 function readForm(settings){
  if(!e('website-settings-form'))return;
  const form=e('website-settings-form');
  for(const key of settingNames)form.elements[key].value=settings[key]??'';
  showNavigation((settings.website_navigation||[]).filter(item=>item.group!=='inspectors'));
  saved=structuredClone({...settings,website_navigation:(settings.website_navigation||[]).filter(item=>item.group!=='inspectors')});
  message('Loaded current website settings.');
 }
 async function loadWebsiteSettings(){
  const form=e('website-settings-form');if(!form)return;
  if(state.staff?.role!=='admin'){message('Administrator access required.',true);return;}
  message('Loading website settings…');
  try{readForm(await request('admin'));}
  catch(ex){message(ex.message,true);}
 }
 window.loadWebsiteSettings=loadWebsiteSettings;
 const form=e('website-settings-form');
 if(form){
  e('website-menu-add').onclick=()=>{
   const row=navRow({group:'division',label:'',href:''});
   e('website-menu-links').append(row);
   row.querySelector('.website-menu-label').focus();
  };
  for(const key of settingNames)form.elements[key].addEventListener('input',()=>{
   e('website-menu-links').querySelectorAll('.website-menu-row').forEach(row=>
    row.dispatchEvent(new Event('website-preview-refresh')));
  });
  e('website-menu-reset').onclick=()=>{if(saved)showNavigation(saved.website_navigation);};
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();
   if(state.staff?.role!=='admin'){message('Only administrators can save website settings.',true);return;}
   const button=e('website-settings-save');button.disabled=true;
   try{
    const changes={};
    for(const key of settingNames)changes[key]=form.elements[key].value.trim();
    changes.website_navigation=currentNavigation();
    if(changes.calendar_id!==saved?.calendar_id){
     const approved=await divisionQuestion(
      'Changing the Google Calendar ID affects future event publishing. Previously published events may need resynchronization. Change the calendar destination?',
      {title:'Change publishing calendar?',confirmLabel:'Change Calendar ID',danger:true});
     if(!approved)return;
    }
    message('Saving website settings…');
    const result=await request('save',{settings:changes,
      ...(changes.calendar_id!==saved?.calendar_id?{confirm_calendar_change:'CHANGE CALENDAR'}:{})});
    readForm(result);
    message('Saved. Website pages will use these settings when they are loaded or refreshed.');
    if(typeof toast==='function')toast('Website settings saved');
    loadWebsitePreview();
   }catch(ex){message(ex.message,true);if(typeof toast==='function')toast(ex.message,true);}
   finally{button.disabled=false;}
  });
 }
 async function loadWebsitePreview(){
  if(!e('preview-site-home'))return;
  try{
   const s=await request('public');
   const home=new URL(s.website_site_url);
   if(home.protocol!=='https:')return;
   const base=home.href.replace(/\/+$/,'');
   e('preview-site-home').href=base+'/';
   e('preview-site-calendar').href=base+'/calendar/';
   e('preview-site-lodges').href=base+'/lodges/';
  }catch(ex){console.warn('Public website preview links are using their saved defaults:',ex);}
 }
 window.loadWebsitePreview=loadWebsitePreview;
 const sync=e('calendar-sync-summary'),issues=e('calendar-sync-issues');
 const make=(tag,txt,className)=>{
  const n=document.createElement(tag);n.textContent=txt;if(className)n.className=className;return n;
 };
 async function loadCalendarSync(){
  if(!sync||!issues)return;
  sync.textContent='Loading Google Calendar delivery records…';
  issues.replaceChildren();
  try{
   const data=await api('calendar-sync-overview'),counts=data.counts||{};
   sync.replaceChildren();
   for(const [key,label] of [['synced','Synchronized'],['queued','In queue / retrying'],
    ['failed','Delivery failed'],['unverified','Not verified']]){
    const card=make('div','','dashboard-stat website-sync-count');
    card.append(make('strong',String(counts[key]||0),'dashboard-number'),make('span',label));
    sync.append(card);
   }
   e('calendar-sync-checked').textContent='Last successful Google Calendar delivery: '+
    (data.last_successful_at?new Date(data.last_successful_at).toLocaleString():'Not yet recorded')+
    ' · Checked '+new Date(data.checked_at||Date.now()).toLocaleString();
   if(!data.action_needed?.length){
    issues.append(make('p','No pending, failed, or unverified event deliveries.','muted'));return;
   }
   for(const x of data.action_needed){
    const row=make('button','','dashboard-entry');
    row.type='button';
    const status=x.state==='failed'?'Failed':x.state==='queued'?'Queued / processing':'Not verified';
    row.append(make('strong',x.title||x.code||'Calendar event'),
     make('small',status+' · '+(x.code||''),'muted'));
    if(x.error)row.append(make('span',x.error,'dashboard-error-text'));
    row.onclick=async()=>{await activateInspectorTab('events');await eventDetail(x.id);};
    issues.append(row);
   }
  }catch(ex){
   sync.textContent='Unable to check Google Calendar status: '+ex.message;
  }
 }
 window.loadCalendarSync=loadCalendarSync;
 if(e('calendar-sync-refresh'))e('calendar-sync-refresh').onclick=loadCalendarSync;
})();