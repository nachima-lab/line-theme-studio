import {loadSkins,groupedSkins,color} from './skins.js';
import {renderPreview,renderBackground} from './preview.js';
import {IMAGE_SLOTS,createDraft,loadProject,saveProject,validateProject,parseBackup} from './store.js';
import {exportZip,importZip} from './backup-zip.js';
let draft=createDraft(),skins=[],backgroundUrl=null,saveQueue=Promise.resolve(),storageReady=false;
const groupsEl=document.getElementById('skin-groups');
const assetSlotsEl=document.getElementById('asset-slots');
const assetUrls=new Map();
const statusEl=document.getElementById('save-status');
const input=document.getElementById('background-input');
const removeButton=document.getElementById('remove-background');
const exportButton=document.getElementById('export-backup');
const importInput=document.getElementById('import-backup');
function status(message,error=false){statusEl.textContent=message;statusEl.classList.toggle('save-error',error);}
function queueSave(){
 if(!storageReady){status('自動保存できません。バックアップを利用してください。',true);return;}
 // 保存の順序を保証し、操作時点のデータをスナップショットにする。
 const snapshot={version:1,skinId:draft.skinId,images:{...draft.images}};
 status('保存中…');
 saveQueue=saveQueue.catch(()=>{}).then(()=>saveProject(snapshot)).then(()=>status('自動保存済み')).catch(error=>{status('保存失敗：バックアップを作成してください',true);console.error(error);});
}
function showBackground(){
 const item=draft.images.talkBackground;
 if(backgroundUrl){URL.revokeObjectURL(backgroundUrl);backgroundUrl=null;}
 if(item){backgroundUrl=URL.createObjectURL(item.blob);renderBackground(backgroundUrl);}
 else renderBackground(null);
 document.getElementById('background-status').textContent=item?'背景画像：'+item.name:'背景画像：未登録';
 removeButton.hidden=!item;
}

function renderAssetSlots(){
 if(!assetSlotsEl)return;
 for(const url of assetUrls.values())URL.revokeObjectURL(url);
 assetUrls.clear();assetSlotsEl.replaceChildren();
 for(const slot of IMAGE_SLOTS.filter(x=>x.id!=='talkBackground')){
  const item=draft.images[slot.id]??null;
  const card=document.createElement('article');card.className='asset-card';
  const heading=document.createElement('h3');heading.textContent=slot.label;
  const preview=document.createElement('div');preview.className='asset-preview';
  if(item){
   const url=URL.createObjectURL(item.blob);assetUrls.set(slot.id,url);
   const image=document.createElement('img');image.src=url;image.alt=slot.label+'の登録画像';preview.append(image);
  }else preview.textContent='画像未登録';
  const name=document.createElement('p');name.className='asset-filename';name.textContent=item?item.name:'まだ画像がありません';
  const controls=document.createElement('div');controls.className='asset-controls';
  const label=document.createElement('label');label.className='asset-upload';label.textContent=item?'画像を差し替える':'画像を登録する';
  const fileInput=document.createElement('input');fileInput.type='file';fileInput.accept='image/png,image/jpeg,image/webp,image/heic,image/heif';fileInput.hidden=true;
  fileInput.addEventListener('change',async()=>{
   const file=fileInput.files?.[0];if(!file)return;
 if(!/^image\/(png|jpeg|webp|heic|heif)$/.test(file.type)){alert('PNG・JPEG・WebP・HEIC画像を選んでください');fileInput.value='';return;}
   const url=URL.createObjectURL(file),img=new Image();
   img.onload=()=>{URL.revokeObjectURL(url);draft.images[slot.id]={name:file.name,blob:file};renderAssetSlots();queueSave();};
   img.onerror=()=>{URL.revokeObjectURL(url);alert('画像を読み込めませんでした。PNGかJPEGをお試しください。');fileInput.value='';};
   img.src=url;
  });
  label.append(fileInput);controls.append(label);
  if(item){
   const remove=document.createElement('button');remove.type='button';remove.className='asset-remove';remove.textContent='画像を外す';
   remove.addEventListener('click',()=>{draft.images[slot.id]=null;renderAssetSlots();queueSave();});
   controls.append(remove);
  }
  card.append(heading,preview,name,controls);assetSlotsEl.append(card);
 }
}

