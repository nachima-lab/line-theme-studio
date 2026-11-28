const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright');

const base=process.env.TEST_URL??'http://127.0.0.1:8952/design/';
const ready=page=>page.waitForFunction(()=>document.querySelector('#save-status')?.textContent.includes('自動保存が有効'));
const text=(page,id,value)=>page.waitForFunction(([id,value])=>document.getElementById(id).textContent.includes(value),[id,value]);
const field=page=>page.getByLabel('構図',{exact:true});
const card=id=>'[data-slot="'+id+'"]';

test('専用画面の復帰・一覧位置・枠別の下書き・保存競合の保護',async()=>{
 const browser=process.env.TEST_WEBKIT?await webkit.launch():await chromium.launch(process.env.CHROMIUM_PATH?{
  executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
 }:{});
 try{
  const context=await browser.newContext(devices['iPhone 13']);
  const page=await context.newPage();
  const find=id=>page.locator('#'+id);
  const part=id=>page.locator(card(id)+' .part-open');
  await page.goto(base);
  await ready(page);
  await find('workflow-create').tap();
  const group=page.locator('.menu-assets');
  await group.locator('summary').tap();
  const off=part('menu-talk-off');
  await off.scrollIntoViewIfNeeded();
  const before=await page.locator(card('menu-talk-off')).evaluate(el=>Math.max(64,el.getBoundingClientRect().top));
  await off.tap();
  await text(page,'part-heading','トーク OFF');
  assert.equal(await find('part-list-screen').isVisible(),false);
  await page.locator('#part-import summary').tap();
  const pasted=JSON.stringify({sheetVersion:1,parts:{'menu-talk-off':{placement:'左'}}});
  await find('part-import-input').fill(pasted);
  await field(page).fill('  下書きの構図  ');
  await find('workflow-check').tap();
  await find('workflow-create').tap();
  assert.equal(await field(page).inputValue(),'  下書きの構図  ');
  await page.reload();
  await ready(page);
  assert.equal(await field(page).inputValue(),'  下書きの構図  ');
  assert.equal(await find('part-import-input').inputValue(),pasted);
  assert.equal(await find('part-import-review').isVisible(),false);
  await find('part-back').tap();
  assert.equal(await group.evaluate(el=>el.open),true);
  assert.equal(await off.evaluate(el=>document.activeElement===el),true);
  const after=await page.locator(card('menu-talk-off')).evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(Math.abs(after-before)<10,{before,after});
  await off.tap();
  await find('part-next-slot').tap();
  assert.notEqual(await find('part-heading').textContent(),'メニューアイコン トーク OFFを作る');
  assert.equal(await field(page).inputValue(),'');
  await find('part-back').tap();
  await off.tap();
  assert.equal(await field(page).inputValue(),'  下書きの構図  ');

  const other=await context.newPage();
  await other.goto(base);
  await ready(other);
  await other.locator('#workflow-create').tap();
  await other.locator('.menu-assets summary').tap();
  await other.locator(card('menu-talk-off')+' .part-open').tap();
  assert.equal(await field(other).inputValue(),'');
  await field(other).fill('別タブで保存済み');
  await other.locator('#part-save').tap();
  await text(other,'part-status','個別設計を保存しました');
  await page.bringToFront();
  await find('part-save').tap();
  await text(page,'part-status','別のタブで作品が更新されました');
  await page.reload();
  await ready(page);
  assert.equal(await field(page).inputValue(),'  下書きの構図  ');
  assert.equal(await find('part-import-input').inputValue(),pasted);
  assert.equal(await find('part-save').isDisabled(),true);
  await text(page,'part-draft-status','保存済みの設計が変わりました');
  await page.locator('#part-conflict summary').tap();
  assert.match(await find('part-saved-values').textContent(),/別タブで保存済み/);
  page.once('dialog',dialog=>dialog.accept());
  await find('part-discard').tap();
  assert.equal(await field(page).inputValue(),'別タブで保存済み');
  assert.equal(await find('part-import-input').inputValue(),'');
  await field(page).fill('最初の作品だけの下書き');
  const first=await find('project-list').inputValue();
  await find('workflow-prepare').tap();
  page.once('dialog',dialog=>dialog.accept('別の作品'));
  await find('new-project').tap();
  await page.waitForFunction(first=>document.querySelector('#project-list').value!==first,first);
  await find('workflow-create').tap();
  assert.equal(await find('part-workspace').isVisible(),false);
  await group.locator('summary').evaluate(el=>el.parentElement.open=true);
  await off.tap();
  assert.equal(await field(page).inputValue(),'');
  await find('project-list').selectOption(first);
  await page.waitForFunction(()=>document.querySelector('#part-workspace').hidden);
  await off.tap();
  assert.equal(await field(page).inputValue(),'最初の作品だけの下書き');

  if(!process.env.TEST_WEBKIT){
   const png=await page.evaluate(()=>document.createElement('canvas').toDataURL().split(',')[1]);
   const file=name=>({name,mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   for(const name of ['最初.png','差し替え.png']){
    const chooser=page.waitForEvent('filechooser');
    await page.locator('#part-image-card .asset-upload').tap();
    await (await chooser).setFiles(file(name));
    await page.waitForFunction(name=>document.querySelector('#part-image-card .asset-filename').textContent===name,name);
    await text(page,'part-image-save-status','自動保存済み');
   }
   await page.locator('#part-image-card .asset-remove').tap();
   await text(page,'progress-images','0/25');
   await text(page,'part-image-save-status','自動保存済み');
  }

 }finally{await browser.close();}
});
