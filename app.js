/* Dependency-free auth: the login button must not depend on a third-party CDN. */
const ROOT='https://lxvceqshpjnjjlllbpaq.supabase.co';
const KEY='sb_publishable_8wAnbhewmF5a0E2IRUaPhA_swWBgUm_';
const AUTH_STORAGE='division-iv-calendar-session-v1';
const authEvents=new Set();
let currentSession=null;
try{currentSession=JSON.parse(localStorage.getItem(AUTH_STORAGE)||'null')}catch{currentSession=null}
function setSession(v){
 currentSession=v;
 try{if(v)localStorage.setItem(AUTH_STORAGE,JSON.stringify(v));else localStorage.removeItem(AUTH_STORAGE)}catch{}
 for(const cb of authEvents){try{cb(v?'SIGNED_IN':'SIGNED_OUT',v)}catch(e){console.warn(e)}}
}
async function authFetch(path,options={}){
 const headers={'apikey':KEY,'content-type':'application/json',...(options.headers||{})};
 const resp=await fetch(ROOT+'/auth/v1/'+path,{...options,headers});
 let result={};try{result=await resp.json()}catch{}
 if(!resp.ok)throw Error(result.msg||result.error_description||result.message||result.error||'Authentication request failed');
 return result;
}
async function refreshSession(){
 if(!currentSession?.refresh_token)return null;
 try{
  const result=await authFetch('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:currentSession.refresh_token})});
  const next={access_token:result.access_token,refresh_token:result.refresh_token||currentSession.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(result.expires_in)||3600),user:result.user||currentSession.user};
  setSession(next);return next;
 }catch(error){console.warn('Sign-in expired',error);setSession(null);return null}
}
async function getSession(){
 if(!currentSession?.access_token)return {data:{session:null}};
 if(currentSession.expires_at && currentSession.expires_at<(Date.now()/1000+90))await refreshSession();
 return {data:{session:currentSession?.access_token?currentSession:null}};
}
async function acceptRedirect(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,''));
 if(!hash.get('access_token'))return;
 const token=hash.get('access_token');
 const newSession={
  access_token:token,
  refresh_token:hash.get('refresh_token')||'',
  expires_at:Number(hash.get('expires_at'))||Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600),
  user:null
 };
 try{
  newSession.user=await authFetch('user',{method:'GET',headers:{authorization:'Bearer '+token}});
  setSession(newSession);
  history.replaceState(null,'',location.pathname+location.search);
 }catch(e){console.error('Magic link invalid',e);setSession(null);return}
}
const db={auth:{
 getSession,
 async signInWithOtp({email,options}){
  try{
   const redirect=(options?.emailRedirectTo||location.origin+location.pathname);
   await authFetch('otp?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:JSON.stringify({email,create_user:true})});
   return {error:null};
  }catch(error){return {error}}
 },
 async signOut(){
  const {data:{session}}=await getSession();
  if(session){try{await authFetch('logout',{method:'POST',headers:{authorization:'Bearer '+session.access_token}})}catch{}}
  setSession(null);
  return {error:null};
 },
 onAuthStateChange(cb){authEvents.add(cb);return {data:{subscription:{unsubscribe(){authEvents.delete(cb)}}}}}
}};
const $=id=>document.getElementById(id);
const all=(q,p=document)=>[...p.querySelectorAll(q)];
const fmt=s=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}):'—';
const local=s=>s?new Date(s).toLocaleString('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T'):'';
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const nice=s=>String(s??'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const state={view:'public',mode:null,staff:null,user:null,config:null,event:null,original:null,page:0,historyPage:0,total:0};
let toastTimer,turnstileToken='';
function toast(t,error=false){const x=$('toast');x.textContent=t;x.className='toast'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.add('hidden'),6500)}
function notify(t,error=false){const x=$('notice');x.textContent=t;x.className='notice'+(error?' error':'');x.scrollIntoView({block:'center',behavior:'smooth'})}
function busy(b,v){b.disabled=v;if(!b.dataset.label)b.dataset.label=b.textContent;b.textContent=v?'Working…':b.dataset.label}
async function api(action,payload=null,filters={}){
 const url=new URL(ROOT+'/functions/v1/division-calendar');
 url.searchParams.set('action',action);
 for(const [k,v] of Object.entries(filters))if(v!==''&&v!=null)url.searchParams.set(k,v);
 const {data:{session}}=await db.auth.getSession();
 const headers={'apikey':KEY,...(session?{'Authorization':'Bearer '+session.access_token}:{})};
 if(payload!==null)headers['Content-Type']='application/json';
 const res=await fetch(url,{method:payload===null?'GET':'POST',headers,...(payload!==null?{body:JSON.stringify(payload)}:{})});
 let answer;try{answer=await res.json()}catch{throw Error('The server returned an unexpected response.')}
 if(!res.ok||answer.error)throw Error(answer.error||'The operation failed');
 return answer;
}
function show(view){
 state.view=view;
 for(const k of ['public','signin','admin'])$(k+'-view').classList.toggle('hidden',k!==view);
 for(const k of ['public','signin','admin'])$('nav-'+k).classList.toggle('active',k===view);
 $('notice').classList.add('hidden');window.scrollTo({top:0});
 if(view==='admin')activateInspectorTab('dashboard');
}

