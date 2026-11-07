/* Build personal calendar copies from the public Division IV event feed. */
(function(root){
 'use strict';
 const zone='America/Los_Angeles';
 const txt=value=>String(value??'').trim();
 const utc=value=>{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw Error('Invalid published event date');
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 };
 const eventUrl=e=>e.stated_meeting===true?'https://divisionivmasons.org/lodges/':
  'https://divisionivmasons.org/calendar/?event='+encodeURIComponent(e.id)+'#events-list';
 const venue=e=>{
  if(e.event_mode==='online')return 'Online event';
  if(e.location_tbd)return 'Location TBD';
  return [txt(e.location_name),txt(e.location_address)].filter(Boolean).join(', ');
 };
 const notes=e=>[
  txt(e.public_description),
  e.hosted_by?'Hosted by: '+txt(e.hosted_by):'',
  e.district?'District: '+txt(e.district):'',
  e.invited_audience?'Attendees: '+txt(e.invited_audience):'',
  e.attire?'Attire: '+txt(e.attire):'',
  (e.stated_meeting===true?'Meeting schedule and updates: ':'Current event details: ')+eventUrl(e)
 ].filter(Boolean).join('\n\n');
 function googleLink(e){
  const u=new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action','TEMPLATE');
  u.searchParams.set('text',txt(e.title)||'Division IV Event');
  u.searchParams.set('dates',utc(e.starts_at)+'/'+utc(e.ends_at));
  u.searchParams.set('details',notes(e));
  if(venue(e))u.searchParams.set('location',venue(e));
  u.searchParams.set('ctz',zone);
  return u.href;
 }
 function icalEscape(value){
  return txt(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n')
   .replace(/;/g,'\\;').replace(/,/g,'\\,');
 }
 // RFC 5545: 75-byte UTF-8 lines, folded only between characters.
 function fold(line){
  const enc=new TextEncoder();
  let out='',length=0;
  for(const ch of line){
   const size=enc.encode(ch).length;
   if(length+size>75){out+='\r\n ';length=1;}
   out+=ch;length+=size;
  }
  return out;
 }
 function icsContent(e){
  const where=venue(e);
  const lines=[
   'BEGIN:VCALENDAR','VERSION:2.0',
   'PRODID:-//Division IV Masons//Public Events//EN',
   'CALSCALE:GREGORIAN','METHOD:PUBLISH',
   'BEGIN:VEVENT',
   'UID:'+txt(e.id)+'@divisionivmasons.org',
   'DTSTAMP:'+utc(new Date()),
   'DTSTART:'+utc(e.starts_at),
   'DTEND:'+utc(e.ends_at),
   'SUMMARY:'+icalEscape(e.title||'Division IV Event'),
   'DESCRIPTION:'+icalEscape(notes(e)),
   ...(where?['LOCATION:'+icalEscape(where)]:[]),
   'URL:'+eventUrl(e),
   'END:VEVENT','END:VCALENDAR'
  ];
  return lines.map(fold).join('\r\n')+'\r\n';
 }
 root.divisionEventCalendar=Object.freeze({googleLink,icsContent});
})(window);
