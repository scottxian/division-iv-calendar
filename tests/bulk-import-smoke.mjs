#!/usr/bin/env node
/** Bulk importer integration checks: read-only, no calendar writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(f,'utf8');
const html=read('inspectors/index.html');
const app=read('app/app.js');
const client=read('app/bulk-import.js');
const api=read('supabase/functions/division-bulk/index.ts');
const worker=read('supabase/functions/division-jobs/index.ts');
new vm.Script(client,{filename:'app/bulk-import.js'});
assert.match(html,/data-tab="import"/);
assert.match(html,/id="tab-import"/);
for(const id of ['bulk-file','bulk-status','bulk-summary','bulk-preview','bulk-submit','bulk-results'])
 assert.ok(html.includes('id="'+id+'"'),id);
assert.match(html,/app\/bulk-import\.js\?v=7/);
assert.match(app,/window\.loadBulkImport/);
assert.match(app,/window\.openBulkSubmission/);
assert.match(app,/\['dashboard','import','lodges'/);
assert.match(client,/read-excel-file@9\.3\.13/);
assert.match(client,/out\.event_mode=normalizeEventMode\(row\.event_mode\)/);
const converter=vm.runInNewContext(client.slice(client.indexOf('function cell'),client.indexOf('function excelDate'))+'\nnormalizeEventMode');
for(const [shown,expected] of [['In Person','in_person'],['Online','online'],['Hybrid','hybrid'],['in_person','in_person'],['In-Person','in_person']])
 assert.equal(converter(shown),expected,'Import mode conversion: '+shown);
assert.match(client,/'Attendees','POC Name'/);
assert.match(client,/sheet:'New Events'/);
assert.ok(client.includes('row_number:heading+index+2'));
assert.match(client,/indexByKey=new Map/);
assert.ok(client.includes('indexByKey.get(key)'));
assert.match(client,/heading==='district override'/);
assert.match(client,/const mandatory=/);
// A reordered sheet must work without altering the backend field names.
const mapper=vm.runInNewContext(client.slice(client.indexOf('const headers='),client.indexOf('function msg('))+
  '\n({columnKey,mapColumns})');
const reordered=[
 'Start Time\nh:mm AM/PM','District','Event Title','Location TBD?\nYES / NO',
 'Other Host','Venue Name','Start Date\nMM/DD/YYYY','End Date\nMM/DD/YYYY',
 'Event Type','End Time\nh:mm AM/PM','Description','POC Name','POC Phone','POC Email'
];
const mapping=mapper.mapColumns(reordered);
assert.equal(mapping.get('start_time'),0);
assert.equal(mapping.get('district_override'),1);
assert.equal(mapping.get('title'),2);
assert.equal(mapping.get('location_tbd'),3);
assert.equal(mapping.get('location_name'),5);
assert.equal(mapper.columnKey('District Override'),'district_override');
assert.equal(mapper.columnKey('Audience'),'invited_audience');
assert.throws(()=>mapper.mapColumns(['Event Title','Event Title']),/Repeated spreadsheet heading/);

assert.match(client,/'District','Event Title'/);
assert.ok(client.includes("'Mode','Location TBD?','Venue Name'"));
assert.match(client,/entries\.length>25/);
assert.match(client,/confirmed_rows/);
assert.match(client,/status==='invalid'/);
assert.match(client,/location_tbd/);
assert.match(api,/claims\.aal!=='aal2'/);
assert.match(api,/staff\.role/);
assert.match(api,/bulk_import_new_request/);
assert.match(api,/n<3\|\|n>500/,'Importer must accept rows 3–27 in simplified Excel template');
assert.match(api,/bulk_event_imports/);
assert.match(api,/confirmed_rows:/);
assert.match(html,/app\/app\.js\?v=55/);
assert.match(api,/event_requests/);
assert.match(api,/status:'completed'/);
assert.match(api,/message_type:'bulk_import_summary'/);
assert.ok(!api.includes(".from('events').insert("),'Bulk importer must not directly publish events');
assert.ok(!api.includes(".from('calendar_jobs').insert("),'Bulk importer must not bypass review');
assert.match(worker,/job\.message_type==='bulk_import_summary'/);
assert.match(worker,/Each submission awaits individual verification and approval/);
assert.match(api,/Possible matching event/);
console.log('PASS: Division IV new-event Excel importer UI, authentication, deduplication, review queue and email wiring');
