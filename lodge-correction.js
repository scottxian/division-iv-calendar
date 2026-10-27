/* The correction form does not store visitor information; it prepares a message in their email app. */
(()=>{
 const form=document.getElementById('lodge-correction-form');
 if(!form)return;
 const message=document.getElementById('lodge-correction-status');
 form.addEventListener('submit',e=>{
  e.preventDefault();
  if(!form.reportValidity())return;
  const data=new FormData(form);
  const lodge=String(data.get('lodge')||'').trim().slice(0,130);
  const topic=String(data.get('type')||'').trim().slice(0,80);
  const details=String(data.get('details')||'').trim().slice(0,750);
  const reply=String(data.get('reply')||'').trim().slice(0,140);
  if(!lodge||!topic||details.length<15){message.textContent='Please provide a lodge, correction type, and a brief explanation.';return;}
  const subject='Division IV lodge directory correction: '+lodge;
  const body=['Lodge: '+lodge,'Correction type: '+topic,'','Requested correction:',details,'','Reply contact: '+(reply||'Not provided'),'','Submitted from divisionivmasons.org/lodges/'].join('\n');
  message.textContent='Your email application should open now. Please review the prepared correction and press Send.';
  const url='mailto:DivisionIVagl@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  window.location.href=url;
 });
})();