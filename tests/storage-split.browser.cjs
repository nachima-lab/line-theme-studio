const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.TEST_URL??'http://127.0.0.1:8922/';
const browse={viewport:{width:390,height:844},ignoreHTTPSErrors:Boolean(process.env.TEST_URL)};
const launch=()=>chromium.launch(process.env.CHROMIUM_PATH?{
 executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
}:{});

async function enter(page){
 await page.goto(base+'diagnostic.html');
 const entry=page.getByRole('button',{name:'Open the page'});
 if(await entry.count())await entry.click();
 assert.equal(new URL(page.url()).origin,new URL(base).origin);
 await page.waitForFunction(()=>document.querySelector('#diagnostic-status').textContent.includes('見つかりませんでした'));
}

async function seed(page,corrupt=false){
 await page.evaluate(async corrupt=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=12;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#aa2345';ctx.fillRect(0,0,12,12);
  const pixels=await new Promise(resolve=>canvas.toBlob(resolve));
  const png=new Blob([pixels,Uint8Array.of(0,0)],{type:'image/png'});
  const create=indexedDB.open('line-theme-studio',1);
  const db=await new Promise((ok,err)=>{
   create.onupgradeneeded=()=>create.result.createObjectStore('projects');
   create.onsuccess=()=>ok(create.result);create.onerror=err;
  });
  const tx=db.transaction('projects','readwrite');
  tx.objectStore('projects').put({version:2,revision:9,activeId:'legacy-project',projects:[{
   id:'legacy-project',name:'移行テスト',skinId:'beige_01',exportSettings:{'i_22.png':33},
   images:{mainImage:{name:'main.png',blob:corrupt?new Blob(['x'.repeat(png.size)],{type:'image/png'}):png.slice(0,png.size,png.type)},
    talkBackground:{name:'talk.png',blob:png}},
   production:{colors:['#AABBCC'],style:'水彩',world:'桃の里',templates:{common:'{画風メモ}'},
    characterSheet:{name:'reference.png',blob:png},undo:{mainImage:{name:'undo.png',blob:png}}}
  }]},'collection');
  await new Promise((ok,err)=>{tx.oncomplete=ok;tx.onabort=err;});db.close();
 },corrupt);
}

async function snapshot(page){
 return page.evaluate(async()=>{
  const request=indexedDB.open('line-theme-studio');
  const db=await new Promise((ok,err)=>{request.onsuccess=()=>ok(request.result);request.onerror=err;});
  async function read(store,key){
   if(!db.objectStoreNames.contains(store))return null;
   return new Promise((ok,err)=>{
    const request=db.transaction(store,'readonly').objectStore(store).get(key);
    request.onsuccess=()=>ok(request.result);request.onerror=err;
   });
  }
  const legacy=await read('projects','collection');
  const active=await read('collections_v2','active');
  const staging=await read('collections_v2','staging');
  const metadata=active&&await read('project_meta_v2',[active.namespace,'legacy-project']);
  const images={};
  if(active)for(const key of active.imageIds){
   const item=await read('image_blobs_v2',[active.namespace,key]);
   images[key]=item&&{id:item.id,size:item.size,sha256:item.sha256};
  }
  db.close();
  async function digest(blob){
   return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  return {active,staging,metadata,images,legacy:legacy&&{
   revision:legacy.revision,style:legacy.projects[0].production.style,
   sha:await digest(legacy.projects[0].images.mainImage.blob)
  }};
 });
}

async function fault(page,kind){
 await page.evaluate(kind=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(data,key){
   if(this.name==='image_blobs_v2'&&kind==='quota'){
    throw new DOMException('simulated quota','QuotaExceededError');
   }
   if(this.name==='image_blobs_v2'&&kind==='staged-corrupt'){
    data={...data,blob:new Blob([new Uint8Array(data.size)],{type:data.type})};
   }
   if(this.name==='collections_v2'&&key==='active'&&kind==='interrupt'){
    this.transaction.abort();
    throw new Error('simulated interruption');
   }
   return put.call(this,data,key);
  };
 },kind);
}

const api=page=>page.evaluate(async()=>{
 window.p1=await import('./js/store.js');
 window.skins=['beige_01','green_03'];
});

