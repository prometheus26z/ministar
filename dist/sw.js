// One-time migration for installed v0.1.1/v0.1.2/v0.2.0 clients. No fetch handler or offline cache.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await self.clients.claim();
 await Promise.all((await caches.keys()).filter(key=>key.startsWith('ministar-')).map(key=>caches.delete(key)));
 await self.registration.unregister();
 const scope=new URL(self.registration.scope);
 for(const client of await self.clients.matchAll({type:'window'})){
  const url=new URL(client.url);
  if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname)){
   url.searchParams.set('v','0.6.0');
   await client.navigate(url.href);
  }
 }
})()));

