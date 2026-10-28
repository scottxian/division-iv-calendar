#!/usr/bin/env node
/** Phase 3: dependency-free staging smoke tests. Never modifies live data. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const pages=['index.html','calendar/index.html','lodges/index.html','events/index.html','inspectors/index.html','calendar.html','lodges.html'];
const scripts=['script.js','lodges.js','app/app.js','app/bootstrap.js','app/lodges-admin.js','app/site-settings-admin.js','app/resources.js','app/corrections-admin.js','app/mfa.js'];
const errors=[];
let checkedLinks=0;

const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const fileExists=name=>fs.existsSync(path.join(root,name))&&fs.statSync(path.join(root,name)).isFile();

for(const page of pages){
 if(!fileExists(page)){errors.push('Missing page: '+page);continue;}
 const html=read(page);
 if(/\b(?:src|href)=["']{2}/.test(html))errors.push(page+': malformed quoted src/href');
 if (/<a\s+<a\b/i.test(html)) errors.push(page+': malformed duplicate anchor tag');
 const seen=new Set();
 for(const match of html.matchAll(/\bid=["']([^"']+)["']/g)){
  if(seen.has(match[1]))errors.push(page+': duplicate id '+match[1]);
  seen.add(match[1]);
 }
 for(const match of html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/g)){
  checkedLinks++;
  const value=match[2];
  if(!value||value.startsWith('#')||/^(?:https?:|mailto:|tel:|webcal:|data:)/i.test(value))continue;
  if(value.startsWith('//')){errors.push(page+': unexpected protocol-relative URL '+value);continue;}
  const bare=value.split('#')[0].split('?')[0];
  if(!bare)continue;
  const relative=bare.startsWith('/')?bare.slice(1):path.posix.join(path.posix.dirname(page),bare);
  const candidate=relative.endsWith('/')?relative+'index.html':relative||'index.html';
  if(!fileExists(candidate))errors.push(page+': '+value+' -> missing '+candidate);
  if(value.startsWith('/#')){
   const anchor=value.slice(2);
   if(!read('index.html').includes('id="'+anchor+'"'))errors.push(page+': missing homepage anchor '+anchor);
  }
 }
}

for(const file of scripts){
 if(!fileExists(file)){errors.push('Missing JS: '+file);continue;}
 const source=read(file);
 try{new vm.Script(source,{filename:file})}catch(e){errors.push(file+': '+e.message)}
 if(/SUPABASE_SERVICE_ROLE_KEY|sb_secret_|RESEND_API_KEY|GOOGLE_SERVICE_ACCOUNT_JSON|-----BEGIN PRIVATE KEY-----/.test(source))
  errors.push(file+': server-side secret marker in browser code');
}

const required={
 'index.html':['href="/events/"','href="/calendar/"','href="/inspectors/"'],
 'calendar/index.html':['href="/events/"'],
 'lodges/index.html':['href="/events/"'],
 'events/index.html':['/app/app.js?v=47','/app/mfa.js?v=8'],
 'inspectors/index.html':['/app/app.js?v=47','/app/mfa.js?v=8']
};
for(const [file,needles] of Object.entries(required)){
 const html=read(file);
 for(const needle of needles)if(!html.includes(needle))errors.push(file+': missing '+needle);
}
for(const page of ['events/index.html','inspectors/index.html']){
 const html=read(page);
 for(const prefix of ['new','edit']){
  const label='<label class="checkline location-tbd-toggle location-tbd-control"><input id="'+prefix+'-location-tbd"';
  const detail='<details id="'+prefix+'-location-details"';
  const labelIndex=html.indexOf(label),detailsIndex=html.indexOf(detail);
  if(labelIndex<0||detailsIndex<0||labelIndex>detailsIndex)errors.push(page+': Location TBD must appear outside and before location details');
  const openSummary=html.indexOf('<summary>',detailsIndex);
  const closeSummary=html.indexOf('</summary>',openSummary);
  if(html.slice(openSummary,closeSummary).includes('location-tbd'))errors.push(page+': Location TBD cannot be nested inside summary');
 }
}
if(!read('app/app.js').includes("form.querySelector('.location-details')"))errors.push('Location TBD must find sibling details panel');
if(!read('app/app.js').includes("child.matches('.location-tbd-control')"))errors.push('Inspector editor must clone the Location TBD control');
if(read('CNAME').trim()!=='divisionivmasons.org')errors.push('Release candidate CNAME must be divisionivmasons.org');
if(!read('app/app.js').includes("location.assign('/inspectors/')")||!read('app/app.js').includes("state.loginPurpose==='event-contact'?'/events/':'/inspectors/'")) errors.push('Inspector sign-in must use the Inspector Desk redirect');
if(!read('app/app.js').includes("location.pathname.startsWith('/inspectors/')"))
 errors.push('Inspector route does not default to private sign-in');

/* SEO, sharing and indexing checks, with no live network calls. */
const searchable=['index.html','calendar/index.html','lodges/index.html','events/index.html'];
for(const file of searchable){
 const html=read(file);
 const route=file==='index.html'?'/':'/'+file.replace(/index\.html$/,'');
 const canonical='https://divisionivmasons.org'+route;
 for(const needle of [
  'rel="canonical" href="'+canonical+'"',
  'property="og:title"', 'property="og:description"',
  'property="og:url" content="'+canonical+'"',
  'property="og:image" content="https://divisionivmasons.org/assets/emblem.png',
  'name="twitter:card" content="summary"'
 ]){
  if(!html.includes(needle))errors.push(file+': missing sharing metadata '+needle);
 }
 if(!read('sitemap.xml').includes('<loc>'+canonical+'</loc>'))errors.push('Sitemap missing '+canonical);
}
if(!read('robots.txt').includes('Sitemap: https://divisionivmasons.org/sitemap.xml'))
 errors.push('robots.txt does not announce the sitemap');
