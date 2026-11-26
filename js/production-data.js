// 初期文面は提供された時点で、このデータだけを差し替える。
export const TEMPLATES=[
 ['character','キャラ表作成',''],['common','共通',''],['main','メイン',''],['icon','アイコン',''],
 ['talk','トーク背景',''],['menu','メニュー背景',''],['passcode','パスコード',''],['profile','プロフィール','']
];
export const HEX_COLOR=/^#[0-9A-F]{6}$/i;

export function emptyProduction(){
 return {colors:[],style:'',world:'',templates:{},characterSheet:null,undo:{}};
}

export function templateText(production,key,initial){
 const values={'固定色':production.colors.join('、'),'画風メモ':production.style,'世界観メモ':production.world};
 return (production.templates[key]??initial).replace(/\{(固定色|画風メモ|世界観メモ)\}/g,(_,word)=>values[word]);
}
