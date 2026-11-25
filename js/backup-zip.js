import {IMAGE_SLOTS,validateProject} from './store.js';
import {writeZip,readZip} from './zip.js';
const FORMAT='line-theme-studio-zip',VERSION=1;
const mimeToExt={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/heic':'heic','image/heif':'heif'};
const extToMime=Object.fromEntries(Object.entries(mimeToExt).map(([type,ext])=>[ext,type]));
export async function exportZip(project,skinIds){
 const clean=validateProject(project,skinIds),images={},entries=[];
 for(const slot of IMAGE_SLOTS){
  const item=clean.images[slot.id];
  if(!item){images[slot.id]=null;continue;}
  const ext=mimeToExt[item.blob.type];if(!ext)throw new Error('対応していない画像形式です: '+slot.label);
  const path='images/'+slot.id+'.'+ext;
  images[slot.id]={path,name:item.name,type:item.blob.type};
  entries.push({name:path,data:new Uint8Array(await item.blob.arrayBuffer())});
 }
 const meta={format:FORMAT,version:VERSION,exportedAt:new Date().toISOString(),project:{version:1,skinId:clean.skinId,images}};
 entries.unshift({name:'project.json',data:new TextEncoder().encode(JSON.stringify(meta,null,2))});
 return writeZip(entries);
}
export async function importZip(file,skinIds){
 const entries=await readZip(file),raw=entries.get('project.json');
 if(!raw||raw.length>1024*1024)throw new Error('project.jsonがありません');
 let meta;try{meta=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new Error('作品設定のJSONが不正です');}
 if(meta?.format!==FORMAT||meta.version!==VERSION)throw new Error('対応していないバックアップです');
 const input=meta.project;if(!input||!input.images||typeof input.images!=='object')throw new Error('作品データが不正です');
 const images={};
 for(const slot of IMAGE_SLOTS){
  const info=input.images[slot.id];
  if(info==null){images[slot.id]=null;continue;}
  if(typeof info.path!=='string'||typeof info.name!=='string'||typeof info.type!=='string')throw new Error('画像情報が不正です');
  const ext=mimeToExt[info.type];
  if(!ext||info.path!=='images/'+slot.id+'.'+ext)throw new Error('画像ファイル名が不正です');
  const data=entries.get(info.path);if(!data)throw new Error('画像ファイルが不足しています: '+slot.label);
  images[slot.id]={name:info.name,blob:new Blob([data],{type:info.type})};
 }
 const expected=new Set(['project.json',...Object.values(input.images).filter(Boolean).map(x=>x.path)]);
 if([...entries.keys()].some(x=>!expected.has(x)))throw new Error('想定外のファイルが含まれています');
 return validateProject({version:1,skinId:input.skinId,images},skinIds);
}
