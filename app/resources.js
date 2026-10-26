/* Secure, division-wide inspector document library */
(()=>{
const endpoint=ROOT+'/functions/v1/division-resources',bucket='division-inspector-resources';
const byId=id=>document.getElementById(id);
let docs=[],categories=[],manage=false,selected=null,busyNow=false,categoryBusy=false;
const make=(tag,cls,label)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el};
const fmtDate=v=>v?new Date(v).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'—';
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const alertText=(msg,bad=false)=>{const box=byId('resources-message');if(box){box.textContent=msg;box.classList.toggle('resources-error',bad)}};
async function request(action,payload,params={}){
 const url=new URL(endpoint);url.searchParams.set('action',action);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 const s=(await db.auth.getSession()).data.session;
 if(!s?.access_token)throw Error('Inspector sign-in required');
 const headers={apikey:KEY,authorization:'Bearer '+s.access_token};
 if(payload!==undefined)headers['content-type']='application/json';
 const r=await fetch(url,{method:payload===undefined?'GET':'POST',headers,
  ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 const o=await r.json().catch(()=>({error:'Unexpected document server response'}));
 if(!r.ok||o.error)throw Error(o.error||'Document request failed');
 return o;
}

function categoryNotice(message,bad=false){
 const target=byId('resources-category-message');
 if(target){target.textContent=message;target.classList.toggle('resources-error',bad);}
}
function displayCategories(){
 const filter=byId('resources-category-filter');
 const picker=byId('resources-document-category');
 const oldFilter=filter.value,oldPicker=picker.value;
 const options=categories.filter(c=>c.active).map(c=>c.name);
 const assigned=[...new Set(docs.map(d=>d.category))];
 const existing=[...new Set([...options,...assigned])].sort((a,b)=>a.localeCompare(b));
 filter.replaceChildren(new Option('All categories','All categories'));
 for(const name of existing)filter.add(new Option(name,name));
 filter.value=existing.includes(oldFilter)?oldFilter:'All categories';
 picker.replaceChildren();
 for(const name of options.sort((a,b)=>a.localeCompare(b)))picker.add(new Option(name,name));
 picker.value=options.includes(oldPicker)?oldPicker:options.includes('General')?'General':options[0]||'';
}
async function changeCategory(operation,category,name){
 if(!manage||categoryBusy||busyNow)return;
 if(operation==='archive'){
  if(category.name==='General'){categoryNotice('General is the permanent default category.',true);return;}
  if(category.file_count>0){categoryNotice('Move the '+category.file_count+' document(s) in '+category.name+' to another category before retiring it.',true);return;}
  const yes=await divisionQuestion('Retire category "'+category.name+'"? It will no longer appear when assigning new files. You can restore it later.',
    {title:'Retire document category',confirmLabel:'Retire category'});
  if(!yes)return;
 }
 try{
  categoryBusy=true;
  byId('resources-category-add').disabled=true;
  byId('resources-category-list').querySelectorAll('button').forEach(b=>b.disabled=true);
  categoryNotice('Saving category…');
  await request('category-save',{operation,id:category.id,name});
  await load();
  categoryNotice(operation==='create'?'Category added.':operation==='rename'?'Category renamed across the library.':operation==='archive'?'Category retired.':'Category restored.');
 }catch(e){categoryNotice(e.message,true);renderCategoryManager();}
 finally{categoryBusy=false;byId('resources-category-add').disabled=false;}
}
function renderCategoryManager(){
 const root=byId('resources-category-list');
 if(!root)return;
 root.replaceChildren();
 if(!manage)return;
 for(const category of [...categories].sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name))){
  const row=make('div','resources-category-row');
  const info=make('div','resources-category-info');
  info.append(make('strong','',category.name));
  info.append(make('small','',category.active?'Active · '+category.file_count+' document'+(category.file_count===1?'':'s'):'Retired · not available for new documents'));
  const buttons=make('div','resources-category-actions');
  if(category.active&&category.name!=='General'){
   const rename=make('button','secondary','Rename');rename.type='button';
   rename.onclick=()=>{
    const renameForm=make('form','resources-category-rename-form');
    const renameInput=make('input');renameInput.type='text';renameInput.value=category.name;renameInput.maxLength=50;
    renameInput.minLength=2;renameInput.required=true;renameInput.setAttribute('aria-label','New category name');
    const save=make('button','primary','Save Name');save.type='submit';
    const cancel=make('button','secondary','Cancel');cancel.type='button';
    cancel.onclick=renderCategoryManager;
    renameForm.onsubmit=e=>{
     e.preventDefault();
     const name=renameInput.value.trim().replace(/\s+/g,' ');
     if(name===category.name){renderCategoryManager();return;}
     changeCategory('rename',category,name);
    };
    renameForm.append(renameInput,save,cancel);
    info.replaceChildren(renameForm);
    buttons.replaceChildren();
    renameInput.focus();renameInput.select();
   };
   const retire=make('button','secondary','Retire');retire.type='button';
   retire.disabled=category.file_count>0;
   retire.title=category.file_count>0?'Reassign files before retiring this category':'Retire category';
   retire.onclick=()=>changeCategory('archive',category,null);
   buttons.append(rename,retire);
  }else if(!category.active){
   const restore=make('button','secondary','Restore');restore.type='button';
   restore.onclick=()=>changeCategory('restore',category,null);
   buttons.append(restore);
  }else{
   buttons.append(make('span','resources-category-protected','Default category'));
  }
  row.append(info,buttons);root.append(row);
 }
 if(!categories.length)root.append(make('p','muted','No categories available.'));
}

function locked(v){
 busyNow=v;
 for(const id of ['resources-upload','resources-save-meta','resources-cancel-meta','resources-refresh']){
  const button=byId(id);if(button)button.disabled=v;
 }
}
function editor(doc){
 if(!manage)return;
 selected=doc||null;
 byId('resources-editor').classList.remove('hidden');
 byId('resources-editor-title').textContent=doc?'Edit document details':'Upload a document';
 byId('resources-document-title').value=doc?.title||'';
 byId('resources-document-category').value=doc?.category||'General';
 byId('resources-document-description').value=doc?.description||'';
 byId('resources-file-wrap').classList.toggle('hidden',!!doc);
 byId('resources-file').value='';
 byId('resources-upload').classList.toggle('hidden',!!doc);
 byId('resources-save-meta').classList.toggle('hidden',!doc);
 byId('resources-upload-help').textContent=doc?
  'Change the title, description, or category. To upload a new version, use Replace on the document row.':
  'Supported: PDF, Word, Excel, PowerPoint, TXT, CSV, JPG and PNG. Maximum 20 MB. Files are private.';
 byId('resources-editor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function closeEditor(){selected=null;byId('resources-editor').classList.add('hidden');byId('resources-file').value=''}
async function download(d){
 try{
  alertText('Preparing secure download…');
  const response=await request('download',undefined,{id:d.id});
  const linkUrl=new URL(response.url);
  if(linkUrl.origin!==new URL(ROOT).origin||!linkUrl.pathname.startsWith('/storage/v1/object/sign/'))
   throw Error('Unexpected download address');
  const a=make('a');a.href=linkUrl.href;a.target='_blank';a.rel='noopener noreferrer';
  document.body.append(a);a.click();a.remove();
  alertText('Download ready. The temporary link expires after one minute.');
 }catch(e){alertText(e.message,true);toast(e.message,true)}
}
async function history(d){
 try{
  const response=await request('history',undefined,{id:d.id});
  const panel=byId('resources-version-history');panel.replaceChildren();
  panel.append(make('h4','',d.title+' — change history'));
  for(const h of response.items||[]){
   const line=fmtDate(h.created_at)+' · '+h.action+' · version '+h.version+
     (h.file_name?' · '+h.file_name:'');
   panel.append(make('p','resources-history-entry',line));
  }
  if(!(response.items||[]).length)panel.append(make('p','muted','No history recorded.'));
  panel.classList.remove('hidden');
 }catch(e){alertText(e.message,true)}
}
function visible(){
 const q=byId('resources-search').value.toLowerCase().trim();
 const category=byId('resources-category-filter').value;
 return docs.filter(d=>(category==='All categories'||d.category===category)&&
  (!q||[d.title,d.original_name,d.description,d.category].some(v=>String(v||'').toLowerCase().includes(q))));
}
function render(){
 const root=byId('resources-list');root.replaceChildren();
 const items=visible();
 byId('resources-count').textContent=items.length+' of '+docs.length+' documents';
 if(!items.length){
  root.append(make('p','resources-empty',docs.length?'No documents match your search.':
   'No documents yet. An administrator can add the first file.'));
  return;
 }
 for(const d of items){
  const row=make('article','resources-row');
  const ico=make('div','resources-file-icon','▤');
  const info=make('div','resources-row-info');
  info.append(make('strong','',d.title),
   make('small','',d.category+' · '+d.original_name+' · '+size(d.bytes)+' · v'+d.version+' · Updated '+fmtDate(d.updated_at)));
  if(d.description)info.append(make('p','resources-row-description',d.description));
  const controls=make('div','resources-row-actions');
  function add(label,klass,handler){
   const button=make('button',klass,label);button.type='button';button.onclick=handler;controls.append(button);
  }
  add('Download','primary',()=>download(d));
  add('History','secondary',()=>history(d));
  if(manage){
   add('Edit','secondary',()=>editor(d));
   add('Replace','secondary',()=>{
    if(busyNow)return;
    const picker=byId('resources-replace-file');picker.value='';
    picker.onchange=()=>{if(picker.files?.[0])upload(picker.files[0],d)};
    picker.click();
   });
   add('Remove','danger',()=>removeDocument(d));
  }
  row.append(ico,info,controls);root.append(row);
 }
}
async function load(){
 const root=byId('resources-list');if(!root)return;
 if(!['admin','inspector'].includes(state.staff?.role)){alertText('Active inspector sign-in required',true);return}
 root.textContent='Loading documents…';
 try{
  const response=await request('list');
  docs=Array.isArray(response.items)?response.items:[];
  categories=Array.isArray(response.categories)?response.categories:[];
  manage=!!response.can_manage&&state.staff?.role==='admin';
  byId('resources-admin-actions').classList.toggle('hidden',!manage);
  if(!manage){
   closeEditor();
   byId('resources-categories-panel').classList.add('hidden');
  }
  displayCategories();
  if(selected&&manage){
   const current=docs.find(d=>d.id===selected.id);
   if(current){selected=current;byId('resources-document-category').value=current.category;}
   else closeEditor();
  }
  render();
  renderCategoryManager();
  alertText('Division IV resource library ready.');
 }catch(e){root.textContent='Unable to load documents.';alertText(e.message,true)}
}
window.loadResources=load;
function validFile(file){
 const accepted=['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','jpg','jpeg','png'];
 if(!file||file.size<1||file.size>20971520)throw Error('Select a file between 1 byte and 20 MB.');
 if(!accepted.includes(file.name.split('.').pop().toLowerCase()))
  throw Error('Use PDF, Word, Excel, PowerPoint, TXT, CSV, JPG or PNG.');
}
async function upload(file,old){
 if(busyNow||!manage)return;
 try{
  validFile(file);
  const payload={name:file.name,size:file.size};
  if(old){
   const yes=await divisionQuestion('Replace '+old.title+'? The previous file will remain in private version history.',
    {title:'Replace document',confirmLabel:'Replace'});
   if(!yes)return;
   payload.id=old.id;
  }else{
   payload.title=byId('resources-document-title').value.trim();
   payload.description=byId('resources-document-description').value.trim();
   payload.category=byId('resources-document-category').value;
   if(!payload.title)throw Error('Enter a document title.');
  }
  locked(true);alertText('Preparing secure upload…');
  const ticket=await request('upload-init',payload);
  const url=new URL(ticket.upload_url);
  if(url.origin!==new URL(ROOT).origin||
     !url.pathname.startsWith('/storage/v1/object/upload/sign/'+bucket+'/'))
   throw Error('Unexpected signed upload URL.');
  // Supabase Storage signed-upload protocol: PUT multipart form with a token in the URL.
  const fd=new FormData();fd.append('cacheControl','3600');fd.append('',file,file.name);
  alertText('Uploading '+file.name+'…');
  const put=await fetch(url,{method:'PUT',headers:{apikey:KEY,'x-upsert':'false'},body:fd});
  if(!put.ok){
   const result=await put.json().catch(()=>({}));
   throw Error(result.message||result.error||'Upload failed ('+put.status+').');
  }
  alertText('Verifying upload…');
  const done=await request('upload-complete',{id:ticket.id,path:ticket.path});
  closeEditor();await load();
  alertText('Document saved successfully, version '+done.item.version+'.');
  toast('Resource '+(old?'replaced':'uploaded')+' successfully');
 }catch(e){alertText(e.message,true);toast(e.message,true)}
 finally{locked(false)}
}
async function removeDocument(doc){
 if(busyNow||!manage)return;
 const yes=await divisionQuestion('Remove "'+doc.title+'" from the division library? The file remains in private storage as history.',
  {title:'Remove resource',confirmLabel:'Remove',danger:true});
 if(!yes)return;
 try{
  locked(true);await request('remove',{id:doc.id});
  closeEditor();await load();alertText('Document removed.');toast('Document removed');
 }catch(e){alertText(e.message,true);toast(e.message,true)}
 finally{locked(false)}
}
if(!byId('resources-list'))return;
byId('resources-search').addEventListener('input',render);
byId('resources-category-filter').addEventListener('change',render);
byId('resources-refresh').onclick=load;
byId('resources-new').onclick=()=>editor(null);
byId('resources-cancel-meta').onclick=closeEditor;
byId('resources-upload').onclick=()=>upload(byId('resources-file').files?.[0],null);
byId('resources-save-meta').onclick=async()=>{
 if(!manage||!selected||busyNow)return;
 const payload={id:selected.id,title:byId('resources-document-title').value.trim(),
  category:byId('resources-document-category').value,
  description:byId('resources-document-description').value.trim()};
 if(!payload.title){alertText('Enter a document title.',true);return}
 try{
  locked(true);await request('edit',payload);closeEditor();await load();toast('Document details saved');
 }catch(e){alertText(e.message,true);toast(e.message,true)}
 finally{locked(false)}
};
byId('resources-manage-categories').onclick=()=>{
 if(!manage)return;
 const panel=byId('resources-categories-panel');
 const show=panel.classList.contains('hidden');
 panel.classList.toggle('hidden',!show);
 byId('resources-manage-categories').setAttribute('aria-expanded',String(show));
 if(show){
  renderCategoryManager();
  categoryNotice('Choose Add Category, Rename, or Retire. Changes affect the whole Division IV library.');
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
};
byId('resources-categories-close').onclick=()=>{
 byId('resources-categories-panel').classList.add('hidden');
 byId('resources-manage-categories').setAttribute('aria-expanded','false');
};
byId('resources-category-add-form').onsubmit=async e=>{
 e.preventDefault();if(!manage||categoryBusy)return;
 const input=byId('resources-category-new-name');
 const name=input.value.trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>50){categoryNotice('Category names must be 2–50 characters.',true);return;}
 await changeCategory('create',{id:null,name:null},name);
 if(!categoryBusy&&byId('resources-category-message').textContent==='Category added.')input.value='';
};
byId('resources-clear-history').onclick=()=>byId('resources-version-history').classList.add('hidden');
})();