test('旧形式から移行し、メタ情報だけの編集と原画の差し替えを分離する',async()=>{
 const browser=await launch();
 try{
  const page=await browser.newPage(browse);
  await enter(page);await seed(page);const before=await snapshot(page);await api(page);
  await page.evaluate(()=>p1.loadCollection(skins));
  await page.reload();await api(page);
  const writes=await page.evaluate(async()=>{
   const {loadCollection,saveCollection}=p1;
   const state=await loadCollection(skins);
   const project=state.collection.projects[0];
   const original=project.images.mainImage.blob;
   const put=IDBObjectStore.prototype.put,del=IDBObjectStore.prototype.delete;
   const log=[];
   IDBObjectStore.prototype.put=function(value,key){
    if(this.name==='image_blobs_v2')log.push(['put',key[1]]);
    return put.call(this,value,key);
   };
   IDBObjectStore.prototype.delete=function(key){
    if(this.name==='image_blobs_v2')log.push(['delete',key[1]]);
    return del.call(this,key);
   };
   project.skinId='green_03';project.production.style='更新した水彩';
   const revision=await saveCollection(state.collection,state.revision);
   const metaWrites=log.splice(0);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=8;
   const replacement=await new Promise(resolve=>canvas.toBlob(resolve));
   project.images.mainImage={name:'replacement.png',blob:replacement};
   await saveCollection(state.collection,revision);
   const imageWrites=log.splice(0);
   let conflict;
   try{await saveCollection(state.collection,state.revision);}
   catch(error){conflict=error.message;}
   return {metaWrites,imageWrites,conflict,original:original.size};
  });
  assert.deepEqual(writes.metaWrites,[]);
  assert.equal(writes.imageWrites.filter(([kind])=>kind==='put').length,1);
  assert.match(writes.conflict,/別のタブ/);
  const after=await snapshot(page);
  assert.deepEqual(after.legacy,before.legacy);
  assert.equal(after.active.revision,11);
  assert.equal(after.metadata.skinId,'green_03');
  assert.equal(after.metadata.exportSettings['i_22.png'],33);
  assert.equal(after.metadata.production.style,'更新した水彩');
  assert.equal(after.metadata.production.world,'桃の里');
  assert.deepEqual(after.metadata.production.colors,['#AABBCC']);
  assert.equal(after.metadata.production.templates.common,'{画風メモ}');
  assert.equal(after.metadata.images.talkBackground.original.sha256,before.legacy.sha);
  assert.equal(after.metadata.production.characterSheet.original.sha256,before.legacy.sha);
  assert.equal(after.metadata.production.undo.mainImage.original.sha256,before.legacy.sha);
  assert.equal(after.metadata.images.mainImage.original.id,writes.imageWrites.find(([kind])=>kind==='put')[1]);
  assert.equal(after.staging,undefined);
 }finally{await browser.close();}
});

test('保存した画像のサイズとSHA-256不一致を作品名・スロット名付きで検出する',async()=>{
 const browser=await launch();
 try{
  for(const mode of ['size','hash']){
   const page=await browser.newPage(browse);
   await enter(page);await seed(page);await api(page);
   await page.evaluate(async mode=>{
    await p1.loadCollection(skins);
    const request=indexedDB.open('line-theme-studio');
    const db=await new Promise((ok,err)=>{request.onsuccess=()=>ok(request.result);request.onerror=err;});
    const tx=db.transaction(['collections_v2','project_meta_v2','image_blobs_v2'],'readwrite');
    tx.objectStore('collections_v2').get('active').onsuccess=event=>{
     const ns=event.target.result.namespace;
     tx.objectStore('project_meta_v2').get([ns,'legacy-project']).onsuccess=event=>{
      const key=[ns,event.target.result.images.mainImage.original.id],store=tx.objectStore('image_blobs_v2');
      store.get(key).onsuccess=event=>{
       const image=event.target.result;
       image.blob=new Blob([new Uint8Array(image.size+(mode==='size'?1:0))],{type:image.type});
       store.put(image,key);
      };
     };
    };
    await new Promise((ok,err)=>{tx.oncomplete=ok;tx.onabort=err;});db.close();
   },mode);
   await page.goto(base+'index.html');
   await page.locator('#load-error').waitFor();
   const error=await page.locator('#load-error').textContent();
   assert.match(error,/移行テスト.*メイン画像.*main\.png/);
   assert.match(error,mode==='size'?/サイズ/:/SHA-256/);
   assert.equal((await snapshot(page)).legacy.revision,9);
   await page.close();
  }
 }finally{await browser.close();}
});

