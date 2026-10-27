/* Division IV public directory correction form. Queues reports without requiring email software. */
(()=>{
 const form=document.getElementById('lodge-correction-form');
 if(!form)return;
 const message=document.getElementById('lodge-correction-status');
 const button=form.querySelector('button[type="submit"]');
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-corrections?action=submit';
 const categories={'Meeting schedule':'meeting','Address or location':'location','Directory details':'directory','Other correction':'other'};
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.reportValidity())return;
  const data=new FormData(form);
  const body={
   lodge:String(data.get('lodge')||'').trim(),
   category:categories[String(data.get('type')||'')]||'',
   details:String(data.get('details')||'').trim(),
   reply:String(data.get('reply')||'').trim(),
   website:String(data.get('website')||'')
  };
  if(!body.category||body.details.length<15){
   message.textContent='Please select a correction type and describe the change.';
   return;
  }
  button.disabled=true;
  message.textContent='Submitting your correction for review…';
  try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),15000);
   let response;
   try{response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});}
   finally{clearTimeout(timeout);}
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||'Unable to submit the correction.');
   form.reset();
   message.textContent='Correction received. It is now in the private Division IV Administrator review queue. Thank you.';
  }catch(err){
   message.textContent=err?.message||'Submission failed. Please try again.';
  }finally{button.disabled=false;}
 });
})();