if(read('robots.txt').includes('Disallow: /inspectors/'))
 errors.push('robots.txt must allow the Inspector Desk noindex meta tag to be read');
if(!read('inspectors/index.html').includes('name="robots" content="noindex, nofollow, noarchive"'))
 errors.push('Inspector Desk must declare noindex');
if(!fileExists('assets/emblem.png'))errors.push('Public preview emblem is missing');


// Public usability checks (event-specific links, direct Division navigation and correction routing).
for(const page of ['index.html','calendar/index.html','lodges/index.html']){
 const html=read(page);
 if(!html.includes('class="nav-division-direct" href="/#about"'))
   errors.push(page+': About Division IV should be a direct navigation link');
}
const calendarHTML=read('calendar/index.html');
for(const field of [
 'id="month-days"','id="month-prev"','id="month-next"','id="month-picker"',
 'id="month-event-list"','id="month-category-filter"','id="month-lodge-filter"',
 'id="month-district-filter"','id="public-event-dialog"','id="classic-calendar"'
]){
 if(!calendarHTML.includes(field))errors.push('Calendar missing monthly date-grid element '+field);
}
if(!calendarHTML.includes('src="/month-calendar.js?v=1"'))
 errors.push('New monthly calendar script is missing');
if(calendarHTML.includes('src="/public-events.js?v=1"'))
 errors.push('Old list-only calendar script must not load on monthly calendar');
if(calendarHTML.includes('href="/calendar/" target="_blank"'))
 errors.push('Calendar fallback must open Google Calendar rather than itself');
if(!read('index.html').includes('/home-events.js?v=4'))
 errors.push('Homepage event links should use the updated event-specific navigation');
if(!read('lodges/index.html').includes('id="lodge-correction-form"')||
   !read('lodges/index.html').includes('/lodge-correction.js?v=3'))
 errors.push('Directory correction reporting is missing');
for(const file of ['month-calendar.js','public-events.js','lodge-correction.js','home-events.js','app/corrections-admin.js']){
 try{new vm.Script(read(file),{filename:file})}catch(e){errors.push(file+': '+e.message)}
}


