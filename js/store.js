import {emptySales,readSales} from './sales.js';
import {createSplitStorage} from './split-storage.js';
import {readAdjustments} from './export-spec.js';
import {emptyProduction,HEX_COLOR,TEMPLATES} from './production-data.js';

// IDは保存済みの画像を参照するため、表示名とは独立させる。
export const IMAGE_ACCEPT='image/png,image/jpeg,image/webp,image/heic,image/heif';
const menuFeatures=[
 ['talk','トーク'],['call','通話'],['news','ニュース'],['wallet','ウォレット'],
 ['home','ホーム'],['today','TODAY'],['voom','VOOM'],['shopping','ショッピング'],['apps','アプリ']
];
export const IMAGE_SLOTS=[
 {id:'mainImage',label:'メイン画像'},
 {id:'talkBackground',label:'トーク背景'},
 {id:'menuBackground',label:'メニュー背景'},
 {id:'passcodeOff',label:'パスコード OFF'},
 {id:'passcodeOn',label:'パスコード ON'},
 {id:'profilePersonal',label:'プロフィール 個人'},
 {id:'profileGroup',label:'プロフィール グループ'},
 ...menuFeatures.flatMap(([id,label])=>['Off','On'].map(state=>({
  id:'menu-'+id+'-'+state.toLowerCase(),label:'メニューアイコン '+label+' '+state.toUpperCase()
 })))
];
export const LEGACY_SLOT_IDS=['talkBackground','mainImage','menuIcon'];
export const COLLECTION_VERSION=2;

export function createProject(name,{sales=true}={}){
 return {id:crypto.randomUUID(),name,skinId:'beige_01',images:{},production:emptyProduction(),
  ...(sales?{sales:{...emptySales(),coins:150,includesJapan:true}}:{})};
}

export function defineCollection(projects,activeId){
 return {version:COLLECTION_VERSION,projects,activeId};
}

function validateImage(image){
 return image&&typeof image==='object'&&typeof image.name==='string'
  &&image.blob instanceof Blob&&image.blob.type.startsWith('image/')
  &&(image.preview===undefined||image.preview instanceof Blob&&image.preview.type.startsWith('image/'));
}

function checkedImages(images,ids){
 if(!images||typeof images!=='object'||Array.isArray(images))throw new Error('画像データの形式が正しくありません');
 const entries=Object.entries(images);
 if(entries.some(([id,item])=>!ids.includes(id)||(item!==null&&!validateImage(item)))){
  throw new Error('画像データが正しくありません');
 }
 return Object.fromEntries(entries.filter(([,item])=>item!==null));
}

function validateProduction(value,images,slots){
 if(value===undefined)return emptyProduction();
 const {colors,style,world,templates,characterSheet,undo}=value??{};
 if(!Array.isArray(colors)||colors.length>8||colors.some(color=>typeof color!=='string'||!HEX_COLOR.test(color))
    ||typeof style!=='string'||typeof world!=='string'
    ||!templates||typeof templates!=='object'||Array.isArray(templates)
    ||(characterSheet!==null&&!validateImage(characterSheet))){
  throw new Error('制作メモの形式が正しくありません');
 }
 const keys=TEMPLATES.map(([key])=>key);
 for(const [key,text] of Object.entries(templates)){
  if(!keys.includes(key)||typeof text!=='string')throw new Error('指示文の形式が正しくありません');
 }
 return {colors:colors.map(color=>color.toUpperCase()),style,world,templates,characterSheet,
  undo:checkedImages(undo,slots.filter(slot=>images[slot]))};
}

export function validateCollection(record,skinIds){
 if(record?.version!==COLLECTION_VERSION||!Array.isArray(record.projects))throw new Error('作品一覧の形式が正しくありません');
 const ids=new Set();
 const projects=record.projects.map(project=>{
  if(typeof project?.id!=='string'||!project.id||ids.has(project.id)
     ||typeof project.name!=='string'||!project.name.trim()||!skinIds.includes(project.skinId)){
   throw new Error('作品データが正しくありません');
  }
  ids.add(project.id);
  const slots=IMAGE_SLOTS.map(slot=>slot.id);
  const images=checkedImages(project.images,slots);
  return {...project,...(project.sales===undefined?{}:{sales:readSales(project.sales)}),exportSettings:readAdjustments(project.exportSettings),images,
   production:validateProduction(project.production,images,slots)};
 });
 if(projects.length?!ids.has(record.activeId):record.activeId!==null){
  throw new Error('選択中の作品が見つかりません');
 }
 return defineCollection(projects,record.activeId);
}

export function convertLegacy(project,skinIds){
 if(project?.version!==1||!skinIds.includes(project.skinId))throw new Error('旧作品データの形式が正しくありません');
 const images=checkedImages(project.images,LEGACY_SLOT_IDS);
 // 旧試作の1枠には機能・状態がなかったため、トーク OFF に引き継ぐ。
 if(images.menuIcon){
  images['menu-talk-off']=images.menuIcon;
  delete images.menuIcon;
 }
 return {...createProject('引き継いだ作品',{sales:false}),skinId:project.skinId,images};
}

function dataUrlToBlob(value){
 if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp|heic|heif);base64,[A-Za-z0-9+/=]+$/.test(value)){
  throw new Error('画像のバックアップ形式が不正です');
 }
 const [head,encoded]=value.split(',');
 return new Blob([Uint8Array.from(atob(encoded),char=>char.charCodeAt(0))],{type:head.slice(5,-7)});
}

export function parseLegacyJson(text,skinIds){
 let raw;
 try{raw=JSON.parse(text);}catch{throw new Error('JSONファイルを読み取れません');}
 if(raw?.format!=='line-theme-studio-backup'||raw.version!==1)throw new Error('対応していないバックアップ形式です');
 const input=raw.project;
 if(!input?.images||typeof input.images!=='object'||Array.isArray(input.images))throw new Error('作品データが不正です');
 const entries=Object.entries(input.images).map(([id,item])=>[
  id,item===null?null:{name:item.name,blob:dataUrlToBlob(item.dataUrl)}
 ]);
 return convertLegacy({...input,version:1,images:Object.fromEntries(entries)},skinIds);
}

export const {loadCollection,saveCollection,readSavedProjectsForDiagnosis}=createSplitStorage({
 createProject,defineCollection,validateCollection,convertLegacy,
 slotLabels:new Map(IMAGE_SLOTS.map(({id,label})=>[id,label]))
});
