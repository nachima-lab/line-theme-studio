import {emptySales,SALES_FIELDS,SALES_LANGUAGES,SALES_PRICES,salesTextStatus} from './sales.js';

export function setupSalesPanel({save}){
 const section=document.getElementById('sales-section');
 const find=id=>section.querySelector('#sales-'+id);
 const language=find('language'),fields=find('fields'),copyright=find('copyright');
 const coins=find('coins'),japan=find('japan'),status=find('status'),fallback=find('fallback');
 let project,sales=emptySales();

 for(const [key,label] of Object.entries(SALES_LANGUAGES))language.add(new Option(label,key));

 async function copy(value){
  fallback.hidden=true;
  try{
   await navigator.clipboard.writeText(value);
   status.textContent='コピーしました。';
  }catch{
   fallback.value=value;
   fallback.hidden=false;
   fallback.focus();
   fallback.select();
   status.textContent='選択した文面をコピーしてください。';
  }
 }

 function update(changes){save({...sales,...changes});}

 const editors=Object.entries(SALES_FIELDS).map(([key,{label,limit}])=>{
  const group=document.createElement('div');
  group.className='sales-field';
  const caption=document.createElement('label');
  caption.htmlFor='sales-'+key;caption.textContent=label;
  const input=document.createElement(key==='description'?'textarea':'input');
  input.id=caption.htmlFor;
  if(key==='description')input.rows=3;
  input.setAttribute('aria-describedby','sales-'+key+'-help');
  const help=document.createElement('p');
  help.id='sales-'+key+'-help';
  const button=document.createElement('button');
  button.type='button';button.textContent=label+'をコピー';
  button.addEventListener('click',()=>copy(input.value));
  input.addEventListener('input',()=>{
   const lang=language.value;
   update({texts:{...sales.texts,[lang]:{...sales.texts[lang],[key]:input.value}}});
  });
  group.append(caption,input,button,help);
  fields.append(group);
  return {key,limit,input,help,button};
 });

 function render(){
  const lang=language.value;
  for(const {key,limit,input,help,button} of editors){
   const value=sales.texts[lang][key];
   if(input.value!==value)input.value=value;
   const result=salesTextStatus(value,limit,lang==='en');
   button.disabled=!value.trim();
   help.textContent='参考 '+result.count+' / '+limit+'文字'+(result.warnings.length?' · '+result.warnings.join('、'):'');
  }
  const english=Object.entries(SALES_FIELDS).filter(([key])=>!sales.texts.en[key].trim()).map(([,field])=>field.label);
  find('required').textContent=english.length?'英語の必須項目が未入力：'+english.join('、'):'';
  if(copyright.value!==sales.copyright)copyright.value=sales.copyright;
  const copyIssues=[];
  if(!sales.copyright.trim())copyIssues.push('未入力');
  if(!/^[A-Za-z0-9]*$/.test(sales.copyright))copyIssues.push('英数字のみ使用できます');
  const count=Array.from(sales.copyright).length;
  if(count>50)copyIssues.push('上限超過');
  find('copyright-help').textContent=count+' / 50文字'+(copyIssues.length?' · '+copyIssues.join('、'):'');
  find('copyright-copy').disabled=!sales.copyright.trim();
  coins.value=sales.coins??'';
  japan.value=sales.includesJapan===null?'':String(sales.includesJapan);
  const selected=SALES_PRICES.find(price=>price.coins===sales.coins);
  find('price-help').textContent=!selected?'販売価格が未設定です。'
   :selected.outsideJapan&&sales.includesJapan!==false?'この価格は通常、日本を販売対象に含めない場合のみ設定できます。'
   :selected.coins+'コイン（円表示の目安 '+selected.yen+'円〜）';
 }

 for(const price of SALES_PRICES){
  coins.add(new Option(price.coins+'コイン'+(price.outsideJapan?'（通常は日本対象外）':''),price.coins));
 }
 language.value='ja';
 language.addEventListener('change',()=>{status.textContent='';fallback.hidden=true;render();});
 copyright.addEventListener('input',()=>update({copyright:copyright.value}));
 find('copyright-copy').addEventListener('click',()=>copy(copyright.value));
 coins.addEventListener('change',()=>update({coins:coins.value?Number(coins.value):null}));
 japan.addEventListener('change',()=>update({includesJapan:japan.value?japan.value==='true':null}));

 return (next,skinName)=>{
  section.hidden=!next;
  if(!next){project=null;return;}
  if(project!==next.id){
   language.value='ja';
   status.textContent='';
   fallback.hidden=true;
   fallback.value='';
  }
  project=next.id;
  sales=next.sales??emptySales();
  find('skin').textContent=skinName??'—';
  render();
 };
}
