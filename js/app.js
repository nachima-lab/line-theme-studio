import {setupSalesPanel} from './sales-panel.js';
import {setupWorkflowTabs} from './workflow-tabs.js';
import {setupWorkflowProgress} from "./workflow-progress.js";
import {loadSkins,groupedSkins,color} from './skins.js';
import {renderPreview,renderBackground} from './preview.js';
import {IMAGE_ACCEPT,IMAGE_SLOTS,createProject,defineCollection,loadCollection,saveCollection,parseLegacyJson} from './store.js';
import {exportZip,importZip} from './backup-zip.js';
import {makeWorkingPreview} from './image-preview.js';
import {createRecoverablePreview} from './recoverable-preview.js';
import {setupExportPanel} from './export-panel.js';
import {setupPreviewTabs} from './preview-tabs.js';
import {setupExtraPreviews} from './extra-previews.js';
import {setupProductionPanel} from './production-panel.js';

let skins=[],skinIds=[],collection,revision;
let saveQueue=Promise.resolve(),imageQueue=Promise.resolve();
let dirty=false,busy=false,saveError=null;
const groupsEl=document.getElementById('skin-groups');
const assetSlotsEl=document.getElementById('asset-slots');
const menuSlotsEl=document.getElementById('menu-slots');
const main=document.querySelector('main');
const editors=main.querySelectorAll('.preview-section,.assets-section,.picker-section,.production-section');
const assetViews=new Map(),pendingImages=new Map();
const statusEl=document.getElementById('save-status');
const input=document.getElementById('background-input');
const chooseBackground=document.getElementById('choose-background');
const removeButton=document.getElementById('remove-background');
const exportButton=document.getElementById('export-backup');
const importInput=document.getElementById('import-backup');
const chooseBackup=document.getElementById('choose-backup');
const list=document.getElementById('project-list');
const newButton=document.getElementById('new-project');
const renameButton=document.getElementById('rename-project');
const deleteButton=document.getElementById('delete-project');
setupPreviewTabs();
setupWorkflowTabs();
const extraPreviews=setupExtraPreviews();
const renderSales=setupSalesPanel({save:sales=>updateProject({sales})});
const renderProduction=setupProductionPanel({save:production=>updateProject({production}),setImage});
const renderProgress=setupWorkflowProgress();
const renderExport=setupExportPanel({
 saveSettings:exportSettings=>updateProject({exportSettings}),runOperation,renderProgress
});

const backgroundError=document.getElementById('background-preview-error');
const backgroundPreview=createRecoverablePreview({
 label:'トーク背景',background:true,
 attach:(_,url)=>renderBackground(url),
 report:message=>{backgroundError.textContent=message;backgroundError.hidden=!message;},
 savePreview:(projectId,item,preview)=>savePreviewRepair('talkBackground',projectId,item,preview)
});

function retryFailedPreviews(){
 backgroundPreview.retry();
 for(const view of assetViews.values())view.display.retry();
 extraPreviews.retryFailed();
 renderProduction.retryFailed();
}
window.addEventListener('pageshow',retryFailedPreviews);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible')retryFailedPreviews();
});

function status(message,error=false){
 statusEl.textContent=message;
 statusEl.classList.toggle('save-error',error);
}

function activeProject(){
 return collection.projects.find(project=>project.id===collection.activeId);
}

function queueSave(){
 const snapshot=collection;
 dirty=true;
 status('保存中…');
 saveQueue=saveQueue.then(async()=>{
  try{
   revision=await saveCollection(snapshot,revision);
   if(snapshot===collection){
    dirty=false;
    saveError=null;
    if(!busy)status('自動保存済み');
   }
  }catch(error){
   saveError=error;
   if(!busy)status('自動保存に失敗しました。'+error.message,true);
  }
 });
}

