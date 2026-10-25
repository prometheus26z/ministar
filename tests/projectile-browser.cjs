const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('../server.cjs');

(async()=>{
 const videoDir='/tmp/ministar-projectile-video';fs.mkdirSync(videoDir,{recursive:true});
 const browser=await chromium.launch({headless:true}),server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,recordVideo:{dir:videoDir,size:{width:390,height:844}}});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   page.route('**/assets/sprites/523_blue.webp',async route=>{await new Promise(resolve=>setTimeout(resolve,5500));await route.abort()});
   page.route('**/assets/sprites/504_blue.webp',route=>route.abort());
   page.route('**/app.js?*',route=>{
    let source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
    source=source.replace('function drawProjectileFallback(visual,color,alpha){','function drawProjectileFallback(visual,color,alpha){window.__projectileFallbacks||=[];window.__projectileFallbacks.push(visual.image);');
    source=source.replace('function drawHydraContactFallback(visual){','function drawHydraContactFallback(visual){window.__projectileContactFallbacks=(window.__projectileContactFallbacks||0)+1;');
    source+='\nwindow.__projectileTest={get battle(){return battle},get camera(){return camera},get failedImages(){return [...failedImages.keys()]},fire(kind,distance=120,y=1120){const b=battle,type=kind===\'dragoon\'?66:38,a=b.create(type,0,640-distance/2,y),t=b.create(0,1,640+distance/2,y);t.order=\'move\';const w=b.weapon(a,t),before=t.hp;b.attack(a,t,w);camera.x=640;camera.y=1120;camera.zoom=1.2;limitCamera();return{sourceId:a.id,targetId:t.id,visualId:b.projectileVisuals.find(v=>v.sourceId===a.id)?.id,hp:before,weapon:w.id}},probeFallbacks(){const b=battle;for(const image of [524,503])b.addProjectileVisual({x:600,y:1200,endX:620,y:1200,image,team:0});}};';
    route.fulfill({contentType:'application/javascript',body:source});
   });
   const start=Date.now(),url='http://127.0.0.1:'+server.address().port+'/ministar/';
   await page.goto(url);await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();await page.locator('#spaceToggle').waitFor({state:'visible'});
   assert.ok(Date.now()-start<10000,'the delayed projectile image must not block startup');
   assert.equal(await page.evaluate(()=>window.__projectileTest.camera.zoom),1.2);

   const dragoon=await page.evaluate(()=>window.__projectileTest.fire('dragoon'));
   const dragoonFrames=await page.evaluate(async ({visualId,targetId})=>{
    const b=window.__projectileTest.battle,samples=[];
    for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);const visual=b.projectileVisuals.find(v=>v.id===visualId);samples.push(visual?{x:visual.x,firstRendered:visual.firstRendered,age:visual.age}:null)}
    const target=b.units.find(u=>u.id===targetId);
    return{samples,hp:target?.hp,actualProjectiles:b.projectiles.length,visuals:b.projectileVisuals.length,failures:window.__projectileTest.failedImages,fallbacks:window.__projectileFallbacks||[]};
   },{visualId:dragoon.visualId,targetId:dragoon.targetId});
   assert.ok(dragoonFrames.samples.some(frame=>frame?.firstRendered),'the short flight survives until a frame is rendered');
   assert.ok(new Set(dragoonFrames.samples.filter(Boolean).map(frame=>frame.x)).size>1,'successive frames show the projectile moving');
   assert.ok(dragoonFrames.hp<dragoon.hp,'the original projectile still applies its hit');
   assert.ok(dragoonFrames.failures.some(url=>url.includes('523_blue.webp')),'the delayed URL is recorded as failed after the timeout');
   assert.ok(dragoonFrames.fallbacks.includes(523),'the dragoon uses its directional fallback after the image timeout');
   await page.screenshot({path:'/tmp/ministar-projectile-dragoon.png'});

   const hydra=await page.evaluate(()=>window.__projectileTest.fire('hydra',120,1160));
   const hydraFrames=await page.evaluate(async id=>{
    const b=window.__projectileTest.battle;await new Promise(requestAnimationFrame);
    const visuals=b.projectileVisuals.filter(v=>v.sourceId===id||v.targetId===id);
    return{visuals:visuals.map(v=>({kind:v.kind,firstRendered:v.firstRendered,missed:v.missed})),contactFallbacks:window.__projectileContactFallbacks||0,failures:window.__projectileTest.failedImages,targetHp:b.units.find(u=>u.id===id)?.hp};
   },hydra.targetId);
   assert.deepEqual(hydraFrames.visuals.map(v=>v.kind),['hitscan','contact']);
   assert.ok(hydraFrames.visuals.every(v=>v.firstRendered),'the sting and contact flash reach the first rendered frame');
   assert.ok(hydraFrames.contactFallbacks>0,'a missing 504 contact image uses its short green flash fallback');
   assert.ok(hydraFrames.failures.some(url=>url.includes('504_blue.webp')));
   assert.ok(hydraFrames.targetHp<hydra.hp,'Hydralisk damage remains immediate');
   await page.screenshot({path:'/tmp/ministar-projectile-hydra.png'});

   const fallbackProbes=await page.evaluate(async()=>{window.__projectileTest.probeFallbacks();await new Promise(requestAnimationFrame);return window.__projectileFallbacks||[]});
   assert.ok(fallbackProbes.includes(524),'a missing photon image uses the explicit orb fallback');
   assert.ok(fallbackProbes.includes(503),'the empty scarab atlas uses the explicit directional fallback');

   const delayed=await page.evaluate(()=>{
    const info=window.__projectileTest.fire('dragoon');window.__projectileTest.battle.update(.15);
    return{...info,visual:window.__projectileTest.battle.projectileVisuals.find(v=>v.id===info.visualId)};
   });
   assert.ok(delayed.visual&&!delayed.visual.firstRendered,'a 0.15-second simulation interval preserves the first draw');
   const longFrame=await page.evaluate(async id=>{const b=window.__projectileTest.battle;await new Promise(requestAnimationFrame);const visual=b.projectileVisuals.find(v=>v.id===id);return{firstRendered:visual?.firstRendered,actual:b.projectiles.length}},delayed.visualId);
   assert.equal(longFrame.firstRendered,true,'the delayed first frame is rendered before visual cleanup');
   assert.equal(longFrame.actual,0,'the real fast projectile is removed on its original impact schedule');
   await page.screenshot({path:'/tmp/ministar-projectile-delayed-frame.png'});

   await page.setViewportSize({width:768,height:900});
   assert.equal(await page.evaluate(()=>window.__projectileTest.camera.zoom),1.2);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:'/tmp/ministar-projectile-fold.png'});
   console.log('Cold-cache projectile frames passed at 390 × 844 and 768 × 900; failure fallbacks and 0.15-second first draw were recorded.');
  }finally{await context.close()}
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
