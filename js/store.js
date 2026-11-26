import {readAdjustments} from './export-spec.js';
import {emptyProduction,HEX_COLOR,TEMPLATES} from './production-data.js';

// IDは保存済みの画像を参照するため、表示名とは独立させる。
export const IMAGE_ACCEPT='image/png,image/jpeg,image/webp,image/heic,image/heif';
const menuFeatures=[
 ['talk','トーク'],['call','通話'],['news','ニュース'],['wallet','ウォレット'],
 ['home','ホーム'],['today','TODAY'],['voom','VOOM'],['shopping','ショッピング'],['apps','アプリ']
];
export const IMAGE_SLOTS=[
 {id:'mainImage',label:'メイン画像'},
 {id:'talkBackground',label:'トーク背景'},
 {id:'menuBackground',label:'メニュー背景'},
 {id:'passcodeOff',label:'パスコード OFF'},
 {id:'passcodeOn',label:'パスコード ON'},
 {id:'profilePersonal',label:'プロフィール 個人'},
 {id:'profileGroup',label:'プロフィール グループ'},
 ...menuFeatures.flatMap(([id,label])=>['Off','On'].map(state=>({
  id:'menu-'+id+'-'+state.toLowerCase(),label:'メニューアイコン '+label+' '+state.toUpperCase()
 })))
];
export const LEGACY_SLOT_IDS=['talkBackground','mainImage','menuIcon'];
const DB_NAME='line-theme-studio-partial-backup-test-468d3ad',STORE='projects',LEGACY_KEY='current',COLLECTION_KEY='collection';
export const COLLECTION_VERSION=2;

export function createProject(name){
 return {id:crypto.randomUUID(),name,skinId:'beige_01',images:{},production:emptyProduction()};
}

export function defineCollection(projects,activeId){
 return {version:COLLECTION_VERSION,projects,activeId};
}

function validateImage(image){
 return image&&typeof image==='object'&&typeof image.name==='string'
  &&image.blob instanceof Blob&&image.blob.type.startsWith('image/')
  &&(image.preview===undefined||image.preview instanceof Blob&&image.preview.type.startsWith('image/'));
}

function checkedImages(images,ids){
 if(!images||typeof images!=='object'||Array.isArray(images))throw new Error('画像データの形式が正しくありません');
 const entries=Object.entries(images);
 if(entries.some(([id,item])=>!ids.includes(id)||(item!==null&&!validateImage(item)))){
  throw new Error('画像データが正しくありません');
 }
 return Object.fromEntries(entries.filter(([,item])=>item!==null));
}

function validateProduction(value,images,slots){
 if(value===undefined)return emptyProduction();
 const {colors,style,world,templates,characterSheet,undo}=value??{};
 if(!Array.isArray(colors)||colors.length>8||colors.some(color=>typeof color!=='string'||!HEX_COLOR.test(color))
    ||typeof style!=='string'||typeof world!=='string'
    ||!templates||typeof templates!=='object'||Array.isArray(templates)
    ||(characterSheet!==null&&!validateImage(characterSheet))){
  throw new Error('制作メモの形式が正しくありません');
 }
 const keys=TEMPLATES.map(([key])=>key);
 for(const [key,text] of Object.entries(templates)){
  if(!keys.includes(key)||typeof text!=='string')throw new Error('指示文の形式が正しくありません');
 }
 return {colors:colors.map(color=>color.toUpperCase()),style,world,templates,characterSheet,
  undo:checkedImages(undo,slots.filter(slot=>images[slot]))};
}

export function validateCollection(record,skinIds){
 if(record?.version!==COLLECTION_VERSION||!Array.isArray(record.projects))throw new Error('作品一覧の形式が正しくありません');
 const ids=new Set();
 const projects=record.projects.map(project=>{
  if(typeof project?.id!=='string'||!project.id||ids.has(project.id)
     ||typeof project.name!=='string'||!project.name.trim()||!skinIds.includes(project.skinId)){
   throw new Error('作品データが正しくありません');
  }
  ids.add(project.id);
  const slots=IMAGE_SLOTS.map(slot=>slot.id);
  const images=checkedImages(project.images,slots);
  return {...project,exportSettings:readAdjustments(project.exportSettings),images,
   production:validateProduction(project.production,images,slots)};
 });
 if(projects.length?!ids.has(record.activeId):record.activeId!==null){
  throw new Error('選択中の作品が見つかりません');
 }
 return defineCollection(projects,record.activeId);
}

