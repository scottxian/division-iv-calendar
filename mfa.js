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
 await window.divisionSecurityInit?.(window.divisionCurrentStaff);
}
async function showMfa(staff){
 const seq=++requestSeq;
 window.divisionCurrentStaff=staff||null;
 if(!staff||staff.role!=='admin'){if(panel)panel.remove();panel=null;pending=null;return}
 const host=securePanel();if(!host)return;
 host.replaceChildren(make('h3','', 'Administrator account security'),make('p','help','Checking your authenticator settings…'));
 try{
  const response=await authRequest('user');
  if(seq!==requestSeq)return;
  const all=factorsFrom(response),verified=all.filter(x=>x?.factor_type==='totp'&&x.status==='verified');
  const sess=(await db.auth.getSession()).data.session;
  const status=accessLevel(sess?.access_token||'');
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
    const data=await authRequest('factors',{factor_type:'totp',friendly_name:'Division IV Inspector Desk'});
    if(!data?.id||!data?.totp?.secret)throw Error('Authenticator enrollment could not be started.');
    pending=data.id;
    btn.remove();
    const instructions=make('p','help','Scan this QR code in an authenticator app, or enter the setup secret manually. Then enter the six-digit code to finish.');
    host.append(instructions);
    if(data.totp.qr_code){
      const img=make('img','');img.alt='Authenticator enrollment QR code';
      img.style.width='190px';img.style.maxWidth='100%';
      const qr=data.totp.qr_code;
      img.src=qr.startsWith('<svg')?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr):qr;
      host.append(img);
    }
    const secret=make('p','help','Manual setup secret: '+data.totp.secret);
    secret.style.overflowWrap='anywhere';host.append(secret);
    promptCode(host,'First six-digit code',async code=>completeChallenge(data.id,code));
   }catch(err){btn.disabled=false;host.append(make('p','help',err.message||'Unable to enroll authenticator.'))}
  });
 }catch(err){
  if(seq!==requestSeq)return;
  host.replaceChildren(make('h3','', 'Administrator account security'),make('p','help',err.message||'Authenticator settings unavailable. Refresh the page.'));
 }
}
window.divisionSecurityInit=showMfa;
})();
