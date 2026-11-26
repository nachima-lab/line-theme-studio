// ZIP32の無圧縮形式。画像のCRCだけを小さな単位で読み、ZIP全体を展開しない。
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const MAX_FILES=65534,MAX_ENTRY=80*1024*1024,MAX_TOTAL=300*1024*1024;
const MAX_OVERHEAD=16*1024*1024,CHUNK=1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export async function crc32(blob){
 let crc=0xffffffff;
 for(let offset=0;offset<blob.size;offset+=CHUNK){
  const bytes=new Uint8Array(await blob.slice(offset,offset+CHUNK).arrayBuffer());
  for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);
 }
 return (crc^0xffffffff)>>>0;
}
function put16(v,o,n){v.setUint16(o,n,true);}
function put32(v,o,n){v.setUint32(o,n,true);}
function assertName(name){if(typeof name!=='string'||!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||name.includes('\0'))throw new Error('ZIP内のファイル名が不正です');}

export async function writeZip(entries){
 if(entries.length>MAX_FILES)throw new Error('ファイル数が多すぎます');
 const locals=[],centrals=[];let offset=0,total=0;
 for(const {name,data} of entries){
  assertName(name);
  const nameBytes=enc.encode(name),blob=data instanceof Blob?data:new Blob([data]);
  if(blob.size>MAX_ENTRY||nameBytes.length>65535)throw new Error('ファイルが大きすぎます');
  total+=blob.size;
  if(total>MAX_TOTAL)throw new Error('バックアップの合計サイズが大きすぎます');
  const crc=await crc32(blob),local=new Uint8Array(30+nameBytes.length),lv=new DataView(local.buffer);
  put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x800);
  put32(lv,14,crc);put32(lv,18,blob.size);put32(lv,22,blob.size);put16(lv,26,nameBytes.length);local.set(nameBytes,30);
  const central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);
  put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x800);
  put32(cv,16,crc);put32(cv,20,blob.size);put32(cv,24,blob.size);put16(cv,28,nameBytes.length);put32(cv,42,offset);central.set(nameBytes,46);
  locals.push(local,blob);centrals.push(central);offset+=local.length+blob.size;
 }
 const cdSize=centrals.reduce((sum,x)=>sum+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
 if(offset-total+cdSize+end.length>MAX_OVERHEAD)throw new Error('ZIPの目次が大きすぎます');
 put32(ev,0,0x06054b50);put16(ev,8,entries.length);put16(ev,10,entries.length);put32(ev,12,cdSize);put32(ev,16,offset);
 return new Blob([...locals,...centrals,end],{type:'application/zip'});
}

export async function readZip(file){
 if(file.size>MAX_TOTAL+MAX_OVERHEAD)throw new Error('ZIPが大きすぎます');
 const tailStart=Math.max(0,file.size-65557);
 const tail=new DataView(await file.slice(tailStart).arrayBuffer());
 let end=-1;
 for(let i=tail.byteLength-22;i>=0;i--){
  if(tail.getUint32(i,true)===0x06054b50&&i+22+tail.getUint16(i+20,true)===tail.byteLength){end=i;break;}
 }
 if(end<0)throw new Error('ZIPの終端が見つかりません');
 const count=tail.getUint16(end+10,true),size=tail.getUint32(end+12,true),start=tail.getUint32(end+16,true);
 if(count>MAX_FILES||tail.getUint16(end+4,true)||tail.getUint16(end+6,true)||
    tail.getUint16(end+8,true)!==count||size>MAX_OVERHEAD||start+size!==tailStart+end){
  throw new Error('ZIPの構造が不正です');
 }
 const directory=await file.slice(start,start+size).arrayBuffer(),bytes=new Uint8Array(directory),view=new DataView(directory);
 const u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);
 const result=new Map();let pos=0,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>size||u32(pos)!==0x02014b50)throw new Error('ZIPの目次が不正です');
  const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16),packed=u32(pos+20),raw=u32(pos+24);
  const nlen=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),localOffset=u32(pos+42);
  const next=pos+46+nlen+extra+comment;
  if(flags!==0x800||method!==0||packed!==raw||raw>MAX_ENTRY||next>size)throw new Error('非対応のZIP形式です');
  const name=dec.decode(bytes.subarray(pos+46,pos+46+nlen));assertName(name);
  if(result.has(name))throw new Error('重複したファイルがあります');
  if(localOffset+30>start)throw new Error('ZIPのファイル位置が不正です');
  const header=new DataView(await file.slice(localOffset,localOffset+30).arrayBuffer());
  if(header.getUint32(0,true)!==0x04034b50||header.getUint16(6,true)!==flags||header.getUint16(8,true)!==method
     ||header.getUint32(14,true)!==crc||header.getUint32(18,true)!==packed||header.getUint32(22,true)!==raw){
   throw new Error('ZIPのファイル構造が不正です');
  }
  const localNameLength=header.getUint16(26,true),localExtra=header.getUint16(28,true);
  const dataStart=localOffset+30+localNameLength+localExtra;
  if(localNameLength!==nlen||dataStart+raw>start)throw new Error('ZIPのファイル位置が不正です');
  const localName=dec.decode(await file.slice(localOffset+30,localOffset+30+nlen).arrayBuffer());
  if(localName!==name)throw new Error('ZIPのファイル名が一致しません');
  total+=raw;if(total>MAX_TOTAL)throw new Error('ZIPの合計サイズが大きすぎます');
  const data=file.slice(dataStart,dataStart+raw);
  if(await crc32(data)!==crc)throw new Error('ZIP内のデータが破損しています');
  result.set(name,data);pos=next;
 }
 if(pos!==size)throw new Error('ZIPの目次サイズが一致しません');
 return result;
}
