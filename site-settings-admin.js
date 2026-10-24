/* Division IV administrator website settings and inspector calendar sync overview. */
(()=>{
 const e=id=>document.getElementById(id);
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-site-settings';
 const settingNames=['website_site_url','website_event_request_url','website_inspector_desk_url',
  'website_grand_lodge_url','website_calendar_fallback_url','calendar_id','calendar_timezone'];
 const groups=[['division','Division'],['lodges','Lodges'],['calendar','Calendar'],['inspectors','Inspectors']];
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
 function navRow(item){
  const box=document.createElement('div');box.className='website-menu-row';
  const group=document.createElement('select');group.className='website-menu-group';
  group.setAttribute('aria-label','Dropdown section');
  for(const [id,label] of groups)group.add(new Option(label,id));
  group.value=item.group||'division';
  const title=document.createElement('input');title.type='text';title.placeholder='Menu label';title.maxLength=65;
  title.setAttribute('aria-label','Menu link label');title.value=item.label||'';
  const href=document.createElement('input');href.type='text';href.placeholder='Destination URL or @saved_link';href.maxLength=1000;
  href.setAttribute('aria-label','Menu link destination');href.value=item.href||'';
  const buttons=document.createElement('div');buttons.className='website-menu-actions';
  for(const [label,action] of [['↑','up'],['↓','down'],['×','remove']]){
   const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;
   b.title=action==='up'?'Move link up':action==='down'?'Move link down':'Remove link';
   b.setAttribute('aria-label',b.title);
   b.onclick=()=>{
    const parent=e('website-menu-links');
    if(action==='remove'){if(parent.children.length<=1){message('Keep at least one menu link.',true);return;}box.remove();}
    else if(action==='up'&&box.previousElementSibling)parent.insertBefore(box,box.previousElementSibling);
    else if(action==='down'&&box.nextElementSibling)parent.insertBefore(box.nextElementSibling,box);
   };
   buttons.append(b);
  }
  box.append(group,title,href,buttons);
  return box;
 }
 function showNavigation(items){
  const box=e('website-menu-links');box.replaceChildren();
  (items||[]).forEach(x=>box.append(navRow(x)));
 }
 function currentNavigation(){
  return [...e('website-menu-links').children].map(row=>({
   group:row.querySelector('select').value,
   label:row.querySelector('input[aria-label="Menu link label"]').value.trim(),
   href:row.querySelector('input[aria-label="Menu link destination"]').value.trim()
  }));
 }
 function readForm(settings){
  if(!e('website-settings-form'))return;
  const form=e('website-settings-form');
  for(const key of settingNames)form.elements[key].value=settings[key]??'';
  showNavigation(settings.website_navigation);
  saved=structuredClone(settings);
  message('Loaded current website settings.');
 }
 async function loadWebsiteSettings(){
  const form=e('website-settings-form');if(!form)return;
  message('Loading website settings…');
  try{readForm(await request('admin'));}
  catch(ex){message(ex.message,true);}
 }
 window.loadWebsiteSettings=loadWebsiteSettings;
 const form=e('website-settings-form');
 if(form){
  e('website-menu-add').onclick=()=>{e('website-menu-links').append(navRow({group:'division',label:'',href:''}));};
  e('website-menu-reset').onclick=()=>{if(saved)showNavigation(saved.website_navigation);};
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();
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
    message('Saved. Wix pages will use these settings when they are loaded or refreshed.');
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
   e('preview-site-calendar').href=base+'/calendar.html';
   e('preview-site-lodges').href=base+'/lodges.html';
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