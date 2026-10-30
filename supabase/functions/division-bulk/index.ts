import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,key,{auth:{persistSession:false}});
const origins=new Set(['https://divisionivmasons.org','https://www.divisionivmasons.org','https://scottxian.github.io','https://calendar.divisionivmasons.org','http://localhost:5173','http://127.0.0.1:5173']);
const allowedModes=new Set(['in_person','hybrid','online']);
const fields=['title','event_type','hosted_by','district','start_local','end_local','event_mode','location_name','location_address1','location_address2','location_city','location_state','location_zip','location_tbd','virtual_meeting_url','public_description','attire','invited_audience','registration_url','payment_url','flyer_url','poc_name','poc_position','poc_phone','poc_email','cost_details'];
const fieldLimits={title:180,public_description:4000,poc_name:150,poc_position:120,poc_phone:50,poc_email:250,cost_details:180};
const t=(v:any)=>String(v??'').trim();
const emailOk=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=250;
const localOk=(v:string)=>/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)&&!Number.isNaN(Date.parse(v));
function urlOk(v:string){try{return ['http:','https:'].includes(new URL(v).protocol)}catch{return false}}
function respond(data:any,status=200,origin=''){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','vary':'Origin',...(origins.has(origin)?{'access-control-allow-origin':origin}:{})}})}
function fail(error:string,status=400,origin=''){return respond({error},status,origin)}
async function staffFor(req:Request){
 const token=t(req.headers.get('authorization')).replace(/^Bearer\s+/i,'');
 if(!token)throw Error('Inspector or administrator sign-in required.');
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user?.email)throw Error('Inspector session is not valid. Sign in again.');
 const {data:staff,error:staffError}=await db.from('staff_accounts').select('id,email,display_name,role').eq('email',data.user.email.toLowerCase()).eq('enabled',true).is('removed_at',null).maybeSingle();
 if(staffError||!staff||!['admin','inspector'].includes(staff.role))throw Error('Enabled Inspector or Administrator account required.');
 const {data:factors,error:factorError}=await db.auth.admin.mfa.listFactors({userId:data.user.id});
 if(factorError||!Array.isArray(factors?.factors))throw Error('Unable to verify account security.');
 if(!factors.factors.some((f:any)=>f.status==='verified'&&['totp','phone'].includes(f.factor_type)))throw Error('Set up MFA in Account security before importing.');
 try{
  const claims=JSON.parse(atob((token.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/')));
  if(claims.aal!=='aal2'||claims.sub!==data.user.id)throw Error('Complete MFA verification before importing.');
 }catch(e){if(e instanceof Error&&e.message.includes('MFA'))throw e;throw Error('Complete MFA verification before importing.')}
 return staff;
}
async function digest(str:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function pacificDate(value:string){
 const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const take=(part:string)=>pieces.find(x=>x.type===part)?.value||'';
 return take('year')+'-'+take('month')+'-'+take('day');
}
function normalizedTitle(title:string,host:string){
 let value=t(title).toLowerCase().replace(/\s+/g,' ');
 const start=t(host).toLowerCase()+':';
 if(value.startsWith(start))value=value.slice(start.length).trim();
 return value;
}
function matchKey(p:any){return [t(p.hosted_by).toLowerCase(),t(p.event_type).toLowerCase(),t(p.start_local).slice(0,10),normalizedTitle(p.title,p.hosted_by)].join('|')}
async function context(){
 const [l,tps,ds,events,requests]=await Promise.all([
  db.from('lodges').select('lodge_name,lodge_number,district,abbreviation').eq('active',true),
  db.from('event_types').select('label').eq('enabled',true),
  db.from('system_settings').select('setting_value').eq('setting_key','district_numbers').maybeSingle(),
  db.from('events').select('title,event_type,hosted_by,starts_at,event_code').eq('status','active').order('starts_at',{ascending:false}).limit(1500),
  db.from('event_requests').select('request_code,proposed_fields,status,idempotency_key').eq('request_type','new').in('status',['pending','needs_correction','approved']).order('submitted_at',{ascending:false}).limit(1500)
 ]);
 for(const result of [l,tps,ds,events,requests])if(result.error)throw Error('Unable to validate the spreadsheet against current calendar records: '+result.error.message);
 const existing=new Map<string,string[]>();
 function add(key:string,label:string){existing.set(key,[...(existing.get(key)||[]),label])}
 for(const e of events.data||[]){
  const key=matchKey({...e,start_local:pacificDate(e.starts_at)+'T00:00'});
  add(key,'Published: '+e.event_code);
 }
 for(const r of requests.data||[]){
  const p=r.proposed_fields||{};if(p.title&&p.hosted_by&&p.start_local)add(matchKey(p),'Submission: '+r.request_code+' ('+r.status+')');
 }
 return {lodges:new Map((l.data||[]).map((x:any)=>[String(x.lodge_number||''),x])),
  types:new Set((tps.data||[]).map((x:any)=>x.label)),
  districts:new Set((Array.isArray(ds.data?.setting_value)?ds.data.setting_value:[]).map(String)),
  existing};
}
function validated(row:any,ctx:any,staff:any){
 const issues:string[]=[];
 const get=(key:string)=>t(row[key]);
 const number=get('lodge_no').replace(/\.0$/,'');
 const other=get('other_host'),soi=get('event_type')==='Division School of Instruction';
 if(number&&other)issues.push('Choose either a lodge number or Other Host, not both.');
 if(soi&&number)issues.push('Division School of Instruction must use Other Host: Division IV.');
 const lodge=number?ctx.lodges.get(number):null;
 if(number&&!lodge)issues.push('Lodge number not found in the active lodge directory.');
 const host=lodge?lodge.lodge_name+' Lodge No. '+lodge.lodge_number:other;
 if(!host)issues.push('Choose a lodge number or enter Other Host.');
 if(soi&&host.toLowerCase()!=='division iv')issues.push('Division Schools must be hosted by Division IV.');
 const override=get('district_override'),district=soi?'':(lodge?t(lodge.district):override);
 if(lodge&&override&&override!==district)issues.push('District override conflicts with the saved lodge district.');
 if(!soi&&!ctx.districts.has(district))issues.push('A valid district is required.');
 const p:any={hosted_by:host,district,event_mode:get('event_mode')||'in_person'};
 for(const f of fields){
  if(f==='hosted_by'||f==='district'||f==='event_mode')continue;
  let value:any=row[f];
  if(f==='location_tbd'){p[f]=value===true||['yes','true','1'].includes(t(value).toLowerCase());continue}
  const str=t(value);const limit=(fieldLimits as any)[f]||1000;
  if(str.length>limit)issues.push(f.replaceAll('_',' ')+' exceeds '+limit+' characters.');
  p[f]=str.slice(0,limit);
 }
 for(const f of ['title','event_type','start_local','end_local'])if(!p[f])issues.push('Missing '+f.replaceAll('_',' ')+'.');
 if(!ctx.types.has(p.event_type))issues.push('Event type is not enabled.');
 if(!allowedModes.has(p.event_mode))issues.push('Event format must be in_person, online or hybrid.');
 if(p.start_local&&!localOk(p.start_local))issues.push('Invalid start date/time (Pacific).');
 if(p.end_local&&!localOk(p.end_local))issues.push('Invalid end date/time (Pacific).');
 if(p.start_local&&p.end_local&&p.end_local<=p.start_local)issues.push('Event must end after it starts.');
 if(p.poc_email&&!emailOk(p.poc_email))issues.push('Invalid POC email.');
 for(const f of ['virtual_meeting_url','registration_url','payment_url','flyer_url'])
   if(p[f]&&!urlOk(p[f]))issues.push('Invalid '+f.replaceAll('_',' ')+' URL.');
 if(p.location_state)p.location_state=p.location_state.toUpperCase();
 if(p.event_mode==='online'){
  if(!urlOk(p.virtual_meeting_url))issues.push('Online events require a valid meeting link.');
  p.location_tbd=false;
  p.location_name=p.location_name||'Zoom';
  for(const f of ['location_address1','location_address2','location_city','location_state','location_zip'])p[f]='';
 }else if(!p.location_tbd){
  for(const f of ['location_name','location_address1','location_city','location_state','location_zip'])
   if(!p[f])issues.push('Missing '+f.replaceAll('_',' ')+'.');
  if(p.location_state&&!/^[A-Z]{2}$/.test(p.location_state))issues.push('Use a two-letter state.');
  if(p.location_zip&&!/^\d{5}(-\d{4})?$/.test(p.location_zip))issues.push('Use a valid ZIP code.');
 }else{
  for(const f of ['location_name','location_address1','location_address2','location_city','location_state','location_zip'])p[f]='';
 }
 const requesterName=get('requester_name')||staff.display_name||staff.email;
 const requesterEmail=(get('requester_email')||staff.email).toLowerCase();
 const requesterPhone=get('requester_phone');
 if(!emailOk(requesterEmail)||requesterName.length<2)issues.push('Invalid submitter name or email.');
 if(requesterName.length>150||requesterPhone.length>50||get('requester_message').length>2000)issues.push('Submitter information exceeds length limits.');
 const calendarTitle=soi?p.title:(lodge?t(lodge.abbreviation)||host:host)+': '+p.title.replace(new RegExp('^'+host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':\\s*','i'),'');
 return {row_number:Number(row.row_number),p,requester_name:requesterName,requester_email:requesterEmail,requester_phone:requesterPhone,requester_message:get('requester_message'),
  host,calendar_title:calendarTitle,issues};
}
async function inspect(rows:any[],staff:any){
 const ctx=await context(),seen=new Map<string,number>(),out:any[]=[];
 for(const row of rows){
  const item:any=validated(row,ctx,staff);
  const key=matchKey(item.p);item.fingerprint=await digest(key);
  const warnings:string[]=[];
  const exact=ctx.existing.get(key)||[];
  if(exact.length)warnings.push('Possible matching event: '+exact.slice(0,2).join(', '));
  if(seen.has(key))warnings.push('Similar to spreadsheet row '+seen.get(key));
  else seen.set(key,item.row_number);
  item.warnings=warnings;
  item.status=item.issues.length?'invalid':warnings.length?'warning':'ready';
  delete item.p;delete item.requester_name;delete item.requester_email;delete item.requester_phone;delete item.requester_message;
  out.push(item);
 }
 return out;
}
function inputRows(body:any){
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>25)throw Error('Select between 1 and 25 populated new-event rows.');
 const numbers=new Set<number>();
 for(const row of body.rows){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid event row.');
  const n=Number(row.row_number);if(!Number.isInteger(n)||n<3||n>500||numbers.has(n))throw Error('Invalid or repeated spreadsheet row number.');
  numbers.add(n);
 }
 return body.rows;
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origins.has(origin)?origin:'null','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type,apikey,x-client-info','vary':'Origin'}});
 if(origin&&!origins.has(origin))return fail('Origin not allowed.',403,origin);
 if(req.method!=='POST')return fail('POST required.',405,origin);
 try{
  const staff=await staffFor(req);
  const action=new URL(req.url).searchParams.get('action');
  if(!['preview','submit'].includes(action||''))return fail('Unknown import action.',400,origin);
  const body=await req.json();
  const rows=inputRows(body);
  if(action==='preview'){
    const items=await inspect(rows,staff);
    return respond({items,summary:{ready:items.filter((x:any)=>x.status==='ready').length,warnings:items.filter((x:any)=>x.status==='warning').length,invalid:items.filter((x:any)=>x.status==='invalid').length}},200,origin);
  }
  const filename=t(body.filename).slice(0,180);
  if(!/\.xlsx$/i.test(filename))throw Error('An Excel .xlsx file is required.');
  const confirmations=new Set((Array.isArray(body.confirmed_rows)?body.confirmed_rows:[]).map(Number));
  const items=await inspect(rows,staff);
  const hash=await digest(JSON.stringify({rows,confirmed_rows:[...confirmations].filter(Number.isInteger).sort((a,b)=>a-b)}));
  const batchKey=staff.id+':'+hash;
  const {data:existing,error:existingError}=await db.from('bulk_event_imports').select('*').eq('batch_key',batchKey).maybeSingle();
  if(existingError)throw Error(existingError.message);
  if(existing){
   if(existing.status!=='completed')return respond({error:'This spreadsheet is already being processed. Try refreshing the results before submitting again.'},409,origin);
   return respond({ok:true,replayed:true,batch_id:existing.id,results:existing.results,submitted:existing.submitted_count,skipped:existing.skipped_count,errors:existing.error_count},200,origin);
  }
  const {data:batch,error:batchError}=await db.from('bulk_event_imports').insert({batch_key:batchKey,filename,importer_staff_id:staff.id,importer_email:staff.email,source_count:rows.length}).select('id').single();
  if(batchError){
   if(batchError.code==='23505')return fail('This spreadsheet is already being processed. Refresh the results before retrying.',409,origin);
   throw Error('Unable to initialize import tracking: '+batchError.message);
  }
  const ctx=await context(),results:any[]=[];
  for(const row of rows){
   const inspected=items.find((v:any)=>v.row_number===Number(row.row_number));
   const base={row_number:row.row_number,title:t(row.title),host:inspected?.host||''};
   if(inspected?.status==='invalid'){results.push({...base,status:'error',message:inspected.issues.join(' ')});continue}
   if(inspected?.status==='warning'&&!confirmations.has(Number(row.row_number))){
    results.push({...base,status:'skipped',message:'Possible duplicate — not confirmed. Review and resubmit this row if intentional.'});continue
   }
   const val=validated(row,ctx,staff);
   const fingerprint=await digest(matchKey(val.p));
   const idem=confirmations.has(Number(row.row_number))&&inspected?.status==='warning'
    ?'bulk-confirm:'+batch.id+':'+row.row_number : 'bulk:'+fingerprint;
   const code='DIV4-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
   const {data,error}=await db.rpc('bulk_import_new_request',{
     p_code:code,p_fields:val.p,p_requester_name:val.requester_name,p_requester_email:val.requester_email,
     p_requester_phone:val.requester_phone,p_requester_message:val.requester_message,p_dedupe_key:idem,
     p_actor_email:staff.email,p_staff_id:staff.id,p_batch_id:batch.id,p_row:Number(row.row_number)
   });
   if(error){results.push({...base,status:'error',message:error.message});continue}
   results.push({...base,status:data?.created?'submitted':'skipped',message:data?.created?'Submitted for individual approval':'Previously imported; no duplicate created',request_id:data?.id,request_code:data?.request_code});
  }
  const submitted=results.filter(x=>x.status==='submitted').length,skipped=results.filter(x=>x.status==='skipped').length,errors=results.filter(x=>x.status==='error').length;
  const {error:doneError}=await db.from('bulk_event_imports').update({status:'completed',completed_at:new Date().toISOString(),submitted_count:submitted,skipped_count:skipped,error_count:errors,results}).eq('id',batch.id);
  if(doneError)throw Error('Events processed, but import summary could not be finalized: '+doneError.message);
  let notificationWarning='';
  if(submitted>0){
   const {data:reviewers,error:reviewerError}=await db.from('staff_accounts').select('email').eq('enabled',true).is('removed_at',null);
   if(reviewerError)notificationWarning='Inspector summary notification list could not be loaded.';
   else if(reviewers?.length){
    const mail=reviewers.map((x:any)=>({message_type:'bulk_import_summary',recipient_email:x.email,idempotency_key:'bulk-summary:'+batch.id+':'+x.email}));
    const {error:mailError}=await db.from('email_deliveries').upsert(mail,{onConflict:'idempotency_key',ignoreDuplicates:true});
    if(mailError)notificationWarning='Calendar submissions saved, but summary email could not be queued.';
   }
  }
  return respond({ok:true,batch_id:batch.id,results,submitted,skipped,errors,...(notificationWarning?{notice:notificationWarning}:{})},201,origin);
 }catch(e){console.error('Bulk import operation:',e instanceof Error?e.message:e);return fail(e instanceof Error?e.message:'Unable to process bulk import.',400,origin)}
});
