/* Public homepage stated meetings: Sunday–Saturday in Pacific Time.
   Directory is read-only; these meetings are NOT Google Calendar entries. */
(()=>{
 'use strict';
 const root=document.getElementById('home-stated-meetings-list');
 const heading=document.getElementById('home-stated-week-label');
 const back=document.getElementById('home-stated-prev');
 const next=document.getElementById('home-stated-next');
 if(!root||!heading||!back||!next)return;
 const zone='America/Los_Angeles';
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-stated-meetings';
 const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const dateOf=iso=>new Date(iso+'T12:00:00Z');
 const isoOf=date=>date.toISOString().slice(0,10);
 const addDays=(iso,count)=>{const date=dateOf(iso);date.setUTCDate(date.getUTCDate()+count);return isoOf(date);};
 const pacificDate=at=>{
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
   timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(at).map(part=>[part.type,part.value]));
  return fields.year+'-'+fields.month+'-'+fields.day;
 };
 const currentWeek=()=>{const today=pacificDate(new Date());return addDays(today,-dateOf(today).getUTCDay());};
 const weekLabel=(start,end)=>{
  const year=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',year:'numeric'}).format(dateOf(end));
  const fmt=iso=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'}).format(dateOf(iso));
  return fmt(start)+' – '+fmt(end)+', '+year;
 };
 const clock=value=>{
  const m=String(value||'').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!m)return '99:99';
  return String((Number(m[1])%12)+(m[3].toUpperCase()==='PM'?12:0)).padStart(2,'0')+':'+m[2];
 };
 const matchesMonth=(notes,month)=>{
  if(!/\bonly\b/i.test(notes))return true;
  const included=months.map((name,i)=>new RegExp('\\b'+name+'\\b','i').test(notes)?i:-1).filter(i=>i!==-1);
  return included.includes(month);
 };
 const matchesSchedule=(lodge,date)=>{
  const m=String(lodge.day||'').match(/^(\d)(?:st|nd|rd|th)\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/i);
  if(!m)return false;
  return Number(m[1])===Math.floor((date.getUTCDate()-1)/7)+1
    &&m[2].toLowerCase()===weekdays[date.getUTCDay()].toLowerCase()
    &&matchesMonth(String(lodge.notes||''),date.getUTCMonth());
 };
 function meetingsForWeek(start,lodges){
  const items=[];
  for(let i=0;i<7;i++){
   const iso=addDays(start,i),date=dateOf(iso);
   for(const lodge of lodges){
    if(matchesSchedule(lodge,date))items.push({iso,date,lodge});
   }
  }
  return items.sort((a,b)=>a.iso.localeCompare(b.iso)
   ||clock(a.lodge.time).localeCompare(clock(b.lodge.time))
   ||String(a.lodge.name||'').localeCompare(String(b.lodge.name||'')));
 }
 const el=(tag,className,value)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=value;
  return node;
 };
 function meetingCard({date,lodge}){
  const item=el('article','home-stated-card');
  const badge=el('div','home-stated-date');
  badge.append(el('span','home-stated-month',months[date.getUTCMonth()].toUpperCase()),
   el('strong','home-stated-day',String(date.getUTCDate())),
   el('span','home-stated-weekday',weekdays[date.getUTCDay()]));
  const info=el('div','home-stated-info');
  const title=String(lodge.name||'Lodge')+(lodge.number?' No. '+lodge.number:'');
  info.append(el('h3','',title));
  const time=el('p','home-stated-meta',String(lodge.time||'Time to be confirmed'));
  if(lodge.district)time.append(document.createTextNode(' · District '+lodge.district));
  info.append(time);
  if(lodge.address)info.append(el('p','home-stated-meta home-stated-address',lodge.address));
  item.append(badge,info);
  return item;
 }
 let lodges=[],offset=0,loaded=false;
 function status(text,isError=false){
  root.replaceChildren(el('p','home-stated-empty'+(isError?' is-error':''),text));
  root.setAttribute('aria-busy','false');
 }
 function render(){
  const start=addDays(currentWeek(),offset*7),end=addDays(start,6);
  heading.textContent=weekLabel(start,end);
  back.disabled=offset===0;back.setAttribute('aria-label','Previous week');
  next.disabled=offset>=52;next.setAttribute('aria-label','Next week');
  if(!loaded)return;
  const items=meetingsForWeek(start,lodges);
  if(!items.length){status('No regular stated meetings listed for this week.');return;}
  const grid=el('div','home-stated-grid');
  for(const item of items)grid.append(meetingCard(item));
  root.replaceChildren(grid);
  root.setAttribute('aria-busy','false');
 }
 back.addEventListener('click',()=>{if(offset>0){offset--;render();}});
 next.addEventListener('click',()=>{if(offset<52){offset++;render();}});
 render();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 fetch(endpoint,{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'})
  .then(async response=>{if(!response.ok)throw Error('Unable to fetch the lodge directory');return response.json();})
  .then(payload=>{
   if(!Array.isArray(payload.lodges))throw Error('Invalid directory response');
   lodges=payload.lodges.filter(lodge=>lodge&&typeof lodge==='object'&&lodge.name&&lodge.day);
   loaded=true;render();
  })
  .catch(()=>{
   loaded=true;status('Stated meeting schedules are temporarily unavailable. Please use the Lodge Directory.',true);
  })
  .finally(()=>clearTimeout(timer));
})();
