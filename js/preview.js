import {color} from './skins.js';
const el={header:document.getElementById('talk-header'),other:document.getElementById('other-bubble'),own:document.getElementById('own-bubble'),name:document.getElementById('selected-name'),area:document.getElementById('talk-area')};
export function renderPreview(skin){
 el.header.style.backgroundColor=color(skin,'header'); // tileSurfaceを使わない
 el.other.style.backgroundColor=color(skin,'otherBubble');
 el.other.style.color=color(skin,'textOnOtherBubble');
 el.own.style.backgroundColor=color(skin,'ownBubble');
 el.own.style.color=color(skin,'textOnOwnBubble');
 el.name.textContent=skin.displayName;
}
export function renderBackground(url){el.area.style.backgroundImage=url?'url("'+url+'")':'none';}