test('診断はデコード可能な同サイズの別データを不一致と表示し、欠損枠も飛ばさず報告する',async()=>{
 const browser=await launch();
 try{
  for(const kind of ['替わった画像','欠損']){
   const page=await browser.newPage(browse);
   await enter(page);await seed(page);await api(page);
   await page.evaluate(async kind=>{
    await p1.loadCollection(skins);
    const request=indexedDB.open('line-theme-studio');
    const db=await new Promise((ok,err)=>{request.onsuccess=()=>ok(request.result);request.onerror=err;});
    const tx=db.transaction(['collections_v2','project_meta_v2','image_blobs_v2'],'readwrite');
    tx.objectStore('collections_v2').get('active').onsuccess=event=>{
     const ns=event.target.result.namespace;
     tx.objectStore('project_meta_v2').get([ns,'legacy-project']).onsuccess=event=>{
      const key=[ns,event.target.result.images.mainImage.original.id],store=tx.objectStore('image_blobs_v2');
      if(kind==='欠損'){store.delete(key);return;}
      store.get(key).onsuccess=event=>{
       const image=event.target.result;
       image.blob=new Blob([image.blob.slice(0,-1),Uint8Array.of(1)],{type:image.type});
       store.put(image,key);
      };
     };
    };
    await new Promise((ok,err)=>{tx.oncomplete=ok;tx.onabort=err;});db.close();
   },kind);
   const before=await snapshot(page);
   await page.reload();
   await page.locator('#diagnostic-start').click();
   await page.getByText('25枠の診断が完了しました。').waitFor();
   const report=await page.locator('#diagnostic-report').inputValue();
   const main=report.split('[メイン画像] ')[1].split('[トーク背景] ')[0];
   assert.match(main,/main\.png/);
   if(kind==='欠損'){
    assert.match(main,/MissingBlob/);
    assert.match(main,/不一致（参照先の画像データがありません）/);
   }else{
    assert.match(main,/デコード: 成功/);
    assert.match(main,/不一致（画像のSHA-256が一致しません）/);
   }
   assert.match(report,/\[トーク背景\] talk\.png[\s\S]+?サイズ・SHA-256一致/);
   assert.deepEqual(await snapshot(page),before);
   await page.close();
  }
 }finally{await browser.close();}
});

test('容量不足・中断・破損で移行元を保持し、未検証データを有効化しない',async()=>{
 const browser=await launch();
 try{
  for(const kind of ['quota','interrupt','corrupt','staged-corrupt']){
   const page=await browser.newPage(browse);
   await enter(page);await seed(page,kind==='corrupt');const before=await snapshot(page);
   await api(page);await fault(page,kind);
   const problem=await page.evaluate(async()=>{
    try{await p1.loadCollection(skins);}
    catch(error){return error.message;}
   });
   assert.match(problem,/元のデータは保持されています/);
   if(kind==='quota')assert.match(problem,/空き容量/);
   if(kind.includes('corrupt'))assert.match(problem,/移行テスト.*メイン画像/);
   if(kind==='staged-corrupt')assert.match(problem,/SHA-256/);
   const blocked=await snapshot(page);
   assert.deepEqual(blocked.legacy,before.legacy);
   assert.equal(blocked.active,undefined);
   if(kind==='interrupt'){
    assert.ok(blocked.staging);
    await page.reload();await api(page);
    await page.evaluate(()=>p1.loadCollection(skins));
    const recovered=await snapshot(page);
    assert.equal(recovered.active.revision,9);
    assert.equal(recovered.staging,undefined);
    assert.deepEqual(recovered.legacy,before.legacy);
   }
   await page.close();
  }
 }finally{await browser.close();}
});

const oldUrl=process.env.OLD_TEST_URL;
test('旧コミットの実画面で作成した作品を、同じオリジンの新コミットで読み込む',
 {skip:!oldUrl},async()=>{
  const browser=await launch();
  try{
   const page=await browser.newPage(browse);
   async function open(url){
    await page.goto(url);
    const entry=page.getByRole('button',{name:'Open the page'});
    if(await entry.count())await entry.click();
    assert.equal(new URL(page.url()).origin,new URL(base).origin);
    await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='自動保存が有効です');
   }
   const saved=()=>page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='自動保存済み');
   await open(oldUrl);
   const data=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=20;
    const context=canvas.getContext('2d');context.fillStyle='#AABBCC';context.fillRect(0,0,20,20);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));
    return [...new Uint8Array(await blob.arrayBuffer())];
   });
   await page.locator('[data-slot=mainImage] input').setInputFiles({
    name:'旧版で作成.png',mimeType:'image/png',buffer:Buffer.from(data)
   });
   await page.locator('[data-slot=mainImage] .asset-filename').getByText('旧版で作成.png').waitFor();
   await page.locator('summary').filter({hasText:'制作メモ・キャラ表'}).click();
   await page.locator('#production-style').fill('旧版の画風');
   await page.locator('#production-world').fill('旧版の世界観');
   await saved();
   const before=await snapshot(page);
   assert.equal(before.legacy.style,'旧版の画風');
   assert.equal(before.active,null);
   await open(base+'index.html');
   assert.equal(await page.locator('#production-world').inputValue(),'旧版の世界観');
   assert.equal(await page.locator('#production-style').inputValue(),'旧版の画風');
   await page.locator('[data-slot=mainImage] .asset-filename').getByText('旧版で作成.png').waitFor();
   const after=await snapshot(page);
   assert.equal(after.active.revision,before.legacy.revision);
   assert.equal(Object.values(after.images)[0].sha256,before.legacy.sha);
   assert.deepEqual(after.legacy,before.legacy);
   await page.reload();
   await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='自動保存が有効です');
   assert.equal(await page.locator('#production-world').inputValue(),'旧版の世界観');
   assert.deepEqual((await snapshot(page)).images,after.images);
  }finally{await browser.close();}
 });
