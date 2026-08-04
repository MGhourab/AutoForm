
let mode=null,hover=null;

function toast(text){
 let t=document.getElementById("__aff_toast");
 if(!t){
   t=document.createElement("div");
   t.id="__aff_toast";
   t.style.cssText="position:fixed;top:20px;right:20px;background:#1976d2;color:#fff;padding:10px 14px;border-radius:6px;z-index:2147483647;font:14px Arial";
   document.body.appendChild(t);
 }
 t.textContent=text;
}

function removeToast(){document.getElementById("__aff_toast")?.remove();}

function cssSelector(el){
 if(el.id) return "#"+CSS.escape(el.id);
 let p=[];
 while(el&&el!==document.body){
  let i=1,s=el;
  while((s=s.previousElementSibling)) if(s.tagName===el.tagName) i++;
  p.unshift(el.tagName.toLowerCase()+":nth-of-type("+i+")");
  el=el.parentElement;
 }
 return p.join(" > ");
}

function move(e){
 if(hover) hover.style.outline="";
 hover=e.target;
 hover.style.outline="3px solid #2196f3";
}

function finish(){
 document.removeEventListener("mousemove",move,true);
 document.removeEventListener("click",pick,true);
 document.removeEventListener("keydown",esc,true);
 if(hover) hover.style.outline="";
 hover=null;
 mode=null;
 setTimeout(removeToast,1000);
}

function esc(e){
 if(e.key==="Escape"){
   toast("Cancelled");
   finish();
 }
}

function pick(e){
 e.preventDefault();
 e.stopPropagation();
 const el=e.target;
 const data={
   css:cssSelector(el),
   id:el.id||"",
   name:el.name||"",
   tag:el.tagName,
   type:el.type||"",
   placeholder:el.placeholder||""
 };
 chrome.storage.local.get("selectors",r=>{
   let s=r.selectors||{};
   s[mode]=data;
   chrome.storage.local.set({selectors:s},()=>toast("Saved "+mode+" field"));
 });
 finish();
}

chrome.runtime.onMessage.addListener(msg=>{
 if(msg.cmd==="picker"){
   mode=msg.type;
   toast("Select "+mode+" field (ESC to cancel)");
   document.addEventListener("mousemove",move,true);
   document.addEventListener("click",pick,true);
   document.addEventListener("keydown",esc,true);
 }
});
