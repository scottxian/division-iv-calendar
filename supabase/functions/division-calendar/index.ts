import { createClient } from 'npm:@supabase/supabase-js@2';
const url = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, service, {auth:{persistSession:false,autoRefreshToken:false}});
const publicHosts = new Set(['scottxian.github.io','calendar.divisionivmasons.org','divisionivmasons.org','www.divisionivmasons.org']);
const allowed = new Set(['https://divisionivmasons.org','https://www.divisionivmasons.org','https://scottxian.github.io','https://calendar.divisionivmasons.org','http://localhost:5173','http://127.0.0.1:5173']);
const fields=['title','event_type','hosted_by','district','start_local','end_local','event_mode','location_name','location_address','location_address1','location_address2','location_city','location_state','location_zip','location_tbd','virtual_meeting_url','public_description','attire','invited_audience','registration_url','payment_url','flyer_url','poc_name','poc_position','poc_phone','poc_email','cost_details'];
const choices=new Set(['new','change','cancel']);
const locationKeys=['location_name','location_address1','location_address2','location_city','location_state','location_zip'];
function checkLocation(p:any){
 if(p.event_mode==='online'){
  if(!parseUrl(p.virtual_meeting_url))throw Error('Enter a valid online meeting link');
  return;
 }
 if(p.location_tbd===true)return;
 for(const f of ['location_name','location_address1','location_city','location_state','location_zip']){
  if(!clean(p[f]))throw Error('Location requires '+f.replaceAll('_',' ')+'. Check Location TBD if unknown.');
 }
 if(!/^[A-Za-z]{2}$/.test(String(p.location_state||'')))throw Error('Enter a two-letter state abbreviation');
 if(!/^\d{5}(-\d{4})?$/.test(String(p.location_zip||'')))throw Error('Enter a valid 5-digit ZIP code');
}
const json=(v:unknown,status=200,origin='')=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin',...(allowed.has(origin)?{'access-control-allow-origin':origin}:{})}});
const err=(m:string,status=400,origin='')=>json({error:m},status,origin);
const goodEmail=(x:unknown)=>typeof x==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && x.length<=250;
const clean=(s:unknown,n=1000)=>typeof s==='string'?s.trim().slice(0,n):'';
const localOk=(v:unknown)=>typeof v==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v) && !Number.isNaN(Date.parse(v));
const parseUrl=(v:unknown)=>{const s=clean(v,1000);if(!s)return '';try{const x=new URL(s);return ['https:','http:'].includes(x.protocol)?x.href:'';}catch{return ''}};
async function auth(req:Request){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return {email:'',user:null,staff:null};
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user?.email) return {email:'',user:null,staff:null};
 const email=data.user.email.toLowerCase();
 const {data:staff}=await db.from('staff_accounts').select('id,email,display_name,role,enabled,phone').eq('email',email).eq('enabled',true).is('removed_at',null).maybeSingle();
 return {email,user:data.user,staff:staff||null,token};
}
async function setting(k:string, fallback:any){const {data}=await db.from('system_settings').select('setting_value').eq('setting_key',k).maybeSingle();return data?.setting_value??fallback}
function sanitize(p:any,patch=false){
 const obj:Record<string,unknown>={};
 for(const f of fields){
  if(!Object.hasOwn(p||{},f)) continue;
  if(f==='location_tbd'){obj[f]=Boolean(p[f]);continue;}
  const lim=f==='public_description'?4000:f==='title'?180:f==='poc_name'?150:f==='poc_position'?120:f==='poc_phone'?50:f==='poc_email'?250:f==='cost_details'?180:1000;
  obj[f]=clean(p[f],lim);
  if(f==='poc_email'&&obj[f]&&!goodEmail(String(obj[f])))throw Error('Enter a valid event point-of-contact email');
  if(['registration_url','payment_url','flyer_url','virtual_meeting_url'].includes(f)&&obj[f]&&!parseUrl(obj[f]))throw Error('Enter a valid http(s) URL for '+f.replaceAll('_',' '));
 }
 // District SOI titles derive from the district, not the host lodge.
 if(obj.event_type==='District School of Instruction'&&/^\d{3,4}$/.test(String(obj.district||'')))
  obj.title='District '+obj.district+' School of Instruction';
 if(!patch){
  for(const f of ['title','event_type','hosted_by','start_local','end_local']){
   if(!obj[f])throw Error('Please complete '+f.replaceAll('_',' '));
  }
 }
 if(obj.start_local && !localOk(obj.start_local))throw Error('Invalid starting date/time');
 if(obj.end_local && !localOk(obj.end_local))throw Error('Invalid ending date/time');
 if(obj.start_local && obj.end_local && String(obj.end_local)<=String(obj.start_local))throw Error('End must be after start');
 if(obj.event_mode&&!['in_person','hybrid','online'].includes(String(obj.event_mode)))throw Error('Invalid location type');
 if(obj.location_state)obj.location_state=String(obj.location_state).toUpperCase();
 if(!patch&&obj.event_mode==='online'){
  obj.location_tbd=false;
  for(const f of ['location_address','location_address1','location_address2','location_city','location_state','location_zip'])obj[f]='';
  obj.location_name='Zoom';
 }
 if(obj.location_tbd===true)for(const f of [...locationKeys,'location_address'])obj[f]='';
 if(!patch)checkLocation(obj);
 return obj;
}
function code(){return 'DIV4-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase()}
async function eventForCode(c:string){
 const {data:e}=await db.from('events').select('*').eq('event_code',c).maybeSingle();
 if(e)return e;
 const {data:r}=await db.from('event_requests').select('approved_event_id').eq('request_code',c).maybeSingle();
 if(!r?.approved_event_id)return null;
 const {data:event}=await db.from('events').select('*').eq('id',r.approved_event_id).maybeSingle();
 return event;
}
async function staffMfaState(user:any,token:string){
 if(!user?.id)throw Error('Authenticated user could not be verified for MFA.');
 const {data,error}=await db.auth.admin.mfa.listFactors({userId:user.id});
 if(error||!Array.isArray(data?.factors)){
  console.error('Administrator MFA enrollment lookup failed',error?.message||'Unexpected response');
  throw Error('Unable to verify staff MFA status. Try again.');
 }
 const factor=data.factors.find((f:any)=>f?.status==='verified'&&['totp','phone'].includes(f.factor_type));
 if(!factor)return {required:true,verified:false,needsEnrollment:true};
 const factorId=String(factor.id||'');
 try{
  const middle=token.split('.')[1]||'';
  const claims=JSON.parse(atob(middle.replace(/-/g,'+').replace(/_/g,'/')));
  if(claims.aal==='aal2'&&claims.sub===user.id)return {required:true,verified:true,factorId};
 }catch{}
 return {required:true,verified:false,factorId};
}
async function verifiedMfaRequired(user:any,token:string){
 const state=await staffMfaState(user,token);
 if(state.required&&!state.verified)throw Error(state.needsEnrollment?'Set up an authenticator in Account security before using the Inspector Desk.':'Complete authenticator verification in Account security before accessing the Inspector Desk.');
}
function requiredStaff(a:any){if(!a.staff)throw Error('Inspector login required or account disabled');return a.staff}
function requiredAdmin(a:any){const s=requiredStaff(a);if(s.role!=='admin')throw Error('Administrator access required');return s}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':allowed.has(origin)?origin:'null','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type,apikey,x-client-info','access-control-max-age':'3600','vary':'Origin'}});
 if(origin&&!allowed.has(origin))return err('Origin not allowed',403,origin);
 try{
  const u=new URL(req.url), action=u.searchParams.get('action')||'config';
  const a=await auth(req);
  if(a.staff && !['config','me','locate','submit'].includes(action)) await verifiedMfaRequired(a.user,a.token);
  if(action==='config'){
   const [types,enabled,districts,hosts,lodges,positions]=await Promise.all([db.from('event_types').select('label').eq('enabled',true).order('sort_order'),setting('public_submissions_enabled',false),setting('district_numbers',[]),db.from('events').select('hosted_by,location_name,location_city,attire,invited_audience,cost_details').eq('status','active').order('created_at',{ascending:false}).limit(1000),db.from('lodges').select('lodge_name,lodge_number').eq('active',true).limit(1000),db.from('poc_positions').select('title').eq('active',true).order('sort_order',{ascending:true}).order('title')]);
   const publicSuggestions=(field:string)=>[...new Set((hosts.data||[]).map((x:any)=>String(x[field]||'').trim()).filter(Boolean))].slice(0,100);
   return json({event_types:(types.data||[]).map((x:any)=>x.label),districts,suggestions:{venue:publicSuggestions('location_name'),city:publicSuggestions('location_city'),attire:publicSuggestions('attire'),audience:publicSuggestions('invited_audience'),cost:publicSuggestions('cost_details'),position:(positions.data||[]).map((x:any)=>x.title)},hosts:[...(hosts.data||[]).map((x:any)=>x.hosted_by),...(lodges.data||[]).map((x:any)=>[x.lodge_name,x.lodge_number?'No. '+x.lodge_number:''].filter(Boolean).join(' '))].filter(Boolean),public_submissions_enabled:enabled,turnstile_site_key:Deno.env.get('TURNSTILE_SITE_KEY')||null,turnstile_ready:Boolean(Deno.env.get('TURNSTILE_SITE_KEY')&&Deno.env.get('TURNSTILE_SECRET')),logged_in:!!a.user,staff:a.staff},200,origin);
  }
  if(action==='me'){
   const mfa=a.staff?await staffMfaState(a.user,a.token):null;
   // Before MFA, return only the minimal identity needed to show enrollment.
   // Never expose the staff's private contact or account fields on an AAL1 session.
   const staff=a.staff?mfa?.verified?a.staff:{
    role:a.staff.role,display_name:a.staff.display_name
   }:null;
   return json({email:a.email,staff,mfa},200,origin);
  }
  if(action==='locate'){
   if(!a.user)throw Error('Verify your email using the sign-in link first');
   const key=clean(u.searchParams.get('code'),80).toUpperCase();
   const e=await eventForCode(key);
   if(!e)throw Error('Event not found. Check the Submission ID.');
   const {data:r}=await db.from('event_requests').select('requester_email').eq('approved_event_id',e.id).eq('request_type','new').maybeSingle();
   if(!a.staff && r?.requester_email!==a.email)throw Error('Sign in using the email address from the original submission');
   const pub=Object.fromEntries(['id','event_code',...fields,'version','status','starts_at','ends_at'].map(k=>[k,e[k]]));
   return json({event:pub},200,origin);
  }
  if(action==='submit'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const body=await req.json(),kind=body.kind||'new';
   if(!choices.has(kind))throw Error('Unknown submission type');
   const enabled=await setting('public_submissions_enabled',false);
   if(!enabled&&!a.staff)throw Error('Public submissions are in test mode. Please try again later.');
   const requester_email=clean(body.email,250).toLowerCase();
   if(!goodEmail(requester_email))throw Error('Enter a valid contact email');
   const requester_name=clean(body.name,150);
   if(requester_name.length<2)throw Error('Enter your name');
   if(clean(body.website))throw Error('Submission rejected');
   if(enabled&&kind==='new'&&!a.staff){
     const secret=Deno.env.get('TURNSTILE_SECRET');
     if(!secret||!clean(body.turnstile_token))throw Error('Anti-spam verification is required');
     const validation=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:body.turnstile_token})});
     const verified=await validation.json();
     if(!verified.success||!publicHosts.has(verified.hostname)|| (origin && new URL(origin).hostname!==verified.hostname))throw Error('Anti-spam verification failed. Please retry.');
     const hourAgo=new Date(Date.now()-60*60*1000).toISOString();
     const {count:recentSubmissions,error:limitError}=await db.from('event_requests').select('id',{count:'exact',head:true}).eq('requester_email',requester_email).eq('request_type','new').gte('submitted_at',hourAgo);
     if(limitError)throw Error('Unable to confirm submission limit. Please try again later.');
     if((recentSubmissions||0)>=20)throw Error('Too many event submissions from this email address. Please wait an hour before trying again.');
   }
   let event_id=null, base_event_version=null, proposed_fields:any={};
   if(kind==='new'){
     proposed_fields=sanitize(body.event||{});
     const districts=await setting('district_numbers',[]);
     if(kind==='new' && proposed_fields.event_type!=='Division School of Instruction'&&!districts.includes(String(proposed_fields.district)))throw Error('Choose a valid district number');
     const types=await db.from('event_types').select('label').eq('label',proposed_fields.event_type).maybeSingle();
     if(!types.data)throw Error('Select a valid event type');
     if(!enabled && a.staff && requester_email!==a.email)throw Error('Use your own email address during test mode');
   }else{
     if(!a.user||(!a.staff&&requester_email!==a.email))throw Error('Verify the original submission contact email first');
     const e=await eventForCode(clean(body.request_code,80).toUpperCase());
     if(!e)throw Error('Original Submission ID not found');
     if(e.status!=='active')throw Error('This event is already cancelled');
     const {data:orig}=await db.from('event_requests').select('requester_email').eq('request_type','new').eq('approved_event_id',e.id).maybeSingle();
     if(!a.staff&&orig?.requester_email!==a.email)throw Error('Use the email address from the original submission');
     event_id=e.id;base_event_version=e.version;
     if(kind==='change'){
       proposed_fields=sanitize(body.changes||{},true);
       if(!Object.keys(proposed_fields).length)throw Error('There are no changes to submit');
       if(Object.hasOwn(proposed_fields,'district')){
         const districts=await setting('district_numbers',[]);
         if((proposed_fields.event_type||e.event_type)!=='Division School of Instruction'&&!districts.includes(String(proposed_fields.district)))throw Error('Choose a valid district number');
       }
       if(locationKeys.some(k=>Object.hasOwn(proposed_fields,k))||Object.hasOwn(proposed_fields,'location_tbd')||Object.hasOwn(proposed_fields,'virtual_meeting_url')||Object.hasOwn(proposed_fields,'event_mode')){
         checkLocation({...e,...proposed_fields});
       }
     }
     else proposed_fields={reason:clean(body.reason,2000)};
   }
   const request_code=code();
   const {data,error}=await db.from('event_requests').insert({
     request_code,event_id,request_type:kind,base_event_version,proposed_fields,
     requester_name,requester_email,requester_phone:clean(body.phone,50),
     requester_message:clean(body.message,2000)
   }).select('id,request_code').single();
   if(error)throw Error('Unable to save submission: '+error.message);
   await db.from('email_deliveries').insert({request_id:data.id,message_type:'acknowledgment',recipient_email:requester_email,idempotency_key:data.id+':ack'});
   const {data:reviewers}=await db.from('staff_accounts').select('email').eq('enabled',true);
   if(reviewers?.length)await db.from('email_deliveries').insert(reviewers.map((s:any)=>({request_id:data.id,message_type:'reviewer_notification',recipient_email:s.email,idempotency_key:data.id+':reviewer:'+s.email})));
   await db.from('event_history').insert({event_id,request_id:data.id,action:'submitted',actor_email:requester_email,after_data:{kind}});
   return json({ok:true,request_code:data.request_code,message:'Calendar submission received for inspector verification and publication. The lodge retains responsibility for scheduling its activity.'},201,origin);
  }
  if(action==='requests'){
   requiredStaff(a);
   let q=db.from('request_index').select('*',{count:'exact'}).order('submitted_at',{ascending:false});
   const st=u.searchParams.get('status');
   if(st&&st!=='all')q=q.eq('status',st);
   const from=u.searchParams.get('from'),to=u.searchParams.get('to');
   if(from)q=q.gte('submitted_at',from+'T00:00:00Z');
   if(to)q=q.lte('submitted_at',to+'T23:59:59Z');
   const type=u.searchParams.get('type'), lodge=u.searchParams.get('lodge'),eventFrom=u.searchParams.get('event_from'),eventTo=u.searchParams.get('event_to');
   if(type)q=q.eq('event_type',type);
   if(lodge)q=q.ilike('lodge','%'+lodge.replace(/[%,()]/g,'')+'%');
   const search=clean(u.searchParams.get('search'),100).replace(/[%,()]/g,'');
   if(search)q=q.or('request_code.ilike.%'+search+'%,requester_name.ilike.%'+search+'%,requester_email.ilike.%'+search+'%');
   if(eventFrom)q=q.gte('event_starts',eventFrom+'T00:00:00-07:00');
   if(eventTo)q=q.lte('event_starts',eventTo+'T23:59:59-08:00');
   const page=Math.max(0,Math.min(10000,Number(u.searchParams.get('page')||0)||0));
   const {data,error,count}=await q.range(page*50,page*50+49);
   if(error)throw Error(error.message);
   return json({items:data||[],total:count||0,page},200,origin);
  }
  if(action==='detail'){
   requiredStaff(a);
   const id=u.searchParams.get('id')||'';
   const {data,error}=await db.from('event_requests').select('*').eq('id',id).single();
   if(error||!data)throw Error('Submission not found');
   const [event,history,calendar,email]=await Promise.all([
     (data.approved_event_id||data.event_id)?db.from('events').select('*').eq('id',data.approved_event_id||data.event_id).maybeSingle():Promise.resolve({data:null}),
     db.from('event_history').select('*').eq('request_id',id).order('occurred_at',{ascending:false}),
     (data.approved_event_id||data.event_id)?db.from('calendar_jobs').select('status,action,created_at,last_error,event_version,finished_at').eq('event_id',data.approved_event_id||data.event_id).order('created_at',{ascending:false}).limit(12):db.from('calendar_jobs').select('status,action,created_at,last_error,event_version,finished_at').eq('request_id',id).order('created_at',{ascending:false}).limit(12),
     db.from('email_deliveries').select('message_type,status,recipient_email,last_error').eq('request_id',id)
   ]);
   return json({request:data,event:event.data,history:history.data||[],calendar:calendar.data||[],email:email.data||[]},200,origin);
  }
  if(action==='inspector-edit'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const staff=requiredStaff(a),b=await req.json();
   const id=clean(b.id,60);
   const {data:r,error:readError}=await db.from('event_requests').select('id,request_type,status,event_id,edit_version').eq('id',id).maybeSingle();
   if(readError||!r)throw Error('Submission not found');
   if(!['pending','needs_correction'].includes(r.status)||!['new','change'].includes(r.request_type))throw Error('This submission cannot be edited');
   const input=sanitize(b.fields||{},false);
   const districts=await setting('district_numbers',[]);
   if(input.event_type!=='Division School of Instruction'&&!districts.includes(String(input.district)))throw Error('Choose a valid district');
   const {data:eventType}=await db.from('event_types').select('label').eq('label',input.event_type).eq('enabled',true).maybeSingle();
   if(!eventType)throw Error('Choose a valid event type');
   let draft:any=input;
   if(r.request_type==='change'){
     const {data:current,error:eventError}=await db.from('events').select('*').eq('id',r.event_id).maybeSingle();
     if(eventError||!current||current.status!=='active')throw Error('Published event is no longer active');
     const changes:Record<string,unknown>={};
     const base:any={...current,
       start_local:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(current.starts_at)).replace(' ','T'),
       end_local:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(current.ends_at)).replace(' ','T')};
     for(const [key,value] of Object.entries(input)){
       if(key==='location_address')continue;
       if(String(value??'')!==String(base[key]??''))changes[key]=value;
     }
     if(!Object.keys(changes).length)throw Error('No changes to save');
     draft=changes;
   }
   const version=Number(b.expected_version);
   if(!Number.isInteger(version)||version<0)throw Error('Reload this request before editing');
   const {data,error}=await db.rpc('save_inspector_request_edit',{p_id:id,p_staff:staff.id,p_version:version,p_fields:draft});
   if(error)throw Error(error.message);
   return json({ok:true,result:data,notice:'Inspector revision saved. Verification for publication is still required.'},200,origin);
  }
  if(action==='inspector-publish-edit'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const staff=requiredStaff(a),body=await req.json();
   const id=clean(body.id,60),version=Number(body.expected_version);
   if(!Number.isInteger(version)||version<1)throw Error('Reload the event before editing');
   const payload=sanitize(body.fields||{},false);
   const districts=await setting('district_numbers',[]);
   if(payload.event_type!=='Division School of Instruction'&&!districts.includes(String(payload.district)))throw Error('Select a valid district');
   const {data:eventType}=await db.from('event_types').select('label').eq('label',payload.event_type).eq('enabled',true).maybeSingle();
   if(!eventType)throw Error('Choose a valid event type');
   if(!['in_person','hybrid','online'].includes(String(payload.event_mode)))throw Error('Select a valid event format');
   const {data,error}=await db.rpc('inspector_update_published_event',
     {p_id:id,p_staff:staff.id,p_expected_version:version,p_fields:payload});
   if(error)throw Error(error.message);
   return json({ok:true,result:data,notice:'Event updated. Google Calendar synchronization is queued.'},200,origin);
  }
  if(action==='dashboard'){
   requiredStaff(a);
   const {data,error}=await db.rpc('inspector_dashboard_data');
   if(error)throw Error(error.message);
   return json(data||{counts:{pending:0,corrections:0,failed:0,queued:0},requests:[],failures:[],recent:[]},200,origin);
  }
  if(action==='calendar-sync-overview'){
   requiredStaff(a);
   if(req.method!=='GET')return err('GET required',405,origin);
   const [events,jobs]=await Promise.all([
     db.from('events').select('id,event_code,title,status,version,google_event_id,calendar_last_synced_at').order('updated_at',{ascending:false}).limit(2500),
     db.from('calendar_jobs').select('event_id,status,action,event_version,created_at,finished_at,last_error')
       .order('created_at',{ascending:false}).limit(5000)
   ]);
   if(events.error)throw Error('Cannot load calendar events: '+events.error.message);
   if(jobs.error)throw Error('Cannot load calendar delivery history: '+jobs.error.message);
   const latest=new Map<string,any>();
   let lastSuccessful:string|null=null;
   for(const job of jobs.data||[]){
     if(job.event_id&&!latest.has(job.event_id))latest.set(job.event_id,job);
     if(job.status==='succeeded'&&job.finished_at&&(!lastSuccessful||job.finished_at>lastSuccessful))
      lastSuccessful=job.finished_at;
   }
   const items=(events.data||[]).map((event:any)=>{
     const job=latest.get(event.id);
     let state='unverified';
     if(job){
      if(['failed','error','dead','permanent_failure'].includes(job.status))state='failed';
      else if(['succeeded','completed'].includes(job.status))state='synced';
      else state='queued';
     }else if(event.calendar_last_synced_at&&event.google_event_id){state='synced';}
     return {id:event.id,code:event.event_code,title:event.title,event_status:event.status,
      state,last_attempt:job?.created_at||null,last_synced:event.calendar_last_synced_at||null,
      job_status:job?.status||null,error:job?.last_error||null};
   });
   const counts={synced:0,queued:0,failed:0,unverified:0};
   for(const item of items)counts[item.state as keyof typeof counts]++;
   const actionNeeded=items.filter(x=>x.state==='failed'||x.state==='queued'||x.state==='unverified')
     .sort((x,y)=>String(y.last_attempt||'').localeCompare(String(x.last_attempt||''))).slice(0,18);
   return json({counts,total:items.length,last_successful_at:lastSuccessful,action_needed:actionNeeded,
     checked_at:new Date().toISOString()},200,origin);
  }
  if(action==='calendar-retry'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const staff=requiredStaff(a),b=await req.json();
   const version=Number(b.expected_version);
   if(!Number.isInteger(version)||version<1)throw Error('Reload event before retry');
   const {data,error}=await db.rpc('inspector_retry_calendar_sync',
      {p_event_id:clean(b.id,80),p_staff:staff.id,p_expected_version:version});
   if(error)throw Error(error.message);
   return json({ok:true,result:data,notice:'Retry queued. Google Calendar delivery will run on the next worker cycle.'},200,origin);
  }
  if(action==='event-undo'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const admin=requiredAdmin(a),b=await req.json();
   const version=Number(b.expected_version);
   if(!Number.isInteger(version)||version<1)throw Error('Reload event before undo');
   const {data,error}=await db.rpc('admin_undo_last_published_edit',
     {p_event_id:clean(b.id,80),p_history_id:clean(b.history_id,80),
      p_staff:admin.id,p_expected_version:version});
   if(error)throw Error(error.message);
   return json({ok:true,result:data,notice:'Previous version restored. Calendar update queued.'},200,origin);
  }
  if(action==='events'){
   requiredStaff(a);
   const term=clean(u.searchParams.get('search'),100).replace(/[%,()]/g,'');
   const status=clean(u.searchParams.get('status'),20);
   const pg=Math.max(0,Math.min(1000,Number(u.searchParams.get('page'))||0));
   let q=db.from('events').select('id,event_code,title,event_type,hosted_by,district,starts_at,ends_at,status,google_event_id,calendar_last_synced_at,version,location_name,location_city',{count:'exact'}).order('starts_at',{ascending:false});
   if(status==='active'||status==='cancelled')q=q.eq('status',status);
   if(term)q=q.or('title.ilike.%'+term+'%,event_code.ilike.%'+term+'%,hosted_by.ilike.%'+term+'%');
   const {data,count,error}=await q.range(pg*50,pg*50+49);
   if(error)throw Error(error.message);
   const ids=(data||[]).map((x:any)=>x.id);
   let latest=new Map<string,any>();
   if(ids.length){
     const {data:jobs,error:jobError}=await db.from('calendar_jobs')
       .select('event_id,status,action,event_version,last_error,created_at,finished_at')
       .in('event_id',ids).order('created_at',{ascending:false}).limit(500);
     if(jobError)throw Error(jobError.message);
     for(const job of jobs||[]){if(!latest.has(job.event_id))latest.set(job.event_id,job)}
   }
   return json({items:(data||[]).map((x:any)=>({...x,latest_job:latest.get(x.id)||null})),total:count||0,page:pg},200,origin);
  }
  if(action==='event-detail'){
   requiredStaff(a);
   const id=clean(u.searchParams.get('id'),60);
   const {data:event,error}=await db.from('events').select('*').eq('id',id).maybeSingle();
   if(error||!event)throw Error('Published event not found');
   const [jobs,hist]=await Promise.all([
     db.from('calendar_jobs').select('action,status,finished_at,last_error,event_version,created_at').eq('event_id',id).order('created_at',{ascending:false}).limit(12),
     db.from('event_history').select('id,request_id,action,actor_email,occurred_at,before_data,after_data,notes').eq('event_id',id).order('occurred_at',{ascending:false}).limit(30)]);
   const requestIds=[...new Set((hist.data||[]).map((x:any)=>x.request_id).filter(Boolean))];
   const requests=requestIds.length?await db.from('event_requests').select('id,request_code,request_type').in('id',requestIds):{data:[],error:null};
   if(requests.error)throw Error(requests.error.message);
   const requestMap=new Map((requests.data||[]).map((x:any)=>[x.id,x]));
   const entries=(hist.data||[]).map((x:any)=>({...x,request_type:requestMap.get(x.request_id)?.request_type||null,
     request_code:requestMap.get(x.request_id)?.request_code||null}));
   return json({event,calendar:jobs.data||[],history:entries},200,origin);
  }
  if(action==='inspector-cancel-event'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const staff=requiredStaff(a),body=await req.json();
   const id=clean(body.event_id,80),reason=clean(body.reason,2000);
   if(!reason)throw Error('Enter a cancellation reason');
   const {data:event,error:lookupError}=await db.from('events').select('id,event_code,status,version').eq('id',id).maybeSingle();
   if(lookupError||!event||event.status!=='active')throw Error('Event is not active. Refresh before cancelling.');
   const {data:pending,error:pendingError}=await db.from('event_requests').select('id,edit_version,request_code')
    .eq('event_id',id).eq('request_type','cancel').in('status',['pending','needs_correction'])
    .order('submitted_at',{ascending:false}).limit(1);
   if(pendingError)throw Error(pendingError.message);
   let request=pending?.[0];
   if(!request){
    const created=await db.from('event_requests').insert({
     request_code:code(),event_id:id,request_type:'cancel',base_event_version:event.version,
     proposed_fields:{reason},requester_name:staff.display_name||a.email,requester_email:a.email,
     requester_message:reason
    }).select('id,edit_version,request_code').single();
    if(created.error)throw Error(created.error.message);
    request=created.data;
    const audit=await db.from('event_history').insert({event_id:id,request_id:request.id,action:'submitted',actor_email:a.email,after_data:{kind:'cancel'}});
    if(audit.error)console.error('Cancellation submission history write failed',audit.error.message);
   }
   const approved=await db.rpc('review_request_checked',{
    p_id:request.id,p_staff:staff.id,p_decision:'approved',p_note:reason,p_version:request.edit_version
   });
   if(approved.error)throw Error(approved.error.message);
   return json({ok:true,request_code:request.request_code,notice:'Cancellation verified. Calendar removal is queued.'},200,origin);
  }
  if(action==='review'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const staff=requiredStaff(a),b=await req.json();
   const decision=clean(b.decision,30);
   if(decision==='needs_correction'&&!clean(b.note))throw Error('Explain what needs correction before returning the submission');
   const version=Number(b.expected_version);
   if(!Number.isInteger(version)||version<0)throw Error('Reload this submission before recording a publication decision');
   const {data,error}=await db.rpc('review_request_checked',{p_id:b.id,p_staff:staff.id,p_decision:decision,p_note:clean(b.note,2000),p_version:version});
   if(error)throw Error(error.message);
   if(decision==='approved'&&data?.event_id){
    const {data:request}=await db.from('event_requests').select('proposed_fields,inspector_edits').eq('id',b.id).maybeSingle();
    const fields=request?.inspector_edits||request?.proposed_fields||{};
    if(Object.hasOwn(fields,'virtual_meeting_url')||fields.event_mode==='in_person'){
     const link=fields.event_mode==='in_person'?null:clean(fields.virtual_meeting_url,1000)||null;
     const {error:linkError}=await db.from('events').update({virtual_meeting_url:link}).eq('id',data.event_id);
     if(linkError)return json({ok:true,result:data,notice:'Approved, but saving the online meeting link needs attention: '+linkError.message},200,origin);
    }
   }
   return json({ok:true,result:data,notice:decision==='approved'?'Verified for publication; calendar synchronization and email are queued.':'Publication status saved; email queued.'},200,origin);
  }
  if(action==='audit'){
   requiredStaff(a);
   const pg=Math.max(0,Math.min(1000,Number(u.searchParams.get('page')||0)||0));
   const filter=clean(u.searchParams.get('activity'),50);
   let q=db.from('event_history').select('id,request_id,event_id,action,actor_email,occurred_at,before_data,after_data,notes',{count:'exact'}).order('occurred_at',{ascending:false});
   if(u.searchParams.get('request_id'))q=q.eq('request_id',u.searchParams.get('request_id'));
   if(filter)q=q.eq('action',filter);
   const {data,count,error}=await q.range(pg*50,pg*50+49);
   if(error)throw Error(error.message);
   const rid=[...new Set((data||[]).map((x:any)=>x.request_id).filter(Boolean))];
   const requests=rid.length?await db.from('event_requests').select('id,request_code,request_type,proposed_fields,approved_event_id,event_id').in('id',rid):{data:[],error:null};
   if(requests.error)throw Error(requests.error.message);
   const eventIds=[...new Set([...(data||[]).map((x:any)=>x.event_id).filter(Boolean),...(requests.data||[]).map((x:any)=>x.approved_event_id||x.event_id).filter(Boolean)])];
   const events=eventIds.length?await db.from('events').select('id,event_code,title,status').in('id',eventIds):{data:[],error:null};
   if(events.error)throw Error(events.error.message);
   const rm=new Map((requests.data||[]).map((x:any)=>[x.id,x]));
   const em=new Map((events.data||[]).map((x:any)=>[x.id,x]));
   const items=(data||[]).map((h:any)=>{
     const req=rm.get(h.request_id),event=em.get(h.event_id||req?.approved_event_id||req?.event_id);
     return {...h,request_code:req?.request_code||null,request_type:req?.request_type||null,
       event_code:event?.event_code||null,event_title:event?.title||req?.proposed_fields?.title||'Event submission',
       event_status:event?.status||null};
   });
   return json({items,total:count||0,page:pg},200,origin);
  }
  if(action==='staff'){
   requiredAdmin(a);
   const {data,error}=await db.from('staff_accounts').select('id,email,display_name,phone,role,enabled,created_at,removed_at,removed_by,first_name,middle_name,last_name,office_title,home_phone,mobile_phone,home_address,home_address2,city,state,zip,district,member_number').order('display_name');
   if(error)throw Error(error.message);return json({items:data},200,origin);
  }
  if(action==='staff-toggle'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const admin=requiredAdmin(a), b=await req.json();
   const id=clean(b.id,80);
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw Error('Invalid inspector account');
   if(typeof b.enabled!=='boolean'||typeof b.expected_enabled!=='boolean'||
      b.enabled===b.expected_enabled)throw Error('Reload the inspector list before changing access');
   if(id===admin.id)throw Error('You cannot change your own administrator access');
   const {data,error}=await db.rpc('set_inspector_enabled',{
     p_actor:admin.id, p_target:id,
     p_expected_enabled:b.expected_enabled, p_enabled:b.enabled
   });
   if(error)throw Error(error.message);
   return json({ok:true,staff:data,message:data.enabled?'Inspector activated.':'Inspector deactivated.'},200,origin);
  }
  if(action==='staff-remove'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const admin=requiredAdmin(a),b=await req.json(),id=clean(b.id,80);
   if(id===admin.id)throw Error('You cannot remove yourself');
   const {data:record,error:findError}=await db.from('staff_accounts').select('id,email,role,removed_at').eq('id',id).maybeSingle();
   if(findError||!record)throw Error('Inspector not found');
   if(record.role!=='inspector')throw Error('Administrators cannot be removed using this action');
   if(record.removed_at)throw Error('Inspector already removed');
   const {data,error}=await db.from('staff_accounts')
     .update({enabled:false,removed_at:new Date().toISOString(),removed_by:admin.id})
     .eq('id',id).eq('role','inspector').is('removed_at',null).select('id').maybeSingle();
   if(error||!data)throw Error('Inspector removal did not complete. Refresh and try again.');
   const {error:auditError}=await db.from('inspector_admin_history').insert({actor_staff_id:admin.id,target_staff_id:id,action:'removed'});
   if(auditError)console.error('Inspector archive audit write failed:',auditError.message);
   return json({ok:true,message:'Inspector access removed. Prior publication decisions and history are preserved.'},200,origin);
  }
  if(action==='staff-restore'){
   if(req.method!=='POST')return err('POST required',405,origin);
   const admin=requiredAdmin(a),b=await req.json(),id=clean(b.id,80);
   const {data,error}=await db.from('staff_accounts')
     .update({enabled:false,removed_at:null,removed_by:null})
     .eq('id',id).eq('role','inspector').not('removed_at','is',null).select('id').maybeSingle();
   if(error||!data)throw Error('Removed inspector not found. Refresh and try again.');
   const {error:auditError}=await db.from('inspector_admin_history').insert({actor_staff_id:admin.id,target_staff_id:id,action:'restored'});
   if(auditError)console.error('Inspector restoration audit write failed:',auditError.message);
   return json({ok:true,message:'Inspector record restored as disabled. Activate separately to grant access.'},200,origin);
  }
  if(action==='staff-save'){
   requiredAdmin(a);
   const b=await req.json(),email=clean(b.email,250).toLowerCase();
   if(!goodEmail(email))throw Error('Valid email required');
   if(req.method!=='POST')return err('POST required',405,origin);
   const role=b.role==='admin'?'admin':'inspector';
   const first_name=clean(b.first_name,80),middle_name=clean(b.middle_name,80),last_name=clean(b.last_name,80);
   const district=clean(b.district,12),member_number=clean(b.member_number,30);
   const home_phone=clean(b.home_phone,50),mobile_phone=clean(b.mobile_phone,50);
   const home_address=clean(b.home_address,220),home_address2=clean(b.home_address2,220);
   const city=clean(b.city,120),stateValue=clean(b.state,2).toUpperCase(),zip=clean(b.zip,12);
   const office_title=clean(b.office_title,80)||'Inspector';
   const display_name=clean(b.display_name,150)||[first_name,middle_name,last_name].filter(Boolean).join(' ');
   const {data:existing,error:lookupError}=await db.from('staff_accounts')
     .select('id,role,removed_at').eq('email',email).maybeSingle();
   if(lookupError)throw Error(lookupError.message);
   if(existing?.removed_at)throw Error('This inspector was removed. Use Restore Access instead.');
   if(existing?.role==='admin' && role!=='admin')throw Error('Existing administrators cannot be demoted here');
   if(role==='inspector'&&!existing){
     for(const [label,value] of [['first name',first_name],['last name',last_name],['district',district],['member ID',member_number],['mobile phone',mobile_phone],['street address',home_address],['city',city],['state',stateValue],['ZIP',zip]]){
       if(!value)throw Error('Please provide inspector '+label);
     }
   }
   if(district && !['402','404','410','414','418','422','428','438'].includes(district))throw Error('Choose a valid Division IV district');
   if(stateValue && !/^[A-Z]{2}$/.test(stateValue))throw Error('Enter a valid two-letter state');
   if(zip && !/^\d{5}(?:-\d{4})?$/.test(zip))throw Error('Enter a valid ZIP code');
   if(member_number && !/^\d{1,20}$/.test(member_number))throw Error('Member ID must contain digits');
   const record={
    email,display_name,role,enabled:Boolean(b.enabled),phone:clean(b.phone,50)||mobile_phone,
    first_name,middle_name,last_name,office_title,
    district:district||null,member_number:member_number||null,
    home_phone,mobile_phone,home_address,home_address2,city,state:stateValue,zip
   };
   if(email===a.email && (!record.enabled||role!=='admin'))throw Error('You cannot disable your own administrator account');
   const {error}=await db.from('staff_accounts').upsert(record,{onConflict:'email'});
   if(error)throw Error(error.message);
   return json({ok:true},200,origin);
  }
  if(action==='settings'){
   requiredAdmin(a);
   const {data}=await db.from('system_settings').select('setting_key,setting_value');
   return json({settings:Object.fromEntries((data||[]).map((x:any)=>[x.setting_key,x.setting_value]))},200,origin);
  }
  if(action==='settings-save'){
   requiredAdmin(a);const b=await req.json();
   const allowedSettings=['public_submissions_enabled','public_email_links'];
   if(!allowedSettings.includes(b.key))throw Error('Setting cannot be edited here');
   if(b.key==='public_submissions_enabled'&&b.value===true&&(!Deno.env.get('TURNSTILE_SECRET')||!Deno.env.get('TURNSTILE_SITE_KEY')))throw Error('Public submissions require both Turnstile keys before launch.');
   const val=b.key==='public_email_links'?clean(b.value,8000):Boolean(b.value);
   const {error}=await db.from('system_settings').upsert({setting_key:b.key,setting_value:val,updated_at:new Date().toISOString(),updated_by:a.staff.id});
   if(error)throw Error(error.message);return json({ok:true},200,origin);
  }
  return err('Unknown action',404,origin);
 }catch(e){console.error('request failed',e);const message=e instanceof Error?e.message:'Unexpected server error';return err(message,/inspector login|account disabled|administrator access|authenticator|mfa|required sign.in/i.test(message)?403:400,origin)}
});
