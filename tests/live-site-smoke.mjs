/** Live Division IV smoke test. GET-only: never submits, publishes, or emails. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const site='https://divisionivmasons.org';
const api='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1';
const passed=[];
async function response(url){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),22000);
 try{return await fetch(url,{signal:controller.signal,redirect:'follow',headers:{Origin:site}})}
 finally{clearTimeout(timeout)}
}
async function assertGet(path,expectedType){
 const res=await response(site+path);
 assert.equal(res.status,200,'Public route or asset '+path+' returned '+res.status);
 if(expectedType)assert.match(res.headers.get('content-type')||'',expectedType,'Wrong content type: '+path);
 passed.push('Live HTTP '+path);
}
for(const path of ['/','/calendar/','/lodges/','/events/','/inspectors/']){
 await assertGet(path,/text\/html/i);
}
await assertGet('/shared/header.js?v=1',/javascript/i);
await assertGet('/shared/header.css?v=1',/text\/css/i);
await assertGet('/app/assets/division-iv-emblem.png?v=20261028b',/image\//i);
await assertGet('/assets/favicon.png?v=20261028',/image\//i);

for(const [path,code] of [
 ['/division-calendar?action=config',200],
 ['/division-upcoming-events?month=2026-10',200],
 ['/division-calendar?action=requests',403],
 ['/division-resources?action=list',403]
]){
 const res=await response(api+path);
 assert.equal(res.status,code,'Backend '+path+' unexpectedly returned '+res.status);
 assert.equal(res.headers.get('access-control-allow-origin'),site,'CORS origin mismatch: '+path);
 const data=await res.json();
 if(code===200){
   assert.ok(data && typeof data==='object','Invalid public backend JSON: '+path);
   if(path.includes('division-calendar'))assert.ok(Array.isArray(data.event_types),'Missing public event types');
   if(path.includes('division-upcoming-events')){
    assert.ok(Array.isArray(data.events),'Missing published events array');
    assert.ok(!data.events.some(e=>/^(testing|test event|this is a test event)$/i.test(String(e.title||'').trim())),'Test event exposed in public website feed');
    assert.ok(!data.events.some(e=>'poc_email' in e || 'virtual_meeting_url' in e),'Private event fields exposed in public feed');
   }
 }
 passed.push('Live '+(code===403?'private denial ':'public feed ')+path);
}

await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const desktop=await browser.newPage({viewport:{width:1440,height:900}});
 async function visit(page,route,label){
  const res=await page.goto(site+route,{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(res?.status(),200,label+' returned non-200');
  await page.locator('header[data-header-ready="true"]').waitFor({state:'attached',timeout:15000});
  await page.locator('h1').first().waitFor({state:'visible',timeout:15000});
  // DOMContentLoaded does not guarantee image decode, especially on the first cold load.
  await page.locator('header img.brand-emblem').evaluate(async img=>{await img.decode()});
  const identity=await page.locator('header .division-brand').evaluate(el=>{
   const img=el.querySelector('img.brand-emblem');
   return {name:el.querySelector('.brand-name')?.textContent?.trim(),
      affiliation:el.querySelector('.brand-affiliation')?.textContent?.trim(),
      image:img?.getAttribute('src')?.split('?')[0],
      logoLoaded:!!img?.complete && img.naturalWidth>0,
      borderWidth:getComputedStyle(img).borderTopWidth,
      logoWidth:Math.round(img.getBoundingClientRect().width)};
  });
  assert.equal(identity.name,'Division IV Masons',label+' branding');
  assert.equal(identity.affiliation,'Grand Lodge of California',label+' affiliation');
  assert.equal(identity.image,'/app/assets/division-iv-emblem.png',label+' uses obsolete emblem');
  assert.ok(identity.logoLoaded,label+' emblem failed to load');
  assert.equal(identity.borderWidth,'0px',label+' emblem has a square frame');
  await page.screenshot({path:'test-results/live-'+label+'.png',fullPage:false,animations:'disabled'});
  passed.push('Live browser '+label);
  return identity;
 }
 const home=await visit(desktop,'/','homepage-desktop');
 const desk=await visit(desktop,'/inspectors/','inspectors-desktop');
 assert.equal(desk.logoWidth,home.logoWidth,'Public and inspector desktop emblem sizes differ');
 await desktop.locator('#signin-view:not(.hidden)').waitFor({timeout:12000});
 assert.equal(await desktop.locator('#admin-view:not(.hidden)').count(),0,'Unauthenticated inspector dashboard visible');
 passed.push('Unauthenticated Inspector Desk stays locked');
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 for(const [path,name] of [['/','homepage-mobile'],['/calendar/','calendar-mobile'],['/lodges/','lodges-mobile'],['/events/','events-mobile'],['/inspectors/','inspectors-mobile']]){
   await visit(mobile,path,name);
   const dims=await mobile.evaluate(()=>({view:window.innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(dims.scroll<=dims.view+4,name+' horizontal page overflow: '+JSON.stringify(dims));
 }
 await mobile.goto(site+'/',{waitUntil:'domcontentloaded'});
 await mobile.locator('#menu-toggle').click();
 assert.equal(await mobile.locator('#menu-toggle').getAttribute('aria-expanded'),'true','Live mobile menu did not expand');
 passed.push('Live mobile navigation');
}finally{await browser.close()}
console.log('PASS: '+passed.join('; '));
