import {color} from './skins.js';
const el={header:document.getElementById('talk-header'),other:document.getElementById('other-bubble'),own:document.getElementById('own-bubble'),name:document.getElementById('selected-name'),area:document.getElementById('talk-area')};
// ヘッダーの文字色はJSONにないため、背景色から読みやすい白／黒を計算する。
function readableHeaderText(hex){
 const match=/^#([0-9a-f]{6})$/i.exec(hex||'');
 if(!match)return '#222222';
 const rgb=[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)/255);
 const luminance=rgb.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
 // WCAGコントラスト比が高い方を採用
 return (1.05/(luminance+0.05))>=((luminance+0.05)/0.05)?'#FFFFFF':'#222222';
}
export function renderPreview(skin){
 const header=color(skin,'header');
 el.header.style.backgroundColor=header; // tileSurfaceではなくheader
 el.header.style.color=readableHeaderText(header);
 el.other.style.backgroundColor=color(skin,'otherBubble');
 el.other.style.color=color(skin,'textOnOtherBubble');
 el.own.style.backgroundColor=color(skin,'ownBubble');
 el.own.style.color=color(skin,'textOnOwnBubble');
 el.name.textContent=skin.displayName;
}
export function renderBackground(url){el.area.style.backgroundImage=url?'url("'+url+'")':'none';}
