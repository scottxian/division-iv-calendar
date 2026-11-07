/* Shared homepage personal-calendar choices for published events and stated meetings.
   Reuses the public, read-only Google and RFC 5545 exports from event-calendar.js. */
(function(root){
 'use strict';
 const exports=root.divisionEventCalendar;
 if(!exports)return;
 function create(event){
  if(!event||!event.starts_at||!event.ends_at)return null;
  const details=document.createElement('details');
  details.className='home-calendar-actions';
  const summary=document.createElement('summary');
  summary.textContent='Add to Calendar';
  summary.setAttribute('aria-label','Add '+String(event.title||'this event')+' to your personal calendar');
  const choices=document.createElement('div');
  choices.className='home-calendar-choices';
  const google=document.createElement('a');
  google.className='home-calendar-option';
  google.textContent='Google Calendar ↗';
  google.href=exports.googleLink(event);
  google.target='_blank';
  google.rel='noopener noreferrer';
  const apple=document.createElement('a');
  apple.className='home-calendar-option';
  apple.textContent='Apple / iPhone (.ics)';
  apple.href='#';
  apple.setAttribute('aria-label','Download '+String(event.title||'this event')+' for Apple or iPhone Calendar');
  apple.addEventListener('click',function(click){
   click.preventDefault();
   // iPhone/Safari can download an .ics file for opening in Calendar.
   const content=exports.icsContent(event);
   const blob=new Blob([content],{type:'text/calendar;charset=utf-8'});
   const url=URL.createObjectURL(blob);
   const name=(event.stated_meeting?'stated-meeting-':'division-iv-event-')
    +String(event.id||'event').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,85)+'.ics';
   const download=document.createElement('a');
   download.href=url;
   download.download=name;
   download.style.display='none';
   document.body.append(download);
   download.click();
   download.remove();
   details.open=false;
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  const tip=document.createElement('p');
  tip.className='home-calendar-tip';
  tip.textContent='Open the downloaded .ics file to add it on iPhone. Saved copies do not update automatically.';
  choices.append(google,apple,tip);
  details.append(summary,choices);
  google.addEventListener('click',()=>{details.open=false;});
  return details;
 }
 // Close a menu when the visitor clicks elsewhere, without accumulating
 // document-level listeners each time weekly meeting cards are re-rendered.
 document.addEventListener('click',event=>{
  if(event.target.closest('.home-calendar-actions'))return;
  document.querySelectorAll('.home-calendar-actions[open]').forEach(menu=>{menu.open=false;});
 });
 root.divisionHomeCalendarActions=Object.freeze({create});
})(window);