export function convertLegacy(project,skinIds){
 if(project?.version!==1||!skinIds.includes(project.skinId))throw new Error('旧作品データの形式が正しくありません');
 const images=checkedImages(project.images,LEGACY_SLOT_IDS);
 // 旧試作の1枠には機能・状態がなかったため、トーク OFF に引き継ぐ。
 if(images.menuIcon){
  images['menu-talk-off']=images.menuIcon;
  delete images.menuIcon;
 }
 return {...createProject('引き継いだ作品'),skinId:project.skinId,images};
}

function openDatabase(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore(STORE);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}

async function transact(action){
 const db=await openDatabase();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   let result,failure;
   function read(key,callback){
    const request=store.get(key);
    request.onsuccess=()=>{
     try{callback(request.result);}
     catch(error){failure=error;tx.abort();}
    };
   }
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(failure??tx.error??new Error('保存が中断されました'));
   action(store,read,value=>{result=value;});
  });
 }finally{db.close();}
}

export function loadCollection(skinIds){
 return transact((store,read,complete)=>{
  read(COLLECTION_KEY,current=>{
   if(current!==undefined){
    if(!Number.isSafeInteger(current?.revision)||current.revision<1)throw new Error('保存データの履歴が正しくありません');
    complete({collection:validateCollection(current,skinIds),revision:current.revision});
    return;
   }
   read(LEGACY_KEY,legacy=>{
    const project=legacy===undefined?createProject('作品 1'):convertLegacy(legacy,skinIds);
    const collection=validateCollection(defineCollection([project],project.id),skinIds);
    store.add({...collection,revision:1},COLLECTION_KEY);
    complete({collection,revision:1});
   });
  });
 });
}

export function saveCollection(collection,revision){
 return transact((store,read,complete)=>{
  read(COLLECTION_KEY,current=>{
   if(current?.revision!==revision)throw new Error('別のタブで作品が更新されました。未保存の変更はバックアップに書き出せます');
   const next=revision+1;
   store.put({...collection,revision:next},COLLECTION_KEY);
   complete(next);
  });
 });
}

function dataUrlToBlob(value){
 if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp|heic|heif);base64,[A-Za-z0-9+/=]+$/.test(value)){
  throw new Error('画像のバックアップ形式が不正です');
 }
 const [head,encoded]=value.split(',');
 return new Blob([Uint8Array.from(atob(encoded),char=>char.charCodeAt(0))],{type:head.slice(5,-7)});
}

export function parseLegacyJson(text,skinIds){
 let raw;
 try{raw=JSON.parse(text);}catch{throw new Error('JSONファイルを読み取れません');}
 if(raw?.format!=='line-theme-studio-backup'||raw.version!==1)throw new Error('対応していないバックアップ形式です');
 const input=raw.project;
 if(!input?.images||typeof input.images!=='object'||Array.isArray(input.images))throw new Error('作品データが不正です');
 const entries=Object.entries(input.images).map(([id,item])=>[
  id,item===null?null:{name:item.name,blob:dataUrlToBlob(item.dataUrl)}
 ]);
 return convertLegacy({...input,version:1,images:Object.fromEntries(entries)},skinIds);
}

// 診断用。通常の起動処理と分け、空のDBを作るトランザクションも中止する。
export async function readSavedProjectsForDiagnosis(){
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME);
  let absent=false;
  request.onupgradeneeded=()=>{
   absent=true;
   request.transaction.abort();
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>absent?resolve(null):reject(request.error);
 });
 if(!db)return {projects:[],activeId:null};
 try{
  if(!db.objectStoreNames.contains(STORE))return {projects:[],activeId:null};
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
   const current=store.get(COLLECTION_KEY),legacy=store.get(LEGACY_KEY);
   tx.onabort=()=>reject(tx.error??new Error('保存データの読み出しが中断されました'));
   tx.oncomplete=()=>{
    if(current.result!==undefined){
     if(!Array.isArray(current.result?.projects)){
      reject(new Error('保存された作品一覧の形式を確認できません'));return;
     }
     resolve({projects:current.result.projects,activeId:current.result.activeId});
    }else if(legacy.result){
     resolve({projects:[{id:'legacy',name:'旧形式の作品',images:legacy.result.images}],activeId:'legacy'});
    }else resolve({projects:[],activeId:null});
   };
  });
 }finally{db.close();}
}
