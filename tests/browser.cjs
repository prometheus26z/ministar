const fs=require('node:fs');const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../server.cjs');
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
  legacy=false;if(direct)await page.goto(url+'?v=0.12.0');else await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});
  await page.locator('#title').waitFor({state:'visible'});
  assert.equal(await page.locator('.top small').innerText(),'v0.12.0');
  assert.equal(await page.locator('#offline').count(),0);
  assert.equal(new URL(page.url()).searchParams.get('v'),'0.12.0');
  assert.deepEqual(await page.evaluate(async()=>(await caches.keys()).sort()),['other-app-cache']);
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ministar.records')),'[{"win":true}]');
 }finally{await context.close();await new Promise(r=>server.close(r))}
}
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true});await testLegacyMigration(browser);await testLegacyMigration(browser,true);const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url())});await page.addInitScript(()=>{window.__spriteDraws=new Set();const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image?.src)window.__spriteDraws.add(image.src);return draw.call(this,image,...args)}});await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8')+'\nwindow.__visualTest={get battle(){return battle}};'}));await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});// Every select uses an overlay: no Android picker, layout shift or viewport overflow.
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
assert.equal(await page.locator('#unitName').innerText(),'');
assert.ok(Number(await page.locator('#money').innerText())>=300);assert.equal(await page.locator('#gas').isVisible(),false);assert.match(await page.locator('#incomeStatus').innerText(),/1.34초/);
assert.equal(await page.locator('#slow').isVisible(),false);await page.waitForFunction(()=>[...window.__spriteDraws].some(url=>url.includes('turret-assets/297-')));
await page.locator('#spaceToggle').click();
const productionToggle=await page.locator('#spaceToggle').boundingBox();
assert.equal(productionToggle.x,390-productionToggle.width);
await page.locator('#productionButton').click();await page.locator('#commands').waitFor({state:'visible'});
assert.equal(await page.locator('#commandTitle').innerText(),'출격 현황');
assert.equal(await page.locator('#commandGrid').innerText(),'');
assert.equal(await page.locator('#commandGrid button').count(),0);
assert.equal(await page.getByText('적 생산 구역').count(),0);
assert.equal(await page.locator('#slow').isVisible(),false);
await page.locator('#closeCommands').click();
await page.locator('#commandButton').click();await page.locator('#commands').waitFor({state:'visible'});
await page.waitForFunction(()=>Number(document.getElementById('money').textContent)>=330);const barracks=page.getByRole('button',{name:/배럭 건설/});await page.waitForFunction(()=>[...document.querySelectorAll('.command-card')].some(b=>b.textContent.includes('배럭')&&!b.disabled));assert.equal(await barracks.isDisabled(),false);assert.match(await barracks.innerText(),/330 미네랄/);assert.doesNotMatch(await barracks.innerText(),/●/);
assert.match(await barracks.innerText(),/마린 6기/);assert.doesNotMatch(await barracks.innerText(),/3초/);assert.match(await page.getByRole('button',{name:/아카데미 건설/}).innerText(),/파이어뱃 1기.*메딕 1기/);
await barracks.click();assert.equal(await page.locator('#target').isVisible(),true);
assert.match(await page.locator('#targetText').innerText(),/배럭/);
assert.equal(await page.locator('#confirmBuild').isDisabled(),true);
await page.locator('#field').click({position:{x:195,y:400}});
assert.equal(await page.locator('#confirmBuild').isDisabled(),false);
const beforeBuild=Number(await page.locator('#money').innerText());await page.locator('#confirmBuild').click();assert.equal(await page.locator('#target').isVisible(),false);const afterBuild=Number(await page.locator('#money').innerText());assert.ok(afterBuild>=beforeBuild-330&&afterBuild<=beforeBuild-320);
await page.keyboard.press('Space');
const initialConstruction=await page.locator('#field').screenshot();
await page.keyboard.press('Space');await page.waitForTimeout(950);await page.keyboard.press('Space');
const middleConstruction=await page.locator('#field').screenshot();
assert.notDeepEqual(initialConstruction,middleConstruction,'construction must visibly advance beyond the first original building frame');
await page.keyboard.press('Space');await page.waitForTimeout(2100);await page.keyboard.press('Space');
const finishedConstruction=await page.locator('#field').screenshot();
assert.notDeepEqual(middleConstruction,finishedConstruction,'completion must replace the construction frames with the finished building');
await page.keyboard.press('Space');
await page.locator('#spaceToggle').click();
assert.equal((await page.locator('#spaceToggle').boundingBox()).x,0);
assert.equal(await page.locator('#productionButton').isDisabled(),false);
await page.locator('#productionButton').click();await page.locator('#commands').waitFor({state:'visible'});
assert.match(await page.locator('#commandGrid').innerText(),/마린/);assert.match(await page.locator('#commandGrid').innerText(),/6기/);
await page.locator('#closeCommands').click();
await page.locator('#map').click();const minimap=page.locator('#minimap'),miniBox=await minimap.boundingBox();
await minimap.click({position:{x:miniBox.width/2,y:1}});await page.locator('#map').click();
await page.locator('#field').click({position:{x:195,y:159}});await page.waitForTimeout(100);
assert.equal(await page.locator('#unitName').innerText(),'커맨드 센터');
assert.doesNotMatch(await page.locator('#toast').innerText(),/HP/);assert.equal(await page.locator('.vitals').isVisible(),true);assert.ok((await page.locator('#hp').innerText()).startsWith('HP '));assert.match(await page.locator('#groundAttack').innerText(),/지상/);assert.match(await page.locator('#armor').innerText(),/방어/);
const enemyHealth=await page.evaluate(()=>{const b=window.__visualTest.battle,u=b.units.find(u=>u.team===1&&u.alive&&!u.hidden&&!u.loaded);b.inspect(u);return `HP ${Math.ceil(u.hp)}/${Math.ceil(u.maxHp||u.def.hp)}`});await page.waitForFunction(expected=>document.getElementById('hp').textContent===expected,enemyHealth);assert.ok((await page.locator('#hp').innerText()).startsWith('HP '));assert.match(await page.locator('#groundAttack').innerText(),/지상/);assert.match(await page.locator('#armor').innerText(),/방어/);
const damagedEnemyHealth=await page.evaluate(()=>{const b=window.__visualTest.battle,u=b.inspectedUnit;u.hp=Math.max(1,u.hp-37);return `HP ${Math.ceil(u.hp)}/${Math.ceil(u.maxHp||u.def.hp)}`});await page.waitForFunction(expected=>document.getElementById('hp').textContent===expected,damagedEnemyHealth);

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
await page.locator('#baseView').click();
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);const layout=await page.locator('#panel').evaluate(el=>({height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth,buttons:[...el.querySelectorAll('.panel-main>button')].map(b=>({left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right}))}));assert.equal(layout.overflow,false);assert.ok(layout.height<=140);assert.ok(layout.buttons.every(b=>b.left>=0&&b.right<=viewport.width));}
await page.setViewportSize({width:390,height:844});await page.locator('#baseView').click();await page.screenshot({path:'/tmp/ministar-hud.png',fullPage:true});
await page.evaluate(()=>{const b=window.__visualTest.battle;b.die(b.outpostDefenses[0][0],1)});
await page.waitForFunction(()=>[...window.__spriteDraws].some(url=>url.includes('destruction-assets/334-'))&&[...window.__spriteDraws].some(url=>url.includes('destruction-assets/335-')));
await page.screenshot({path:'/tmp/ministar-building-explosion.png',fullPage:true});await page.waitForTimeout(1300);
assert.ok(await page.evaluate(()=>window.__visualTest.battle.wrecks.length>0));await page.screenshot({path:'/tmp/ministar-building-rubble.png',fullPage:true});
assert.equal(await page.locator('#offline').count(),0);assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);assert.deepEqual(errors,[]);console.log('390 × 844: empty production setup, fixed wave status, building placement, background pause, custom dropdowns and legacy cache migration passed.')}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});


