#!/usr/bin/env node
/* Read-only regression checks for required public event descriptions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const page of ['events/index.html','inspectors/index.html']){
 const html=fs.readFileSync(page,'utf8');
 const newForm=html.split('<form id="new-form">')[1]?.split('</form>')[0];
 const editForm=html.split('<form id="modify-form">')[1]?.split('</form>')[0];
 assert.ok(newForm,page+': missing new-event form');
 const desc=newForm.match(/<textarea\s+name="public_description"[^>]*>/)?.[0]||'';
 assert.match(desc,/\srequired(?:\s|>)/,page+': blank descriptions must be blocked');
 assert.ok(newForm.includes('Public event description <span class="req"'),page+': required asterisk needed');
 assert.ok(!newForm.includes('Public event description (optional)'),page+': contradictory label');
 assert.ok(!/name="public_description"[^>]*\srequired/.test(editForm),page+': existing event change should remain optional');
 assert.ok(html.includes('/app/app.js?v=65'),page+': needs cache-busted frontend');
}
const backend=fs.readFileSync('supabase/functions/division-calendar/index.ts','utf8');
assert.match(backend,/if\(!a\.staff&&!clean\(proposed_fields\.public_description\)\)throw Error\('Enter a public event description'\)/,
 'Public API must reject whitespace-only and blank descriptions');
assert.ok(backend.includes("if(kind==='new')"),'Validation must occur in new event submissions, not existing changes');
const frontend=fs.readFileSync('app/app.js','utf8');
assert.ok(frontend.includes('if(!initial.public_description&&f.elements.public_description)f.elements.public_description.required=false'),
 'Old events with no descriptions must remain editable by inspectors');
new vm.Script(frontend,{filename:'app/app.js'});
console.log('PASS: required public event descriptions, API trimming, optional existing changes and legacy inspector edits.');
