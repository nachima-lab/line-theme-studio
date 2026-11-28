import {PART_FIELDS,validateDesign} from './design-sheet.js';
import {imagePrompt,PART_LABELS} from './image-prompt.js';

const characterSlot={id:'characterSheet',label:'キャラ表'};
export function setupPartPanel({slots,activeProject,commit}){
 const get=id=>document.getElementById('part-'+id);
 const dialog=get('dialog'),fields=get('fields'),status=get('status');
 const reference=get('reference'),referenceField=get('reference-field'),fallback=get('fallback');
 const copy=get('copy'),save=get('save');
 const ids=slots.map(slot=>slot.id);
 const controls=new Map();
 let session;

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
  const blank=session?.slot!==characterSlot&&!part;
  copy.textContent=blank?'この枠の相談文をコピー':'画像生成の指示文をコピー';
  get('characters').hidden=get('character-selection').value!=='specified';
  referenceField.hidden=session?.slot===characterSlot||!session?.project.production.characterSheet||part?.characterIds?.length===0;
 }
 function open(slot,opener){
  const project=activeProject();
  if(!project)return;
  const saved=project.production.design?.parts[slot.id];
  session={slot,opener,project,saved};
  get('heading').textContent=slot===characterSlot?'キャラ表作成の指示文':slot.label+'の個別設計';
  fields.hidden=save.hidden=slot===characterSlot;
  get('character-field').hidden=slot===characterSlot;
  reference.checked=false;
  status.textContent='';
  fallback.hidden=true;
  fallback.value='';
  for(const [key,input] of controls)input.value=key==='motifs'?(saved?.motifs??[]).join('\n'):saved?.[key]??'';
  get('character-selection').value=saved?.characterIds===undefined?'all':'specified';
  get('characters').replaceChildren(...(project.production.design?.characters??[]).map(character=>{
   const label=document.createElement('label');
   const box=document.createElement('input');
   box.type='checkbox';box.value=character.id;box.checked=saved?.characterIds?.includes(character.id)??false;
   label.append(box,character.name);
   return label;
  }));
  update();
  dialog.showModal();
 }
 dialog.addEventListener('input',update);
 dialog.addEventListener('close',()=>{session?.opener.focus();session=null;});
 get('close').addEventListener('click',()=>dialog.close());
 save.addEventListener('click',async()=>{
  if(!session)return;
  const pending=session;
  const {project,slot,saved}=pending;
  const part=draft();
  save.disabled=true;
  await commit(project.id,current=>{
   if(JSON.stringify(current.production.design?.parts[slot.id])!==JSON.stringify(saved)){
    throw new Error('個別設計が変更されました。画面を開き直してください。');
   }
   return withPart(current,slot.id,part);
  },(success,error)=>{
   save.disabled=false;
   if(session!==pending)return;
   if(success)dialog.close();
   else status.textContent=error?.message??'個別設計を保存できませんでした。';
  });
 });
 copy.addEventListener('click',async()=>{
  if(!session)return;
  fallback.hidden=true;
  try{
   const project=activeProject();
   if(project?.id!==session.project.id)throw new Error('対象の作品を開き直してください。');
   const part=session.slot===characterSlot?undefined:draft();
   const source=session.slot===characterSlot?project:withPart(project,session.slot.id,part);
   const result=imagePrompt(source,session.slot,{part,useReference:!referenceField.hidden&&reference.checked});
   const attach=result.reference?' ChatGPTで「'+project.production.characterSheet.name+'」を添付してください。':'';
   try{
    await navigator.clipboard.writeText(result.text);
    status.textContent='コピーしました。ChatGPTに貼り付けてください。'+attach;
   }catch{
    fallback.value=result.text;
    fallback.hidden=false;
    fallback.focus();fallback.select();
    status.textContent='選択した指示文を手動でコピーしてください。'+attach;
   }
  }catch(error){status.textContent=error.message;}
 });

 document.getElementById('design-character-prompt').addEventListener('click',event=>open(characterSlot,event.currentTarget));
 return ()=>{
  for(const slot of slots){
   const card=document.querySelector('[data-slot="'+slot.id+'"]');
   const button=document.createElement('button');
   button.type='button';button.className='part-open';button.textContent='個別設計・指示文';
   button.setAttribute('aria-label',slot.label+'の個別設計・指示文');
   button.addEventListener('click',()=>open(slot,button));
   card.append(button);
  }
 };
}
