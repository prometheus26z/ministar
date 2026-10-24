const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../server.cjs');
async function testLegacyMigration(browser){
 const legacyHtml='<h1 id="legacy">v0.1.1</h1><script>navigator.serviceWorker.register("./sw.js")</script>';
 const legacyWorker="self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));";
 const server=createServer(),serve=server.listeners('request')[0];let legacy=true;
 server.removeAllListeners('request');server.on('request',(req,res)=>{
  const path=req.url.split('?')[0];
  if(legacy&&(path==='/ministar/'||path==='/ministar/sw.js')){res.writeHead(200,{'Content-Type':path.endsWith('.js')?'application/javascript':'text/html','Cache-Control':'no-store'});res.end(path.endsWith('.js')?legacyWorker:legacyHtml)}else serve(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const context=await browser.newContext();
 try{
  const page=await context.newPage(),url='http://127.0.0.1:'+server.address().port+'/ministar/';
  await page.goto(url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(async html=>{
   localStorage.setItem('ministar.records','[{"win":true}]');
   await (await caches.open('ministar-pages-v0.1.1')).put(location.href,new Response(html,{headers:{'Content-Type':'text/html'}}));
   await caches.open('other-app-cache');
  },legacyHtml);
  await page.reload();assert.equal(await page.locator('#legacy').innerText(),'v0.1.1');
  legacy=false;await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});
  await page.locator('#title').waitFor({state:'visible'});
  assert.equal(await page.locator('.top small').innerText(),'v0.1.3');
  assert.equal(await page.locator('#offline').count(),0);
  assert.equal(new URL(page.url()).searchParams.get('v'),'0.1.3');
  assert.deepEqual(await page.evaluate(async()=>(await caches.keys()).sort()),['other-app-cache']);
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ministar.records')),'[{"win":true}]');
 }finally{await context.close();await new Promise(r=>server.close(r))}
}
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true});await testLegacyMigration(browser);const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url())});await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});// Every select uses an overlay: no Android picker, layout shift or viewport overflow.
for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
 await page.setViewportSize(viewport);
 await page.locator('#difficultyTrigger').scrollIntoViewIfNeeded();
 const before=await page.locator('#deploy').boundingBox();
 await page.locator('#difficultyTrigger').click();
 await page.getByRole('listbox').waitFor({state:'visible'});
 const after=await page.locator('#deploy').boundingBox(),box=await page.getByRole('listbox').boundingBox();
 assert.equal(before.y,after.y);assert.equal(before.height,after.height);
 assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);
 assert.equal(await page.locator('select:visible').count(),0);
 await page.getByRole('option',{name:'어려움 · 강화 방어선'}).click();
 assert.equal(await page.locator('#difficulty').inputValue(),'hard');
 assert.equal(await page.getByRole('listbox').count(),0);
 await page.locator('#difficultyTrigger').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#difficultyTrigger').getAttribute('aria-expanded'),'false');
}
await page.setViewportSize({width:390,height:844});
await page.locator('#difficultyTrigger').click();await page.keyboard.press('Home');await page.keyboard.press('Enter');
assert.equal(await page.locator('#difficulty').inputValue(),'easy');
await page.locator('button[data-race=zerg]').click();assert.equal(await page.locator('button[data-race=zerg]').getAttribute('aria-pressed'),'true');
await page.locator('button[data-race=terran]').click();
await page.screenshot({path:'/tmp/ministar-title.png',fullPage:true});
await page.locator('#deploy').click();await page.locator('#settings').click();
await page.locator('#qualityTrigger').click();await page.getByRole('option',{name:'절전 · 낮은 해상도'}).click();
assert.equal(await page.locator('#quality').inputValue(),'low');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ministar.settings')).quality),'low');
await page.locator('#qualityTrigger').click();await page.locator('#modal h2').click();assert.equal(await page.getByRole('listbox').count(),0);
await page.locator('#closeModal').click();
await page.locator('#recommend').click();await page.locator('#ready').click();await page.locator('#selectAll').click();await page.locator('#commandButton').click();await page.locator('#commands').waitFor({state:'visible'});assert.equal(await page.locator('#slow').isVisible(),true);await page.getByRole('button',{name:'홀드',exact:true}).click();assert.equal(await page.locator('#slow').isVisible(),false);assert.equal(await page.locator('#offline').count(),0);assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);assert.deepEqual(errors,[]);console.log('390 × 844: deployment, command slow mode, cancellation, custom dropdowns, online startup and legacy cache migration passed.')}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
