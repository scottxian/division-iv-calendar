/* Pure Pacific-date and lodge-meeting helpers for the weekly digest.
   No database, email, or calendar mutations. */
const week=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function pacificDate(input) {
 const date=input instanceof Date ? input : new Date(input);
 if(!Number.isFinite(date.getTime()))throw Error('Invalid Pacific date');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date).map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
export function addDays(date,days) {
 const value=new Date(date+'T12:00:00Z');
 if(!Number.isFinite(value.getTime()))throw Error('Invalid date');
 value.setUTCDate(value.getUTCDate()+days);
 return value.toISOString().slice(0,10);
}
export function weeklyWindow(sent=new Date()) {
 const from=pacificDate(sent);
 const weekday=new Date(from+'T12:00:00Z').getUTCDay();
 const through=addDays(from,weekday===0?7:7-weekday);
 // Database boundaries have a one-day timezone margin; compare using
 // Pacific calendar dates afterwards, including DST transition days.
 return {from,through,
  queryFrom:addDays(from,-1)+'T00:00:00Z',
  queryUntil:addDays(through,2)+'T00:00:00Z'};
}
export function withinPacificDates(instant,from,through) {
 const date=pacificDate(instant);
 return date>=from&&date<=through;
}
function meetingClock(value) {
 const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
 if(!match)return String(value||'');
 return String((Number(match[1])%12)+(match[3].toUpperCase()==='PM'?12:0)).padStart(2,'0')+':'+match[2];
}
export function statedMeetings(lodges,from,through) {
 const meetings=[];
 for(let day=from;day<=through;day=addDays(day,1)){
  const date=new Date(day+'T12:00:00Z');
  const weekday=week[date.getUTCDay()];
  const month=date.getUTCMonth();
  const nth=Math.floor((date.getUTCDate()-1)/7)+1;
  for(const lodge of lodges||[]){
   if(!lodge.active)continue;
   const match=String(lodge.meeting_day||'').trim().match(/^(\d)(?:st|nd|rd|th)\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/i);
   if(!match||Number(match[1])!==nth||match[2].toLowerCase()!==weekday.toLowerCase())continue;
   const notes=String(lodge.meeting_notes||'');
   if(/\bonly\b/i.test(notes)){
    const allowed=months.map((abbr,i)=>new RegExp('\\b'+abbr+'\\b','i').test(notes)?i:-1).filter(i=>i>=0);
    if(!allowed.includes(month))continue;
   }
   const name=String(lodge.lodge_name||'').trim();
   const number=String(lodge.lodge_number||'').trim();
   meetings.push({
    title:name+(number?' Lodge No. '+number:'')+' — Stated Meeting',
    lodge_name:name, lodge_number:number,date:day,
    time:String(lodge.meeting_time||'').trim(),
    location:[lodge.address_line1,lodge.city,lodge.state].filter(Boolean).join(', '),
    notes
   });
  }
 }
 return meetings.sort((a,b)=>a.date.localeCompare(b.date)||meetingClock(a.time).localeCompare(meetingClock(b.time))||a.title.localeCompare(b.title));
}
export function meetingDateLabel(day) {
 return new Intl.DateTimeFormat('en-US',{
  timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'
 }).format(new Date(day+'T12:00:00Z'));
}
