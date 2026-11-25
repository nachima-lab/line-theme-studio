const MAX_PREVIEW_EDGE=1024;

// 原画は呼び出し元で保持し、表示用の縮小画像だけを生成する。
export async function makeWorkingPreview(blob){
 const url=URL.createObjectURL(blob);
 const image=new Image();
 try{
  image.src=url;
  await image.decode();
  const scale=MAX_PREVIEW_EDGE/Math.max(image.naturalWidth,image.naturalHeight);
  if(scale>=1)return undefined;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  try{
   const context=canvas.getContext('2d');
   if(!context)return undefined;
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const type=blob.type==='image/jpeg'?'image/jpeg':'image/png';
   return await new Promise(resolve=>canvas.toBlob(copy=>resolve(copy??undefined),type,.85));
  }catch{return undefined;}
  finally{canvas.width=canvas.height=1;}
 }finally{
  image.removeAttribute('src');
  URL.revokeObjectURL(url);
 }
}
