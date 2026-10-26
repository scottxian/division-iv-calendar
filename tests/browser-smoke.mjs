/** Safe pre-cutover browser suite: local staging files + mocked auth, no production writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const base='http://127.0.0.1:5173';
const supabase='https://lxvceqshpjnjjlllbpaq.supabase.co';
const server=spawn('python3',['-m','http.server','5173','--bind','127.0.0.1'],{stdio:'ignore'});
await fs.mkdir('test-results',{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
const passed=[];
async function ready(){
 for(let i=0;i<40;i++){try{const r=await fetch(base+'/');if(r.ok)return}catch{}await sleep(250);}
 throw Error('Local staging preview server did not start');
}
async function browse(page,url,selector,name,{screenshot=true}={}){
 const result=await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(result.status(),200,name+': expected HTTP 200');
 await page.locator(selector).first().waitFor({state:'visible',timeout:18000});
 if(screenshot)await page.screenshot({path:'test-results/'+name+'.png',fullPage:true,animations:'disabled'});
 passed.push(name);
}
async function affiliation(page,label){
 const marker=page.locator('.division-affiliation, .app-affiliation');
 assert.ok(await marker.count(),label+': no organizational affiliation displayed');
 assert.match(await marker.first().innerText(),/Grand Lodge of California/);
 assert.equal(await marker.locator('a[href="https://freemason.org/"]').count()>0,true,label+': official site link missing');
 const footer=page.locator('footer a[href="https://freemason.org/"]');
 assert.ok(await footer.count(),label+': missing footer Grand Lodge link');
}
async function mobileOverflow(page,label){
 const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 assert.ok(widths.scroll<=widths.client+3,label+': horizontal page overflow '+JSON.stringify(widths));
}
const encode=a=>Buffer.from(JSON.stringify(a)).toString('base64url');
const user='00000000-0000-4000-8000-000000000001';
const access={
 aal1:'hdr.'+encode({aal:'aal1',sub:user})+'.sig',
 aal2:'hdr.'+encode({aal:'aal2',sub:user})+'.sig'
};
const cors={'content-type':'application/json','access-control-allow-origin':'*'};
const response=(route,body,status=200)=>route.fulfill({status,headers:cors,body:JSON.stringify(body)});
async function roleScenario(role){
 const context=await browser.newContext({viewport:{width:1230,height:850}});
 await context.addInitScript(token=>{
  localStorage.setItem('division-iv-calendar-session-v1',JSON.stringify({
   access_token:token,refresh_token:'simulation-only',expires_at:Math.floor(Date.now()/1000)+3600,
   user:{id:'00000000-0000-4000-8000-000000000001',email:'tester@example.invalid'}
  }));
 },access.aal1);
 const privateCalls=[];
 await context.route(supabase+'/**',async route=>{
  const request=route.request(),u=new URL(request.url()),action=u.searchParams.get('action')||'';
  const isAAL2=request.headers().authorization==='Bearer '+access.aal2;
  if(u.pathname==='/auth/v1/user')return response(route,{id:user,email:'tester@example.invalid',
   factors:[{id:'factor-test',factor_type:'totp',status:'verified'}]});
  if(u.pathname==='/auth/v1/factors/factor-test/challenge')return response(route,{id:'challenge-test'});
  if(u.pathname==='/auth/v1/factors/factor-test/verify')return response(route,{access_token:access.aal2,
   refresh_token:'simulation-only',expires_in:3600,user:{id:user,email:'tester@example.invalid'}});
  if(u.pathname==='/functions/v1/division-calendar'){
   if(action==='config')return response(route,{event_types:['Ceremony'],districts:['1'],hosts:[],suggestions:{},
    public_submissions_enabled:true,turnstile_site_key:''});
   if(action==='me')return response(route,{email:'tester@example.invalid',staff:{role,display_name:'Test Staff'},
    mfa:{required:true,verified:isAAL2,factorId:'factor-test'}});
   if(!isAAL2){privateCalls.push({action,denied:true});return response(route,{error:'Complete authenticator verification'},403);}
   privateCalls.push({action,denied:false});
   if(action==='dashboard')return response(route,{counts:{pending:0,corrections:0,failed:0,queued:0},
    requests:[],failures:[],recent:[]});
   return response(route,{items:[],events:[],requests:[],counts:{},status:'ok'});
  }
  if(u.pathname.startsWith('/functions/v1/'))return response(route,{items:[],settings:{},lodges:[]});
  return response(route,{message:'Mocked response'},404);
 });
 const page=await context.newPage();
 await browse(page,'/inspectors/','#admin-view:not(.hidden)',role+'-aal1');
 await page.locator('#admin-view.mfa-locked').waitFor({state:'attached'});
 await page.getByText('Account security').first().waitFor();
 await page.locator('input[placeholder="6-digit code"]').waitFor({state:'visible'});
 assert.equal(await page.locator('.tabs').isVisible(),false,role+': MFA bypass exposed private tabs');
 assert.equal(privateCalls.some(x=>!x.denied),false,role+': AAL1 triggered privileged operation');
 passed.push(role+'-aal1-denial');
 await page.locator('input[placeholder="6-digit code"]').fill('123456');
 await page.getByRole('button',{name:'Verify code'}).click();
 await page.locator('#admin-view:not(.mfa-locked)').waitFor({state:'attached',timeout:15000});
 await page.locator('.tabs').waitFor({state:'visible'});
 await page.getByText('Two-step verification is active for this sign-in.').waitFor({state:'visible'});
 const privileged=page.locator('.tabs [data-tab="staff"]');
 assert.equal(await privileged.isVisible(),role==='admin',role+': staff administration role mismatch');
 assert.ok(privateCalls.some(x=>x.action==='dashboard'&&!x.denied),role+': no verified dashboard call');
 passed.push(role+'-aal2-access-and-role');
 await context.close();
}
async function disabledScenario(){
 const context=await browser.newContext({viewport:{width:1180,height:780}});
 await context.addInitScript(token=>localStorage.setItem('division-iv-calendar-session-v1',JSON.stringify({
  access_token:token,refresh_token:'simulation-only',expires_at:Math.floor(Date.now()/1000)+3600
 })),access.aal2);
 await context.route(supabase+'/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/functions/v1/division-calendar'){
   if(u.searchParams.get('action')==='config')return response(route,{event_types:[],districts:[],hosts:[],suggestions:{},public_submissions_enabled:true});
   if(u.searchParams.get('action')==='me')return response(route,{email:'disabled@example.invalid',staff:null,mfa:null});
   return response(route,{error:'Inspector account required or disabled'},403);
  }
  return response(route,{message:'Not authorized'},401);
 });
 const page=await context.newPage();
 await browse(page,'/inspectors/','#signin-view:not(.hidden)','disabled-staff');
 assert.equal(await page.locator('#nav-admin').isVisible(),false,'Disabled user could open desk');
 passed.push('disabled-account-ui-denied');
 await context.close();
}
try{
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 for(const [url,selector,label] of [
  ['/','h1','home-desktop'],
  ['/calendar/','h1','calendar-desktop'],
  ['/lodges/','#lodge-search','lodges-desktop'],
  ['/events/','#public-view','events-desktop'],
  ['/inspectors/','#signin-view:not(.hidden)','inspectors-desktop']
 ]){
  await browse(desktop,url,selector,label);
  await affiliation(desktop,label);
  await mobileOverflow(desktop,label);
 }
 await desktop.goto(base+'/');
 assert.ok(await desktop.locator('a[href="/events/"]').count(),'Home event link missing');
 assert.ok(await desktop.locator('#about a[href="https://freemason.org/"]').count(),
  'About Division IV does not identify its Grand Lodge relationship');
 passed.push('home-organization-and-navigation');

 await desktop.goto(base+'/calendar/');
 assert.ok(await desktop.locator('iframe[src*="calendar.google.com"]').count(),'Google Calendar embed missing');
 passed.push('calendar-embed');

 await desktop.goto(base+'/lodges/');
 await desktop.locator('#lodge-search').fill('zzzzzzz-nonexistent-lodge');
 await desktop.locator('#directory-empty').waitFor({state:'visible'});
 await desktop.locator('#clear-filters').click();
 passed.push('lodge-search-and-reset');

 await desktop.goto(base+'/events/');
 for(const [option,panel] of [['new','#new-panel'],['change','#existing-panel'],['cancel','#existing-panel']]){
  await desktop.locator('.choice[data-mode="'+option+'"]').click();
  await desktop.locator(panel).waitFor({state:'visible'});
 }
 await desktop.locator('.choice[data-mode="new"]').click();
 assert.equal(await desktop.locator('#new-form input[name="title"]').evaluate(x=>x.required),true);
 assert.equal(await desktop.locator('#new-form input[name="title"]').evaluate(x=>x.validity.valueMissing),true);
 passed.push('event-form-modes-and-required-validation');

 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 for(const [url,selector,label] of [
  ['/','h1','home-mobile'],
  ['/calendar/','h1','calendar-mobile'],
  ['/lodges/','#lodge-search','lodges-mobile'],
  ['/events/','#public-view','events-mobile'],
  ['/inspectors/','#signin-view:not(.hidden)','inspectors-mobile']
 ]){
  await browse(mobile,url,selector,label);
  await affiliation(mobile,label);
  await mobileOverflow(mobile,label);
 }
 await mobile.goto(base+'/');
 const toggle=mobile.locator('#menu-toggle');
 await toggle.click();
 assert.equal(await toggle.getAttribute('aria-expanded'),'true','Mobile nav did not open');
 await mobile.screenshot({path:'test-results/menu-mobile.png',animations:'disabled'});
 passed.push('mobile-menu');

 await roleScenario('inspector');
 await roleScenario('admin');
 await disabledScenario();

 console.log('PASS '+passed.length+' browser checks: '+passed.join('; '));
}catch(e){
 console.error('BROWSER SMOKE FAILURE:',e.stack||e.message);
 process.exitCode=1;
}finally{
 await browser?.close();
 server.kill();
}
