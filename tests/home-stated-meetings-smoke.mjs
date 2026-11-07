#!/usr/bin/env node
/* Fully offline, read-only homepage stated-meeting test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
const js=fs.readFileSync('home-stated-meetings.js','utf8');
const endpoint=fs.readFileSync('supabase/functions/division-stated-meetings/index.ts','utf8');
const upcoming=html.indexOf('id="upcoming-events"'),meeting=html.indexOf('id="stated-meetings"'),overview=html.indexOf('class="division-overview"');
assert.ok(upcoming>=0&&meeting>upcoming&&overview>meeting,'Stated meetings must be directly below Upcoming Events, before the Division overview');
assert.ok(html.includes('id="division-events-title"')&&html.includes('id="home-stated-title"'),
 'Division Events and Stated Meetings must have distinct subsection headings');
assert.ok(html.indexOf('id="division-events-title"')<upcoming,'Division Events heading must precede published event list');
assert.match(html,/id="home-stated-title">Stated Meetings<\/h3>/,'Stated Meetings must be a subordinate heading');
assert.ok(!html.includes('OUR LODGES · REGULAR MEETINGS'),'Stated section should not repeat the calendar kicker');
assert.match(css,/\.home-stated-meetings\{[^}]*background:transparent/,'Stated Meetings must share the tan background');
assert.match(css,/\.home-stated-card\{[^}]*background:#fffdf8/,'Meeting cards should use matching ivory event cards');
assert.match(css,/\.home-stated-info h3\{[^}]*color:#142d46/,'Meeting-card text should be navy on ivory');

for(const id of ['home-stated-week-label','home-stated-prev','home-stated-next','home-stated-meetings-list'])
 assert.ok(html.includes('id="'+id+'"'),'Missing week navigation: '+id);
assert.ok(html.includes('/home-stated-meetings.js?v=1'),'Homepage must load the read-only week browser');
assert.ok(html.includes('/styles.css?v=20'),'Homepage must invalidate previous CSS cache');
for(const marker of ['.home-stated-meetings{','.home-stated-grid{','.home-stated-week-controls{','.home-stated-arrow:disabled{','@media(max-width:520px)'])
 assert.ok(css.includes(marker),'Responsive navy stated-meeting styles missing: '+marker);
assert.ok(css.includes('.upcoming-section{')&&css.includes('.division-overview{')&&css.includes('.home-newsletter{')&&css.includes('.homepage-cta{')&&css.includes('.home-install{'),'Existing alternating tan/navy homepage bands must remain');
assert.ok(endpoint.includes(".from('lodges')")&&endpoint.includes(".eq('active',true)")&&endpoint.includes("if(request.method!=='GET')"),'Endpoint must be read-only active lodge data');
assert.ok(!/\.insert\(|\.update\(|\.delete\(/.test(endpoint),'Endpoint may not modify Supabase records');
assert.ok(!/service_role|apikey|secret|password/i.test(js),'Homepage JS must not contain database credentials');

class MockNode {
 constructor(tag='div'){this.tag=tag;this.children=[];this._text='';this.className='';this.listeners={};this.attributes={};this.disabled=false;}
 get textContent(){return this._text+this.children.map(node=>node.textContent||'').join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this._text='';this.children=[...nodes];}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,handler){this.listeners[name]=handler;}
}
const root=new MockNode(),heading=new MockNode(),back=new MockNode('button'),next=new MockNode('button');
const dom=new Map([
 ['home-stated-meetings-list',root],['home-stated-week-label',heading],
 ['home-stated-prev',back],['home-stated-next',next]
]);
const document={
 getElementById:id=>dom.get(id)||null,
 createElement:tag=>new MockNode(tag),
 createTextNode:value=>({textContent:String(value)})
};
const clock=new Date('2026-11-07T20:00:00Z');
class TestDate extends Date{
 constructor(...args){super(...(args.length?args:[clock.toISOString()]));}
 static now(){return clock.getTime();}
}
const lodges=[
 {name:'Quarterly Lodge',number:'101',district:'402',day:'1st Tue',time:'7:00 PM',notes:'Feb, May, Aug, Nov only',address:'Folsom, CA'},
 {name:'December Only Lodge',number:'102',district:'402',day:'1st Tue',time:'7:00 PM',notes:'Dec only',address:'Folsom, CA'},
 {name:'Next Week Lodge',number:'103',district:'404',day:'2nd Thu',time:'7:30 PM',notes:'Every month',address:'Elk Grove, CA'},
 {name:'Fifth Sunday Lodge',number:'104',district:'404',day:'5th Sun',time:'7:30 PM',notes:'Every month',address:'Sacramento, CA'}
];
const context={document,Date:TestDate,Intl,AbortController,
 setTimeout:()=>1,clearTimeout:()=>{},
 fetch:async()=>({ok:true,json:async()=>({lodges})})};
new vm.Script(js,{filename:'home-stated-meetings.js'}).runInNewContext(context);
await new Promise(resolve=>setImmediate(resolve));
const listed=()=>root.textContent;
assert.ok(heading.textContent.includes('Nov 1')&&heading.textContent.includes('Nov 7'),'Saturday must show current Sunday–Saturday week in Pacific Time');
assert.equal(back.disabled,true,'Backward arrow disabled on initial current week');
assert.match(listed(),/Quarterly Lodge No. 101/,'November quarterly meeting must appear');
assert.doesNotMatch(listed(),/December Only/,'Other quarterly months must not appear');
assert.doesNotMatch(listed(),/Next Week Lodge/,'Next-week meetings must not appear before forward navigation');
next.listeners.click();
assert.match(heading.textContent,/Nov 8.*Nov 14/,'Forward arrow must move exactly one Sunday–Saturday week');
assert.match(listed(),/Next Week Lodge/);
back.listeners.click();
assert.match(heading.textContent,/Nov 1.*Nov 7/,'Back arrow must return to the current week');
for(let i=0;i<4;i++)next.listeners.click();
assert.match(heading.textContent,/Nov 29.*Dec 5/,'Week navigation must span month boundaries');
assert.match(listed(),/Fifth Sunday Lodge/,'Fifth-Sunday meeting should appear only in matching months');
console.log('PASS: Sunday–Saturday Pacific week, navigation, monthly/quarterly/fifth-Sunday schedules, safe public API and preserved palette.');