async function runOperation(message,operation){
 if(busy||!collection)return;
 busy=true;
 main.inert=true;
 status(message);
 try{
  await imageQueue;
  await saveQueue;
  const result=await operation();
  status(result+(saveError?' 自動保存に失敗しました。'+saveError.message:''),Boolean(saveError));
 }catch(error){
  const extra=saveError&&saveError!==error?' 自動保存にも失敗しました。'+saveError.message:'';
  status('操作に失敗しました。'+error.message+extra,true);
 }finally{
  busy=false;
  main.inert=false;
  list.value=collection.activeId??'';
 }
}

async function commitCollection(next){
 revision=await saveCollection(next,revision);
 collection=next;
 dirty=false;
 saveError=null;
 renderCollection();
}

function changeCollection(build){
 return runOperation('作品を更新中…',async()=>{
  if(dirty){
   try{revision=await saveCollection(collection,revision);dirty=false;saveError=null;}
   catch(error){saveError=error;throw error;}
  }
  await commitCollection(build());
  return '自動保存済み';
 });
}

function updateProject(changes){
 const updated={...activeProject(),...changes};
 collection=defineCollection(collection.projects.map(project=>project.id===updated.id?updated:project),updated.id);
 queueSave();
 renderExport(updated);
 extraPreviews.renderProject(updated);
 renderProduction(updated);
 renderSales(updated,skins.find(s=>s.id===updated.skinId)?.displayName);
}

function savePreviewRepair(slotId,projectId,item,preview){
 const project=activeProject();
 if(!project||busy||project.id!==projectId||pendingImages.has(slotId)||project.images[slotId]!==item)return;
 const updated={...project,images:{...project.images,[slotId]:{...item,preview}}};
 collection=defineCollection(collection.projects.map(candidate=>candidate.id===project.id?updated:candidate),project.id);
 queueSave();
}

function showBackground(){
 const project=activeProject(),item=project?.images.talkBackground;
 backgroundPreview.show(project,item);
 document.getElementById('background-status').textContent=item?'背景画像：'+item.name:'背景画像：未登録';
 chooseBackground.textContent=item?'背景画像を差し替える':'背景画像を登録';
 removeButton.hidden=!item;
}

function setImage(slotId,item,rememberOriginal=false){
 pendingImages.delete(slotId);
 const project=activeProject();
 const images={...project.images};
 const undo={...project.production.undo};
 if(rememberOriginal&&images[slotId])undo[slotId]=images[slotId];
 else delete undo[slotId];
 if(item)images[slotId]=item;
 else delete images[slotId];
 updateProject({images,production:{...project.production,undo}});
 if(slotId==='talkBackground')showBackground();
 else renderAssetSlot(slotId);
}

function selectImage(slotId,fileInput){
 const file=fileInput.files?.[0];
 fileInput.value='';
 if(!file||busy||!activeProject())return;
 if(!IMAGE_ACCEPT.split(',').includes(file.type)){
  alert('PNG・JPEG・WebP・HEIC画像を選んでください');
  return;
 }
 const request={},projectId=collection.activeId;
 pendingImages.set(slotId,request);
 const isCurrent=()=>pendingImages.get(slotId)===request&&collection.activeId===projectId;
 // 大きな画像を同時にデコードしない。
 imageQueue=imageQueue.then(async()=>{
  if(!isCurrent())return;
  try{
   const preview=await makeWorkingPreview(file);
   if(isCurrent())setImage(slotId,{name:file.name,blob:file,preview});
  }catch{
   if(isCurrent())alert('画像を読み込めませんでした。PNGまたはJPEGをお試しください。');
  }finally{
   if(isCurrent())pendingImages.delete(slotId);
  }
 });
}

function removeImage(slotId){
 pendingImages.delete(slotId);
 setImage(slotId,null);
}

function renderAssetSlot(slotId){
 const view=assetViews.get(slotId);
 const project=activeProject(),item=project?.images[slotId];
 view.display.show(project,item);
 if(!item)view.preview.textContent='画像未登録';
 view.name.textContent=item?.name??'';
 const action=item?'画像を差し替える':'画像を登録する';
 view.upload.textContent=action;
 view.upload.setAttribute('aria-label',view.label+'の'+action);
 view.remove.hidden=!item;
}

