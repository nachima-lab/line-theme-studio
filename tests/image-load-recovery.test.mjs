import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoverablePreview} from '../js/recoverable-preview.js';
import {replaceColor,removeExteriorWhite} from '../js/production-images.js';

function mockBrowser(t){
 const urls=new Map(),revoked=new Set(),originals=new Set(),images=[];
 let nextUrl=0,failCopied=false,failOriginal=true;
 class MockImage extends EventTarget{
  constructor(){
   super();
   images.push(this);
  }
  async decode(){
   const blob=urls.get(this.src);
   if(failCopied||failOriginal&&originals.has(blob)){
    throw new DOMException('Loading error.','EncodingError');
   }
   this.naturalWidth=this.naturalHeight=1;
  }
  removeAttribute(){this.src='';}
 }
 const canvas={
  getContext:()=>({
   canvas,
   drawImage:()=>{},
   getImageData:()=>({width:1,height:1,data:new Uint8ClampedArray([255,255,255,255])}),
   putImageData:()=>{}
  }),
  toBlob:resolve=>resolve(new Blob(['png'],{type:'image/png'}))
 };
 t.mock.method(URL,'createObjectURL',blob=>{
  const url='blob:test/'+(++nextUrl);
  urls.set(url,blob);
  return url;
 });
 t.mock.method(URL,'revokeObjectURL',url=>revoked.add(url));
 const oldImage=globalThis.Image,oldDocument=globalThis.document;
 globalThis.Image=MockImage;
 globalThis.document={createElement:()=>canvas};
 t.after(()=>{
  globalThis.Image=oldImage;
  globalThis.document=oldDocument;
 });
 function original(){
  const blob=new Blob(['original'],{type:'image/png'});
  originals.add(blob);
  const read=t.mock.method(blob,'arrayBuffer');
  return {blob,read};
 }
 return {original,urls,revoked,images,
  allowDirect:()=>{failOriginal=false;},rejectCopies:()=>{failCopied=true;}};
}

test('色置換と外周透過は直接デコードに失敗した画像を読み直し、作業用URLを解放する',async t=>{
 const browser=mockBrowser(t);
 for(const edit of [
  blob=>replaceColor(blob,'#FFFFFF','#F4A9A0',12),
  blob=>removeExteriorWhite(blob,248)
 ]){
  const {blob,read}=browser.original();
  assert.equal((await edit(blob)).type,'image/png');
  assert.equal(read.mock.callCount(),1);
 }
 assert.equal(browser.revoked.size,4);
});

test('直接デコードに成功した原画はバイトをコピーしない',async t=>{
 const browser=mockBrowser(t);
 browser.allowDirect();
 const {blob,read}=browser.original();
 await removeExteriorWhite(blob,248);
 assert.equal(read.mock.callCount(),0);
});

test('原画欄は再試行にも失敗したときだけ一時Blobで表示し直す',async t=>{
 const browser=mockBrowser(t);
 const {blob,read}=browser.original();
 const reports=[];
 let mounted,resolve;
 const attached=new Promise(done=>{resolve=done;});
 const preview=createRecoverablePreview({
  label:'原画',report:text=>reports.push(text),
  attach:(image,url)=>{
   mounted=image;
   if(image&&browser.urls.get(url)!==blob)resolve(url);
  }
 });
 preview.show({id:'p',name:'作品'},{blob});
 mounted.dispatchEvent(new Event('error'));
 mounted.dispatchEvent(new Event('error'));
 const url=await attached;
 assert.equal(read.mock.callCount(),1);
 assert.equal(browser.revoked.has(url),false);
 assert.ok(reports.every(text=>text===''));
 preview.show(null,null);
 assert.equal(browser.revoked.has(url),true);
});

test('加工時の読み出し失敗とデコード失敗を区別する',async t=>{
 const browser=mockBrowser(t);
 const unreadable=browser.original().blob;
 unreadable.arrayBuffer=async()=>{throw new DOMException('Missing','NotReadableError');};
 await assert.rejects(removeExteriorWhite(unreadable,248),/原画データを読み取れません.*NotReadableError/);
 browser.rejectCopies();
 const {blob}=browser.original();
 await assert.rejects(removeExteriorWhite(blob,248),/原画は読み取れましたが、画像をデコードできません.*EncodingError/);
});
