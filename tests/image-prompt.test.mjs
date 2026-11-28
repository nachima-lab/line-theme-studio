import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imagePrompt,templateForSlot} from '../js/image-prompt.js';
import {IMAGE_SLOTS,createProject} from '../js/store.js';
import {TEMPLATES,templateText} from '../js/production-data.js';

test('25枠・キャラ表作成と共通の8テンプレートを解決する',()=>{
 const keys=new Set(IMAGE_SLOTS.map(slot=>templateForSlot(slot.id)));
 keys.add(templateForSlot('characterSheet'));
 keys.add('common');
 assert.deepEqual([...keys].sort(),TEMPLATES.map(([key])=>key).sort());
 assert.equal(templateForSlot('menu-talk-off'),'icon');
 assert.equal(templateForSlot('menu-talk-on'),'icon');
 assert.equal(templateForSlot('menuBackground'),'menu');
});

test('共通、型、個別の順で合体し、差し込みとモチーフの重複を避ける',()=>{
 const project=createProject('夜空');
 Object.assign(project.production,{style:'水彩',world:'静寂',colors:['#123456'],
  templates:{common:'共通の指示 {画風メモ}',main:'型の指示 {世界観メモ} {固定色} {画風メモ}'},
  design:{characters:[],motifs:['月'],parts:{mainImage:{composition:'中央',motifs:['月','星']}}}});
 const result=imagePrompt(project,IMAGE_SLOTS[0]);
 assert.equal(result.consultation,false);
 assert.match(result.text,/【共通設計】[\s\S]+【型テンプレート：メイン】[\s\S]+【個別設計：メイン画像】/);
 for(const value of ['水彩','静寂','#123456','月','星'])assert.equal(result.text.split(value).length,2);
 assert.match(result.text,/構図：中央/);
 assert.match(result.text,/型の指示/);
 assert.equal(templateText(project.production,'main',''),'型の指示 静寂 #123456 水彩');
 assert.equal(imagePrompt(project,IMAGE_SLOTS[1]).consultation,true);
 assert.match(imagePrompt(project,IMAGE_SLOTS[1]).text,/まだ画像は生成せず/);
});

test('キャラ表の使用、文章の造形説明、キャラクターなしを切り替える',()=>{
 const project=createProject('夜空');
 const target=IMAGE_SLOTS[0];
 project.production.design={characters:[{id:'bird',name:'鳥',description:'青い帽子'}],parts:{}};
 assert.match(imagePrompt(project,target,{useReference:true}).text,/青い帽子/);
 project.production.characterSheet={name:'reference.png'};
 const attached=imagePrompt(project,target,{useReference:true});
 assert.equal(attached.reference,true);
 assert.match(attached.text,/添付するキャラ表画像「reference.png」/);
 assert.doesNotMatch(attached.text,/青い帽子/);
 assert.match(imagePrompt(project,target).text,/青い帽子/);
 const empty=imagePrompt(project,target,{part:{characterIds:[]},useReference:true});
 assert.equal(empty.reference,false);
 assert.match(empty.text,/キャラクターは登場させない/);
 assert.doesNotMatch(empty.text,/青い帽子/);
 project.production.design={characters:[],parts:{}};
 assert.doesNotMatch(imagePrompt(project,target).text,/キャラクター：|キャラ表画像/);
 const creation=imagePrompt(project,{id:'characterSheet',label:'キャラ表'},{useReference:true});
 assert.equal(creation.reference,false);
 assert.match(creation.text,/型テンプレート：キャラ表作成/);
});
