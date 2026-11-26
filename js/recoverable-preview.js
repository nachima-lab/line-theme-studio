import {makeWorkingPreview,verifyOriginalBytes} from './image-preview.js';

// 再試行と縮小画像の再生成は一枚ずつ行い、一時的なメモリ使用量を抑える。
let repairs=Promise.resolve();

export function createRecoverablePreview({label,attach,report,background=false,savePreview}){
 let frame,url;

 function release(){
  if(url)URL.revokeObjectURL(url);
  url=null;
 }

 function attempt(current,blob,original){
  release();
  report('');
  current.state='loading';
  const image=new Image();
  image.decoding='async';
  if(!background){
   image.loading=original?'eager':'lazy';
   image.alt=label+'の登録画像';
  }
  image.addEventListener('load',()=>{
   if(frame!==current||current.image!==image)return;
   current.state='ok';
   if(background)attach(image,url);
   if(original&&current.rebuild&&savePreview){
    repairs=repairs.then(async()=>{
     if(frame!==current)return;
     try{
      const preview=await makeWorkingPreview(current.item.blob);
      if(frame===current)savePreview(current.projectId,current.item,preview);
     }catch{/* 表示済みの原画と登録情報を保持する。 */}
    });
   }
  },{once:true});
  image.addEventListener('error',()=>failed(current,image,original),{once:true});
  current.image=image;
  try{
   if(!blob.size)throw new Error('画像が0バイトです');
   url=URL.createObjectURL(blob);
   image.src=url;
   if(!background)attach(image,url);
  }catch{failed(current,image,original);}
 }

 function failed(current,image,original){
  if(frame!==current||current.image!==image)return;
  if(!original){
   current.rebuild=Boolean(current.item.preview);
   attempt(current,current.item.blob,true);
   return;
  }
  current.state='diagnosing';
  current.retryAfterDiagnosis=false;
  release();
  attach(null);
  repairs=repairs.then(async()=>{
   if(frame!==current)return;
   let reason;
   try{
    await verifyOriginalBytes(current.item.blob);
    reason='原画は読み取れましたが、プレビューを表示できません';
   }catch{
    reason=current.item.blob.size
     ?'原画データを読み取れないか、画像形式を解釈できません'
     :'原画データが0バイトです';
   }
   if(frame!==current)return;
   current.state='failed';
   report('「'+current.projectName+'」の'+label+'：'+reason+'。');
   if(current.retryAfterDiagnosis)retry();

  });
 }

 function show(project,item){
  if(frame?.item===item&&frame?.projectId===project?.id)return;
  release();
  attach(null);
  report('');
  frame=item?{item,projectId:project.id,projectName:project.name}:null;
  if(frame)attempt(frame,item.preview??item.blob,false);
 }

 function retry(){
  if(frame?.state==='diagnosing'){frame.retryAfterDiagnosis=true;return;}
  if(frame?.state==='failed')attempt(frame,frame.item.blob,true);
 }
 return {show,retry};
}
