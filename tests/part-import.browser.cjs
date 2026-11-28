const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright');

const base=process.env.TEST_URL??'http://127.0.0.1:8946/';
const wait=(page,id,text)=>page.waitForFunction(([id,text])=>
 document.getElementById(id).textContent.includes(text),[id,text]);
const partJSON=(id,part)=>JSON.stringify({sheetVersion:1,parts:{[id]:part}});

test('1枠のJSONを確認・更新し、他の設計や原画を保持する',async()=>{
 const browser=process.env.TEST_WEBKIT?await webkit.launch():await chromium.launch(process.env.CHROMIUM_PATH?{
  executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
 }:{});
 try{
  const page=await browser.newPage({...devices['iPhone 13'],ignoreHTTPSErrors:Boolean(process.env.TEST_URL)});
  const find=id=>page.locator('#'+id);
  await page.goto(base);
  const gate=page.getByRole('button',{name:'Open the page'});
  if(await gate.count())await gate.click();
  await wait(page,'save-status','自動保存が有効');
  await find('design-input').fill(JSON.stringify({sheetVersion:1,worldview:'月の町',characters:[
   {id:'bird',name:'鳥',description:'青い羽'}
  ],parts:{talkBackground:{composition:'月は右上'}}}));
  await find('design-preview').tap();
  await find('design-apply').tap();
  await wait(page,'design-status','取り込みました');
  await find('workflow-create').tap();
  const main=page.locator('[data-slot="mainImage"]');
  if(!process.env.TEST_WEBKIT){
   const png=await page.evaluate(()=>document.createElement('canvas').toDataURL().split(',')[1]);
   await main.locator('input[type=file]').setInputFiles({name:'keep.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await wait(page,'progress-images','1/25');
   await wait(page,'save-status','自動保存済み');
  }
  await page.evaluate(()=>{
   window.writes=[];
   const remember=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){
    window.writes.push(this.name);
    return remember.apply(this,args);
   };
   const write=navigator.clipboard.writeText.bind(navigator.clipboard);
   navigator.clipboard.writeText=async data=>{await write(data);window.clipboardWritten=data;};
  });
  await main.locator('.part-open').tap();
  assert.equal(await find('part-copy-revision').isVisible(),false);
  assert.match(await find('part-copy-consultation').textContent(),/この枠の相談文/);
  await find('part-copy-consultation').tap();
  await wait(page,'part-status','コピーしました');
  const newPrompt=await page.evaluate(()=>window.clipboardWritten);
  assert.match(newPrompt,/"sheetVersion":1,"parts":\{"mainImage"/);
  assert.match(newPrompt,/個別設計は未設定/);
  assert.doesNotMatch(newPrompt,/【個別設計：/);
  await page.locator('#part-import summary').tap();
  await find('part-import-input').fill(partJSON('talkBackground',{composition:'別枠の案'}));
  await find('part-import-preview').tap();
  await wait(page,'part-import-status','一致しません');
  assert.equal(await find('part-import-review').isVisible(),false);
  const first={composition:'大きな月',characterIds:['bird'],motifs:['封筒'],placement:'左下',expression:'笑顔',stateNotes:'輪郭統一'};
  await find('part-import-input').fill(partJSON('mainImage',first));
  await find('part-import-preview').tap();
  assert.match(await find('part-import-target').textContent(),/メイン画像.*mainImage/);
  assert.match(await find('part-import-review').textContent(),/まだ保存されていません/);
  assert.match(await find('part-import-changes').textContent(),/大きな月/);
  assert.deepEqual(await page.evaluate(()=>window.writes),[]);
  await find('part-import-cancel').tap();
  assert.equal(await find('part-import-review').isVisible(),false);
  await find('part-import-preview').tap();
  await find('part-import-apply').tap();
  await wait(page,'part-import-status','取り込みました');
  assert.equal(await page.getByLabel('構図',{exact:true}).inputValue(),'大きな月');
  await find('part-import-input').fill(partJSON('mainImage',{composition:'小さな星'}));
  await find('part-import-preview').tap();
  assert.match(await find('part-import-changes').textContent(),/大きな月 → 小さな星/);
  await find('part-import-apply').tap();
  await wait(page,'part-import-status','取り込みました');
  assert.equal(await find('part-copy-revision').isVisible(),true);
  assert.match(await find('part-copy').textContent(),/画像生成の指示文/);
  await find('part-copy').tap();
  await wait(page,'part-status','コピーしました');
  const prompt=await page.evaluate(()=>window.clipboardWritten);
  for(const term of ['小さな星','月の町','青い羽','封筒','左下','笑顔','輪郭統一'])assert.ok(prompt.includes(term),term);
  assert.match(prompt,/原画を作成してください/);
  assert.doesNotMatch(prompt,/変更が決まった項目だけ/);
  await page.getByLabel('構図',{exact:true}).fill('未保存の構図');
  const beforeCopy=await page.evaluate(()=>window.writes.length);
  await find('part-copy-revision').tap();
  await wait(page,'part-status','コピーしました');
  const revised=await page.evaluate(()=>window.clipboardWritten);
  for(const term of ['小さな星','鳥（bird）','封筒','左下','笑顔','輪郭統一','変更が決まった項目だけ'])assert.ok(revised.includes(term),term);
  assert.doesNotMatch(revised,/未保存の構図/);
  assert.match(revised,/"sheetVersion":1,"parts":\{"mainImage"/);
  assert.equal(await page.evaluate(()=>window.writes.length),beforeCopy);
  assert.ok(!(await page.evaluate(()=>window.writes)).includes('image_blobs_v2'));
  await page.reload();
  await wait(page,'save-status','自動保存が有効');
  if(!process.env.TEST_WEBKIT)assert.match(await main.innerText(),/keep.png/);
  assert.equal(await page.getByLabel('構図',{exact:true}).inputValue(),'未保存の構図');
  page.once('dialog',dialog=>dialog.accept());
  await find('part-discard').tap();
  assert.equal(await page.getByLabel('構図',{exact:true}).inputValue(),'小さな星');
  assert.equal(await find('part-copy-revision').isVisible(),true);
  await find('part-back').tap();
  await page.locator('[data-slot="talkBackground"] .part-open').tap();
  assert.equal(await page.getByLabel('構図',{exact:true}).inputValue(),'月は右上');
 }finally{await browser.close();}
});
