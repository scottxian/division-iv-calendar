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
 await desktop.locator('header[data-header-ready="true"]').waitFor();
 const headerIdentity=async page=>page.locator('header .division-brand').evaluate(el=>{
  const img=el.querySelector('img.brand-emblem');
  const header=el.closest('header');
  return {name:el.querySelector('.brand-name')?.textContent,
   affiliation:el.querySelector('.brand-affiliation')?.textContent,
   image:new URL(img.getAttribute('src'),location.origin).pathname,
   logoWidth:Math.round(img.getBoundingClientRect().width),
   headerHeight:Math.round(header.getBoundingClientRect().height),
   border:getComputedStyle(img).borderTopWidth};
 });
 const homeIdentity=await headerIdentity(desktop);
 assert.equal(homeIdentity.name,'Division IV Masons');
 assert.equal(homeIdentity.image,'/app/assets/division-iv-emblem.png');
 assert.equal(homeIdentity.border,'0px','Public header logo should not have a box border');
 assert.ok(await desktop.locator('a[href="/events/"]').count(),'Homepage missing event request route');
 // Mock the public read-only month feed for deterministic UI tests.
 await desktop.route('**/functions/v1/division-upcoming-events?month=*',async route=>{
   const month=new URL(route.request().url()).searchParams.get('month');
   const events=[{
     id:'11111111-1111-4111-8111-111111111111',title:'Mock Published Degree',
     event_type:'Fellow Craft Degree',hosted_by:'Sample Lodge No. 173',district:'428',
     starts_at:month+'-06T19:00:00Z',ends_at:month+'-06T20:00:00Z',
     event_mode:'in_person',location_name:'Sample Masonic Hall',location_tbd:false,
     public_description:'Calendar browser test entry'
   },{
     id:'22222222-2222-4222-8222-222222222222',title:'Mock Division Fellowship',
     event_type:'Special Event',hosted_by:'Sample Lodge No. 19',district:'428',
     starts_at:month+'-12T19:00:00Z',ends_at:month+'-12T20:00:00Z',
     event_mode:'in_person',location_name:'Sample Lodge',location_tbd:false
   }];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events})});
 });
 await check(desktop,'Calendar','/calendar/','h1','calendar-desktop.png');
 const monthPickerWidth=await desktop.locator('#month-picker').evaluate(el=>el.getBoundingClientRect().width);
 assert.ok(monthPickerWidth>=200,'Month label is too narrow and may overlap its picker icon');
 await desktop.locator('.month-event-row').first().waitFor({state:'visible',timeout:12000});
 assert.equal(await desktop.locator('.month-event-row').count(),2,'Month list must render the published event feed');
 assert.equal(await desktop.locator('.month-date.has-events').count(),2,'Calendar must highlight two event dates');
 const monthText=await desktop.locator('#month-browser-heading').textContent();
 await desktop.locator('.month-date.has-events').first().click();
 assert.equal(await desktop.locator('.month-event-row').count(),1,'Selecting a calendar day must filter right-hand event list');
 await desktop.locator('.month-event-row').first().click();
 await desktop.locator('#public-event-dialog[open]').waitFor({state:'visible',timeout:7000});
 assert.equal(await desktop.locator('#public-event-detail h2').textContent(),'Mock Published Degree');
 await desktop.locator('#public-event-close').click();
 await desktop.locator('#month-clear-day').click();
 assert.equal(await desktop.locator('.month-event-row').count(),2,'Clearing selected day restores month list');
 await desktop.locator('#month-next').click();
 await desktop.locator('.month-event-row').first().waitFor({state:'visible',timeout:12000});
 assert.notEqual(await desktop.locator('#month-browser-heading').textContent(),monthText,'Next month must change heading');
 assert.ok(await desktop.locator('iframe[src*="calendar.google.com"]').count(),'Classic Google Calendar embed must remain');
 pass.push('Month navigation, event-day markers, event modal, and filtered timeline');
 await check(desktop,'Lodge directory','/lodges/','#lodge-search','lodges-desktop.png');
 await check(desktop,'Public event requests','/events/','#public-view','events-desktop.png');
 assert.match(await desktop.locator('#nav-public').textContent(),/Calendar Submissions/);
 assert.match(await desktop.locator('.hero h1').textContent(),/Calendar submissions/);
 assert.match(await desktop.locator('.hero p').first().textContent(),/Each lodge retains full authority over its own activities and scheduling/);
 pass.push('Public submission language preserves lodge scheduling authority');
 const publicDistricts=await desktop.locator('#new-district optgroup').evaluateAll(groups=>
  groups.map(group=>({division:group.label,codes:[...group.querySelectorAll('option')].map(x=>x.value)})));
 assert.deepEqual(publicDistricts.map(group=>group.division),
   ['Division I','Division II','Division III','Division IV','Division X'],
   'District dropdown should show only Divisions I, II, III, IV and X');
 assert.ok(publicDistricts.every(group=>group.codes.length>0),'Each permitted division must have district choices');
 assert.equal(publicDistricts.flatMap(group=>group.codes).length,49,
   'Unexpected district count; check live approved district configuration');
 assert.ok(!publicDistricts.flatMap(group=>group.codes).includes('502'),
   'Division V districts should not appear on the public submission form');
 const changeDistricts=await desktop.locator('#edit-district optgroup').evaluateAll(groups=>groups.map(group=>group.label));
 assert.deepEqual(changeDistricts,publicDistricts.map(group=>group.division),
   'Change-event district dropdown should use the same five divisions');
 pass.push('Public and change-event district choices limited to Divisions I, II, III, IV and X');

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
 await desktop.locator('header[data-header-ready="true"]').waitFor();
 const inspectorIdentity=await headerIdentity(desktop);
 assert.deepEqual(inspectorIdentity,homeIdentity,
   'Inspector Desk must share identical masthead branding, image and desktop dimensions');
 assert.equal(await desktop.locator('#nav-signin').count(),1,
   'Inspector auth controls must survive shared header include');
 pass.push('Shared public/inspector header identity and functional inspector navigation');
 const brandLogo=desktop.locator('header img.brand-emblem');
 const brandStyle=await brandLogo.evaluate(el=>{
   const css=getComputedStyle(el);
   return {borderWidth:css.borderTopWidth,borderRadius:css.borderTopLeftRadius,objectFit:css.objectFit,displayWidth:el.getBoundingClientRect().width};
 });
 assert.equal(brandStyle.borderWidth,'0px','Inspector Desk header logo must not have an added square border');
 assert.equal(brandStyle.objectFit,'contain','Inspector Desk header logo must preserve its circular shape');
 assert.ok(brandStyle.displayWidth>=70,'Inspector Desk emblem should not appear unnecessarily small');
 pass.push('Circular Inspector Desk logo without legacy rounded-square outline');
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

 // Inspector review is verified using mocked read-only details; no event is published.
 await desktop.route('**/functions/v1/division-calendar?action=detail*',async route=>{
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   request:{id:'11111111-1111-4111-8111-111111111119',request_code:'DIV4-SMOKE-SUBMISSION',
     request_type:'new',status:'pending',edit_version:0,
     submitted_at:'2026-11-01T00:00:00Z',requester_name:'Sample Sender',
     requester_email:'test@example.invalid',proposed_fields:{
       title:'Mock Degree Listing',event_type:'Fellow Craft Degree',
       hosted_by:'Sample Lodge No. 173',district:'428',
       start_local:'2026-11-06T11:00',end_local:'2026-11-06T12:00',
       event_mode:'in_person',location_name:'Sample Masonic Hall'
     }},
   event:null,history:[],calendar:[],email:[]
  })});
 });
 await desktop.evaluate(()=>{
  document.getElementById('admin-view').classList.remove('hidden');
  document.getElementById('tab-requests').classList.remove('hidden');
 });
 await desktop.evaluate(()=>detail('smoke-submission'));
 const verify=desktop.locator('#review-actions button',{hasText:'Verify & Publish'});
 await verify.waitFor({state:'visible',timeout:10000});
 assert.equal(await desktop.locator('#request-detail').getByText('Awaiting Publication').count()>0,true,
  'Pending internal state must display as Awaiting Publication');
 assert.equal(await desktop.locator('#review-actions button',{hasText:'Return for Correction'}).count(),1,
  'Return for Correction must keep existing inspector workflow');
 await verify.click();
 await desktop.locator('#division-confirm-dialog[open]').waitFor({state:'visible',timeout:5000});
 assert.match(await desktop.locator('#division-dialog-message').textContent(),/not the lodge.s authority to schedule/);
 await desktop.locator('#division-dialog-no').click(); // No publication request is sent
 pass.push('Inspector verification actions, status labels and safe confirmation');

 // A published event must open a real inspector editor, even when Location TBD lives outside <details>.
 // Intercept the read-only event lookup; no live accounts, event writes, or notifications.
 await desktop.route('**/functions/v1/division-calendar?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='event-detail'){
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    event:{id:'smoke-event',title:'Test Published Event',event_code:'DIV4-SMOKE',
     status:'active',version:1,event_mode:'in_person',location_tbd:false,
     starts_at:'2026-11-10T20:00:00Z',ends_at:'2026-11-10T21:00:00Z',
     public_description:'Before change'},
    calendar:[],history:[]
   })});
  }else await route.continue();
 });
 await desktop.evaluate(()=>{document.getElementById('admin-view').classList.remove('hidden');document.getElementById('tab-events').classList.remove('hidden')});
 await desktop.evaluate(()=>eventDetail('smoke-event'));
 const editPublished=desktop.locator('#event-actions button', {hasText:'Edit Published Event'});
 await editPublished.waitFor({state:'visible',timeout:10000});
 await editPublished.click();
 const editor=desktop.locator('#inspector-form');
 await editor.waitFor({state:'visible',timeout:10000});
 assert.equal(await editor.locator('input[name=location_tbd]').count(),1,'Published event editor must include Location TBD');
 assert.equal(await editor.locator('textarea[name=public_description]').count(),1,'Published event editor must include description');
 await editor.locator('textarea[name=public_description]').fill('TEST EDIT VERIFIED');
 assert.equal(await editor.locator('textarea[name=public_description]').inputValue(),'TEST EDIT VERIFIED');
 pass.push('Published event edit button opens functional editor without saving');


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