// Correction queue must remain a private, administrator-only inspector function.
for(const page of ['events/index.html','inspectors/index.html']){
 const html=read(page);
 for(const marker of ['data-tab="corrections"','id="tab-corrections"','id="corrections-list"','src="/app/corrections-admin.js?v=1"','src="/app/app.js?v=47"']){
  if(!html.includes(marker))errors.push(page+': missing private correction queue '+marker);
 }
}
const correctionSource=read('supabase/functions/division-corrections/index.ts');
if(!correctionSource.includes("await requireAdmin(req)")||
   !correctionSource.includes("payload.aal!=='aal2'")||
   !correctionSource.includes("staff.role!=='admin'")||
   !correctionSource.includes("const action=new URL(req.url).searchParams.get('action')||'submit'")){
 errors.push('Private correction endpoint must verify administrator and MFA access');
}
const correctionForm=read('lodges/index.html');
if(!correctionForm.includes('Submit correction for review')||
   !correctionForm.includes('name="website"')||
   !correctionForm.includes('/lodge-correction.js?v=3')){
 errors.push('Public correction form must submit directly to the private review queue');
}
// Separate standing lodge directory information from individual calendar events.
if(correctionForm.includes('<option>Other correction</option>') ||
   !correctionForm.includes('Directory corrections only') ||
   !correctionForm.includes('href="/events/" class="correction-event-link"') ||
   !read('lodge-correction.js').includes("'Directory details':'directory'") ||
   read('lodge-correction.js').includes("'Other correction':'other'")){
 errors.push('Lodge corrections must route calendar changes through the official event request form');
}
if(correctionSource.includes("const categories=new Set(['meeting','location','directory','other'])") ||
   !correctionSource.includes("const categories=new Set(['meeting','location','directory'])")){
 errors.push('Correction endpoint must reject unsupported request categories');
}
if(read('lodge-correction.js').includes('mailto:')){
 errors.push('Public correction form must not rely on email software');
}
if(!read('app/app.js').includes("key==='corrections'")||
   !read('app/app.js').includes('window.loadCorrections')){
 errors.push('Inspector Desk must register the Corrections tab');
}

// Month browsing must use only the public, already-published event feed.
const feed=read('supabase/functions/division-upcoming-events/index.ts');
if(!feed.includes("searchParams.get('month')") ||
   !feed.includes(".eq('status', 'active')") ||
   !feed.includes(".not('google_event_id', 'is', null)") ||
   !feed.includes(".not('calendar_last_synced_at', 'is', null)") ||
   !feed.includes('month ? 250 : 150') ||
   feed.includes('poc_email') || feed.includes('virtual_meeting_url')){
 errors.push('Month calendar must only query active, synced, public event data');
}
if(!read('month-calendar.js').includes('getParts(e.starts_at).month===month') ||
   !read('month-calendar.js').includes("setAttribute('aria-pressed'") ||
   !read('month-calendar.js').includes('month-date-mark')){
 errors.push('Monthly browser must render selected dates and published-event dots');
}


