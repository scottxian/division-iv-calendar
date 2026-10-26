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
 await check(desktop,'Inspector sign-in routing','/inspectors/','#signin-view:not(.hidden)','inspectors-desktop.png');

 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 await check(mobile,'Mobile homepage','/','h1','home-mobile.png');
 const toggle=mobile.locator('#menu-toggle');
 await toggle.click();
 assert.equal(await toggle.getAttribute('aria-expanded'),'true','Mobile menu did not open');
 await mobile.screenshot({path:'test-results/menu-mobile.png',animations:'disabled'});
 pass.push('Mobile navigation');
 console.log('PASS:',pass.join('; '));
}catch(e){
 console.error('BROWSER SMOKE FAILURE:',e.message);
 process.exitCode=1;
}finally{
 await browser?.close();
 server.kill();
}
