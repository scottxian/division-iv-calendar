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
// Human-facing wording only. API and database statuses remain unchanged.
const nice=s=>{
 const label={pending:'Awaiting Publication',approved:'Verified for Publication',
  needs_correction:'Returned for Correction',rejected:'Not Published',
  new:'Submit an Event',change:'Update an Event',cancel:'Cancel an Event',
  submitted:'Submitted',invited_audience:'Attendees'};
 return label[String(s??'')]||String(s??'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
};
function canonicalHost(value){
 const str=String(value||'').replace(/\s+/g,' ').trim();
 const match=str.match(/^(.+?)\s*,?\s*(?:Lodge\s*,?\s*)?(?:(?:No\.?)\s*|#\s*)?(\d+)$/i);
 if(!match||/\b(?:chapter|association|district)\b/i.test(match[1]))return str;
 return match[1].replace(/[,\s]+$/,'').replace(/\s+Lodge$/i,'').trim()+' Lodge No. '+match[2];
}
const state={view:'public',mode:null,staff:null,user:null,config:null,event:null,original:null,page:0,historyPage:0,total:0,loginPurpose:'inspector'};
let toastTimer,turnstileToken='';
function toast(t,error=false){const x=$('toast');x.textContent=t;x.className='toast'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.add('hidden'),6500)}
function notify(t,error=false){const x=$('notice');x.textContent=t;x.className='notice'+(error?' error':'');}
/** Persistent edit feedback appears immediately below its action controls. */
function actionFeedback(anchor,text='',kind='success'){
 if(!anchor)return;
 let node=anchor.nextElementSibling;
 if(!node?.classList.contains('edit-action-feedback')){
  node=document.createElement('p');node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  anchor.insertAdjacentElement('afterend',node);
 }
 node.textContent=text;
 node.className='edit-action-feedback'+(kind==='error'?' error':kind==='pending'?' pending':'')+(!text?' hidden':'')+(anchor.parentElement?.classList.contains('form-grid')?' wide':'');
 if(text)node.scrollIntoView({behavior:'smooth',block:'nearest'});
 return node;
}
function formFeedback(form,text='',kind='success'){
 const actions=[...(form?.querySelectorAll('.form-actions')||[])].at(-1);
 return actionFeedback(actions||form?.lastElementChild,text,kind);
}
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
 document.body.classList.toggle('inspector-desk-mode',view==='admin');
 for(const k of ['public','signin','admin'])$(k+'-view').classList.toggle('hidden',k!==view);
 for(const k of ['public','signin','admin'])$('nav-'+k).classList.toggle('active',k===view);
 $('notice').classList.add('hidden');window.scrollTo({top:0});
 if(view==='admin'&&!$('admin-view').classList.contains('mfa-locked'))activateInspectorTab('dashboard');
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
 $('lookup-title').textContent=k==='cancel'?'Cancel an Event':'Update an Event';
}
function values(form){const f=Object.fromEntries(new FormData(form));all('[type=checkbox]',form).forEach(x=>{if(x.name)f[x.name]=x.checked});return f}
const locationNames=['location_name','location_address1','location_address2','location_city','location_state','location_zip'];
function locationControls(form){
 const toggle=form.elements.location_tbd;
 const inputs=locationNames.map(name=>form.elements[name]).filter(Boolean);
 const details=form.querySelector('.location-details');
 const eventMode=form.elements.event_mode;
 const eventType=form.elements.event_type;
 const virtualField=form.elements.virtual_meeting_url;
 const districtField=form.elements.district;
 function update(){
  const online=eventMode?.value==='online';
  const divisionWide=eventType?.value==='Division School of Instruction';
  if(districtField){
   const label=districtField.closest('label');
   if(divisionWide){districtField.value='';districtField.disabled=true;districtField.required=false;}
   else{districtField.disabled=false;districtField.required=form.id!=='modify-form';}
   label?.classList.toggle('hidden',divisionWide);
   const mark=label?.querySelector('.req');
   if(mark)mark.classList.toggle('hidden',divisionWide);
  }
  // Pre-fill fixed District School of Instruction titles on new event submissions.
  if(form.id==='new-form'){
   const titleField=form.elements.title;
   const districtSchool=eventType?.value==='District School of Instruction';
   const generated=(districtSchool&&districtField?.value)
    ? 'District '+districtField.value+' School of Instruction':'';
   if(generated){titleField.value=generated;titleField.readOnly=true;}
   else if(titleField.readOnly){titleField.readOnly=false;titleField.value='';}
  }
  if(virtualField){
   const label=virtualField.closest('label');
   const offersOnline=online||eventMode?.value==='hybrid';
   label?.classList.toggle('hidden',!offersOnline);
   virtualField.disabled=!offersOnline;
   virtualField.required=online&&form.id!=='modify-form';
   if(!offersOnline)virtualField.value='';
  }
  toggle.disabled=!!online;
  if(online)toggle.checked=false;
  for(const field of inputs){
   const needsAddress=!online&&!toggle.checked;
   field.disabled=!needsAddress;
   field.required=needsAddress&&form.id!=='modify-form'&&field.name!=='location_address2';
   if(!needsAddress)field.value='';
  }
  if(!online&&!toggle.checked&&form.id!=='modify-form'&&!form.elements.location_state.value)form.elements.location_state.value='CA';
  details.classList.toggle('tbd-selected',toggle.checked&&!online);
  details.classList.toggle('online-selected',online);
  if(online)details.open=true;
 }
 toggle.addEventListener('change',()=>{
  update();
  if(!toggle.checked)details.open=true;
 });
 eventMode?.addEventListener('change',update);
 eventType?.addEventListener('change',update);
 districtField?.addEventListener('change',update);
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
 const blocked=!!(m.staff&&(!m.mfa||m.mfa.required&&!m.mfa.verified));
 const wasLocked=$('admin-view').classList.contains('mfa-locked');
 $('admin-view').classList.toggle('mfa-locked',blocked);
 window.divisionSecurityInit?.(m.staff,m.mfa);
 // Restore the first work tab only after the server confirms an AAL2 session.
 if(wasLocked&&!blocked&&state.view==='admin')void activateInspectorTab('dashboard');
}
window.divisionRefreshIdentity=identity;
const allowedDistrictDivisions=new Map([[1,'Division I'],[2,'Division II'],[3,'Division III'],[4,'Division IV'],[10,'Division X']]);
function districtDivision(code){
 const value=String(code??'').trim();
 if(!/^\d{3,4}$/.test(value))return null;
 const division=Math.floor(Number(value)/100);
 return allowedDistrictDivisions.has(division)?division:null;
}
function populateDistrictOptions(select,allDistricts){
 const unique=[...new Set(allDistricts.map(x=>String(x).trim()))];
 for(const [division,label] of allowedDistrictDivisions){
  const codes=unique.filter(code=>districtDivision(code)===division).sort((a,b)=>Number(a)-Number(b));
  if(!codes.length)continue;
  const group=document.createElement('optgroup');group.label=label;
  for(const code of codes){
   const option=document.createElement('option');
   option.value=code;option.textContent='District No. '+code;
   group.append(option);
  }
  select.append(group);
 }
}
function preserveExistingDistrict(select,value){
 const code=String(value??'').trim();
 if(!code||[...select.options].some(option=>option.value===code))return;
 const option=document.createElement('option');
 option.value=code;option.textContent='District No. '+code+' (existing event)';
 select.append(option);
}
async function init(){
 try{
  const conf=await api('config');state.config=conf;
  const hostNames=[...new Set((conf.hosts||[]).map(canonicalHost).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const hostList=$('host-choices');hostList.replaceChildren();
  for(const name of hostNames){const opt=document.createElement('option');opt.value=name;hostList.append(opt)}
  // Only suggest public event details or general examples; never reuse submitted private contact information.
  const suggestionLists={venue:'venue-choices',city:'city-choices',cost:'cost-choices',attire:'attire-choices',audience:'audience-choices',position:'poc-position-choices'};
  for(const [field,listId] of Object.entries(suggestionLists)){
   const list=$(listId);
   if(!list)continue;
   const existing=new Set([...list.options].map(opt=>opt.value.toLocaleLowerCase()));
   for(const raw of conf.suggestions?.[field]||[]){
    const value=String(raw||'').trim();if(!value||existing.has(value.toLocaleLowerCase()))continue;
    existing.add(value.toLocaleLowerCase());const option=document.createElement('option');option.value=value;list.append(option);
   }
  }
  for(const id of ['event-type','edit-event-type','filter-type']){
   const el=$(id);
   for(const type of conf.event_types||[]){const op=document.createElement('option');op.value=type;op.textContent=type;el.append(op)}
  }
  // Public district selection is manual. Show only Divisions I, II, III, IV and X.
  // Keep the server's statewide list for validating/retaining historical listings.
  for(const id of ['new-district','edit-district']){
   populateDistrictOptions($(id),conf.districts||[]);
  }
  $('banner').classList.toggle('hidden',conf.public_submissions_enabled);
  if(conf.turnstile_site_key){
   const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;
   s.onload=()=>window.turnstile.render('#turnstile-widget',{sitekey:conf.turnstile_site_key,callback:t=>turnstileToken=t,'expired-callback':()=>turnstileToken=''});
   document.head.append(s);
  }
  await identity();
  if(location.pathname.startsWith('/inspectors/')) show(state.staff?'admin':'signin');
  const qs=new URLSearchParams(location.search);
  const action=qs.get('action');
  if(action==='change'||action==='cancel'){mode(action);$('lookup-code').value=qs.get('id')||qs.get('code')||''}
  db.auth.onAuthStateChange(()=>setTimeout(()=>identity().catch(()=>{}),0));
 }catch(e){notify('Connection problem: '+e.message,true)}
}
all('.choice').forEach(b=>b.addEventListener('click',()=>mode(b.dataset.mode)));
const onInspectorRoute=location.pathname.startsWith('/inspectors/');
$('nav-public').onclick=()=>{if(onInspectorRoute)location.assign('/events/');else show('public')};
$('nav-signin').onclick=()=>{state.loginPurpose='inspector';if(!onInspectorRoute)location.assign('/inspectors/');else show('signin')};
$('nav-admin').onclick=()=>{if(!onInspectorRoute)location.assign('/inspectors/');else show('admin')};
$('nav-signout').onclick=async()=>{await db.auth.signOut();show('public');await identity();toast('Signed out')};
$('signin-form').onsubmit=async e=>{
 e.preventDefault();const btn=e.submitter;busy(btn,true);
 try{
  const email=$('signin-email').value.trim().toLowerCase();
  const destination=location.origin+(state.loginPurpose==='event-contact'?'/events/':'/inspectors/');
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:destination}});
  if(error)throw error;
  notify('Check your email for the sign-in link. Check Junk or Spam if it does not arrive.');
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
$('new-form').onsubmit=async e=>{
 e.preventDefault();const btn=e.submitter;busy(btn,true);
 try{
  const f=values(e.target),event={};
  for(const k of ['title','event_type','hosted_by','district','start_local','end_local','event_mode','virtual_meeting_url','location_name','location_address1','location_address2','location_city','location_state','location_zip','location_tbd','public_description','attire','invited_audience','registration_url','payment_url','flyer_url','poc_name','poc_position','poc_phone','poc_email','cost_details'])event[k]=f[k]??'';
  const result=await api('submit',{kind:'new',name:f.contact_name,email:f.contact_email,phone:f.contact_phone,message:f.contact_message,website:f.website||'',turnstile_token:turnstileToken,event});
  notify('Calendar submission received.\nSubmission ID: '+result.request_code+'\nSave this number. Your listing is awaiting inspector verification and publication. Lodges schedule their own events.');
  const receipt=document.createElement('div');receipt.className='notice';receipt.style.whiteSpace='pre-line';receipt.textContent='Submission received! Submission ID: '+result.request_code+' — Save this number. Awaiting publication verification.'; e.target.append(receipt);
  e.target.reset();syncNewLocation();turnstileToken='';if(window.turnstile)window.turnstile.reset();
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
$('lookup-button').onclick=async e=>{
 const btn=e.currentTarget;busy(btn,true);
 try{
  const code=$('lookup-code').value.trim().toUpperCase(),email=$('lookup-email').value.trim().toLowerCase();
  if(!code||!email)throw Error('Enter the original Submission ID and contact email.');
  const {data:{session}}=await db.auth.getSession();
  if(!session||session.user.email?.toLowerCase()!==email){
    state.loginPurpose='event-contact';
    $('signin-email').value=email;show('signin');
    notify('Verify the original contact email first. Follow the emailed sign-in link, then return to Update or Cancel.');
    return;
  }
  const result=await api('locate',null,{code});
  state.event=result.event;state.original={};
  const form=$('modify-form');
  for(const k of ['title','event_type','hosted_by','district','event_mode','virtual_meeting_url','location_name','location_address1','location_address2','location_city','location_state','location_zip','public_description','location_tbd','poc_name','poc_position','poc_phone','poc_email','cost_details']){
    const v=k==='location_address1'?(result.event.location_address1||result.event.location_address||''):(result.event[k]??'');
    state.original[k]=v;
    if(form.elements[k]){
      if(k==='location_tbd')form.elements[k].checked=!!v;
      else{
       if(k==='district')preserveExistingDistrict(form.elements[k],v);
       form.elements[k].value=v;
      }
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
  $('modify-submit').textContent=state.mode==='cancel'?'Submit Cancellation →':'Submit Event Update →';
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
  notify('Your '+(state.mode==='cancel'?'cancellation':'update')+' submission was received.\nSubmission ID: '+result.request_code+'\nThe existing calendar listing remains unchanged until an inspector verifies and publishes the update.');
  $('existing-editor').classList.add('hidden');
 }catch(ex){notify(ex.message,true)}finally{busy(btn,false)}
};
let page=0,historyPage=0;
async function loadRequests(p=0){
 page=Math.max(0,p);const out=$('request-list');out.textContent='Loading calendar submissions…';
 try{
  const filters={page,search:$('filter-search').value,status:$('filter-status').value,from:$('filter-from').value,to:$('filter-to').value,type:$('filter-type').value,lodge:$('filter-lodge').value,event_from:$('filter-event-from').value,event_to:$('filter-event-to').value};
  const data=await api('requests',null,filters);
  $('count').textContent=data.total+' submission'+(data.total===1?'':'s');
  $('page-label').textContent='Page '+(page+1);
  $('prev-page').disabled=page===0;$('next-page').disabled=(page+1)*50>=data.total;
  out.replaceChildren();
  if(!data.items.length){out.textContent='No submissions match your filters.';return}
  for(const item of data.items){
   const b=document.createElement('button');b.className='request-row';
   b.innerHTML='<span><strong>'+safe(item.event_title||nice(item.request_type))+'</strong><small>'+safe(item.request_code)+' · '+safe(nice(item.request_type))+'</small></span><small class="date">'+safe(fmt(item.submitted_at))+'</small><span class="chip '+safe(item.status)+'">'+safe(nice(item.status))+'</span>';
   b.onclick=()=>detail(item.id);out.append(b);
  }
 }catch(e){out.textContent='Unable to load submissions.';toast(e.message,true)}
}
$('refresh-requests').onclick=()=>loadRequests(0);
$('prev-page').onclick=()=>loadRequests(page-1);
$('next-page').onclick=()=>loadRequests(page+1);

/* Inspector review and published-event management. The original submission is never overwritten. */
const editorFields=['title','event_type','hosted_by','district','start_local','end_local','event_mode','virtual_meeting_url','public_description',
 'location_name','location_address1','location_address2','location_city','location_state','location_zip','location_tbd',
 'attire','invited_audience','registration_url','payment_url','flyer_url','poc_name','poc_position','poc_phone','poc_email','cost_details'];
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
 f.addEventListener('invalid',e=>{
  const d=e.target.closest('details');if(d)d.open=true;
  if(f.querySelector(':invalid')===e.target)
   formFeedback(f,'Not saved: '+(e.target.closest('label')?.textContent.trim()||e.target.name)+': '+e.target.validationMessage,'error');
 },true);
 const source=$('new-form');
 for(const child of [...source.children]){
  if(child.classList.contains('form-title')&&child.textContent.includes('Your contact'))break;
  if(child.classList.contains('form-title')||child.classList.contains('form-grid')||child.matches('details')||child.matches('.location-tbd-control')){
   const node=child.cloneNode(true);
   node.removeAttribute('id');
   node.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
   f.appendChild(node);
  }
 }
 for(const key of editorFields){
  const field=f.elements[key];if(!field)continue;
  if(key==='location_tbd')field.checked=initial[key]===true;
  else{
   if(key==='district')preserveExistingDistrict(field,initial[key]);
   field.value=initial[key]??(key==='location_state'?'CA':'');
  }
 }
 // Older published events can have no dedicated POC; allow those to be edited without inventing contact data.
 for(const key of ['poc_name','poc_position','poc_phone','poc_email'])if(!initial[key]&&f.elements[key])f.elements[key].required=false;
 const details=f.querySelector('.location-details');
 if(details)details.open=false;
 locationControls(f);
 const controls=document.createElement('div');controls.className='form-actions';
 f.addEventListener('input',()=>formFeedback(f));
 f.addEventListener('change',()=>formFeedback(f));
 const caption=document.createElement('span');caption.textContent=buttonLabel==='Save & Update Calendar'?'Saving updates the published event and queues Google Calendar synchronization.':'Changes await inspector verification before calendar publication.';
 const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent=buttonLabel;
 const discard=document.createElement('button');discard.type='button';discard.className='secondary';discard.textContent='Discard';
 discard.onclick=()=>host.replaceChildren();
 controls.append(caption,discard,submit);f.append(controls);
 f.onsubmit=async e=>{
  e.preventDefault();busy(submit,true);
  formFeedback(f,'Saving changes…','pending');
  try{
   const data=values(f);
   const obj={};for(const key of editorFields)obj[key]=data[key]??(key==='location_tbd'?false:'');
   const result=await save(obj);
   if(f.isConnected)formFeedback(f,result===false?'No changes saved.':'Changes saved.',result===false?'pending':'success');
  }catch(error){formFeedback(f,'Not saved: '+error.message,'error')}finally{busy(submit,false)}
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
  case 'submitted':return h.request_type==='cancel'?'Cancellation submitted':h.request_type==='change'?'Event update submitted':'Event submitted';
  case 'approved':return h.request_type==='cancel'?'Cancellation verified for publication':h.request_type==='change'?'Update verified for publication':'Event verified for publication';
  case 'rejected':return 'Listing not published';
  case 'needs_correction':return 'Returned for correction';
  case 'inspector_edited':return 'Inspector revised submission';
  case 'inspector_updated_published':return 'Inspector updated published event';
  case 'inspector_undo_published':return 'Administrator undid inspector edit';
  case 'calendar_retry_requested':return 'Google Calendar retry queued';
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
// Read-only coordination advisory. Calendar overlaps are never publication blockers.
async function showCoordinationAdvisory(host,fields,currentEventId){
 const start=String(fields.start_local||'').slice(0,16);
 const end=String(fields.end_local||'').slice(0,16);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end)){
  host.textContent='Calendar coordination: verify the event date and time before publication.';
  return;
 }
 try{
  const url='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-upcoming-events?month='+encodeURIComponent(start.slice(0,7));
  const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw Error('Public calendar unavailable');
  const data=await response.json();
  const localTime=iso=>new Date(iso).toLocaleString('sv-SE',{timeZone:'America/Los_Angeles',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T');
  const lodgeName=String(fields.hosted_by||'').toLowerCase().trim();
  const district=String(fields.district||'').trim();
  const matches=(Array.isArray(data.events)?data.events:[]).filter(event=>{
   if(event.id===currentEventId)return false;
   const sameLodge=!!lodgeName&&String(event.hosted_by||'').toLowerCase().trim()===lodgeName;
   const sameDistrict=!!district&&String(event.district||'').trim()===district;
   if(!sameLodge&&!sameDistrict)return false;
   return localTime(event.starts_at)<end&&localTime(event.ends_at)>start;
  });
  if(!host.isConnected)return;
  host.replaceChildren();
  const heading=document.createElement('strong');heading.textContent='Calendar coordination (advisory only)';
  const note=document.createElement('p');note.textContent=matches.length
   ?matches.length+' potentially overlapping published event(s) in the same lodge or district: '+matches.slice(0,3).map(e=>e.title).join('; ')+(matches.length>3?'; and more':'')+'. Communicate with the hosts if useful. This does not prevent publication or change the lodge’s authority to schedule.'
   :'No overlapping published events found for this lodge or district in the selected month. This check does not include unpublished submissions.';
  host.append(heading,note);
 }catch{
  host.textContent='Calendar coordination check unavailable. Inspectors may review the public calendar manually. Publication is not blocked.';
 }
}

async function detail(id){
 const target=$('request-detail');target.classList.remove('hidden');target.textContent='Loading…';
 try{
  const d=await api('detail',null,{id}),r=d.request,p=r.proposed_fields||{},event=d.event||{};
  const submitted={...eventFormValues(event),...p};
  const effective={...eventFormValues(event),...(r.inspector_edits??p)};
  const address=[effective.location_address1,effective.location_address2,effective.location_city,effective.location_state,effective.location_zip].filter(Boolean).join(', ')||effective.location_address||'—';
  const pairs=[['Submission ID',r.request_code],['Submission type',nice(r.request_type)],['Submitted',fmt(r.submitted_at)],['Status',nice(r.status)],['Title',effective.title],['Event type',effective.event_type],['Hosting lodge',effective.hosted_by],['District',effective.district?('No. '+effective.district):'—'],['Start',effective.start_local],['End',effective.end_local],['Description',effective.public_description],['Event format',nice(effective.event_mode||'in_person')],['Venue',effective.location_tbd?'Location TBD':effective.location_name],['Address',effective.location_tbd?'Location TBD':address],['Event POC name',effective.poc_name],['Event POC position',effective.poc_position],['Event POC phone',effective.poc_phone],['Event POC email',effective.poc_email],['Cost',effective.cost_details],['Attire',effective.attire],['Attendees',effective.invited_audience],['Registration URL',effective.registration_url],['Payment URL',effective.payment_url],['Flyer / invitation URL',effective.flyer_url],['Cancellation reason',effective.reason],['Contact',r.requester_name],['Email',r.requester_email],['Telephone',r.requester_phone],['Message',r.requester_message]];
  target.innerHTML='<div class="review-title"><div><h2>'+safe(effective.title||nice(r.request_type))+'</h2><p class="muted">'+safe(r.request_code)+'</p></div><span class="chip '+safe(r.status)+'">'+safe(nice(r.status))+'</span></div><div class="detail-grid">'+pairs.map(([k,v])=>'<div><small>'+safe(k)+'</small>'+safe(v??'—')+'</div>').join('')+'</div><h3>Inspector revisions</h3><p class="help">The submitted details remain unchanged. Saved inspector corrections are recorded separately.</p><div id="request-diff"></div><div id="inspector-editor-host"></div><hr><h3>Review &amp; delivery</h3><label>Message to submitter (optional)<textarea id="review-note" rows="2"></textarea></label><div class="review-actions" id="review-actions"></div><div id="delivery-summary"></div><h3>Submission history</h3><div class="timeline" id="item-history"></div>';
  showDifferences($('request-diff'),submitted,effective);
  const advisory=document.createElement('div');
  advisory.className='coordination-advisory';advisory.setAttribute('role','status');
  advisory.textContent='Checking published calendar events for possible scheduling overlaps…';
  target.querySelector('.detail-grid')?.insertAdjacentElement('afterend',advisory);
  void showCoordinationAdvisory(advisory,effective,d.event?.id||r.event_id);
  const actions=$('review-actions');
  if(['pending','needs_correction'].includes(r.status)){
   if(['new','change'].includes(r.request_type)){
    const edit=document.createElement('button');edit.className='secondary';edit.textContent=r.inspector_edits?'Edit Saved Revision':'Edit Submission';
    edit.onclick=()=>inspectorEditor($('inspector-editor-host'),effective,async fields=>{
      const result=await api('inspector-edit',{id,expected_version:r.edit_version,fields});
      await detail(id);actionFeedback($('inspector-editor-host'),result.notice||'Inspector revision saved.');
    });
    actions.append(edit);
   }
   for(const [decision,label,style] of [['approved','Verify & Publish','primary'],['needs_correction','Return for Correction','secondary'],['rejected','Do Not Publish','danger']]){
    const button=document.createElement('button');button.className=style;button.textContent=label;
    button.onclick=()=>{
      if($('inspector-editor-host')?.querySelector('form')){toast('Save or discard your edits before reviewing.',true);return;}
      review(id,decision,r.edit_version);
    };
    actions.append(button);
   }
  }else{
   actions.textContent='Publication decision recorded. The original record remains in the history.';
  }
  const jobs=d.calendar||[],job=jobs[0],status=d.event?calendarState(d.event,job):null;
  const sent=(d.email||[]).filter(x=>x.status==='sent').length;
  const pending=(d.email||[]).filter(x=>['pending','sending'].includes(x.status)).length;
  const failures=(d.email||[]).filter(x=>x.status==='failed').length;
  $('delivery-summary').innerHTML='<p><b>Google Calendar:</b> '+safe(status?.label||(r.status==='approved'?'Queued':'Not yet published'))+'</p>'+(job?.last_error?'<p class="notice error">'+safe(job.last_error)+'</p>':'')+'<p><b>Email notifications:</b> '+sent+' sent'+(pending?', '+pending+' queued':'')+(failures?', '+failures+' failed':'')+'</p>';
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
 if(['approved','rejected'].includes(decision)&&!await divisionQuestion(decision==='approved'?'Verify this submission and queue Google Calendar publication? This verifies the listing, not the lodge’s authority to schedule its event.':'Mark this submission as not publishable? This does not cancel or prohibit the lodge activity.',{title:decision==='approved'?'Verify submission':'Do not publish',confirmLabel:decision==='approved'?'Verify & Publish':'Do Not Publish',danger:decision==='rejected'}))return;
 try{
  const note=$('review-note')?.value||'';
  if(decision==='needs_correction'&&!note.trim())throw Error('Explain what needs correction in the message to the submitter');
  actionFeedback($('review-actions'),'Saving publication decision…','pending');
  const result=await api('review',{id,decision,note,expected_version:version});
  await loadRequests(page);await detail(id);
  actionFeedback($('review-actions'),result.notice||'Publication decision saved.');
 }catch(e){actionFeedback($('review-actions'),'Not saved: '+e.message,'error')}
}

async function retryEventSync(event,after){
 try{
  const result=await api('calendar-retry',{id:event.id,expected_version:event.version});
  if(after)await after();
  actionFeedback($('event-actions'),result.notice||'Calendar retry queued.');
 }catch(ex){actionFeedback($('event-actions'),'Calendar retry not queued: '+ex.message,'error');}
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
    {name:'Awaiting Publication',value:counts.pending||0,kind:'requests',filter:'pending'},
    {name:'Returned for Correction',value:counts.corrections||0,kind:'requests',filter:'needs_correction'},
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
   btn.append(dashboardElement('strong','',req.title||'Event submission'),
     dashboardElement('small','muted',(req.code||'')+' · '+nice(req.status)+' · '+fmt(req.submitted_at)));
   btn.onclick=async()=>{await activateInspectorTab('requests');await detail(req.id)};
   requests.append(btn);
  }
  if(!d.requests?.length)requests.append(dashboardElement('p','muted','No submissions awaiting verification.'));
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
   btn.append(dashboardElement('strong','',item.event_title||'Event submission'),
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
$('dashboard-refresh').onclick=()=>Promise.allSettled([loadDashboard(),window.loadCalendarSync?.(),window.loadWebsitePreview?.()]);
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
  host.innerHTML='<h2>'+safe(ev.title)+'</h2><p class="muted">'+safe(ev.event_code)+' · '+safe(nice(ev.status))+'</p><p><b>Starts:</b> '+safe(fmt(ev.starts_at))+' · <b>Location:</b> '+safe(ev.location_name||'Location TBD')+'</p><p><b>Event point of contact:</b> '+safe(ev.poc_name||'Not provided')+(ev.poc_position?' ('+safe(ev.poc_position)+')':'')+(ev.poc_phone?' · '+safe(ev.poc_phone):'')+(ev.poc_email?' · '+safe(ev.poc_email):'')+'</p>'+(ev.cost_details?'<p><b>Cost:</b> '+safe(ev.cost_details)+'</p>':'')+'<p><b>Google Calendar:</b> <span class="chip '+status.tone+'">'+safe(status.label)+'</span></p>'+(job?.last_error?'<p class="notice error">Sync issue: '+safe(job.last_error)+'</p>':'')+'<div class="review-actions" id="event-actions"></div><div id="event-editor-host"></div><h3>Recent history</h3><div id="event-history" class="timeline"></div>';
  const actions=$('event-actions');
  if(ev.status==='active'){
   const edit=document.createElement('button');edit.className='secondary';edit.textContent='Edit Published Event';
   edit.onclick=()=>inspectorEditor($('event-editor-host'),initial,
     async fields=>{
       const result=await savePublishedInspectorEdit(ev,fields);
       if(result){
        await loadEvents(eventPage);await eventDetail(ev.id);
        actionFeedback($('event-actions'),result.notice||'Saved. Google Calendar update queued.');
       }
       return !!result;
      },
     'Save & Update Calendar');
   const cancel=document.createElement('button');cancel.className='danger';cancel.textContent='Cancel Event';
   cancel.onclick=async()=>{
    const reason=await divisionQuestion('Cancel '+ev.title+'? Enter the cancellation reason. This will queue removal from Google Calendar.',{title:'Cancel Event',input:true,confirmLabel:'Confirm Cancellation',danger:true});
    if(!reason)return;
    cancel.disabled=true;
    try{
     const result=await api('inspector-cancel-event',{event_id:ev.id,reason});
     await loadEvents(eventPage);await eventDetail(ev.id);
     actionFeedback($('event-actions'),result.notice||'Cancellation confirmed. Calendar update queued.');
    }catch(ex){actionFeedback($('event-actions'),'Cancellation not saved: '+ex.message,'error');cancel.disabled=false;}
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
     await loadEvents(eventPage);await eventDetail(ev.id);
     actionFeedback($('event-actions'),result.notice||'Previous version restored.');
    }catch(ex){actionFeedback($('event-actions'),'Undo failed: '+ex.message,'error');undo.disabled=false;}
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
 if($('admin-view').classList.contains('mfa-locked')){
  toast('Complete authenticator verification to access the Inspector Desk.',true);return;
 }
 if((key==='staff'||key==='settings'||key==='lodges'||key==='corrections')&&state.staff?.role!=='admin'){
  toast('Administrator access is required to manage lodges, inspectors or website settings.',true);
  return;
 }
 all('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===key));
 all('.desk-nav-menu').forEach(menu=>{
  menu.classList.toggle('active',!!menu.querySelector('.tab.active'));
  menu.open=false;
 });
 for(const k of ['dashboard','import','lodges','corrections','requests','events','resources','history','staff','settings'])
  $('tab-'+k).classList.toggle('hidden',k!==key);
 if(key==='dashboard'){await Promise.allSettled([loadDashboard(),window.loadCalendarSync?.(),window.loadWebsitePreview?.()]);}
 if(key==='lodges')await window.loadLodges?.();
 if(key==='corrections')await window.loadCorrections?.();
 if(key==='requests')await loadRequests(0);
 if(key==='import')await window.loadBulkImport?.();
 if(key==='events')await loadEvents(0);
 if(key==='resources')await window.loadResources?.();
 if(key==='history')await loadHistory(0);
 if(key==='staff')await loadStaff();
 if(key==='settings')await Promise.allSettled([loadSettings(),window.loadWebsiteSettings?.()]);
}
all('.tab').forEach(t=>t.onclick=()=>activateInspectorTab(t.dataset.tab));
// Native details/summary menus support keyboard, touch, and mouse.
const deskMenus=all('.desk-nav-menu');
for(const menu of deskMenus){
 menu.querySelector('summary').addEventListener('click',()=>{
  for(const other of deskMenus)if(other!==menu)other.open=false;
 });
}
document.addEventListener('click',event=>{
 if(!event.target.closest('.desk-tabs'))for(const menu of deskMenus)menu.open=false;
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 const current=deskMenus.find(menu=>menu.open);
 if(current){current.open=false;current.querySelector('summary').focus();}
});
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
    const navigate=document.createElement('button');navigate.type='button';navigate.className='secondary';navigate.textContent=h.request_id?'View Submission':'View Event';
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
const staffProfileFields=['email','display_name','phone','role','first_name','middle_name','last_name','office_title','district','member_number','home_phone','mobile_phone','home_address','home_address2','city','state','zip'];
function staffFormRequirements(){
 const form=$('staff-form');
 const required=form.dataset.editing!=='1'&&form.elements.role.value==='inspector';
 for(const key of ['member_number','first_name','last_name','district','mobile_phone','home_address','city','state','zip']){
  form.elements[key].required=required;
 }
}
function clearStaffForm(){
 const form=$('staff-form');form.reset();formFeedback(form);
 form.dataset.editing='0';form.elements.email.readOnly=false;
 form.elements.state.value='CA';form.elements.office_title.value='Inspector';
 $('staff-form-mode').textContent='Add Inspector';
 staffFormRequirements();
}
$('staff-new').onclick=()=>{clearStaffForm();$('staff-form').scrollIntoView({behavior:'smooth',block:'start'})};
$('staff-form-clear').onclick=clearStaffForm;
$('staff-form').elements.role.addEventListener('change',staffFormRequirements);
staffFormRequirements();
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
   meta.textContent=[s.email,nice(s.role),s.district?'District '+s.district:null,s.member_number?'Member '+s.member_number:null,access].filter(Boolean).join(' · ');
   info.append(name,document.createElement('br'),meta);
   const buttons=document.createElement('div');buttons.className='staff-actions';
   if(s.removed_at){
    const restore=document.createElement('button');restore.type='button';restore.className='secondary';
    restore.textContent='Restore access';
    restore.onclick=async()=>{
     if(!await divisionQuestion('Restore inspector access for '+(s.display_name||s.email)+'?',{title:'Restore inspector',confirmLabel:'Restore access'}))return;
     try{
      const result=await api('staff-restore',{id:s.id});await loadStaff();
      actionFeedback($('staff-list'),result.message||'Inspector access restored.');
     }catch(ex){actionFeedback(buttons,'Restore failed: '+ex.message,'error')}
    };
    buttons.append(restore);
   }else{
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Edit';
    edit.onclick=()=>{
     const form=$('staff-form');
     for(const key of staffProfileFields)form.elements[key].value=s[key]??'';
     form.elements.enabled.checked=s.enabled;
     form.dataset.editing='1';
     form.elements.email.readOnly=true;
     $('staff-form-mode').textContent='Edit Inspector: '+(s.display_name||s.email);
     staffFormRequirements();
     form.scrollIntoView({behavior:'smooth',block:'start'});
    };
    buttons.append(edit);
    if(s.role==='inspector'){
     const toggle=document.createElement('button');
     toggle.type='button';
     toggle.className=s.enabled?'secondary':'primary';
     toggle.textContent=s.enabled?'Deactivate':'Activate';
     toggle.setAttribute('aria-label',(s.enabled?'Deactivate ':'Activate ')+(s.display_name||s.email));
     toggle.title=s.enabled?'Temporarily disable sign-in and inspector access':'Restore sign-in and inspector access';
     toggle.onclick=async event=>{
      // Handle the status change entirely within this row: no list replacement,
      // edit-form navigation, or scroll/focus changes.
      event.preventDefault();
      event.stopPropagation();
      if(toggle.dataset.pending==='1')return;
      toggle.dataset.pending='1';
      toggle.disabled=true;
      const requested=!s.enabled;
      try{
       const result=await api('staff-toggle',{
        id:s.id,expected_enabled:s.enabled,enabled:requested
       });
       // Update only the record status on success, leaving every other
       // element (including the editing form and scroll position) untouched.
       s.enabled=result.staff.enabled===true;
       const updatedAccess=s.enabled?'Active':'Disabled';
       meta.textContent=[s.email,nice(s.role),
        s.district?'District '+s.district:null,
        s.member_number?'Member '+s.member_number:null,
        updatedAccess].filter(Boolean).join(' · ');
       toggle.textContent=s.enabled?'Deactivate':'Activate';
       toggle.className=s.enabled?'secondary':'primary';
       toggle.setAttribute('aria-label',(s.enabled?'Deactivate ':'Activate ')+(s.display_name||s.email));
       toggle.title=s.enabled?'Temporarily disable sign-in and inspector access':'Restore sign-in and inspector access';
       actionFeedback(buttons,result.message||'Inspector access updated.');
      }catch(ex){
       actionFeedback(buttons,'Access not updated: '+ex.message,'error');
      }finally{
       toggle.disabled=false;
       delete toggle.dataset.pending;
      }
     };
     buttons.append(toggle);
     const remove=document.createElement('button');remove.type='button';remove.className='danger';
     remove.textContent='Remove inspector';
     remove.onclick=async()=>{
      if(!await divisionQuestion('Remove access for '+(s.display_name||s.email)+'?\n\nTheir previous publication decisions and history will be preserved. Access can be restored later.',{title:'Remove inspector',confirmLabel:'Remove access',danger:true}))return;
      try{
       const result=await api('staff-remove',{id:s.id});await loadStaff();
       actionFeedback($('staff-list'),result.message||'Inspector access removed.');
      }catch(ex){actionFeedback(buttons,'Remove failed: '+ex.message,'error')}
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
$('staff-form').addEventListener('invalid',e=>{
 if(e.currentTarget.querySelector(':invalid')!==e.target)return;
 formFeedback(e.currentTarget,'Not saved: '+(e.target.closest('label')?.textContent.trim()||e.target.name)+': '+e.target.validationMessage,'error');
},true);
$('staff-form').addEventListener('input',()=>formFeedback($('staff-form')));
$('staff-form').addEventListener('change',()=>formFeedback($('staff-form')));
$('staff-form').onsubmit=async e=>{
 e.preventDefault();const b=e.submitter;busy(b,true);
 formFeedback(e.target,'Saving inspector record…','pending');
 try{
  const payload=values(e.target);
  if(e.target.dataset.editing!=='1'&&payload.role==='inspector'&& !e.target.reportValidity())return;
  const result=await api('staff-save',payload);
  clearStaffForm();
  await loadStaff();
  formFeedback($('staff-form'),result.message||'Inspector information saved.');
 }catch(ex){formFeedback(e.target,'Inspector record not saved: '+ex.message,'error')}
 finally{busy(b,false)}
};
async function loadSettings(){
 try{const s=await api('settings');$('email-links').value=s.settings.public_email_links||''}catch(e){toast(e.message,true)}
}
$('save-links').onclick=async()=>{
 const btn=$('save-links');btn.disabled=true;
 actionFeedback(btn,'Saving email subscription links…','pending');
 try{
  await api('settings-save',{key:'public_email_links',value:$('email-links').value});
  actionFeedback(btn,'Email subscription links saved.');
 }catch(e){actionFeedback(btn,'Email links not saved: '+e.message,'error')}
 finally{btn.disabled=false}
};
$('email-links').addEventListener('input',()=>actionFeedback($('save-links')));
window.openBulkSubmission=async id=>{await activateInspectorTab('requests');await detail(id)};
window.divisionAppReady = true;
acceptRedirect().finally(init);
