const CACHE='aurora-meu-controle-financeiro-cache-v51';
const LEGACY_CACHE='aurora-cache-v48';
const SUPABASE_LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0';
const SHELL=['./','./index.html','./debt.js?v=53','./pagination.js?v=1','./offline-queue.js?v=1','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'];

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL);
  try{
   const response=await fetch(SUPABASE_LIB,{mode:'cors',cache:'reload'});
   if(response.ok)await cache.put(SUPABASE_LIB,response.clone());
  }catch(error){console.warn('Supabase JS ainda não foi armazenado para uso offline:',error)}
 })());
});

self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key===LEGACY_CACHE||key.startsWith('aurora-meu-controle-financeiro-cache-')).filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET')return;

 if(request.mode==='navigate'){
  const refresh=(async()=>{
   const cache=await caches.open(CACHE);
   try{const response=await fetch(request);if(response.ok)await cache.put('./index.html',response.clone())}
   catch(error){/* A cópia em cache continua disponível. */}
  })();
  event.waitUntil(refresh);
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE),cached=await cache.match('./index.html');
   if(cached)return cached;
   try{return await fetch(request)}catch(_){return Response.error()}
  })());
  return;
 }

 const isSupabaseLibrary=url.href===SUPABASE_LIB;
 if(url.origin!==self.location.origin&&!isSupabaseLibrary)return;

 const refresh=(async()=>{
  const cache=await caches.open(CACHE);
  try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone())}
  catch(error){/* A cópia em cache continua disponível. */}
 })();
 event.waitUntil(refresh);
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=await cache.match(request);
  if(cached)return cached;
  try{return await fetch(request)}catch(_){return Response.error()}
 })());
});
