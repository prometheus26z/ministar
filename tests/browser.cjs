const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../server.cjs');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url())});await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});// Every select uses an overlay: no Android picker, layout shift or viewport overflow.
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
await page.locator('[data-race=zerg]').click();assert.equal(await page.locator('[data-race=zerg]').getAttribute('aria-pressed'),'true');
await page.locator('[data-race=terran]').click();
await page.screenshot({path:'/tmp/ministar-title.png',fullPage:true});
await page.locator('#deploy').click();await page.locator('#settings').click();
await page.locator('#qualityTrigger').click();await page.getByRole('option',{name:'절전 · 낮은 해상도'}).click();
assert.equal(await page.locator('#quality').inputValue(),'low');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ministar.settings')).quality),'low');
await page.locator('#qualityTrigger').click();await page.locator('#modal h2').click();assert.equal(await page.getByRole('listbox').count(),0);
await page.locator('#closeModal').click();
await page.locator('#recommend').click();await page.locator('#ready').click();await page.locator('#selectAll').click();await page.locator('#commandButton').click();await page.locator('#commands').waitFor({state:'visible'});assert.equal(await page.locator('#slow').isVisible(),true);await page.getByRole('button',{name:'홀드',exact:true}).click();assert.equal(await page.locator('#slow').isVisible(),false);const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.ok(scope.endsWith('/ministar/'));await page.evaluate(async()=>{await navigator.serviceWorker.ready;document.querySelector('#offline').click()});await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent.includes('오프라인 준비 완료'),{},{timeout:120000});await page.context().setOffline(true);await page.reload();await page.locator('#title').waitFor({state:'visible'});await page.context().setOffline(false);assert.deepEqual(errors,[]);console.log('390 × 844: deployment, command slow mode, cancellation, project-relative SW and fully cached offline reload passed.')}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
