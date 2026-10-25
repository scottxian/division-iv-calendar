/* Division IV administrator authenticator setup and step-up challenge.
   Supabase Auth performs factor verification; no TOTP secrets are stored in GitHub or the app database. */
(()=>{
'use strict';
let panel=null,requestSeq=0,pending=null;
const make=(tag,cls,label)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(label!==undefined)n.textContent=label;return n};
const say=(target,message,bad=false)=>{target.textContent=message;target.style.color=bad?'#a32727':'';};
function accessLevel(token){
 try{const part=token.split('.')[1];const txt=atob(part.replace(/-/g,'+').replace(/_/g,'/'));return JSON.parse(txt).aal||'aal1'}catch{return 'aal1'}
}
async function authRequest(path,body){
 const s=(await db.auth.getSession()).data.session;
 if(!s?.access_token)throw Error('Sign in to manage authenticator security.');
 return authFetch(path,{method:body===undefined?'GET':'POST',
  headers:{authorization:'Bearer '+s.access_token},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function factorsFrom(payload){
 // GoTrue's /auth/v1/user response may omit 'factors' until the user enrolls.
 // Verify that we received an authenticated user object before accepting an empty list.
 const user=payload?.user&&typeof payload.user==='object'?payload.user:payload;
 if(!user||typeof user!=='object'||typeof user.id!=='string'||!user.id){
  throw Error('Unable to verify the signed-in account. Please sign in again.');
 }
 if(user.factors==null)return [];
 if(Array.isArray(user.factors))return user.factors;
 throw Error('The authenticator settings response was unexpected. Please refresh.');
}
function qrImageSource(value){
 const raw=String(value||'').trim();
 // The REST API returns SVG markup (sometimes prefixed with an XML declaration).
 // Supabase's JS client, which this site does not use, normally turns it into a data URL.
 const svg=raw.startsWith('data:image/svg+xml')?raw.slice(raw.indexOf(',')+1):raw;
 const normalized=svg.trimStart().replace(/^\uFEFF/,'');
 if(!/^<(?:\?xml\b|svg\b)/i.test(normalized))throw Error('QR code format unavailable; use the manual setup option.');
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(normalized);
}
async function discardFactor(factorId){
 const s=(await db.auth.getSession()).data.session;
 if(!s?.access_token)throw Error('Sign in again to cancel setup.');
 await authFetch('factors/'+encodeURIComponent(factorId),{method:'DELETE',
  headers:{authorization:'Bearer '+s.access_token}});
}
function securePanel(){
 const host=document.getElementById('admin-view');
 if(!host)return null;
 if(!panel){
  panel=make('section','panel');
  panel.id='admin-mfa-security';
  panel.setAttribute('aria-label','Administrator account security');
  panel.style.margin='16px 0';
  const heading=make('h3','', 'Administrator account security');
  panel.append(heading);
  const header=host.querySelector('.admin-head');
  if(header)header.insertAdjacentElement('afterend',panel);else host.prepend(panel);
 }
 return panel;
}
function promptCode(host,label,onSubmit){
 const form=make('form','form-actions');
 form.style.display='flex';form.style.gap='8px';form.style.flexWrap='wrap';form.style.alignItems='end';
 const wrap=make('label','');wrap.textContent=label+' ';
 const code=make('input','');code.type='text';code.inputMode='numeric';code.autoComplete='one-time-code';
 code.pattern='[0-9]{6}';code.maxLength=6;code.required=true;code.placeholder='6-digit code';
 wrap.append(code);
 const button=make('button','primary','Verify code');button.type='submit';
 const status=make('p','help');status.setAttribute('role','status');
 form.append(wrap,button,status);
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const v=code.value.trim();
  if(!/^[0-9]{6}$/.test(v)){say(status,'Enter all six digits.',true);return}
  button.disabled=true;say(status,'Verifying…');
  try{await onSubmit(v);code.value='';say(status,'Verified.');}
  catch(err){say(status,err.message||'Verification failed',true)}
  finally{button.disabled=false}
 });
 host.append(form);
 return status;
}
async function completeChallenge(factorId,code){
 const challenge=await authRequest('factors/'+encodeURIComponent(factorId)+'/challenge',{});
 if(!challenge?.id)throw Error('Unable to create authenticator challenge.');
 const answer=await authRequest('factors/'+encodeURIComponent(factorId)+'/verify',{challenge_id:challenge.id,code});
 if(!answer?.access_token)throw Error('Verification did not return an updated session.');
 const previous=(await db.auth.getSession()).data.session||{};
 setSession({
  access_token:answer.access_token,refresh_token:answer.refresh_token||previous.refresh_token||'',
  expires_at:Math.floor(Date.now()/1000)+(Number(answer.expires_in)||3600),
  user:answer.user||previous.user
 });
 pending=null;
 await window.divisionRefreshIdentity?.();
}
async function showMfa(staff,serverStatus){
 const seq=++requestSeq;
 window.divisionCurrentStaff=staff||null;
 if(!staff||staff.role!=='admin'){if(panel)panel.remove();panel=null;pending=null;return}
 const host=securePanel();if(!host)return;
 host.replaceChildren(make('h3','', 'Administrator account security'),make('p','help','Checking your authenticator settings…'));
 try{
  const response=await authRequest('user');
  if(seq!==requestSeq)return;
  const all=factorsFrom(response),verified=all.filter(x=>x?.factor_type==='totp'&&x.status==='verified');
  // The server enrollment lookup is authoritative even when Auth /user omits factors.
  if(serverStatus?.required&&serverStatus?.factorId&&!verified.some(x=>x.id===serverStatus.factorId))
    verified.unshift({id:serverStatus.factorId,factor_type:'totp',status:'verified'});
  const unfinished=all.filter(x=>x?.factor_type==='totp'&&x.status==='unverified'&&typeof x.id==='string');
  const sess=(await db.auth.getSession()).data.session;
  const status=serverStatus?.required?(serverStatus.verified?'aal2':'aal1'):accessLevel(sess?.access_token||'');
  host.replaceChildren(make('h3','', 'Administrator account security'));
  if(verified.length){
   if(status==='aal2'){
    host.append(make('p','help','Two-step verification is active for this sign-in.'));
   }else{
    host.append(make('p','help','Your authenticator is enrolled. Verify the current sign-in with your six-digit authenticator code.'));
    promptCode(host,'Authenticator code',async code=>completeChallenge(verified[0].id,code));
   }
   return;
  }
  host.append(make('p','help','Protect administrative access with an authenticator app. Enrollment is not required until the migration access tests are complete.'));
  const btn=make('button','secondary','Set up authenticator');
  btn.type='button';host.append(btn);
  btn.addEventListener('click',async()=>{
   btn.disabled=true;
   try{
    // A fresh setup must not reuse earlier unverified seeds. Cancel old attempts
    // with the current user's authorization before generating new credentials.
    for(const old of unfinished)await discardFactor(old.id);
    const data=await authRequest('factors',{factor_type:'totp',friendly_name:'Division IV Inspector Desk'});
    if(!data?.id||!data?.totp?.secret)throw Error('Authenticator enrollment could not be started.');
    pending=data.id;
    btn.remove();
    const instructions=make('p','help','Scan the QR code using your authenticator app. If you cannot scan it, open the manual setup option. Enter the six-digit code to finish.');
    host.append(instructions);
    const img=make('img','');
    img.alt='Authenticator setup QR code';img.width=200;img.height=200;
    img.style.width='200px';img.style.height='200px';img.style.maxWidth='100%';img.style.display='block';
    const qrStatus=make('p','help');qrStatus.setAttribute('role','status');
    img.addEventListener('error',()=>{
      img.remove();
      say(qrStatus,'QR image could not be displayed. Use the manual setup option, or cancel and restart.',true);
    });
    host.append(img,qrStatus);
    try{
      img.src=qrImageSource(data.totp.qr_code);
    }catch(err){
      img.remove();
      say(qrStatus,err.message||'QR image unavailable; use the manual setup option.',true);
    }
    const manual=make('details','');
    const summary=make('summary','', 'Use manual setup key instead');
    const key=make('input','');
    key.type='password';key.readOnly=true;key.value=data.totp.secret;
    key.autocomplete='off';key.setAttribute('aria-label','Manual authenticator setup key');
    key.style.maxWidth='100%';key.style.width='280px';
    const reveal=make('button','secondary','Show key');
    reveal.type='button';reveal.addEventListener('click',()=>{
      key.type=key.type==='password'?'text':'password';
      reveal.textContent=key.type==='password'?'Show key':'Hide key';
    });
    const privateNote=make('p','help','Keep this setup key private. Do not screenshot or share it.');
    manual.append(summary,privateNote,key,reveal);
    host.append(manual);
    promptCode(host,'First six-digit code',async code=>completeChallenge(data.id,code));
    const cancel=make('button','secondary','Cancel setup and discard this key');
    cancel.type='button';cancel.style.marginTop='12px';
    const cancelStatus=make('p','help');cancelStatus.setAttribute('role','status');
    cancel.addEventListener('click',async()=>{
      cancel.disabled=true;say(cancelStatus,'Discarding the unfinished authenticator setup…');
      try{
        await discardFactor(data.id);
        pending=null;
        key.value='';
        await window.divisionSecurityInit?.(window.divisionCurrentStaff);
      }catch(err){
        cancel.disabled=false;say(cancelStatus,err.message||'Unable to discard factor. Please sign in again.',true);
      }
    });
    host.append(cancel,cancelStatus);
   }catch(err){btn.disabled=false;host.append(make('p','help',err.message||'Unable to enroll authenticator.'))}
  });
 }catch(err){
  if(seq!==requestSeq)return;
  host.replaceChildren(make('h3','', 'Administrator account security'),make('p','help',err.message||'Authenticator settings unavailable. Refresh the page.'));
 }
}
window.divisionSecurityInit=showMfa;
})();