// Branded, accessible confirmation dialogs (rather than browser-name alerts).
function divisionQuestion(message,options={}){
 return new Promise(resolve=>{
  const dlg=$('division-confirm-dialog');
  if(!dlg||typeof dlg.showModal!=='function'){toast('Confirmation dialog could not open. Please refresh the page.',true);resolve(options.input?null:false);return}
  if(dlg.open){toast('Finish the current confirmation first.',true);resolve(options.input?null:false);return}
  const title=$('division-dialog-title'),text=$('division-dialog-message'),
        inputLabel=$('division-dialog-input-label'),input=$('division-dialog-input'),
        err=$('division-dialog-error'),no=$('division-dialog-no'),yes=$('division-dialog-yes');
  title.textContent=options.title||'Please confirm';
  text.textContent=message;
  inputLabel.classList.toggle('hidden',!options.input);
  input.value='';
  err.textContent='';err.classList.add('hidden');
  no.textContent=options.cancelLabel||'Go back';
  yes.textContent=options.confirmLabel||'Confirm';
  yes.className=options.danger?'danger':'primary';
  let answer=options.input?null:false;
  function cleanup(){
   dlg.removeEventListener('close',onClose);
   no.removeEventListener('click',onNo);
   yes.removeEventListener('click',onYes);
   dlg.removeEventListener('cancel',onCancel);
   resolve(answer);
  }
  function onClose(){cleanup()}
  function onNo(){answer=options.input?null:false;dlg.close()}
  function onCancel(){answer=options.input?null:false}
  function onYes(){
   if(options.input){
    const value=input.value.trim();
    if(!value){err.textContent='Please provide a reason before continuing.';err.classList.remove('hidden');input.focus();return}
    answer=value;
   }else answer=true;
   dlg.close();
  }
  dlg.addEventListener('close',onClose,{once:true});
  dlg.addEventListener('cancel',onCancel);
  no.addEventListener('click',onNo);
  yes.addEventListener('click',onYes);
  dlg.showModal();
  if(options.input)input.focus();else no.focus();
 });
}
function mode(k){
 state.mode=k;state.event=null;state.original=null;
 all('.choice').forEach(b=>b.classList.toggle('selected',b.dataset.mode===k));
 $('new-panel').classList.toggle('hidden',k!=='new');
 $('existing-panel').classList.toggle('hidden',k==='new');
 $('existing-editor').classList.add('hidden');
 $('lookup-title').textContent=k==='cancel'?'Cancel an event':'Change an event';
}
function values(form){const f=Object.fromEntries(new FormData(form));all('[type=checkbox]',form).forEach(x=>{if(x.name)f[x.name]=x.checked});return f}
const locationNames=['location_name','location_address1','location_address2','location_city','location_state','location_zip'];
function locationControls(form){
 const toggle=form.elements.location_tbd;
 const inputs=locationNames.map(name=>form.elements[name]).filter(Boolean);
 const details=toggle.closest('details');
 function update(){
  if(toggle.checked){
   for(const field of inputs){field.value='';field.disabled=true;field.required=false;}
  }else{
   for(const field of inputs){field.disabled=false;field.required=form.id==='new-form'&&field.name!=='location_address2';}
   if(form.id==='new-form'&&!form.elements.location_state.value)form.elements.location_state.value='CA';
  }
  details.classList.toggle('tbd-selected',toggle.checked);
 }
 const headerToggle=toggle.closest('.location-header-toggle');
 if(headerToggle){
  headerToggle.addEventListener('click',e=>e.stopPropagation());
  headerToggle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.stopPropagation()}});
 }
 toggle.addEventListener('change',()=>{
  update();
  if(!toggle.checked)details.open=true;
 });
 form.addEventListener('invalid',e=>{if(details.contains(e.target))details.open=true;},true);
 update();
 return update;
}
const syncNewLocation=locationControls($('new-form'));
const syncEditLocation=locationControls($('modify-form'));
async function identity(){
 const m=await api('me');state.user=m.email;state.staff=m.staff;
 $('nav-admin').classList.toggle('hidden',!m.staff);
 $('nav-signout').classList.toggle('hidden',!m.email);
 $('nav-signin').classList.toggle('hidden',!!m.email);
 if(m.staff){
  $('welcome').textContent='Welcome, '+(m.staff.display_name||m.staff.email);
  $('staff-role').textContent=nice(m.staff.role);
  all('.admin-only').forEach(x=>x.classList.toggle('hidden',m.staff.role!=='admin'));
 }
}
async function init(){
 try{
  const conf=await api('config');state.config=conf;
  for(const id of ['event-type','edit-event-type','filter-type']){
   const el=$(id);
   for(const type of conf.event_types||[]){const op=document.createElement('option');op.value=type;op.textContent=type;el.append(op)}
  }
  for(const id of ['new-district','edit-district']){
   const el=$(id);
   for(const value of conf.districts||[]){
    const option=document.createElement('option');
    option.value=String(value);option.textContent='District No. '+value;
    el.append(option);
   }
  }
  $('banner').classList.toggle('hidden',conf.public_submissions_enabled);
  if(conf.turnstile_site_key){
   const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;
   s.onload=()=>window.turnstile.render('#turnstile-widget',{sitekey:conf.turnstile_site_key,callback:t=>turnstileToken=t,'expired-callback':()=>turnstileToken=''});
   document.head.append(s);
  }
  await identity();
  const qs=new URLSearchParams(location.search);
  const action=qs.get('action');
  if(action==='change'||action==='cancel'){mode(action);$('lookup-code').value=qs.get('id')||qs.get('code')||''}
  db.auth.onAuthStateChange(()=>setTimeout(()=>identity().catch(()=>{}),0));
 }catch(e){notify('Connection problem: '+e.message,true)}
}
all('.choice').forEach(b=>b.addEventListener('click',()=>mode(b.dataset.mode)));
$('nav-public').onclick=()=>show('public');
$('nav-signin').onclick=()=>show('signin');
$('nav-admin').onclick=()=>show('admin');
$('nav-signout').onclick=async()=>{await db.auth.signOut();show('public');await identity();toast('Signed out')};
$('signin-form').onsubmit=async e=>{
 e.preventDefault();const btn=e.submitter;busy(btn,true);
 try{
  const email=$('signin-email').value.trim().toLowerCase();
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  if(error)throw error;
  notify('Check your email for the sign-in link. Check Junk or Spam if it does not arrive.');
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
$('new-form').onsubmit=async e=>{
 e.preventDefault();const btn=e.submitter;busy(btn,true);
 try{
  const f=values(e.target),event={};
  for(const k of ['title','event_type','hosted_by','district','start_local','end_local','event_mode','location_name','location_address1','location_address2','location_city','location_state','location_zip','location_tbd','public_description','attire','invited_audience','registration_url','payment_url','flyer_url','poc_name','poc_phone'])event[k]=f[k]??'';
  const result=await api('submit',{kind:'new',name:f.contact_name,email:f.contact_email,phone:f.contact_phone,message:f.contact_message,website:f.website||'',turnstile_token:turnstileToken,event});
  notify('Request received.\nRequest ID: '+result.request_code+'\nSave this number. Your event is pending inspector review, not yet published.');
  e.target.reset();syncNewLocation();turnstileToken='';if(window.turnstile)window.turnstile.reset();
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
$('lookup-button').onclick=async e=>{
 const btn=e.currentTarget;busy(btn,true);
 try{
  const code=$('lookup-code').value.trim().toUpperCase(),email=$('lookup-email').value.trim().toLowerCase();
  if(!code||!email)throw Error('Enter the original Request ID and contact email.');
  const {data:{session}}=await db.auth.getSession();
  if(!session||session.user.email?.toLowerCase()!==email){
    $('signin-email').value=email;show('signin');
    notify('Verify the original contact email first. Follow the emailed sign-in link, then return to Change or Cancel.');
    return;
  }
  const result=await api('locate',null,{code});
  state.event=result.event;state.original={};
  const form=$('modify-form');
  for(const k of ['title','event_type','hosted_by','district','event_mode','location_name','location_address1','location_address2','location_city','location_state','location_zip','public_description','location_tbd','poc_name','poc_phone']){
    const v=k==='location_address1'?(result.event.location_address1||result.event.location_address||''):(result.event[k]??'');
    state.original[k]=v;
    if(form.elements[k]){
      if(k==='location_tbd')form.elements[k].checked=!!v;
      else form.elements[k].value=v;
    }
   }
   syncEditLocation();
   $('edit-location-details').open=false;
   for(const k of ['start_local','end_local']){
   const v=local(result.event[k==='start_local'?'starts_at':'ends_at']);state.original[k]=v;form.elements[k].value=v;
  }
  $('event-being-edited').textContent=result.event.title;
  $('event-summary').textContent=result.event.event_code+' · '+fmt(result.event.starts_at)+' · '+(result.event.location_name||'Location TBD');
  $('edit-fields').classList.toggle('hidden',state.mode==='cancel');
  $('cancel-label').classList.toggle('hidden',state.mode!=='cancel');
  $('modify-submit').textContent=state.mode==='cancel'?'Request cancellation →':'Submit changes →';
  $('existing-editor').classList.remove('hidden');toast('Event found');
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
$('modify-form').onsubmit=async e=>{
 e.preventDefault();const btn=e.submitter;busy(btn,true);
 try{
  if(!state.event)throw Error('Find your event first');
  const f=values(e.target),changes={};
  if(state.mode==='change'){
   for(const k of Object.keys(state.original)){
    if(String(f[k]??'')!==String(state.original[k]??''))changes[k]=f[k];
   }
   if(!Object.keys(changes).length)throw Error('Nothing changed. Edit at least one field.');
  }
  const {data:{session}}=await db.auth.getSession();
  if(!session)throw Error('Sign in with the original contact email');
  const result=await api('submit',{kind:state.mode,name:session.user.user_metadata.full_name||session.user.email,email:session.user.email,request_code:state.event.event_code,changes,reason:$('cancel-reason').value,message:$('modify-message').value});
  notify('Your '+(state.mode==='cancel'?'cancellation':'change')+' request was received.\nRequest ID: '+result.request_code+'\nThe current calendar event stays unchanged until an inspector approves.');
  $('existing-editor').classList.add('hidden');
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
let page=0,historyPage=0;
async function loadRequests(p=0){
 page=Math.max(0,p);const out=$('request-list');out.textContent='Loading requests…';
 try{
  const filters={page,search:$('filter-search').value,status:$('filter-status').value,from:$('filter-from').value,to:$('filter-to').value,type:$('filter-type').value,lodge:$('filter-lodge').value,event_from:$('filter-event-from').value,event_to:$('filter-event-to').value};
  const data=await api('requests',null,filters);
  $('count').textContent=data.total+' request'+(data.total===1?'':'s');
  $('page-label').textContent='Page '+(page+1);
  $('prev-page').disabled=page===0;$('next-page').disabled=(page+1)*50>=data.total;
  out.replaceChildren();
  if(!data.items.length){out.textContent='No requests match your filters.';return}
  for(const item of data.items){
   const b=document.createElement('button');b.className='request-row';
   b.innerHTML='<span><strong>'+safe(item.event_title||item.request_type+' request')+'</strong><small>'+safe(item.request_code)+' · '+safe(nice(item.request_type))+'</small></span><small class="date">'+safe(fmt(item.submitted_at))+'</small><span class="chip '+safe(item.status)+'">'+safe(nice(item.status))+'</span>';
   b.onclick=()=>detail(item.id);out.append(b);
  }
 }catch(e){out.textContent='Unable to load requests.';toast(e.message,true)}
}
$('refresh-requests').onclick=()=>loadRequests(0);
$('prev-page').onclick=()=>loadRequests(page-1);
$('next-page').onclick=()=>loadRequests(page+1);

/* Inspector review and published-event management. The original submission is never overwritten. */
const editorFields=['title','event_type','hosted_by','district','start_local','end_local','event_mode','public_description',
 'location_name','location_address1','location_address2','location_city','location_state','location_zip','location_tbd',
 'attire','invited_audience','registration_url','payment_url','flyer_url','poc_name','poc_phone'];
function eventFormValues(e={}){
 const output={};
 for(const key of editorFields)output[key]=e[key]??'';
 if(e.starts_at)output.start_local=local(e.starts_at);
 if(e.ends_at)output.end_local=local(e.ends_at);
 if(!output.location_address1&&e.location_address)output.location_address1=e.location_address;
 if(!output.location_state&& !e.id)output.location_state='CA';
 return output;
}
function inspectorEditor(host, initial, save, buttonLabel='Save Inspector Revision'){
 const f=document.createElement('form');
 f.id='inspector-form';f.className='inspector-edit-form';
 f.addEventListener('invalid',e=>{const d=e.target.closest('details');if(d)d.open=true;},true);
 const source=$('new-form');
 for(const child of [...source.children]){
  if(child.classList.contains('form-title')&&child.textContent.includes('Your contact'))break;
  if(child.classList.contains('form-title')||child.classList.contains('form-grid')||child.matches('details')){
   const node=child.cloneNode(true);
   node.removeAttribute('id');
   node.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
   f.appendChild(node);
  }
 }
 for(const key of editorFields){
  const field=f.elements[key];if(!field)continue;
  if(key==='location_tbd')field.checked=initial[key]===true;
  else field.value=initial[key]??(key==='location_state'?'CA':'');
 }
 // Older published events can have no dedicated POC; allow those to be edited without inventing contact data.
 for(const key of ['poc_name','poc_phone'])if(!initial[key]&&f.elements[key])f.elements[key].required=false;
 const details=f.querySelector('.location-details');
 if(details)details.open=false;
 function toggleLocation(){
  const tbd=!!f.elements.location_tbd.checked;
  for(const key of locationNames){
   const field=f.elements[key];if(!field)continue;
   field.required=!tbd&&key!=='location_address2';
   field.disabled=tbd;
   if(tbd)field.value='';
  }
  details?.classList.toggle('tbd-selected',tbd);
 }
 const headerToggle=f.elements.location_tbd.closest('.location-header-toggle');
 if(headerToggle){
  headerToggle.addEventListener('click',e=>e.stopPropagation());
  headerToggle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation()});
 }
 f.elements.location_tbd.addEventListener('change',()=>{
  toggleLocation();
  if(!f.elements.location_tbd.checked)details.open=true;
 });
 toggleLocation();
 const controls=document.createElement('div');controls.className='form-actions';
 const caption=document.createElement('span');caption.textContent=buttonLabel==='Save & Update Calendar'?'Saving updates the published event and queues Google Calendar synchronization.':'Changes stay in review until an inspector approves them.';
 const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent=buttonLabel;
 const discard=document.createElement('button');discard.type='button';discard.className='secondary';discard.textContent='Discard';
 discard.onclick=()=>host.replaceChildren();
 controls.append(caption,discard,submit);f.append(controls);
 f.onsubmit=async e=>{
  e.preventDefault();busy(submit,true);
  try{
   const data=values(f);
   const obj={};for(const key of editorFields)obj[key]=data[key]??(key==='location_tbd'?false:'');
   await save(obj);
  }catch(error){toast(error.message,true)}finally{busy(submit,false)}
 };
 host.replaceChildren(f);
 host.scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function savePublishedInspectorEdit(ev,fields){
 if(ev.status!=='active')throw Error('Cancelled events cannot be edited.');
 const before=eventFormValues(ev),changes=[];
 for(const key of editorFields)if(String(fields[key]??'')!==String(before[key]??''))changes.push(key.replaceAll('_',' '));
 if(!changes.length)throw Error('Change at least one field before saving.');
 if(!await divisionQuestion('Save these changes to the published event?\n\n'+changes.join(', ')+'\n\nThe existing Google Calendar event will be updated. Your edit is recorded.',{title:'Update published event',confirmLabel:'Save changes'}))return false;
 const response=await api('inspector-publish-edit',{id:ev.id,expected_version:ev.version,fields});
 toast('Saved. Google Calendar update queued.');
 return response;
}
function calendarState(ev,job){
 if(ev.status==='cancelled'){
  if(job?.action==='cancel'){
   if(job.status==='failed')return {label:'Removal failed',tone:'rejected'};
   if(job.status==='pending'||job.status==='running')return {label:'Removing from calendar',tone:'pending'};
  }
  return {label:'Cancelled',tone:'rejected'};
 }
 if(!job)return {label:ev.calendar_last_synced_at?'Previously synced':'Not published',tone:'pending'};
 if(job.event_version!==ev.version)return {label:'Sync status unknown',tone:'pending'};
 if(job.status==='failed')return {label:'Sync failed',tone:'rejected'};
 if(job.status==='pending')return {label:'Sync queued',tone:'pending'};
 if(job.status==='running')return {label:'Syncing',tone:'pending'};
 if(job.status==='succeeded')return {label:'Published',tone:'approved'};
 return {label:'Sync status unknown',tone:'pending'};
}
function auditAction(h){
 switch(h.action){
  case 'submitted':return h.request_type==='cancel'?'Cancellation requested':h.request_type==='change'?'Change requested':'Event submitted';
  case 'approved':return h.request_type==='cancel'?'Cancellation approved':h.request_type==='change'?'Change approved':'Event approved';
  case 'rejected':return 'Request rejected';
  case 'needs_correction':return 'Correction requested';
  case 'inspector_edited':return 'Inspector revised request';
  case 'inspector_updated_published':return 'Inspector updated published event';
  case 'inspector_undo_published':return 'Administrator undid inspector edit';
  case 'calendar_retry_requested':return 'Google Calendar retry requested';
  default:return nice(h.action);
 }
}
function showDifferences(host, before, after){
 const diff=[];
 for(const key of editorFields){
  if(String(before[key]??'')!==String(after[key]??''))diff.push([key,before[key],after[key]]);
 }
 host.replaceChildren();
 if(!diff.length){host.textContent='No inspector modifications have been saved.';return}
 const table=document.createElement('div');table.className='revision-comparison';
 for(const [key,oldValue,newValue] of diff){
  const row=document.createElement('div');row.className='revision-row';
  const name=document.createElement('b');name.textContent=nice(key);
  const from=document.createElement('span');from.textContent='Submitted: '+(oldValue===true?'Yes':oldValue===false?'No':oldValue||'—');
  const to=document.createElement('span');to.textContent='Revised: '+(newValue===true?'Yes':newValue===false?'No':newValue||'—');
  row.append(name,from,to);table.append(row);
 }
 host.append(table);
}
async function detail(id){
 const target=$('request-detail');target.classList.remove('hidden');target.textContent='Loading…';
 try{
  const d=await api('detail',null,{id}),r=d.request,p=r.proposed_fields||{},event=d.event||{};
  const submitted={...eventFormValues(event),...p};
  const effective={...eventFormValues(event),...(r.inspector_edits??p)};
  const address=[effective.location_address1,effective.location_address2,effective.location_city,effective.location_state,effective.location_zip].filter(Boolean).join(', ')||effective.location_address||'—';
  const pairs=[['Request ID',r.request_code],['Request type',nice(r.request_type)],['Submitted',fmt(r.submitted_at)],['Status',nice(r.status)],['Title',effective.title],['Event type',effective.event_type],['Hosting lodge',effective.hosted_by],['District',effective.district?('No. '+effective.district):'—'],['Start',effective.start_local],['End',effective.end_local],['Description',effective.public_description],['Event format',nice(effective.event_mode||'in_person')],['Venue',effective.location_tbd?'Location TBD':effective.location_name],['Address',effective.location_tbd?'Location TBD':address],['Event POC name',effective.poc_name],['Event POC phone',effective.poc_phone],['Attire',effective.attire],['Audience',effective.invited_audience],['Registration URL',effective.registration_url],['Payment URL',effective.payment_url],['Flyer / invitation URL',effective.flyer_url],['Cancellation reason',effective.reason],['Contact',r.requester_name],['Email',r.requester_email],['Telephone',r.requester_phone],['Message',r.requester_message]];
  target.innerHTML='<div class="review-title"><div><h2>'+safe(effective.title||nice(r.request_type))+'</h2><p class="muted">'+safe(r.request_code)+'</p></div><span class="chip '+safe(r.status)+'">'+safe(nice(r.status))+'</span></div><div class="detail-grid">'+pairs.map(([k,v])=>'<div><small>'+safe(k)+'</small>'+safe(v??'—')+'</div>').join('')+'</div><h3>Inspector revisions</h3><p class="help">The submitted details remain unchanged. Saved inspector corrections are recorded separately.</p><div id="request-diff"></div><div id="inspector-editor-host"></div><hr><h3>Review &amp; delivery</h3><label>Message to submitter (optional)<textarea id="review-note" rows="2"></textarea></label><div class="review-actions" id="review-actions"></div><div id="delivery-summary"></div><h3>Request history</h3><div class="timeline" id="item-history"></div>';
  showDifferences($('request-diff'),submitted,effective);
  const actions=$('review-actions');
  if(['pending','needs_correction'].includes(r.status)){
   if(['new','change'].includes(r.request_type)){
    const edit=document.createElement('button');edit.className='secondary';edit.textContent=r.inspector_edits?'Edit Saved Revision':'Edit Request';
    edit.onclick=()=>inspectorEditor($('inspector-editor-host'),effective,async fields=>{
      const result=await api('inspector-edit',{id,expected_version:r.edit_version,fields});
      toast(result.notice||'Revision saved');await detail(id);
    });
    actions.append(edit);
   }
   for(const [decision,label,style] of [['approved','Approve & Publish','primary'],['needs_correction','Hold — Needs Correction','secondary'],['rejected','Reject','danger']]){
    const button=document.createElement('button');button.className=style;button.textContent=label;
    button.onclick=()=>{
      if($('inspector-editor-host')?.querySelector('form')){toast('Save or discard your edits before reviewing.',true);return;}
      review(id,decision,r.edit_version);
    };
    actions.append(button);
   }
  }else{
   actions.textContent='Decision recorded. The original approval remains in the history.';
   if(r.status==='approved'&&r.approved_event_id&&d.event?.status==='active'){
    const edit=document.createElement('button');
    edit.type='button';edit.className='primary';edit.textContent='Edit & Update Calendar';
    edit.onclick=()=>{
     const event=d.event;
     inspectorEditor($('inspector-editor-host'),eventFormValues(event),
       async fields=>{if(await savePublishedInspectorEdit(event,fields))await detail(id);},
       'Save & Update Calendar');
    };
    target.querySelector('.review-title').append(edit);
   }
  }
  const jobs=d.calendar||[],job=jobs[0],status=d.event?calendarState(d.event,job):null;
  const sent=(d.email||[]).filter(x=>x.status==='sent').length;
  const pending=(d.email||[]).filter(x=>['pending','sending'].includes(x.status)).length;
  const failures=(d.email||[]).filter(x=>x.status==='failed').length;
  $('delivery-summary').innerHTML='<p><b>Google Calendar:</b> '+safe(status?.label||(r.status==='approved'?'Queued':'Not scheduled'))+'</p>'+(job?.last_error?'<p class="notice error">'+safe(job.last_error)+'</p>':'')+'<p><b>Email notifications:</b> '+sent+' sent'+(pending?', '+pending+' queued':'')+(failures?', '+failures+' failed':'')+'</p>';
  const hist=$('item-history');
  for(const h of d.history||[]){
   const box=document.createElement('div');
   box.innerHTML='<b>'+safe(nice(h.action))+'</b><br><small>'+safe(fmt(h.occurred_at))+' · '+safe(h.actor_email||'System')+'</small>';
   if(h.action==='inspector_edited'&&h.before_data?.fields&&h.after_data?.fields){
    const details=document.createElement('details');
    const label=document.createElement('summary');label.textContent='View changes in revision '+(h.after_data.revision||'');
    details.append(label);
    const changes=document.createElement('div');
    showDifferences(changes,h.before_data.fields,h.after_data.fields);
    details.append(changes);box.append(details);
   }
   hist.append(box)
  }
  target.scrollIntoView({block:'start',behavior:'smooth'});
 }catch(e){target.textContent=e.message;toast(e.message,true)}
}
async function review(id,decision,version){
 if(['approved','rejected'].includes(decision)&&!await divisionQuestion(decision==='approved'?'Approve this request and queue Google Calendar publication?':'Reject this request?',{title:decision==='approved'?'Approve request':'Reject request',confirmLabel:decision==='approved'?'Approve & publish':'Reject request',danger:decision==='rejected'}))return;
 try{
  const note=$('review-note')?.value||'';
  if(decision==='needs_correction'&&!note.trim())throw Error('Explain what needs correction in the message to the submitter');
  const result=await api('review',{id,decision,note,expected_version:version});
  toast(result.notice||'Decision saved');await loadRequests(page);await detail(id);
 }catch(e){toast(e.message,true)}
}

async function retryEventSync(event,after){
 try{
  const result=await api('calendar-retry',{id:event.id,expected_version:event.version});
  toast(result.notice||'Calendar retry queued.');
  if(after)await after();
 }catch(ex){toast(ex.message,true);}
}
function dashboardElement(tag,className,textValue){
 const n=document.createElement(tag);
 if(className)n.className=className;
 if(textValue!==undefined)n.textContent=String(textValue);
 return n;
}
async function loadDashboard(){
 const stats=$('dashboard-stats'),requests=$('dashboard-requests'),failures=$('dashboard-failures'),recent=$('dashboard-recent');
 stats.textContent='Loading dashboard…';requests.replaceChildren();failures.replaceChildren();recent.replaceChildren();
 try{
  const d=await api('dashboard'),counts=d.counts||{};
  stats.replaceChildren();
  const cards=[
    {name:'Pending requests',value:counts.pending||0,kind:'requests',filter:'pending'},
    {name:'Needs correction',value:counts.corrections||0,kind:'requests',filter:'needs_correction'},
    {name:'Calendar failures',value:counts.failed||0,kind:'events',filter:null},
    {name:'Syncing / queued',value:counts.queued||0,kind:'events',filter:null}
  ];
  for(const card of cards){
   const button=dashboardElement('button','dashboard-stat');
   button.type='button';
   button.append(dashboardElement('strong','dashboard-number',card.value),
     dashboardElement('span','',card.name));
   button.onclick=async()=>{
    if(card.kind==='requests')$('filter-status').value=card.filter;
    if(card.kind==='events')$('event-status').value='all';
    await activateInspectorTab(card.kind);
   };
   stats.append(button);
  }
  for(const req of d.requests||[]){
   const btn=dashboardElement('button','dashboard-entry');
   btn.type='button';
   btn.append(dashboardElement('strong','',req.title||'Event request'),
     dashboardElement('small','muted',(req.code||'')+' · '+nice(req.status)+' · '+fmt(req.submitted_at)));
   btn.onclick=async()=>{await activateInspectorTab('requests');await detail(req.id)};
   requests.append(btn);
  }
  if(!d.requests?.length)requests.append(dashboardElement('p','muted','No requests waiting for review.'));
  for(const item of d.failures||[]){
   const box=dashboardElement('div','dashboard-entry dashboard-error');
   box.append(dashboardElement('strong','',item.title||'Event'),
     dashboardElement('small','muted',item.code||''),
     dashboardElement('p','dashboard-error-text',item.error||'Google Calendar did not accept the last update.'));
   const actions=dashboardElement('div','dashboard-entry-actions');
   const open=dashboardElement('button','secondary','Open Event');open.type='button';
   open.onclick=async()=>{await activateInspectorTab('events');await eventDetail(item.id)};
   const retry=dashboardElement('button','primary','Retry now');retry.type='button';
   retry.onclick=async()=>{
    retry.disabled=true;
    try{
     const current=await api('event-detail',null,{id:item.id});
     if(calendarState(current.event,current.calendar?.[0]).label!=='Sync failed' && calendarState(current.event,current.calendar?.[0]).label!=='Removal failed')
      throw Error('The event status changed. Refresh the dashboard.');
     await retryEventSync(current.event,loadDashboard);
    }catch(e){toast(e.message,true)}
    finally{retry.disabled=false}
   };
   actions.append(open,retry);box.append(actions);failures.append(box);
  }
  if(!d.failures?.length)failures.append(dashboardElement('p','muted','No current Google Calendar failures.'));
  for(const item of d.recent||[]){
   const btn=dashboardElement('button','dashboard-entry');
   btn.type='button';
   btn.append(dashboardElement('strong','',item.event_title||'Event request'),
     dashboardElement('span','',auditAction(item)),
     dashboardElement('small','muted',fmt(item.at)+' · '+(item.actor||'System')));
   btn.onclick=async()=>{
    if(item.event_id){await activateInspectorTab('events');await eventDetail(item.event_id)}
    else if(item.request_id){await activateInspectorTab('requests');await detail(item.request_id)}
   };
   recent.append(btn);
  }
  if(!d.recent?.length)recent.append(dashboardElement('p','muted','No recent activity.'));
 }catch(ex){stats.textContent='Unable to load dashboard: '+ex.message;toast(ex.message,true)}
}
$('dashboard-refresh').onclick=loadDashboard;
let eventPage=0;
async function loadEvents(p=0){
 eventPage=Math.max(0,p);
 const list=$('event-list');list.textContent='Loading events…';$('event-detail').classList.add('hidden');
 try{
  const data=await api('events',null,{page:eventPage,status:$('event-status').value,search:$('event-search').value});
  $('event-count').textContent=data.total+' event'+(data.total===1?'':'s');
  $('event-page').textContent='Page '+(eventPage+1);
  $('event-prev').disabled=eventPage===0;$('event-next').disabled=(eventPage+1)*50>=data.total;
  list.replaceChildren();
  if(!data.items.length){list.textContent='No events match your search.';return}
  for(const item of data.items){
   const btn=document.createElement('button');btn.type='button';btn.className='request-row';
   const sync=calendarState(item,item.latest_job);
   btn.innerHTML='<span><strong>'+safe(item.title)+'</strong><small>'+safe(item.event_code)+' · '+safe(item.hosted_by||'')+'</small></span><small class="date">'+safe(fmt(item.starts_at))+'</small><span class="chip '+sync.tone+'">'+safe(sync.label)+'</span>';
   btn.onclick=()=>eventDetail(item.id);list.append(btn);
  }
 }catch(e){list.textContent=e.message;toast(e.message,true)}
}
$('event-search-go').onclick=()=>loadEvents(0);
$('event-search').onkeydown=e=>{if(e.key==='Enter')loadEvents(0)};
$('event-prev').onclick=()=>loadEvents(eventPage-1);
$('event-next').onclick=()=>loadEvents(eventPage+1);
async function eventDetail(id){
 const host=$('event-detail');host.classList.remove('hidden');host.textContent='Loading event…';
 try{
  const d=await api('event-detail',null,{id}),ev=d.event,initial=eventFormValues(ev);
  const job=d.calendar?.[0],status=calendarState(ev,job);
  host.innerHTML='<h2>'+safe(ev.title)+'</h2><p class="muted">'+safe(ev.event_code)+' · '+safe(nice(ev.status))+'</p><p><b>Starts:</b> '+safe(fmt(ev.starts_at))+' · <b>Location:</b> '+safe(ev.location_name||'Location TBD')+'</p><p><b>Event point of contact:</b> '+safe(ev.poc_name||'Not provided')+(ev.poc_phone?' · '+safe(ev.poc_phone):'')+'</p><p><b>Google Calendar:</b> <span class="chip '+status.tone+'">'+safe(status.label)+'</span></p>'+(job?.last_error?'<p class="notice error">Sync issue: '+safe(job.last_error)+'</p>':'')+'<div class="review-actions" id="event-actions"></div><div id="event-editor-host"></div><h3>Recent history</h3><div id="event-history" class="timeline"></div>';
  const actions=$('event-actions');
  if(ev.status==='active'){
   const edit=document.createElement('button');edit.className='secondary';edit.textContent='Edit Published Event';
   edit.onclick=()=>inspectorEditor($('event-editor-host'),initial,
     async fields=>{if(await savePublishedInspectorEdit(ev,fields)){await loadEvents(eventPage);await eventDetail(ev.id);}},
     'Save & Update Calendar');
   const cancel=document.createElement('button');cancel.className='danger';cancel.textContent='Request Cancellation';
   cancel.onclick=async()=>{
    const reason=await divisionQuestion('Why should this event be cancelled?',{title:'Cancellation — step 1 of 2',input:true,confirmLabel:'Continue'});
    if(!reason)return;
    if(!await divisionQuestion('Submit a cancellation request for '+ev.title+'?\n\nReason: '+reason+'\n\nThe event remains published until the cancellation is approved.',{title:'Cancellation — step 2 of 2',confirmLabel:'Submit cancellation',danger:true}))return;
    try{const data=await api('submit',{kind:'cancel',name:state.staff?.display_name||state.user,email:state.user,request_code:ev.event_code,reason});toast('Cancellation request '+data.request_code+' created. Approve it under Review Requests.');}catch(ex){toast(ex.message,true)}
   };
   actions.append(edit,cancel);
  }
  if(job&&job.event_version===ev.version&&job.status==='failed'&&
     job.action===(ev.status==='cancelled'?'cancel':'upsert')){
   const retry=document.createElement('button');retry.type='button';
   retry.className='primary';retry.textContent='Retry Google Calendar';
   retry.onclick=async()=>{
    retry.disabled=true;
    await retryEventSync(ev,async()=>{await loadEvents(eventPage);await eventDetail(ev.id)});
    retry.disabled=false;
   };
   actions.prepend(retry);
  }
  const lastEditor=(d.history||[]).find(h=>['inspector_updated_published','inspector_undo_published'].includes(h.action));
  if(state.staff?.role==='admin'&&ev.status==='active'&&lastEditor&&
     Number(lastEditor.after_data?.version)===ev.version&&lastEditor.before_data?.fields){
   const undo=document.createElement('button');undo.type='button';
   undo.className='secondary';undo.textContent='Undo last inspector edit';
   undo.onclick=async()=>{
    const fields=lastEditor.before_data.fields||{},present=lastEditor.after_data?.fields||{};
    const changed=editorFields.filter(k=>String(fields[k]??'')!==String(present[k]??''));
    const lines=changed.slice(0,12).map(k=>nice(k)+': '+String(present[k]??'—')+' → '+String(fields[k]??'—'));
    if(!await divisionQuestion('Undo the most recent inspector edit to '+ev.title+'?\n\n'+lines.join('\n')+
      (changed.length>12?'\n… and '+(changed.length-12)+' additional fields':'')+
      '\n\nThis restores the previous details, records the reversal, and queues another Google Calendar update.',{title:'Undo last inspector edit',confirmLabel:'Undo edit',danger:true}))return;
    undo.disabled=true;
    try{
     const result=await api('event-undo',{id:ev.id,history_id:lastEditor.id,expected_version:ev.version});
     toast(result.notice||'Previous version restored.');
     await loadEvents(eventPage);await eventDetail(ev.id);
    }catch(ex){toast(ex.message,true);undo.disabled=false;}
   };
   actions.append(undo);
  }
  for(const h of d.history||[]){
   const node=document.createElement('div');
   const title=document.createElement('b');title.textContent=auditAction(h);
   const meta=document.createElement('small');
   meta.textContent=[fmt(h.occurred_at),h.actor_email||'System',h.request_code||''].filter(Boolean).join(' · ');
   node.append(title,document.createElement('br'),meta);
   if(['inspector_updated_published','inspector_undo_published'].includes(h.action)&&h.before_data?.fields&&h.after_data?.fields){
    const disclosure=document.createElement('details');disclosure.className='audit-diff';
    const summary=document.createElement('summary');summary.textContent='See corrections';
    const changes=document.createElement('div');showDifferences(changes,h.before_data.fields,h.after_data.fields);
    disclosure.append(summary,changes);node.append(disclosure);
   }
   host.querySelector('#event-history').append(node);
  }
  host.scrollIntoView({block:'start',behavior:'smooth'});
 }catch(e){host.textContent=e.message;toast(e.message,true)}
}
async function activateInspectorTab(key){
 all('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===key));
 for(const k of ['dashboard','requests','events','history','staff','settings'])
  $('tab-'+k).classList.toggle('hidden',k!==key);
 if(key==='dashboard')await loadDashboard();
 if(key==='requests')await loadRequests(0);
 if(key==='events')await loadEvents(0);
 if(key==='history')await loadHistory(0);
 if(key==='staff')await loadStaff();
 if(key==='settings')await loadSettings();
}
all('.tab').forEach(t=>t.onclick=()=>activateInspectorTab(t.dataset.tab));
async function loadHistory(p=0){
 historyPage=Math.max(0,p);
 const el=$('history-content');el.textContent='Loading activity…';
 try{
  const d=await api('audit',null,{page:historyPage,activity:$('log-action').value});
  el.replaceChildren();
  for(const h of (Array.isArray(d.items)?d.items:[])){
   const box=document.createElement('article');box.className='audit-item';
   const row=document.createElement('div');row.className='audit-top';
   const left=document.createElement('div');
   const title=document.createElement('strong');title.textContent=h.event_title||'Event request';
   const action=document.createElement('div');action.className='audit-action';action.textContent=auditAction(h);
   const meta=document.createElement('small');meta.className='muted';meta.textContent=[h.request_code||h.event_code,fmt(h.occurred_at),h.actor_email||'System'].filter(Boolean).join(' · ');
   left.append(title,action,meta);
   row.append(left);
   if(h.request_id||h.event_id){
    const navigate=document.createElement('button');navigate.type='button';navigate.className='secondary';navigate.textContent=h.request_id?'View Request':'View Event';
    navigate.onclick=async()=>{
     const key=h.request_id?'requests':'events';
     await activateInspectorTab(key);
     if(h.request_id)await detail(h.request_id);else await eventDetail(h.event_id);
    };
    row.append(navigate);
   }
   box.append(row);
   if(['inspector_edited','inspector_updated_published','inspector_undo_published'].includes(h.action)){
    const before=h.before_data?.fields,after=h.after_data?.fields;
    if(before&&after){
     const disclosure=document.createElement('details');disclosure.className='audit-diff';
     const summary=document.createElement('summary');summary.textContent='View fields changed';
     const diffs=document.createElement('div');showDifferences(diffs,before,after);
     disclosure.append(summary,diffs);box.append(disclosure);
    }
   }
   if(h.notes){const note=document.createElement('p');note.className='help';note.textContent=h.notes;box.append(note)}
   el.append(box);
  }
  if(!Array.isArray(d.items)||!d.items.length)el.textContent='No matching activity.';
  $('history-page').textContent='Page '+(p+1)+' · '+d.total+' activities';
  $('history-prev').disabled=p===0;$('history-next').disabled=(p+1)*50>=d.total;
 }catch(e){el.textContent=e.message;toast(e.message,true)}
}
$('refresh-history').onclick=()=>loadHistory(0);
$('log-action').onchange=()=>loadHistory(0);
$('history-prev').onclick=()=>loadHistory(historyPage-1);
$('history-next').onclick=()=>loadHistory(historyPage+1);
let showRemovedInspectors=false;
async function loadStaff(){
 const root=$('staff-list');root.textContent='Loading inspectors…';
 try{
  const r=await api('staff');
  root.replaceChildren();
  const list=(r.items||[]).filter(x=>showRemovedInspectors||!x.removed_at);
  for(const s of list){
   const row=document.createElement('div');row.className='staff-row';
   const info=document.createElement('div');
   const name=document.createElement('strong');name.textContent=s.display_name||s.email;
   const meta=document.createElement('small');
   const access=s.removed_at?'Removed on '+new Date(s.removed_at).toLocaleDateString():s.enabled?'Active':'Disabled';
   meta.textContent=s.email+' · '+nice(s.role)+' · '+access;
   info.append(name,document.createElement('br'),meta);
   const buttons=document.createElement('div');buttons.className='staff-actions';
   if(s.removed_at){
    const restore=document.createElement('button');restore.type='button';restore.className='secondary';
    restore.textContent='Restore access';
    restore.onclick=async()=>{
     if(!await divisionQuestion('Restore inspector access for '+(s.display_name||s.email)+'?',{title:'Restore inspector',confirmLabel:'Restore access'}))return;
     try{const result=await api('staff-restore',{id:s.id});toast(result.message);await loadStaff();}
     catch(ex){toast(ex.message,true);}
    };
    buttons.append(restore);
   }else{
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Edit';
    edit.onclick=()=>{
     const form=$('staff-form');
     for(const key of ['email','display_name','phone','role'])form.elements[key].value=s[key]||'';
     form.elements.enabled.checked=s.enabled;
     form.scrollIntoView({behavior:'smooth',block:'start'});
    };
    buttons.append(edit);
    if(s.role==='inspector'){
     const remove=document.createElement('button');remove.type='button';remove.className='danger';
     remove.textContent='Remove inspector';
     remove.onclick=async()=>{
      if(!await divisionQuestion('Remove access for '+(s.display_name||s.email)+'?\n\nTheir past approvals and history will be preserved. Access can be restored later.',{title:'Remove inspector',confirmLabel:'Remove access',danger:true}))return;
      try{const result=await api('staff-remove',{id:s.id});toast(result.message);await loadStaff();}
      catch(ex){toast(ex.message,true);}
     };
     buttons.append(remove);
    }
   }
   row.append(info,buttons);root.append(row);
  }
  if(!list.length)root.textContent='No inspectors to display.';
  const removedCount=(r.items||[]).filter(x=>x.removed_at).length;
  $('toggle-removed').textContent=showRemovedInspectors?'Hide removed inspectors':'Show removed inspectors'+(removedCount?' ('+removedCount+')':'');
 }catch(e){root.textContent=e.message;toast(e.message,true)}
}
$('toggle-removed').onclick=()=>{showRemovedInspectors=!showRemovedInspectors;loadStaff();};
$('staff-form').onsubmit=async e=>{
 e.preventDefault();const b=e.submitter;busy(b,true);
 try{await api('staff-save',values(e.target));toast('Inspector saved');e.target.reset();await loadStaff()}catch(ex){toast(ex.message,true)}finally{busy(b,false)}
};
async function loadSettings(){
 try{const s=await api('settings');$('email-links').value=s.settings.public_email_links||''}catch(e){toast(e.message,true)}
}
$('save-links').onclick=async()=>{
 try{await api('settings-save',{key:'public_email_links',value:$('email-links').value});toast('Email links saved')}catch(e){toast(e.message,true)}
};
window.divisionAppReady = true;
acceptRedirect().finally(init);
