/* Admin-only newsletter configuration; the backend independently enforces admin + AAL2. */
(()=>{
 'use strict';
 const root=document.getElementById('tab-newsletter');
 if(!root)return;
 const $=id=>document.getElementById(id);
 const base='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-newsletter';
 let cached=null,loaded=false;
 const info=$('newsletter-admin-message');
 const note=(s,bad=false)=>{info.textContent=s;info.classList.toggle('newsletter-error',bad);};
 async function request(action,method='GET',body,extra=''){
  const session=(await db.auth.getSession()).data.session;
  if(!session?.access_token)throw Error('Sign in as an administrator');
  const response=await fetch(base+'?action='+action+extra,{method,headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Newsletter request failed');
  return data;
 }
 const stats=$('newsletter-admin-stats'),runs=$('newsletter-runs');
 const isActive=s=>!!(s.sending_enabled&&s.free_plan_confirmed&&s.resend_segment_id);
 async function load(){
  try{
   note('Loading newsletter settings…');
   const data=await request('admin-status');cached=data.settings;
   $('newsletter-segment').value=cached.resend_segment_id||'';
   $('newsletter-cost').checked=!!cached.free_plan_confirmed;
   $('newsletter-signup').checked=!!cached.signup_enabled;
   $('newsletter-send').checked=!!cached.sending_enabled;
   stats.textContent=(data.subscribers||0)+' active local subscribers · '+(data.resend_configured?'Resend sender configured':'Email provider not configured')+
    ' · '+(cached.sending_enabled?'Automatic sends enabled':'Automatic sends PAUSED')+
    ' · Monthly day 1, 8 AM Pacific; Monday updates only when changes exist; next '+cached.lookahead_days+' days';
   runs.replaceChildren();
   for(const item of data.runs||[]){
    const row=document.createElement('p');row.className='newsletter-run';
    row.textContent=[new Date(item.created_at).toLocaleString(),item.kind,item.state,item.content_summary?.events+' events',item.content_summary?.subscribers+' contacts',item.error_message||''].filter(Boolean).join(' · ');
    runs.append(row);
   }
   if(!(data.runs||[]).length)runs.textContent='No newsletters have been sent.';
   $('newsletter-send-now').disabled=!isActive(cached);
   loaded=true;note('Newsletter settings loaded.'); 
  }catch(error){loaded=false;note(error.message,true);}
 }
 $('newsletter-save').onclick=async()=>{
  const btn=$('newsletter-save');btn.disabled=true;note('Saving newsletter settings…');
  try{
   const data={
    resend_segment_id:$('newsletter-segment').value.trim()||null,
    free_plan_confirmed:$('newsletter-cost').checked,
    signup_enabled:$('newsletter-signup').checked,
    sending_enabled:$('newsletter-send').checked
   };
   // Declining free-plan confirmation automatically pauses both public signup and sending.
   if(!data.free_plan_confirmed){data.signup_enabled=false;data.sending_enabled=false;}
   await request('save','POST',data);await load();note('Newsletter settings saved.');
  }catch(error){note('Not saved: '+error.message,true);}
  finally{btn.disabled=false;}
 };
 async function preview(kind){
  try{
   note('Preparing '+kind+' newsletter preview…');
   const result=await request('preview','GET',null,'&kind='+encodeURIComponent(kind));
   const frame=$('newsletter-preview');
   frame.setAttribute('sandbox','');
   frame.srcdoc=result.html;
   $('newsletter-preview-title').textContent=result.subject+' · '+result.included_events+' events';
   note('Preview generated. No emails sent.');
  }catch(error){note(error.message,true);}
 }
 $('newsletter-preview-monthly').onclick=()=>preview('monthly');
 $('newsletter-preview-weekly').onclick=()=>preview('weekly');
 $('newsletter-send-now').onclick=async()=>{
  if(!cached?.sending_enabled||!window.confirm('Send a real newsletter to all subscribed members now? This cannot be undone.'))return;
  const btn=$('newsletter-send-now');btn.disabled=true;note('Submitting newsletter for delivery…');
  try{const result=await request('send-now','POST',{});await load();note('Provider result: '+(result.status||'submitted')+'. Check delivery status in Resend.');}
  catch(error){note(error.message,true);}
  finally{btn.disabled=!isActive(cached);}
 };
 window.loadNewsletter=load;
})();