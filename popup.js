
const $=id=>document.getElementById(id);
function save(){
 chrome.storage.local.set({
 fixed:$("fixed").value,
 start:+$("start").value,
 end:+$("end").value,
 step:+$("step").value
 });
}
["fixed","start","end","step"].forEach(i=>$(i).addEventListener("change",save));

function send(type){
 chrome.runtime.sendMessage({cmd:"picker",type});
 window.close();
}
$("pf").onclick=()=>send("fixed");
$("pn").onclick=()=>send("number");
$("ps").onclick=()=>send("submit");
$("startBtn").onclick=()=>alert("Automation next version");
$("stopBtn").onclick=()=>alert("Stopped");

function refresh(){
 chrome.storage.local.get("selectors",d=>{
  let s=d.selectors||{};
  $("sf").textContent=s.fixed?"✅":"❌";
  $("sn").textContent=s.number?"✅":"❌";
  $("ss").textContent=s.submit?"✅":"❌";
 });
}
refresh();
