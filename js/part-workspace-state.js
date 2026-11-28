const scope=location.hostname.endsWith('.githack.com')?location.pathname.split('/').slice(1,3).join('/'):'';
const prefix='line-theme-studio:part-workspace:v1:'+scope+':';
const tabKey=prefix+'tab';
const memory=new Map();
let tab;
try{
 tab=sessionStorage.getItem(tabKey)??crypto.randomUUID();
 sessionStorage.setItem(tabKey,tab);
}catch{
 // Storage-blocked sessions keep drafts in memory until this page is closed.
 tab=null;
}

export function readPartState(key){
 if(memory.has(key))return memory.get(key);
 if(!tab)return null;
 try{return JSON.parse(localStorage.getItem(prefix+tab+':'+key));}
 catch{return null;}
}

export function writePartState(key,value){
 memory.set(key,value);
 if(!tab)return false;
 try{
  if(value===null)localStorage.removeItem(prefix+tab+':'+key);
  else localStorage.setItem(prefix+tab+':'+key,JSON.stringify(value));
  memory.delete(key);
  return true;
 }catch{return false;}
}

export const partDraftKey=(project,slot)=>'draft:'+JSON.stringify([project,slot]);
