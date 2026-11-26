import {color} from './skins.js';
import {readableHeaderText} from './preview.js';
import {OUTPUT_FILES,adjustment} from './export-spec.js';
import {renderSlot} from './export-images.js';
import {IMAGE_SLOTS} from './store.js';

const passcodeSlots=['passcodeOff','passcodeOn'];
const menuOffSlots=IMAGE_SLOTS.filter(slot=>slot.id.startsWith('menu-')&&slot.id.endsWith('-off'));
const specs=OUTPUT_FILES.filter(file=>
 ['i_12.png','i_13.png','i_11.png'].includes(file.name)||(file.kind==='icon'&&file.width===128)
);
const slotLabels=new Map(IMAGE_SLOTS.map(slot=>[slot.id,slot.label]));

function sprite(parent){
 const image=document.createElement('img');
 image.alt='';image.hidden=true;
 const empty=document.createElement('span');
 empty.className='preview-placeholder';
 empty.setAttribute('aria-hidden','true');
 parent.append(image,empty);
 let current;
 return url=>{
  if(current===url)return;
  current=url;
  if(url)image.src=url;
  else image.removeAttribute('src');
  image.hidden=!url;
  empty.hidden=Boolean(url);
 };
}

function control(label){
 const button=document.createElement('button');
 button.type='button';
 button.textContent=label;
 return button;
}

export function setupExtraPreviews(){
 const upper=document.getElementById('passcode-upper');
 const keypad=document.getElementById('passcode-keypad');
 const positions=document.getElementById('passcode-positions');
 const keys=document.getElementById('passcode-keys');
 const menu=document.getElementById('menu-preview-items');
 const passError=document.getElementById('passcode-preview-error');
 const menuError=document.getElementById('menu-preview-error');
 const pressed=[false,false,false,false];
 let selectedMenu=null,projectId,queue=Promise.resolve();
 const assets=new Map();
 const displayUrl=slot=>assets.get(slot)?.url;

 const digits=pressed.map((_,index)=>{
  const button=control(''),show=sprite(button);
  button.addEventListener('click',()=>{
   pressed[index]=!pressed[index];
   updatePasscode();
  });
  positions.append(button);
  return {button,show};
 });

 const enterDigit=()=>{
  const index=pressed.indexOf(false);
  if(index!==-1)pressed[index]=true;
  updatePasscode();
 };
 for(const key of ['1','2','3','4','5','6','7','8','9','クリア','0','消去']){
  const button=control(key);
  button.addEventListener('click',()=>{
   if(key==='クリア'){pressed.fill(false);updatePasscode();}
   else if(key==='消去'){
    const index=pressed.lastIndexOf(true);
    if(index!==-1)pressed[index]=false;
    updatePasscode();
   }else enterDigit();
  });
  keys.append(button);
 }

 const menuButtons=menuOffSlots.map(({id,label})=>{
  const feature=id.slice(5,-4);
  const button=control('');
  const glyph=document.createElement('span');
  glyph.className='preview-glyph';
  const title=document.createElement('span');
  title.className='menu-label';
  title.textContent=label.replace(/^メニューアイコン /,'').replace(/ OFF$/,'');
  const show=sprite(glyph);
  button.append(glyph,title);
  button.addEventListener('click',()=>{
   selectedMenu=selectedMenu===feature?null:feature;
   updateMenu();
  });
  menu.append(button);
  return {button,show,feature};
 });

 function updatePasscode(){
  for(const [index,{button,show}] of digits.entries()){
   const on=pressed[index];
   button.setAttribute('aria-pressed',String(on));
   button.setAttribute('aria-label',(index+1)+'桁目 '+(on?'ON':'OFF'));
   show(displayUrl(passcodeSlots[Number(on)]));
  }
 }

 function updateMenu(){
  const background=displayUrl('menuBackground');
  menu.style.backgroundImage=background?'url("'+background+'")':'none';
  for(const {button,show,feature} of menuButtons){
   const on=selectedMenu===feature;
   button.setAttribute('aria-pressed',String(on));
   show(displayUrl('menu-'+feature+(on?'-on':'-off')));
  }
 }

 function updateStatus(){
  const errors=[...assets].filter(([,asset])=>asset.error);
  for(const [element,isPasscode] of [[passError,true],[menuError,false]]){
   const labels=errors.filter(([slot])=>passcodeSlots.includes(slot)===isPasscode).map(([slot])=>slotLabels.get(slot));
   element.textContent=labels.length?'プレビューを表示できない原画：'+labels.join('、'):'';
   element.hidden=!labels.length;
  }
 }

 function replace(slot,blob,settings,spec,key){
  const old=assets.get(slot);
  if(old?.blob===blob&&old?.key===key)return;
  if(!blob){
   if(old?.url)URL.revokeObjectURL(old.url);
   assets.delete(slot);
   return;
  }
  const asset={blob,key,url:old?.url};
  assets.set(slot,asset);
  // 大きな原画を並行処理せず、差し替えが続いた場合は最新の結果だけを表示する。
  queue=queue.then(async()=>{
   if(assets.get(slot)!==asset)return;
   let url;
   try{
    const [file]=await renderSlot(blob,[spec],settings);
    if(assets.get(slot)!==asset)return;
    url=URL.createObjectURL(file.blob);
    const image=new Image();
    image.src=url;
    await image.decode();
    if(assets.get(slot)!==asset){URL.revokeObjectURL(url);return;}
    const previous=asset.url;
    asset.url=url;
    if(previous)URL.revokeObjectURL(previous);
   }catch{
    if(url)URL.revokeObjectURL(url);
    if(assets.get(slot)!==asset)return;
    if(asset.url)URL.revokeObjectURL(asset.url);
    asset.url=undefined;
    asset.error=true;
   }
   updatePasscode();updateMenu();updateStatus();
  });
 }

 function renderProject(project){
  if(projectId!==project?.id){
   projectId=project?.id;
   for(const {url} of assets.values())if(url)URL.revokeObjectURL(url);
   assets.clear();
   pressed.fill(false);
   selectedMenu=null;
  }
  const settings=project?.exportSettings;
  for(const spec of specs){
   const key=spec.kind==='passcode'
    ?[adjustment(settings,'passcodeWhite'),adjustment(settings,'passcodeWidth')].join(':')
    :spec.kind==='crop'?adjustment(settings,spec.name):'';
   replace(spec.slot,project?.images[spec.slot]?.blob,settings,spec,key);
  }
  updatePasscode();updateMenu();updateStatus();
 }

 function renderSkin(skin){
  for(const [element,key] of [[upper,'passcodeBackgroundUpper'],[keypad,'passcodeBackgroundKeypad']]){
   const background=color(skin,key);
   element.style.backgroundColor=background??'';
   element.style.setProperty('--preview-ink',readableHeaderText(background));
  }
 }
 return {renderProject,renderSkin};
}
