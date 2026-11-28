import {detectImageMime} from './image-format.js';
import {verifyOriginal} from './image-preview.js';

const DB='line-theme-studio',LEGACY='projects',COLLECTIONS='collections_v2',
 META='project_meta_v2',IMAGES='image_blobs_v2';
const ACTIVE='active',STAGING='staging';
const splitStores=[COLLECTIONS,META,IMAGES];
const CONFLICT='別のタブで作品が更新されました。未保存の変更はバックアップに書き出せます';

function openDatabase(upgrade){
 return new Promise((resolve,reject)=>{
  const request=upgrade?indexedDB.open(DB,2):indexedDB.open(DB);
  let absent=false,blocked=false;
  request.onupgradeneeded=()=>{
   if(!upgrade){absent=true;request.transaction.abort();return;}
   for(const name of [LEGACY,...splitStores]){
    if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);
   }
  };
  request.onblocked=()=>{
   blocked=true;
   reject(new Error('保存領域の更新が待機中です。このアプリの他のタブを閉じてから再読み込みしてください'));
  };
  request.onsuccess=()=>{
   const db=request.result;
   if(blocked){db.close();return;}
   db.onversionchange=()=>db.close();
   resolve(db);
  };
  request.onerror=()=>absent?resolve(null):reject(request.error);
 });
}

// IDBのコールバック内でだけ次のリクエストを発行する。画像の非同期処理を
// トランザクションに持ち込むと、Safariが途中でコミットすることがある。
function transact(db,names,mode,run){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(names,mode);
  let result,failure;
  const store=name=>tx.objectStore(name);
  const fail=error=>{
  failure=error;
  try{tx.abort();}
  catch(abortError){if(abortError.name!=='InvalidStateError')throw abortError;}
 };
  const get=(name,key,callback)=>{
   const request=store(name).get(key);
   request.onsuccess=()=>{
    try{callback(request.result);}
    catch(error){fail(error);}
   };
  };
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(failure??tx.error??new Error('保存処理が中断されました'));
  try{run({store,get,done:value=>{result=value;}});}
  catch(error){fail(error);}
 });
}

function readHead(db,key){
 return transact(db,[COLLECTIONS],'readonly',({get,done})=>get(COLLECTIONS,key,done));
}

function legacySnapshot(db){
 return transact(db,[LEGACY],'readonly',({get,done})=>{
  get(LEGACY,'collection',current=>{
   if(current!==undefined)done({source:'collection',record:current});
   else get(LEGACY,'current',record=>done({source:'current',record}));
  });
 });
}

function readSplit(db,key){
 return transact(db,splitStores,'readonly',({get,done})=>{
  get(COLLECTIONS,key,head=>{
   if(!head){done(null);return;}
   const projects=new Map(),images=new Map();
   for(const id of head.projectIds)get(META,[head.namespace,id],value=>projects.set(id,value));
   for(const id of head.imageIds)get(IMAGES,[head.namespace,id],value=>images.set(id,value));
   done({head,projects,images});
  });
 });
}

function removeNamespace(store,head){
 if(!head)return;
 for(const id of head.projectIds)store(META).delete([head.namespace,id]);
 for(const id of head.imageIds)store(IMAGES).delete([head.namespace,id]);
}

