import {IMAGE_ACCEPT} from './store.js';
import {makeWorkingPreview} from './image-preview.js';
import {createRecoverablePreview} from './recoverable-preview.js';
import {HEX_COLOR,TEMPLATES,templateText} from './production-data.js';
import {setupProductionTools} from './production-tools.js';

export function setupProductionPanel({save,setImage}){
 const id=value=>document.getElementById(value);
 const list=id('production-colors');
 const newColor=id('production-new-color');
 const addColor=id('production-add-color');
 const colorError=id('production-color-error');
 const style=id('production-style');
 const world=id('production-world');
 const templates=id('production-templates');
 const feedback=id('production-status');
 const copyField=id('production-copy-fallback');
 const fileInput=id('production-character-input');
 const thumbnail=id('production-character-image');
 const fileLabel=id('production-character-name');
 const remove=id('production-remove-character');
 const tools=setupProductionTools(setImage);
 const sheetError=id('production-character-error');
 const characterPreview=createRecoverablePreview({
  label:'キャラ表',
  attach:image=>{thumbnail.replaceChildren(...(image?[image]:[]));thumbnail.hidden=!image;},
  report:message=>{sheetError.textContent=message;sheetError.hidden=!message;}
 });
 let project,selection=0;

 function update(changes){save({...project.production,...changes});}

 async function copy(text){
  if(!text){feedback.textContent='コピーする内容を入力してください。';return;}
  copyField.hidden=true;
  try{
   await navigator.clipboard.writeText(text);
   feedback.textContent='コピーしました。';
  }catch{
   copyField.value=text;
   copyField.hidden=false;
   copyField.focus();
   copyField.select();
   feedback.textContent='選択した内容を端末の「コピー」でコピーしてください。';
  }
 }

 function setColor(input,index){
  const value=input.value.trim().toUpperCase();
  if(!HEX_COLOR.test(value)){
   colorError.textContent='色コードを #RRGGBB で入力してください。';
   return false;
  }
  colorError.textContent='';
  const colors=[...project.production.colors];
  colors[index]=value;
  update({colors});
  feedback.textContent='固定色を保存しました。';
  return true;
 }

 function renderColors(colors){
  list.replaceChildren(...colors.map((code,index)=>{
   const row=document.createElement('li');
   const swatch=document.createElement('button');
   swatch.type='button';swatch.className='production-swatch';
   swatch.style.setProperty('--swatch',code);
   swatch.textContent=code;
   swatch.setAttribute('aria-label',code+' をコピー');
   swatch.addEventListener('click',()=>copy(code));
   const input=document.createElement('input');
   input.type='text';input.value=code;input.spellcheck=false;
   input.setAttribute('aria-label',(index+1)+'番目の色コード');
   input.addEventListener('change',()=>{if(!setColor(input,index))input.value=code;});
   const discard=document.createElement('button');
   discard.type='button';discard.textContent='削除';
   discard.setAttribute('aria-label',(index+1)+'番目の固定色を削除');
   discard.addEventListener('click',()=>update({colors:project.production.colors.filter((_,i)=>i!==index)}));
   row.append(swatch,input,discard);
   return row;
  }));
  newColor.disabled=addColor.disabled=colors.length>=8;
 }

 function clearColorError(){colorError.textContent='';}
 newColor.addEventListener('input',clearColorError);
 list.addEventListener('input',clearColorError);
 colorError.closest('details').addEventListener('toggle',event=>{
  if(!event.currentTarget.open)clearColorError();
 });
 addColor.addEventListener('click',()=>{
  const index=project.production.colors.length;
  if(index<8&&setColor(newColor,index))newColor.value='';
 });
 style.addEventListener('input',()=>update({style:style.value}));
 world.addEventListener('input',()=>update({world:world.value}));

 const fields=TEMPLATES.map(([key,label,initial])=>{
  const block=document.createElement('details');
  const title=document.createElement('summary');
  title.textContent=label;
  const editor=document.createElement('textarea');
  editor.rows=4;editor.setAttribute('aria-label',label+'の指示文');
  editor.addEventListener('input',()=>update({templates:{...project.production.templates,[key]:editor.value}}));
  const copyButton=document.createElement('button');
  copyButton.type='button';copyButton.textContent='コピー';
  copyButton.addEventListener('click',()=>copy(templateText(project.production,key,initial)));
  const reset=document.createElement('button');
  reset.type='button';reset.textContent='初期文面に戻す';
  reset.addEventListener('click',()=>{
   const overrides={...project.production.templates};
   delete overrides[key];
   update({templates:overrides});
  });
  block.append(title,editor,copyButton,reset);
  templates.append(block);
  return {key,editor,initial,reset};
 });

 fileInput.accept=IMAGE_ACCEPT;
 id('production-choose-character').addEventListener('click',()=>fileInput.click());
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files[0];
  fileInput.value='';
  if(!file)return;
  const request=++selection,current=project;
  if(!IMAGE_ACCEPT.split(',').includes(file.type)){feedback.textContent='対応する画像形式を選んでください。';return;}
  try{
   const preview=await makeWorkingPreview(file);
   if(request===selection&&project?.id===current.id){
    update({characterSheet:{name:file.name,blob:file,preview}});
    feedback.textContent='キャラ表を登録しました。';
   }
  }catch{if(request===selection)feedback.textContent='キャラ表を読み込めませんでした。';}
 });
 remove.addEventListener('click',()=>{
  selection++;
  update({characterSheet:null});
  feedback.textContent='キャラ表を取り外しました。';
 });

 function render(next,reopened=false){
  const old=project;
  project=next;
  tools(next);
  if(reopened||old?.id!==next?.id)selection++;
  if(old?.id!==next?.id){
   feedback.textContent='';
   clearColorError();
   newColor.value='';
   copyField.hidden=true;
   copyField.value='';
  }
  characterPreview.show(next,next?.production.characterSheet);
  if(!next){remove.hidden=true;return;}
  const p=next.production,last=old?.production;
  if(old?.id!==next.id||last?.colors!==p.colors)renderColors(p.colors);
  if(style.value!==p.style)style.value=p.style;
  if(world.value!==p.world)world.value=p.world;
  for(const {key,editor,initial,reset} of fields){
   const text=p.templates[key]??initial;
   if(editor.value!==text)editor.value=text;
   reset.disabled=!Object.hasOwn(p.templates,key);
  }
  remove.hidden=!p.characterSheet;
  fileLabel.textContent=p.characterSheet?.name??'未登録';
 }
 render.retryFailed=characterPreview.retry;
 render.selectColorSource=tools.selectColorSource;
 return render;
}
