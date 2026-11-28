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
  assert.notEqual(await list.inputValue(),first);
  await select('apply');
  assert.equal(await field.inputValue(),'');
  await list.selectOption(first);
  await page.waitForFunction(()=>document.querySelector('#sales-title').value==='試験販売');
  assert.equal(await field.inputValue(),'試験販売');
  assert.equal(await tab('apply').getAttribute('aria-selected'),'true');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
