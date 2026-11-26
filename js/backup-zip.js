import {COLLECTION_VERSION,IMAGE_SLOTS,LEGACY_SLOT_IDS,convertLegacy,validateCollection} from './store.js';
import {writeZip,readZip} from './zip.js';
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

function restoreImage(info,base,entries){
 const ext=mimeToExt.get(info?.type);
 if(!ext||typeof info.name!=='string'||info.path!==base+'.'+ext){
  throw new Error('画像ファイルの情報が不正です');
 }
 const data=entries.get(info.path);
 if(!data)throw new Error('画像ファイルが不足しています: '+info.name);
 entries.delete(info.path);
 return {name:info.name,blob:data.slice(0,data.size,info.type)};
}

function restoreImages(images,ids,prefix,entries){
 if(!images||typeof images!=='object'||Array.isArray(images))throw new Error('画像情報が不正です');
 const restored=[];
 for(const [slotId,info] of Object.entries(images)){
  if(!ids.includes(slotId))throw new Error('不明な画像スロットがあります');
  if(info===null)continue;
  restored.push([slotId,restoreImage(info,prefix+slotId,entries)]);
 }
 return Object.fromEntries(restored);
}

export async function importZip(file,skinIds){
 const entries=await readZip(file);
 const raw=entries.get('project.json');
 if(!raw||raw.size>1024*1024)throw new Error('作品設定ファイルがありません、または大きすぎます');
 let meta;
 try{meta=JSON.parse(json.decode(await raw.arrayBuffer()));}
 catch{throw new Error('作品設定のJSONが不正です');}
 entries.delete('project.json');
 let result;
 if(meta?.format!==FORMAT)throw new Error('対応していないバックアップです');
 if(meta.version===1){
  const old=meta.project;
  result={legacy:convertLegacy({...old,version:1,images:restoreImages(old?.images,LEGACY_SLOT_IDS,'images/',entries)},skinIds)};
 }else if([2,BACKUP_VERSION].includes(meta.version)&&Array.isArray(meta.projects)){
  const projects=meta.projects.map((project,index)=>{
   const images=restoreImages(project?.images,slotIds,'images/'+index+'/',entries);
   let production;
   if(meta.version===BACKUP_VERSION){
    const data=project.production;
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('制作メモの情報がありません');
    const characterSheet=data.characterSheet===null?null:restoreImage(data.characterSheet,'references/'+index+'/character-sheet',entries);
    production={...data,characterSheet,undo:restoreImages(data.undo,slotIds,'undo/'+index+'/',entries)};
   }
   return {...project,images,production};
  });
  result={collection:validateCollection({...meta,version:COLLECTION_VERSION,projects},skinIds)};
 }else throw new Error('対応していないバックアップです');
 if(entries.size)throw new Error('想定外のファイルが含まれています');
 return result;
}
