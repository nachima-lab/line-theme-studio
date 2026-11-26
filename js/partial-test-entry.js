// この検証用コピーでは、通常版の IndexedDB を開かない。
const testOrigin='https://raw.githack.com';
if(location.origin===testOrigin){
 await import('./app.js');
}else{
 const heading=document.createElement('h1');
 heading.textContent='検証専用ホストで開いてください';
 document.body.replaceChildren(heading);
}
