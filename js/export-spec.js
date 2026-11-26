// 展開テーブルの固定値。原画座標と白判定は作品ごとの初期値。
export const PNG_LIMIT=1_000_000;
const crop=(name,width,height,slot,y,label)=>({name,width,height,slot,y,label,kind:'crop'});
export const CROP_FILES=[
 crop('ios_thumbnail.png',200,284,'mainImage',41,'メイン画像 iOS'),
 crop('android_thumbnail.png',136,202,'mainImage',8,'メイン画像 Android'),
 crop('store_thumbnail.png',198,278,'mainImage',47,'ストア画像'),
 crop('i_11.png',1472,150,'menuBackground',262,'メニュー背景'),
 crop('i_22.png',1482,1334,'talkBackground',614,'トーク背景 iOS'),
 crop('a_22.png',1300,1300,'talkBackground',518,'トーク背景 Android')
];

const menuNumbers=[['talk',3],['call',7],['news',25],['wallet',27],['home',29],
 ['today',31],['voom',33],['shopping',35],['apps',37]];
const icons=menuNumbers.flatMap(([feature,first])=>['off','on'].flatMap((state,index)=>{
 const slot='menu-'+feature+'-'+state;
 const number=String(first+index).padStart(2,'0');
 return [
  {name:'i_'+number+'.png',width:128,height:150,diameter:108,x:10,y:21,slot,kind:'icon'},
  {name:'i_'+number+'_g.png',width:80,height:56,diameter:52,x:14,y:2,slot,kind:'icon'}
 ];
}));
const passcodes=[['i',120],['a',116]].flatMap(([platform,size])=>
 Array.from({length:8},(_,index)=>({
  name:platform+'_'+(12+index)+'.png',width:size,height:size,
  slot:index%2?'passcodeOn':'passcodeOff',kind:'passcode'
 })));
const profiles=[['i',240],['a',247]].flatMap(([platform,size])=>
 ['profilePersonal','profileGroup'].map((slot,index)=>({
  name:platform+'_'+(20+index)+'.png',width:size,height:size,slot,kind:'profile'
 })));
export const OUTPUT_FILES=Object.freeze([...CROP_FILES,...icons,...passcodes,...profiles].map(Object.freeze));

export const ADJUSTMENTS=Object.freeze([
 ...CROP_FILES.map(file=>({key:file.name,label:file.label+'の切り出し位置',initial:file.y,min:0,max:Number.MAX_SAFE_INTEGER})),
 {key:'passcodeWidth',label:'パスコードの絵柄幅（%）',initial:93,min:1,max:100},
 {key:'passcodeWhite',label:'パスコードの白判定',initial:248,min:0,max:255},
 {key:'profileWhite',label:'プロフィールの白判定',initial:248,min:0,max:255}
].map(Object.freeze));

export function readAdjustments(value){
 return Object.fromEntries(ADJUSTMENTS.flatMap(({key,min,max})=>{
  const number=value?.[key];
  return Number.isSafeInteger(number)&&number>=min&&number<=max?[[key,number]]:[];
 }));
}

export function adjustment(settings,key){
 return settings?.[key]??ADJUSTMENTS.find(item=>item.key===key).initial;
}

export function cropBounds(width,height,file,settings){
 const cropHeight=width*file.height/file.width;
 if(cropHeight>height)throw new Error(file.label+'の原画の高さが不足しています');
 const maxY=Math.floor(height-cropHeight);
 return {x:0,y:Math.min(adjustment(settings,file.name),maxY),width,height:cropHeight,maxY};
}
