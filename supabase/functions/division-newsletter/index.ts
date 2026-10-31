
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://divisionivmasons.org','https://www.divisionivmasons.org','http://127.0.0.1:5173','http://localhost:5173']);
const fromEnv=()=>Deno.env.get('MAIL_FROM')||'';
const key=()=>Deno.env.get('RESEND_API_KEY')||'';
const resp=(data:any,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','vary':'Origin',...(origins.has(origin)?{'access-control-allow-origin':origin}:{})}});
const message=(value:any)=>String(value??'').trim();
const goodEmail=(s:string)=>s.length<=250&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const escapeHTML=(v:any)=>message(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const utcDate=(v:any)=>new Date(v).toISOString();
const allowedFields=['sending_enabled','signup_enabled','free_plan_confirmed','resend_segment_id'];
async function config(){const {data,error}=await db.from('newsletter_settings').select('*').eq('id',true).single();if(error)throw Error('Newsletter settings unavailable');return data;}
async function resend(path:string,method='GET',body?:unknown){
 if(!key())throw Error('Resend is not configured');
 const r=await fetch('https://api.resend.com'+path,{method,headers:{authorization:'Bearer '+key(),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error('Resend '+r.status+': '+message(data?.message||data?.name||'Request rejected').slice(0,160));
 return data;
}
async function admin(req:Request){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)throw Error('Admin sign-in required');
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.email)throw Error('Invalid admin session');
 const {data:staff}=await db.from('staff_accounts').select('id,email,role,enabled,removed_at').eq('email',user.email.toLowerCase()).eq('role','admin').eq('enabled',true).is('removed_at',null).maybeSingle();
 if(!staff)throw Error('Admin account required');
 const {data:factors,error:factorError}=await db.auth.admin.mfa.listFactors({userId:user.id});
 if(factorError||!factors?.factors?.some((f:any)=>f.status==='verified'&&['totp','phone'].includes(f.factor_type)))throw Error('Verified authenticator required');
 const claims=JSON.parse(atob((token.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/')));
 if(claims.sub!==user.id||claims.aal!=='aal2')throw Error('Complete authenticator verification');
 return staff;
}
function localParts(date=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
 return {month:parts.year+'-'+parts.month,day:Number(parts.day),hour:Number(parts.hour),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday)};
}
const friendlyDate=s=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(s));
const eventLink=id=>'https://divisionivmasons.org/calendar/?event='+encodeURIComponent(id)+'#events-list';
async function issue(kind:string,settings:any){
 const now=new Date(),until=new Date(now.getTime()+settings.lookahead_days*86400000).toISOString();
 const [ev,flags,jobs]=await Promise.all([
  db.from('events').select('id,title,hosted_by,starts_at,ends_at,event_mode,location_name,location_address,location_tbd,public_description,invited_audience,attire,status,version,google_event_id,calendar_last_synced_at').gte('starts_at',now.toISOString()).lt('starts_at',until).order('starts_at',{ascending:true}).limit(300),
  db.from('newsletter_event_flags').select('event_id,event_version,change_kind,changed_at').eq('dirty',true).order('changed_at',{ascending:true}).limit(1000),
  db.from('calendar_jobs').select('event_id,event_version,status,action,created_at').order('created_at',{ascending:false}).limit(5000)
 ]);
 if(ev.error||flags.error||jobs.error)throw Error('Could not load published newsletter events');
 const latest=new Map<string,any>();for(const j of jobs.data||[]){if(!latest.has(j.event_id))latest.set(j.event_id,j);}
 const dirty=new Map((flags.data||[]).map((f:any)=>[f.event_id,f]));
 const current=(ev.data||[]).filter((e:any)=>{
  const j=latest.get(e.id);
  return j?.status==='succeeded'&&j.event_version===e.version&&e.google_event_id&&e.calendar_last_synced_at;
 });
 const active=current.filter((e:any)=>e.status==='active'&&(kind==='monthly'||dirty.has(e.id)));
 const cancelled=current.filter((e:any)=>e.status==='cancelled'&&dirty.get(e.id)?.change_kind==='cancelled');
 const list=[...active,...cancelled].sort((a:any,b:any)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 const versions=list.filter((e:any)=>dirty.has(e.id)).map((e:any)=>({id:e.id,version:dirty.get(e.id).event_version}));
 const groups={new:[],updated:[],cancelled:[],upcoming:[]} as Record<string,any[]>;
 for(const e of list){
  const flag=dirty.get(e.id);
  const group=e.status==='cancelled'?'cancelled':flag?(flag.change_kind==='new'?'new':'updated'):'upcoming';
  groups[group].push(e);
 }
 const label=kind==='monthly'?'Division IV Events Digest':'Division IV Calendar Updates';
 const subject=label+' — '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'long',year:'numeric'}).format(now);
 const section=(title:string,items:any[])=>items.length?'<h2 style="color:#142d46;font-size:20px;margin-top:26px">'+escapeHTML(title)+'</h2>'+items.map((e:any)=>{
  const when=friendlyDate(e.starts_at);
  const where=e.event_mode==='online'?'Online event':e.location_tbd?'Location TBD':[e.location_name,e.location_address].filter(Boolean).join(', ');
  return '<div style="padding:14px 0;border-bottom:1px solid #e3dfd5"><strong>'+escapeHTML(e.title)+'</strong><div>'+escapeHTML(when)+'</div><div>'+escapeHTML(where)+'</div><div>'+escapeHTML(e.hosted_by||'')+'</div><a href="'+eventLink(e.id)+'">Details / Add to Calendar</a></div>';
 }).join(''):'';
 const html='<div style="font-family:Arial,sans-serif;max-width:670px;margin:auto;line-height:1.6;color:#20364e"><div style="background:#0b2138;color:#fff;padding:24px"><small style="color:#d7b56e">DIVISION IV MASONS</small><h1 style="color:white">'+escapeHTML(label)+'</h1></div><p>Published events and calendar changes for the Division IV Masonic community.</p>'+
  section('New events',groups.new)+section('Updated events',groups.updated)+section('Cancelled events',groups.cancelled)+section('Upcoming events',groups.upcoming)+
  (!list.length?'<p>No published events are currently listed for this period.</p>':'')+
  '<p><a href="https://divisionivmasons.org/calendar/">View the full Division IV calendar</a></p><p style="font-size:12px;color:#5b6875">Saved personal-calendar copies do not automatically update after a change.</p><p style="font-size:12px">Unsubscribe: <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Stop receiving newsletters</a>.</p></div>';
 const text=[label,'Division IV calendar: https://divisionivmasons.org/calendar/',...Object.entries(groups).flatMap(([name,items])=>items.length?[name.toUpperCase(),...items.map((e:any)=>e.title+' — '+friendlyDate(e.starts_at)+' — '+eventLink(e.id))]:[]),'Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}'].join('\n\n');
 return {kind,subject,html,text,groups,versions,items:list.length};
}
async function subscribe(req:Request,settings:any){
 if(!settings.signup_enabled||!settings.free_plan_confirmed||!settings.resend_segment_id||!fromEnv()||!key())return {message:'Newsletter signup is not yet open.'};
 const body=await req.json(),email=message(body.email).toLowerCase();
 if(body.website||!goodEmail(email))return {message:'If signup is available, please check your inbox for confirmation.'};
 const ip=message(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').slice(0,200);
 const keyHash=await hash('division-iv-newsletter:'+ip);
 const hour=new Date(Math.floor(Date.now()/3600000)*3600000).toISOString();
 const {data:limit}=await db.from('newsletter_signup_limits').select('bucket,attempts').eq('key_hash',keyHash).maybeSingle();
 if(limit?.bucket===hour&&limit.attempts>=5)return {message:'Please try again later.'};
 const {error:limitError}=await db.from('newsletter_signup_limits').upsert({key_hash:keyHash,bucket:hour,attempts:limit?.bucket===hour?limit.attempts+1:1,updated_at:new Date().toISOString()});
 if(limitError)throw Error('Unable to accept subscriptions right now');
 const {count}=await db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active');
 if((count||0)>=Math.min(settings.contact_cap,900))return {message:'Newsletter signup is temporarily full.'};
 const {data:old}=await db.from('newsletter_subscribers').select('status,last_confirmation_sent_at').eq('email',email).maybeSingle();
 if(old?.status==='active')return {message:'If this address is eligible, please check your inbox.'};
 if(old?.last_confirmation_sent_at&&Date.now()-Date.parse(old.last_confirmation_sent_at)<12*3600000)return {message:'If this address is eligible, please check your inbox.'};
 const token=crypto.randomUUID()+crypto.randomUUID(),token_hash=await hash(token);
 const {error}=await db.from('newsletter_subscribers').upsert({email,status:'pending',token_hash,token_expires_at:new Date(Date.now()+48*3600000).toISOString(),requested_at:new Date().toISOString(),last_confirmation_sent_at:new Date().toISOString()},{onConflict:'email'});
 if(error)throw Error('Unable to create signup request');
 const link='https://divisionivmasons.org/calendar/?newsletter_confirm='+encodeURIComponent(token);
 const reply=await resend('/emails','POST',{from:fromEnv(),to:[email],subject:'Confirm Division IV newsletter subscription',text:'Confirm your subscription to the Division IV Events Newsletter:\n'+link+'\n\nThis link expires in 48 hours. If you did not request this, ignore the message.'});
 if(!reply?.id)throw Error('Confirmation email could not be sent');
 return {message:'If this address is eligible, please check your inbox for a confirmation link.'};
}
async function confirm(req:Request,settings:any){
 const body=await req.json(),token=message(body.token);
 if(!/^[a-f0-9-]{72}$/i.test(token))throw Error('Invalid confirmation link');
 const token_hash=await hash(token);
 const {data:s}=await db.from('newsletter_subscribers').select('id,email,status,token_expires_at').eq('token_hash',token_hash).maybeSingle();
 if(!s||s.status!=='pending'||Date.parse(s.token_expires_at)<Date.now())throw Error('This confirmation link has expired. Please subscribe again.');
 if(!settings.signup_enabled||!settings.free_plan_confirmed)throw Error('Signup is temporarily paused.');
 const {count}=await db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active');
 if((count||0)>=Math.min(settings.contact_cap,900))throw Error('Newsletter signup is full.');
 // Resend contact setup is performed only after email ownership is verified.
 const contact=await resend('/contacts','POST',{email:s.email,unsubscribed:false,segments:[{id:settings.resend_segment_id}]});
 const {error}=await db.from('newsletter_subscribers').update({status:'active',token_hash:null,token_expires_at:null,confirmed_at:new Date().toISOString(),provider_contact_id:contact.id||null,provider_synced_at:new Date().toISOString()}).eq('id',s.id).eq('status','pending');
 if(error)throw Error('Contact created; administrator reconciliation required');
 return {message:'You are subscribed to Division IV newsletter updates.'};
}
async function summary(){
 const [settings,count,recent]=await Promise.all([config(),db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active'),db.from('newsletter_runs').select('id,kind,issue_key,state,created_at,sent_at,error_message,provider_broadcast_id,content_summary').order('created_at',{ascending:false}).limit(25)]);
 return {settings,subscribers:count.count||0,runs:recent.data||[],resend_configured:!!key()&&!!fromEnv()};
}
async function sendIssue(kind:string,settings:any,staffId?:string){
 if(!settings.sending_enabled||!settings.free_plan_confirmed||!settings.resend_segment_id)throw Error('Newsletter sending is paused or the free-plan/segment confirmation is incomplete.');
 if(!key()||!fromEnv())throw Error('Resend email sender is not configured');
 const {count}=await db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active');
 if(!count||count>settings.contact_cap||count>900)throw Error('No verified subscribers or the free-tier safety cap has been reached');
 const local=localParts(),issueKey=kind==='monthly'?'monthly:'+local.month:kind==='weekly'?'weekly:'+new Date().toISOString().slice(0,10):'manual:'+new Date().toISOString().slice(0,13);
 const {data:existing}=await db.from('newsletter_runs').select('id,state').eq('issue_key',issueKey).maybeSingle();
 if(existing)return {status:'already_processed',state:existing.state,issue_key:issueKey};
 const built=await issue(kind==='manual'?'monthly':kind,settings);
 if(kind==='weekly'&&!built.versions.length)return {status:'skipped',reason:'no_calendar_changes'};
 const {data:run,error:insertError}=await db.from('newsletter_runs').insert({issue_key:issueKey,kind,state:'prepared',event_versions:built.versions,content_summary:{events:built.items,subscribers:count,monthly:kind!=='weekly'},created_by:staffId||null}).select('id').single();
 if(insertError)throw Error('Issue already claimed or database unavailable');
 try{
  // Draft-first: keep provider ID before making a single non-retriable send call.
  const draft=await resend('/broadcasts','POST',{segment_id:settings.resend_segment_id,from:fromEnv(),subject:built.subject,html:built.html,text:built.text,send:false});
  if(!draft?.id)throw Error('Broadcast draft ID missing');
  await db.from('newsletter_runs').update({provider_broadcast_id:draft.id,state:'sending'}).eq('id',run.id);
  await resend('/broadcasts/'+encodeURIComponent(draft.id)+'/send','POST',{});
  const {error:finishError}=await db.from('newsletter_runs').update({state:'submitted',sent_at:new Date().toISOString()}).eq('id',run.id);
  if(finishError)throw Error('Provider accepted newsletter; status requires reconciliation');
  // Clear only versions actually covered; a newer event edit stays flagged.
  for(const item of built.versions)await db.from('newsletter_event_flags').update({dirty:false,announced_at:new Date().toISOString()}).eq('event_id',item.id).eq('event_version',item.version);
  return {status:'submitted',issue_key:issueKey,events:built.items,subscribers:count};
 }catch(error){
  await db.from('newsletter_runs').update({state:'needs_review',error_message:message(error).slice(0,700)}).eq('id',run.id);
  throw Error('Newsletter requires administrator review. Do not retry blindly: '+message(error));
 }
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origins.has(origin)?origin:'null','access-control-allow-headers':'authorization,content-type,apikey,x-newsletter-secret','access-control-allow-methods':'GET,POST','vary':'Origin'}});
 if(origin&&!origins.has(origin))return resp({error:'Origin not permitted'},403,origin);
 const action=new URL(req.url).searchParams.get('action')||'status';
 try{
  if(action==='status'&&req.method==='GET'){const s=await config();return resp({signup_enabled:!!(s.signup_enabled&&s.free_plan_confirmed&&s.resend_segment_id&&key()&&fromEnv())},200,origin);}
  if(action==='subscribe'&&req.method==='POST')return resp(await subscribe(req,await config()),200,origin);
  if(action==='confirm'&&req.method==='POST')return resp(await confirm(req,await config()),200,origin);
  if(action==='cron'&&req.method==='POST'){
   if(!Deno.env.get('JOB_RUNNER_SECRET')||req.headers.get('x-newsletter-secret')!==Deno.env.get('JOB_RUNNER_SECRET'))return resp({error:'Unauthorized'},401,origin);
   const s=await config(),p=localParts();
   if(!s.sending_enabled||p.hour!==s.send_hour)return resp({status:'paused_or_not_due'},200,origin);
   const output=[];
   if(p.day===s.monthly_day)output.push(await sendIssue('monthly',s));
   if(p.weekday===s.weekly_day && p.day!==s.monthly_day)output.push(await sendIssue('weekly',s));
   return resp({status:'checked',output},200,origin);
  }
  const who=await admin(req);
  if(action==='admin-status'&&req.method==='GET')return resp(await summary(),200,origin);
  if(action==='preview'&&req.method==='GET'){
   const kind=new URL(req.url).searchParams.get('kind')==='weekly'?'weekly':'monthly';
   const data=await issue(kind,await config());
   return resp({kind,html:data.html,subject:data.subject,groups:Object.fromEntries(Object.entries(data.groups).map(([k,v])=>[k,v.length])),included_events:data.items},200,origin);
  }
  if(action==='save'&&req.method==='POST'){
   const body=await req.json(),old=await config();
   const data:any={updated_at:new Date().toISOString(),updated_by:who.id};
   for(const f of allowedFields)if(Object.hasOwn(body,f))data[f]=body[f];
   for(const f of ['signup_enabled','sending_enabled','free_plan_confirmed'])if(f in data)data[f]=data[f]===true;
   if(data.resend_segment_id&&!/^[a-f0-9-]{36}$/i.test(String(data.resend_segment_id)))throw Error('Use a valid Resend segment ID');
   const after={...old,...data};
   if((after.sending_enabled||after.signup_enabled)&&(!after.free_plan_confirmed||!after.resend_segment_id||!key()||!fromEnv()))throw Error('Confirm the $0 Resend Marketing plan and configure the newsletter segment before enabling.');
   const {error}=await db.from('newsletter_settings').update(data).eq('id',true);
   if(error)throw Error('Newsletter settings not saved');
   return resp({ok:true,settings:(await summary()).settings},200,origin);
  }
  if(action==='send-now'&&req.method==='POST')return resp(await sendIssue('manual',await config(),who.id),200,origin);
  return resp({error:'Unsupported newsletter action'},404,origin);
 }catch(error){
  const msg=message(error),auth=/admin|authenticator|session|sign-in|unauthorized/i.test(msg);
  console.error('Newsletter request error',msg);
  return resp({error:msg},auth?403:400,origin);
 }
});
