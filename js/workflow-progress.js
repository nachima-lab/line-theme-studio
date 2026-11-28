import {nextImage} from './production-list.js';
import {SALES_FIELDS,SALES_LANGUAGES,SALES_PRICES,salesTextStatus} from './sales.js';
import {IMAGE_SLOTS} from './store.js';

export function setupWorkflowProgress(){
 const root=document.getElementById('workflow-progress');
 const fields=['progress-sheet','progress-images','progress-sales','progress-zip','workflow-next']
  .map(id=>document.getElementById(id));
 return (project,zipReady)=>{
  root.hidden=!project;
  if(!project)return;
  const sheet=Boolean(project.production.characterSheet);
  const imageCount=IMAGE_SLOTS.filter(slot=>project.images[slot.id]).length;
  const sales=project.sales;
  const languages=Object.keys(SALES_LANGUAGES).filter(language=>
   Object.keys(SALES_FIELDS).every(key=>sales?.texts[language]?.[key]?.trim()));
  const englishReady=Object.entries(SALES_FIELDS).every(([key,field])=>
   !salesTextStatus(sales?.texts.en[key]??'',field.limit,true).warnings.length);
  const price=SALES_PRICES.find(item=>item.coins===sales?.coins);
  const commonReady=/^[A-Za-z0-9]{1,50}$/.test(sales?.copyright??'')
   && Boolean(price) && sales.includesJapan!==null && (!price.outsideJapan||!sales.includesJapan);
  const candidate=nextImage(project);
  const prepared=imageCount||project.production.design||project.production.world||project.production.style||project.production.colors.length;
  const next=!prepared?'準備で企画を相談するか、制作で好きな原画から始めましょう。'
   :candidate?'制作で'+candidate.label+'を'+(candidate.redo?'作り直しましょう。':'作りましょう。')
   :!englishReady||!commonReady?'申請で必須の販売情報を確認しましょう。'
   :!zipReady?'確認で仕上がりを見て、申請で提出用ZIPを生成しましょう。'
   :'申請で提出用ZIPをダウンロードできます。';
  const values=[
   'キャラ表 '+(sheet?'登録済み':'任意・未登録'),
   '画像を登録済み '+imageCount+'/'+IMAGE_SLOTS.length,
   '販売情報 '+languages.length+'/4言語入力・英語必須 '+(englishReady?'入力済み':'要確認'),
   zipReady?'提出用ZIP 生成済み':'提出用ZIP 未生成',
   '次にやること　'+next
  ];
  fields.forEach((element,index)=>{
   if(element.textContent!==values[index])element.textContent=values[index];
  });
 };
}
