#!/usr/bin/env node
/** Read-only layout checks; no event or account operations. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const html=read('inspectors/index.html'),app=read('app/app.js'),mfa=read('app/mfa.js'),css=read('app/styles.css'),upload=read('app/bulk-import.js');
assert.match(app,/classList\.toggle\('inspector-desk-mode',view==='admin'\)/);
assert.match(css,/body\.inspector-desk-mode \.hero\{display:none\}/);
assert.match(css,/\.desk-tabs\{display:flex;flex-wrap:wrap;align-items:center;overflow:visible/);
assert.doesNotMatch(css,/body\.inspector-desk-mode #admin-view \.tabs\{display:flex;flex-wrap:nowrap;overflow-x:auto/);
assert.match(html,/<nav class="tabs desk-tabs" aria-label="Inspector Desk sections">/);
assert.match(html,/<details class="desk-nav-menu">/);
assert.match(html,/<details class="desk-nav-menu admin-only hidden">/);
assert.match(app,/menu\.classList\.toggle\('active',!!menu\.querySelector\('\.tab\.active'\)\)/);
for(const tab of ['dashboard','requests','import','events','resources','history','corrections','lodges','staff','settings'])
 assert.match(html,new RegExp('data-tab="'+tab+'"'),tab+' must remain reachable');
assert.match(mfa,/host\.className='verified-mfa'/);
assert.match(mfa,/right\.append\(host\)/);
assert.match(mfa,/panel\.id='admin-mfa-security'/);
assert.match(mfa,/promptCode\(host,'Authenticator code'/);
assert.match(html,/class="admin-status"/);
assert.match(html,/id="tab-import"/);
assert.match(html,/class="muted bulk-intro"/);
assert.match(html,/id="bulk-submit" type="button" class="primary hidden" disabled/);
assert.doesNotMatch(html,/class="bulk-import-help"/);
assert.match(upload,/submit\.classList\.toggle\('hidden',!eligible\)/);
assert.match(html,/app\/mfa\.js\?v=9/);
assert.match(html,/app\/bulk-import\.js\?v=8/);
console.log('PASS: Inspector Desk grouped dropdown navigation, accessible tabs, MFA badge, and importer');
