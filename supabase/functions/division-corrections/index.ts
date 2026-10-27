// Division IV correction queue. Public submissions only; every read/update requires live admin + MFA AAL2.
import {createClient} from 'npm:@supabase/supabase-js@2.57.0';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(['https://divisionivmasons.org','https://www.divisionivmasons.org','https://scottxian.github.io']);
const categories=new Set(['meeting','location','directory']);
const statuses=new Set(['pending','reviewing','completed','rejected']);
const isUuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function reply(body:unknown,status:number,origin:string){
  const headers:Record<string,string>={
    'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin',
    'x-content-type-options':'nosniff'
  };
  if(allowed.has(origin))headers['access-control-allow-origin']=origin;
  return new Response(JSON.stringify(body),{status,headers});
}
function bad(message:string,status:number,origin:string){return reply({error:message},status,origin)}
async function requireAdmin(req:Request){
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!bearer)throw Error('Administrator sign-in required');
  const {data,error}=await db.auth.getUser(bearer);
  if(error||!data.user?.email)throw Error('Administrator session expired');
  const {data:staff,error:staffError}=await db.from('staff_accounts')
    .select('id,email,role,enabled,removed_at').eq('email',data.user.email.toLowerCase())
    .eq('enabled',true).is('removed_at',null).maybeSingle();
  if(staffError||!staff||staff.role!=='admin')throw Error('Administrator access required');
  const {data:factors,error:factorError}=await db.auth.admin.mfa.listFactors({userId:data.user.id});
  if(factorError||!Array.isArray(factors?.factors))throw Error('Unable to verify administrator MFA');
  if(!factors.factors.some((f:any)=>f?.status==='verified'&&['totp','phone'].includes(f.factor_type)))
    throw Error('An enrolled authenticator is required');
  let payload:any={};
  try{
    const part=bearer.split('.')[1]||'';
    payload=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
  }catch{}
  if(payload.aal!=='aal2'||payload.sub!==data.user.id)throw Error('Complete MFA verification to continue');
  return staff;
}
async function publicSubmission(req:Request,origin:string){
  const length=Number(req.headers.get('content-length')||0);
  if(length>6000)return bad('Request too large',413,origin);
  let body:any;
  try{body=await req.json()}catch{return bad('Invalid form',400,origin)}
  if(!body||typeof body!=='object'||Array.isArray(body))return bad('Invalid form',400,origin);
  if(typeof body.website==='string'&&body.website.trim())return reply({ok:true},200,origin); // honeypot
  const lodge=typeof body.lodge==='string'?body.lodge.trim().replace(/\s+/g,' ').slice(0,161):'';
  const details=typeof body.details==='string'?body.details.trim().slice(0,1601):'';
  const category=typeof body.category==='string'?body.category:'';
  const contact=typeof body.reply==='string'?body.reply.trim().slice(0,255):'';
  if(lodge.length<2||lodge.length>160||details.length<15||details.length>1600||!categories.has(category))
    return bad('This form accepts lodge directory corrections only. Event changes and cancellations must use the official calendar request form at divisionivmasons.org/events/',400,origin);
  if(contact.length>254||/[\r\n<>]/.test(contact))return bad('Invalid reply contact',400,origin);
  const ip=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,100);
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const data=new TextEncoder().encode(secret+':corrections:'+ip+':'+(contact||'anonymous'));
  const hash=await crypto.subtle.digest('SHA-256',data);
  const fingerprint=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const recent=new Date(Date.now()-30*60*1000).toISOString();
  const {count,error:limitError}=await db.from('division_correction_requests')
    .select('id',{count:'exact',head:true}).eq('source_fingerprint',fingerprint).gte('created_at',recent);
  if(limitError)throw limitError;
  if((count||0)>=3)return bad('Too many correction requests. Please try again later.',429,origin);
  const {error}=await db.from('division_correction_requests').insert({
    lodge_name:lodge,category,details,reporter_contact:contact||null,status:'pending',source_fingerprint:fingerprint
  });
  if(error)throw error;
  return reply({ok:true,notice:'Your correction was submitted for administrator review.'},201,origin);
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const headers={
    'access-control-allow-origin':allowed.has(origin)?origin:'null',
    'access-control-allow-methods':'POST,GET,OPTIONS',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-max-age':'300','vary':'Origin'
  };
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(origin&&!allowed.has(origin))return bad('Origin is not permitted',403,origin);
  const action=new URL(req.url).searchParams.get('action')||'submit';
  try{
    if(action==='submit'){
      if(req.method!=='POST')return bad('POST required',405,origin);
      return await publicSubmission(req,origin);
    }
    const staff=await requireAdmin(req); // all other actions private, with MFA
    if(action==='list'){
      if(req.method!=='GET')return bad('GET required',405,origin);
      const status=new URL(req.url).searchParams.get('status')||'open';
      if(!new Set(['open','all',...statuses]).has(status))return bad('Unknown status',400,origin);
      let query=db.from('division_correction_requests')
        .select('id,lodge_name,category,details,reporter_contact,status,review_notes,created_at,reviewed_at,handled_by')
        .order('created_at',{ascending:false}).limit(200);
      if(status==='open')query=query.in('status',['pending','reviewing']);
      else if(status!=='all')query=query.eq('status',status);
      const {data,error}=await query;if(error)throw error;
      return reply({items:data||[]},200,origin);
    }
    if(action==='history'){
      if(req.method!=='GET')return bad('GET required',405,origin);
      const id=new URL(req.url).searchParams.get('id')||'';
      if(!isUuid(id))return bad('Invalid correction ID',400,origin);
      const {data,error}=await db.from('division_correction_history')
        .select('id,action,previous_status,new_status,notes,actor_staff_id,created_at')
        .eq('correction_id',id).order('created_at',{ascending:false}).limit(80);
      if(error)throw error;
      return reply({items:data||[]},200,origin);
    }
    if(action==='update'){
      if(req.method!=='POST')return bad('POST required',405,origin);
      const body=await req.json();
      const id=typeof body.id==='string'?body.id:'';
      const status=typeof body.status==='string'?body.status:'';
      const expected=typeof body.expected_status==='string'?body.expected_status:'';
      const note=typeof body.note==='string'?body.note.trim():'';
      if(!isUuid(id)||!statuses.has(status)||!statuses.has(expected)||status===expected||note.length>1200)
        return bad('Invalid correction update',400,origin);
      if(status==='completed'&&note.length<8)return bad('Describe the verified lodge directory change before marking completed',400,origin);
      if(status==='rejected'&&note.length<8)return bad('Provide a reason for rejection',400,origin);
      const {data:updated,error}=await db.from('division_correction_requests')
        .update({status,review_notes:note,reviewed_at:new Date().toISOString(),handled_by:staff.id})
        .eq('id',id).eq('status',expected)
        .select('id,status').maybeSingle();
      if(error)throw error;
      if(!updated)return bad('Request changed. Refresh before saving.',409,origin);
      const {error:historyError}=await db.from('division_correction_history').insert({
        correction_id:id,action:'status_changed',previous_status:expected,new_status:status,
        notes:note,actor_staff_id:staff.id
      });
      if(historyError){console.error('Correction change log failed',historyError);return reply({ok:true,warning:'Status saved, but history log failed. Contact an administrator.'},200,origin)}
      return reply({ok:true,notice:'Correction status saved and recorded.'},200,origin);
    }
    return bad('Unknown action',404,origin);
  }catch(e){
    console.error('Division IV correction request error',e);
    const msg=e instanceof Error?e.message:'Unexpected server error';
    if(/administrator|session|mfa|authenticator|sign-in/i.test(msg))
      return bad(msg,403,origin);
    return bad('Unable to process correction request. Please try again.',500,origin);
  }
});