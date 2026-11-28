import {HEX_COLOR} from './production-data.js';

const MAX_SHEET_BYTES=64*1024;
const own=Object.hasOwn;
const encoder=new TextEncoder();
const fields={
 workName:'作品名',worldview:'世界観',style:'画風',colors:'固定色',
 characters:'キャラクター',motifs:'モチーフ',notes:'補足・禁止事項'
};

function fail(path,message){throw new Error(path+'：'+message);}
function object(value,path,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(path,'項目を持つ形式で入力してください');
 if(allowed){
  for(const key of Object.keys(value))if(!allowed.includes(key))fail(path+'.'+key,'未対応の項目です');
 }
 return value;
}
function text(value,path,max=2000,required=false){
 if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(path,'有効な'+max+'文字以下の文面を入力してください');
 return value;
}
function array(value,path,max,read){
 if(!Array.isArray(value)||value.length>max)fail(path,max+'件以下のリストを入力してください');
 return value.map((item,index)=>read(item,path+'['+index+']'));
}
function id(value,path){
 if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(value))fail(path,'半角小文字・数字・記号（-、_）で指定してください');
 return value;
}
function characters(value,path){
 const seen=new Set();
 return array(value,path,16,(item,key)=>{
  object(item,key,['id','name','description']);
  const identifier=id(item.id,key+'.id');
  if(seen.has(identifier))fail(key+'.id','キャラクターIDが重複しています');
  seen.add(identifier);
  return {id:identifier,name:text(item.name,key+'.name',80,true),description:text(item.description,key+'.description',800,true)};
 });
}
const motifs=(value,path)=>array(value,path,24,(item,key)=>text(item,key,120,true));
export const PART_FIELDS=['composition','characterIds','motifs','placement','expression','stateNotes'];

function parts(value,path,slots){
 const spec=PART_FIELDS;
 return Object.fromEntries(Object.entries(object(value,path,slots)).map(([slot,item])=>{
  const key=path+'.'+slot;
  object(item,key,spec);
  return [slot,Object.fromEntries(spec.filter(field=>own(item,field)).map(field=>[
   field,field==='characterIds'?array(item[field],key+'.'+field,16,id)
    :field==='motifs'?motifs(item[field],key+'.'+field):text(item[field],key+'.'+field,1000)
  ]))];
 }));
}

export function parseDesignSheet(raw,slots){
 if(typeof raw!=='string'||raw.length>MAX_SHEET_BYTES||encoder.encode(raw).length>MAX_SHEET_BYTES)fail('設計シート','64 KiB以内で貼り付けてください');
 const source=raw.trim();
 const fenced=source.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
 let data;
 try{data=JSON.parse(fenced?.[1]??source);}
 catch{fail('設計シート','JSONとして読み取れません');}
 object(data,'設計シート',['sheetVersion',...Object.keys(fields),'parts']);
 if(data.sheetVersion!==1)fail('sheetVersion','対応する値は1です');
 const readers={
  workName:value=>text(value,'workName',120,true),
  worldview:value=>text(value,'worldview'),
  style:value=>text(value,'style'),
  colors:value=>array(value,'colors',8,(color,key)=>{
   if(typeof color!=='string'||!HEX_COLOR.test(color))fail(key,'#RRGGBB形式で入力してください');
   return color.toUpperCase();
  }),
  characters:value=>characters(value,'characters'),
  motifs:value=>motifs(value,'motifs'),
  notes:value=>text(value,'notes',4000),
  parts:value=>parts(value,'parts',slots)
 };
 return Object.fromEntries(Object.entries(readers).filter(([key])=>own(data,key)).map(([key,read])=>[key,read(data[key])]));
}

export function serializeDesignSheet(project,slots){
 const {world,style,colors,design}=project.production;
 const sheet={
  sheetVersion:1,workName:project.name,worldview:world,style,colors,
  characters:design?.characters??[],motifs:design?.motifs??[],notes:design?.notes??'',
  parts:design?.parts??{}
 };
 const indented=JSON.stringify(sheet,null,2);
 const json=encoder.encode(indented).length<=MAX_SHEET_BYTES?indented:JSON.stringify(sheet);
 parseDesignSheet(json,slots);
 return json;
}

export function validateDesign(value,slots){
 object(value,'制作設計',['characters','motifs','notes','parts','redo','lastImport']);
 const result={
  characters:characters(own(value,'characters')?value.characters:[],'characters'),
  motifs:motifs(own(value,'motifs')?value.motifs:[],'motifs'),
  notes:text(own(value,'notes')?value.notes:'','notes',4000),
  parts:parts(own(value,'parts')?value.parts:{},'parts',slots),
  redo:[...new Set(array(own(value,'redo')?value.redo:[],'redo',slots.length,(slot,path)=>{
   if(!slots.includes(slot))fail(path,'未対応の画像枠です');
   return slot;
  }))]
 };
 const ids=new Set(result.characters.map(character=>character.id));
 for(const [slot,part] of Object.entries(result.parts)){
  for(const identifier of part.characterIds??[]){
   if(!ids.has(identifier))fail('parts.'+slot,'キャラクター「'+identifier+'」の定義がありません');
  }
 }
 if(own(value,'lastImport')){
  const {raw,importedAt}=object(value.lastImport,'lastImport',['raw','importedAt']);
  parseDesignSheet(raw,slots);
  if(typeof importedAt!=='string'||importedAt.length!==24||Number.isNaN(Date.parse(importedAt))){
   fail('lastImport.importedAt','取り込み日時が正しくありません');
  }
  result.lastImport={raw,importedAt};
 }
 return result;
}

export function designDiff(project,sheet,slots){
 const {world,style,colors,design}=project.production;
 const current={workName:project.name,worldview:world,style,colors,
  characters:design?.characters??[],motifs:design?.motifs??[],notes:design?.notes??''};
 const rows=[];
 function add(key,label,before,after){
  if(JSON.stringify(before)===JSON.stringify(after))return;
  const empty=before===null||before===''||(Array.isArray(before)&&!before.length);
  rows.push({key,label,before,after,suggested:empty});
 }
 for(const [key,label] of Object.entries(fields))if(own(sheet,key))add(key,label,current[key],sheet[key]);
 for(const {id,label} of slots){
  if(own(sheet.parts??{},id))add('parts.'+id,label,design?.parts[id]??null,sheet.parts[id]);
 }
 return rows;
}

export function applyDesignDiff(project,rows,selected,raw,slots){
 const production={...project.production};
 const design={...production.design,parts:{...production.design?.parts}};
 let name=project.name;
 for(const {key,after} of rows){
  if(!selected.has(key))continue;
  if(key==='workName')name=after;
  else if(key==='worldview')production.world=after;
  else if(['style','colors'].includes(key))production[key]=after;
  else if(key.startsWith('parts.'))design.parts[key.slice(6)]=after;
  else design[key]=after;
 }
 design.lastImport={raw,importedAt:new Date().toISOString()};
 return {...project,name,production:{...production,design:validateDesign(design,slots)}};
}
