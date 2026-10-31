#!/usr/bin/env node
/** Static newsletter checks; never send email or alter the database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const api=fs.readFileSync('supabase/functions/division-newsletter/index.ts','utf8');
const adm=fs.readFileSync('app/newsletter-admin.js','utf8');
const pub=fs.readFileSync('newsletter-public.js','utf8');
for(const path of ['inspectors/index.html','events/index.html']){
 const html=fs.readFileSync(path,'utf8');
 for(const id of ['tab-newsletter','newsletter-segment','newsletter-cost','newsletter-signup','newsletter-send','newsletter-preview','newsletter-send-now']){
  assert.ok(html.includes('id="'+id+'"'),path+' is missing '+id);
 }
 assert.ok(html.includes('data-tab="newsletter"'),path+': administration navigation missing');
 assert.ok(html.includes('/app/newsletter-admin.js?v=1'));
}
const app=fs.readFileSync('app/app.js','utf8');
assert.ok(app.includes("key==='newsletter'")&&app.includes('window.loadNewsletter'));
assert.ok(app.includes("'staff','newsletter','settings'"));
const html=fs.readFileSync('calendar/index.html','utf8');
assert.ok(html.includes('id="division-newsletter-form"'));
assert.ok(html.includes('/newsletter-public.js?v=1'));
assert.ok(html.includes('/styles.css?v=16'));
assert.ok(pub.includes("request('confirm'"));
assert.ok(pub.includes('history.replaceState'));
assert.ok(adm.includes('await db.auth.getSession()'));
assert.ok(adm.includes('newsletter-cost'));
for(const piece of [
 "if(!settings.sending_enabled",
 "if(!settings.signup_enabled",
 "claims.aal!=='aal2'",
 "kind==='weekly'&&!built.versions.length",
 "eq('event_version',item.version)",
 "RESEND_UNSUBSCRIBE_URL",
 "send:false"
])assert.ok(api.includes(piece),'Backend missing: '+piece);
assert.ok(api.includes('factors?.factors?.some'));
new vm.Script(pub,{filename:'newsletter-public.js'});
new vm.Script(adm,{filename:'app/newsletter-admin.js'});
console.log('PASS: newsletter signup, admin, MFA, free plan gates, previews, and version-safe sending.');
