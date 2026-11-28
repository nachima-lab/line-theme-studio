const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {chromium}=require('playwright');

const base=process.env.TEST_URL??'http://127.0.0.1:8926/next/';
const old=process.env.OLD_TEST_URL??'http://127.0.0.1:8926/old/';
const fields=['title','description','creatorName'];
const labels=['タイトル','説明文','クリエイター名'];
const sample=(value,index)=>index===1?value+'\n2行目':value+index;
const samples={ja:'桃太郎',en:'  Peach Boy  ','zh-Hant':'桃太郎傳說',th:'โมโมทาโร่'};
const slot='[data-slot="mainImage"]';
const status=(page,value)=>page.waitForFunction(value=>document.querySelector('#save-status').textContent.includes(value),value);
const saved=page=>status(page,'自動保存済み');
const field=(page,key)=>page.locator('#sales-'+key);

async function open(page,url){
 await page.goto(new URL('index.html',url).href);
 const entry=page.getByRole('button',{name:'Open the page'});
 if(await entry.count())await entry.click();
 await status(page,'自動保存が有効');
}

async function usingPage(run){
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{
  executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
 }:{});
 try{
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await run(page);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}

async function image(page){
 const png=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=24;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#b54d46';
  ctx.fillRect(0,0,24,24);
  return canvas.toDataURL().split(',')[1];
 });
 await page.locator(slot+' input').setInputFiles({name:'legacy-main.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await saved(page);
}

async function restore(page,file){
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#import-backup').setInputFiles(file);
 await status(page,'バックアップを復元しました');
}

async function stage(page,name){
 const tab=page.locator('#workflow-'+name);
 if(await tab.count())await tab.click();
}

async function checkTexts(page){
 await stage(page,'apply');
 for(const [language,value] of Object.entries(samples)){
  await field(page,'language').selectOption(language);
  for(const [index,key] of fields.entries())assert.equal(await field(page,key).inputValue(),sample(value,index));
 }
}

test('4言語の保存・正確なコピー・警告・画像書き込みなし・v5往復',()=>usingPage(async page=>{
 await open(page,base);
 await stage(page,'apply');
 assert.equal(await field(page,'coins').inputValue(),'150');
 assert.equal(await field(page,'japan').inputValue(),'true');
 assert.match(await field(page,'required').textContent(),/英語の必須項目が未入力/);
 await image(page);
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
 await field(page,'title').fill('桃'.repeat(21));
 assert.match(await field(page,'title-help').textContent(),/上限超過/);
 await field(page,'language').selectOption('en');
 assert.match(await field(page,'description-help').textContent(),/必須/);
 for(const [language,value] of Object.entries(samples)){
  await field(page,'language').selectOption(language);
  for(const [index,key] of fields.entries()){
   await field(page,key).fill(sample(value,index));
   await saved(page);
  }
 }
 await field(page,'copyright').fill('COPYRIGHT2026');
 await saved(page);
 assert.deepEqual(await page.evaluate(()=>window.imageWrites),[]);
 assert.equal(await field(page,'required').textContent(),'');
 for(const [language,value] of Object.entries(samples)){
  await field(page,'language').selectOption(language);
  for(const [index,label] of labels.entries()){
   await page.getByRole('button',{name:label+'をコピー',exact:true}).click();
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),sample(value,index));
  }
 }
 await page.reload();
 await status(page,'自動保存が有効');
 await checkTexts(page);
 await stage(page,'prepare');
 const download=page.waitForEvent('download');
 await page.locator('#export-backup').click();
 const buffer=await readFile(await (await download).path());
 const version=await page.evaluate(async data=>{
  const {readZip}=await import('./js/zip.js');
  const zip=new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))]);
  const entries=await readZip(zip);
  return JSON.parse(await entries.get('project.json').text()).version;
 },buffer.toString('base64'));
 assert.equal(version,5);
 await stage(page,'apply');
 await field(page,'title').fill('復元前に変更');
 await saved(page);
 await restore(page,{name:'sales-v5.zip',mimeType:'application/zip',buffer});
 await checkTexts(page);
 assert.equal(await field(page,'copyright').inputValue(),'COPYRIGHT2026');
 assert.equal(await field(page,'coins').inputValue(),'150');
 assert.equal(await field(page,'japan').inputValue(),'true');
 assert.match(await page.locator(slot).innerText(),/legacy-main.png/);
}));

test('7b1378bで作成した販売情報のない作品を同じ保存領域から開く',()=>usingPage(async page=>{
 assert.equal(new URL(old).origin,new URL(base).origin);
 await open(page,old);
 page.once('dialog',dialog=>dialog.accept('旧本番で作った作品'));
 await page.locator('#new-project').click();
 await saved(page);
 await image(page);
 await page.getByText('制作メモ・キャラ表',{exact:true}).click();
 await page.locator('#production-world').fill('旧本番の世界観');
 await saved(page);
 await open(page,base);
 assert.match(await page.locator(slot).innerText(),/legacy-main.png/);
 await stage(page,'create');
 await page.locator(slot+' img').waitFor({state:'visible'});
 assert.equal(await page.locator('#production-world').inputValue(),'旧本番の世界観');
 assert.equal(await field(page,'coins').inputValue(),'');
 assert.equal(await field(page,'japan').inputValue(),'');
 assert.equal(await field(page,'title').inputValue(),'');
}));

for(const version of [2,3,4]){
 const fixture=process.env['BACKUP_V'+version];
 test('既存v'+version+'バックアップを復元',{skip:!fixture},()=>usingPage(async page=>{
  await open(page,base);
  await restore(page,fixture);
  assert.ok(await page.locator(slot+' img').count());
  assert.equal(await field(page,'coins').inputValue(),version===4?'150':'');
 }));
}
