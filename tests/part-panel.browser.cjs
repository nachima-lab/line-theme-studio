const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.TEST_URL??'http://127.0.0.1:8940/';
const wait=(page,id,text)=>page.waitForFunction(([id,text])=>
 document.getElementById(id).textContent.includes(text),[id,text]);

test('個別設計を編集・保存・再表示し、相談文とキャラ表のヒントをコピーする',async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{
  executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']
 }:{});
 try{
  const page=await browser.newPage({viewport:{width:320,height:680},permissions:['clipboard-read','clipboard-write']});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await wait(page,'save-status','自動保存が有効');
  const find=id=>page.locator('#'+id);
  const clipboard=()=>page.evaluate(()=>navigator.clipboard.readText());
  const png=await page.evaluate(()=>document.createElement('canvas').toDataURL().split(',')[1]);
  const file={name:'reference.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  await find('production-character-input').setInputFiles(file);
  await wait(page,'save-status','自動保存済み');
  await find('design-input').fill(JSON.stringify({sheetVersion:1,style:'水彩',characters:[
   {id:'bird',name:'鳥',description:'青い帽子'}
  ]}));
  await find('design-preview').click();
  await find('design-apply').click();
  await wait(page,'design-status','取り込みました');
  await find('workflow-create').click();
  assert.equal(await page.locator('.part-open').count(),25);
  const card=page.locator('[data-slot="talkBackground"]');
  await card.locator('.part-open').click();
  await find('part-copy').click();
  await wait(page,'part-status','コピーしました');
  assert.match(await clipboard(),/まだ画像は生成せず/);
  assert.match(await clipboard(),/青い帽子/);
  await page.getByLabel('構図',{exact:true}).fill('上半分に余白');
  await find('part-reference').check();
  await find('part-copy').click();
  await wait(page,'part-status','添付してください');
  assert.match(await clipboard(),/添付するキャラ表画像「reference.png」/);
  assert.match(await clipboard(),/構図：上半分に余白/);
  await find('part-character-selection').selectOption('specified');
  await find('part-copy').click();
  await wait(page,'part-status','コピーしました');
  assert.match(await clipboard(),/キャラクターは登場させない/);
  assert.doesNotMatch(await clipboard(),/reference.png/);
  await find('part-save').click();
  await find('part-dialog').waitFor({state:'hidden'});
  await page.reload();
  await wait(page,'save-status','自動保存が有効');
  await find('workflow-create').click();
  await card.locator('.part-open').click();
  assert.equal(await page.getByLabel('構図',{exact:true}).inputValue(),'上半分に余白');
  assert.equal(await find('part-character-selection').inputValue(),'specified');
  await find('part-close').click();
  await find('background-input').setInputFiles({...file,name:'background.png'});
  await wait(page,'background-status','background.png');
  await wait(page,'save-status','自動保存済み');
  await find('background-input').setInputFiles({...file,name:'replacement.png'});
  await wait(page,'background-status','replacement.png');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
