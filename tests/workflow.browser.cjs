const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

test('制作工程・作品切替・プレビュー・狭い画面',async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{
  executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
 }:{});
 try{
  const page=await browser.newPage({viewport:{width:320,height:680}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:8930/');
  const open=page.getByRole('button',{name:'Open the page'});
  if(await open.count())await open.click();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='自動保存が有効です');
  const tab=id=>page.locator('#workflow-'+id);
  const select=id=>tab(id).click();
  const visible=selector=>page.locator(selector).waitFor({state:'visible'});
  for(const [id,selector] of [['prepare','#new-project'],['create','#asset-slots'],['check','#panel-talk'],['apply','#sales-section']]){
   await select(id);
   await visible(selector);
   assert.equal(await page.locator('.workflow-panel:visible').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
  }
  await select('check');
  for(const preview of ['passcode','menu','talk']){
   await page.locator('#tab-'+preview).click();
   await visible('#panel-'+preview);
  }
  await select('apply');
  const field=page.locator('#sales-title');
  await field.scrollIntoViewIfNeeded();
  await field.fill('試験販売');
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='自動保存済み');
  assert.ok(await field.evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.workflow-bar').getBoundingClientRect().bottom));
  await select('prepare');
  const list=page.locator('#project-list');
  const first=await list.inputValue();
  page.once('dialog',dialog=>dialog.accept('別作品'));
  await page.locator('#new-project').click();
  await page.waitForFunction(()=>document.querySelector('#project-list').selectedOptions[0]?.text==='別作品');
  assert.notEqual(await list.inputValue(),first);
  await select('apply');
  assert.equal(await field.inputValue(),'');
  await list.selectOption(first);
  await page.waitForFunction(()=>document.querySelector('#sales-title').value==='試験販売');
  assert.equal(await field.inputValue(),'試験販売');
  assert.equal(await tab('apply').getAttribute('aria-selected'),'true');
  assert.match(await page.locator('#progress-images').textContent(),/0\/25/);
  assert.match(await page.locator('#workflow-next').textContent(),/企画を相談するか/);
  const png=await page.evaluate(()=>document.createElement('canvas').toDataURL().split(',')[1]);
  const file={name:'test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  await select('prepare');
  await page.locator('#production-character-input').setInputFiles(file);
  await page.waitForFunction(()=>document.querySelector('#progress-sheet').textContent.includes('登録済み'));
  assert.match(await page.locator('#workflow-next').textContent(),/企画を相談するか/);
  await select('create');
  await page.locator('[data-slot="mainImage"] input').setInputFiles(file);
  await page.waitForFunction(()=>document.querySelector('#progress-images').textContent.includes('1/25'));
  await list.selectOption({label:'別作品'});
  await page.waitForFunction(()=>document.querySelector('#progress-images').textContent.includes('0/25'));
  assert.match(await page.locator('#workflow-next').textContent(),/企画を相談するか/);
  assert.equal(await tab('create').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-slot]').count(),25);
  await page.locator('.menu-assets summary').click();
  assert.equal(await page.locator('.menu-pair').count(),9);
  for(const pair of await page.locator('.menu-pair').all()){
   assert.deepEqual(await pair.locator('h4').allTextContents(),['OFF','ON']);
  }
  assert.equal(await page.locator('.skin-tile:visible').count(),0);
  await select('check');
  assert.equal(await page.locator('.skin-tile:visible').count(),0);
  await page.locator('#palette-picker summary').click();
  assert.equal(await page.locator('.skin-tile:visible').count(),50);
  await page.locator('#skin-filter').selectOption('Green');
  assert.equal(await page.locator('#skin-groups > section:visible').count(),1);
  assert.match(await page.locator('#skin-groups > section:visible h3').textContent(),/Green/);
  await page.locator('#skin-filter').selectOption('');
  assert.equal(await page.locator('.skin-tile:visible').count(),50);
  const oldColor=await page.locator('#talk-header').evaluate(el=>el.style.backgroundColor);
  await page.locator('[data-skin-id="green_03"]').click();
  await page.waitForFunction(()=>document.querySelector('#selected-name').textContent==='Green 03');
  assert.notEqual(await page.locator('#talk-header').evaluate(el=>el.style.backgroundColor),oldColor);
  assert.equal(await page.locator('.skin-tile:visible').count(),0);
  await page.locator('#tab-passcode').click();
  assert.equal(await page.locator('#passcode-upper').evaluate(el=>el.style.backgroundColor),'rgb(250, 252, 242)');
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='自動保存済み');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='自動保存が有効です');
  await select('check');
  assert.equal(await page.locator('#selected-name').textContent(),'Green 03');
  assert.equal(await page.locator('.skin-tile:visible').count(),0);
  await select('create');
  assert.equal(await page.locator('#choose-background').isVisible(),false);
  assert.equal(await page.locator('#production-tools details').evaluate(el=>el.open),false);
  await page.locator('[data-slot="talkBackground"] .part-open').click();
  const fileChooser=page.waitForEvent('filechooser');
  await page.locator('#choose-background').click();
  await (await fileChooser).setFiles(file);
  await page.waitForFunction(()=>document.querySelector('#progress-images').textContent.includes('1/25'));
  await page.waitForFunction(()=>document.querySelector('#background-thumbnail').style.backgroundImage.startsWith('url'));
  await page.locator('#part-back').click();
  const fixture=process.env.FULL_BACKUP;
  if(fixture){
   await select('prepare');
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('#import-backup').setInputFiles(fixture);
   await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('バックアップを復元しました'));
   assert.match(await page.locator('#progress-images').textContent(),/25\/25/);
   await select('apply');
   await page.locator('#submission-generate').click();
   const download=page.locator('#submission-download');
   await download.waitFor({state:'visible',timeout:120000});
   const href=await download.getAttribute('href');
   assert.equal(await page.locator('#submission-results tbody tr').count(),62);
   assert.match(await page.locator('#progress-zip').textContent(),/生成済み/);
   await select('check');
   await select('apply');
   assert.equal(await download.getAttribute('href'),href);
   const event=page.waitForEvent('download');
   await download.click();
   assert.match((await event).suggestedFilename(),/\.zip$/);
  }
  await select('apply');
  await page.setViewportSize({width:320,height:300});
  assert.equal(await page.locator('.workflow-bar').evaluate(el=>getComputedStyle(el).position),'static');
  await field.fill('短い表示領域でも入力');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
