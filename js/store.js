// 保存層。将来の画像スロット追加時もここに集約する。
const IMAGE_ACCEPT='image/png,image/jpeg,image/webp,image/heic,image/heif';
export const IMAGE_SLOTS=[
 {id:'talkBackground',label:'トーク背景',accept:IMAGE_ACCEPT},
 {id:'mainImage',label:'メイン画像（仮登録）',accept:IMAGE_ACCEPT},
 {id:'menuIcon',label:'メニューアイコン（仮登録）',accept:IMAGE_ACCEPT}
];
export const BACKUP_FORMAT='line-theme-studio-backup';
export const BACKUP_VERSION=1;
const DB_NAME='line-theme-studio', STORE='projects', KEY='current';
export function createDraft(){return {version:1,skinId:'beige_01',images:Object.fromEntries(IMAGE_SLOTS.map(s=>[s.id,null]))};}
function openDatabase(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('このブラウザはIndexedDBに対応していません'));return;}
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('データベースを開けません'));
  req.onblocked=()=>reject(new Error('別のタブがデータベースを使用中です'));
 });
}
async function transact(mode,action){
 const db=await openDatabase();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode), store=tx.objectStore(STORE);
  let result;const req=action(store);
  if(req){req.onsuccess=()=>{result=req.result;};}
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||new Error('保存に失敗しました'));
  tx.onabort=()=>reject(tx.error||new Error('保存が中断されました'));
 });}finally{db.close();}
}
export async function loadProject(){
 const record=await transact('readonly',store=>store.get(KEY));
 return record??createDraft();
}
export async function saveProject(project){
 await transact('readwrite',store=>store.put(project,KEY));
}
function validSkin(id,skinIds){return typeof id==='string'&&skinIds.includes(id);}
function validImage(image){
 return image===null||(image&&typeof image==='object'&&image.blob instanceof Blob&&image.blob.type.startsWith('image/')&&typeof image.name==='string');
}
export function validateProject(project,skinIds){
 if(!project||project.version!==1||!validSkin(project.skinId,skinIds)||!project.images||typeof project.images!=='object')throw new Error('作品データの形式が正しくありません');
 for(const slot of IMAGE_SLOTS){if(!validImage(project.images[slot.id]??null))throw new Error('画像データが正しくありません: '+slot.label);}
 return {version:1,skinId:project.skinId,images:Object.fromEntries(IMAGE_SLOTS.map(s=>[s.id,project.images[s.id]??null]))};
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
function dataUrlToBlob(value){
 if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp|heic|heif);base64,[A-Za-z0-9+/=]+$/.test(value))throw new Error('画像のバックアップ形式が不正です');
 const [head,encoded]=value.split(',');const binary=atob(encoded);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type:head.slice(5,-7)});
}
export async function createBackup(project,skinIds){
 const clean=validateProject(project,skinIds),images={};
 for(const slot of IMAGE_SLOTS){const item=clean.images[slot.id];images[slot.id]=item?{name:item.name,dataUrl:await blobToDataUrl(item.blob)}:null;}
 return {format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt:new Date().toISOString(),project:{version:1,skinId:clean.skinId,images}};
}
export function parseBackup(text,skinIds){
 let raw;try{raw=JSON.parse(text);}catch{throw new Error('JSONファイルを読み取れません');}
 if(raw?.format!==BACKUP_FORMAT||raw.version!==BACKUP_VERSION)throw new Error('対応していないバックアップ形式です');
 const input=raw.project;if(!input||!validSkin(input.skinId,skinIds)||!input.images||typeof input.images!=='object')throw new Error('作品データが不正です');
 const images={};for(const slot of IMAGE_SLOTS){const item=input.images[slot.id];if(item==null){images[slot.id]=null;continue;}
  if(typeof item.name!=='string'||typeof item.dataUrl!=='string')throw new Error('画像データが不正です');
  images[slot.id]={name:item.name,blob:dataUrlToBlob(item.dataUrl)};
 }
 return validateProject({version:1,skinId:input.skinId,images},skinIds);
}
