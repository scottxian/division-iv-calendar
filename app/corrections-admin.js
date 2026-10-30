/* Division IV private lodge-correction administration, requires verified administrator + MFA AAL2. */
(()=>{
 const byId=id=>document.getElementById(id);
 const list=byId('corrections-list'),detail=byId('corrections-detail');
 if(!list||!detail)return;
 const endpoint='https://lxvceqshpjnjjlllbpaq.supabase.co/functions/v1/division-corrections';
 const status=byId('corrections-status'),notice=byId('corrections-message'),count=byId('corrections-count');
 const names={pending:'Pending',reviewing:'Reviewing',completed:'Completed',rejected:'Rejected'};
 const categories={meeting:'Meeting schedule',location:'Address or location',directory:'Directory information',other:'Other'};
 let items=[],chosen=null,loading=false;
 const text=(tag,content,cls)=>{
  const node=document.createElement(tag);node.textContent=content??'';if(cls)node.className=cls;return node;
 };
 const fmt=iso=>{
  if(!iso)return '';
  try{return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Los_Angeles'}).format(new Date(iso));}
  catch{return iso;}
 };
 async function request(action,payload=null,params={}){
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error('Sign in and complete MFA to review corrections.');
  const qs=new URLSearchParams({action,...params});
  const headers={'authorization':'Bearer '+session.access_token,'apikey':KEY};
  if(payload!==null)headers['content-type']='application/json';
  const response=await fetch(endpoint+'?'+qs.toString(),{method:payload===null?'GET':'POST',headers,
   ...(payload===null?{}:{body:JSON.stringify(payload)})});
  const data=await response.json().catch(()=>({error:'Invalid response from correction queue'}));
  if(!response.ok||data.error)throw Error(data.error||'Correction queue request failed');
  return data;
 }
 function showMessage(message,isError=false){
  notice.textContent=message;
  notice.style.color=isError?'#a02d37':'';
 }
 function renderList(){
  list.replaceChildren();
  count.textContent=items.length+' correction'+(items.length===1?'':'s');
  if(!items.length){list.append(text('p','No corrections match this status.','muted'));return;}
  for(const item of items){
   const button=text('button','', 'correction-row');
   button.type='button';button.classList.toggle('selected',chosen===item.id);
   const title=text('strong',item.lodge_name||'Lodge not specified');
   const meta=text('span',(names[item.status]||item.status)+' · '+(categories[item.category]||item.category)+' · '+fmt(item.created_at),'muted');
   button.append(title,meta);
   button.onclick=()=>{chosen=item.id;renderList();void renderDetail(item.id);};
   list.append(button);
  }
 }
 async function renderDetail(id){
  const item=items.find(row=>row.id===id);
  if(!item){detail.replaceChildren(text('p','Select a correction to see its details.','muted'));return;}
  detail.replaceChildren();
  detail.append(text('p',names[item.status]||item.status,'correction-status'),
   text('h3',item.lodge_name),
   text('p',(categories[item.category]||item.category)+' · Submitted '+fmt(item.created_at),'muted'));
  const heading=text('h4','Requested correction');
  const description=text('p',item.details,'correction-description');
  detail.append(heading,description);
  if(item.reporter_contact)detail.append(text('p','Reply contact: '+item.reporter_contact,'correction-contact'));
  if(item.review_notes)detail.append(text('p','Last administrator notes: '+item.review_notes,'correction-notes'));
  const label=text('label','Administrator notes');
  const notes=text('textarea','','correction-notes-input');notes.rows=3;notes.maxLength=1200;
  notes.placeholder='What was verified, changed, or why this request was rejected?';
  label.append(notes);detail.append(label);
  const controls=text('div','','correction-actions');
  const statuses=[
   {value:'reviewing',label:'Mark Reviewing'},
   {value:'completed',label:'Mark Completed'},
   {value:'rejected',label:'Reject Correction'}
  ];
  for(const option of statuses){
   if(option.value===item.status)continue;
   const button=text('button',option.label,option.value==='completed'?'primary':'secondary');
   button.type='button';
   button.onclick=async()=>{
    const note=notes.value.trim();
    if(['completed','rejected'].includes(option.value)&&note.length<8){
     detailNotice('Please explain the verified directory update or why the request was rejected.',true);notes.focus();return;
    }
    if(option.value==='completed'&&!window.confirm('Only mark Completed after you have verified and updated the lodge record in the Lodges tab. Continue?'))return;
    button.disabled=true;
    try{
     const result=await request('update',{id:item.id,status:option.value,expected_status:item.status,note});
     await load(id);
     const refreshed=byId('corrections-detail').querySelector('.edit-action-feedback');
     if(refreshed){
      refreshed.textContent=result.warning||result.notice||'Correction status updated.';
      refreshed.className='edit-action-feedback'+(result.warning?' error':'');
      refreshed.scrollIntoView({behavior:'smooth',block:'nearest'});
     }
    }catch(err){detailNotice(err.message||'Unable to update correction',true);}
    finally{button.disabled=false;}
   };
   controls.append(button);
  }
  const lodgeButton=text('button','Open Lodge Editor','secondary');
  lodgeButton.type='button';
  lodgeButton.onclick=()=>{
    byId('lodge-search').value=(item.lodge_name||'').replace(/\s+Lodge\s+(?:No\.?\s*)?\d+.*$/i,'');
    const tab=document.querySelector('.tab[data-tab="lodges"]');
    tab?.click();
    byId('lodge-search')?.dispatchEvent(new Event('input',{bubbles:true}));
  };
  controls.prepend(lodgeButton);
  detail.append(controls);
  const localStatus=text('p','','edit-action-feedback hidden');
  localStatus.setAttribute('role','status');localStatus.setAttribute('aria-live','polite');
  detail.append(localStatus);
  const detailNotice=(msg,bad=false)=>{
   localStatus.textContent=msg;
   localStatus.className='edit-action-feedback'+(bad?' error':'')+(!msg?' hidden':'');
  };
  const historyTitle=text('h4','Status history');historyTitle.style.marginTop='25px';
  const historyHost=text('div','Loading history…','correction-history');
  detail.append(historyTitle,historyHost);
  try{
   const history=await request('history',null,{id});
   historyHost.replaceChildren();
   if(!history.items?.length){historyHost.append(text('p','No status changes recorded yet.','muted'));return;}
   for(const event of history.items){
    const div=text('div','','correction-history-item');
    div.append(text('strong',(names[event.previous_status]||'New')+' → '+(names[event.new_status]||event.new_status)),
     text('small',fmt(event.created_at),'muted'));
    if(event.notes)div.append(text('p',event.notes));
    historyHost.append(div);
   }
  }catch(err){historyHost.textContent=err.message||'History unavailable';}
 }
 async function load(prefer=null){
  if(loading)return;
  loading=true;
  showMessage('Loading private correction requests…');
  try{
   const result=await request('list',null,{status:status.value});
   items=Array.isArray(result.items)?result.items:[];
   chosen=items.some(item=>item.id===(prefer||chosen))?(prefer||chosen):(items[0]?.id||null);
   renderList();
   if(chosen)await renderDetail(chosen);
   else detail.replaceChildren(text('p','No correction selected.','muted'));
   showMessage('Requests are private. Completing a correction does not automatically edit the lodge directory.');
  }catch(err){showMessage(err.message||'Unable to load corrections',true);items=[];renderList();}
  finally{loading=false;}
 }
 byId('corrections-refresh')?.addEventListener('click',()=>void load());
 status.addEventListener('change',()=>{chosen=null;void load();});
 window.loadCorrections=()=>load();
})();