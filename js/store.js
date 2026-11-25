// Phase 2でIndexedDB・自動保存・バックアップをこの層に追加する。
// Phase 1ではブラウザのメモリ上にのみ保持する。
export const IMAGE_SLOTS=[{id:'talkBackground',label:'トーク背景',accept:'image/*'}];
export function createDraft(){return {version:1,skinId:'beige_01',images:Object.fromEntries(IMAGE_SLOTS.map(s=>[s.id,null]))};}
