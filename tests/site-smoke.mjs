#!/usr/bin/env node
/** Phase 3: dependency-free staging smoke tests. Never modifies live data. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const pages=['index.html','calendar/index.html','lodges/index.html','events/index.html','inspectors/index.html','calendar.html','lodges.html'];
const scripts=['script.js','lodges.js','app/app.js','app/bootstrap.js','app/lodges-admin.js','app/site-settings-admin.js','app/resources.js','app/mfa.js'];
const errors=[];
let checkedLinks=0;

const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const fileExists=name=>fs.existsSync(path.join(root,name))&&fs.statSync(path.join(root,name)).isFile();

for(const page of pages){
 if(!fileExists(page)){errors.push('Missing page: '+page);continue;}
 const html=read(page);
 if(/\b(?:src|href)=["']{2}/.test(html))errors.push(page+': malformed quoted src/href');
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
 'events/index.html':['/app/app.js?v=44','/app/mfa.js?v=8'],
 'inspectors/index.html':['/app/app.js?v=44','/app/mfa.js?v=8']
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
 const route=file==='index.html'?'/':file.replace(/index\.html$/,'');
 const canonical='https://divisionivmasons.org'+route;
 for(const needle of [
  'rel="canonical" href="'+canonical+'"',
  'property="og:title"', 'property="og:description"',
  'property="og:url" content="'+canonical+'"',
  'property="og:image" content="https://divisionivmasons.org/assets/emblem.png"',
  'name="twitter:card" content="summary"'
 ]){
  if(!html.includes(needle))errors.push(file+': missing sharing metadata '+needle);
 }
 if(!read('sitemap.xml').includes('<loc>'+canonical+'</loc>'))errors.push('Sitemap missing '+canonical);
}
if(!read('robots.txt').includes('Sitemap: https://divisionivmasons.org/sitemap.xml'))
 errors.push('robots.txt does not announce the sitemap');
if(!read('robots.txt').includes('Disallow: /inspectors/'))
 errors.push('robots.txt must exclude the Inspector Desk');
if(!read('inspectors/index.html').includes('name="robots" content="noindex, nofollow, noarchive"'))
 errors.push('Inspector Desk must declare noindex');
if(!fileExists('assets/emblem.png'))errors.push('Public preview emblem is missing');

console.log('Staged pages:',pages.length,'JS files:',scripts.length,'link/asset references checked:',checkedLinks);
if(errors.length){
 for(const e of errors)console.error('FAIL:',e);
 process.exitCode=1;
}else console.log('PASS: Local links, page routes, script parsing, app entry points, CNAME and browser secret scan');
