import {COLLECTION_VERSION,IMAGE_SLOTS,LEGACY_SLOT_IDS,convertLegacy,validateCollection} from './store.js';
import {writeZip,readZip} from './zip.js';

const FORMAT='line-theme-studio-zip';
const mimeToExt=new Map([
 ['image/png','png'],['image/jpeg','jpg'],['image/webp','webp'],['image/heic','heic'],['image/heif','heif']
]);
const slotIds=IMAGE_SLOTS.map(slot=>slot.id);
const json=new TextDecoder('utf-8',{fatal:true});

export function exportZip(collection,skinIds){
 const clean=validateCollection(collection,skinIds),entries=[];
 const projects=clean.projects.map(({id,name,skinId,images,exportSettings},index)=>{
  const metadata={};
  for(const [slotId,item] of Object.entries(images)){
   const ext=mimeToExt.get(item.blob.type);
   if(!ext)throw new Error('対応していない画像形式です: '+item.name);
   const path='images/'+index+'/'+slotId+'.'+ext;
   metadata[slotId]={path,name:item.name,type:item.blob.type};
   entries.push({name:path,data:item.blob});
  }
  return {id,name,skinId,images:metadata,exportSettings};
 });
 const meta={...clean,format:FORMAT,exportedAt:new Date().toISOString(),projects};
 const manifest=new Blob([JSON.stringify(meta)]);
 if(manifest.size>1024*1024)throw new Error('作品一覧が大きすぎます');
 return writeZip([{name:'project.json',data:manifest},...entries]);
}

function restoreImages(images,ids,prefix,entries){
 if(!images||typeof images!=='object'||Array.isArray(images))throw new Error('画像情報が不正です');
 const restored=[];
 for(const [slotId,info] of Object.entries(images)){
  if(!ids.includes(slotId))throw new Error('不明な画像スロットがあります');
  if(info===null)continue;
  const ext=mimeToExt.get(info?.type);
  if(!ext||typeof info.name!=='string'||info.path!==prefix+slotId+'.'+ext){
   throw new Error('画像ファイルの情報が不正です');
  }
  const data=entries.get(info.path);
  if(!data)throw new Error('画像ファイルが不足しています: '+info.name);
  restored.push([slotId,{name:info.name,blob:data.slice(0,data.size,info.type)}]);
  entries.delete(info.path);
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
 }else if(meta.version===COLLECTION_VERSION&&Array.isArray(meta.projects)){
  const projects=meta.projects.map((project,index)=>({
   ...project,images:restoreImages(project?.images,slotIds,'images/'+index+'/',entries)
  }));
  result={collection:validateCollection({...meta,projects},skinIds)};
 }else throw new Error('対応していないバックアップです');
 if(entries.size)throw new Error('想定外のファイルが含まれています');
 return result;
}
