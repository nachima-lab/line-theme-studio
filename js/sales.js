export const SALES_LANGUAGES={ja:'日本語',en:'英語','zh-Hant':'繁体字',th:'タイ語'};
export const SALES_FIELDS={
 title:{label:'タイトル',limit:40},
 description:{label:'説明文',limit:160},
 creatorName:{label:'クリエイター名',limit:50}
};
export const SALES_PRICES=[
 {coins:50,yen:120,outsideJapan:true},{coins:70,yen:190,outsideJapan:true},{coins:100,yen:250,outsideJapan:true},
 {coins:150,yen:370},{coins:200,yen:490},{coins:250,yen:610}
];
const emoji=/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u20e3]/u;
// 公式ルールの全角2を参考表示する。曖昧幅や結合文字は申請画面で確認する。
const wide=/[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{16fe0}-\u{18dff}\u{1aff0}-\u{1b2ff}\u{20000}-\u{3fffd}]/u;

export function emptySales(){
 return {texts:Object.fromEntries(Object.keys(SALES_LANGUAGES).map(language=>[language,{
  title:'',description:'',creatorName:''
 }])),copyright:'',coins:null,includesJapan:null};
}

export function readSales(value){
 if(!value||typeof value!=='object'||Array.isArray(value)
    ||typeof value.copyright!=='string'
    ||(value.includesJapan!==null&&typeof value.includesJapan!=='boolean')
    ||(value.coins!==null&&!SALES_PRICES.some(price=>price.coins===value.coins))){
  throw new Error('販売情報の形式が正しくありません');
 }
 const sales=emptySales();
 sales.copyright=value.copyright;
 sales.coins=value.coins;
 sales.includesJapan=value.includesJapan;
 for(const language of Object.keys(SALES_LANGUAGES)){
  for(const field of Object.keys(SALES_FIELDS)){
   const text=value.texts?.[language]?.[field];
   if(typeof text!=='string')throw new Error('販売情報の文面が正しくありません');
   sales.texts[language][field]=text;
  }
 }
 return sales;
}

export function salesTextStatus(value,limit,required){
 let count=0;
 for(const letter of value)count+=wide.test(letter)?2:1;
 const warnings=[];
 if(!value.trim())warnings.push(required?'未入力（英語は必須）':'未入力');
 if(count>limit)warnings.push('上限超過（参考カウント）');
 if(emoji.test(value))warnings.push('絵文字は使用できません');
 return {count,warnings};
}
