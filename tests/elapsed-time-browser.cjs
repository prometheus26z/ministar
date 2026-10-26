const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createServer}=require('../server.cjs');

(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+': '+response.url())});
  await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+'\nwindow.__elapsedTest={get battle(){return battle},refresh(){hudUI()}};'}));
  const url='http://127.0.0.1:'+server.address().port+'/ministar/';await page.goto(url);await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();await page.locator('#hud').waitFor({state:'visible'});
  assert.equal(await page.locator('#elapsedClock').innerText(),'00:00','a new game starts at zero');
  await page.waitForFunction(()=>document.querySelector('#elapsedClock').textContent!=='00:00',null,{timeout:5000});
  await page.locator('#settings').click();await page.locator('#pause').click();
  const pausedTime=await page.locator('#elapsedClock').innerText();await page.waitForTimeout(1100);assert.equal(await page.locator('#elapsedClock').innerText(),pausedTime,'pause freezes elapsed game time');
  await page.locator('#settings').click();assert.equal(await page.locator('#pause').innerText(),'전투 재개');await page.locator('#pause').click();
  await page.waitForFunction(value=>document.querySelector('#elapsedClock').textContent!==value,pausedTime,{timeout:5000});
  await page.locator('#settings').click();await page.locator('#pause').click();
  for(const [seconds,expected]of [[3600,'60:00'],[6000,'100:00']]){
   await page.evaluate(value=>{window.__elapsedTest.battle.time=value;window.__elapsedTest.refresh()},seconds);assert.equal(await page.locator('#elapsedClock').innerText(),expected);
  }
  for(const width of [320,360,390,840]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const boxes=await page.evaluate(()=>{const left=document.querySelector('.hud-timers').getBoundingClientRect(),right=document.querySelector('.resources').getBoundingClientRect(),hud=document.querySelector('#hud').getBoundingClientRect();return{left:rightRect(left),right:rightRect(right),hudWidth:hud.width,elapsedScroll:document.querySelector('#elapsedClock').scrollWidth,elapsedClient:document.querySelector('#elapsedClock').clientWidth};function rightRect(rect){return{left:rect.left,right:rect.right}}});
   assert.ok(boxes.left.right<=boxes.right.left+1,`${width}px header timers must not overlap the resource counters: ${JSON.stringify(boxes)}`);
   assert.ok(boxes.right.right<=boxes.hudWidth+1,`${width}px resource counters must remain on-screen: ${JSON.stringify(boxes)}`);
   assert.ok(boxes.elapsedScroll<=boxes.elapsedClient+1,`${width}px elapsed time must not clip: ${JSON.stringify(boxes)}`);
  }
  await page.screenshot({path:'/tmp/ministar-elapsed-time-mobile.png'});assert.deepEqual(errors,[]);
  console.log('Elapsed time start, pause/resume, long-game formatting and 320/360/390/840px HUD layout passed.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
