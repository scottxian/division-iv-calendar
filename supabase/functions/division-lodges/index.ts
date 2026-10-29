import { createClient } from 'npm:@supabase/supabase-js@2';
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const allowedOrigins = new Set(['https://divisionivmasons.org','https://www.divisionivmasons.org',
 'https://headless-odfdmxtmddz-scottyjchristian-1410.wix-site-host.com',
 'https://calendar.divisionivmasons.org',
 'https://scottxian.github.io',
 'http://localhost:5173','http://127.0.0.1:5173'
]);
const publicFields='id,lodge_name,lodge_number,district,address_line1,city,county,state,meeting_day,meeting_time,meeting_notes,official_url,record_version,updated_at';
function reply(body:unknown,status=200,origin=''){
 const headers:Record<string,string>={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
 if(allowedOrigins.has(origin))headers['access-control-allow-origin']=origin;
 return new Response(JSON.stringify(body),{status,headers});
}
function error(message:string,status=400,origin=''){return reply({error:message},status,origin)}
async function verifiedMfaRequired(user:any,token:string){
 if(!user?.id)throw Error('Authenticated user could not be verified for MFA.');
 // Auth getUser() does not guarantee the MFA enrollment list is present.
 // Server-side Auth Admin is authoritative; lookup failures must deny access.
 const {data,error}=await db.auth.admin.mfa.listFactors({userId:user.id});
 if(error||!Array.isArray(data?.factors)){
  console.error('Administrator MFA enrollment lookup failed',error?.message||'Unexpected response');
  throw Error('Unable to verify administrator MFA status. Try again.');
 }
 const enrolled=data.factors.some((f:any)=>f?.status==='verified'&&['totp','phone'].includes(f.factor_type));
 if(!enrolled)throw Error('Set up an authenticator in Account security before using the Inspector Desk.');
 try{
  const middle=token.split('.')[1]||'';
  const claims=JSON.parse(atob(middle.replace(/-/g,'+').replace(/_/g,'/')));
  // Supabase getUser(token) already verified this JWT and identified its user.
  if(claims.aal==='aal2'&&claims.sub===user.id)return;
 }catch{}
 throw Error('Complete the authenticator verification in Account security.');
}
async function inspector(req:Request){
 const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!bearer)throw new Error('Sign in through the Inspector Desk first');
 const {data,error}=await db.auth.getUser(bearer);
 if(error||!data.user?.email)throw new Error('Inspector session expired. Sign in again.');
 const email=data.user.email.toLowerCase();
 const {data:staff,error:staffError}=await db.from('staff_accounts')
  .select('id,email,display_name,role,district,enabled,removed_at')
  .eq('email',email).eq('enabled',true).is('removed_at',null).maybeSingle();
 if(staffError||!staff||!['admin','inspector'].includes(staff.role))throw new Error('An enabled inspector account is required');
 await verifiedMfaRequired(data.user,bearer);
 return staff;
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const cors={'access-control-allow-origin':allowedOrigins.has(origin)?origin:'null',
 'access-control-allow-methods':'GET,POST,OPTIONS',
 'access-control-allow-headers':'authorization,content-type,apikey,x-client-info',
 'access-control-max-age':'3600','vary':'Origin'};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(origin&&!allowedOrigins.has(origin))return error('Origin not allowed',403,origin);
 try{
  const action=new URL(req.url).searchParams.get('action')||'public';
  if(action==='public'){
   if(req.method!=='GET')return error('GET required',405,origin);
   const {data,error:readError}=await db.from('lodges').select(publicFields).eq('active',true)
      .order('district',{ascending:true}).order('lodge_name',{ascending:true}).limit(1000);
   if(readError)throw readError;
   return reply({lodges:data||[],count:data?.length||0},200,origin);
  }
  const staff=await inspector(req);
  if(staff.role!=='admin'&&['all','save','history'].includes(action))
   return error('Administrator access required for lodge management',403,origin);
  if(action==='all'){
   if(req.method!=='GET')return error('GET required',405,origin);
   const [lodges, districts, inspectors] = await Promise.all([
    db.from('lodges').select(publicFields+',active,abbreviation')
     .order('district',{ascending:true}).order('lodge_name',{ascending:true}).limit(1000),
    db.from('districts').select('district_code,district_name').eq('active',true).order('district_code'),
    db.from('staff_accounts').select('district,display_name,role')
     .eq('enabled',true).is('removed_at',null).not('district','is',null)
   ]);
   if(lodges.error)throw lodges.error;
   if(districts.error)throw districts.error;
   if(inspectors.error)throw inspectors.error;
   const byDistrict=new Map<string,string[]>();
   for(const entry of inspectors.data||[]){
    if(!entry.district)continue;
    const list=byDistrict.get(entry.district)||[];
    const name=String(entry.display_name||'Inspector').trim();
    if(name && !list.includes(name))list.push(name);
    byDistrict.set(entry.district,list);
   }
   return reply({
    lodges:lodges.data||[],
    districts:(districts.data||[]).map(d=>({
      code:d.district_code,name:d.district_name,
      inspectors:byDistrict.get(d.district_code)||[]
    })),
    staff:{display_name:staff.display_name,role:staff.role,district:staff.district}
   },200,origin);
  }
  if(action==='save'){
   if(staff.role!=='admin')return error('Administrator access required to edit lodge information or district assignments',403,origin);
   if(req.method!=='POST')return error('POST required',405,origin);
   const b=await req.json();
   const id=typeof b?.id==='string'?b.id:'';
   const version=Number(b?.expected_version);
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
      !Number.isInteger(version)||version<1||!b?.fields||typeof b.fields!=='object'||Array.isArray(b.fields))
      return error('Select a lodge and refresh before saving',400,origin);
   const fields:Record<string,string>={};
   const permitted=['lodge_name','lodge_number','abbreviation','district','address_line1','city','county','state','meeting_day','meeting_time','meeting_notes','official_url'];
   for(const [k,v] of Object.entries(b.fields)){
    if(!permitted.includes(k))return error('This lodge field cannot be edited',400,origin);
    if(typeof v!=='string'||v.length>1200)return error('Invalid value for '+k,400,origin);
    if(k==='abbreviation'&&Array.from(v.trim()).length>20)return error('Lodge abbreviation cannot exceed 20 characters',400,origin);
    fields[k]=v.trim();
   }
   const {data,error:saveError}=await db.rpc('inspector_update_lodge',
     {p_lodge_id:id,p_staff_id:staff.id,p_expected_version:version,p_fields:fields});
   if(saveError)return error(saveError.message,409,origin);
   return reply({ok:true,lodge:data,notice:'Lodge information saved and recorded in the change history.'},200,origin);
  }
  if(action==='history'){
   if(req.method!=='GET')return error('GET required',405,origin);
   const id=new URL(req.url).searchParams.get('id')||'';
   if(!/^[0-9a-f-]{36}$/i.test(id))return error('Invalid lodge ID',400,origin);
   const {data, error:historyError}=await db.from('lodge_change_history')
     .select('id,created_at,previous_version,new_version,actor_staff_id,before_data,after_data')
     .eq('lodge_id',id).order('created_at',{ascending:false}).limit(30);
   if(historyError){console.error('Lodge history query failed',historyError);throw new Error('Unable to read the lodge edit history. Please try again.');}
   const ids=[...new Set((data||[]).map(x=>x.actor_staff_id))];
   const {data:staffList}=ids.length?await db.from('staff_accounts').select('id,display_name').in('id',ids):{data:[]};
   const names=new Map((staffList||[]).map(x=>[x.id,x.display_name]));
   return reply({items:(data||[]).map(x=>({created_at:x.created_at,previous_version:x.previous_version,new_version:x.new_version,
      by:names.get(x.actor_staff_id)||'Inspector',
      before:x.before_data,after:x.after_data}))},200,origin);
  }
  return error('Unknown action',404,origin);
 }catch(e){
  console.error('lodge request error',e);
  const msg=e instanceof Error?e.message:'Unexpected server error';
  return error(msg,/Sign in|session|inspector|authenticator|mfa/i.test(msg)?403:400,origin);
 }
});
