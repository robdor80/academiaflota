(()=>{
  const installButton=()=>document.getElementById("install-pwa-button");
  let installPrompt=null;

  const installed=()=>window.matchMedia("(display-mode: fullscreen)").matches||
    window.matchMedia("(display-mode: standalone)").matches||
    window.navigator.standalone===true;

  const syncUi=()=>{
    document.documentElement.classList.toggle("pwa-runtime",installed());
    const button=installButton();
    if(!button)return;
    button.hidden=installed()||!installPrompt;
  };

  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>{
      navigator.serviceWorker.register("./service-worker.js",{scope:"./"})
        .catch(error=>console.error("Sensors v0.3 PWA · service worker:",error));
    });
  }

  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    installPrompt=event;
    syncUi();
  });

  window.addEventListener("appinstalled",()=>{
    installPrompt=null;
    syncUi();
  });

  document.addEventListener("click",async event=>{
    const button=event.target.closest("#install-pwa-button");
    if(!button||!installPrompt)return;
    button.disabled=true;
    try{
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt=null;
    }finally{
      button.disabled=false;
      syncUi();
    }
  });

  document.addEventListener("DOMContentLoaded",syncUi);
})();
