/* Division IV Lodge Directory editor — authenticated Inspector Desk only. */
(()=>{
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-lodges';
 const el=id=>document.getElementById(id);
 const fields=['lodge_name','lodge_number','district','state','address_line1','city','county','meeting_day','meeting_time','meeting_notes','official_url'];
 let rows=[],selected=null;
 function message(text,isError=false){
  const node=el('lodge-admin-message');if(!node)return;
  node.textContent=text;node.style.color=isError?'#a53226':'';
 }
 async function request(action,body=null,query=''){
  const current=await db.auth.getSession();
  const token=current.data?.session?.access_token;
  if(!token)throw Error('Inspector sign-in required');
  const params=new URLSearchParams({action});
  if(query)params.set('id',query);
  const headers={'apikey':KEY,'Authorization':'Bearer '+token};
  if(body!==null)headers['content-type']='application/json';
  const response=await fetch(endpoint+'?'+params.toString(),{method:body===null?'GET':'POST',headers,
    ...(body!==null?{body:JSON.stringify(body)}:{})});
  const json=await response.json().catch(()=>({error:'Unexpected server response'}));
  if(!response.ok||json.error)throw Error(json.error||'Unable to complete lodge request');
  return json;
 }
 function renderOptions(){
  const select=el('lodge-select');
  if(!select)return;
  const term=el('lodge-find').value.toLowerCase().trim();
  const previous=select.value||selected?.id||'';
  select.replaceChildren(new Option('Select a lodge to edit',''));
  for(const lodge of rows){
   const haystack=[lodge.lodge_name,lodge.lodge_number,lodge.district,lodge.city,lodge.county].join(' ').toLowerCase();
   if(term&&!haystack.includes(term))continue;
   select.add(new Option(lodge.lodge_name+' Lodge No. '+lodge.lodge_number+' · District '+lodge.district,lodge.id));
  }
  if([...select.options].some(x=>x.value===previous))select.value=previous;
 }
 function populate(){
  const id=el('lodge-select').value;
  selected=rows.find(x=>x.id===id)||null;
  const form=el('lodge-edit-form');
  if(!selected){form.classList.add('hidden');el('lodge-edit-history').replaceChildren();return;}
  for(const key of fields){const input=form.elements.namedItem(key);if(input)input.value=selected[key]??'';}
  el('lodge-record-version').textContent='Record version '+selected.record_version;
  form.classList.remove('hidden');
  showHistory(selected.id);
 }
 async function showHistory(id){
  const root=el('lodge-edit-history');
  root.textContent='Loading recent lodge edits…';
  try{
   const answer=await request('history',null,id);
   if(selected?.id!==id)return;
   root.replaceChildren();
   if(!(answer.items||[]).length){root.textContent='No inspector changes recorded yet.';return;}
   const title=document.createElement('h4');title.textContent='Recent Changes';root.append(title);
   for(const item of answer.items.slice(0,12)){
    const changes=[];
    for(const key of fields)if(String(item.before?.[key]??'')!==String(item.after?.[key]??''))changes.push(key.replaceAll('_',' '));
    const row=document.createElement('div');row.className='audit-item';
    const by=document.createElement('strong');by.textContent=(item.by||'Inspector')+' · '+new Date(item.created_at).toLocaleString();
    const description=document.createElement('div');description.textContent=changes.join(', ')||'Record updated';
    row.append(by,description);root.append(row);
   }
  }catch(e){root.textContent='Change history unavailable: '+e.message;}
 }
 async function load(){
  const select=el('lodge-select');
  if(!select)return;
  message('Loading lodge records…');
  try{
   const answer=await request('all');
   rows=(answer.lodges||[]).sort((a,b)=>Number(a.district)-Number(b.district)||a.lodge_name.localeCompare(b.lodge_name));
   renderOptions();
   if(selected&&rows.some(x=>x.id===selected.id))select.value=selected.id;
   populate();
   message(rows.length+' lodges available. Changes are recorded automatically.');
  }catch(e){message(e.message,true);if(typeof toast==='function')toast(e.message,true);}
 }
 const select=el('lodge-select'),search=el('lodge-find'),form=el('lodge-edit-form');
 if(!select||!search||!form)return;
 window.loadLodges=load;
 select.addEventListener('change',populate);
 search.addEventListener('input',renderOptions);
 el('lodge-reload').addEventListener('click',populate);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selected)return;
  const changes={};
  for(const name of fields){
   const input=form.elements.namedItem(name);
   const value=String(input?.value??'').trim();
   if(value!==String(selected[name]??''))changes[name]=value;
  }
  if(!Object.keys(changes).length){message('No changes to save.');return;}
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
   const result=await request('save',{id:selected.id,expected_version:selected.record_version,fields:changes});
   selected=result.lodge;rows=rows.map(x=>x.id===selected.id?selected:x);
   renderOptions();select.value=selected.id;populate();
   message('Saved. The public Wix directory will use the updated record when refreshed.');
   if(typeof toast==='function')toast('Lodge changes saved');
  }catch(e){message(e.message,true);if(typeof toast==='function')toast(e.message,true);}
  finally{submit.disabled=false;}
 });
})();
