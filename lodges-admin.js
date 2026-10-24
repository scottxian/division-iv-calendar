/* Division IV: one authenticated lodge list on the Inspector Dashboard. */
(()=>{
 const apiRoot='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-lodges';
 const el=id=>document.getElementById(id);
 const fields=['lodge_name','lodge_number','district','state','address_line1','city','county','meeting_day','meeting_time','meeting_notes','official_url'];
 let rows=[],districts=[],selected=null,loading=false;
 const container=el('lodge-admin-list'),form=el('lodge-edit-form'),panel=el('lodge-edit-panel');
 if(!container||!form||!panel)return;
 function message(text,isError=false){
  const node=el('lodge-admin-message');
  node.textContent=text;
  node.style.color=isError?'#9c3343':'';
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
  const list=rows.slice().sort((a,b)=>Number(a.district)-Number(b.district)||a.lodge_name.localeCompare(b.lodge_name));
  for(const lodge of list){
   const row=document.createElement('button');
   row.type='button';row.className='lodge-admin-row';
   if(lodge.id===selected?.id)row.classList.add('selected');
   const name=document.createElement('span');
   name.append(cell('strong',lodge.lodge_name),cell('small','Lodge No. '+lodge.lodge_number+' · '+(lodge.city||'')));
   row.append(name,cell('span','District '+lodge.district,'lodge-district'),
    cell('span',inspectorNames(lodge.district),'lodge-inspector'),cell('span','Edit →','lodge-edit-action'));
   row.onclick=()=>choose(lodge.id);
   container.append(row);
  }
  if(!list.length)container.textContent='No lodges found.';
 }
 function choose(id){
  selected=rows.find(x=>x.id===id)||null;
  if(!selected){panel.classList.add('hidden');return;}
  for(const key of fields){
   const input=form.elements.namedItem(key);
   if(input)input.value=selected[key]??'';
  }
  el('lodge-edit-heading').textContent='Edit '+selected.lodge_name+' Lodge No. '+selected.lodge_number;
  el('lodge-record-version').textContent='Record version '+selected.record_version;
  const history=el('lodge-edit-history');
  history.classList.add('hidden');history.replaceChildren();
  el('lodge-history-toggle').textContent='View Change History';
  panel.classList.remove('hidden');
  render();
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function close(){
  selected=null;panel.classList.add('hidden');render();
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
   if(selected)selected=rows.find(x=>x.id===selected.id)||null;
   if(!selected)panel.classList.add('hidden');
   render();
   message(rows.length+' lodges · click a lodge to edit.');
  }catch(e){message(e.message,true);}
  finally{loading=false;}
 }
 window.loadLodges=load;
 el('lodge-list-refresh').onclick=load;
 el('lodge-close').onclick=close;
 el('lodge-reload').onclick=()=>{if(selected)choose(selected.id);};
 el('lodge-history-toggle').onclick=showHistory;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selected)return;
  const updates={};
  for(const key of fields){
   const input=form.elements.namedItem(key);
   const next=String(input?.value??'').trim();
   if(next!==String(selected[key]??''))updates[key]=next;
  }
  if(!Object.keys(updates).length){message('There are no changes to save.');return;}
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;
  try{
   const data=await call('save',{id:selected.id,expected_version:selected.record_version,fields:updates});
   rows=rows.map(x=>x.id===selected.id?data.lodge:x);
   selected=data.lodge;
   choose(selected.id);
   message('Lodge information saved. The Wix public directory will show the latest data when refreshed.');
   if(typeof toast==='function')toast('Lodge changes saved');
  }catch(e){message(e.message,true);if(typeof toast==='function')toast(e.message,true);}
  finally{submit.disabled=false;}
 });
})();
