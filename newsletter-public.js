/* Public newsletter signup; no subscriber addresses are exposed by this client. */
(()=>{
 'use strict';
 const form=document.getElementById('division-newsletter-form');
 const params=new URL(location.href).searchParams;
 const token=params.get('newsletter_confirm');
 if(!form&&!token)return;
 const base='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-newsletter';
 const status=document.getElementById('division-newsletter-status');
 if(!status)return;
 const button=form?.querySelector('button[type="submit"]');
 const note=value=>{status.textContent=value;};
 async function request(action,body){
  const response=await fetch(base+'?action='+action,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Unable to complete the newsletter request');
  return data;
 }
 form?.addEventListener('submit',async event=>{
  event.preventDefault();
  button.disabled=true;note('Sending confirmation request…');
  try{
   const result=await request('subscribe',{email:form.elements.email.value,website:form.elements.website.value});
   note(result.message||'Check your email for confirmation.');
   form.reset();
  }catch(error){note(error.message||'Signup is temporarily unavailable.');}
  finally{button.disabled=false;}
 });
 if(token){
  status.hidden=false;
  params.delete('newsletter_confirm');
  const destination=new URL(location.href);
  destination.search=params.toString();
  history.replaceState(null,'',destination.pathname+destination.search+destination.hash);
  note('Confirming your newsletter subscription…');
  if(!form)status.scrollIntoView({block:'center'});
  request('confirm',{token}).then(result=>note(result.message||'Subscription confirmed.'))
    .catch(error=>note(error.message||'The confirmation link could not be verified.'));
 }
 if(form)request('status').then(result=>{
  if(result.signup_enabled){
   form.hidden=false;
   if(!token)note('Monthly event digest and weekly updates when the calendar changes. Free to subscribe.');
  }else{
   form.hidden=true;
   if(!token)note('Newsletter signup is being prepared. Check back soon.');
  }
 }).catch(()=>{form.hidden=true;if(!token)note('Newsletter signup is temporarily unavailable.');});
})();