const PNG=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
const JPEG=[0xff,0xd8,0xff];
const HEIC_BRANDS=['heic','heix','hevc','hevx','heim','heis','hevm','hevs'];
const HEIF_BRANDS=['mif1','msf1','mif2'];

export function detectImageMime(bytes){
 if(PNG.every((byte,index)=>byte===bytes[index]))return 'image/png';
 if(JPEG.every((byte,index)=>byte===bytes[index]))return 'image/jpeg';
 if(bytes.length<12)return null;
 const code=offset=>String.fromCharCode(...bytes.subarray(offset,offset+4));
 if(code(0)==='RIFF'&&code(8)==='WEBP')return 'image/webp';
 if(code(4)!=='ftyp'||bytes.length<16)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const shortSize=view.getUint32(0);
 const header=shortSize===1?16:8;
 if(bytes.length<header+8)return null;
 const size=shortSize===1?Number(view.getBigUint64(8)):shortSize||bytes.length;
 if(size<header+8||size>bytes.length||(size-header)%4)return null;
 const brands=new Set([code(header)]);
 for(let offset=header+8;offset+4<=size;offset+=4)brands.add(code(offset));
 if(brands.has('avif')||brands.has('avis'))return null;
 if(HEIC_BRANDS.some(brand=>brands.has(brand)))return 'image/heic';
 if(HEIF_BRANDS.some(brand=>brands.has(brand)))return 'image/heif';
 return null;
}
