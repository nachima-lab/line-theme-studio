import {adjustment,cropBounds,PNG_LIMIT} from './export-spec.js';
import {indexedPng} from './indexed-png.js';
import {loadDecodedImage,loadImageFromCopy} from './image-preview.js';

function canvas(width,height){
 const element=document.createElement('canvas');
 element.width=width;
 element.height=height;
 const context=element.getContext('2d');
 if(!context)throw new Error('画像処理用の領域を確保できませんでした');
 return context;
}

function release(context){
 context.canvas.width=context.canvas.height=1;
}

async function withImage(blob,work,{retry=false}={}){
 let decoded;
 try{decoded=await loadDecodedImage(blob);}
 catch(error){
  if(!retry)throw error;
  decoded=await loadImageFromCopy(blob);
 }
 try{return await work(decoded.image);}
 finally{decoded.dispose();}
}

async function originalPixels(blob,options){
 return withImage(blob,image=>{
  const context=canvas(image.naturalWidth,image.naturalHeight);
  try{
   context.drawImage(image,0,0);
   return context.getImageData(0,0,image.naturalWidth,image.naturalHeight);
  }finally{release(context);}
 },options);
}

function sinc(x){
 return x===0?1:Math.sin(Math.PI*x)/(Math.PI*x);
}

function weights(start,length,count,limit){
 const step=length/count,scale=Math.max(1,step);
 return Array.from({length:count},(_,index)=>{
  const center=start+(index+.5)*step-.5;
  const left=Math.max(0,Math.ceil(center-3*scale));
  const right=Math.min(limit-1,Math.floor(center+3*scale));
  const values=new Float32Array(right-left+1);
  let sum=0;
  for(let i=0;i<values.length;i++){
   const distance=(left+i-center)/scale;
   values[i]=sinc(distance)*sinc(distance/3);
   sum+=values[i];
  }
  for(let i=0;i<values.length;i++)values[i]/=sum;
  return {left,values};
 });
}

// Lanczos 3の分離フィルター。透明な画素の色が輪郭ににじまないよう、
// RGBにアルファを掛けて補間し、出力時に戻す。
function resize(source,rect,width,height){
 const horizontal=weights(rect.x,rect.width,width,source.width);
 const vertical=weights(rect.y,rect.height,height,source.height);
 const first=vertical[0].left,last=vertical.at(-1);
 const rows=last.left+last.values.length-first;
 const intermediate=new Float32Array(rows*width*4);
 const data=source.data;
 for(let row=0;row<rows;row++){
  for(let x=0;x<width;x++){
   const {left,values}=horizontal[x];
   const start=((row+first)*source.width+left)*4;
   let red=0,green=0,blue=0,alpha=0;
   for(let j=0;j<values.length;j++){
    const i=start+j*4,weight=values[j]*data[i+3];
    red+=data[i]*weight;green+=data[i+1]*weight;blue+=data[i+2]*weight;alpha+=weight;
   }
   const dest=(row*width+x)*4;
   intermediate[dest]=red;intermediate[dest+1]=green;intermediate[dest+2]=blue;intermediate[dest+3]=alpha;
  }
 }
 const output=new ImageData(width,height);
 for(let y=0;y<height;y++){
  const {left,values}=vertical[y];
  for(let x=0;x<width;x++){
   let red=0,green=0,blue=0,alpha=0;
   for(let j=0;j<values.length;j++){
    const i=((left-first+j)*width+x)*4,weight=values[j];
    red+=intermediate[i]*weight;green+=intermediate[i+1]*weight;blue+=intermediate[i+2]*weight;
    alpha+=intermediate[i+3]*weight;
   }
   const dest=(y*width+x)*4;
   if(alpha>=.5){
    output.data[dest]=red/alpha;output.data[dest+1]=green/alpha;output.data[dest+2]=blue/alpha;
    output.data[dest+3]=alpha;
   }
  }
 }
 return output;
}

function fullRect({width,height}){
 return {x:0,y:0,width,height};
}

export function exteriorMask({data,width,height},threshold){
 const count=width*height,mask=new Uint8Array(count),queue=new Uint32Array(count);
 let read=0,write=0;
 function visit(pixel){
  if(mask[pixel])return;
  const i=pixel*4;
  if(data[i+3]&&Math.min(data[i],data[i+1],data[i+2])<threshold)return;
  mask[pixel]=1;
  queue[write++]=pixel;
 }
 for(let x=0;x<width;x++){visit(x);visit(count-width+x);}
 for(let y=1;y<height-1;y++){visit(y*width);visit(y*width+width-1);}
 while(read<write){
  const p=queue[read++],x=p%width;
  if(x>0)visit(p-1);
  if(x<width-1)visit(p+1);
  if(p>=width)visit(p-width);
  if(p<count-width)visit(p+width);
 }
 return mask;
}

