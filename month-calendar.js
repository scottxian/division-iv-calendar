/* Division IV calendar: monthly grid + published event timeline.
   Public-only event fields come from the existing read-only Supabase function. */
(()=>{
  const root=document.getElementById('month-days');
  if(!root)return;
  const api='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-upcoming-events';
  const zone='America/Los_Angeles';
  const $=id=>document.getElementById(id);
  const monthPicker=$('month-picker'),title=$('month-browser-heading');
  const list=$('month-event-list'),message=$('month-events-message'),summary=$('month-list-summary');
  const category=$('month-category-filter'),lodge=$('month-lodge-filter'),district=$('month-district-filter');
  const reset=$('month-reset-filters'),clearDay=$('month-clear-day'),dialog=$('public-event-dialog'),detail=$('public-event-detail');
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const validMonth=/^20[2-3][0-9]-(0[1-9]|1[0-2])$/;
  const dtf=(options)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,...options});
  const getParts=(iso)=>{
    const parts=dtf({year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
    const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
    return {month:p.year+'-'+p.month,day:p.year+'-'+p.month+'-'+p.day};
  };
  const format=(iso,opt)=>dtf(opt).format(new Date(iso));
  const fullMonth=(month)=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'})
    .format(new Date(month+'-01T12:00:00Z'));
  const shortMonth=(month)=>new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'})
    .format(new Date(month+'-01T12:00:00Z')).toUpperCase();
  const dateTime=iso=>format(iso,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
  const time=iso=>format(iso,{hour:'numeric',minute:'2-digit',hour12:true});
  const venue=e=>e.event_mode==='online'?'Online event':e.location_tbd?'Location to be announced':e.location_name||'Location to be announced';
  const make=(tag,cls,content)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(content!==undefined)x.textContent=String(content);return x;};
  const params=new URL(location.href).searchParams;
  const current= getParts(new Date().toISOString()).month;
  let month=validMonth.test(params.get('month')||'')?params.get('month'):current;
  let events=[],selectedDay=null,loadingRequest=0;
  const monthEvents=()=>events.filter(e=>(!category.value||e.event_type===category.value)&&
    (!lodge.value||e.hosted_by===lodge.value)&&(!district.value||e.district===district.value));
  function options(select,values,placeholder){
    const previous=select.value;
    select.replaceChildren(new Option(placeholder,''));
    for(const name of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b)))select.add(new Option(name,name));
    if([...select.options].some(x=>x.value===previous))select.value=previous;
  }
  function setUrl(replace=true){
    const u=new URL(location.href);
    u.searchParams.set('month',month);
    const to=u.pathname+u.search+u.hash;
    if(replace)history.replaceState(null,'',to);else history.pushState(null,'',to);
  }
  function renderGrid(){
    const [year,m]=month.split('-').map(Number);
    const dayOne=new Date(Date.UTC(year,m-1,1));
    const offset=dayOne.getUTCDay(),days=new Date(Date.UTC(year,m,0)).getUTCDate();
    const slots=Math.ceil((offset+days)/7)*7;
    const counts=new Map();
    for(const e of monthEvents()){
      const day=getParts(e.starts_at).day;
      counts.set(day,(counts.get(day)||0)+1);
    }
    root.replaceChildren();
    for(let cell=0;cell<slots;cell++){
      const num=cell-offset+1;
      if(num<1||num>days){
        const blank=make('span','month-blank');blank.setAttribute('aria-hidden','true');root.append(blank);continue;
      }
      const iso=month+'-'+String(num).padStart(2,'0');
      const count=counts.get(iso)||0;
      const btn=make('button','month-date');
      btn.type='button';btn.dataset.date=iso;
      btn.setAttribute('aria-pressed',String(selectedDay===iso));
      btn.setAttribute('aria-label',new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(iso+'T12:00:00Z'))+', '+count+' '+(count===1?'event':'events'));
      btn.append(make('span','month-date-number',num));
      if(count){
        btn.classList.add('has-events');
        btn.append(make('span','month-date-mark'));
        const titles=monthEvents().filter(e=>getParts(e.starts_at).day===iso).map(e=>e.title);
        btn.title=titles.slice(0,3).join(' • ')+(titles.length>3?' +'+(titles.length-3)+' more':'');
      }
      if(selectedDay===iso)btn.classList.add('selected');
      if(getParts(new Date().toISOString()).day===iso)btn.classList.add('today');
      btn.addEventListener('click',()=>{selectedDay=selectedDay===iso?null:iso;renderAll();});
      root.append(btn);
    }
  }
  function eventRow(e){
    const row=make('button','month-event-row');row.type='button';
    row.setAttribute('aria-label','View '+e.title+', '+dateTime(e.starts_at));
    const day=make('span','month-event-date');
    day.append(make('span','month-event-mon',format(e.starts_at,{month:'short'}).toUpperCase()),
      make('strong','month-event-num',format(e.starts_at,{day:'2-digit'})));
    const body=make('span','month-event-content');
    const name=make('span','month-event-name',e.title||'Division IV Event');
    const details=make('span','month-event-meta');
    details.append(make('span','month-event-time','◷ '+time(e.starts_at)),make('span','month-event-location','⌖ '+venue(e)));
    body.append(name,details);
    if(e.hosted_by)body.append(make('span','month-event-host','Hosted by '+e.hosted_by));
    const badge=make('span','month-event-badge','Published');
    row.append(day,body,badge);
    row.addEventListener('click',()=>openEvent(e.id,true));
    return row;
  }
  function renderList(){
    title.textContent=fullMonth(month);
    const matched=monthEvents().filter(e=>!selectedDay||getParts(e.starts_at).day===selectedDay);
    matched.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
    summary.textContent=selectedDay
      ? matched.length+' '+(matched.length===1?'event':'events')+' on '+format(selectedDay+'T12:00:00Z',{month:'long',day:'numeric',timeZone:'UTC'})
      : matched.length+' published '+(matched.length===1?'event':'events')+' this month';
    list.replaceChildren();
    if(!matched.length){
      list.append(make('p','month-events-empty',selectedDay
        ? 'No published events match this date and the selected filters. Select another date or show all days.'
        : 'No published events match this month and the selected filters.'));
      return;
    }
    for(const e of matched)list.append(eventRow(e));
  }
  function renderAll(){
    monthPicker.value=month;
    clearDay.hidden=!selectedDay;
    renderGrid();renderList();
  }
  function addDetail(label,value){
    if(value===null||value===undefined||value==='')return;
    const p=make('p','public-event-detail-line');
    p.append(make('strong','',label+': '),document.createTextNode(String(value)));
    detail.append(p);
  }
  function openEvent(id,navigate){
    const e=events.find(x=>x.id===id);
    if(!e){
      message.textContent='That event is not listed as published in this month.';
      return;
    }
    detail.replaceChildren(make('p','public-event-type',e.event_type||'Division event'),
      make('h2','',e.title||'Division IV Event'));
    addDetail('Date and time',dateTime(e.starts_at)+' Pacific');
    addDetail('Ends',dateTime(e.ends_at)+' Pacific');
    addDetail('Hosted by',e.hosted_by);
    addDetail('District',e.district);
    addDetail('Location',venue(e));
    if(e.event_mode==='hybrid')addDetail('Attendance','In person and online');
    if(e.event_mode!=='online'&&!e.location_tbd)addDetail('Address',e.location_address);
    addDetail('Audience',e.invited_audience);addDetail('Attire',e.attire);
    if(e.public_description){
      const p=make('p','public-event-description',e.public_description);
      p.style.whiteSpace='pre-wrap';detail.append(p);
    }
    const actions=make('div','public-event-detail-actions');
    const google=make('a','btn navy','Open Google Calendar ↗');
    google.href=$('calendar-external-link')?.href||'https://calendar.google.com/calendar/';
    google.target='_blank';google.rel='noopener noreferrer';
    actions.append(google);detail.append(actions);
    if(navigate){
      const u=new URL(location.href);
      u.searchParams.set('month',month);u.searchParams.set('event',id);
      history.pushState(null,'',u.pathname+u.search+u.hash);
    }
    if(!dialog.open)dialog.showModal();
  }
  function closeDetail(){
    const u=new URL(location.href);
    if(u.searchParams.has('event')){
      u.searchParams.delete('event');
      history.replaceState(null,'',u.pathname+u.search+u.hash);
    }
  }
  $('public-event-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',closeDetail);
  function resetFilters(){
    category.value='';lodge.value='';district.value='';selectedDay=null;renderAll();
  }
  function shiftMonth(n){
    const [y,m]=month.split('-').map(Number);
    const next=new Date(Date.UTC(y,m-1+n,1));
    const candidate=next.toISOString().slice(0,7);
    if(!validMonth.test(candidate))return;
    month=candidate;selectedDay=null;
    setUrl();void loadMonth();
  }
  $('month-prev').addEventListener('click',()=>shiftMonth(-1));
  $('month-next').addEventListener('click',()=>shiftMonth(1));
  $('month-today').addEventListener('click',()=>{month=getParts(new Date().toISOString()).month;selectedDay=null;setUrl();void loadMonth();});
  clearDay.addEventListener('click',()=>{selectedDay=null;renderAll();});
  monthPicker.addEventListener('change',()=>{
    if(validMonth.test(monthPicker.value)){month=monthPicker.value;selectedDay=null;setUrl();void loadMonth();}
    else monthPicker.value=month;
  });
  for(const field of [category,lodge,district])field.addEventListener('change',renderAll);
  reset.addEventListener('click',resetFilters);
  async function loadMonth(){
    const ticket=++loadingRequest;
    events=[];
    renderAll();
    message.textContent='Loading published Division IV events…';
    try{
      const response=await fetch(api+'?month='+encodeURIComponent(month),{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw Error('The public events service is temporarily unavailable');
      const body=await response.json();
      if(ticket!==loadingRequest)return;
      events=(Array.isArray(body.events)?body.events:[])
        .filter(e=>uuid.test(String(e.id||''))&&getParts(e.starts_at).month===month)
        .sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
      options(category,events.map(e=>e.event_type),'All categories');
      options(lodge,events.map(e=>e.hosted_by),'All lodges');
      options(district,events.map(e=>e.district),'All districts');
      message.textContent='';
      renderAll();
    }catch(e){
      if(ticket!==loadingRequest)return;
      message.textContent='Unable to load published events right now. You can still open the Google Calendar below.';
      renderAll();
    }
  }
  window.addEventListener('popstate',()=>{
    const u=new URL(location.href);
    const target=u.searchParams.get('month');
    if(target&&validMonth.test(target)&&target!==month){
      month=target;selectedDay=null;
      void loadMonth().then(()=>{const id=u.searchParams.get('event');if(id&&uuid.test(id))openEvent(id,false);});
    }else if(dialog.open&&!u.searchParams.has('event'))dialog.close();
  });
  (async()=>{
    await loadMonth();
    const id=new URL(location.href).searchParams.get('event');
    if(!id||!uuid.test(id))return;
    if(events.some(e=>e.id===id)){openEvent(id,false);return;}
    // Existing homepage links contain only ?event=. Resolve them against the
    // future-only public feed, then load the correct month without private data.
    try{
      const response=await fetch(api,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      const entry=(Array.isArray(data.events)?data.events:[]).find(e=>e.id===id);
      if(!entry)return;
      const target=getParts(entry.starts_at).month;
      if(target!==month){month=target;selectedDay=null;setUrl();await loadMonth();}
      openEvent(id,false);
    }catch{/* The calendar remains usable if deep-link lookup is unavailable. */}
  })();
})();