function chooseSkin(id,save=true){
 const skin=skins.find(s=>s.id===id);if(!skin)return;
 draft.skinId=skin.id;renderPreview(skin);
 groupsEl.querySelectorAll('.skin-tile[aria-pressed="true"]').forEach(el=>el.setAttribute('aria-pressed','false'));
 const selected=Array.from(groupsEl.querySelectorAll('.skin-tile')).find(el=>el.dataset.skinId===id);
 if(selected)selected.setAttribute('aria-pressed','true');
 if(save)queueSave();
}
function tile(skin){
 const button=document.createElement('button');button.type='button';button.className='skin-tile';button.dataset.skinId=skin.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',skin.displayName+'を選択');
 const sample=document.createElement('div');sample.className='tile-sample';sample.style.backgroundColor=color(skin,'tileSurface');
 const strip=document.createElement('div');strip.className='tile-strip';strip.style.backgroundColor=color(skin,'header');
 for(const side of ['other','own']){const circle=document.createElement('span');circle.className='tile-circle';circle.textContent='T';circle.style.backgroundColor=color(skin,side==='other'?'otherBubble':'ownBubble');circle.style.color=color(skin,side==='other'?'textOnOtherBubble':'textOnOwnBubble');strip.append(circle);}
 sample.append(strip);const label=document.createElement('span');label.className='tile-name';label.textContent=skin.displayName;button.append(sample,label);
 button.addEventListener('click',()=>chooseSkin(skin.id));return button;
}
async function init(){
 try{
  skins=await loadSkins();document.getElementById('skin-count').textContent=skins.length+'種類';
  for(const {group,skins:items} of groupedSkins(skins)){const section=document.createElement('section');const h=document.createElement('h3');h.className='group-heading';h.textContent=group+' ('+items.length+')';const grid=document.createElement('div');grid.className='tiles';items.forEach(s=>grid.append(tile(s)));section.append(h,grid);groupsEl.append(section);}
  try{draft=validateProject(await loadProject(),skins.map(s=>s.id));storageReady=true;status('自動保存が有効です');}
  catch(error){console.error(error);status('自動保存を利用できません。バックアップをご利用ください。',true);}
  chooseSkin(draft.skinId,false);showBackground();renderAssetSlots();
  input.disabled=false;exportButton.disabled=false;importInput.disabled=false;
 }catch(error){const p=document.getElementById('load-error');p.hidden=false;p.textContent=error.message+'。ページを再読み込みしてください。';status('初期化に失敗しました',true);}
}
input.addEventListener('change',()=>{
 const file=input.files?.[0];if(!file)return;
 if(!/^image\/(png|jpeg|webp|heic|heif)$/.test(file.type)){alert('PNG・JPEG・WebP・HEIC画像を選んでください');input.value='';return;}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{URL.revokeObjectURL(url);draft.images.talkBackground={name:file.name,blob:file};showBackground();queueSave();input.value='';};
 img.onerror=()=>{URL.revokeObjectURL(url);alert('画像を読み込めませんでした。PNGまたはJPEGをお試しください。');input.value='';};
 img.src=url;
});
removeButton.addEventListener('click',()=>{draft.images.talkBackground=null;showBackground();input.value='';queueSave();});
exportButton.addEventListener('click',async()=>{
 exportButton.disabled=true;status('バックアップを準備中…');
 try{
  await saveQueue.catch(()=>{});
  const blob=await exportZip(draft,skins.map(s=>s.id)),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='line-theme-studio-backup-'+new Date().toISOString().slice(0,10)+'.zip';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);status('バックアップを作成しました。ファイルを安全な場所に保管してください。');
 }catch(error){status('バックアップ作成失敗：'+error.message,true);}
 finally{exportButton.disabled=false;}
});
importInput.addEventListener('change',async()=>{
 const file=importInput.files?.[0];if(!file)return;
 try{
  const incoming=/\.json$/i.test(file.name)?parseBackup(await file.text(),skins.map(s=>s.id)):await importZip(file,skins.map(s=>s.id));
  if(!confirm('現在の作品をバックアップの内容で置き換えます。よろしいですか？'))return;
  // 保存キューを待ってから取り込み、保存が成功してから画面を置換する。
  await saveQueue.catch(()=>{});
  if(!storageReady)throw new Error('保存機能が使えないため、取り込みを中止しました');
  await saveProject(incoming);
  draft=incoming;chooseSkin(draft.skinId,false);showBackground();renderAssetSlots();status('バックアップを復元しました');
 }catch(error){status('読み込み失敗：'+error.message,true);alert('バックアップを読み込めませんでした：'+error.message);}
 finally{importInput.value='';}
});
init();
