export function setupWorkflowTabs(){
 const tabs=[...document.querySelectorAll('.workflow-tabs [role="tab"]')];
 function select(selected,scroll=true){
  for(const tab of tabs){
   const active=tab===selected;
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
   document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;
  }
  if(scroll){
   selected.focus({preventScroll:true});
   document.getElementById(selected.getAttribute('aria-controls')).scrollIntoView({block:'start'});
  }
 }
 for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>select(tab));
  tab.addEventListener('keydown',event=>{
   const target={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,
    Home:0,End:tabs.length-1}[event.key];
   if(target===undefined)return;
   event.preventDefault();
   select(tabs[target]);
  });
 }
 return (stage,scroll)=>select(document.getElementById('workflow-'+stage),scroll);
}
