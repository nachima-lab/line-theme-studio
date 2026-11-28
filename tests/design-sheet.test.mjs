import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDesignSheet,designDiff,applyDesignDiff,validateDesign,serializeDesignSheet,parsePartSheet} from '../js/design-sheet.js';
import {IMAGE_SLOTS,createProject} from '../js/store.js';

const ids=IMAGE_SLOTS.map(slot=>slot.id);
const sample={sheetVersion:1,workName:'月夜',style:'水彩',colors:['#1122aa'],characters:[
 {id:'bird',name:'鳥',description:'紺の帽子'}
],parts:{mainImage:{composition:'中央',characterIds:['bird']}}};
const raw=JSON.stringify(sample);
const project=createProject('既存作品');
project.production.style='手入力の画風';

test('JSONとコードブロックを受理し、未知項目・不正形式を拒否する',()=>{
 assert.equal(parseDesignSheet('\x60\x60\x60json\n'+raw+'\n\x60\x60\x60',ids).colors[0],'#1122AA');
 for(const [input,error] of [
  ['{',/JSON/],[JSON.stringify({...sample,sheetVersion:2}),/sheetVersion/],
  [JSON.stringify({...sample,images:{}}),/images/],
  [JSON.stringify({...sample,colors:Array(9).fill('#000000')}),/colors/],
  [JSON.stringify({...sample,colors:['red']}),/colors/],
  [JSON.stringify({...sample,parts:{constructor:{}}}),/parts.constructor/],
  [JSON.stringify({...sample,characters:[...sample.characters,...sample.characters]}),/IDが重複/],
  [' '.repeat(65537),/64 KiB/]
 ])assert.throws(()=>parseDesignSheet(input,ids),error);
});

test('選んだ差分だけを反映し、既存画像と原文を保持する',()=>{
 const rows=designDiff(project,parseDesignSheet(raw,ids),IMAGE_SLOTS);
 assert.equal(rows.find(row=>row.key==='style').suggested,false);
 assert.equal(rows.find(row=>row.key==='parts.mainImage').suggested,true);
 const selected=new Set(rows.filter(row=>row.suggested).map(row=>row.key));
 const next=applyDesignDiff(project,rows,selected,raw,ids);
 assert.equal(next.name,project.name);
 assert.equal(next.production.style,project.production.style);
 assert.equal(next.production.design.parts.mainImage.composition,'中央');
 assert.equal(next.production.design.lastImport.raw,raw);
 assert.equal(next.images,project.images);
 assert.equal(next.production.characterSheet,project.production.characterSheet);
 assert.equal(next.production.undo,project.production.undo);
 const second='{"sheetVersion":1,"notes":"文字を入れない"}';
 const patched=applyDesignDiff(next,designDiff(next,parseDesignSheet(second,ids),IMAGE_SLOTS),new Set(['notes']),second,ids);
 assert.deepEqual(patched.production.design.parts,next.production.design.parts);
 assert.equal(patched.production.design.lastImport.raw,second);
 assert.throws(()=>validateDesign({...next.production.design,characters:[]},ids),/定義がありません/);
 assert.deepEqual(validateDesign({characters:[]},ids).characters,[]);
});

test('保存済みの編集内容から取り込み互換のJSONを作る',()=>{
 const original=parseDesignSheet(raw,ids);
 const rows=designDiff(project,original,IMAGE_SLOTS);
 const saved=applyDesignDiff(project,rows,new Set(rows.map(row=>row.key)),raw,ids);
 saved.name='保存後の作品名';
 saved.production.style='保存後の画風';
 saved.production.design.notes='保存後の補足';
 saved.production.design.parts.mainImage.composition='保存後の構図';
 saved.production.design.redo=['mainImage'];
 const json=serializeDesignSheet(saved,ids);
 assert.deepEqual(parseDesignSheet(json,ids),{
  workName:'保存後の作品名',worldview:'',style:'保存後の画風',colors:['#1122AA'],
  characters:original.characters,motifs:[],notes:'保存後の補足',
  parts:{mainImage:{composition:'保存後の構図',characterIds:['bird']}}
 });
 assert.deepEqual(designDiff(saved,parseDesignSheet(json,ids),IMAGE_SLOTS),[]);
 assert.doesNotMatch(json,/lastImport|redo|characterSheet/);
 assert.equal(JSON.parse(serializeDesignSheet(createProject('設計なし'),ids)).sheetVersion,1);
 assert.throws(()=>serializeDesignSheet({...saved,name:'長'.repeat(121)},ids),/workName/);
});

test('1枠取り込みは開いている枠だけを許可する',()=>{
 const json=(parts,extra={})=>JSON.stringify({sheetVersion:1,parts,...extra});
 assert.deepEqual(parsePartSheet(json({mainImage:{characterIds:[],expression:'笑顔'}}),'mainImage',ids),
  {characterIds:[],expression:'笑顔'});
 assert.throws(()=>parsePartSheet(json({talkBackground:{composition:'中央'}}),'mainImage',ids),/一致しません/);
 assert.throws(()=>parsePartSheet(json({mainImage:{composition:'中央'},talkBackground:{composition:'中央'}}),'mainImage',ids),/1つだけ/);
 assert.throws(()=>parsePartSheet(json({mainImage:{composition:'中央'}},{worldview:'変更'}),'mainImage',ids),/parts だけ/);
});
