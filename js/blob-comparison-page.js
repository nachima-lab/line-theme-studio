import {IMAGE_SLOTS,readSavedProjectsForDiagnosis} from './store.js';

const origin='https://rawcdn.githack.com';
const slots=IMAGE_SLOTS.filter(({id})=>['menu-talk-off','menu-call-off'].includes(id));
const methods=[{label:'直接',copy:false},{label:'一時Blob',copy:true}];
const byId=id=>document.getElementById('diagnostic-'+id);
const list=byId('project'),start=byId('start'),copy=byId('copy'),status=byId('status'),report=byId('report');
let projects=[];
byId('origin').textContent=location.origin;

async function compare(item,method){
 if(!(item?.blob instanceof Blob)){
  return {ok:false,summary:'失敗 [原画確認] MissingBlob：原画が未登録、またはBlobを取得できません'};
 }
 const image=new Image();
 let stage,url,blob=item.blob;
 try{
  if(method.copy){
   stage='arrayBuffer()';
   const bytes=await blob.arrayBuffer();
   if(bytes.byteLength!==blob.size)throw new Error('申告サイズと実バイト数が一致しません');
   stage='一時Blob作成';
   blob=new Blob([bytes],{type:blob.type});
  }
  stage='Object URL作成';
  url=URL.createObjectURL(blob);
  stage='画像デコード';
  image.src=url;
  await image.decode();
  return {ok:true,summary:'成功（'+image.naturalWidth+' × '+image.naturalHeight+' px）'};
 }catch(error){
  return {ok:false,summary:'失敗 ['+stage+'] '+(error.name||'Error')+'：'+(error.message||'詳細なし')};
 }finally{
  image.removeAttribute('src');
  if(url)URL.revokeObjectURL(url);
 }
}

list.addEventListener('change',()=>{
 report.value='';
 copy.disabled=true;
});
start.addEventListener('click',async()=>{
 const project=projects[Number(list.value)];
 if(!project)return;
 start.disabled=list.disabled=copy.disabled=true;
 const lines=['LINE着せかえ制作室 原画デコード比較','保存元: '+location.origin,'作品: '+project.name,'','【直列】'];
 const show=()=>{report.value=lines.join('\n');};
 show();
 try{
  status.textContent='直列で比較しています…';
  let serialPassed=true;
  for(const slot of slots){
   const item=project.images?.[slot.id];
   lines.push(slot.label+' / '+(item?.name??'未登録'));
   for(const method of methods){
    const result=await compare(item,method);
    serialPassed&&=result.ok;
    lines.push('  '+method.label+'：'+result.summary);
    show();
   }
  }
  lines.push('','【並列】');
  if(serialPassed){
   status.textContent='2枚を並列で比較しています…';
   for(const method of methods){
    const results=await Promise.all(slots.map(slot=>compare(project.images[slot.id],method)));
    for(const [index,result] of results.entries()){
     lines.push(slots[index].label+' / '+method.label+'：'+result.summary);
    }
    show();
   }
  }else lines.push('未実施（直列で失敗した項目があるため）');
  show();
  status.textContent='比較が完了しました。';
 }finally{
  start.disabled=list.disabled=false;
  copy.disabled=false;
 }
});
copy.addEventListener('click',async()=>{
 try{
  await navigator.clipboard.writeText(report.value);
  status.textContent='診断結果をコピーしました。';
 }catch{
  report.focus();
  report.select();
  status.textContent='選択した結果を端末の「コピー」でコピーしてください。';
 }
});
try{
 if(location.origin!==origin){
  status.textContent='rawcdn.githack.com で開いてください。保存データは開いていません。';
 }else{
  const saved=await readSavedProjectsForDiagnosis();
  projects=saved.projects.filter(project=>project?.name==='桃太郎ワールド');
  list.append(...projects.map((project,index)=>new Option(project.name+(projects.length>1?'（'+(index+1)+'）':''),String(index))));
  const active=projects.findIndex(project=>project.id===saved.activeId);
  if(projects.length){
   list.selectedIndex=Math.max(0,active);
   list.disabled=start.disabled=false;
   status.textContent='「診断する」を押してください。';
  }else status.textContent='この保存元に「桃太郎ワールド」が見つかりませんでした。';
 }
}catch(error){
 status.textContent='保存データを読み取れませんでした（'+error.name+'）。';
}