function initAssetSlots(){
 for(const slot of IMAGE_SLOTS){
  if(slot.id==='talkBackground')continue;
  const card=document.createElement('article');card.className='asset-card';card.dataset.slot=slot.id;
  const heading=document.createElement('h3');heading.textContent=slot.label;
  const preview=document.createElement('div');preview.className='asset-preview';
  const name=document.createElement('p');name.className='asset-filename';name.setAttribute('aria-live','polite');
  const controls=document.createElement('div');controls.className='asset-controls';

  const fileInput=document.createElement('input');
  fileInput.type='file';fileInput.accept=IMAGE_ACCEPT;fileInput.hidden=true;
  fileInput.addEventListener('change',()=>selectImage(slot.id,fileInput));
  const upload=document.createElement('button');upload.type='button';upload.className='asset-upload';
  upload.addEventListener('click',()=>fileInput.click());

  const remove=document.createElement('button');remove.type='button';remove.className='asset-remove';
  remove.textContent='画像を外す';
  remove.setAttribute('aria-label',slot.label+'の画像を外す');
  remove.addEventListener('click',()=>{removeImage(slot.id);upload.focus();});

  controls.append(upload,fileInput,remove);
  card.append(heading,preview,name,controls);
  (slot.id.startsWith('menu-')?menuSlotsEl:assetSlotsEl).append(card);
  const display=createRecoverablePreview({
   label:slot.label,
   attach:image=>preview.replaceChildren(...(image?[image]:[])),
   report:message=>{if(message)preview.textContent=message;},
   savePreview:(projectId,item,copy)=>savePreviewRepair(slot.id,projectId,item,copy)
  });
  assetViews.set(slot.id,{label:slot.label,preview,name,upload,remove,display});
 }
}

function chooseSkin(id,save=true){
 const skin=skins.find(candidate=>candidate.id===id);
 if(!skin)return;
 if(save)updateProject({skinId:id});
 renderPreview(skin);
 extraPreviews.renderSkin(skin);
 for(const button of groupsEl.querySelectorAll('.skin-tile')){
  button.setAttribute('aria-pressed',String(button.dataset.skinId===id));
 }
}

function tile(skin){
 const button=document.createElement('button');button.type='button';button.className='skin-tile';button.dataset.skinId=skin.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',skin.displayName+'を選択');
 const sample=document.createElement('div');sample.className='tile-sample';sample.style.backgroundColor=color(skin,'tileSurface');
 const strip=document.createElement('div');strip.className='tile-strip';strip.style.backgroundColor=color(skin,'header');
 for(const side of ['other','own']){const circle=document.createElement('span');circle.className='tile-circle';circle.textContent='T';circle.style.backgroundColor=color(skin,side==='other'?'otherBubble':'ownBubble');circle.style.color=color(skin,side==='other'?'textOnOtherBubble':'textOnOwnBubble');strip.append(circle);}
 sample.append(strip);const label=document.createElement('span');label.className='tile-name';label.textContent=skin.displayName;button.append(sample,label);
 button.addEventListener('click',()=>chooseSkin(skin.id));return button;
}
function renderCollection(){
 list.replaceChildren(...collection.projects.map(project=>new Option(project.name,project.id)));
 const project=activeProject();
 list.value=project?.id??'';
 list.disabled=renameButton.disabled=deleteButton.disabled=!project;
 document.getElementById('empty-projects').hidden=Boolean(project);
 for(const section of editors)section.hidden=!project;
 for(const button of groupsEl.querySelectorAll('.skin-tile'))button.disabled=!project;
 if(project)chooseSkin(project.skinId,false);
 renderExport(project);
 extraPreviews.renderProject(project);
 renderProduction(project,true);
 renderSales(project,skins.find(s=>s.id===project?.skinId)?.displayName);
 showBackground();
 for(const slotId of assetViews.keys())renderAssetSlot(slotId);
}

