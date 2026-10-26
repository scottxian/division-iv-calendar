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
 'events/index.html':['/app/app.js?v=37','/app/mfa.js?v=8'],
 'inspectors/index.html':['/app/app.js?v=37','/app/mfa.js?v=8']
};
for(const [file,needles] of Object.entries(required)){
 const html=read(file);
 for(const needle of needles)if(!html.includes(needle))errors.push(file+': missing '+needle);
}
if(read('CNAME').trim()!=='calendar.divisionivmasons.org')errors.push('Staging CNAME changed before approved cutover');
if(!read('app/app.js').includes("location.pathname.startsWith('/inspectors/')"))
 errors.push('Inspector route does not default to private sign-in');

console.log('Staged pages:',pages.length,'JS files:',scripts.length,'link/asset references checked:',checkedLinks);
if(errors.length){
 for(const e of errors)console.error('FAIL:',e);
 process.exitCode=1;
}else console.log('PASS: Local links, page routes, script parsing, app entry points, CNAME and browser secret scan');