async function hash(bytes){
 if(!globalThis.crypto?.subtle)return null;
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function readBytes(blob,label){
 if(!(blob instanceof Blob)||!blob.size)throw new Error(label+'：画像データがありません');
 let bytes;
 try{bytes=await blob.arrayBuffer();}
 catch(error){throw new Error(label+'：画像データを読み取れません（'+error.name+'）',{cause:error});}
 if(bytes.byteLength!==blob.size)throw new Error(label+'：画像のサイズが一致しません');
 return bytes;
}

function validMime(bytes,type){
 const detected=detectImageMime(new Uint8Array(bytes));
 return detected===type||(detected==='image/heic'&&type==='image/heif');
}

function referenceIssue(entry,ref){
 if(!ref||!(entry?.blob instanceof Blob))return '参照先の画像データがありません';
 if(entry.id!==ref.id||entry.size!==ref.size||entry.blob.size!==ref.size
    ||entry.type!==ref.type||entry.blob.type!==ref.type){
  return '画像のサイズまたは形式が一致しません';
 }
 if(entry.sha256!==ref.sha256)return '画像のSHA-256が一致しません';
 return null;
}

function migrationError(error){
 const reason=error.name==='QuotaExceededError'
  ?'保存領域の空き容量が不足しています。'
  :error.message;
 return new Error('保存データを移行できませんでした。元のデータは保持されています。'+reason,{cause:error});
}

export function createSplitStorage({createProject,defineCollection,validateCollection,convertLegacy,slotLabels}){
 // Blobは不変。すでに検証・保存したBlobを識別し、メモ等の変更では読み直しも書き戻しもしない。
 const identities=new WeakMap();
 const imageLabel=(project,slot)=>'「'+project.name+'」の'+(slotLabels.get(slot)??slot);

 async function prepare(collection,known){
  const projects=new Map(),images=new Map(),refs=new Set();
  async function imageRef(blob,label){
   const old=identities.get(blob);
   const id=old?.id??crypto.randomUUID();
   if(known.has(id)||images.has(id)){
    refs.add(id);
    return old;
   }
   const bytes=await readBytes(blob,label);
   if(!validMime(bytes,blob.type))throw new Error(label+'：画像形式が記録と一致しません');
   const copy=new Blob([bytes],{type:blob.type});
   try{await verifyOriginal(copy);}
   catch(error){throw new Error(label+'：画像をデコードできません',{cause:error});}
   const ref={id,size:bytes.byteLength,type:blob.type,sha256:await hash(bytes)};
   identities.set(blob,ref);
   images.set(id,{...ref,blob:copy});
   refs.add(id);
   return ref;
  }
  async function pack(item,label){
   label+='（'+item.name+'）';
   const original=await imageRef(item.blob,label);
   const preview=item.preview?await imageRef(item.preview,label+'（縮小画像）'):undefined;
   return {name:item.name,original,preview};
  }
  async function packSlots(project,items,suffix=''){
   const packed=[];
   for(const [id,item] of Object.entries(items)){
    if(item)packed.push([id,await pack(item,imageLabel(project,id)+suffix)]);
   }
   return Object.fromEntries(packed);
  }
  for(const project of collection.projects){
   const {production,images,...metadata}=project;
   const sheet=production.characterSheet;
   projects.set(project.id,{
    ...metadata,images:await packSlots(project,images),
    production:{...production,
     characterSheet:sheet?await pack(sheet,imageLabel(project,'キャラ表')):null,
     undo:await packSlots(project,production.undo,'（取り消し用）')}
   });
  }
  return {projects,images,head:{
   projectIds:[...projects.keys()],imageIds:[...refs],activeId:collection.activeId
  }};
 }

 async function hydrate(snapshot,check=true){
  const verified=new Map(),live=[];
  async function original(ref,label){
   const entry=snapshot.images.get(ref?.id);
   const issue=referenceIssue(entry,ref);
   if(issue)throw new Error(label+'：'+issue);
   if(verified.has(ref.id))return verified.get(ref.id);
   const bytes=await readBytes(entry.blob,label);
   if(ref.sha256!==null&&await hash(bytes)!==ref.sha256){
    throw new Error(label+'：画像のSHA-256が一致しません');
   }
   const blob=new Blob([bytes],{type:ref.type});
   identities.set(blob,ref);
   verified.set(ref.id,blob);
   return blob;
  }
  async function unpack(item,label){
   if(!check){
    const ref=item.original;
    const entry=snapshot.images.get(ref?.id);
    return {name:item.name,blob:entry?.blob,integrity:{
     size:ref?.size,sha256:ref?.sha256,issue:referenceIssue(entry,ref)
    }};
   }
   label+='（'+item.name+'）';
   const blob=await original(item.original,label);
   const preview=item.preview?await original(item.preview,label+'（縮小画像）'):undefined;
   return {name:item.name,blob,preview};
  }
  async function unpackSlots(project,items,suffix=''){
   const restored=[];
   for(const [id,item] of Object.entries(items)){
    restored.push([id,await unpack(item,imageLabel(project,id)+suffix)]);
   }
   return Object.fromEntries(restored);
  }
  for(const id of snapshot.head.projectIds){
   const project=snapshot.projects.get(id);
   if(!project||project.id!==id)throw new Error('作品の保存情報が見つかりません（'+id+'）');
   const sheet=project.production.characterSheet;
   live.push({...project,images:await unpackSlots(project,project.images),
    production:{...project.production,
     characterSheet:sheet?await unpack(sheet,imageLabel(project,'キャラ表')):null,
     undo:await unpackSlots(project,project.production.undo,'（取り消し用）')}});
  }
  return defineCollection(live,snapshot.head.activeId);
 }

 function writeRecords(store,prepared,namespace){
  for(const [id,record] of prepared.projects)store(META).put(record,[namespace,id]);
  for(const [id,record] of prepared.images)store(IMAGES).put(record,[namespace,id]);
 }

 function stage(db,prepared,head){
  return transact(db,splitStores,'readwrite',({store,get,done})=>{
   get(COLLECTIONS,ACTIVE,active=>{
    if(active){done(false);return;}
    get(COLLECTIONS,STAGING,previous=>{
     removeNamespace(store,previous);
     writeRecords(store,prepared,head.namespace);
     store(COLLECTIONS).put(head,STAGING);
     done(true);
    });
   });
  });
 }

 function activate(db,head){
  return transact(db,[COLLECTIONS],'readwrite',({store,get,done})=>{
   get(COLLECTIONS,ACTIVE,active=>{
    if(active){done(false);return;}
    get(COLLECTIONS,STAGING,pending=>{
     if(pending?.namespace!==head.namespace)throw new Error(CONFLICT);
     store(COLLECTIONS).put(head,ACTIVE);
     store(COLLECTIONS).delete(STAGING);
     done(true);
    });
   });
  });
 }

 async function loadActive(db,skinIds){
  const saved=await readSplit(db,ACTIVE);
  if(!saved)return null;
  if(!Number.isSafeInteger(saved.head.revision)||saved.head.revision<1)throw new Error('保存データの履歴が正しくありません');
  return {collection:validateCollection(await hydrate(saved),skinIds),revision:saved.head.revision};
 }

 async function loadCollection(skinIds){
  const db=await openDatabase(true);
  try{
   const active=await loadActive(db,skinIds);
   if(active)return active;
   try{
    const {source,record}=await legacySnapshot(db);
    let collection,revision=1;
    if(source==='collection'){
     if(!Number.isSafeInteger(record?.revision)||record.revision<1)throw new Error('旧データの履歴が正しくありません');
     collection=validateCollection(record,skinIds);
     revision=record.revision;
    }else{
     const project=record===undefined?createProject('作品 1'):convertLegacy(record,skinIds);
     collection=validateCollection(defineCollection([project],project.id),skinIds);
    }
    const prepared=await prepare(collection,new Set());
    const head={...prepared.head,namespace:crypto.randomUUID(),revision};
    if(!await stage(db,prepared,head))return await loadActive(db,skinIds);
    prepared.images.clear();
    const staged=await readSplit(db,STAGING);
    if(staged?.head.namespace!==head.namespace)throw new Error(CONFLICT);
    if(JSON.stringify(staged.head)!==JSON.stringify(head))throw new Error('作品一覧のコピーを照合できませんでした');
    for(const [id,project] of prepared.projects){
     if(JSON.stringify(staged.projects.get(id))!==JSON.stringify(project))throw new Error('作品のコピーを照合できませんでした');
    }
    const verified=validateCollection(await hydrate(staged),skinIds);
    if(!await activate(db,head))return await loadActive(db,skinIds);
    return {collection:verified,revision};
   }catch(error){throw migrationError(error);}
  }finally{db.close();}
 }

 async function saveCollection(collection,revision){
  const db=await openDatabase(true);
  try{
   const current=await readHead(db,ACTIVE);
   if(!current||current.revision!==revision)throw new Error(CONFLICT);
   const known=new Set(current.imageIds);
   const prepared=await prepare(collection,known);
   return await transact(db,splitStores,'readwrite',({store,get,done})=>{
    get(COLLECTIONS,ACTIVE,latest=>{
     if(latest?.revision!==revision||latest.namespace!==current.namespace)throw new Error(CONFLICT);
     const namespace=latest.namespace;
     writeRecords(store,prepared,namespace);
     for(const id of latest.projectIds)if(!prepared.projects.has(id))store(META).delete([namespace,id]);
     const retained=new Set(prepared.head.imageIds);
     for(const id of latest.imageIds)if(!retained.has(id))store(IMAGES).delete([namespace,id]);
     const next=revision+1;
     store(COLLECTIONS).put({...prepared.head,namespace,revision:next},ACTIVE);
     done(next);
    });
   });
  }catch(error){
   if(error.name==='QuotaExceededError')throw new Error('保存領域の空き容量が不足しています。前回の保存データは保持されています',{cause:error});
   throw error;
  }finally{db.close();}
 }

 async function readSavedProjectsForDiagnosis(){
  const db=await openDatabase(false);
  if(!db)return {projects:[],activeId:null};
  try{
   if(db.objectStoreNames.contains(COLLECTIONS)){
    const saved=await readSplit(db,ACTIVE);
    if(saved)return await hydrate(saved,false);
   }
   if(db.objectStoreNames.contains(LEGACY)){
    const {source,record}=await legacySnapshot(db);
    if(source==='collection'){
     if(!Array.isArray(record?.projects))throw new Error('保存された作品一覧の形式を確認できません');
     return {projects:record.projects,activeId:record.activeId};
    }
    if(record)return {projects:[{id:'legacy',name:'旧形式の作品',images:record.images}],activeId:'legacy'};
   }
   return {projects:[],activeId:null};
  }finally{db.close();}
 }
 return {loadCollection,saveCollection,readSavedProjectsForDiagnosis};
}