function preparePasscode(source,threshold){
 const {data,width,height}=source,mask=exteriorMask(source,threshold);
 let left=width,top=height,right=-1,bottom=-1;
 for(let p=0;p<mask.length;p++){
  if(mask[p])data[p*4+3]=0;
  if(!data[p*4+3])continue;
  const x=p%width,y=Math.floor(p/width);
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 if(right<0)throw new Error('白判定のあとに絵柄が残りません。しきい値を調整してください');
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}

function prepareProfile(source,threshold){
 const {data}=source,mask=exteriorMask(source,threshold),frequencies=new Map();
 // 大きな原画は等間隔にサンプリングし、色の集計を抑える。
 const step=Math.max(1,Math.ceil(mask.length/250000));
 let mode=0xffffff,maximum=0;
 for(let p=0;p<mask.length;p+=step){
  const i=p*4,[r,g,b]=data.subarray(i,i+3);
  if(!data[i+3]||Math.min(r,g,b)>=threshold)continue;
  const color=(r<<16)|(g<<8)|b,count=(frequencies.get(color)??0)+1;
  frequencies.set(color,count);
  if(count>maximum){mode=color;maximum=count;}
 }
 for(let p=0;p<mask.length;p++){
  if(!mask[p])continue;
  const i=p*4;
  data[i]=mode>>16;data[i+1]=(mode>>8)&255;data[i+2]=mode&255;data[i+3]=255;
 }
 return resize(source,fullRect(source),240,240);
}

function drawIcon(context,source,spec){
 if(source.width!==source.height)throw new Error('メニューアイコンの原画は正方形にしてください');
 const {x,y,diameter}=spec;
 const icon=resize(source,fullRect(source),diameter,diameter);
 context.putImageData(icon,x,y);
 context.globalCompositeOperation='destination-in';
 context.beginPath();
 context.arc(x+diameter/2,y+diameter/2,diameter/2,0,2*Math.PI);
 // destination-inをキャンバス全体に適用し、円の外を透明にする。
 context.fill();
}

function drawPasscode(context,source,rect,spec,settings){
 const widthLimit=Math.round(spec.width*adjustment(settings,'passcodeWidth')/100);
 const scale=Math.min(widthLimit/rect.width,spec.height/rect.height);
 const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
 context.putImageData(resize(source,rect,width,height),Math.floor((spec.width-width)/2),Math.floor((spec.height-height)/2));
}

function encode(context){
 return new Promise((resolve,reject)=>context.canvas.toBlob(blob=>{
  if(blob?.type==='image/png')resolve(blob);
  else reject(new Error('PNGに変換できませんでした'));
 },'image/png'));
}

export async function editOriginal(blob,edit){
 const pixels=await originalPixels(blob,{retry:true});
 edit(pixels);
 const context=canvas(pixels.width,pixels.height);
 try{
  context.putImageData(pixels,0,0);
  return await encode(context);
 }finally{release(context);}
}

async function checkedPng(context){
 // PNGの可逆エンコードを優先する。上限を超えた場合だけRGBの段階数を減らす。
 const original=await encode(context);
 if(original.size<=PNG_LIMIT)return {blob:original,reduced:false};
 const {width,height}=context.canvas;
 const pixels=context.getImageData(0,0,width,height);
 const identity=Uint8Array.from({length:256},(_,i)=>i);
 const lossless=await indexedPng(pixels,identity);
 if(lossless?.size<=PNG_LIMIT)return {blob:lossless,reduced:false};

 const adjusted=new ImageData(width,height);
 adjusted.data.set(pixels.data);
 for(const levels of [32,16,8,4,2]){
  const quantize=Uint8Array.from({length:256},(_,i)=>Math.round(Math.round(i*(levels-1)/255)*255/(levels-1)));
  const indexed=await indexedPng(pixels,quantize);
  if(indexed){
   if(indexed.size<=PNG_LIMIT)return {blob:indexed,reduced:true};
   continue;
  }
  for(let i=0;i<pixels.data.length;i+=4){
   adjusted.data[i]=quantize[pixels.data[i]];
   adjusted.data[i+1]=quantize[pixels.data[i+1]];
   adjusted.data[i+2]=quantize[pixels.data[i+2]];
  }
  context.putImageData(adjusted,0,0);
  const blob=await encode(context);
  if(blob.size<=PNG_LIMIT)return {blob,reduced:true};
 }
 return {blob:original,reduced:false};
}

export async function renderSlot(blob,specs,settings){
 const source=await originalPixels(blob),kind=specs[0].kind;
 const rect=kind==='passcode'?preparePasscode(source,adjustment(settings,'passcodeWhite')):fullRect(source);
 const profile=kind==='profile'?prepareProfile(source,adjustment(settings,'profileWhite')):null;
 const outputs=[],encoded=new Map();
 for(const spec of specs){
  let result=encoded.get(spec.width);
  if(kind!=='passcode'||!result){
   const context=canvas(spec.width,spec.height);
   try{
    switch(kind){
     case 'crop': {
      const bounds=cropBounds(source.width,source.height,spec,settings);
      context.putImageData(resize(source,bounds,spec.width,spec.height),0,0);
      break;
     }
     case 'icon':drawIcon(context,source,spec);break;
     case 'passcode':drawPasscode(context,source,rect,spec,settings);break;
     case 'profile':
      context.putImageData(spec.width===240?profile:resize(profile,fullRect(profile),spec.width,spec.height),0,0);
      break;
    }
    result=await checkedPng(context);
    if(kind==='passcode')encoded.set(spec.width,result);
   }finally{release(context);}
  }
  outputs.push({name:spec.name,...result});
 }
 return outputs;
}

export async function drawCropPreview(context,blob,spec,settings,isCurrent){
 return withImage(blob,image=>{
  const bounds=cropBounds(image.naturalWidth,image.naturalHeight,spec,settings);
  if(!isCurrent())return;
  const width=Math.min(480,spec.width),height=Math.max(1,Math.round(width*spec.height/spec.width));
  context.canvas.width=width;context.canvas.height=height;
  context.imageSmoothingQuality='high';
  context.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height,0,0,width,height);
  return bounds;
 });
}
