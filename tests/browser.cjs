const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../server.cjs');
async function testLegacyMigration(browser,direct=false){
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
  legacy=false;if(direct)await page.goto(url+'?v=0.5.0');else await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});
  await page.locator('#title').waitFor({state:'visible'});
  assert.equal(await page.locator('.top small').innerText(),'v0.5.0');
  assert.equal(await page.locator('#offline').count(),0);
  assert.equal(new URL(page.url()).searchParams.get('v'),'0.5.0');
  assert.deepEqual(await page.evaluate(async()=>(await caches.keys()).sort()),['other-app-cache']);
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ministar.records')),'[{"win":true}]');
 }finally{await context.close();await new Promise(r=>server.close(r))}
}
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true});await testLegacyMigration(browser);await testLegacyMigration(browser,true);const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url())});await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});// Every select uses an overlay: no Android picker, layout shift or viewport overflow.
for(const viewport of [{width:405,height:594},{width:390,height:600},{width:360,height:640},{width:412,height:740},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
 await page.setViewportSize(viewport);
 if(viewport.height>viewport.width){
  const landing=await page.locator('#title').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,bottom:document.querySelector('.title-links').getBoundingClientRect().bottom}));
  assert.ok(landing.content<=landing.height+1,JSON.stringify({viewport,landing}));
  assert.ok(landing.bottom<=viewport.height,JSON.stringify({viewport,landing}));
 }
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
await page.locator('#deploy').click();
assert.equal(await page.locator('#shop').count(),0);assert.equal(await page.locator('#prep').count(),0);
assert.equal(await page.locator('#unitName').innerText(),'자동 전선');
assert.equal(await page.locator('#money').innerText(),'600');
assert.equal(await page.locator('#slow').isVisible(),false);
await page.locator('#spaceToggle').click();
assert.equal((await page.locator('#spaceToggle').boundingBox()).x,0);
await page.locator('#productionButton').click();await page.locator('#commands').waitFor({state:'visible'});
assert.equal(await page.locator('#commandTitle').innerText(),'출격 현황');
assert.match(await page.locator('#commandGrid').innerText(),/완성된 출격 생산 건물이 없습니다/);
assert.equal(await page.locator('#commandGrid button').count(),0);
assert.equal(await page.getByText('적 생산 구역').count(),0);
assert.equal(await page.locator('#slow').isVisible(),false);
await page.locator('#closeCommands').click();
await page.locator('#commandButton').click();await page.locator('#commands').waitFor({state:'visible'});
const barracks=page.getByRole('button',{name:/배럭 건설/});assert.equal(await barracks.isDisabled(),false);
assert.match(await barracks.innerText(),/3초/);
await barracks.click();assert.equal(await page.locator('#target').isVisible(),true);
assert.match(await page.locator('#targetText').innerText(),/배럭/);
await page.locator('#cancel').click();assert.equal(await page.locator('#target').isVisible(),false);
await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
await page.locator('#backgroundPause').waitFor({state:'visible'});
assert.equal(await page.locator('#phase').innerText(),'PAUSED');
await page.locator('#resumeBattle').click();
assert.equal(await page.locator('#backgroundPause').isVisible(),false);
await page.locator('#settings').click();
await page.locator('#qualityTrigger').click();await page.getByRole('option',{name:'절전 · 낮은 해상도'}).click();
assert.equal(await page.locator('#quality').inputValue(),'low');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ministar.settings')).quality),'low');
await page.locator('#qualityTrigger').click();await page.locator('#modal h2').click();assert.equal(await page.getByRole('listbox').count(),0);
await page.locator('#closeModal').click();
assert.equal(await page.locator('#offline').count(),0);assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);assert.deepEqual(errors,[]);console.log('390 × 844: empty production setup, fixed wave status, building placement, background pause, custom dropdowns and legacy cache migration passed.')}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});


