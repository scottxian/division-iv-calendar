#!/usr/bin/env node
/** Admin-only Inspector at Large tests; no network calls or live database changes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client=fs.readFileSync('app/app.js','utf8');
const admin=fs.readFileSync('inspectors/index.html','utf8');
const publicForm=fs.readFileSync('events/index.html','utf8');
const server=fs.readFileSync('supabase/functions/division-calendar/index.ts','utf8');

const opt='<option value="at_large">Inspector at Large — No District</option>';
assert.ok(admin.includes(opt),'Admin inspector assignment option missing');
assert.ok(!publicForm.includes(opt)&&!publicForm.includes('value="at_large"'),'At Large must not appear in the public event district list');

const start=client.indexOf('function inspectorDistrictLabel(s){');
const end=client.indexOf('function staffFormRequirements()',start);
assert.ok(start>0&&end>start,'Inspector district display helper missing');
const label=vm.runInNewContext(client.slice(start,end)+'\ninspectorDistrictLabel');
assert.equal(label({role:'inspector',district:null}),'Inspector at Large');
assert.equal(label({role:'inspector',district:'428'}),'District 428');
assert.equal(label({role:'admin',district:null}),null,'Admins without a district should not appear as at-large inspectors');
assert.equal(label({role:'admin',district:'414'}),'District 414');

assert.ok(client.includes("if(s.role==='inspector'&&!s.district)form.elements.district.value='at_large'"),
 'Editing an unassigned inspector must choose the at-large option');
assert.ok(client.includes("form.elements[key].required=required"),
 'Existing required field checks must remain');
const districtRegion=server.slice(server.indexOf("const districtSelection=clean(b.district,12);"),server.indexOf("const home_phone=clean(b.home_phone,50);"));
assert.ok(districtRegion.includes("districtSelection==='at_large'?'':districtSelection"),'Backend must normalize At Large to blank');
assert.ok(districtRegion.includes("role!=='inspector'"),'At Large must be inspector-only');
assert.ok(server.includes("['district',districtSelection]"),'New inspector validation must check that a designation was selected');
assert.ok(server.includes("district:district||null"),'At Large must be stored as NULL');
assert.ok(server.includes("if(district && !['402','404','410','414','418','422','428','438'].includes(district))"),
 'Valid numeric districts must still be enforced');
const normalize=vm.runInNewContext(`(b,role)=>{
 const clean=(v,max)=>String(v??'').trim().slice(0,max);
 ${districtRegion}
 return {districtSelection,district:district||null};
}`);
assert.equal(normalize({district:'at_large'},'inspector').district,null);
assert.equal(normalize({district:'428'},'inspector').district,'428');
assert.equal(normalize({district:''},'inspector').district,null);
assert.throws(()=>normalize({district:'at_large'},'admin'),/only valid for inspector accounts/);
console.log('PASS: at-large admin option, NULL mapping, edit display, district validation, public form isolation.');
