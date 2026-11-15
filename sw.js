const CACHE='aurora-cache-v47';
const SUPABASE_LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0';
const SHELL=['./','./index.html','./debt.js?v=53','./manifest.webmanifest','./icons/icon.svg'];

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
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET')return;

 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match('./index.html');
   const update=fetch(request).then(response=>{
    if(response.ok)cache.put('./index.html',response.clone());
    return response;
   });
   if(cached){event.waitUntil(update.catch(()=>{}));return cached}
   try{return await update}catch(_){return Response.error()}
  })());
  return;
 }

 const isSupabaseLibrary=url.href===SUPABASE_LIB;
 if(url.origin!==self.location.origin&&!isSupabaseLibrary)return;

 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  const update=fetch(request).then(response=>{
   if(response.ok)cache.put(request,response.clone());
   return response;
  });
  if(cached){event.waitUntil(update.catch(()=>{}));return cached}
  try{return await update}catch(_){return Response.error()}
 })());
});
