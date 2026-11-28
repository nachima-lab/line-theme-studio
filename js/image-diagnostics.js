const PNG=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
const JPEG=[0xff,0xd8,0xff];
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
const errorName=error=>error?.name||'Error';

function detectFormat(bytes){
 if(PNG.every((byte,index)=>byte===bytes[index]))return 'PNG';
 if(JPEG.every((byte,index)=>byte===bytes[index]))return 'JPEG';
 return bytes.length?'判定対象外または署名不一致':'空';
}

async function decodeBytes(buffer,mime){
 let url;
 const image=new Image();
 try{
  url=URL.createObjectURL(new Blob([buffer],{type:mime}));
  image.src=url;
  await image.decode();
  return '成功（'+image.naturalWidth+' × '+image.naturalHeight+' px）';
 }catch(error){return '失敗（'+errorName(error)+'）';}
 finally{
  image.removeAttribute('src');
  if(url)URL.revokeObjectURL(url);
 }
}

export async function diagnoseImage(item){
 const blob=item?.blob,expected=item?.integrity;
 const result={
  name:item?.name??'—',
  declared:blob instanceof Blob?blob.size:'—',
  mime:blob instanceof Blob?(blob.type||'空欄'):'—',
  actual:'—',signature:'—',format:'—',read:'未実施',decode:'未実施',sha:'—',
  integrity:expected?.issue?'不一致（'+expected.issue+'）':expected?'未確認':'—'
 };
 if(!item){result.read='未登録';return result;}
 if(!(blob instanceof Blob)){result.read='失敗（MissingBlob）';return result;}

 let buffer;
 try{
  buffer=await blob.arrayBuffer();
  result.actual=buffer.byteLength;
  result.read='成功';
 }catch(error){
  // arrayBuffer() が失敗した場合は、途中までのバイト数を取得できない。
  result.read='失敗（'+errorName(error)+'）';
  return result;
 }
 const bytes=new Uint8Array(buffer,0,Math.min(buffer.byteLength,12));
 result.signature=hex(bytes)||'空';
 result.format=detectFormat(bytes);
 try{
  result.sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)));
 }catch(error){result.sha='失敗（'+errorName(error)+'）';}
 if(expected&&!expected.issue){
  if(expected.size!==result.actual)result.integrity='不一致（画像のサイズが一致しません）';
  else if(expected.sha256==null)result.integrity='サイズ一致（SHA-256未記録）';
  else if(!/^[0-9a-f]{64}$/.test(result.sha))result.integrity='未確認（SHA-256を計算できません）';
  else result.integrity=result.sha===expected.sha256?'サイズ・SHA-256一致':'不一致（画像のSHA-256が一致しません）';
 }
 result.decode=await decodeBytes(buffer,blob.type);
 return result;
}
