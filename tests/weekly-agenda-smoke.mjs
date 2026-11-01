#!/usr/bin/env node
/* Pure, offline weekly newsletter tests. Never sends mail or touches the database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {weeklyWindow,withinPacificDates,statedMeetings,meetingDateLabel} from '../supabase/functions/division-newsletter/weekly-agenda.mjs';
import {buildWeeklyContent} from '../supabase/functions/division-newsletter/weekly-content.mjs';
const sunday=weeklyWindow(new Date('2026-11-01T11:00:00Z')); // 3 AM Pacific after fall DST transition
assert.equal(sunday.from,'2026-11-01');
assert.equal(sunday.through,'2026-11-08','Sunday send includes the following Sunday');
assert.equal(weeklyWindow('2026-11-02T16:00:00Z').through,'2026-11-08','Monday send includes coming Sunday');
assert.equal(weeklyWindow('2026-11-08T16:00:00Z').through,'2026-11-15','Every Sunday starts another full Sunday-to-Sunday period');
assert.equal(weeklyWindow('2026-11-08T07:59:00Z').from,'2026-11-07','Pacific calendar day, not UTC date, determines start');
assert.equal(weeklyWindow('2027-03-14T10:00:00Z').through,'2027-03-21','Spring DST Sunday includes next Sunday');
assert.equal(withinPacificDates('2026-11-09T07:59:00Z','2026-11-01','2026-11-08'),true,'11:59 PM Pacific next Sunday is included');
assert.equal(withinPacificDates('2026-11-09T08:00:00Z','2026-11-01','2026-11-08'),false,'Monday at midnight is excluded');
const lodges=[
 {active:true,lodge_name:'Scepter',lodge_number:'143',meeting_day:'1st Mon',meeting_time:'7:30 PM',meeting_notes:'Every month',address_line1:'123 Street',city:'Test',state:'CA'},
 {active:true,lodge_name:'Woodbridge',lodge_number:'131',meeting_day:'1st Tue',meeting_time:'7:30 PM',meeting_notes:'Every month'},
 {active:true,lodge_name:'Golden Compasses Research',lodge_number:'1006',meeting_day:'1st Tue',meeting_time:'7:00 PM',meeting_notes:'Feb, May, Aug, Nov only'},
 {active:true,lodge_name:'Test Sunday',lodge_number:'999',meeting_day:'2nd Sun',meeting_time:'9:00 AM',meeting_notes:'Every month'},
 {active:false,lodge_name:'Inactive',meeting_day:'1st Mon',meeting_time:'7:00 PM',meeting_notes:'Every month'}
];
let meetings=statedMeetings(lodges,sunday.from,sunday.through);
assert.deepEqual(meetings.map(x=>x.lodge_name),['Scepter','Golden Compasses Research','Woodbridge','Test Sunday']);
assert.equal(meetings.at(-1).date,'2026-11-08','Following Sunday lodge meetings are included');
assert.equal(statedMeetings(lodges,'2026-12-01','2026-12-08').some(x=>x.lodge_name==='Golden Compasses Research'),false,'Quarterly months must be honored');
assert.equal(statedMeetings(lodges,'2026-11-29','2026-12-06').some(x=>x.lodge_name==='Woodbridge'),true,'Cross-month meeting dates supported');
assert.match(meetingDateLabel('2026-11-08'),/Nov 8/);
const instant=new Date('2026-11-01T11:00:00Z'),stamp=instant.toISOString();
const event=(id,when,status='active')=>({
 id,starts_at:when,status,title:'Event '+id,version:1,google_event_id:status==='active'?'gcal-'+id:null,
 calendar_last_synced_at:stamp,event_mode:'in_person',location_name:'Masonic Hall',location_address:'Main St',hosted_by:'Test Lodge'
});
const events=[
 event('sunday','2026-11-09T07:30:00Z'),
 event('monday','2026-11-09T08:15:00Z'),
 event('newfuture','2026-12-12T19:00:00Z'),
 event('newthisweek','2026-11-03T20:00:00Z'),
 event('oldfuture','2026-12-13T19:00:00Z'),
 event('cancelled','2026-12-15T19:00:00Z','cancelled'),
 event('unpublished','2026-11-05T19:00:00Z')
];
events[6].google_event_id=null;
events[2].title='<img src=x onerror=alert(1)>'; // Must be escaped in email content
const jobs=events.map(x=>({event_id:x.id,event_version:1,status:'succeeded',created_at:stamp}));
const submissions=[
 {request_type:'new',status:'approved',approved_event_id:'newfuture',submitted_at:'2026-10-30T11:00:00Z'},
 {request_type:'new',status:'approved',approved_event_id:'newthisweek',submitted_at:'2026-10-30T11:00:00Z'},
 {request_type:'new',status:'pending',approved_event_id:'oldfuture',submitted_at:'2026-10-31T11:00:00Z'}
];
const flags=[
 {event_id:'newfuture',event_version:1,change_kind:'new',dirty:true},
 {event_id:'newthisweek',event_version:1,change_kind:'new',dirty:true},
 {event_id:'oldfuture',event_version:1,change_kind:'updated',dirty:true},
 {event_id:'cancelled',event_version:1,change_kind:'cancelled',dirty:true}
];
const result=buildWeeklyContent({events,submissions,flags,jobs,lodges,now:instant});
assert.deepEqual(result.groups.upcoming.map(x=>x.id),['newthisweek','sunday']);
assert.deepEqual(result.groups.new.map(x=>x.id),['newfuture']);
assert.deepEqual(result.groups.updated.map(x=>x.id),['oldfuture']);
assert.deepEqual(result.groups.cancelled.map(x=>x.id),['cancelled']);
assert.equal(result.groups.stated.length,4);
assert.equal(result.versions.length,4);
assert.equal(result.items,9,'Distinct events + meetings, not duplicated new events');
assert.ok(!result.htmlContent.includes('<img src=x'),'Untrusted event title may not render HTML');
assert.ok(result.htmlContent.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(result.htmlContent.includes('No additional newly published events')===false);
const noFlags=buildWeeklyContent({events:[events[0]],jobs:[jobs[0]],lodges,now:instant});
assert.equal(noFlags.groups.upcoming.length,1,'Weekly sends an agenda without needing any dirty event flags');
assert.equal(noFlags.versions.length,0);
const backend=fs.readFileSync('supabase/functions/division-newsletter/index.ts','utf8');
assert.ok(backend.includes("if(kind==='weekly')return weeklyIssue(settings)"));
assert.ok(!backend.includes("effectiveKind==='weekly'&&!built.versions.length"),'Weekly should no longer skip when no flags changed');
assert.ok(!backend.includes("&&!(s.monthly_enabled&&p.day===s.monthly_day)"),'Weekly should not be suppressed merely because a monthly digest is scheduled the same day');
assert.ok(backend.includes("html:built.htmlContent")===false,'HTML body must be composed inside the branded template, not sent unbranded');
assert.ok(backend.includes('content:built.htmlContent'),'New weekly HTML must retain Division IV branding');
assert.ok(backend.includes("db.from('lodges')"),'Lodge meetings must be read from directory, not written as calendar events');
assert.ok(backend.includes("db.from('event_requests')"),'New event window must be based on submission date');
console.log('PASS: weekly Pacific/Sunday inclusive window, DST, quarterly stated meetings, published-only events, new-event deduplication and safe HTML.');
