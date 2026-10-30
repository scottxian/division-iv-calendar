#!/usr/bin/env node
/** Read-only layout checks; no event or account operations. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const html=read('inspectors/index.html'),app=read('app/app.js'),mfa=read('app/mfa.js'),css=read('app/styles.css'),upload=read('app/bulk-import.js');
assert.match(app,/classList\.toggle\('inspector-desk-mode',view==='admin'\)/);
assert.match(css,/body\.inspector-desk-mode \.hero\{display:none\}/);
assert.match(css,/\.tabs\{display:flex;flex-wrap:nowrap;overflow-x:auto/);
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
assert.match(html,/app\/bulk-import\.js\?v=7/);
console.log('PASS: compact Inspector Desk, MFA badge, scrollable tabs, simple importer');
