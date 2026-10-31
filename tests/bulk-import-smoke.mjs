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
assert.match(html,/app\/bulk-import\.js\?v=9/);
assert.match(app,/window\.loadBulkImport/);
assert.match(app,/window\.openBulkSubmission/);
assert.match(app,/\['dashboard','import','lodges'/);
assert.match(client,/read-excel-file@9\.3\.13/);
assert.match(client,/out\.event_mode=normalizeEventMode\(row\.event_mode\)/);
const converter=vm.runInNewContext(client.slice(client.indexOf('function cell'),client.indexOf('function excelDate'))+'\nnormalizeEventMode');
for(const [shown,expected] of [['In Person','in_person'],['Online','online'],['Hybrid','hybrid'],['in_person','in_person'],['In-Person','in_person']])
 assert.equal(converter(shown),expected,'Import mode conversion: '+shown);
assert.match(client,/'Attendees','Attire','Cost','POC Name'/);
assert.match(client,/sheet:'New Events'/);
assert.ok(client.includes('row_number:heading+index+2'));
assert.match(client,/indexByKey=new Map/);
assert.ok(client.includes('indexByKey.get(key)'));
assert.match(client,/Host \(Lodge No\. or Org\.\)/);
assert.match(client,/const mandatory=/);
assert.match(client,/const mandatory=/);
// A reordered sheet must work without altering the backend field names.
const mapper=vm.runInNewContext(client.slice(client.indexOf('const headers='),client.indexOf('function msg('))+
  '\n({columnKey,mapColumns})');
const reordered=[
 'Start Time\nh:mm AM/PM','District (if no lodge)','Event Name','Location TBD?\nYES / NO',
 'Host (Lodge No. or Org.)','Venue Name','Start Date\nMM/DD/YYYY','End Date\nMM/DD/YYYY',
 'Event Type','End Time\nh:mm AM/PM','Description','POC Name','POC Phone','POC Email'
];
const mapping=mapper.mapColumns(reordered);
assert.equal(mapping.get('start_time'),0);
assert.equal(mapping.get('district_override'),1);
assert.equal(mapping.get('host_input'),4);
assert.equal(mapping.get('event_name'),2);
assert.equal(mapping.get('location_tbd'),3);
assert.equal(mapping.get('location_name'),5);
assert.equal(mapper.columnKey('Host (Lodge No. or Org.)'),'host_input');
assert.equal(mapper.columnKey('Audience'),'invited_audience');
assert.throws(()=>mapper.mapColumns(['Event Name','Event Name']),/Repeated spreadsheet heading/);

assert.match(client,/'District \(if no lodge\)','Event Name'/);
assert.ok(client.includes("'Mode','Location TBD?','Online URL'"));
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
assert.match(html,/app\/app\.js\?v=57/);
assert.match(api,/event_requests/);
assert.match(api,/status:'completed'/);
assert.match(api,/message_type:'bulk_import_summary'/);
assert.ok(!api.includes(".from('events').insert("),'Bulk importer must not directly publish events');
assert.ok(!api.includes(".from('calendar_jobs').insert("),'Bulk importer must not bypass review');
assert.match(worker,/job\.message_type==='bulk_import_summary'/);
assert.match(worker,/Each submission awaits individual verification and approval/);
assert.match(api,/Possible matching event/);

// Exercise the server's actual host/title validation against read-only sample inputs.
const extracted=api.slice(api.indexOf('function validated('),api.indexOf('async function inspect('));
assert.ok(extracted.startsWith('function validated('));
const plain=extracted
 .replace('function validated(row:any,ctx:any,staff:any)','function validated(row,ctx,staff)')
 .replace('const issues:string[]=[]','const issues=[]')
 .replace('(v:string)','(v)')
 .replace('(l:any)','(l)')
 .replace('const p:any=','const p=')
 .replace('(value:string,prefix:string)','(value,prefix)');
const preamble=api.slice(api.indexOf('const allowedModes='),api.indexOf('function respond('))
 .replaceAll(':any','').replaceAll(':string','');
const validate=vm.runInNewContext(preamble+'\n'+plain+'\nvalidated');
const ctx={
 lodges:new Map([
 ['256',{lodge_name:'Lodi',lodge_number:'256',district:'428',abbreviation:'Lodi No. 256'}],
 ['131',{lodge_name:'Woodbridge',lodge_number:'131',district:'428',abbreviation:'Woodbridge No. 131'}]
 ]),
 types:new Set(['Entered Apprentice Degree','District School of Instruction','Division School of Instruction','Special Event']),
 districts:new Set(['428'])
};
const staff={display_name:'Test Inspector',email:'inspector@example.org'};
const base={row_number:3,event_type:'Entered Apprentice Degree',host_input:'256',district_override:'',
 event_name:'Entered Apprentice Degree',start_local:'2027-11-18T19:00',end_local:'2027-11-18T21:00',
 event_mode:'in_person',location_name:'Woodbridge Lodge No. 131',location_address1:'1040 E Augusta St',
 location_city:'Woodbridge',location_state:'CA',location_zip:'95258'};
const lodge=validate(base,ctx,staff);
assert.deepEqual(Array.from(lodge.issues),[]);
assert.equal(lodge.p.title,'Lodi No. 256: Entered Apprentice Degree');
assert.equal(lodge.p.district,'428');
const districtSchool=validate({...base,event_type:'District School of Instruction',event_name:''},ctx,staff);
assert.deepEqual(Array.from(districtSchool.issues),[]);
assert.equal(districtSchool.p.title,'District 428 School of Instruction');
assert.equal(districtSchool.p.event_name,'School of Instruction');
const divisionSchool=validate({...base,event_type:'Division School of Instruction',host_input:'',event_name:''},ctx,staff);
assert.deepEqual(Array.from(divisionSchool.issues),[]);
assert.equal(divisionSchool.p.hosted_by,'Division IV');
assert.equal(divisionSchool.p.title,'Division School of Instruction: Woodbridge Lodge No. 131');
const online=validate({...base,event_type:'Division School of Instruction',host_input:'',event_name:'',
 event_mode:'online',location_name:'',virtual_meeting_url:'https://example.org/zoom'},ctx,staff);
assert.deepEqual(Array.from(online.issues),[]);
assert.equal(online.p.title,'Division School of Instruction: Zoom');
const other=validate({...base,event_type:'Special Event',host_input:'Community Organization',district_override:'428',event_name:'Dinner'},ctx,staff);
assert.deepEqual(Array.from(other.issues),[]);
assert.equal(other.p.title,'Community Organization: Dinner');
const invalid=validate({...base,host_input:'999'},ctx,staff);
assert.ok(invalid.issues.some(v=>v.includes('lodge was not found')));

console.log('PASS: Division IV new-event Excel importer UI, authentication, deduplication, review queue and email wiring');
