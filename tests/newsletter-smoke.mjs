#!/usr/bin/env node
/* Newsletter safety and page layout tests. No network/email/database access. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const api=fs.readFileSync('supabase/functions/division-newsletter/index.ts','utf8');
const adm=fs.readFileSync('app/newsletter-admin.js','utf8');
const pub=fs.readFileSync('newsletter-public.js','utf8');
for(const path of ['inspectors/index.html','events/index.html']){
 const html=fs.readFileSync(path,'utf8');
 const panel=html.split('<section id="tab-newsletter"')[1].split('<section id="tab-settings"')[0];
 const setup=html.split('<details id="newsletter-email-setup"')[1];
 for(const id of ['tab-newsletter','newsletter-signup','newsletter-monthly-day','newsletter-weekly-day',
  'newsletter-monthly-hour','newsletter-weekly-hour','newsletter-lookahead',
  'newsletter-monthly-enabled','newsletter-weekly-enabled','newsletter-monthly-preview',
  'newsletter-weekly-preview','newsletter-send-monthly','newsletter-send-weekly','newsletter-save',
  'newsletter-save-signup','newsletter-save-setup','newsletter-segment','newsletter-cost']){
  assert.ok(html.includes('id="'+id+'"'),path+' is missing '+id);
 }
 assert.ok(html.includes('data-tab="newsletter"'),path+': newsletter navigation missing');
 assert.ok(html.includes('/app/newsletter-admin.js?v=4'),path+': new newsletter client missing');
 assert.ok(html.includes('id="newsletter-monthly-preview-details" class="newsletter-preview-details" hidden'),'Monthly preview should start collapsed');
 assert.ok(html.includes('id="newsletter-weekly-preview-details" class="newsletter-preview-details" hidden'),'Weekly preview should start collapsed');
 assert.ok(html.includes('/app/styles.css?v='+(path.startsWith('inspectors')?'31':'29')));
 assert.ok(!panel.includes('newsletter-cost')&&!panel.includes('newsletter-segment'),'Provider billing should not be on day-to-day newsletter page');
 assert.ok(setup.includes('newsletter-cost')&&setup.includes('newsletter-segment'),'Provider setup belongs under Administration Settings');
}
const app=fs.readFileSync('app/app.js','utf8');
assert.ok(app.includes("key==='newsletter'")&&app.includes('window.loadNewsletter'));
assert.ok(app.includes("'staff','newsletter','settings'"));
const html=fs.readFileSync('calendar/index.html','utf8');
assert.ok(html.includes('id="division-newsletter-form"'));
assert.ok(html.includes('/newsletter-public.js?v=1'));
assert.ok(pub.includes("request('confirm'"));
assert.ok(pub.includes('history.replaceState'));
assert.ok(adm.includes('await db.auth.getSession()'));
assert.ok(adm.includes("request('admin-status'"));
assert.ok(adm.includes('newsletter-save-setup'));
assert.ok(adm.includes('newsletter-save-signup'));
assert.ok(adm.includes("sendNow('monthly')")&&adm.includes("sendNow('weekly')"));
assert.ok(adm.includes('window.loadNewsletter='));
assert.ok(adm.includes('data.marketing_configured'),'Show Marketing key status in the Inspector Desk');
assert.ok(api.includes('RESEND_MARKETING_API_KEY'),'Use separate Marketing API key');
assert.ok(api.includes("mode:'marketing'|'transactional'='marketing'"),'Keep transactional email credentials separated');
assert.ok(api.includes("'transactional');"),'Signup confirmation must use send-only transactional key');
assert.ok(api.includes("||!marketingKey()"),'Signup and sending must be gated on Marketing API key');
assert.ok(adm.includes('details.hidden=false')&&adm.includes('details.open=true'),'Previews must open only after requested');
const style=fs.readFileSync('app/styles.css','utf8');
assert.ok(style.includes('flex-direction:row!important'),'Checkbox labels must stay horizontal');
assert.ok(style.includes('.newsletter-preview-details[hidden]{display:none!important}'),'Empty preview must not consume space');
for(const piece of [
 "if(!settings.sending_enabled",
 "if(!settings.signup_enabled",
 "claims.aal!=='aal2'",
 "effectiveKind==='weekly'&&!built.versions.length",
 "eq('event_version',item.version)",
 "RESEND_UNSUBSCRIBE_URL",
 "send:false",
 "monthlyDue",
 "weeklyDue",
 "monthly_send_hour",
 "weekly_send_hour",
 "monthly_enabled",
 "weekly_enabled",
 "resend_segment_id"
])assert.ok(api.includes(piece),'Backend missing: '+piece);
assert.ok(api.includes('factors?.factors?.some'));
// Branded HTML must use the same real emblem as the shared site masthead and
// existing OTP email; keep transactional confirmation and Broadcasts separate.
const sharedHeader=fs.readFileSync('shared/header.js','utf8');
const otpTemplate=fs.readFileSync('docs/auth-email-otp-template.html','utf8');
const logo='https://divisionivmasons.org/app/assets/division-iv-emblem.png?v=20261028b';
assert.ok(api.includes(logo),'Newsletter logo must use approved Division IV emblem');
assert.ok(sharedHeader.includes('/app/assets/division-iv-emblem.png?v=20261028b'));
assert.ok(otpTemplate.includes(logo),'Newsletter and security email should share one emblem');
for(const item of ['function brandedEmail(', 'function confirmationHtml(', 'html:confirmationHtml(link)',
 'const html=brandedEmail({', 'alt="Division IV Masons emblem"', 'GRAND LODGE OF CALIFORNIA',
 'Confirm My Subscription', 'View the Division IV Calendar', 'This confirmation link expires in 48 hours',
 'word-break:break-all', 'escapeHTML(o.actionUrl)', 'escapeHTML(e.title)', 'escapeHTML(where)',
 'unsubscribe:true', '<!doctype html>', 'role="presentation"', 'max-width:600px']){
 assert.ok(api.includes(item),'Branded email missing: '+item);
}
assert.ok(api.includes("},'transactional');"),'Confirmation must remain a transactional send');
assert.ok(api.includes('const text=[label,'),'Broadcasts must retain their plain text fallback');
assert.ok(api.includes("text:'Confirm your subscription"),'Confirmations must retain a plain text fallback');
new vm.Script(pub,{filename:'newsletter-public.js'});
new vm.Script(adm,{filename:'app/newsletter-admin.js'});
console.log('PASS: monthly/weekly controls, one-time setup location, RLS-gated backend, and version-safe sending.');
