import {IMAGE_SLOTS} from './store.js';

const menuOff=id=>/^menu-.+-off$/.test(id);

export function nextImage(project,exclude){
 const {images,production:{design}}=project;
 const redo=IMAGE_SLOTS.find(slot=>slot.id!==exclude&&images[slot.id]&&design?.redo.includes(slot.id));
 if(redo)return {...redo,redo:true};
 const missing=IMAGE_SLOTS.filter(slot=>slot.id!==exclude&&!images[slot.id]);
 return missing.find(slot=>Object.keys(design?.parts[slot.id]??{}).length>0)??missing[0];
}

export function setupProductionList({selectColorSource,toggleRedo,openPart}){
 const cards=new Map();
 const recommendation=document.getElementById('production-recommendation');
 const jump=document.getElementById('production-recommendation-jump');
 const previewSlot=document.getElementById('preview-source-slot');
 const previewJump=document.getElementById('preview-source-jump');
 let suggested;

 function focusTarget(element){
  element.focus({preventScroll:true});
  element.scrollIntoView({block:'start'});
 }
 jump.addEventListener('click',()=>{if(suggested)openPart(suggested.id);});
 previewJump.addEventListener('click',()=>openPart(previewSlot.value));

 function init(){
  for(const {id,label} of IMAGE_SLOTS){
   previewSlot.add(new Option(label,id));
   const card=document.querySelector('[data-slot="'+id+'"]');
   card.tabIndex=-1;
   const state=document.createElement('p');
   state.className='production-card-status';
   const redo=document.createElement('button');
   redo.type='button';
   redo.className='production-card-action';
   redo.addEventListener('click',()=>toggleRedo(id));
   card.append(state,redo);
   let color;
   if(menuOff(id)){
    color=document.createElement('button');
    color.type='button';
    color.className='production-card-action';
    color.textContent='このOFFからONを作る';
    color.setAttribute('aria-label',label+'からONを作る');
    color.addEventListener('click',()=>{
     if(selectColorSource(id))focusTarget(document.getElementById('production-source'));
    });
    card.append(color);
   }
   cards.set(id,{card,state,redo,color});
  }
  previewSlot.value='talkBackground';
 }

 function render(project){
  suggested=project?nextImage(project):undefined;
  recommendation.textContent=suggested
   ?'おすすめ：'+suggested.label+(suggested.redo?'（作り直し）':'')
   :'原画25点が登録済みです。確認タブで仕上がりを確認できます。';
  jump.hidden=!suggested;
  for(const [id,{state,redo,color}] of cards){
   const registered=Boolean(project?.images[id]);
   const marked=Boolean(project?.production.design?.redo.includes(id));
   const design=Object.keys(project?.production.design?.parts[id]??{}).length>0;
   const text=marked&&registered?'作り直し予定':registered?'登録済み':design?'下書きあり・未登録':'未登録';
   if(state.textContent!==text)state.textContent=text;
   redo.hidden=!registered;
   redo.textContent=marked?'作り直し指定を解除':'作り直しに指定';
   redo.setAttribute('aria-pressed',String(marked));
   if(color)color.hidden=!registered;
  }
 }

 function selectPreview(tab){
  previewSlot.value={talk:'talkBackground',passcode:'passcodeOff',menu:'menuBackground'}[tab];
 }
 return {init,render,selectPreview};
}
