const CACHE_NAME="sensors-v03-pwa-v2";

const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sensors-v03.css",
  "./app.js",
  "./contact_actions.js",
  "./pwa.js",
  "./assets/zenital_ncc1701d.webp",
  "./assets/perfil_ncc1701d.webp",
  "../sensors/data/scenarios.json",
  "../sensors/sim_engine.js",
  "../sensors-v02/computer_contract.js",
  "../sensors-v02/ai_gateway.js",
  "../sensors-v02/voice_input.js",
  "../sensors-v02/response_composer.js",
  "../sensors-v02/computer_cloud.js",
  "../sensors-v02/command_repair.js"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(key=>key.startsWith("sensors-v03-")&&key!==CACHE_NAME)
          .map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(request);
        if(cached)return cached;
        if(request.mode==="navigate")return caches.match("./index.html");
        return Response.error();
      })
  );
});
