#!/usr/bin/env node
/** Access labels can be changed without altering RLS, auth, or backend role values. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/app.js','utf8');
const sites=['inspectors/index.html','events/index.html'];
for(const path of sites){
 const page=fs.readFileSync(path,'utf8');
 assert.ok(page.includes('<label>Access Level <select name="role"><option value="inspector">User</option><option value="admin">Admin</option></select></label>'),path+': expected User/Admin role labels with unchanged stored values');
 assert.ok(page.includes('<span class="chip" id="staff-role">User</span>'),path+': initial badge must say User');
 assert.ok(page.includes('/app/app.js?v=62'),path+': latest client script must be used');
 assert.ok(!page.includes('<option value="user">'),path+': must not invent new database role');
}
const helper=app.match(/function accessLevelLabel\(role\)\{[^\n]+\}/)?.[0];
assert.ok(helper,'A client-only access label helper is required');
const label=new Function('nice',helper+';return accessLevelLabel;')(x=>x);
assert.equal(label('inspector'),'User');
assert.equal(label('admin'),'Admin');
assert.equal(label('guest'),'guest');
assert.ok(app.includes("$('staff-role').textContent=accessLevelLabel(m.staff.role)"));
assert.equal(app.split('accessLevelLabel(s.role)').length-1,2,'Both staff list render paths must display User/Admin');
assert.ok(app.includes("if(s.role==='inspector')return s.district?'District '+s.district:'Inspector at Large'"),'Masonic office/district designation must be unchanged');
assert.ok(app.includes("form.elements.role.value==='inspector'"),'Required fields must continue checking the existing database role');
assert.ok(app.includes("m.staff.role!=='admin'"),'Admin authorization must continue checking the existing database role');
assert.ok(app.includes("payload.role==='inspector'"),'Staff saving validation must continue using the stored role');
console.log('PASS: Access Level User/Admin labels only; inspector/admin database values, office titles, and permissions remain unchanged.');
