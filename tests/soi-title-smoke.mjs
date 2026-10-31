#!/usr/bin/env node
/** SOI title regression tests (no network or live database mutations). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('app/app.js','utf8');
const from=app.indexOf('function composedCalendarTitle(');
const to=app.indexOf('function titleControls(',from);
assert.ok(from>0&&to>from,'Unable to locate client-side calendar title builder');
const makeTitle=vm.runInNewContext(
  app.slice(from,to)+'\ncomposedCalendarTitle',
  {state:{config:{lodge_titles:[]}}}
);
function form(eventType,{eventName='',host='Woodbridge Lodge No. 131',district='428',override='',useOverride=false}={}){
 return {elements:{
  event_name:{value:eventName},
  hosted_by:{value:host},
  event_type:{value:eventType},
  district:{value:district},
  calendar_title_override:{value:override},
  title:{dataset:{originalTitle:'Old title'}}
 },querySelector:selector=>selector==='.calendar-title-override-toggle'?{checked:useOverride}:null};
}
assert.equal(makeTitle(form('Division School of Instruction')), 'Division IV School of Instruction');
assert.equal(makeTitle(form('Division School of Instruction',{eventName:'Sample Lodge School',host:'Division IV',district:''})), 'Division IV School of Instruction');
assert.equal(makeTitle(form('Division School of Instruction',{eventName:'Division School of Instruction: Some Lodge'})), 'Division IV School of Instruction');
assert.equal(makeTitle(form('District School of Instruction')), 'District 428 School of Instruction');
assert.equal(makeTitle(form('District School of Instruction',{eventName:'Example: School at Woodbridge',district:'1000'})), 'District 1000 School of Instruction');
assert.equal(makeTitle(form('District School of Instruction',{district:''})), '');
assert.equal(makeTitle(form('Special Event',{eventName:'Annual Dinner',host:'Community Organization'})), 'Community Organization: Annual Dinner');
assert.equal(makeTitle(form('Division School of Instruction',{override:'Staff custom school name',useOverride:true})), 'Staff custom school name');
const db=fs.readFileSync('supabase/functions/division-calendar/index.ts','utf8');
assert.match(db,/\['District School of Instruction','Division School of Instruction'\]/,'Backend must support SOI without event name');
const bulk=fs.readFileSync('supabase/functions/division-bulk/index.ts','utf8');
assert.ok(bulk.includes("'Division IV School of Instruction'"),'Bulk import uses fixed Division IV title');
assert.ok(bulk.includes("p.event_name='School of Instruction'"),'Bulk import standardized school name');
console.log('PASS: school title format, blank event name, venue independence, district formats, staff override, and ordinary events.');
