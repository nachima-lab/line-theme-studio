export const TEMPLATES=[
 ['character','キャラ表作成','同じキャラクターの全身と顔が見える参照画像。姿や配色が分かるように描く。'],
 ['common','共通',''],
 ['main','メイン','作品の雰囲気が伝わる縦長の原画。異なる縦横比への切り出しに備え、重要な要素の周囲には余白を取る。'],
 ['icon','アイコン','加工用の正方形の原画。円形に切り出しても絵柄が見えるよう中央に配置し、小さく表示しても識別できる形にする。'],
 ['talk','トーク背景','会話の文字が読みやすい縦長の原画。中央付近は控えめにし、上下に切り出し用の余白を取る。'],
 ['menu','メニュー背景','細い横長の帯を切り出すための原画。アイコンが見やすい背景にし、切り出し位置を調整できるよう上下に余裕を取る。'],
 ['passcode','パスコード','小さな正方形に配置する原画。外周の白を透明化できるよう、白い余白を取り、中央の絵柄を明瞭にする。'],
 ['profile','プロフィール','正方形に収める原画。重要な絵柄を中央付近にまとめ、角は補完しやすい背景にする。']
];
export const HEX_COLOR=/^#[0-9A-F]{6}$/i;

export function emptyProduction(){
 return {colors:[],style:'',world:'',templates:{},characterSheet:null,undo:{}};
}

export function templateValues(production){
 return {'固定色':production.colors.join('、'),'画風メモ':production.style,'世界観メモ':production.world};
}

export function templateText(production,key,initial){
 const values=templateValues(production);
 return (production.templates[key]??initial).replace(/\{(固定色|画風メモ|世界観メモ)\}/g,(_,word)=>values[word]);
}
