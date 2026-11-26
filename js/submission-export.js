import {IMAGE_SLOTS} from './store.js';
import {OUTPUT_FILES,PNG_LIMIT} from './export-spec.js';
import {renderSlot} from './export-images.js';

export function missingImages(project){
 return IMAGE_SLOTS.filter(slot=>!project?.images[slot.id]?.blob);
}

async function pngSize(blob){
 const header=new Uint8Array(await blob.slice(0,24).arrayBuffer());
 const signature=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82];
 if(header.length!==24||signature.some((byte,index)=>byte!==header[index])){
  throw new Error('PNGのヘッダーが不正です');
 }
 const view=new DataView(header.buffer);
 return {width:view.getUint32(16),height:view.getUint32(20)};
}

async function validateOutput(files){
 if(files.length!==62||new Set(files.map(file=>file.name)).size!==62){
  throw new Error('生成したファイルが重複しているか、62点そろっていません');
 }
 const byName=new Map(files.map(file=>[file.name,file]));
 return Promise.all(OUTPUT_FILES.map(async spec=>{
  const file=byName.get(spec.name);
  if(!file)throw new Error(spec.name+' がありません');
  const {width,height}=await pngSize(file.blob);
  const errors=[];
  if(width!==spec.width||height!==spec.height)errors.push('指定の寸法と一致しません');
  if(file.blob.size>PNG_LIMIT)errors.push('色数調整後も1 MBに収まりません');
  return {...file,width,height,bytes:file.blob.size,errors};
 }));
}

export async function generateSubmission(project,onProgress=()=>{}){
 const missing=missingImages(project);
 if(missing.length)throw new Error('未登録の原画があります');
 const files=[];
 for(const slot of IMAGE_SLOTS){
  try{
   const specs=OUTPUT_FILES.filter(file=>file.slot===slot.id);
   files.push(...await renderSlot(project.images[slot.id].blob,specs,project.exportSettings));
  }catch(error){throw new Error(slot.label+'：'+error.message);}
  onProgress(files.length);
 }
 return validateOutput(files);
}
