/* Newsletter control room: two independent newsletter schedules.
   Provider/billing setup lives only in Administration Settings. */
(()=>{
 'use strict';
 const root=document.getElementById('tab-newsletter');
 if(!root)return;
 const $=id=>document.getElementById(id);
 const base='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-newsletter';
 let current=null;
 const say=(id,msg,bad=false)=>{
  const el=$(id);if(!el)return;
  el.textContent=msg;
  el.classList.toggle('newsletter-error',bad);
 };
 async function request(action,method='GET',body,params=''){
  const session=(await db.auth.getSession()).data.session;
  if(!session?.access_token)throw Error('Sign in to the Inspector Desk.');
  const response=await fetch(base+'?action='+encodeURIComponent(action)+params,{
   method,headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Newsletter service is unavailable');
  return data;
 }
 function optionsForTime(select){
  select.replaceChildren();
  for(let hour=0;hour<24;hour++){
   const h=hour%12||12;
   select.add(new Option(h+':00 '+(hour<12?'AM':'PM'),String(hour)));
  }
 }
 optionsForTime($('newsletter-monthly-hour'));
 optionsForTime($('newsletter-weekly-hour'));
 const configured=s=>!!(s.free_plan_confirmed&&s.resend_segment_id);
 const isEnabled=s=>!!(s.sending_enabled&&configured(s));
 function enableActions(s){
  $('newsletter-send-monthly').disabled=!(isEnabled(s)&&s.monthly_enabled);
  $('newsletter-send-weekly').disabled=!(isEnabled(s)&&s.weekly_enabled);
 }
 async function load(){
  try{
   say('newsletter-admin-message','Loading newsletter settings…');
   const data=await request('admin-status'),s=data.settings;
   current=s;
   $('newsletter-monthly-enabled').checked=!!s.monthly_enabled;
   $('newsletter-weekly-enabled').checked=!!s.weekly_enabled;
   $('newsletter-monthly-day').value=String(s.monthly_day);
   $('newsletter-weekly-day').value=String(s.weekly_day);
   $('newsletter-monthly-hour').value=String(s.monthly_send_hour??s.send_hour??8);
   $('newsletter-weekly-hour').value=String(s.weekly_send_hour??s.send_hour??8);
   $('newsletter-lookahead').value=String(s.lookahead_days);
   $('newsletter-signup').checked=!!s.signup_enabled;
   $('newsletter-segment').value=s.resend_segment_id||'';
   $('newsletter-cost').checked=!!s.free_plan_confirmed;
   $('newsletter-overview').textContent=(s.sending_enabled?'Automatic delivery enabled':'Automatic delivery paused')+
    ' · '+(configured(s)?'Email delivery configured':'Finish one-time setup in Administration Settings');
   say('newsletter-admin-stats',(data.subscribers||0)+' verified subscribers · signup '+(s.signup_enabled?'open':'closed')+
    ' · contact safety limit '+s.contact_cap);
   const host=$('newsletter-runs');host.replaceChildren();
   const items=data.runs||[];
   if(!items.length)host.textContent='No newsletters have been sent.';
   for(const run of items){
    const node=document.createElement('p');
    node.className='newsletter-run';
    node.textContent=[new Date(run.created_at).toLocaleString('en-US',{timeZone:'America/Los_Angeles'}),run.kind,run.state,
     run.content_summary?.events+' events',run.content_summary?.subscribers+' subscribers',run.error_message||''].filter(Boolean).join(' · ');
    host.append(node);
   }
   enableActions(s);
   say('newsletter-admin-message','Settings loaded. Monthly and weekly newsletters can be configured separately.');
   return s;
  }catch(e){
   say('newsletter-admin-message','Could not load newsletter settings: '+(e.message||e),true);
   say('newsletter-overview','Settings unavailable');
   for(const id of ['newsletter-send-monthly','newsletter-send-weekly'])$(id).disabled=true;
   throw e;
  }
 }
 async function save(buttonId,payload,messageId){
  const btn=$(buttonId);
  btn.disabled=true;
  say(messageId,'Saving…');
  try{
   await request('save','POST',payload);
   await load();
   say(messageId,'Saved.');
  }catch(error){say(messageId,'Not saved: '+error.message,true);}
  finally{btn.disabled=false;}
 }
 $('newsletter-save').onclick=()=>save('newsletter-save',{
  monthly_enabled:$('newsletter-monthly-enabled').checked,
  weekly_enabled:$('newsletter-weekly-enabled').checked,
  sending_enabled:$('newsletter-monthly-enabled').checked||$('newsletter-weekly-enabled').checked,
  monthly_day:Number($('newsletter-monthly-day').value),
  weekly_day:Number($('newsletter-weekly-day').value),
  monthly_send_hour:Number($('newsletter-monthly-hour').value),
  weekly_send_hour:Number($('newsletter-weekly-hour').value),
  lookahead_days:Number($('newsletter-lookahead').value)
 },'newsletter-admin-message');
 $('newsletter-save-signup').onclick=()=>save('newsletter-save-signup',
  {signup_enabled:$('newsletter-signup').checked},'newsletter-signup-message');
 $('newsletter-save-setup').onclick=()=>save('newsletter-save-setup',{
  resend_segment_id:$('newsletter-segment').value.trim()||null,
  free_plan_confirmed:$('newsletter-cost').checked,
  ...(!$('newsletter-cost').checked?{sending_enabled:false,signup_enabled:false}: {})
 },'newsletter-setup-message');
 async function preview(kind){
  const label='newsletter-'+kind+'-preview-title',frame=$('newsletter-'+kind+'-preview');
  const details=$('newsletter-'+kind+'-preview-details');
  try{
   const data=await request('preview','GET',undefined,'&kind='+encodeURIComponent(kind));
   frame.srcdoc=data.html;
   say(label,data.subject+' · '+data.included_events+' events · preview only; no emails sent');
   details.hidden=false;
   details.open=true;
  }catch(error){
   details.hidden=false;
   details.open=true;
   say(label,'Preview error: '+error.message,true);
  }
 }
 async function sendNow(kind){
  if(!current||!isEnabled(current)||!current[kind+'_enabled'])return;
  if(!window.confirm('Send this '+kind+' newsletter NOW to all verified subscribers? This sends real emails and cannot be undone.'))return;
  const id='newsletter-send-'+kind,btn=$(id);
  btn.disabled=true;say('newsletter-admin-message','Submitting '+kind+' newsletter…');
  try{
   const answer=await request('send-now','POST',{kind});
   await load();
   say('newsletter-admin-message',answer.status==='skipped'?'No published changes; nothing sent.':'Provider result: '+answer.status+'. View delivery history.');
  }catch(error){say('newsletter-admin-message','Send not completed: '+error.message,true);}
  finally{btn.disabled=!(current&&isEnabled(current)&&current[kind+'_enabled']);}
 }
 $('newsletter-preview-monthly').onclick=()=>preview('monthly');
 $('newsletter-preview-weekly').onclick=()=>preview('weekly');
 $('newsletter-send-monthly').onclick=()=>sendNow('monthly');
 $('newsletter-send-weekly').onclick=()=>sendNow('weekly');
 window.loadNewsletter=async()=>{try{await load();}catch{ /* The error is displayed in-panel. */ }};
})();