async function init(){
 try{
  skins=await loadSkins();
  skinIds=skins.map(skin=>skin.id);
  document.getElementById('skin-count').textContent=skins.length+'種類';
  for(const {group,skins:items} of groupedSkins(skins)){
   const section=document.createElement('section');
   const heading=document.createElement('h3');heading.className='group-heading';heading.textContent=group+' ('+items.length+')';
   const grid=document.createElement('div');grid.className='tiles';grid.append(...items.map(tile));
   section.append(heading,grid);groupsEl.append(section);
  }
  ({collection,revision}=await loadCollection(skinIds));
  initAssetSlots();
  renderCollection();
  newButton.disabled=exportButton.disabled=chooseBackup.disabled=false;
  status('自動保存が有効です');
 }catch(error){
  const message=document.getElementById('load-error');
  message.hidden=false;
  message.textContent='作品を開けませんでした。'+error.message;
  status('初期化に失敗しました',true);
 }
}

list.addEventListener('change',()=>{
 const id=list.value;
 changeCollection(()=>defineCollection(collection.projects,id));
});
newButton.addEventListener('click',()=>{
 const name=prompt('新しい作品名','作品 '+(collection.projects.length+1))?.trim();
 if(!name)return;
 const project=createProject(name);
 changeCollection(()=>defineCollection([...collection.projects,project],project.id));
});
renameButton.addEventListener('click',()=>{
 const name=prompt('作品名',activeProject().name)?.trim();
 if(!name||name===activeProject().name)return;
 changeCollection(()=>defineCollection(collection.projects.map(project=>
  project.id===collection.activeId?{...project,name}:project),collection.activeId));
});
deleteButton.addEventListener('click',()=>{
 const project=activeProject();
 if(!confirm('「'+project.name+'」を削除しますか？'))return;
 changeCollection(()=>{
  const projects=collection.projects.filter(item=>item.id!==project.id);
  return defineCollection(projects,projects[0]?.id??null);
 });
});

input.accept=IMAGE_ACCEPT;
chooseBackground.addEventListener('click',()=>input.click());
input.addEventListener('change',()=>selectImage('talkBackground',input));
removeButton.addEventListener('click',()=>{removeImage('talkBackground');chooseBackground.focus();});
exportButton.addEventListener('click',()=>runOperation('全作品ZIPを準備中…',async()=>{
 const omissions=document.getElementById('backup-omissions');
 omissions.hidden=true;
 const omitted=[];
 const blob=await exportZip(collection,skinIds,{omitted});
 if(omitted.length){
  omissions.querySelector('ul').replaceChildren(...omitted.map(text=>{
   const item=document.createElement('li');
   item.textContent=text;
   return item;
  }));
  omissions.hidden=false;
 }
 const date=new Date(),day=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;link.download='line-theme-studio-backup-'+day+(omitted.length?'-partial':'')+'.zip';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 return omitted.length?'読み取れたデータのZIPを作成しました。未収録の画像は一覧を確認してください。':'全作品ZIPを作成しました';
}));

chooseBackup.addEventListener('click',()=>importInput.click());
importInput.addEventListener('change',()=>{
 const file=importInput.files?.[0];
 importInput.value='';
 if(!file)return;
 runOperation('バックアップを確認中…',async()=>{
  const incoming=/\.json$/i.test(file.name)
   ?{legacy:parseLegacyJson(await file.text(),skinIds)}
   :await importZip(file,skinIds);
  const message=incoming.legacy?'旧バックアップを1作品として追加しますか？'
   :'現在の全作品をバックアップの内容で置き換えますか？';
  if(!confirm((incoming.partial?'このZIPには収録できなかった画像があります。\n':'')+message))return '復元を中止しました';
  const next=incoming.collection??defineCollection([...collection.projects,incoming.legacy],incoming.legacy.id);
  await commitCollection(next);
  return 'バックアップを復元しました';
 });
});
init();
