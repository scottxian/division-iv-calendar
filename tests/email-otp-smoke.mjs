#!/usr/bin/env node
/** Email OTP auth regression test. Uses mocked Supabase REST responses; never sends real email. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app/app.js','utf8');
const prefix=source.split('const $=id=>document.getElementById(id);')[0];
assert.ok(prefix.includes("async verifyOtp({email,token})"),'Missing REST OTP verification');
const memory=new Map(),calls=[];
const ctx={
 localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
 location:{origin:'https://divisionivmasons.org',pathname:'/inspectors/',hash:'',search:''},
 URLSearchParams,Date,Math,JSON,Set,console,
 fetch:async (url,options={})=>{
  calls.push({url,options});
  if(url.includes('/auth/v1/otp'))return {ok:true,json:async()=>({})};
  if(url.includes('/auth/v1/verify')){
   const body=JSON.parse(options.body);
   if(body.token!=='12345678')return {ok:false,json:async()=>({message:'Token invalid or expired'})};
   return {ok:true,json:async()=>({
    access_token:'fake-jwt',refresh_token:'fake-refresh',expires_in:3600,
    user:{id:'11111111-1111-4111-8111-111111111111',email:'inspector@example.org'}
   })};
  }
  if(url.includes('/auth/v1/logout'))return {ok:true,json:async()=>({})};
  throw Error('Unexpected network call: '+url);
 }
};
vm.createContext(ctx);vm.runInContext(prefix,ctx);
const send=await vm.runInContext("db.auth.signInWithOtp({email:'inspector@example.org',options:{emailRedirectTo:'https://divisionivmasons.org/inspectors/'}})",ctx);
assert.equal(send.error,null,'Failed to request email OTP');
assert.equal(JSON.parse(calls[0].options.body).email,'inspector@example.org');
assert.match(calls[0].url,/\/auth\/v1\/otp\?/);
const bad=await vm.runInContext("db.auth.verifyOtp({email:'inspector@example.org',token:'00000000'})",ctx);
assert.match(bad.error.message,/invalid/i,'Invalid code did not fail');
assert.equal(memory.has('division-iv-calendar-session-v1'),false,'Invalid code incorrectly signed in user');
const good=await vm.runInContext("db.auth.verifyOtp({email:'inspector@example.org',token:'12345678'})",ctx);
assert.equal(good.error,null,'Valid email code was rejected');
assert.equal(JSON.parse(calls.at(-1).options.body).type,'email','Unexpected OTP verification type');
assert.equal(good.data.session.user.email,'inspector@example.org');
assert.ok(memory.has('division-iv-calendar-session-v1'),'Code sign-in did not persist the session');
await vm.runInContext('db.auth.signOut()',ctx);
assert.equal(memory.has('division-iv-calendar-session-v1'),false,'Sign out did not clear OTP session');
for(const file of ['inspectors/index.html','events/index.html']){
 const html=fs.readFileSync(file,'utf8');
 for(const id of ['signin-heading','signin-intro','signin-form','signin-email','signin-code-form',
  'signin-code','signin-resend-code','signin-change-email','signin-help']){
  assert.ok(html.includes('id="'+id+'"'),file+': missing '+id);
 }
 assert.ok(html.includes('app.js?v=61'),file+': stale auth app version');
 assert.ok(html.includes('pattern="[0-9]{8}" maxlength="8"'),file+': email code must accept eight digits');
 assert.ok(!html.includes('six-digit code'),file+': stale email code instructions');
 assert.ok(!html.includes('Email Sign-In Link'),file+': legacy email-link button remains');
}
assert.ok(source.includes('/^[0-9]{8}$/.test(token)'),'Email OTP must validate eight digits');
assert.ok(source.includes("state.loginPurpose='event-contact'"),'Public event verification flow missing');
assert.ok(source.includes("$('lookup-button').click()"),'Verified event contact cannot continue to event');
assert.ok(source.includes("show('admin'); // Existing server-enforced MFA"),'Staff auth flow bypasses MFA gate');
const mfa=fs.readFileSync('app/mfa.js','utf8');
assert.ok(mfa.includes("status==='aal2'")&&source.includes("mfa-locked"),'Existing staff MFA enforcement missing');
const template=fs.readFileSync('docs/auth-email-otp-template.html','utf8');
assert.ok(template.includes('{{ .Token }}')&&!template.includes('{{ .ConfirmationURL }}'),'Template is not code-only');
console.log('Email OTP tests passed (request, verification, invalid code, session, signout, public/staff UI and template).');
