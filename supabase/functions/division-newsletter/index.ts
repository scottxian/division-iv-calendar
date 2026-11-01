
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { weeklyWindow } from './weekly-agenda.mjs';
import { buildWeeklyContent } from './weekly-content.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://divisionivmasons.org','https://www.divisionivmasons.org','http://127.0.0.1:5173','http://localhost:5173']);
const fromEnv=()=>Deno.env.get('MAIL_FROM')||'';
const key=()=>Deno.env.get('RESEND_API_KEY')||'';
// Separate full-access Marketing credential; never replace the transactional send-only key.
const marketingKey=()=>Deno.env.get('RESEND_MARKETING_API_KEY')||'';
const resp=(data:any,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','vary':'Origin',...(origins.has(origin)?{'access-control-allow-origin':origin}:{})}});
const message=(value:any)=>String(value??'').trim();
const goodEmail=(s:string)=>s.length<=250&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const escapeHTML=(v:any)=>message(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const utcDate=(v:any)=>new Date(v).toISOString();

/**
 * Transactional and Broadcast email share the approved Division IV masthead.
 * Reuse the public site's emblem URL and colors; email CSS is inline for clients.
 * Image blocking degrades gracefully because the brand name is also real text.
 */
const DIVISION_EMBLEM='https://divisionivmasons.org/app/assets/division-iv-emblem.png?v=20261028b';
type MailLayout={
 preheader:string;eyebrow:string;title:string;intro:string;content:string;
 actionText?:string;actionUrl?:string;finePrint?:string;unsubscribe?:boolean;
};
function brandedEmail(o:MailLayout){
 const heading=escapeHTML(o.title);
 const cta=o.actionText&&o.actionUrl
  ?`<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:27px auto 23px;border-collapse:separate"><tr><td align="center" bgcolor="#0b2138" style="border-radius:6px;background:#0b2138"><a href="${escapeHTML(o.actionUrl)}" style="display:inline-block;padding:15px 25px;border:1px solid #0b2138;border-radius:6px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:700">${escapeHTML(o.actionText)}</a></td></tr></table>`
  :'';
 const unsubscribe=o.unsubscribe
  ?`<p style="margin:12px 0 0;color:#b8c5d0;font-size:12px;line-height:1.7"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#f0d99d;text-decoration:underline">Unsubscribe from this newsletter</a></p>`
  :'';
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} | Division IV Masons</title></head>
<body style="margin:0;padding:0;background:#f5f1e7;color:#172339;font-family:Arial,Helvetica,sans-serif">
<div style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent">${escapeHTML(o.preheader)}</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;background:#f5f1e7">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #d7dfe6;border-radius:10px">
<tr><td bgcolor="#0b2138" style="background:#0b2138;padding:25px 26px">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tr>
<td valign="middle" width="82" style="width:82px;padding:0 13px 0 0"><img src="${DIVISION_EMBLEM}" width="70" height="70" alt="Division IV Masons emblem" style="display:block;width:70px;height:70px;border:0;outline:none"></td>
<td valign="middle" style="padding:0"><div style="font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.35;font-weight:700;letter-spacing:1px;color:#ffffff">DIVISION IV MASONS</div>
<div style="padding-top:6px;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:1.2px;color:#f0d99d">GRAND LODGE OF CALIFORNIA</div></td>
</tr></table></td></tr>
<tr><td bgcolor="#d7b56e" height="4" style="height:4px;line-height:4px;font-size:1px;background:#d7b56e">&nbsp;</td></tr>
<tr><td style="padding:31px 30px 29px">
<p style="margin:0 0 13px;color:#98783f;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:1.5px">${escapeHTML(o.eyebrow)}</p>
<h1 style="margin:0 0 16px;color:#0b2138;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:normal">${heading}</h1>
<p style="margin:0 0 20px;color:#33475b;font-size:15px;line-height:1.75">${escapeHTML(o.intro)}</p>
${o.content}${cta}
${o.finePrint?`<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e5e9ee;color:#667483;font-size:12px;line-height:1.7">${escapeHTML(o.finePrint)}</p>`:''}
</td></tr>
<tr><td bgcolor="#102c49" align="center" style="background:#102c49;padding:23px 20px 25px">
<p style="margin:0 0 6px;color:#f0d99d;font-size:11px;font-weight:700;letter-spacing:1.6px">DIVISION IV MASONS</p>
<p style="margin:0 0 8px;color:#dce7ed;font-size:12px;line-height:1.6">Fellowship &nbsp;&middot;&nbsp; Leadership &nbsp;&middot;&nbsp; Service</p>
<p style="margin:0;color:#b8c5d0;font-size:12px;line-height:1.7"><a href="https://divisionivmasons.org/" style="color:#e4edf3;text-decoration:underline">divisionivmasons.org</a></p>
${unsubscribe}
</td></tr></table></td></tr></table></body></html>`;
}
function confirmationHtml(link:string){
 const safe=escapeHTML(link);
 return brandedEmail({
  preheader:'One last step: confirm your Division IV Events Newsletter subscription.',
  eyebrow:'DIVISION IV CALENDAR · NEWSLETTER SIGNUP',
  title:'Confirm your subscription',
  intro:'Thank you for signing up for the Division IV Events Newsletter.',
  content:`<p style="margin:0;color:#33475b;font-size:15px;line-height:1.75">Once you confirm, you can receive a monthly digest of upcoming events and weekly updates when published calendar details change.</p>
  <p style="margin:23px 0 0;color:#5e6c79;font-size:12px;line-height:1.7">If the button does not work, copy and paste this link into your browser:<br><a href="${safe}" style="color:#234e77;word-break:break-all;overflow-wrap:anywhere">${safe}</a></p>`,
  actionText:'Confirm My Subscription',actionUrl:link,
  finePrint:'This confirmation link expires in 48 hours. If you did not request this subscription, ignore this email. You will not be subscribed without confirming.'
 });
}

const allowedFields=['sending_enabled','signup_enabled','free_plan_confirmed','resend_segment_id','monthly_enabled','weekly_enabled','monthly_day','weekly_day','monthly_send_hour','weekly_send_hour','lookahead_days'];
async function config(){const {data,error}=await db.from('newsletter_settings').select('*').eq('id',true).single();if(error)throw Error('Newsletter settings unavailable');return data;}
async function resend(path:string,method='GET',body?:unknown,mode:'marketing'|'transactional'='marketing'){
 const credential=mode==='transactional'?key():marketingKey();
 if(!credential)throw Error(mode==='marketing'?'Resend Marketing API key not configured. Contact an administrator.':'Resend transactional email is not configured');
 const r=await fetch('https://api.resend.com'+path,{method,headers:{authorization:'Bearer '+credential,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
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
async function weeklyIssue(settings:any) {
 const now=new Date(), window=weeklyWindow(now);
 const since=new Date(now.getTime()-7*86400000).toISOString();
 const fields='id,title,hosted_by,starts_at,ends_at,event_mode,location_name,location_address,location_tbd,status,version,google_event_id,calendar_last_synced_at';
 const [upcoming,added,flags,lodges]=await Promise.all([
  db.from('events').select(fields).eq('status','active')
   .gte('starts_at',window.queryFrom).lt('starts_at',window.queryUntil)
   .order('starts_at',{ascending:true}).limit(500),
  db.from('event_requests').select('request_type,status,approved_event_id,submitted_at')
   .eq('request_type','new').eq('status','approved').gte('submitted_at',since)
   .order('submitted_at',{ascending:false}).limit(500),
  db.from('newsletter_event_flags').select('event_id,event_version,change_kind,dirty')
   .eq('dirty',true).limit(1000),
  db.from('lodges').select('lodge_name,lodge_number,meeting_day,meeting_time,meeting_notes,address_line1,city,state,active')
   .eq('active',true).limit(200)
 ]);
 if(upcoming.error||added.error||flags.error||lodges.error)
  throw Error('Unable to prepare weekly events or lodge meeting schedules');
 const ids=[...new Set([...(added.data||[]).map((x:any)=>x.approved_event_id),
  ...(flags.data||[]).map((x:any)=>x.event_id)].filter(Boolean))];
 // Fail closed if a future large backlog exceeds one safe indexed lookup.
 if(ids.length>200)throw Error('Too many weekly event updates to prepare safely');
 const extra=ids.length?await db.from('events').select(fields).in('id',ids).limit(200):{data:[],error:null};
 if(extra.error)throw Error('Unable to retrieve newly published weekly events');
 const unique=new Map<string,any>();
 for(const e of [...(upcoming.data||[]),...(extra.data||[])])unique.set(e.id,e);
 const allIds=[...unique.keys()];
 const jobs=allIds.length?await db.from('calendar_jobs')
  .select('event_id,event_version,status,created_at').in('event_id',allIds)
  .order('created_at',{ascending:false}).limit(4000):{data:[],error:null};
 if(jobs.error)throw Error('Unable to verify calendar publication for weekly events');
 const built=buildWeeklyContent({events:[...unique.values()],
  submissions:added.data||[],flags:flags.data||[],lodges:lodges.data||[],
  jobs:jobs.data||[],now});
 const label='This Week Around Division IV';
 const subject=label+' — '+built.range;
 const html=brandedEmail({
  preheader:'Events and stated meetings through the following Sunday, plus newly published events.',
  eyebrow:'DIVISION IV CALENDAR · WEEKLY EVENTS',
  title:label,
  intro:'Your Division IV week ahead: verified calendar events, regularly scheduled lodge stated meetings, and new events submitted during the past seven days and published after verification.',
  content:built.htmlContent,
  actionText:'View the Division IV Calendar',
  actionUrl:'https://divisionivmasons.org/calendar/',
  finePrint:'Stated meetings can change; confirm with the lodge before attending. Saved personal-calendar copies do not automatically update when event details change.',
  unsubscribe:true
 });
 const text=[label,built.textBody,'View the Division IV Calendar: https://divisionivmasons.org/calendar/',
  'Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}'].join('\n\n');
 return {kind:'weekly',subject,html,text,groups:built.groups,versions:built.versions,items:built.items};
}
async function issue(kind:string,settings:any){
 if(kind==='weekly')return weeklyIssue(settings);
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

 const section=(title:string,items:any[])=>items.length?
  '<h2 style="color:#0b2138;font-family:Georgia,Times New Roman,serif;font-size:21px;font-weight:normal;margin:28px 0 10px">'+escapeHTML(title)+'</h2>'+
  '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">'+
  items.map((e:any)=>{
   const when=friendlyDate(e.starts_at)+' (Pacific Time)';
   const where=e.event_mode==='online'?'Online event':e.location_tbd?'Location TBD':[e.location_name,e.location_address].filter(Boolean).join(', ');
   const host=message(e.hosted_by);
   return '<tr><td style="padding:16px 0;border-bottom:1px solid #e3dfd5">'+
    '<p style="margin:0 0 5px;color:#0b2138;font-size:16px;line-height:1.5;font-weight:700">'+escapeHTML(e.title)+'</p>'+
    '<p style="margin:0 0 4px;color:#33475b;font-size:14px;line-height:1.65">'+escapeHTML(when)+'</p>'+
    (where?'<p style="margin:0 0 4px;color:#33475b;font-size:14px;line-height:1.65">'+escapeHTML(where)+'</p>':'')+
    (host?'<p style="margin:0 0 5px;color:#5e6c79;font-size:13px;line-height:1.6">Host: '+escapeHTML(host)+'</p>':'')+
    '<a href="'+escapeHTML(eventLink(e.id))+'" style="font-size:13px;line-height:1.6;font-weight:700;color:#234e77;text-decoration:underline">View event details</a>'+
    '</td></tr>';
  }).join('')+'</table>':'';
 const html=brandedEmail({
  preheader:kind==='monthly'?'Upcoming Division IV events in your monthly calendar digest.':'Published Division IV calendar additions, edits, and cancellations.',
  eyebrow:kind==='monthly'?'DIVISION IV CALENDAR · MONTHLY DIGEST':'DIVISION IV CALENDAR · WEEKLY UPDATES',
  title:label,
  intro:kind==='monthly'?'Upcoming published events and calendar details for the Division IV Masonic community.':'Newly published events and changes to existing Division IV calendar listings.',
  content:section('New events',groups.new)+section('Updated events',groups.updated)+section('Cancelled events',groups.cancelled)+section('Upcoming events',groups.upcoming)+
   (!list.length?'<p style="margin:18px 0;color:#33475b;font-size:14px;line-height:1.7">No published events are currently listed for this period.</p>':''),
  actionText:'View the Division IV Calendar',
  actionUrl:'https://divisionivmasons.org/calendar/',
  finePrint:'Saved personal-calendar copies do not automatically update when event details change. Please check the online calendar before attending.',
  unsubscribe:true
 });
 const text=[label,'Division IV calendar: https://divisionivmasons.org/calendar/',...Object.entries(groups).flatMap(([name,items])=>items.length?[name.toUpperCase(),...items.map((e:any)=>e.title+' — '+friendlyDate(e.starts_at)+' — '+eventLink(e.id))]:[]),'Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}'].join('\n\n');
 return {kind,subject,html,text,groups,versions,items:list.length};
}
async function subscribe(req:Request,settings:any){
 if(!settings.signup_enabled||!settings.free_plan_confirmed||!settings.resend_segment_id||!fromEnv()||!key()||!marketingKey())return {message:'Newsletter signup is not yet open.'};
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
 if(old?.status!=='unsubscribed'&&old?.last_confirmation_sent_at&&Date.now()-Date.parse(old.last_confirmation_sent_at)<12*3600000)return {message:'If this address is eligible, please check your inbox.'};
 const token=crypto.randomUUID()+crypto.randomUUID(),token_hash=await hash(token);
 const {error}=await db.from('newsletter_subscribers').upsert({email,status:'pending',token_hash,token_expires_at:new Date(Date.now()+48*3600000).toISOString(),requested_at:new Date().toISOString(),last_confirmation_sent_at:new Date().toISOString()},{onConflict:'email'});
 if(error)throw Error('Unable to create signup request');
 const link='https://divisionivmasons.org/?newsletter_confirm='+encodeURIComponent(token)+'#newsletter-signup';
 const reply=await resend('/emails','POST',{from:fromEnv(),to:[email],subject:'Confirm your Division IV newsletter subscription',html:confirmationHtml(link),text:'Confirm your subscription to the Division IV Events Newsletter:\n'+link+'\n\nThis link expires in 48 hours. If you did not request this, ignore the message.'},'transactional');
 if(!reply?.id)throw Error('Confirmation email could not be sent');
 return {message:'If this address is eligible, please check your inbox for a confirmation link.'};
}
async function confirm(req:Request,settings:any){
 const body=await req.json(),token=message(body.token);
 if(!/^[a-f0-9-]{72}$/i.test(token))throw Error('Invalid confirmation link');
 const token_hash=await hash(token);
 const {data:s}=await db.from('newsletter_subscribers').select('id,email,status,token_expires_at,provider_contact_id').eq('token_hash',token_hash).maybeSingle();
 if(!s||s.status!=='pending'||Date.parse(s.token_expires_at)<Date.now())throw Error('This confirmation link has expired. Please subscribe again.');
 // Confirm already-requested subscriptions even when new signup is paused.
 if(!settings.free_plan_confirmed||!settings.resend_segment_id||!marketingKey())throw Error('Newsletter contact enrollment is being configured. Please try the same confirmation link again later.');
 const {count}=await db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active');
 if((count||0)>=Math.min(settings.contact_cap,900))throw Error('Newsletter signup is full.');
 // New signups create a contact; returning opt-ins update their existing contact.
 // NEVER restore marketing subscription before the new confirmation link is used.
 const contact=s.provider_contact_id
  ? await resend('/contacts/'+encodeURIComponent(s.provider_contact_id),'PATCH',{unsubscribed:false})
  : await resend('/contacts','POST',{email:s.email,unsubscribed:false,segments:[{id:settings.resend_segment_id}]});
 const {error}=await db.from('newsletter_subscribers').update({status:'active',token_hash:null,token_expires_at:null,confirmed_at:new Date().toISOString(),provider_contact_id:contact.id||null,provider_synced_at:new Date().toISOString()}).eq('id',s.id).eq('status','pending');
 if(error)throw Error('Contact enrollment succeeded; administrator reconciliation required');
 return {message:'You are subscribed to Division IV newsletter updates.'};
}

/**
 * Resend is authoritative for opt-outs. Refresh confirmed contacts from the
 * configured newsletter Segment before reporting subscriber totals or sending.
 * Never automatically reactivate a locally unsubscribed contact; returning to
 * the mailing list requires a new verified opt-in.
 */
async function reconcileUnsubscribes(settings:any){
 if(!settings.resend_segment_id||!marketingKey())throw Error('Newsletter contact synchronization is not configured');
 const {data:active,error:activeError}=await db.from('newsletter_subscribers')
  .select('email').eq('status','active').limit(901);
 if(activeError)throw Error('Could not load active newsletter subscribers');
 if(!active?.length)return {checked:0,unsubscribed:0};
 if(active.length>900)throw Error('Newsletter contact safety cap exceeded');
 const local=new Set(active.map((s:any)=>message(s.email).toLowerCase()));
 const optedOut=new Set<string>();
 let after='',finished=false;
 for(let page=0;page<20;page++){
  const qs=new URLSearchParams({segment_id:settings.resend_segment_id,limit:'100'});
  if(after)qs.set('after',after);
  const result=await resend('/contacts?'+qs.toString(),'GET',undefined,'marketing');
  if(!Array.isArray(result?.data)||typeof result?.has_more!=='boolean')
   throw Error('Invalid Resend contacts response; subscriber totals not reconciled');
  for(const contact of result.data){
   const email=message(contact?.email).toLowerCase();
   if(local.has(email)&&contact?.unsubscribed===true)optedOut.add(email);
  }
  if(!result.has_more){finished=true;break}
  const next=message(result.data.at(-1)?.id);
  if(!next||next===after)throw Error('Unable to complete Resend contact pagination');
  after=next;
 }
 if(!finished)throw Error('Resend contact list exceeded safe pagination bound');
 for(const email of optedOut){
  const {error}=await db.from('newsletter_subscribers')
   .update({status:'unsubscribed',provider_synced_at:new Date().toISOString()})
   .eq('email',email).eq('status','active');
  if(error)throw Error('Unable to record an opted-out newsletter contact');
 }
 return {checked:local.size,unsubscribed:optedOut.size};
}

async function summary(){
 const settings=await config();
 let subscriber_sync_warning='';
 try{await reconcileUnsubscribes(settings);}
 catch(error){subscriber_sync_warning='Resend contact status could not be refreshed';console.warn('Newsletter subscriber sync',message(error));}
 const [count,recent]=await Promise.all([db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active'),db.from('newsletter_runs').select('id,kind,issue_key,state,created_at,sent_at,error_message,provider_broadcast_id,content_summary').order('created_at',{ascending:false}).limit(25)]);
 if(count.error)throw Error('Unable to load newsletter subscriber count');
 return {settings,subscribers:count.count||0,runs:recent.data||[],resend_configured:!!key()&&!!fromEnv(),marketing_configured:!!marketingKey(),subscriber_sync_warning};
}
async function sendIssue(kind:string,settings:any,staffId?:string){
 if(!settings.sending_enabled||!settings.free_plan_confirmed||!settings.resend_segment_id||!marketingKey())throw Error('Newsletter sending is paused or Marketing API key is not configured.');
 if(!key()||!fromEnv())throw Error('Resend email sender is not configured');
 // Fail closed if Resend contact opt-outs cannot be checked before broadcast.
 await reconcileUnsubscribes(settings);
 const {count,error:countError}=await db.from('newsletter_subscribers').select('id',{count:'exact',head:true}).eq('status','active');
 if(countError)throw Error('Unable to verify active newsletter subscribers');
 if(!count)return {status:'skipped',reason:'no_active_subscribers'};
 if(count>settings.contact_cap||count>900)throw Error('The free-tier contact safety cap has been reached');
 const local=localParts();
 const effectiveKind=kind==='manual_weekly'?'weekly':kind==='manual_monthly'?'monthly':kind;
 const manual=kind.startsWith('manual_');
 const issueKey=manual?'manual:'+effectiveKind+':'+new Date().toISOString().slice(0,16)+':'+crypto.randomUUID()
  :kind==='monthly'?'monthly:'+local.month:'weekly:'+new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const {data:existing}=await db.from('newsletter_runs').select('id,state').eq('issue_key',issueKey).maybeSingle();
 if(existing)return {status:'already_processed',state:existing.state,issue_key:issueKey};
 const built=await issue(effectiveKind,settings);
 const {data:run,error:insertError}=await db.from('newsletter_runs').insert({issue_key:issueKey,kind:manual?'manual':kind,state:'prepared',event_versions:built.versions,content_summary:{events:built.items,subscribers:count,monthly:effectiveKind==='monthly'},created_by:staffId||null}).select('id').single();
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
  if(action==='status'&&req.method==='GET'){const s=await config();return resp({signup_enabled:!!(s.signup_enabled&&s.free_plan_confirmed&&s.resend_segment_id&&marketingKey()&&key()&&fromEnv())},200,origin);}
  if(action==='subscribe'&&req.method==='POST')return resp(await subscribe(req,await config()),200,origin);
  if(action==='confirm'&&req.method==='POST')return resp(await confirm(req,await config()),200,origin);
  if(action==='cron'&&req.method==='POST'){
   if(!Deno.env.get('JOB_RUNNER_SECRET')||req.headers.get('x-newsletter-secret')!==Deno.env.get('JOB_RUNNER_SECRET'))return resp({error:'Unauthorized'},401,origin);
   const s=await config(),p=localParts();
   if(!s.sending_enabled)return resp({status:'paused'},200,origin);
   const output=[];
   const monthlyDue=!!s.monthly_enabled&&p.day===s.monthly_day&&p.hour===s.monthly_send_hour;
   const weeklyDue=!!s.weekly_enabled&&p.weekday===s.weekly_day&&p.hour===s.weekly_send_hour;
   if(monthlyDue)output.push(await sendIssue('monthly',s));
   if(weeklyDue)output.push(await sendIssue('weekly',s));
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
   for(const f of ['signup_enabled','sending_enabled','free_plan_confirmed','monthly_enabled','weekly_enabled'])if(f in data)data[f]=data[f]===true;
   const bounds={monthly_day:[1,28],weekly_day:[0,6],monthly_send_hour:[0,23],weekly_send_hour:[0,23],lookahead_days:[7,120]};
   for(const [field,[min,max]] of Object.entries(bounds)){
    if(!(field in data))continue;
    const value=Number(data[field]);
    if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid '+field.replaceAll('_',' '));
    data[field]=value;
   }
   if(data.resend_segment_id&&!/^[a-f0-9-]{36}$/i.test(String(data.resend_segment_id)))throw Error('Use a valid Resend segment ID');
   const after={...old,...data};
   if(after.sending_enabled&&!(after.monthly_enabled||after.weekly_enabled))throw Error('Choose a monthly or weekly newsletter before enabling delivery.');
   if((after.sending_enabled||after.signup_enabled)&&(!after.free_plan_confirmed||!after.resend_segment_id||!marketingKey()||!key()||!fromEnv()))throw Error('Complete one-time email setup and configure the Marketing API key in Supabase before enabling newsletters.');
   const {error}=await db.from('newsletter_settings').update(data).eq('id',true);
   if(error)throw Error('Newsletter settings not saved');
   return resp({ok:true,settings:(await summary()).settings},200,origin);
  }
  if(action==='send-now'&&req.method==='POST'){
   const body=await req.json().catch(()=>({}));
   if(!['monthly','weekly'].includes(body.kind))throw Error('Choose monthly or weekly newsletter.');
   return resp(await sendIssue(body.kind==='weekly'?'manual_weekly':'manual_monthly',await config(),who.id),200,origin);
  }
  return resp({error:'Unsupported newsletter action'},404,origin);
 }catch(error){
  const msg=message(error),auth=/admin|authenticator|session|sign-in|unauthorized/i.test(msg);
  console.error('Newsletter request error',msg);
  return resp({error:msg},auth?403:400,origin);
 }
});
