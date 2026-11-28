import {ADJUSTMENTS,CROP_FILES,adjustment} from './export-spec.js';
import {drawCropPreview} from './export-images.js';
import {generateSubmission,missingImages} from './submission-export.js';
import {writeZip} from './zip.js';

export function setupExportPanel({saveSettings,runOperation,renderProgress}){
 const section=document.getElementById('submission-export');
 const tweaks=document.getElementById('export-adjustments');
 const cropSelect=document.getElementById('export-crop-file');
 const position=document.getElementById('export-crop-position');
 const cropImage=document.getElementById('export-crop-preview');
 const cropMessage=document.getElementById('export-crop-message');
 const extra=document.getElementById('export-extra-settings');
 const status=document.getElementById('submission-status');
 const missingList=document.getElementById('submission-missing');
 const results=document.getElementById('submission-results');
 const download=document.getElementById('submission-download');
 const generate=document.getElementById('submission-generate');
 let project,previewRequest=0,zipUrl;
 cropSelect.append(...CROP_FILES.map(file=>new Option(file.label,file.name)));
 const extraInputs=new Map();

 for(const setting of ADJUSTMENTS.filter(item=>!CROP_FILES.some(file=>file.name===item.key))){
  const label=document.createElement('label');
  label.append(setting.label+' ');
  const input=document.createElement('input');
  input.type='number';input.min=setting.min;input.max=setting.max;input.step='1';input.required=true;
  input.addEventListener('change',()=>{
   if(input.checkValidity())saveSettings({...project.exportSettings,[setting.key]:input.valueAsNumber});
   else input.value=adjustment(project.exportSettings,setting.key);
  });
  extraInputs.set(setting.key,input);
  label.append(input);
  extra.append(label);
 }

 function clearResult(){
  if(zipUrl)URL.revokeObjectURL(zipUrl);
  zipUrl=null;
  download.hidden=true;download.removeAttribute('href');
  results.hidden=true;results.tBodies[0].replaceChildren();
  renderProgress(project,false);
 }

 function updateMissing(){
  const missing=missingImages(project);
  missingList.hidden=!missing.length;
  missingList.replaceChildren(...missing.map(slot=>{
   const item=document.createElement('li');
   item.textContent=slot.label;
   return item;
  }));
  status.textContent=missing.length?'未登録の原画が'+missing.length+'点あります。':'原画25点がそろっています。';
 }

 async function preview(){
  const request=++previewRequest;
  position.disabled=true;cropImage.hidden=true;
  if(!project||!tweaks.open)return;
  const file=CROP_FILES.find(spec=>spec.name===cropSelect.value);
  const source=project.images[file.slot];
  if(!source){cropMessage.textContent='この原画は未登録です。';return;}
  cropMessage.textContent='プレビューを読み込み中…';
  try{
   const bounds=await drawCropPreview(cropImage.getContext('2d'),source.blob,file,project.exportSettings,()=>request===previewRequest);
   if(request!==previewRequest)return;
   position.max=bounds.maxY;position.value=bounds.y;
   position.disabled=false;cropImage.hidden=false;
   cropMessage.textContent='原画の上から '+bounds.y+' px';
  }catch(error){
   if(request===previewRequest)cropMessage.textContent=error.message;
  }
 }

 position.addEventListener('input',()=>{cropMessage.textContent='原画の上から '+position.value+' px';});
 position.addEventListener('change',()=>saveSettings({...project.exportSettings,[cropSelect.value]:position.valueAsNumber}));
 cropSelect.addEventListener('change',preview);
 tweaks.addEventListener('toggle',preview);

 function showResults(files){
  const rows=files.map(file=>{
   const row=document.createElement('tr');
   const result=file.errors.length?file.errors.join('、'):file.reduced?'合格（色数を削減）':'合格';
   for(const value of [file.name,file.width+'×'+file.height,file.bytes.toLocaleString('ja-JP'),result]){
    const cell=row.insertCell();
    cell.textContent=value;
   }
   if(file.errors.length||file.reduced)row.className='export-attention';
   return row;
  });
  results.tBodies[0].replaceChildren(...rows);
  results.hidden=false;
 }

 generate.addEventListener('click',()=>runOperation('提出用画像を生成中…',async()=>{
  clearResult();
  if(missingImages(project).length){
   updateMissing();return '原画をすべて登録してください';
  }
  try{
   status.textContent='生成中… 0 / 62';
   const files=await generateSubmission(project,count=>{status.textContent='生成中… '+count+' / 62';});
   showResults(files);
   const failed=files.filter(file=>file.errors.length);
   if(failed.length)throw new Error(failed.map(file=>file.name+'：'+file.errors.join('、')).join('／'));
   const zip=await writeZip(files.map(file=>({name:file.name,data:file.blob})));
   const date=new Date();
   const day=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
   const name=project.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim();
   zipUrl=URL.createObjectURL(zip);
   download.href=zipUrl;download.download=(name||'着せかえ')+'_'+day+'.zip';download.hidden=false;
   renderProgress(project,true);
   const reduced=files.filter(file=>file.reduced).length;
   status.textContent='62点すべて合格しました。'+(reduced?' 色数を削減したファイルが'+reduced+'点あります。':'');
   return '提出用ZIPを生成しました';
  }catch(error){
   status.textContent='提出用ZIPを作成できませんでした。'+error.message;
   return '提出用ZIPの生成に失敗しました';
  }
 }));

 return function render(next){
  if(project===next)return;
  const refresh=!project||!next||project.id!==next.id||project.images!==next.images||project.exportSettings!==next.exportSettings;
  const invalidate=refresh||project.name!==next.name;
  project=next;
  section.hidden=!project;
  renderProgress(project,!invalidate&&Boolean(zipUrl));
  if(invalidate){
   clearResult();
   if(project)updateMissing();
  }
  if(refresh){
   for(const [key,input] of extraInputs)input.value=adjustment(project?.exportSettings,key);
   preview();
  }
 };
}
