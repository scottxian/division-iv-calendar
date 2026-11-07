#!/usr/bin/env node
/** Unit tests for one-event Google and RFC 5545 .ics exports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('event-calendar.js','utf8');
const window={};
vm.runInNewContext(source,{window,Date,URL,TextEncoder,encodeURIComponent});
const {googleLink,icsContent}=window.divisionEventCalendar;
assert.equal(typeof googleLink,'function');
assert.equal(typeof icsContent,'function');
const event={
 id:'11111111-1111-4111-8111-111111111111',
 title:'Sample Degree, Fellowship; 你好',
 starts_at:'2026-11-07T17:00:00Z',ends_at:'2026-11-07T20:00:00Z',
 event_mode:'in_person',location_name:'Scepter Lodge No. 143',
 location_address:'3260 Jefferson Blvd, West Sacramento, CA 95691',
 hosted_by:'Scepter Lodge No. 143',district:'428',
 public_description:'Practice the degree;\nEveryone welcome. Long Unicode ✨ '.repeat(6),
 invited_audience:'Master Masons',attire:'Dark Suit'
};
const g=new URL(googleLink(event));
assert.equal(g.hostname,'calendar.google.com');
assert.equal(g.pathname,'/calendar/render');
assert.equal(g.searchParams.get('action'),'TEMPLATE');
assert.equal(g.searchParams.get('dates'),'20261107T170000Z/20261107T200000Z');
assert.equal(g.searchParams.get('text'),event.title);
assert.equal(g.searchParams.get('ctz'),'America/Los_Angeles');
assert.match(g.searchParams.get('location'),/3260 Jefferson Blvd/);
assert.match(g.searchParams.get('details'),/Hosted by: Scepter Lodge/);
assert.match(g.searchParams.get('details'),/Current event details: https:/);

// A one-off stated-meeting calendar copy must link to the Lodge Directory, never a missing calendar event.
const stated={...event,id:'stated-101-2026-11-03',stated_meeting:true,
 title:'Quarterly Lodge No. 101 — Stated Meeting',
 starts_at:'2026-11-04T03:00:00.000Z',ends_at:'2026-11-04T05:00:00.000Z',
 public_description:'Estimated two-hour duration; confirm with lodge.'};
const statedUrl=new URL(googleLink(stated));
assert.equal(statedUrl.searchParams.get('dates'),'20261104T030000Z/20261104T050000Z');
assert.match(statedUrl.searchParams.get('details'),/Meeting schedule and updates: https:\/\/divisionivmasons.org\/lodges\//);
assert.match(statedUrl.searchParams.get('details'),/Estimated two-hour duration/);
const statedIcs=icsContent(stated);
assert.match(statedIcs,/UID:stated-101-2026-11-03@divisionivmasons.org/);
assert.match(statedIcs,/URL:https:\/\/divisionivmasons.org\/lodges\//);
assert.ok(!statedIcs.includes('RRULE:'),'Stated meetings must be one-off imports, not automatic recurring events');

const ics=icsContent(event);
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
const unfolded=ics.replace(/\r\n[ \t]/g,'');
assert.match(unfolded,/BEGIN:VEVENT\r\n/);
assert.match(unfolded,/DTSTART:20261107T170000Z\r\n/);
assert.match(unfolded,/DTEND:20261107T200000Z\r\n/);
assert.match(unfolded,/UID:11111111-1111-4111-8111-111111111111@divisionivmasons\.org/);
assert.ok(unfolded.includes('SUMMARY:Sample Degree\\, Fellowship\\; 你好'));
assert.ok(unfolded.includes('DESCRIPTION:Practice the degree\\;\\nEveryone welcome.'));
assert.ok(unfolded.includes('LOCATION:Scepter Lodge No. 143\\, 3260 Jefferson Blvd\\, West Sacramento\\, CA 95691'));
assert.ok(unfolded.includes('URL:https://divisionivmasons.org/calendar/?event=11111111-1111-4111-8111-111111111111#events-list'));
assert.ok(ics.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75),'RFC 5545 lines must fold at 75 octets');
assert.equal(ics.replace(/\r\n/g,'').includes('\n'),false,'Lines must end with CRLF');
assert.ok(!icsContent({...event,event_mode:'online',location_address:'private-address'}).includes('private-address'),'Online events should not claim a physical venue');
assert.ok(icsContent({...event,location_tbd:true}).includes('LOCATION:Location TBD'),'TBD should not use a stale address');
const html=fs.readFileSync('calendar/index.html','utf8');
const browser=fs.readFileSync('month-calendar.js','utf8');
assert.ok(html.includes('src="/event-calendar.js?v=1"')&&html.includes('src="/month-calendar.js?v=2"'));
assert.ok(html.indexOf('src="/event-calendar.js?v=1"')<html.indexOf('src="/month-calendar.js?v=2"'));
assert.ok(browser.includes('new Blob([exports.icsContent(e)]'),'Download must use selected event');
assert.ok(browser.includes('google.href=exports.googleLink(e)'),'Google must receive the selected event');
assert.ok(browser.includes('A saved copy will not update automatically'));
assert.ok(!source.includes('service_role'),'Public export must not need privileged access');
console.log('PASS: individual Google, Apple/Outlook export, timezone, escaping, public fields, and Unicode folding.');
