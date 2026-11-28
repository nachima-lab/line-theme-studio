import {IMAGE_SLOTS,readSavedProjectsForDiagnosis} from './store.js';
import {diagnoseImage} from './image-diagnostics.js';

const byId=id=>document.getElementById('diagnostic-'+id);
const list=byId('project'),start=byId('start'),copy=byId('copy'),status=byId('status'),report=byId('report');
let projects=[];
byId('origin').textContent=location.origin;

function refreshSelection(){
 report.value='';
 copy.disabled=true;
}

list.addEventListener('change',refreshSelection);
start.addEventListener('click',async()=>{
 const project=projects[Number(list.value)];
 if(!project)return;
 start.disabled=list.disabled=copy.disabled=true;
 refreshSelection();
 const slots=[...IMAGE_SLOTS];
 if(project.images?.menuIcon)slots.push({id:'menuIcon',label:'旧形式のメニューアイコン'});
 const lines=['LINE着せかえ制作室 原画診断','保存元: '+location.origin,'作品: '+project.name,''];
 try{
  for(const [index,slot] of slots.entries()){
   status.textContent='診断中 '+(index+1)+' / '+slots.length;
   const image=await diagnoseImage(project.images?.[slot.id]);
   lines.push('['+slot.label+'] '+image.name,
    '  申告サイズ: '+image.declared+' / MIME: '+image.mime,
    '  読み出し: '+image.read+' / 実バイト数: '+image.actual,
    '  形式: '+image.format+' / 先頭バイト: '+image.signature,
    '  デコード: '+image.decode,
    '  SHA-256: '+image.sha,
    '  保存時の記録との照合: '+image.integrity,'');
   report.value=lines.join('\n');
  }
  status.textContent=slots.length+'枠の診断が完了しました。';
 }catch(error){
  status.textContent='診断を続けられませんでした（'+error.name+'）。';
 }finally{
  list.disabled=start.disabled=false;
  copy.disabled=!report.value;
 }
});

copy.addEventListener('click',async()=>{
 try{
  await navigator.clipboard.writeText(report.value);
  status.textContent='診断結果をコピーしました。';
 }catch{
  report.focus();
  report.select();
  status.textContent='選択した診断結果を端末の「コピー」でコピーしてください。';
 }
});

try{
 const saved=await readSavedProjectsForDiagnosis();
 projects=saved.projects;
 if(projects.length){
  list.append(...projects.map((project,index)=>new Option(project.name,String(index))));
  const active=projects.findIndex(project=>project.id===saved.activeId);
  list.selectedIndex=active<0?0:active;
  list.disabled=start.disabled=false;
  status.textContent='対象の作品を確認し、「診断する」を押してください。';
 }else status.textContent='この保存元に作品データが見つかりませんでした。';
}catch(error){
 status.textContent='保存データを読み取れませんでした（'+error.name+'）。';
}
