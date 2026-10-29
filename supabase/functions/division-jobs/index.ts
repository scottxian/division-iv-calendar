import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,key,{auth:{persistSession:false}});
function j(v:unknown,status=200){return new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})}
const enc=new TextEncoder();
function pemBytes(pem:string){return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0))}
function b64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function googleToken(){
 const creds=JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')||'{}');
 if(!creds.client_email||!creds.private_key)throw Error('Google service account is not configured');
 const pk=await crypto.subtle.importKey('pkcs8',pemBytes(creds.private_key).buffer,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const now=Math.floor(Date.now()/1000);
 const header=b64url(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const payload=b64url(enc.encode(JSON.stringify({iss:creds.client_email,scope:'https://www.googleapis.com/auth/calendar.events',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})));
 const signed=header+'.'+payload;
 const signature=b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pk,enc.encode(signed))));
 const resp=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed+'.'+signature})});
 const body=await resp.json();if(!resp.ok)throw Error('Google OAuth failed: '+(body.error_description||body.error||resp.status));return body.access_token;
}
async function readCalendarId(){
 const {data,error}=await db.from('system_settings').select('setting_value').eq('setting_key','calendar_id').maybeSingle();
 if(error)throw Error('Calendar setting unavailable: '+error.message);
 const id=data?.setting_value;
 if(typeof id!=='string'||!id.trim())throw Error('Division IV Calendar ID has not been configured');
 return id.trim();
}
async function calendar(action:string,path:string,token:string,body?:any){
 const id=await readCalendarId();
 const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(id)+'/events'+path,{method:action,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let data:any={};try{data=await res.json()}catch{}
 return {ok:res.ok,status:res.status,data};
}
const safe=(s:any)=>String(s||'').replace(/[<>]/g,'');
async function syncCalendar(job:any,token:string){
 const {data:e,error}=await db.from('events').select('*').eq('id',job.event_id).single();
 if(error||!e)throw Error('Event record unavailable');
 // Prevent an old queued version from overwriting newer approved data.
 if(e.version!==job.event_version)return 'Superseded by newer event version';
 const googleId=(e.google_event_id||e.id.replaceAll('-','')).toLowerCase();
 if(job.action==='cancel'){
  const response=await calendar('DELETE','/'+googleId,token);
  if(!response.ok&&response.status!==404)throw Error('Calendar delete failed: '+JSON.stringify(response.data).slice(0,350));
 }else{
  // Use the event's original new-event submission for the public point of contact.
  // A change request can be submitted by a different person; it should not silently replace the POC.
  const {data:contactRequest,error:contactError}=await db.from('event_requests')
    .select('requester_name,requester_phone')
    .eq('approved_event_id',e.id).eq('request_type','new').eq('status','approved')
    .order('submitted_at',{ascending:true}).limit(1).maybeSingle();
  if(contactError)throw Error('Unable to load event point of contact: '+contactError.message);
  const pocName=String(e.poc_name||contactRequest?.requester_name||'').trim();
   const pocPosition=String(e.poc_position||'').trim();
  const pocPhone=String(e.poc_phone||contactRequest?.requester_phone||'').trim();
  const pocEmail=String(e.poc_email||'').trim();
  const host=safe(e.hosted_by).trim();
  const title=safe(e.title).trim();
  const calendarTitle=(e.event_type==='Division School of Instruction' ? title : (host && !title.toLowerCase().startsWith((host+':').toLowerCase()) ? host+': '+title : title)).slice(0,1024);
  const contactDetails=[pocName?'Point of contact: '+safe(pocName):'',pocPosition?'POC position: '+safe(pocPosition):'',pocPhone?'POC phone: '+safe(pocPhone):'',pocEmail?'POC email: '+safe(pocEmail):''].filter(Boolean).join('\n');
  let onlineLink=String(e.virtual_meeting_url||'').trim();
  if(e.event_mode==='online'&&!onlineLink){
   // Older approval functions may have retained the link only in the source request.
   const {data:sourceRequest}=await db.from('event_requests').select('proposed_fields')
    .eq('approved_event_id',e.id).eq('request_type','new').limit(1).maybeSingle();
   onlineLink=String(sourceRequest?.proposed_fields?.virtual_meeting_url||'').trim();
  }
  const text=[e.public_description||'',e.event_mode==='online'&&onlineLink?'Online meeting: '+onlineLink:'',e.hosted_by?'Hosted by '+e.hosted_by:'',e.cost_details?'Cost: '+safe(e.cost_details):'',contactDetails,e.registration_url?'Registration: '+e.registration_url:'',e.payment_url?'Payment: '+e.payment_url:''].filter(Boolean).join('\n\n');
  const venue=e.event_mode==='online'?(onlineLink||e.location_name||'Online'):[e.location_name,e.location_address].filter(Boolean).join(', ')||(e.location_tbd?'Location TBD':'');
  const payload={id:googleId,summary:calendarTitle,description:text,location:venue,start:{dateTime:e.starts_at,timeZone:'America/Los_Angeles'},end:{dateTime:e.ends_at,timeZone:'America/Los_Angeles'}};
  // Deterministic Google event ID avoids duplicates if an insert succeeds before logging does.
  let response=await calendar('PUT','/'+googleId,token,payload);
  if(response.status===404){response=await calendar('POST','',token,payload);if(response.status===409)response=await calendar('PUT','/'+googleId,token,payload)}
  if(!response.ok)throw Error('Google Calendar sync failed: '+JSON.stringify(response.data).slice(0,350));
 }
 await db.from('events').update({google_event_id:googleId,calendar_last_synced_at:new Date().toISOString()}).eq('id',e.id);
 return 'Synced';
}
async function sendEmail(job:any){
 const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('MAIL_FROM');
 if(!apiKey||!from)throw Error('Transactional email not configured');
 const {data:r}=await db.from('event_requests').select('*').eq('id',job.request_id).maybeSingle();
 const {data:settings}=await db.from('system_settings').select('setting_value').eq('setting_key','public_email_links').maybeSingle();
 if(!r)throw Error('Request no longer available');
 const {data:event}=r.approved_event_id?await db.from('events').select('*').eq('id',r.approved_event_id).maybeSingle():{data:null};
 const base='https://calendar.divisionivmasons.org/';
 const title=event?.title||r.proposed_fields?.title||'Division IV Calendar submission';
 const linkId=event?.event_code||r.request_code;
 const update=base+'?action=change&id='+encodeURIComponent(linkId);
 const cancel=base+'?action=cancel&id='+encodeURIComponent(linkId);
 let subject='',body='';
 if(job.message_type==='acknowledgment'){
   const kindLabel=r.request_type==='new'?'event':r.request_type==='change'?'event update':'event cancellation';
   subject='[Division IV] Calendar submission received: '+r.request_code;
   body='Your '+kindLabel+' submission has been received and is awaiting verification for calendar publication.\nSubmission ID: '+r.request_code+'\nEvent: '+title+'\n\nLodges independently schedule their own activities. The Division verifies calendar information for accurate coordination and publication; this is not permission to schedule an event.\n\nYou will receive an update when the submission is processed.';
 }else if(job.message_type==='inspector_update'){
   subject='[Division IV] Inspector updated event: '+title;
   const {data:changes}=await db.from('event_history').select('after_data,actor_email')
      .eq('event_id',job.event_id).eq('action','inspector_updated_published')
      .order('occurred_at',{ascending:false}).limit(25);
   const revision=Number(String(job.idempotency_key||'').split(':')[1]);
   const edit=(changes||[]).find((x:any)=>Number(x.after_data?.version)===revision);
   const fields=edit?.after_data?.changes||{};
   const present=(v:any)=>v===true?'Yes':v===false?'No':v==null||v===''?'Not specified':String(v);
   const lines=Object.entries(fields).map(([k,v])=>k.replaceAll('_',' ')+': '+present(v));
   body='An authorized Division IV inspector updated a published calendar event.\nEvent: '+title+
    '\nEvent ID: '+linkId+'\nUpdated by: '+(edit?.actor_email||'Division IV Inspector')+
    '\n\nChanges:\n'+(lines.length?lines.join('\n'):'Event details updated')+
    '\n\nThe change has been saved and Google Calendar synchronization is queued.\n'+
    'Public calendar: '+base+'calendar.html';
 }else if(job.message_type==='reviewer_notification'){
   subject='[Division IV] Calendar submission awaiting verification: '+r.request_code;
   body='A calendar submission is awaiting verification for publication.\nSubmission ID: '+r.request_code+'\nEvent: '+title+'\nSubmitted by: '+r.requester_name+'\n\nCheck accuracy, duplicates, and authorization for changes. Communicate any scheduling overlaps for coordination; they do not by themselves prohibit a lodge event.\n\nReview in the Inspector Desk: '+base;
 }else{
   const label:Record<string,string>={
     approved:'Verified for Publication',needs_correction:'Returned for Correction',
     rejected:'Not Published',pending:'Awaiting Publication'
   };
   const display=label[r.status]||r.status.replaceAll('_',' ');
   subject='[Division IV] Calendar submission — '+display+': '+r.request_code;
   body='Calendar submission status: '+display+'\nEvent: '+title+'\nSubmission ID: '+r.request_code+'\n'+(r.reviewer_public_message||'');
   if(r.status==='approved')body+='\n\nThe listing has been verified for publication. Google Calendar synchronization is queued.';
   if(r.status==='needs_correction')body+='\n\nPlease address the noted details and resubmit your updated information.';
   if(r.status==='rejected')body+='\n\nThis means the listing was not published to the Division calendar. It does not affect the lodge’s authority to schedule its activities.';
   if(r.status==='approved'){
     if(r.inspector_edits){
       const before=r.proposed_fields||{},after=r.inspector_edits||{};
       const changed=Object.keys(after).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])&&k!=='location_address');
       if(changed.length){
         const display=(v:any)=>typeof v==='boolean'?(v?'Yes':'No'):(v==null||v===''?'Not specified':String(v));
         const human=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
         body+='\n\nInspector corrections included before publication:\n'+changed.map(k=>human(k)+': '+display(after[k])).join('\n');
       }
     }
     body+='\n\nChange event: '+update+'\nCancel event: '+cancel;
   }
 }
 if(settings?.setting_value)body+='\n\nCalendar links:\n'+String(settings.setting_value);
 const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json','Idempotency-Key':job.idempotency_key},body:JSON.stringify({from,to:[job.recipient_email],subject,text:body})});
 const result=await res.json();if(!res.ok)throw Error('Email provider: '+JSON.stringify(result).slice(0,350));
 await db.from('email_deliveries').update({provider_message_id:result.id||null,sent_at:new Date().toISOString()}).eq('id',job.id);
}
Deno.serve(async req=>{
 const secret=Deno.env.get('JOB_RUNNER_SECRET');
 if(req.method!=='POST'||!secret||req.headers.get('x-job-secret')!==secret)return j({error:'Not authorized'},401);
 // No queue processing during a read-only Google connection check.
 const action=req.headers.get('x-job-action')||'';
 if(action==='check'){
   try{
     const accessToken=await googleToken();
     const result=await calendar('GET','?maxResults=1&fields=kind',accessToken);
     return j({ok:result.ok,google_auth:true,calendar_access:result.ok,google_status:result.status,events_modified:false},result.ok?200:502);
   }catch(e){
     return j({ok:false,step:'google_connection',message:String(e instanceof Error?e.message:'Connection failed').slice(0,250),events_modified:false},502);
   }
 }

 if(action==='test-email'){
   const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('MAIL_FROM');
   if(!apiKey||!from)return j({ok:false,email_test:false,message:'Resend API key or sender address is not configured; no message sent.'},503);
   const testRecipient='scottyjchristian@gmail.com';
   const {data:admin,error:adminError}=await db.from('staff_accounts').select('id').eq('email',testRecipient).eq('role','admin').eq('enabled',true).maybeSingle();
   if(adminError||!admin)return j({ok:false,email_test:false,message:'Authorized administrator test recipient not available; no message sent.'},403);
   try{
     const response=await fetch('https://api.resend.com/emails',{
       method:'POST',
       headers:{'authorization':'Bearer '+apiKey,'content-type':'application/json','Idempotency-Key':'divisioniv-calendar-test-2026-10-19'},
       body:JSON.stringify({
         from,
         to:[testRecipient],
         subject:'Division IV Calendar — Email Delivery Test',
         text:'This is a one-time delivery test from the Division IV Calendar system.\n\nResend is connected to Supabase. No calendar submissions, entries, or queued notifications were changed by this email test.\n\nIf you received this email, please return to ChatGPT and confirm that it arrived.'
       })
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok)return j({ok:false,email_test:false,provider_status:response.status,error_code:result.name||result.error||'resend_error',message:typeof result.message==='string'?result.message.slice(0,350):'Resend rejected the test email.',queued_notifications_modified:false},502);
     return j({ok:true,email_test:true,sent_to:testRecipient,provider_status:response.status,provider_message_id:result.id||null,queued_notifications_modified:false,message:'Resend accepted the isolated test email. Check your inbox.'});
   }catch(e){
     return j({ok:false,email_test:false,message:'Unable to reach Resend. No queued notifications changed.',queued_notifications_modified:false},502);
   }
 }
 if(action!=='run'&&action!=='run-calendar'&&action!=='run-one-calendar'&&action!=='run-email')return j({error:'Specify x-job-action: check, test-email, run-email, run-calendar, run-one-calendar, or run. No jobs processed.'},400);
 const calendarReady=!!(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')&&await readCalendarId().catch(()=>null));
 const emailReady=!!(Deno.env.get('RESEND_API_KEY')&&Deno.env.get('MAIL_FROM'));
 const output:any[]=[];let token:string|null=null;
 if(action!=='run-email'&&calendarReady){
  const single=action==='run-one-calendar';
  const specificJobId=req.headers.get('x-calendar-job-id')||'';
  if(single&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(specificJobId))return j({error:'A valid x-calendar-job-id header is required for a one-event test.'},400);
  const query=db.from('calendar_jobs').select('*').in('status',single?['pending']:['pending','failed']).order('created_at').limit(single?1:15);
  const {data:jobs}=await (single?query.eq('id',specificJobId):query);
  for(const job of jobs||[]){
   const {data:claimed}=await db.from('calendar_jobs').update({status:'running',attempts:job.attempts+1,last_error:null}).eq('id',job.id).eq('status',job.status).select('id');
   if(!claimed?.length)continue;
   try{token||=await googleToken();const result=await syncCalendar(job,token);await db.from('calendar_jobs').update({status:'succeeded',finished_at:new Date().toISOString()}).eq('id',job.id);output.push({type:'calendar',id:job.id,status:'succeeded',detail:result})}
   catch(e){await db.from('calendar_jobs').update({status:'failed',last_error:String(e).slice(0,1000)}).eq('id',job.id);output.push({type:'calendar',id:job.id,status:'failed'})}
  }
 }
 if((action==='run'||action==='run-email')&&emailReady){
  const {data:jobs}=await db.from('email_deliveries').select('*').in('status',['pending','failed']).order('created_at').limit(25);
  for(const job of jobs||[]){
   const {data:claimed}=await db.from('email_deliveries').update({status:'sending',attempts:job.attempts+1,last_error:null}).eq('id',job.id).eq('status',job.status).select('id');
   if(!claimed?.length)continue;
   try{await sendEmail(job);await db.from('email_deliveries').update({status:'sent'}).eq('id',job.id);output.push({type:'email',id:job.id,status:'sent'})}
   catch(e){await db.from('email_deliveries').update({status:'failed',last_error:String(e).slice(0,1000)}).eq('id',job.id);output.push({type:'email',id:job.id,status:'failed'})}
  }
 }
 return j({calendar_configured:calendarReady,email_configured:emailReady,processed:output});
});
