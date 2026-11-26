import {COLLECTION_VERSION,IMAGE_SLOTS,LEGACY_SLOT_IDS,convertLegacy,validateCollection} from './store.js';
import {writeZip,readZipDirectory,readZipEntryBytes} from './zip.js';
import {detectImageMime} from './image-format.js';
import {verifyOriginal} from './image-preview.js';

const FORMAT='line-theme-studio-zip',BACKUP_VERSION=3;
const mimeToExt=new Map([
 ['image/png','png'],['image/jpeg','jpg'],['image/webp','webp'],['image/heic','heic'],['image/heif','heif']
]);
const slotIds=IMAGE_SLOTS.map(slot=>slot.id);
const slotLabels=new Map(IMAGE_SLOTS.map(({id,label})=>[id,label]));
const json=new TextDecoder('utf-8',{fatal:true});

export async function exportZip(collection,skinIds){
 const clean=validateCollection(collection,skinIds),entries=[];
 function pack(item,base,label){
  const ext=mimeToExt.get(item.blob.type);
  if(!ext)throw new Error(label+'：対応していない画像形式です（'+item.name+'）');
  const path=base+'.'+ext;
  entries.push({name:path,data:item.blob,label});
  return {path,name:item.name,type:item.blob.type};
 }
 function packSlots(images,prefix,projectName,suffix=''){
  return Object.fromEntries(Object.entries(images).map(([slot,item])=>[
   slot,pack(item,prefix+slot,'「'+projectName+'」の'+slotLabels.get(slot)+suffix)
  ]));
 }
 const projects=clean.projects.map(({id,name,skinId,images,exportSettings,production},index)=>({
  id,name,skinId,exportSettings,images:packSlots(images,'images/'+index+'/',name),
  production:{...production,
   characterSheet:production.characterSheet?pack(production.characterSheet,'references/'+index+'/character-sheet','「'+name+'」のキャラ表'):null,
   undo:packSlots(production.undo,'undo/'+index+'/',name,'（取り消し用）')}
 }));
 const meta={...clean,version:BACKUP_VERSION,format:FORMAT,exportedAt:new Date().toISOString(),projects};
 const manifest=new Blob([JSON.stringify(meta)]);
 if(manifest.size>1024*1024)throw new Error('作品一覧が大きすぎます');
 const checked=new Set();
 for(const {data,label} of entries){
  if(checked.has(data))continue;
  if(!data.size)throw new Error(label+'：原画データが0バイトです');
  try{await verifyOriginal(data);}
  catch{throw new Error(label+'：原画データを読み取れないか、画像形式を解釈できません');}
  checked.add(data);
 }
 return writeZip([{name:'project.json',data:manifest},...entries]);
}

async function restoreImage(info,base,entries,file,label){
 try{
  const ext=mimeToExt.get(info?.type);
  if(!ext||typeof info.name!=='string'||info.path!==base+'.'+ext){
   throw new Error('画像ファイルの情報が不正です');
  }
  const entry=entries.get(info.path);
  if(!entry)throw new Error('画像ファイルが不足しています（'+info.name+'）');
  const bytes=await readZipEntryBytes(file,entry);
  const detected=detectImageMime(new Uint8Array(bytes));
  // image/heif は HEVC を含む HEIF コンテナでも使われる。
  if(detected!==info.type&&!(detected==='image/heic'&&info.type==='image/heif')){
   throw new Error('画像の実形式が記録されたMIMEタイプと一致しません（'+info.name+'）');
  }
  const blob=new Blob([bytes],{type:info.type});
  try{await verifyOriginal(blob);}
  catch{throw new Error('画像をデコードできません（'+info.name+'）');}
  entries.delete(info.path);
  return {name:info.name,blob};
 }catch(error){
  throw new Error(label+'：'+error.message,{cause:error});
 }
}

async function restoreImages(images,ids,prefix,entries,file,projectLabel,suffix=''){
 if(!images||typeof images!=='object'||Array.isArray(images))throw new Error(projectLabel+'：画像情報が不正です');
 const restored=[];
 for(const [slotId,info] of Object.entries(images)){
  if(!ids.includes(slotId))throw new Error(projectLabel+'：不明な画像スロットがあります');
  if(info===null)continue;
  const label=projectLabel+'の'+(slotLabels.get(slotId)??'旧形式のメニューアイコン')+suffix;
  restored.push([slotId,await restoreImage(info,prefix+slotId,entries,file,label)]);
 }
 return Object.fromEntries(restored);
}

export async function importZip(file,skinIds){
 const entries=await readZipDirectory(file);
 const raw=entries.get('project.json');
 if(!raw||raw.size>1024*1024)throw new Error('作品設定ファイルがありません、または大きすぎます');
 const bytes=await readZipEntryBytes(file,raw);
 let meta;
 try{meta=JSON.parse(json.decode(bytes));}
 catch{throw new Error('作品設定のJSONが不正です');}
 entries.delete('project.json');
 let result;
 if(meta?.format!==FORMAT)throw new Error('対応していないバックアップです');
 if(meta.version===1){
  const old=meta.project;
  const images=await restoreImages(old?.images,LEGACY_SLOT_IDS,'images/',entries,file,'旧形式の作品');
  result={legacy:convertLegacy({...old,version:1,images},skinIds)};
 }else if([2,BACKUP_VERSION].includes(meta.version)&&Array.isArray(meta.projects)){
  const projects=[];
  for(const [index,project] of meta.projects.entries()){
   const label='「'+(project?.name??'名称不明の作品')+'」';
   const images=await restoreImages(project?.images,slotIds,'images/'+index+'/',entries,file,label);
   let production;
   if(meta.version===BACKUP_VERSION){
    const data=project.production;
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(label+'：制作メモの情報がありません');
    const sheet=data.characterSheet;
    const characterSheet=sheet===null?null:await restoreImage(sheet,'references/'+index+'/character-sheet',entries,file,label+'のキャラ表');
    const undo=await restoreImages(data.undo,slotIds,'undo/'+index+'/',entries,file,label,'（取り消し用）');
    production={...data,characterSheet,undo};
   }
   projects.push({...project,images,production});
  }
  result={collection:validateCollection({...meta,version:COLLECTION_VERSION,projects},skinIds)};
 }else throw new Error('対応していないバックアップです');
 if(entries.size)throw new Error('想定外のファイルが含まれています');
 return result;
}
