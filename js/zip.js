// 外部ライブラリ不要のZIP（STORE/無圧縮）生成・読込。
// PNG/JPEGは圧縮済みなので再圧縮せず、Base64の約33%増を避ける。
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const MAX_FILES=100,MAX_ENTRY=80*1024*1024,MAX_TOTAL=300*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function put16(v,o,n){v.setUint16(o,n,true);}
function put32(v,o,n){v.setUint32(o,n>>>0,true);}
function assertName(name){if(typeof name!=='string'||!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||name.includes('\0'))throw new Error('ZIP内のファイル名が不正です');}
export function writeZip(entries){
 if(entries.length>MAX_FILES)throw new Error('ファイル数が多すぎます');
 const locals=[],centrals=[];let offset=0,total=0;
 for(const {name,data} of entries){
  assertName(name);const nameBytes=enc.encode(name),bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  if(bytes.length>MAX_ENTRY||nameBytes.length>65535)throw new Error('ファイルが大きすぎます');
  total+=bytes.length;if(total>MAX_TOTAL)throw new Error('バックアップの合計サイズが大きすぎます');
  const crc=crc32(bytes),local=new Uint8Array(30+nameBytes.length),lv=new DataView(local.buffer);
  put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x800);put16(lv,8,0);
  put32(lv,14,crc);put32(lv,18,bytes.length);put32(lv,22,bytes.length);put16(lv,26,nameBytes.length);local.set(nameBytes,30);
  const central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);
  put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x800);put16(cv,10,0);
  put32(cv,16,crc);put32(cv,20,bytes.length);put32(cv,24,bytes.length);put16(cv,28,nameBytes.length);put32(cv,42,offset);central.set(nameBytes,46);
  locals.push(local,bytes);centrals.push(central);offset+=local.length+bytes.length;
 }
 const cdSize=centrals.reduce((sum,x)=>sum+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
 put32(ev,0,0x06054b50);put16(ev,8,entries.length);put16(ev,10,entries.length);put32(ev,12,cdSize);put32(ev,16,offset);
 return new Blob([...locals,...centrals,end],{type:'application/zip'});
}
export async function readZip(file){
 if(file.size>MAX_TOTAL+1024*1024)throw new Error('ZIPが大きすぎます');
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);
 const u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}}
 if(end<0)throw new Error('ZIPの終端が見つかりません');
 const count=u16(end+10),size=u32(end+12),start=u32(end+16);
 if(count>MAX_FILES||u16(end+8)!==count||start+size!==end||start>bytes.length)throw new Error('ZIPの構造が不正です');
 const result=new Map();let pos=start,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||u32(pos)!==0x02014b50)throw new Error('ZIPの目次が不正です');
  const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16),packed=u32(pos+20),raw=u32(pos+24);
  const nlen=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),localOffset=u32(pos+42);
  if(flags!==0x800||method!==0||packed!==raw||raw>MAX_ENTRY||pos+46+nlen+extra+comment>end)throw new Error('非対応のZIP形式です');
  const name=dec.decode(bytes.subarray(pos+46,pos+46+nlen));assertName(name);
  if(result.has(name))throw new Error('重複したファイルがあります');
  if(localOffset+30>start||u32(localOffset)!==0x04034b50)throw new Error('ZIPのファイル構造が不正です');
  const localNameLength=u16(localOffset+26),localExtra=u16(localOffset+28);
  const localName=dec.decode(bytes.subarray(localOffset+30,localOffset+30+localNameLength));
  const dataStart=localOffset+30+localNameLength+localExtra;
  if(localName!==name||dataStart+raw>start)throw new Error('ZIPのファイル位置が不正です');
  const data=bytes.slice(dataStart,dataStart+raw);
  if(crc32(data)!==crc)throw new Error('ZIP内のデータが破損しています');
  total+=raw;if(total>MAX_TOTAL)throw new Error('ZIPの合計サイズが大きすぎます');
  result.set(name,data);pos+=46+nlen+extra+comment;
 }
 if(pos!==end)throw new Error('ZIPの目次サイズが一致しません');
 return result;
}
