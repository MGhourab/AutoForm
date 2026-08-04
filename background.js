
chrome.runtime.onMessage.addListener((msg,sender)=>{
  if(msg.cmd==="picker"){
    chrome.tabs.query({active:true,currentWindow:true},tabs=>{
      if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id,msg);
    });
  }
});
