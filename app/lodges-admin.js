/* Division IV: dedicated lodge directory. View for inspectors, edit for administrators. */
(()=>{
 const apiRoot='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-lodges';
 const el=id=>document.getElementById(id);
 const fields=['lodge_name','lodge_number','abbreviation','district','state','address_line1','city','county','meeting_day','meeting_time','meeting_notes','official_url'];
 let rows=[],districts=[],selected=null,loading=false,canEdit=false;
 const container=el('lodge-admin-list'),form=el('lodge-edit-form'),panel=el('lodge-edit-panel');
 if(!container||!form||!panel)return;
 function message(text,isError=false){
  const node=el('lodge-admin-message');
  if(!node)return;
  node.textContent=text;
  node.style.color=isError?'#9c3343':'';
 }
 // Save feedback belongs beside the form action, not above the entire lodge list.
 function saveFeedback(text='',kind='success'){
  const node=el('lodge-save-message');
  if(!node)return;
  node.textContent=text;
  node.className='wide lodge-save-feedback'+(kind==='error'?' error':kind==='pending'?' pending':'')+(!text?' hidden':'');
  if(text)node.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 async function call(action,body=null,id=''){
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error('Inspector sign-in required');
  const query=new URLSearchParams({action});
  if(id)query.set('id',id);
  const headers={'apikey':KEY,'Authorization':'Bearer '+session.access_token};
  if(body!==null)headers['content-type']='application/json';
  const response=await fetch(apiRoot+'?'+query,{method:body===null?'GET':'POST',headers,
   ...(body===null?{}:{body:JSON.stringify(body)})});
  const result=await response.json().catch(()=>({error:'The server did not return a valid response.'}));
  if(!response.ok||result.error)throw Error(result.error||'The request failed.');
  return result;
 }
 function inspectorNames(code){
  return districts.find(x=>x.code===code)?.inspectors?.join(', ')||'Not assigned';
 }
 function cell(tag,text,classname=''){
  const node=document.createElement(tag);
  if(classname)node.className=classname;
  node.textContent=text;
  return node;
 }
 function render(){
  container.replaceChildren();
  const query=el('lodge-search').value.trim().toLowerCase();
  const districtFilter=el('lodge-district-filter').value;
  const list=rows.filter(l=>
   (!districtFilter||l.district===districtFilter)&&
   (!query||[l.lodge_name,l.lodge_number,l.district,l.city,l.county].some(v=>String(v||'').toLowerCase().includes(query)))
  ).sort((a,b)=>Number(a.district)-Number(b.district)||a.lodge_name.localeCompare(b.lodge_name));
  for(const lodge of list){
   const row=document.createElement('button');
   row.type='button';row.className='lodge-admin-row';
   if(lodge.id===selected?.id)row.classList.add('selected');
   const name=document.createElement('span');
   name.append(cell('strong',lodge.lodge_name),cell('small','Lodge No. '+lodge.lodge_number+' · '+(lodge.city||'')));
   row.append(name,cell('span','District '+lodge.district,'lodge-district'),
    cell('span',inspectorNames(lodge.district),'lodge-inspector'),cell('span',canEdit?'Edit →':'View →','lodge-edit-action'));
   row.onclick=()=>choose(lodge.id);
   container.append(row);
  }
  if(!list.length)container.textContent=rows.length?'No lodges match your search or district filter.':'No lodges found.';
 }
 function choose(id,scroll=true){
  saveFeedback();
  selected=rows.find(x=>x.id===id)||null;
  if(!selected){panel.classList.add('hidden');form.classList.add('hidden');return;}
  el('lodge-edit-heading').textContent=(canEdit?'Edit ':'View ')+selected.lodge_name+' Lodge No. '+selected.lodge_number;
  el('lodge-record-version').textContent='Record version '+selected.record_version;
  form.classList.toggle('hidden',!canEdit);
  el('lodge-admin-edit-note').classList.toggle('hidden',!canEdit);
  const summary=el('lodge-view-summary');
  summary.classList.toggle('hidden',canEdit);
  if(canEdit){
   populateDistrictChoices();
   for(const key of fields){
    const input=form.elements.namedItem(key);
    if(input)input.value=selected[key]??'';
   }
  }else{
   summary.replaceChildren();
   const labels=[
    ['Lodge','lodge_name'],['Number','lodge_number'],['District','district'],['Assigned inspector',null],
    ['Street address','address_line1'],['City','city'],['County','county'],['State','state'],
    ['Meeting day','meeting_day'],['Meeting time','meeting_time'],['Meeting notes','meeting_notes'],
    ['Official listing','official_url']
   ];
   for(const [label,key] of labels){
    const value=key===null?inspectorNames(selected.district):selected[key];
    if(!String(value||'').trim())continue;
    const item=cell('div','','lodge-view-field');
    item.append(cell('strong',label));
    if(key==='official_url'&&/^https:\/\//i.test(value)){
     const a=document.createElement('a');a.href=value;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open official listing ↗';item.append(a);
    }else item.append(cell('span',String(value)));
    summary.append(item);
   }
  }
  const history=el('lodge-edit-history');
  history.classList.add('hidden');history.replaceChildren();
  el('lodge-history-toggle').textContent='View Change History';
  panel.classList.remove('hidden');
  render();
  if(scroll)panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function populateDistrictChoices(){
  const select=form.elements.namedItem('district');
  if(!select)return;
  const current=selected?.district||select.value;
  const districtCodes=[...new Set([...districts.map(d=>d.code),...rows.map(x=>x.district)].filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  select.replaceChildren();
  for(const code of districtCodes)select.add(new Option('District '+code,code));
  if(current&&!districtCodes.includes(current))select.add(new Option('District '+current,current));
  select.value=current||'';
 }
 function close(){
  saveFeedback();
  selected=null;panel.classList.add('hidden');form.classList.add('hidden');render();
 }
 async function showHistory(){
  const root=el('lodge-edit-history');
  const toggle=el('lodge-history-toggle');
  if(!selected)return;
  if(!root.classList.contains('hidden')){
   root.classList.add('hidden');toggle.textContent='View Change History';return;
  }
  root.classList.remove('hidden');toggle.textContent='Hide Change History';
  root.textContent='Loading edit history…';
  const id=selected.id;
  try{
   const result=await call('history',null,id);
   if(selected?.id!==id)return;
   root.replaceChildren();
   const changes=result.items||[];
   if(!changes.length){root.textContent='No inspector changes have been recorded for this lodge yet.';return;}
   for(const change of changes.slice(0,30)){
    const labels=[];
    for(const key of fields){
     if(String(change.before?.[key]??'')!==String(change.after?.[key]??'')){
      labels.push(key.replaceAll('_',' '));
     }
    }
    const item=cell('div','','audit-item');
    item.append(cell('strong',(change.by||'Inspector')+' · '+new Date(change.created_at).toLocaleString()),
     cell('div',labels.length?'Changed: '+labels.join(', '):'Lodge information updated'));
    root.append(item);
   }
  }catch(e){
   root.textContent='Change history unavailable: '+e.message;
  }
 }
 async function load(){
  if(loading)return;
  loading=true;message('Loading lodges…');
  try{
   const data=await call('all');
   rows=(data.lodges||[]).filter(l=>l.active!==false);
   districts=data.districts||[];
   canEdit=data.staff?.role==='admin'&&state.staff?.role==='admin';
   const codes=[...new Set([...districts.map(d=>d.code),...rows.map(l=>l.district)].filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
   const filter=el('lodge-district-filter'),previous=filter.value;
   filter.replaceChildren(new Option('All districts',''));
   for(const code of codes)filter.add(new Option('District '+code,code));
   filter.value=codes.includes(previous)?previous:'';
   if(selected)selected=rows.find(x=>x.id===selected.id)||null;
   if(!selected){panel.classList.add('hidden');form.classList.add('hidden');render();}
   else choose(selected.id,false);
   message(rows.length+' lodges · '+(canEdit?'Select a lodge to edit its details or district.':'Select a lodge to view its details. Editing is reserved for administrators.'));
  }catch(e){message(e.message,true);}
  finally{loading=false;}
 }
 window.loadLodges=load;
 el('lodge-list-refresh').onclick=load;
 el('lodge-search').addEventListener('input',render);
 el('lodge-district-filter').addEventListener('change',render);
 el('lodge-close').onclick=close;
 el('lodge-reload').onclick=()=>{if(selected)choose(selected.id);};
 el('lodge-history-toggle').onclick=showHistory;
 // HTML validation can block the submit event before the API is called.
 // Explain the failure in the same place as API success and error messages.
 form.addEventListener('invalid',event=>{
  if(form.querySelector(':invalid')!==event.target)return;
  const label=event.target.closest('label')?.textContent.trim()||'a lodge field';
  saveFeedback('Not saved. Please correct '+label+': '+event.target.validationMessage,'error');
 },true);
 form.addEventListener('input',()=>saveFeedback());
 form.addEventListener('change',()=>saveFeedback());
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selected||!canEdit||state.staff?.role!=='admin'){
   saveFeedback('Administrator access is required to edit lodges or assign districts.','error');
   return;
  }
  const updates={};
  for(const key of fields){
   const input=form.elements.namedItem(key);
   const next=String(input?.value??'').trim();
   if(next!==String(selected[key]??''))updates[key]=next;
  }
  if(!Object.keys(updates).length){saveFeedback('No changes to save. The lodge record is already up to date.');return;}
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;
  const originalLabel=submit.textContent;
  submit.textContent='Saving…';
  saveFeedback('Saving lodge changes…','pending');
  try{
   const lodgeId=selected.id;
   const data=await call('save',{id:lodgeId,expected_version:selected.record_version,fields:updates});
   if(!data.lodge||data.lodge.id!==lodgeId)throw Error('The server did not confirm the saved lodge. Refresh before trying again.');
   rows=rows.map(x=>x.id===lodgeId?data.lodge:x);
   selected=data.lodge;
   choose(lodgeId,false);
   saveFeedback(data.notice||'Lodge changes saved and recorded in the change history.');
  }catch(e){
   saveFeedback('Lodge changes were not saved: '+(e.message||'Unexpected error. Please try again.'),'error');
  }finally{
   submit.disabled=false;
   submit.textContent=originalLabel;
  }
 });
})();
