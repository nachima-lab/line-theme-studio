import {parseDesignSheet,designDiff,applyDesignDiff,validateDesign} from './design-sheet.js';

export function setupDesignPanel({slots,commit}){
 const get=id=>document.getElementById('design-'+id);
 const section=get('panel'),input=get('input'),review=get('review'),status=get('status');
 const apply=get('apply'),list=get('differences'),original=get('original');
 const slotIds=slots.map(slot=>slot.id);
 let project,proposal,editDirty=false;
 const advice=`LINE着せかえの企画を一緒に考えてください。世界観、画風、配色、キャラクターやモチーフを順に相談し、私が了承したら次の形式のJSONだけを出力してください。
{"sheetVersion":1,"workName":"作品名","worldview":"世界観","style":"画風","colors":["#112233"],"characters":[{"id":"hero","name":"名前","description":"造形の説明"}],"motifs":["モチーフ"],"notes":"補足・禁止事項","parts":{"mainImage":{"composition":"構図","characterIds":["hero"],"motifs":["モチーフ"],"placement":"配置","expression":"表情","stateNotes":"OFF／ONの違い"}}}
固定色は #RRGGBB で最大8色。キャラクターがいなければ characters は空配列にしてください。未決定の項目と枠は省略できます。parts は任意です。枠IDは次から選んでください。
`+slots.map(({id,label})=>id+'（'+label+'）').join('、');

 function resetReview(){
  proposal=null;
  review.hidden=true;
  list.replaceChildren();
 }
 const describe=value=>{
  if(value===null||value===''||(Array.isArray(value)&&!value.length))return '（未入力）';
  return typeof value==='string'?value:JSON.stringify(value,null,2);
 };
 function displayValue(label,value){
  const block=document.createElement('p');
  const title=document.createElement('strong');
  title.textContent=label;
  block.append(title,document.createTextNode(describe(value)));
  return block;
 }

 get('copy').addEventListener('click',async()=>{
  const fallback=get('copy-text');
  fallback.hidden=true;
  try{
   await navigator.clipboard.writeText(advice);
   status.textContent='相談開始文をコピーしました。ChatGPTに貼り付けてください。';
  }catch{
   fallback.value=advice;
   fallback.hidden=false;
   fallback.focus();
   fallback.select();
   status.textContent='選択した相談開始文を手動でコピーしてください。';
  }
 });
 input.addEventListener('input',()=>{resetReview();status.textContent='';});
 get('cancel').addEventListener('click',()=>{
  resetReview();status.textContent='確認を取り消しました。貼り付けた文面は残っています。';
  get('preview').focus();
 });
 get('preview').addEventListener('click',()=>{
  resetReview();
  if(!project)return;
  try{
   const sheet=parseDesignSheet(input.value,slotIds);
   const rows=designDiff(project,sheet,slots);
   if(!rows.length){
    status.textContent='反映する差分はありません。';
    return;
   }
   proposal={id:project.id,sheet,rows,raw:input.value};
   for(const row of rows){
    const item=document.createElement('li');
    const label=document.createElement('label');
    const box=document.createElement('input');
    box.type='checkbox';box.value=row.key;box.checked=row.suggested;
    label.append(box,document.createTextNode(row.label+'を反映'));
    item.append(label,displayValue('現在 ',row.before),displayValue('取り込み案 ',row.after));
    list.append(item);
   }
   review.hidden=false;
   apply.disabled=!list.querySelector(':checked');
   status.textContent='反映する項目を選んでください。';
  }catch(error){status.textContent=error.message;}
 });
 list.addEventListener('change',()=>{apply.disabled=!list.querySelector(':checked');});
 apply.addEventListener('click',async()=>{
  if(editDirty){
   status.textContent='先にキャラクター・モチーフ・補足の編集内容を保存してください。';
   return;
  }
  const pending=proposal;
  if(!pending)return;
  const selected=new Set([...list.querySelectorAll(':checked')].map(box=>box.value));
  if(!selected.size)return;
  apply.disabled=true;
  await commit(pending.id,current=>{
   const latest=designDiff(current,pending.sheet,slots);
   if(JSON.stringify(latest)!==JSON.stringify(pending.rows)){
    throw new Error('確認後に作品が変わりました。もう一度差分を確認してください。');
   }
   return applyDesignDiff(current,latest,selected,pending.raw,slotIds);
  },result=>{
   if(result){
    input.value='';
    resetReview();
    status.textContent='選んだ設計情報を取り込みました。';
    get('preview').focus();
   }else if(proposal===pending){
    apply.disabled=false;
    status.textContent='取り込めませんでした。上部の保存状況を確認してください。';
   }
  });
 });

 const characterList=get('characters');
 function characterRow(character){
  const row=document.createElement('li');
  row.dataset.id=character.id;
  for(const [key,label,tag,max] of [['name','名前','input',80],['description','造形の説明','textarea',800]]){
   const wrapper=document.createElement('label');
   const control=document.createElement(tag);
   control.name=key;control.maxLength=max;control.value=character[key];
   wrapper.append(label,control);row.append(wrapper);
  }
  const remove=document.createElement('button');
  remove.type='button';remove.textContent='このキャラクターを外す';
  remove.addEventListener('click',()=>{row.remove();editDirty=true;});
  row.append(remove);characterList.append(row);
 }
 function showDesign(design){
  editDirty=false;
  characterList.replaceChildren();
  for(const character of design?.characters??[])characterRow(character);
  get('motifs').value=(design?.motifs??[]).join('\n');
  get('notes').value=design?.notes??'';
  original.value=design?.lastImport?.raw??'';
  get('original-details').hidden=!design?.lastImport;
  get('parts').replaceChildren(...slots.flatMap(({id,label})=>{
   if(!Object.hasOwn(design?.parts??{},id))return [];
   const li=document.createElement('li');
   li.append(displayValue(label+' ',design.parts[id]));
   return [li];
  }));
  get('parts-details').hidden=!get('parts').children.length;
 }
 get('add-character').addEventListener('click',()=>{
  if(characterList.children.length>=16){
   get('edit-status').textContent='キャラクターは16件まで追加できます。';
   return;
  }
  editDirty=true;
  characterRow({id:'char-'+crypto.randomUUID().slice(0,12),name:'',description:''});
  characterList.lastElementChild.querySelector('input').focus();
 });
 for(const id of ['characters','motifs','notes']){
  get(id).addEventListener('input',()=>{editDirty=true;});
 }
 get('discard-edit').addEventListener('click',()=>{
  showDesign(project?.production.design);
  get('edit-status').textContent='保存済みの設計情報に戻しました。';
 });
 get('save').addEventListener('click',async()=>{
  if(!project)return;
  const base=project.production.design;
  const characters=[...characterList.children].map(row=>({
   id:row.dataset.id,name:row.querySelector('[name=name]').value,description:row.querySelector('[name=description]').value
  }));
  const motifs=get('motifs').value.split('\n').map(line=>line.trim()).filter(Boolean);
  const notes=get('notes').value;
  await commit(project.id,current=>{
   if(current.production.design!==base)throw new Error('設計情報が更新されました。内容を確認してください。');
   const design=validateDesign({...base,characters,motifs,notes},slotIds);
   return {...current,production:{...current.production,design}};
  },success=>{
   get('edit-status').textContent=success?'設計情報を保存しました。':'保存できませんでした。上部の保存状況を確認してください。';
  });
 });

 return next=>{
  section.hidden=!next;
  if(next?.id!==project?.id){
   input.value='';
   status.textContent='';
   get('edit-status').textContent='';
   get('copy-text').hidden=true;
   resetReview();
  }
  if(next?.production.design!==project?.production.design||next?.id!==project?.id)showDesign(next?.production.design);
  project=next;
 };
}
