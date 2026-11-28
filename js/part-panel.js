import {partDraftKey,readPartState,writePartState} from './part-workspace-state.js';
import {PART_FIELDS,parsePartSheet,validateDesign} from './design-sheet.js';
import {imagePrompt,PART_LABELS,hasPartDesign} from './image-prompt.js';

const characterSlot={id:'characterSheet',label:'キャラ表'};
export function setupPartPanel({slots,activeProject,commit,openStage,nextImage}){
 const get=id=>document.getElementById('part-'+id);
 const dialog=get('dialog'),editor=get('editor'),workspace=get('workspace'),listScreen=get('list-screen');
 const fields=get('fields'),status=get('status');
 const reference=get('reference'),referenceField=get('reference-field'),fallback=get('fallback');
 const copy=get('copy'),consult=get('copy-consultation'),copyRevision=get('copy-revision'),save=get('save');
 const ids=slots.map(slot=>slot.id);
 const controls=new Map();
 const importInput=get('import-input'),importReview=get('import-review'),importStatus=get('import-status');
 const importChanges=get('import-changes'),importApply=get('import-apply');
 let session,proposal;
 const group=document.querySelector('.menu-assets');
 const slotCard=id=>document.querySelector('[data-slot="'+id+'"]');
 const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
 const savedPart=(project,id)=>project?.production.design?.parts[id];
 const isWorkspace=()=>session&&session.slot!==characterSlot;
 const characterIds=project=>(project.production.design?.characters??[]).map(character=>character.id);
 const baseline=(project,id)=>({part:savedPart(project,id)??null,characters:characterIds(project)});

 function keepDraft(){
  if(!isWorkspace())return;
  const record={base:session.base,json:importInput.value};
  if(session.edited){
   record.fields=Object.fromEntries([...controls].map(([key,input])=>[key,input.value]));
   record.characterIds=get('character-selection').value==='specified'
    ?[...get('characters').querySelectorAll('input:checked')].map(box=>box.value):null;
  }
  const hasDraft=session.edited||Boolean(record.json);
  const success=writePartState(partDraftKey(session.project.id,session.slot.id),hasDraft?record:null);
  get('draft-status').textContent=!success?'下書きをブラウザに保存できません。この画面を閉じる前に内容を控えてください。'
   :session.conflict?'保存済みの設計が変わりました。下書きを確認して続けるか、破棄してください。'
   :hasDraft?'このブラウザに未保存の下書きがあります。':'';
  get('discard').hidden=!hasDraft;
  get('rebase').hidden=get('conflict').hidden=!session.conflict||!hasDraft;
  if(session.conflict){
   const saved=savedPart(session.project,session.slot.id);
   const rows=Object.entries(saved??{}).map(([key,value])=>{
    const item=document.createElement('li');
    item.textContent=PART_LABELS[key]+'：'+(Array.isArray(value)?value.join('、')||'（なし）':value||'（未設定）');
    return item;
   });
   if(!rows.length){
    const item=document.createElement('li');item.textContent='個別設計は未設定です。';rows.push(item);
   }
   get('saved-values').replaceChildren(...rows);
  }
 }

 function updateWorkspace(){
  if(!isWorkspace())return;
  const project=activeProject(),id=session.slot.id;
  if(project?.id!==session.project.id)return;
  const saved=hasPartDesign(savedPart(project,id));
  get('next-action').textContent=proposal?'次にすること：変更内容を確認し、この枠に取り込む'
   :session.edited?'次にすること：個別設計の編集内容を保存'
   :importInput.value?'次にすること：貼り付けたJSONの変更内容を確認'
   :!saved?'次にすること：構図を相談するか、個別設計を入力'
   :!project.images[id]?'次にすること：画像生成の指示文をコピーし、画像を登録'
   :'画像は登録済みです。必要に応じて差し替えるか、次の枠へ進めます。';
  const next=nextImage(project,id)??slots[slots.findIndex(slot=>slot.id===id)+1];
  get('next-slot').hidden=!next;
  if(next)get('next-slot').textContent='次の枠へ：'+next.label;
  session.next=next;
 }

 function rememberView(){
  if(isWorkspace())writePartState('view',{projectId:session.project.id,slotId:session.slot.id,
   anchorId:session.anchorId,groupOpen:session.groupOpen,offset:session.offset});
 }
 function leaveWorkspace({restorePosition=false}={}){
  if(!isWorkspace())return;
  keepDraft();
  const {marker,card,anchorId,groupOpen,offset}=session;
  marker.replaceWith(card);
  workspace.hidden=true;
  listScreen.hidden=false;
  editor.hidden=true;
  session=null;
  writePartState('view',null);
  group.open=groupOpen;
  if(restorePosition){
   const anchor=slotCard(anchorId);
   const focus=anchor?.querySelector('.part-open');
   focus?.focus({preventScroll:true});
   if(anchor?.getClientRects().length)window.scrollBy(0,anchor.getBoundingClientRect().top-offset);
   else document.getElementById('assets-heading').scrollIntoView({block:'start'});
  }
 }

 addEventListener('pagehide',()=>{keepDraft();rememberView();});
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){keepDraft();rememberView();}
 });

 for(const key of PART_FIELDS.filter(key=>key!=='characterIds')){
  const label=document.createElement('label');
  const input=document.createElement('textarea');
  input.rows=2;
  input.maxLength=key==='motifs'?3000:1000;
  label.append(PART_LABELS[key]+(key==='motifs'?'（1行に1つ）':''),input);
  fields.append(label);controls.set(key,input);
 }
 function hasDetails(part){return Object.keys(part??{}).length>0;}
 function draft(){
  const part={};
  for(const [key,input] of controls){
   const value=input.value.trim();
   if(value)part[key]=key==='motifs'?value.split('\n').map(line=>line.trim()).filter(Boolean):value;
  }
  if(get('character-selection').value==='specified'){
   part.characterIds=[...get('characters').querySelectorAll('input:checked')].map(box=>box.value);
  }
  return hasDetails(part)?part:undefined;
 }
 function withPart(project,slotId,part){
  const design={...project.production.design,parts:{...project.production.design?.parts}};
  if(part)design.parts[slotId]=part;
  else delete design.parts[slotId];
  return {...project,production:{...project.production,design:validateDesign(design,ids)}};
 }
 function update(){
  const part=session?.slot===characterSlot?undefined:draft();
  const configured=hasPartDesign(session?.saved);
  consult.hidden=!isWorkspace()||configured;
  copyRevision.hidden=!isWorkspace()||!configured;
  copy.disabled=isWorkspace()&&!hasPartDesign(part);
  save.disabled=Boolean(session?.saving||session?.conflict);
  importApply.disabled=save.disabled;
  updateWorkspace();
  get('characters').hidden=get('character-selection').value!=='specified';
  referenceField.hidden=session?.slot===characterSlot||!session?.project.production.characterSheet||part?.characterIds?.length===0;
 }
 function fillFields(project,saved){
  for(const [key,input] of controls)input.value=key==='motifs'?(saved?.motifs??[]).join('\n'):saved?.[key]??'';
  get('character-selection').value=saved?.characterIds===undefined?'all':'specified';
  const characters=project.production.design?.characters??[];
  const missing=(saved?.characterIds??[]).filter(id=>!characters.some(character=>character.id===id));
  get('characters').replaceChildren(...[...characters,...missing.map(id=>({id,name:id+'（共通設計に登録されていません）'}))].map(character=>{
   const label=document.createElement('label');
   const box=document.createElement('input');
   box.type='checkbox';box.value=character.id;box.checked=saved?.characterIds?.includes(character.id)??false;
   label.append(box,character.name);
   return label;
  }));
  session.edited=false;
 }
 function resetImportReview(){
  proposal=null;
  importReview.hidden=true;
  importChanges.replaceChildren();
  importStatus.textContent='';
 }
 importInput.addEventListener('input',()=>{resetImportReview();keepDraft();});
 get('import-cancel').addEventListener('click',()=>{
  resetImportReview();
  updateWorkspace();
  get('import-preview').focus();
 });
 get('import-preview').addEventListener('click',()=>{
  resetImportReview();
  if(!isWorkspace())return;
  if(session.conflict){importStatus.textContent='保存済みの設計と下書きを確認してください。';return;}
  const {project,slot,saved,edited}=session;
  if(edited){
   importStatus.textContent='入力欄を編集中です。先に個別設計を保存するか、開き直してください。';
   return;
  }
  try{
   const patch=parsePartSheet(importInput.value,slot.id,ids);
   const updated=withPart(project,slot.id,{...saved,...patch}).production.design.parts[slot.id];
   const changed=Object.keys(patch).filter(key=>JSON.stringify(saved?.[key])!==JSON.stringify(updated[key]));
   if(!changed.length){importStatus.textContent='変更する項目はありません。';return;}
   const describe=value=>Array.isArray(value)?value.join('、')||'（なし）':value||'（未設定）';
   get('import-target').textContent='更新する画像枠：'+slot.label+'（'+slot.id+'）';
   for(const key of changed){
    const row=document.createElement('li');
    row.textContent=PART_LABELS[key]+'：'+describe(saved?.[key])+' → '+describe(updated[key]);
    importChanges.append(row);
   }
   proposal=updated;
   importReview.hidden=false;
   updateWorkspace();
  }catch(error){importStatus.textContent=error.message;}
 });
 importApply.addEventListener('click',async()=>{
  if(!session||!proposal||session.edited||session.conflict||session.saving)return;
  const pending=session,part=proposal;
  session.saving=true;
  update();
  await commitPart(pending,part,(success,error)=>{
   if(session!==pending)return;
   session.saving=false;
   update();
   if(!success){importStatus.textContent=error?.message??'取り込めませんでした。';return;}
   const project=activeProject();
   const saved=project.production.design.parts[pending.slot.id];
   Object.assign(session,{project,saved,base:baseline(project,pending.slot.id)});
   fillFields(project,saved);
   update();
   importInput.value='';
   resetImportReview();
   keepDraft();
   updateWorkspace();
   importStatus.textContent='この枠の個別設計を取り込みました。';
   copy.focus();
  });
 });
 function commitPart({project,slot,saved},part,complete){
  return commit(project.id,current=>{
   if(JSON.stringify(current.production.design?.parts[slot.id])!==JSON.stringify(saved)){
    throw new Error('個別設計が変更されました。画面を開き直してください。');
   }
   return withPart(current,slot.id,part);
  },complete);
 }
 function open(slot,opener,restored){
  const project=activeProject();
  if(!project||session?.saving)return;
  if(isWorkspace()&&session.slot.id===slot.id){get('heading').focus();return;}
  const previous=isWorkspace()?session:restored;
  if(isWorkspace())leaveWorkspace();
  const saved=savedPart(project,slot.id);
  session={slot,opener,project,saved,base:baseline(project,slot.id)};
  const character=slot===characterSlot;
  get('heading').textContent=character?'キャラ表作成の指示文':slot.label+'の個別設計';
  fields.hidden=save.hidden=character;
  for(const id of ['character-field','import','back','image-section','next-action','draft-status','consultation']){
   get(id).hidden=character;
  }
  get('close').hidden=!character;
  reference.checked=false;
  status.textContent='';
  fallback.hidden=true;
  fallback.value='';
  get('import').open=false;
  importInput.value='';
  resetImportReview();
  fillFields(project,saved);
  editor.hidden=false;
  if(character){
   dialog.append(editor);
   get('discard').hidden=get('conflict').hidden=get('rebase').hidden=get('next-slot').hidden=true;
   update();
   dialog.showModal();
   return;
  }
  openStage('create',false);
  const card=slotCard(slot.id);
  const marker=document.createComment('画像枠の元の位置');
  Object.assign(session,{card,marker,anchorId:previous?.anchorId??slot.id,
   groupOpen:previous?.groupOpen??group.open,
   offset:previous?.offset??Math.max(card.getBoundingClientRect().top,document.querySelector('.workflow-bar').offsetHeight+12)});
  card.before(marker);
  get('image-card').append(card);
  workspace.append(editor);
  workspace.hidden=false;
  listScreen.hidden=true;
  const record=readPartState(partDraftKey(project.id,slot.id));
  if(record){
   session.conflict=!same(record.base,session.base);
   session.base=record.base;
   if(record.fields&&typeof record.fields==='object'){
    fillFields(project,{characterIds:Array.isArray(record.characterIds)?record.characterIds:undefined});
    for(const [key,input] of controls)input.value=typeof record.fields[key]==='string'?record.fields[key]:'';
    session.edited=true;
   }
   importInput.value=typeof record.json==='string'?record.json:'';
   get('import').open=Boolean(importInput.value);
  }
  keepDraft();
  rememberView();
  update();
  get('heading').focus({preventScroll:true});
  editor.scrollIntoView({block:'start'});
 }
 editor.addEventListener('input',event=>{
  if(session&&(fields.contains(event.target)||get('character-field').contains(event.target))){
   session.edited=true;
   resetImportReview();
   keepDraft();
  }
  update();
 });
 dialog.addEventListener('close',()=>{session?.opener?.focus();session=null;});
 get('close').addEventListener('click',()=>dialog.close());
 get('back').addEventListener('click',()=>leaveWorkspace({restorePosition:true}));
 get('next-slot').addEventListener('click',()=>{if(session?.next)open(session.next);});
 get('discard').addEventListener('click',()=>{
  if(!isWorkspace()||!confirm('この枠の未保存の下書きを破棄しますか？'))return;
  const project=activeProject();
  session.saved=savedPart(project,session.slot.id);
  session.base=baseline(project,session.slot.id);
  session.conflict=false;
  fillFields(project,session.saved);
  importInput.value='';
  resetImportReview();
  keepDraft();
  update();
 });
 get('rebase').addEventListener('click',()=>{
  if(!isWorkspace()||!confirm('保存済みの設計が変わっています。下書きを保持して編集を続けますか？'))return;
  const project=activeProject();
  session.saved=savedPart(project,session.slot.id);
  session.base=baseline(project,session.slot.id);
  session.conflict=false;
  const values=[...controls].map(([key,input])=>[key,input.value]);
  const part=draft();
  const edited=session.edited;
  fillFields(project,edited?part:session.saved);
  for(const [key,value] of values)controls.get(key).value=value;
  session.edited=edited;
  resetImportReview();
  keepDraft();
  update();
 });
 save.addEventListener('click',async()=>{
  if(!isWorkspace()||session.saving||session.conflict)return;
  const pending=session;
  const part=draft();
  session.saving=true;
  update();
  await commitPart(pending,part,(success,error)=>{
   if(session!==pending)return;
   session.saving=false;
   if(success){
    const project=activeProject();
    pending.saved=savedPart(project,pending.slot.id);
    pending.base=baseline(project,pending.slot.id);
    fillFields(project,pending.saved);
    keepDraft();
    status.textContent='個別設計を保存しました。';
   }else status.textContent=error?.message??'個別設計を保存できませんでした。';
   update();
  });
 });
 async function copyPrompt(mode){
  if(!session)return;
  const pending=session;
  fallback.hidden=true;
  status.textContent='';
  try{
   const project=activeProject();
   if(project?.id!==session.project.id)throw new Error('対象の作品を開き直してください。');
   const revise=mode==='revise';
   const part=mode==='consult'?undefined:revise?project.production.design?.parts[session.slot.id]:session.slot===characterSlot?undefined:draft();
   if(revise&&!hasPartDesign(part))throw new Error('保存済みの個別設計がありません。');
   const source=revise||session.slot===characterSlot?project:withPart(project,session.slot.id,part);
   const result=imagePrompt(source,session.slot,{part,revise,useReference:reference.checked&&(revise||!referenceField.hidden)});
   const attach=result.reference?' ChatGPTで「'+project.production.characterSheet.name+'」を添付してください。':'';
   try{
    await navigator.clipboard.writeText(result.text);
    if(session!==pending)return;
    status.textContent='コピーしました。ChatGPTに貼り付けてください。'+attach;
   }catch{
    if(session!==pending)return;
    fallback.value=result.text;
    fallback.hidden=false;
    fallback.focus();fallback.select();
    status.textContent='選択した指示文を手動でコピーしてください。'+attach;
   }
  }catch(error){status.textContent=error.message;}
 }
 copy.addEventListener('click',()=>copyPrompt('generate'));
 consult.addEventListener('click',()=>copyPrompt('consult'));
 copyRevision.addEventListener('click',()=>copyPrompt('revise'));

 document.getElementById('design-character-prompt').addEventListener('click',event=>open(characterSlot,event.currentTarget));
 function init(){
  for(const slot of slots){
   const card=document.querySelector('[data-slot="'+slot.id+'"]');
   const button=document.createElement('button');
   button.type='button';button.className='part-open';button.textContent='個別設計・指示文';
   button.setAttribute('aria-label',slot.label+'の個別設計・指示文');
   button.addEventListener('click',()=>open(slot,button));
   card.append(button);
  }
 };
 function sync(project){
  if(!isWorkspace())return;
  if(project?.id!==session.project.id){leaveWorkspace();return;}
  session.project=project;
  if(!session.saving&&!same(session.base,baseline(project,session.slot.id))){
   const hadDraft=session.edited||Boolean(importInput.value);
   if(hadDraft){
    session.conflict=true;
    resetImportReview();
   }else{
    session.saved=savedPart(project,session.slot.id);
    session.base=baseline(project,session.slot.id);
    session.conflict=false;
    fillFields(project,session.saved);
   }
   keepDraft();
  }
  update();
 }
 function restore(project){
  const state=readPartState('view');
  const slot=state&&project&&state.projectId===project.id&&slots.find(item=>item.id===state.slotId);
  if(slot)open(slot,undefined,state);
 }
 return {init,sync,restore,openById:id=>{const slot=slots.find(item=>item.id===id);if(slot)open(slot);}};
}
