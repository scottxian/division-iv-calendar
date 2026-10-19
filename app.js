// Load Supabase from either CDN. A failed dependency must not fail silently.
let createClient;
for (const cdn of [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  'https://esm.sh/@supabase/supabase-js@2'
]) {
  try {
    const mod = await import(cdn);
    if (typeof mod.createClient === 'function') {
      createClient = mod.createClient;
      break;
    }
  } catch (err) {
    console.warn('Unable to load Supabase client from', cdn, err);
  }
}
if (!createClient) {
  const notice = document.getElementById('notice');
  if (notice) {
    notice.className = 'notice error';
    notice.textContent = 'The sign-in service did not load. Try refreshing this page with Ctrl+F5. If the problem continues, please tell an administrator.';
  }
  throw new Error('All Supabase client CDNs failed to load');
}
const ROOT='https://lxvceqshpjnjjlllbpaq.supabase.co';
const KEY='sb_publishable_8wAnbhewmF5a0E2IRUaPhA_swWBgUm_';
const db=createClient(ROOT,KEY,{auth:{persistSession:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const all=(q,p=document)=>[...p.querySelectorAll(q)];
const fmt=s=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}):'—';
const local=s=>s?new Date(s).toLocaleString('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T'):'';
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const nice=s=>String(s??'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const state={view:'public',mode:'new',staff:null,user:null,config:null,event:null,original:null,page:0,historyPage:0,total:0};
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
 if(view==='admin')loadRequests(0);
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
  for(const k of ['title','event_type','hosted_by','district','start_local','end_local','event_mode','location_name','location_address','location_tbd','public_description','attire','invited_audience','registration_url','payment_url','flyer_url'])event[k]=f[k]??'';
  const result=await api('submit',{kind:'new',name:f.contact_name,email:f.contact_email,phone:f.contact_phone,message:f.contact_message,website:f.website||'',turnstile_token:turnstileToken,event});
  notify('Request received.\nRequest ID: '+result.request_code+'\nSave this number. Your event is pending inspector review, not yet published.');
  e.target.reset();turnstileToken='';if(window.turnstile)window.turnstile.reset();
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
  for(const k of ['title','event_type','location_name','location_address','public_description','location_tbd']){
   const v=result.event[k]??'';state.original[k]=v;
   if(form.elements[k]){
     if(k==='location_tbd')form.elements[k].checked=!!v;
     else form.elements[k].value=v;
   }
  }
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
  const filters={page,status:$('filter-status').value,from:$('filter-from').value,to:$('filter-to').value,type:$('filter-type').value,lodge:$('filter-lodge').value,event_from:$('filter-event-from').value,event_to:$('filter-event-to').value};
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
async function detail(id){
 const target=$('request-detail');target.classList.remove('hidden');target.textContent='Loading…';
 try{
  const d=await api('detail',null,{id}),r=d.request,p=r.proposed_fields||{},event=d.event||{};
  const pairs=[['Request',r.request_code],['Request type',nice(r.request_type)],['Submitted',fmt(r.submitted_at)],['Status',nice(r.status)],['Title',p.title||event.title],['Event type',p.event_type||event.event_type],['Lodge',p.hosted_by||event.hosted_by],['Date / start',p.start_local||fmt(event.starts_at)],['Date / end',p.end_local||fmt(event.ends_at)],['Location',p.location_name??event.location_name??'TBD'],['Address',p.location_address??event.location_address??''],['Contact',r.requester_name],['Email',r.requester_email]];
  target.innerHTML='<h2>'+safe(p.title||event.title||nice(r.request_type))+'</h2><p class="muted">'+safe(r.request_code)+'</p><div class="detail-grid">'+pairs.map(([k,v])=>'<div><small>'+safe(k)+'</small>'+safe(v||'—')+'</div>').join('')+'</div><hr><h3>Review &amp; delivery</h3><label>Message to submitter (optional)<textarea id="review-note" rows="2"></textarea></label><div class="review-actions" id="review-actions"></div><div id="delivery-summary"></div><h3>History</h3><div class="timeline" id="item-history"></div>';
  const actions=$('review-actions');
  if(['pending','needs_correction'].includes(r.status)){
   for(const [decision,text,style] of [['approved','Approve & queue publication','primary'],['needs_correction','Request correction','secondary'],['rejected','Reject','danger']]){
    const b=document.createElement('button');b.className=style;b.textContent=text;b.onclick=()=>review(id,decision);actions.append(b);
   }
  }else actions.textContent='Decision recorded. No further action required.';
  $('delivery-summary').innerHTML='<p><b>Calendar:</b> '+safe((d.calendar||[]).map(x=>nice(x.status)).join(', ')||'Not queued')+'</p><p><b>Emails:</b> '+safe((d.email||[]).map(x=>nice(x.status)).join(', ')||'Not queued')+'</p>';
  const hist=$('item-history');for(const h of d.history||[]){const div=document.createElement('div');div.innerHTML='<b>'+safe(nice(h.action))+'</b><br><small>'+safe(fmt(h.occurred_at))+' · '+safe(h.actor_email||'System')+'</small>';hist.append(div)}
  target.scrollIntoView({block:'start',behavior:'smooth'});
 }catch(e){target.textContent=e.message;toast(e.message,true)}
}
async function review(id,decision){
 if(['approved','rejected'].includes(decision)&&!confirm(decision==='approved'?'Approve request and queue publication?':'Reject this request?'))return;
 try{
  const result=await api('review',{id,decision,note:$('review-note')?.value||''});
  toast(result.notice||'Decision saved');await loadRequests(page);await detail(id);
 }catch(e){toast(e.message,true)}
}
all('.tab').forEach(t=>t.onclick=async()=>{
 all('.tab').forEach(x=>x.classList.toggle('active',x===t));
 const key=t.dataset.tab;
 for(const k of ['requests','history','staff','settings'])$('tab-'+k).classList.toggle('hidden',k!==key);
 if(key==='requests')await loadRequests(0);
 if(key==='history')await loadHistory(0);
 if(key==='staff')await loadStaff();
 if(key==='settings')await loadSettings();
});
async function loadHistory(p=0){
 historyPage=Math.max(0,p);const el=$('history-content');el.textContent='Loading…';
 try{
  const d=await api('audit',null,{page:historyPage});el.replaceChildren();
  for(const h of d.items){const x=document.createElement('div');x.innerHTML='<b>'+safe(nice(h.action))+'</b><br><small>'+safe(fmt(h.occurred_at))+' · '+safe(h.actor_email||'System')+'</small>';el.append(x)}
  if(!d.items.length)el.textContent='No events recorded.';
  $('history-page').textContent='Page '+(p+1)+' · '+d.total+' actions';
  $('history-prev').disabled=p===0;$('history-next').disabled=(p+1)*50>=d.total;
 }catch(e){el.textContent=e.message}
}
$('refresh-history').onclick=()=>loadHistory(0);
$('history-prev').onclick=()=>loadHistory(historyPage-1);
$('history-next').onclick=()=>loadHistory(historyPage+1);
async function loadStaff(){
 const root=$('staff-list');root.textContent='Loading…';
 try{
  const r=await api('staff');root.replaceChildren();
  for(const s of r.items){
   const row=document.createElement('div');row.className='staff-row';const info=document.createElement('div');
   info.innerHTML='<strong>'+safe(s.display_name||s.email)+'</strong><br><small>'+safe(s.email)+' · '+safe(s.role)+' · '+(s.enabled?'Enabled':'Disabled')+'</small>';
   const b=document.createElement('button');b.className='secondary';b.textContent='Edit';
   b.onclick=()=>{const f=$('staff-form');for(const k of ['email','display_name','phone','role'])f.elements[k].value=s[k]||'';f.elements.enabled.checked=s.enabled;f.scrollIntoView({behavior:'smooth'})};
   row.append(info,b);root.append(row);
  }
 }catch(e){root.textContent=e.message}
}
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
init();
