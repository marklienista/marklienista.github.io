'use strict';
const CACHE='apertaletra-al008-shell-0.7.0-alpha.1-batch-print';
const FILES=['./','./index.html','./style.css','./js/model.js','./js/store.js','./js/app.js','./js/beginner.js','./adult.css','./classroom.css','./batch-print.css','./js/batch-print.js','./js/class-api.js','./assets/identity-b.css','./assets/marcelo.webp','./js/config.js','./js/cloud.js','./js/online-store.js','./js/portal.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
// No skipWaiting: do not replace an active editor midway through writing.
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('apertaletra-al008-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 // Cache-first provides one coherent shell version. Only explicitly cached assets
 // are served offline; no documents, payments, or external responses are cached.
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request,{ignoreSearch:true}))||fetch(event.request)));
});
