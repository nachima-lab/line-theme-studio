import {TEMPLATES,templateText,templateValues} from './production-data.js';

export function templateForSlot(id){
 if(id==='characterSheet')return 'character';
 if(id==='mainImage')return 'main';
 if(id==='talkBackground')return 'talk';
 if(id==='menuBackground')return 'menu';
 if(id.startsWith('menu-'))return 'icon';
 if(id.startsWith('passcode'))return 'passcode';
 if(id.startsWith('profile'))return 'profile';
 throw new Error('画像枠の種類が見つかりません。');
}

const quoteMotifs=values=>values?.join('、');
export const PART_LABELS={
 composition:'構図',placement:'配置',expression:'表情',stateNotes:'OFF／ONの違い・指定',
 motifs:'この枠で使うモチーフ',characterIds:'この枠に登場するキャラクター'
};

export function hasPartDesign(part){
 return Object.entries(part??{}).some(([key,value])=>
  key==='characterIds'||(Array.isArray(value)?value.length>0:Boolean(value?.trim())));
}

export function imagePrompt(project,slot,{part=project.production.design?.parts[slot.id],useReference=false,revise=false}={}){
 const {production:p}=project;
 const type=templateForSlot(slot.id);
 const template=key=>TEMPLATES.find(([id])=>id===key);
 const [,typeLabel,initial]=template(type);
 const texts=[];
 const shown=new Set();
 // テンプレート内で先に展開した差し込み値は、定型の共通欄にも再掲しない。
 function expand(key,defaultText){
  const source=p.templates[key]??defaultText;
  const shared=templateValues(p);
  const replacements=new Set();
  const result=templateText({...p,templates:{...p.templates,[key]:source.replace(
   /\{(固定色|画風メモ|世界観メモ)\}/g,(token,label)=>{
    if(shown.has(label)||replacements.has(label))return '';
    if(shared[label]?.trim())replacements.add(label);
    return token;
   }
  )}},key,defaultText);
  replacements.forEach(label=>shown.add(label));
  return result.trim();
 }
 const common=expand('common',template('common')[2]);
 const typed=expand(type,initial);
 const configured=hasPartDesign(part);
 const revision=type!=='character'&&revise&&configured;
 const consultation=type!=='character'&&(revision||!configured);
 const target=slot.label+'（枠ID: '+slot.id+'）';
 texts.push(revision
  ?target+'の保存済み個別設計をもとに、変更したい項目だけを相談したいです。ほかの項目は維持し、まだ画像は生成しないでください。'
  :consultation
   ?target+'の個別設計を相談したいです。まだ画像は生成せず、構図・配置などの案を提案してください。'
   :slot.label+'の原画を作成してください。');
 const context=Object.entries(templateValues(p)).filter(([label,value])=>value.trim()&&!shown.has(label))
  .map(([label,value])=>label+'：'+value);
 const reference=Boolean(useReference&&p.characterSheet&&type!=='character'&&part?.characterIds?.length!==0);
 const all=p.design?.characters??[];
 const characters=part?.characterIds===undefined?all:all.filter(character=>part.characterIds.includes(character.id));
 if(reference)context.push('添付するキャラ表画像「'+p.characterSheet.name+'」を造形の参照にしてください。');
 if(characters.length)context.push('キャラクター：'+characters.map(character=>
  reference?character.name:character.name+'（'+character.description+'）').join('、'));
 const commonMotifs=p.design?.motifs??[];
 if(commonMotifs.length)context.push('共通モチーフ：'+quoteMotifs(commonMotifs));
 if(p.design?.notes?.trim())context.push('補足・禁止事項：'+p.design.notes);
 texts.push('【共通設計】\n作品：'+project.name+(context.length?'\n'+context.join('\n'):'')+(common?'\n'+common:''));
 texts.push('【型テンプレート：'+typeLabel+'】'+(typed?'\n'+typed:''));
 if(type!=='character'){
  if(!configured)texts.push('個別設計は未設定です。');
  else{
   const details=Object.entries(PART_LABELS).flatMap(([key,label])=>{
    if(key==='characterIds'){
     if(part.characterIds?.length===0)return ['この枠にキャラクターは登場させない。'];
     if(revision&&part.characterIds){
      return [label+'：'+characters.map(character=>character.name+'（'+character.id+'）').join('、')];
     }
     return [];
    }
    const value=key==='motifs'
     ?quoteMotifs(revision?part.motifs:part.motifs?.filter(motif=>!commonMotifs.includes(motif)))
     :part[key];
    return value?.trim()?[label+'：'+value]:[];
   });
   if(details.length)texts.push('【個別設計：'+slot.label+'】\n'+details.join('\n'));
  }
 }
 if(consultation){
  const examples={composition:'構図',characterIds:all.slice(0,1).map(character=>character.id),motifs:['モチーフ'],
   placement:'配置',expression:'表情',stateNotes:'OFF／ONの違い'};
  const format=JSON.stringify({sheetVersion:1,parts:{[slot.id]:examples}});
  texts.push('相談がまとまり、私が了承したら、次の形式のJSONだけを出力してください。枠IDは変更せず、未決定の項目は省略できます。'
   +(revision?' 変更が決まった項目だけを出力してください。':'')
   +' characterIds には既存のIDだけを使い、登場させない場合は空配列にしてください。'
   +(revision?'':' 共通設計に合わせる場合は characterIds を省略してください。')
   +(all.length?' 使用できるID：'+all.map(character=>character.id+'（'+character.name+'）').join('、'):'')
   +'\n'+format);
 }
 return {text:texts.join('\n\n'),reference,consultation};
}
