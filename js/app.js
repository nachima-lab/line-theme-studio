import {loadSkins,groupedSkins,color} from './skins.js';
import {renderPreview,renderBackground} from './preview.js';
import {createDraft,IMAGE_SLOTS} from './store.js';
const draft=createDraft();let backgroundUrl=null;
const groupsEl=document.getElementById('skin-groups');
function tile(skin){
 const button=document.createElement('button');button.type='button';button.className='skin-tile';button.dataset.skinId=skin.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',skin.displayName+'を選択');
 const sample=document.createElement('div');sample.className='tile-sample';sample.style.backgroundColor=color(skin,'tileSurface');
 const strip=document.createElement('div');strip.className='tile-strip';strip.style.backgroundColor=color(skin,'header');
 for(const side of ['other','own']){const circle=document.createElement('span');circle.className='tile-circle';circle.textContent='T';circle.style.backgroundColor=color(skin,side==='other'?'otherBubble':'ownBubble');circle.style.color=color(skin,side==='other'?'textOnOtherBubble':'textOnOwnBubble');strip.append(circle);}
 sample.append(strip);const label=document.createElement('span');label.className='tile-name';label.textContent=skin.displayName;button.append(sample,label);
 button.addEventListener('click',()=>{draft.skinId=skin.id;renderPreview(skin);groupsEl.querySelectorAll('.skin-tile[aria-pressed="true"]').forEach(el=>el.setAttribute('aria-pressed','false'));button.setAttribute('aria-pressed','true');});return button;
}
async function init(){try{
 const skins=await loadSkins();document.getElementById('skin-count').textContent=skins.length+'種類';
 for(const {group,skins:items} of groupedSkins(skins)){const section=document.createElement('section');const h=document.createElement('h3');h.className='group-heading';h.textContent=group+' ('+items.length+')';const grid=document.createElement('div');grid.className='tiles';items.forEach(s=>grid.append(tile(s)));section.append(h,grid);groupsEl.append(section);}
 const initial=skins.find(s=>s.id===draft.skinId)||skins[0];groupsEl.querySelector('[data-skin-id="'+initial.id+'"]').click();
 }catch(error){const p=document.getElementById('load-error');p.hidden=false;p.textContent=error.message+'。ページを再読み込みしてください。';}}
const input=document.getElementById('background-input');
input.addEventListener('change',()=>{const file=input.files?.[0];if(!file)return;
 if(!/^image\/(png|jpeg|webp|heic|heif)$/.test(file.type)){alert('PNG・JPEG・WebP・HEIC画像を選んでください');input.value='';return;}
 const candidate=URL.createObjectURL(file);const img=new Image();
 img.onload=()=>{const old=backgroundUrl;backgroundUrl=candidate;renderBackground(backgroundUrl);if(old)URL.revokeObjectURL(old);document.getElementById('background-status').textContent='背景画像：'+file.name;document.getElementById('remove-background').hidden=false;};
 img.onerror=()=>{URL.revokeObjectURL(candidate);alert('画像を読み込めませんでした。PNGまたはJPEGをお試しください。');input.value='';};
 img.src=candidate;
});
document.getElementById('remove-background').addEventListener('click',()=>{if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);backgroundUrl=null;renderBackground(null);input.value='';document.getElementById('background-status').textContent='背景画像：未登録';document.getElementById('remove-background').hidden=true;});
init();