// Inspector publication terminology: UI labels only, never changed status keys.
for(const path of ['events/index.html','inspectors/index.html']){
 const html=read(path);
 for(const phrase of ['Calendar submissions, made simple.','Review Submissions','Awaiting Publication',
  'Verified for Publication','Returned for Correction','Not Published',
  'Each lodge retains full authority over its own activities and scheduling']){
  if(!html.includes(phrase))errors.push(path+': missing publication terminology '+phrase);
 }
 if(/Calendar requests, made simple|Approve & Publish|Pending Approval|<option value="approved">Approved<\/option>/.test(html))
   errors.push(path+': old permission-oriented terminology remains');
 if(!html.includes('/app/app.js?v=47')||!html.includes('/app/styles.css?v=22'))
   errors.push(path+': current publication UI cache version missing');
}
const publicationUI=read('app/app.js');
for(const phrase of ["'Verify & Publish'","'Return for Correction'","'Do Not Publish'",
 'Calendar coordination (advisory only)',"pending:'Awaiting Publication'",
 "approved:'Verified for Publication'","needs_correction:'Returned for Correction'"]){
 if(!publicationUI.includes(phrase))errors.push('Inspector publication UI missing '+phrase);
}
for(const old of ['Approve & Publish','Pending inspector approval','Approve this request']){
 if(publicationUI.includes(old))errors.push('Permission-oriented UI wording remains: '+old);
}
for(const edge of ['division-calendar','division-jobs']){
 const server=read('supabase/functions/'+edge+'/index.ts');
 if(!server.includes("'approved'")||!server.includes('event_requests'))
  errors.push(edge+': expected internal status values or storage identifiers changed');
}
const mailer=read('supabase/functions/division-jobs/index.ts');
for(const phrase of ['Calendar submission received:','awaiting verification for calendar publication',
 'Verified for Publication','Returned for Correction','Not Published',
 'This means the listing was not published']){
 if(!mailer.includes(phrase))errors.push('Email template missing '+phrase);
}
if(!read('app/app.js').includes('Communicate with the hosts')||
   !read('app/app.js').includes('This does not prevent publication'))
 errors.push('Overlapping events must be advisory, not a publication gate');


// Confirm updated Division IV emblem and browser icons are present and referenced.
for(const image of ['assets/emblem.png','assets/favicon.png','assets/favicon.ico',
 'assets/apple-touch-icon.png','app/assets/division-iv-emblem.png']){
 if(!fileExists(image)||fs.statSync(path.join(root,image)).size<8000)
  errors.push('Missing or invalid new Division IV branding image: '+image);
}
for(const page of ['index.html','calendar/index.html','lodges/index.html','events/index.html','inspectors/index.html']){
 const html=read(page);
 for(const mark of ['/assets/favicon.ico?v=20261028',
  '/assets/favicon.png?v=20261028','/assets/apple-touch-icon.png?v=20261028',
  'emblem.png?v=20261028']){
  if(!html.includes(mark))errors.push(page+': missing 2026 approved branding '+mark);
 }
}
for(const svg of ['assets/embroidery/division-iv-patch.svg','assets/embroidery/division-iv-polo.svg']){
 const content=read(svg);
 if(!content.includes('<svg')||!content.includes('masonic-compasses')||
  content.includes('<image')||content.includes('linearGradient'))
  errors.push('Embroidery file must be simple flat vector artwork: '+svg);
}


// Embroidery source artwork must be vector-only, with thread-ready flat colors.
// Keep the older opaque oval from obscuring the square and compasses.
for(const name of ['patch','polo']){
 const svg='assets/embroidery/division-iv-'+name+'.svg';
 const png='assets/embroidery/division-iv-'+name+'.png';
 if(!fileExists(svg)||!fileExists(png))errors.push('Missing embroidery artwork for '+name);
 else {
  const art=read(svg);
  for(const color of ['#0B2749','#E3B54A','#98865E']){
   if(!art.includes(color))errors.push(svg+': expected flat thread color '+color);
  }
  if(art.includes('roman-four-clear-space')||art.includes('linearGradient')||
     art.includes('<image')||art.includes('<text')||!art.includes('id="roman-IV"')){
   errors.push(svg+': use clear vector IV and flat stitch-friendly art');
  }
 }
}


// The Inspector Desk and calendar submissions share the circular-emblem header.
const brandingCSS=read('app/styles.css');
if(!brandingCSS.includes('object-fit:contain;border:0;border-radius:50%;background:transparent')||
  brandingCSS.includes('object-fit:cover;border:1px solid #d8b76f;border-radius:9px')){
 errors.push('Private header must not draw a square gold frame around the approved circle emblem');
}

console.log('Staged pages:',pages.length,'JS files:',scripts.length,'link/asset references checked:',checkedLinks);
if(errors.length){
 for(const e of errors)console.error('FAIL:',e);
 process.exitCode=1;
}else console.log('PASS: Local links, page routes, script parsing, app entry points, CNAME and browser secret scan');
