/* The weekly newsletter's read-only selection and HTML body.
   Each group is intentionally independent of the monthly change-flag digest. */
import {weeklyWindow,withinPacificDates,statedMeetings,meetingDateLabel} from './weekly-agenda.mjs';
const txt=value=>String(value??'').trim();
const esc=value=>txt(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=instant=>new Intl.DateTimeFormat('en-US',{
 timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'
}).format(new Date(instant));
const eventUrl=id=>'https://divisionivmasons.org/calendar/?event='+encodeURIComponent(id)+'#events-list';
const table=items=>'<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">'+items.join('')+'</table>';
const heading=(title,items,empty)=>'<h2 style="color:#0b2138;font-family:Georgia,Times New Roman,serif;font-size:21px;font-weight:normal;margin:28px 0 10px">'+esc(title)+'</h2>'+
 (items.length?table(items):'<p style="color:#667483;font-size:14px;line-height:1.7">'+esc(empty)+'</p>');
function eventRow(event,badge=''){
 const where=event.event_mode==='online'?'Online event':event.location_tbd?'Location TBD':[event.location_name,event.location_address].filter(Boolean).join(', ');
 return '<tr><td style="padding:16px 0;border-bottom:1px solid #e3dfd5">'+
  '<p style="margin:0 0 5px;color:#0b2138;font-size:16px;line-height:1.5;font-weight:700">'+esc(event.title)+(badge?' <span style="color:#8a642b;font-size:12px">'+esc(badge)+'</span>':'')+'</p>'+
  '<p style="margin:0 0 4px;color:#33475b;font-size:14px;line-height:1.65">'+esc(pretty(event.starts_at)+' (Pacific Time)')+'</p>'+
  (where?'<p style="margin:0 0 4px;color:#33475b;font-size:14px;line-height:1.65">'+esc(where)+'</p>':'')+
  (event.hosted_by?'<p style="margin:0 0 5px;color:#5e6c79;font-size:13px;line-height:1.6">Host: '+esc(event.hosted_by)+'</p>':'')+
  '<a href="'+esc(eventUrl(event.id))+'" style="font-size:13px;line-height:1.6;font-weight:700;color:#234e77;text-decoration:underline">View event details</a></td></tr>';
}
function meetingRow(meeting) {
 return '<tr><td style="padding:16px 0;border-bottom:1px solid #e3dfd5">'+
  '<p style="margin:0 0 5px;color:#0b2138;font-size:16px;line-height:1.5;font-weight:700">'+esc(meeting.title)+'</p>'+
  '<p style="margin:0 0 4px;color:#33475b;font-size:14px;line-height:1.65">'+esc(meetingDateLabel(meeting.date)+' at '+meeting.time+' (Pacific Time)')+'</p>'+
  (meeting.location?'<p style="margin:0 0 4px;color:#33475b;font-size:14px;line-height:1.65">'+esc(meeting.location)+'</p>':'')+
  '</td></tr>';
}
export function buildWeeklyContent({events=[],submissions=[],flags=[],jobs=[],lodges=[],now=new Date()}) {
 const window=weeklyWindow(now);
 const since=new Date(new Date(now).getTime()-7*86400000).toISOString();
 const firstJobs=new Map();
 for(const job of jobs)if(!firstJobs.has(job.event_id))firstJobs.set(job.event_id,job);
 const changes=new Map(flags.filter(f=>f.dirty).map(f=>[f.event_id,f]));
 const newIds=new Set(submissions.filter(s=>s.request_type==='new'&&s.status==='approved'&&s.submitted_at>=since&&s.approved_event_id).map(s=>s.approved_event_id));
 const active=[],cancelled=[];
 for(const e of events){
  const job=firstJobs.get(e.id);
  if(job?.status!=='succeeded'||job.event_version!==e.version||!e.calendar_last_synced_at)continue;
  if(e.status==='active'&&e.google_event_id)active.push(e);
  if(e.status==='cancelled')cancelled.push(e);
 }
 const order=(a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||txt(a.title).localeCompare(txt(b.title));
 active.sort(order);
 cancelled.sort(order);
 const groups={upcoming:[],stated:statedMeetings(lodges,window.from,window.through),new:[],updated:[],cancelled:[]};
 const included=new Set();
 for(const e of active){
  if(withinPacificDates(e.starts_at,window.from,window.through)){
   groups.upcoming.push(e);included.add(e.id);
  }
 }
 for(const e of active){
  if(newIds.has(e.id)&&!included.has(e.id)){
   groups.new.push(e);included.add(e.id);
  }
 }
 for(const e of active){
  if(changes.has(e.id)&&!included.has(e.id)){
   groups.updated.push(e);included.add(e.id);
  }
 }
 for(const e of cancelled){
  if(changes.get(e.id)?.change_kind==='cancelled'){
   groups.cancelled.push(e);included.add(e.id);
  }
 }
 const versions=[...included].filter(id=>changes.has(id)).map(id=>({id,version:changes.get(id).event_version}));
 const range=meetingDateLabel(window.from)+' – '+meetingDateLabel(window.through);
 const htmlContent='<p style="color:#5e6c79;font-size:14px;line-height:1.7">Week ahead: '+esc(range)+'. Meetings are taken from the Lodge Directory; confirm with the lodge before attending.</p>'+
  heading('Upcoming Events — Through Sunday',groups.upcoming.map(e=>eventRow(e,newIds.has(e.id)?'NEW':'')),'No published events scheduled in this period.')+
  heading('Lodge Stated Meetings',groups.stated.map(meetingRow),'No regular stated meetings are listed for this period.')+
  heading('Newly Added Events — Past 7 Days',groups.new.map(e=>eventRow(e,'NEW')),'No additional newly published events. Events already appearing above are not repeated.')+
  (groups.updated.length?heading('Other Updated Events',groups.updated.map(e=>eventRow(e,'UPDATED')),''):'')+
  (groups.cancelled.length?heading('Cancelled Events',groups.cancelled.map(e=>eventRow(e,'CANCELLED')),''):'');
 const descriptions=[
  'Upcoming Events ('+range+')',
  ...groups.upcoming.map(e=>e.title+' — '+pretty(e.starts_at)+' — '+eventUrl(e.id)),
  'Stated Meetings ('+range+')',
  ...groups.stated.map(m=>m.title+' — '+meetingDateLabel(m.date)+' at '+m.time+' — '+m.location),
  'Newly Added Events (past 7 days)',
  ...groups.new.map(e=>e.title+' — '+pretty(e.starts_at)+' — '+eventUrl(e.id)),
  ...((groups.updated.length)?['Other Updated Events',...groups.updated.map(e=>e.title+' — '+eventUrl(e.id))]:[]),
  ...((groups.cancelled.length)?['Cancelled Events',...groups.cancelled.map(e=>e.title+' — '+eventUrl(e.id))]:[]),
  'Stated meetings can change; confirm with the lodge before attending.'
 ];
 return {window,groups,versions,htmlContent,textBody:descriptions.join('\n\n'),items:included.size+groups.stated.length,range};
}
