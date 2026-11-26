export function setupPreviewTabs(){
 const tabs=[...document.querySelectorAll('.preview-tabs [role=tab]')];
 function select(selected){
  for(const tab of tabs){
   const active=tab===selected;
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
   document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;
  }
 }
 for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>select(tab));
  tab.addEventListener('keydown',event=>{
   const target={
    ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,
    Home:0,End:tabs.length-1
   }[event.key];
   if(target===undefined)return;
   event.preventDefault();
   select(tabs[target]);
   tabs[target].focus();
  });
 }
}
