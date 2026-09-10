const CACHE_NAME='solarflow-v13-2-exit-fix-20260910';
const CORE=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE).catch(()=>{})));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET')return;if(u.hostname.includes('supabase.co')){e.respondWith(fetch(r,{cache:'no-store'}));return}if(r.mode==='navigate'||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/')){e.respondWith(fetch(r,{cache:'no-store'}).then(res=>{const cp=res.clone();caches.open(CACHE_NAME).then(c=>c.put('./index.html',cp)).catch(()=>{});return res}).catch(()=>caches.match('./index.html')));return}e.respondWith(caches.match(r).then(x=>x||fetch(r)))});
