import {IMAGE_SLOTS} from './store.js';
import {HEX_COLOR} from './production-data.js';
import {removeExteriorWhite,replaceColor} from './production-images.js';

export function setupProductionTools(setImage){
 const byId=id=>document.getElementById(id);
 const kind=byId('production-tool');
 const slots=byId('production-source');
 const colorFields=byId('production-color-fields');
 const from=byId('production-from');
 const to=byId('production-to');
 const fixed=byId('production-fixed-color');
 const tolerance=byId('production-tolerance');
 const thresholdField=byId('production-threshold-field');
 const threshold=byId('production-threshold');
 const thresholdValue=byId('production-threshold-value');
 const toleranceValue=byId('production-tolerance-value');
 const preview=byId('production-draft');
 const message=byId('production-draft-status');
 const previewButton=byId('production-preview-draft');
 const adopt=byId('production-adopt-draft');
 const undo=byId('production-undo');
 let project,draft,url,request=0,processing=false;

 function isColor(){return kind.value==='color';}
 function target(){return isColor()?slots.value.replace(/-off$/,'-on'):slots.value;}
 function validDraft(item){
  return item&&project?.id===item.id&&project.images[item.source]===item.original
   &&project.images[item.target]===item.previous;
 }

 function clearDraft(){
  request++;
  processing=false;
  draft=null;
  preview.hidden=true;
  preview.removeAttribute('src');
  if(url)URL.revokeObjectURL(url);
  url=null;
  adopt.disabled=true;
 }

 function refreshControls(){
  previewButton.disabled=processing||!project?.images[slots.value];
  const canUndo=!isColor()&&Boolean(project?.images[slots.value]&&project.production.undo[slots.value]);
  undo.hidden=!canUndo;
 }

 function refreshSlots(){
  const previous=slots.value;
  const choices=IMAGE_SLOTS.filter(slot=>!isColor()||/^menu-.+-off$/.test(slot.id));
  slots.replaceChildren(...choices.map(({id,label})=>new Option(label+(project?.images[id]?'':'（未登録）'),id)));
  if(choices.some(({id})=>id===previous))slots.value=previous;
  colorFields.hidden=!isColor();
  thresholdField.hidden=isColor();
  refreshControls();
 }

 function invalidate(){
  clearDraft();
  refreshControls();
  message.textContent='';
  thresholdValue.value=threshold.value;
  toleranceValue.value=tolerance.value;
 }

 kind.addEventListener('change',()=>{refreshSlots();invalidate();});
 for(const field of [slots,from,to,tolerance,threshold])field.addEventListener('input',invalidate);
 fixed.addEventListener('change',()=>{
  if(fixed.value)to.value=fixed.value;
  invalidate();
 });

 previewButton.addEventListener('click',async()=>{
  invalidate();
  const source=slots.value,original=project?.images[source],destination=target();
  if(!original)return;
  const color=isColor();
  if(color&&(!HEX_COLOR.test(from.value)||!HEX_COLOR.test(to.value))){
   message.textContent='置換する色を #RRGGBB で入力してください。';return;
  }
  const item={id:project.id,source,original,target:destination,previous:project.images[destination],color};
  const current=request;
  processing=true;refreshControls();
  message.textContent='下書きを作成中…';
  try{
   const blob=await (color?replaceColor(original.blob,from.value,to.value,tolerance.valueAsNumber)
    :removeExteriorWhite(original.blob,threshold.valueAsNumber));
   if(request!==current||!validDraft(item))return;
   const stem=original.name.replace(/\.[^.]+$/,'');
   const name=stem+(color?'-on.png':'-transparent.png');
   draft={...item,image:{blob,name}};
   url=URL.createObjectURL(blob);
   preview.src=url;preview.hidden=false;adopt.disabled=false;
   message.textContent=color?'置換の範囲や縁を確認し、よければONスロットに採用してください。':'透明になった範囲を確認し、よければ採用してください。';
  }catch(error){if(request===current)message.textContent='下書きを作成できませんでした。'+error.message;}
  finally{if(request===current){processing=false;refreshControls();}}
 });

 adopt.addEventListener('click',()=>{
  if(!validDraft(draft)){invalidate();return;}
  const item=draft;
  if(item.color&&item.previous&&!confirm('登録済みのON画像を、この下書きに差し替えますか？'))return;
  setImage(item.target,item.image,!item.color);
  invalidate();
  message.textContent='下書きを採用しました。';
 });

 undo.addEventListener('click',()=>{
  const slot=slots.value,original=project?.production.undo[slot];
  if(!project?.images[slot]||!original)return;
  setImage(slot,original,false);
  invalidate();
  message.textContent='直前の透過処理を取り消しました。';
 });

 return function render(next){
  const previous=project;
  project=next;
  if(previous?.id!==next?.id||previous?.images!==next?.images){
   invalidate();
   refreshSlots();
  }
  if(previous?.production.colors!==next?.production.colors||previous?.id!==next?.id){
   fixed.replaceChildren(new Option('固定色を選択',''),...(next?.production.colors??[]).map(code=>new Option(code,code)));
  }
  refreshControls();
 };
}
