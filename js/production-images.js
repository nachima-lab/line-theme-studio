import {editOriginal,exteriorMask} from './export-images.js';

export function removeExteriorWhite(blob,threshold){
 return editOriginal(blob,pixels=>{
  const mask=exteriorMask(pixels,threshold);
  for(let p=0;p<mask.length;p++){
   if(mask[p])pixels.data[p*4+3]=0;
  }
 });
}

function rgb(hex){
 return [1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));
}

export function replaceColor(blob,from,to,tolerance){
 const [r,g,b]=rgb(from),[red,green,blue]=rgb(to);
 return editOriginal(blob,({data})=>{
  for(let i=0;i<data.length;i+=4){
   if(!data[i+3]||Math.max(Math.abs(data[i]-r),Math.abs(data[i+1]-g),Math.abs(data[i+2]-b))>tolerance)continue;
   data[i]=red;
   data[i+1]=green;
   data[i+2]=blue;
  }
 });
}
