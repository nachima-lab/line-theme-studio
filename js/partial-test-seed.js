import {createProject,defineCollection,loadCollection,saveCollection} from './store.js';
import {loadSkins} from './skins.js';

const button=document.getElementById('seed');
const status=document.getElementById('seed-status');
const testOrigin='https://raw.githack.com';
const name='部分ZIP検証サンプル';

async function normalImage(){
 const canvas=document.createElement('canvas');
 canvas.width=120;canvas.height=120;
 const context=canvas.getContext('2d');
 context.fillStyle='#256e70';context.fillRect(0,0,120,120);
 context.fillStyle='#fff';context.font='24px sans-serif';context.fillText('OK',41,68);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>{
  if(blob?.size)resolve(blob);
  else reject(new Error('正常画像を用意できませんでした'));
 },'image/png'));
}

if(location.origin!==testOrigin){
 status.textContent='検証専用ホストで開いてください。保存データへのアクセスは中止しました。';
}else{
 button.disabled=false;
 button.addEventListener('click',async()=>{
  button.disabled=true;
  status.textContent='準備中…';
  try{
   const ids=(await loadSkins()).map(skin=>skin.id);
   const {collection,revision}=await loadCollection(ids);
   const project=createProject(name);
   project.images.mainImage={name:'normal.png',blob:await normalImage()};
   project.images.menuBackground={name:'zero-byte.png',blob:new Blob([],{type:'image/png'})};
   project.production.world='部分ZIP検証：この制作メモが復元後も残ること。';
   const others=collection.projects.filter(item=>item.name!==name);
   await saveCollection(defineCollection([...others,project],project.id),revision);
   location.assign('./index.html');
  }catch(error){
   status.textContent='準備に失敗しました。'+error.message;
   button.disabled=false;
  }
 });
}
