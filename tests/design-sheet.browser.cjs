const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {chromium}=require('playwright');

const base=process.env.TEST_URL??'http://127.0.0.1:8937/';
const wait=(page,id,text)=>page.waitForFunction(([id,text])=>
 document.getElementById(id).textContent.includes(text),[id,text]);
const saved=page=>wait(page,'save-status','自動保存済み');

test('設計取り込みの差分・競合・原文・v5復元と画像無変更',async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{
  executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
 }:{});
 try{
  const context=await browser.newContext({viewport:{width:320,height:680},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();

  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await wait(page,'save-status','自動保存が有効');
  const find=id=>page.locator('#'+id);
  await find('design-copy').click();
  await wait(page,'design-status','コピーしました');
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/"sheetVersion":1/);
  const png=await page.evaluate(()=>document.createElement('canvas').toDataURL().split(',')[1]);
  const image={name:'test-image.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  await page.locator('[data-slot="mainImage"] input').setInputFiles(image);
  await wait(page,'progress-images','1/25');
  await saved(page);
  await page.getByText('制作メモ・キャラ表',{exact:true}).click();
  await find('production-world').fill('手入力の世界観');
  await saved(page);
  await page.evaluate(()=>{
   window.imageWrites=[];
   for(const method of ['put','add','delete','clear']){
    const original=IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method]=function(...args){
     if(this.name==='image_blobs_v2')window.imageWrites.push(method);
     return original.apply(this,args);
    };
   }
  });
  await find('design-input').fill('{');
  await find('design-preview').click();
  await wait(page,'design-status','JSONとして読み取れません');
  const raw=JSON.stringify({sheetVersion:1,workName:'夜空',worldview:'上書き候補',style:'水彩',colors:['#aabbcc'],
   characters:[{id:'bird',name:'鳥',description:'青い帽子'}],motifs:['星'],notes:'文字なし',
   parts:{mainImage:{composition:'中央',characterIds:['bird']}}},null,2);
  await find('design-input').fill(raw);
  await find('design-preview').click();
  assert.equal(await page.getByLabel('世界観を反映',{exact:true}).isChecked(),false);
  assert.equal(await page.getByLabel('画風を反映',{exact:true}).isChecked(),true);
  await find('design-cancel').click();
  assert.equal(await find('design-input').inputValue(),raw);
  assert.equal(await find('production-style').inputValue(),'');
  await find('design-preview').click();
  await find('production-world').fill('確認後の手入力');
  await saved(page);
  await find('design-apply').click();
  await wait(page,'save-status','確認後に作品が変わりました');
  assert.equal(await find('design-input').inputValue(),raw);
  await find('design-preview').click();
  await find('design-apply').click();
  await wait(page,'design-status','取り込みました');
  assert.equal(await find('production-style').inputValue(),'水彩');
  assert.equal(await find('production-world').inputValue(),'確認後の手入力');
  assert.deepEqual(await page.evaluate(()=>window.imageWrites),[]);
  await page.getByText('キャラクター・モチーフ・補足を編集',{exact:true}).click();
  await find('design-notes').fill('手動で更新した補足');
  await find('design-save').click();
  await wait(page,'design-edit-status','設計情報を保存しました');
  assert.deepEqual(await page.evaluate(()=>window.imageWrites),[]);
  const event=page.waitForEvent('download');
  await find('export-backup').click();
  const path=await (await event).path();
  await page.reload();
  await wait(page,'save-status','自動保存が有効');
  assert.equal(await find('design-original').inputValue(),raw);
  assert.equal(await find('design-notes').inputValue(),'手動で更新した補足');
  page.once('dialog',dialog=>dialog.accept());
  await find('import-backup').setInputFiles({
   name:'design-v5.zip',mimeType:'application/zip',buffer:await readFile(path)
  });
  await wait(page,'save-status','バックアップを復元しました');
  assert.equal(await find('design-original').inputValue(),raw);
  assert.equal(await find('design-notes').inputValue(),'手動で更新した補足');
  assert.match(await find('design-parts').textContent(),/中央/);
  assert.match(await find('progress-images').textContent(),/1\/25/);
  const other=await page.context().newPage();
  await other.goto(base);
  await wait(other,'save-status','自動保存が有効');
  await other.getByText('キャラクター・モチーフ・補足を編集',{exact:true}).click();
  await other.locator('#design-notes').fill('別タブの更新');
  await other.locator('#design-save').click();
  await wait(other,'design-edit-status','設計情報を保存しました');
  const conflicting='{"sheetVersion":1,"notes":"競合した更新"}';
  await find('design-input').fill(conflicting);
  await find('design-preview').click();
  await page.getByLabel('補足・禁止事項を反映',{exact:true}).check();
  await find('design-apply').click();
  await wait(page,'save-status','別のタブで作品が更新されました');
  assert.equal(await find('design-input').inputValue(),conflicting);
  assert.equal(await find('design-notes').inputValue(),'手動で更新した補足');
  await page.reload();
  await wait(page,'save-status','自動保存が有効');
  assert.equal(await find('design-notes').inputValue(),'別タブの更新');
  assert.match(await find('progress-images').textContent(),/1\/25/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
