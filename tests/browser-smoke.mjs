/** Browser smoke test for the staging branch. No credentials or writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const base='http://127.0.0.1:5173';
const server=spawn('python3',['-m','http.server','5173','--bind','127.0.0.1'],{stdio:'ignore'});
await fs.mkdir('test-results',{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
const pass=[];
async function ready(){
 for(let i=0;i<40;i++){
  try{const response=await fetch(base+'/');if(response.ok)return}catch{}
  await sleep(250);
 }
 throw Error('Local static preview server did not start');
}
async function check(page,label,url,selector,screenshot){
 const response=await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(response.status(),200,label+': route did not return 200');
 await page.locator(selector).first().waitFor({state:'visible',timeout:18000});
 await page.screenshot({path:'test-results/'+screenshot,fullPage:true,animations:'disabled'});
 pass.push(label);
}
try{
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await check(desktop,'Homepage','/','h1','home-desktop.png');
 assert.ok(await desktop.locator('a[href="/events/"]').count(),'Homepage missing event request route');
 await check(desktop,'Calendar','/calendar/','h1','calendar-desktop.png');
 assert.ok(await desktop.locator('iframe[src*="calendar.google.com"]').count(),'Calendar embed not found');
 await check(desktop,'Lodge directory','/lodges/','#lodge-search','lodges-desktop.png');
 await check(desktop,'Public event requests','/events/','#public-view','events-desktop.png');
 await desktop.locator('.choice[data-mode="new"]').click();
 const newTbd=desktop.locator('#new-location-tbd');
 await desktop.locator('#new-form .location-tbd-control').click();
 assert.equal(await newTbd.isChecked(),true,'New event Location TBD checkbox cannot be clicked');
 assert.equal(await desktop.locator('#new-form [name="location_name"]').isDisabled(),true,'New event venue is required with TBD selected');
 await desktop.locator('#new-form .location-tbd-control').click();
 assert.equal(await newTbd.isChecked(),false,'New event Location TBD cannot be unchecked');
 assert.equal(await desktop.locator('#new-form [name="location_name"]').isEnabled(),true,'New event venue must be available when TBD is off');
 await desktop.locator('#new-form select[name="event_mode"]').selectOption('online');
 assert.equal(await newTbd.isDisabled(),true,'Online-only event should use meeting link rather than Location TBD');
 assert.equal(await desktop.locator('#new-form [name="virtual_meeting_url"]').isEnabled(),true,'Online meeting link must be enabled');
 pass.push('New event Location TBD toggling and online mode');
 await desktop.locator('.choice[data-mode="change"]').click();
 await desktop.locator('#existing-editor').evaluate(el=>el.classList.remove('hidden'));
 const editTbd=desktop.locator('#edit-location-tbd');
 await desktop.locator('#modify-form .location-tbd-control').click();
 assert.equal(await editTbd.isChecked(),true,'Change event Location TBD checkbox cannot be clicked');
 assert.equal(await desktop.locator('#modify-form [name="location_name"]').isDisabled(),true,'Change event venue must be disabled for TBD');
 pass.push('Event change Location TBD toggling');
 await desktop.locator('#nav-signin').click();
 await desktop.waitForURL(base+'/inspectors/',{timeout:10000});
 await desktop.locator('#signin-view:not(.hidden)').waitFor();
 pass.push('Public inspector button routes to Inspector Desk');
 await check(desktop,'Inspector sign-in routing','/inspectors/','#signin-view:not(.hidden)','inspectors-desktop.png');
 // Intercept the OTP endpoint so this checks the destination without emailing anyone.
 let capturedRedirect=null;
 await desktop.route('**/auth/v1/otp?*',async route=>{
  capturedRedirect=new URL(route.request().url()).searchParams.get('redirect_to');
  await route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await desktop.locator('#signin-email').fill('inspector-smoke@example.invalid');
 await desktop.locator('#signin-form button[type=submit]').click();
 await desktop.locator('#notice').getByText('Check your email',{exact:false}).waitFor({timeout:10000});
 assert.equal(capturedRedirect,base+'/inspectors/','Inspector OTP sign-in must explicitly request the Inspector Desk redirect');
 pass.push('Inspector magic-link destination');


 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await check(mobile,'Mobile homepage','/','h1','home-mobile.png');
 const toggle=mobile.locator('#menu-toggle');
 await toggle.click();
 assert.equal(await toggle.getAttribute('aria-expanded'),'true','Mobile menu did not open');
 await mobile.screenshot({path:'test-results/menu-mobile.png',animations:'disabled'});
 pass.push('Mobile navigation');
 await check(mobile,'Mobile event requests','/events/','#public-view','events-mobile.png');
 await mobile.locator('.choice[data-mode="new"]').click();
 await mobile.locator('#new-form .location-tbd-control').tap();
 assert.equal(await mobile.locator('#new-location-tbd').isChecked(),true,'Touch: new event Location TBD must toggle on mobile');
 pass.push('Mobile touch Location TBD');
 console.log('PASS:',pass.join('; '));
}catch(e){
 console.error('BROWSER SMOKE FAILURE:',e.message);
 process.exitCode=1;
}finally{
 await browser?.close();
 server.kill();
}
