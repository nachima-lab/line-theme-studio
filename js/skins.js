export const GROUPS=['B/W','Beige','Blue','Brown','Green','Pink','Purple','Red','Yellow'];
export async function loadSkins(){
 const response=await fetch('./data/color-skins.json',{cache:'no-cache'});
 if(!response.ok)throw new Error('色データを読み込めませんでした ('+response.status+')');
 const data=await response.json();
 if(!Array.isArray(data.skins)||data.skins.length!==50)throw new Error('スキン数が50件ではありません');
 return data.skins;
}
export const color=(skin,key)=>skin.colors?.[key]?.value??null;
export const groupedSkins=skins=>GROUPS.map(group=>({group,skins:skins.filter(s=>s.group===group).sort((a,b)=>a.index-b.index)}));
