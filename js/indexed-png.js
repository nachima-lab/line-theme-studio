import {crc32} from './zip.js';

const encoder=new TextEncoder();
const signature=Uint8Array.of(137,80,78,71,13,10,26,10);

async function chunk(type,data){
 const payload=new Blob([encoder.encode(type),data]);
 const length=new DataView(new ArrayBuffer(4));
 length.setUint32(0,data.size??data.byteLength);
 const checksum=new DataView(new ArrayBuffer(4));
 checksum.setUint32(0,await crc32(payload));
 return new Blob([length,payload,checksum]);
}

export async function indexedPng({width,height,data},quantize){
 if(typeof CompressionStream!=='function')return null;
 const colors=new Map(),palette=[],alpha=[],indices=new Uint8Array(width*height);
 for(let pixel=0;pixel<indices.length;pixel++){
  const i=pixel*4,a=data[i+3];
  const r=a?quantize[data[i]]:0,g=a?quantize[data[i+1]]:0,b=a?quantize[data[i+2]]:0;
  const rgba=((r<<24)|(g<<16)|(b<<8)|a)>>>0;
  let index=colors.get(rgba);
  if(index===undefined){
   if(colors.size===256)return null;
   index=colors.size;
   colors.set(rgba,index);
   palette.push(r,g,b);
   alpha.push(a);
  }
  indices[pixel]=index;
 }
 const depth=colors.size<=2?1:colors.size<=4?2:colors.size<=16?4:8;
 const perByte=8/depth,stride=Math.ceil(width/perByte)+1;
 const rows=new Uint8Array(stride*height);
 for(let y=0;y<height;y++){
  for(let x=0;x<width;x++){
   const byte=y*stride+1+Math.floor(x/perByte);
   rows[byte]|=indices[y*width+x]<<(8-depth*(1+x%perByte));
  }
 }
 const header=new DataView(new ArrayBuffer(13));
 header.setUint32(0,width);header.setUint32(4,height);
 header.setUint8(8,depth);header.setUint8(9,3);
 const compressed=await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).blob();
 const chunks=[await chunk('IHDR',header),await chunk('PLTE',Uint8Array.from(palette))];
 if(alpha.some(value=>value!==255))chunks.push(await chunk('tRNS',Uint8Array.from(alpha)));
 chunks.push(await chunk('IDAT',compressed),await chunk('IEND',new Uint8Array()));
 return new Blob([signature,...chunks],{type:'image/png'});
}
