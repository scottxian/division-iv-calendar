/* Read-only Division IV event directory; only publicly approved event fields. */
(()=>{
  const root=document.getElementById('public-events-results');
  if(!root)return;
  const api='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-upcoming-events';
  const zone='America/Los_Angeles';
  const filters=['event-type-filter','event-lodge-filter','event-district-filter','event-date-filter'].map(x=>document.getElementById(x));
  const [typeInput,lodgeInput,districtInput,dateInput]=filters;
  const count=document.getElementById('events-list-count');
  const dialog=document.getElementById('public-event-dialog');
  const detail=document.getElementById('public-event-detail');
  const status=document.getElementById('events-list-status');
  const format=(iso,options)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,...options}).format(new Date(iso));
  const el=(tag,className,content)=>{const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;};
  const when=x=>format(x,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
  const place=x=>x.event_mode==='online'?'Online event':x.location_tbd?'Location to be announced':x.location_name||'Location to be announced';
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  let events=[];
  function optionList(select,values,heading){
    const previous=select.value;
    select.replaceChildren(new Option(heading,''));
    for(const value of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b)))select.add(new Option(value,value));
    if([...select.options].some(x=>x.value===previous))select.value=previous;
  }
  function entry(event){
    const card=el('article','public-event-card');
    const date=el('div','public-event-date');
    date.append(el('strong','',format(event.starts_at,{month:'short',day:'numeric'})),el('span','',format(event.starts_at,{weekday:'short'})));
    const body=el('div','public-event-body');
    body.append(el('span','public-event-type',event.event_type||'Division event'));
    const h=el('h3');const a=el('a','',event.title||'Division IV event');
    a.href='/calendar/?event='+encodeURIComponent(event.id)+'#events-list';
    a.addEventListener('click',e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,'',a.href);showEvent(event.id);});
    h.append(a);body.append(h);
    body.append(el('p','public-event-info',when(event.starts_at)+' Pacific'));
    body.append(el('p','public-event-info','Hosted by '+(event.hosted_by||'Division IV')));
    body.append(el('p','public-event-info',place(event)));
    if(event.district)body.append(el('span','public-event-district','District '+event.district));
    card.append(date,body);return card;
  }
  function addDetail(label,value){
    if(value){const p=el('p','public-event-detail-line');p.append(el('strong','',label+': '),document.createTextNode(String(value)));detail.append(p);}
  }
  function showEvent(id){
    const event=events.find(x=>x.id===id);
    if(!event){status.textContent='This event is not listed as an upcoming published event.';return;}
    detail.replaceChildren();
    detail.append(el('p','public-event-type',event.event_type||'Division event'));
    detail.append(el('h2','',event.title||'Division IV event'));
    addDetail('Date and time',when(event.starts_at)+' Pacific');
    addDetail('Ends',when(event.ends_at)+' Pacific');
    addDetail('Hosted by',event.hosted_by);
    addDetail('District',event.district?event.district:'');
    addDetail('Location',place(event));
    if(event.event_mode==='hybrid')addDetail('Attendance','In person and online');
    if(event.event_mode!=='online'&&!event.location_tbd)addDetail('Address',event.location_address);
    addDetail('Audience',event.invited_audience);
    addDetail('Attire',event.attire);
    if(event.public_description){const paragraph=el('p','public-event-description',event.public_description);paragraph.style.whiteSpace='pre-wrap';detail.append(paragraph);}
    const actions=el('div','public-event-detail-actions');
    const link=el('a','btn navy','Open full Google Calendar ↗');
    link.href=document.getElementById('calendar-external-link')?.href||'/calendar/';link.target='_blank';link.rel='noopener noreferrer';
    actions.append(link);detail.append(actions);
    if(!dialog.open)dialog.showModal();
  }
  const close=document.getElementById('public-event-close');
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{
    const url=new URL(location.href);
    if(url.searchParams.has('event')){url.searchParams.delete('event');history.replaceState(null,'',url.pathname+url.search+url.hash);}
  });
  window.addEventListener('popstate',()=>{if(dialog.open)dialog.close();const id=new URL(location.href).searchParams.get('event');if(id&&uuid.test(id))showEvent(id);});
  function render(){
    const min=dateInput.value;
    const list=events.filter(e=>(!typeInput.value||e.event_type===typeInput.value)&&
      (!lodgeInput.value||e.hosted_by===lodgeInput.value)&&
      (!districtInput.value||e.district===districtInput.value)&&
      (!min||format(e.starts_at,{year:'numeric',month:'2-digit',day:'2-digit'}).split('/').map((s,i,a)=>i===0?a[2]:i===1?a[0]:a[1]).join('-')>=min));
    count.textContent=list.length+' upcoming '+(list.length===1?'event':'events');
    root.replaceChildren();
    if(!list.length){root.append(el('p','public-events-empty','No upcoming events match those filters. Try clearing one or more filters.'));return;}
    for(const item of list)root.append(entry(item));
  }
  for(const field of filters)field.addEventListener('change',render);
  document.getElementById('event-filters-reset').addEventListener('click',()=>{for(const field of filters)field.value='';render();});
  fetch(api,{headers:{Accept:'application/json'},cache:'no-store'})
    .then(async r=>{if(!r.ok)throw Error('Event list unavailable');return r.json();})
    .then(data=>{
      events=(Array.isArray(data.events)?data.events:[]).filter(x=>uuid.test(String(x.id||''))&&Date.parse(x.ends_at)>Date.now());
      status.textContent='';
      optionList(typeInput,events.map(x=>x.event_type),'All event types');
      optionList(lodgeInput,events.map(x=>x.hosted_by),'All host lodges');
      optionList(districtInput,events.map(x=>x.district),'All districts');
      render();
      const id=new URL(location.href).searchParams.get('event');
      if(id&&uuid.test(id))showEvent(id);
    })
    .catch(()=>{status.textContent='The event list is temporarily unavailable. Please use the full Google Calendar below.';count.textContent='Calendar still available';});
})();