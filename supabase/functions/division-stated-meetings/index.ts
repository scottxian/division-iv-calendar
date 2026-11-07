/* Public, read-only subset of the Division IV Lodge Directory.
   Never exposes private lodge-admin fields or uses user-provided SQL. */
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 {auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set([
 'https://divisionivmasons.org','https://www.divisionivmasons.org',
 'https://scottxian.github.io','http://localhost:5173','http://127.0.0.1:5173'
]);
function response(payload:unknown,status=200,origin=''){
 return new Response(JSON.stringify(payload),{
  status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'public, max-age=300',
   'vary':'Origin',...(origins.has(origin)?{'access-control-allow-origin':origin}:{})}
 });
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 if(request.method==='OPTIONS')return new Response(null,{
  status:204,headers:{'access-control-allow-methods':'GET,OPTIONS',
   'access-control-allow-headers':'content-type,apikey',
   'vary':'Origin',...(origins.has(origin)?{'access-control-allow-origin':origin}:{})}
 });
 if(origin&&!origins.has(origin))return response({error:'Origin not allowed'},403);
 if(request.method!=='GET')return response({error:'Only GET is supported'},405,origin);
 try{
  const {data,error}=await db.from('lodges')
   .select('lodge_name,lodge_number,district,meeting_day,meeting_time,meeting_notes,address_line1,city,state')
   .eq('active',true).order('lodge_name',{ascending:true}).limit(100);
  if(error)throw Error('Lodge information is temporarily unavailable');
  const lodges=(data||[]).map(lodge=>({
   name:String(lodge.lodge_name||'').trim(),
   number:String(lodge.lodge_number||'').trim(),
   district:String(lodge.district||'').trim(),
   day:String(lodge.meeting_day||'').trim(),
   time:String(lodge.meeting_time||'').trim(),
   notes:String(lodge.meeting_notes||'').trim(),
   address:[lodge.address_line1,lodge.city,lodge.state].map(x=>String(x||'').trim()).filter(Boolean).join(', ')
  }));
  return response({lodges},200,origin);
 }catch(error){
  console.error('Public stated meetings directory:',error instanceof Error?error.message:'Unknown error');
  return response({error:'Stated meeting schedules are temporarily unavailable'},503,origin);
 }
});
