/* Inspector-only new event import. Existing approvals and publication stay unchanged. */
(function(){
'use strict';
const el=id=>document.getElementById(id);
const fileInput=el('bulk-file'),preview=el('bulk-preview'),summary=el('bulk-summary'),results=el('bulk-results'),submit=el('bulk-submit'),status=el('bulk-status');
if(!fileInput||!preview||!submit)return;
let parsed=[],items=[],filename='',readerPromise=null,working=false;
const headers=['Lodge No.','Other Host','District','Event Title','Event Type','Start Date','Start Time','End Date','End Time','Mode','Location TBD?','Venue Name','Address Line 1','Address Line 2','City','State','ZIP','Online URL','Description','Cost','Attire','Attendees','POC Name','POC Position','POC Phone','POC Email','Registration URL','Payment URL','Flyer URL','Submitter Name','Submitter Email','Submitter Phone','Submitter Message'];
const keys=['lodge_no','other_host','district_override','title','event_type','start_date','start_time','end_date','end_time','event_mode','location_tbd','location_name','location_address1','location_address2','location_city','location_state','location_zip','virtual_meeting_url','public_description','cost_details','attire','invited_audience','poc_name','poc_position','poc_phone','poc_email','registration_url','payment_url','flyer_url','requester_name','requester_email','requester_phone','requester_message'];
/* Import by named column, not position. Optional columns may be hidden, removed or rearranged. */
function columnKey(label){
 const heading=String(label??'').split(/\r?\n/)[0].replace(/\s*\([^)]*\)\s*$/,'').trim().toLowerCase();
 if(heading==='district override')return 'district_override'; // older workbooks
 if(heading==='intended audience'||heading==='audience')return 'invited_audience';
 const i=headers.findIndex(h=>h.toLowerCase()===heading);
 return i<0?null:keys[i];
}
function mapColumns(headingRow){
 const indexByKey=new Map();
 headingRow.forEach((value,column)=>{
  const key=columnKey(value);if(!key)return;
  if(indexByKey.has(key))throw Error('Repeated spreadsheet heading: '+String(value));
  indexByKey.set(key,column);
 });
 const mandatory=['title','event_type','start_date','start_time','end_date','end_time','public_description','poc_name','poc_phone','poc_email','location_tbd'];
 const missing=mandatory.filter(key=>!indexByKey.has(key));
 if(!indexByKey.has('lodge_no')&&!indexByKey.has('other_host'))missing.push('lodge_no/other_host');
 if(missing.length)throw Error('Missing required spreadsheet columns: '+missing.join(', ')+'.');
 return indexByKey;
}
function msg(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
function cell(v){if(v===null||v===undefined)return '';if(v instanceof Date)return v.toISOString();return String(v).trim()}
function excelDate(v){
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
 if(typeof v==='number'&&v>30000&&v<100000)return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
 const x=cell(v);if(!x)return '';
 if(/^\d{4}-\d{2}-\d{2}/.test(x))return x.slice(0,10);
 const m=x.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
 if(m)return m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
 return x;
}
function excelTime(v){
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return String(v.getUTCHours()).padStart(2,'0')+':'+String(v.getUTCMinutes()).padStart(2,'0');
 if(typeof v==='number'){
  const minutes=Math.round(((v%1)+1)%1*1440)%1440;
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
 }
 const x=cell(v);if(!x)return '';
 let m=x.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
 if(m){let h=Number(m[1]);if(m[3])h=h%12+(m[3].toUpperCase()==='PM'?12:0);return String(h).padStart(2,'0')+':'+m[2]}
 return x;
}
function loadReader(){
 if(window.readXlsxFile)return Promise.resolve(window.readXlsxFile);
 if(readerPromise)return readerPromise;
 readerPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/read-excel-file@9.3.13/bundle/read-excel-file.min.js';
  script.async=true;
  script.onload=()=>window.readXlsxFile?resolve(window.readXlsxFile):reject(Error('Excel reader did not load.'));
  script.onerror=()=>reject(Error('The Excel reader could not load. Check your internet connection and retry.'));
  document.head.append(script);
 }).catch(e=>{readerPromise=null;throw e});
 return readerPromise;
}
async function api(action,payload){
 const session=await db.auth.getSession();
 if(!session.data.session)throw Error('Sign in to the Inspector Desk first.');
 const response=await fetch(ROOT+'/functions/v1/division-bulk?action='+action,{method:'POST',
  headers:{apikey:KEY,authorization:'Bearer '+session.data.session.access_token,'content-type':'application/json'},
  body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({error:'Unexpected response from bulk import service'}));
 if(!response.ok||result.error)throw Error(result.error||'Bulk import failed.');
 return result;
}
function make(tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
}
function clear(){preview.replaceChildren();results.replaceChildren();summary.textContent='';submit.disabled=true;submit.classList.add('hidden');items=[];parsed=[]}
function displayPreview(response){
 const stats=response.summary;summary.textContent=parsed.length+' rows found · '+stats.ready+' ready · '+stats.warnings+' possible duplicates · '+stats.invalid+' need correction';
 const table=make('table','bulk-table');const head=make('thead');const tr=make('tr');
 for(const label of ['Row','Calendar title','When (Pacific)','Validation','Action'])tr.append(make('th','',label));
 head.append(tr);table.append(head);const tbody=make('tbody');
 for(const item of response.items){
  const source=parsed.find(x=>x.row_number===item.row_number);
  const row=make('tr');row.append(make('td','',item.row_number),make('td','',item.calendar_title||source?.title||'—'));
  row.append(make('td','',source?.start_local?.replace('T',' ')||'—'));
  const problem=make('td','',item.issues?.join(' ')||item.warnings?.join(' ')||'Ready for queue');
  if(item.status==='invalid')problem.classList.add('bulk-error');
  if(item.status==='warning')problem.classList.add('bulk-warning');
  row.append(problem);
  const action=make('td');
  if(item.status==='warning'){
   const label=make('label','bulk-confirm');const check=document.createElement('input');check.type='checkbox';check.className='bulk-confirm-check';check.value=String(item.row_number);
   check.addEventListener('change',updateButton);label.append(check,document.createTextNode('Intentional duplicate'));action.append(label);
  }else action.textContent=item.status==='invalid'?'Correct spreadsheet':'Will enter queue';
  row.append(action);tbody.append(row);
 }
 table.append(tbody);preview.append(table);items=response.items;updateButton();
}
function updateButton(){
 const approvals=new Set([...document.querySelectorAll('#bulk-preview .bulk-confirm-check:checked')].map(e=>Number(e.value)));
 const eligible=items.some(i=>i.status==='ready'||i.status==='warning');
 submit.classList.toggle('hidden',!eligible);
 submit.disabled=working||!items.some(i=>i.status==='ready'||i.status==='warning'&&approvals.has(i.row_number));
}
fileInput.addEventListener('change',async()=>{
 clear();const file=fileInput.files?.[0];if(!file)return;
 if(!/\.xlsx$/i.test(file.name)){msg('Choose the Division IV .xlsx spreadsheet.',true);return}
 if(file.size>3*1024*1024){msg('Spreadsheet is too large (3 MB maximum).',true);return}
 working=true;filename=file.name;msg('Reading spreadsheet and checking the calendar…');
 try{
  const reader=await loadReader();
  const workbook=await reader(file,{sheet:'New Events'});
  const heading=workbook.findIndex(row=>{
   if(!Array.isArray(row))return false;
   const found=new Set(row.map(columnKey).filter(Boolean));
   return found.has('title')&&found.has('event_type')&&found.has('start_date')&&found.has('end_date');
  });
  if(heading<0)throw Error('The New Events sheet needs a header row with Event Title, Event Type, Start Date and End Date.');
  const indexByKey=mapColumns(workbook[heading]);
  const entries=workbook.slice(heading+1).map((raw,index)=>{
   const row={row_number:heading+index+2};
   for(const key of keys)row[key]=indexByKey.has(key)?raw?.[indexByKey.get(key)]??'':'';
   return row;
  }).filter(row=>keys.some(k=>cell(row[k])!==''));
  if(!entries.length)throw Error('No new events found. Fill in at least one row.');
  if(entries.length>25)throw Error('This importer accepts up to 25 new events per spreadsheet.');
  parsed=entries.map(row=>{
   const startDate=excelDate(row.start_date),endDate=excelDate(row.end_date);
   const startTime=excelTime(row.start_time),endTime=excelTime(row.end_time);
   const out={...row,start_local:startDate&&startTime?startDate+'T'+startTime:'',
    end_local:endDate&&endTime?endDate+'T'+endTime:'',
    location_tbd:['YES','TRUE','1'].includes(cell(row.location_tbd).toUpperCase())||row.location_tbd===true};
   for(const k of keys)if(k!=='location_tbd')out[k]=cell(row[k]);
   return out;
  });
  const response=await api('preview',{rows:parsed});
  displayPreview(response);msg('Preview ready. Correct invalid rows in Excel; confirm legitimate duplicates before submission.');
 }catch(e){clear();msg(e.message||'Unable to read spreadsheet.',true)}
 finally{working=false;updateButton()}
});
submit.addEventListener('click',async()=>{
 if(working||!parsed.length)return;
 working=true;submit.disabled=true;
 const confirmed_rows=[...document.querySelectorAll('#bulk-preview .bulk-confirm-check:checked')].map(el=>Number(el.value));
 msg('Submitting valid new events to the existing approval queue…');
 try{
  const outcome=await api('submit',{rows:parsed,filename,confirmed_rows});
  results.replaceChildren();
  results.append(make('h4','',outcome.replayed?'Previous import results':'Import results'));
  results.append(make('p','',outcome.submitted+' submitted · '+outcome.skipped+' skipped · '+outcome.errors+' errors. Each submitted event needs individual approval.'));
  const list=make('div','bulk-results-list');
  for(const item of outcome.results||[]){
   const row=make('div','bulk-result-row');
   row.append(make('strong','', 'Row '+item.row_number+' · '+item.status));
   row.append(make('span','',item.request_code||item.message||item.title));
   if(item.request_id){
    const button=make('button','secondary','View submission');button.type='button';
    button.addEventListener('click',()=>window.openBulkSubmission?.(item.request_id));row.append(button);
   }
   list.append(row);
  }
  results.append(list);results.scrollIntoView({behavior:'smooth',block:'nearest'});
  msg(outcome.notice||'Import recorded. Submitted events are awaiting individual verification and publication.');
  submit.disabled=true;submit.classList.add('hidden');fileInput.value='';parsed=[];items=[];
 }catch(e){msg(e.message||'Import could not be completed.',true)}
 finally{working=false;updateButton()}
});
window.loadBulkImport=()=>{if(!fileInput.files?.length&&!results.children.length)msg('Use the New Events sheet. Times are Pacific.');};
})();
