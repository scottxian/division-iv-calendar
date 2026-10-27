/* Homepage preview of approved, Google Calendar-synchronized Division IV events. */
(()=>{
  const root=document.getElementById('upcoming-events');
  if(!root)return;
  const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-upcoming-events';
  const zone='America/Los_Angeles';
  const maxVisible=4;
  const dateParts=(date, options)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,...options}).format(date);
  function showStatus(message, failed=false){
    root.replaceChildren();
    const p=document.createElement('p');
    p.className='upcoming-status'+(failed?' is-error':'');
    p.textContent=message;
    root.append(p);
    root.setAttribute('aria-busy','false');
  }
  function line(text){
    const p=document.createElement('p');
    p.className='upcoming-meta';
    p.textContent=text;
    return p;
  }
  function card(event){
    const start=new Date(event.starts_at);
    if(!Number.isFinite(start.getTime()))return null;
    const article=document.createElement('article');
    article.className='upcoming-card';
    const date=document.createElement('div');
    date.className='upcoming-date';
    const month=document.createElement('span');
    month.className='upcoming-month';
    month.textContent=dateParts(start,{month:'short'}).toUpperCase();
    const day=document.createElement('strong');
    day.className='upcoming-day';
    day.textContent=dateParts(start,{day:'numeric'});
    const weekday=document.createElement('span');
    weekday.className='upcoming-weekday';
    weekday.textContent=dateParts(start,{weekday:'short'});
    date.append(month,day,weekday);
    const info=document.createElement('div');
    info.className='upcoming-details';
    const title=document.createElement('h3');
    title.textContent=String(event.title||'Division IV Event');
    const hostName=String(event.hosted_by||'').trim();
    const hostedBy=hostName?line('Hosted by '+hostName):null;
    if(hostedBy)hostedBy.classList.add('upcoming-host');
    const timing=line('Time: '+dateParts(start,{hour:'numeric',minute:'2-digit',hour12:true})+' Pacific');
    timing.classList.add('upcoming-time');
    const location=event.event_mode==='online'?'Online event':
      event.location_tbd?'Location to be announced':
      event.location_name||'Location to be announced';
    const where=line(event.event_mode==='hybrid'?location+' · Online option':location);
    where.classList.add('upcoming-location');
    const link=document.createElement('a');
    link.href='/calendar/';
    link.className='upcoming-card-link';
    link.textContent='View calendar ↗';
    link.setAttribute('aria-label','View the Division IV calendar for '+title.textContent);
    info.append(title);
    if(hostedBy)info.append(hostedBy);
    info.append(timing,where,link);
    article.append(date,info);
    return article;
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  fetch(endpoint,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'})
    .then(async response=>{
      if(!response.ok)throw Error('Event service unavailable');
      return response.json();
    })
    .then(payload=>{
      const items=Array.isArray(payload.events)?payload.events:[];
      const now=Date.now();
      const upcoming=items.filter(item=>Number.isFinite(Date.parse(item.ends_at))&&Date.parse(item.ends_at)>now).slice(0,maxVisible);
      if(!upcoming.length){
        showStatus('No upcoming published events are listed right now. Please check the full calendar.');
        return;
      }
      const grid=document.createElement('div');
      grid.className='upcoming-grid';
      for(const item of upcoming){
        const el=card(item);
        if(el)grid.append(el);
      }
      if(!grid.children.length){showStatus('Upcoming event details are unavailable. Please check the full calendar.');return;}
      root.replaceChildren(grid);
      root.setAttribute('aria-busy','false');
    })
    .catch(()=>{
      showStatus('The event list is temporarily unavailable. Please use the full Division IV calendar.',true);
    })
    .finally(()=>clearTimeout(timeout));
})();
