const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('../server.cjs');

(async()=>{
 const videoDir='/tmp/ministar-projectile-video';fs.mkdirSync(videoDir,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.MINISTAR_CHROMIUM||undefined}),server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,recordVideo:{dir:videoDir,size:{width:390,height:844}}});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   page.route(/\/assets\/sprites\/523_blue\.webp(?:\?.*)?$/,async route=>{await new Promise(resolve=>setTimeout(resolve,5500));await route.abort()});
   page.route(/\/assets\/sprites\/504_blue\.webp(?:\?.*)?$/,route=>route.abort());
   page.route('**/app.js?*',route=>{
    let source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
    source=source.replace('function drawProjectileFallback(visual,color,alpha){','function drawProjectileFallback(visual,color,alpha){window.__projectileFallbacks||=[];window.__projectileFallbacks.push(visual.image);');
    source=source.replace('function drawHydraContactFallback(visual){','function drawHydraContactFallback(visual){window.__projectileContactFallbacks=(window.__projectileContactFallbacks||0)+1;');
    source+='\nwindow.__projectileTest={get battle(){return battle},get camera(){return camera},get failedImages(){return [...failedImages.keys()]},fire(kind,distance=120,y=1120){const b=battle,type=kind===\'dragoon\'?66:38,a=b.create(type,0,640-distance/2,y),t=b.create(0,1,640+distance/2,y);t.order=\'move\';const w=b.weapon(a,t),before=t.hp;a.target=t;a.order=\'focus\';b.attack(a,t,w);for(let frame=0;frame<48&&!b.projectileVisuals.some(v=>v.sourceId===a.id);frame++)b.tickUnit(a,1/24);camera.x=640;camera.y=1120;camera.zoom=1.2;limitCamera();return{sourceId:a.id,targetId:t.id,visualId:b.projectileVisuals.find(v=>v.sourceId===a.id)?.id,hp:before,weapon:w.id}},probeFallbacks(){const b=battle;for(const image of [524,503])b.addProjectileVisual({x:600,y:1200,endX:620,y:1200,image,team:0});}};';
    source=source.replace('fire(kind,distance=120,y=1120){const b=battle,type=', 'fire(kind,distance=120,y=1120){const b=battle;b.paused=true;const type=');
    route.fulfill({contentType:'application/javascript',body:source});
   });
   const start=Date.now(),url='http://127.0.0.1:'+server.address().port+'/ministar/';
   await page.goto(url);await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();await page.locator('#spaceToggle').waitFor({state:'visible'});
   assert.ok(Date.now()-start<10000,'the delayed projectile image must not block startup');
   assert.equal(await page.evaluate(()=>window.__projectileTest.camera.zoom),1.2);

   const dragoon=await page.evaluate(()=>window.__projectileTest.fire('dragoon'));
   const dragoonFrames=await page.evaluate(async ({visualId,targetId})=>{
    const b=window.__projectileTest.battle,samples=[];
    for(let i=0;i<10;i++){b.step(1/24);await new Promise(requestAnimationFrame);const visual=b.projectileVisuals.find(v=>v.id===visualId);samples.push(visual?{x:visual.x,firstRendered:visual.firstRendered,age:visual.age}:null)}
    const target=b.units.find(u=>u.id===targetId);
    return{samples,hp:target?.hp,actualProjectiles:b.projectiles.length,visuals:b.projectileVisuals.length,failures:window.__projectileTest.failedImages,fallbacks:window.__projectileFallbacks||[]};
   },{visualId:dragoon.visualId,targetId:dragoon.targetId});
   assert.ok(dragoonFrames.samples.some(frame=>frame?.firstRendered),'the short flight survives until a frame is rendered');
   if(new Set(dragoonFrames.samples.filter(Boolean).map(frame=>frame.x)).size<=1)console.error('Projectile frame diagnostics:',dragoonFrames);
   assert.ok(new Set(dragoonFrames.samples.filter(Boolean).map(frame=>frame.x)).size>1,'successive frames show the projectile moving');
   assert.ok(dragoonFrames.hp<dragoon.hp,'the original projectile still applies its hit');
   assert.ok(dragoonFrames.fallbacks.includes(523),'the dragoon uses its directional fallback after the image timeout');
   await page.waitForFunction(()=>window.__projectileTest.failedImages.some(url=>url.includes('523_blue.webp')),null,{timeout:9000});
   assert.ok((await page.evaluate(()=>window.__projectileTest.failedImages)).some(url=>url.includes('523_blue.webp')),'the delayed URL is recorded as failed after the retry timeout');
   await page.screenshot({path:'/tmp/ministar-projectile-dragoon.png'});

   const hydra=await page.evaluate(()=>window.__projectileTest.fire('hydra',120,1160));
   const hydraFrames=await page.evaluate(async ({sourceId,targetId})=>{
    const b=window.__projectileTest.battle;await new Promise(requestAnimationFrame);
    const visuals=b.projectileVisuals.filter(v=>v.sourceId===sourceId);
    return{visuals:visuals.map(v=>({kind:v.kind,firstRendered:v.firstRendered,missed:v.missed})),contactFallbacks:window.__projectileContactFallbacks||0,failures:window.__projectileTest.failedImages,targetHp:b.units.find(u=>u.id===targetId)?.hp};
   },{sourceId:hydra.sourceId,targetId:hydra.targetId});
   assert.deepEqual(hydraFrames.visuals.map(v=>v.kind),['hitscan','contact']);
   assert.ok(hydraFrames.visuals.every(v=>v.firstRendered),'the sting and contact flash reach the first rendered frame');
   assert.ok(hydraFrames.contactFallbacks>0,'a missing 504 contact image uses its short green flash fallback');
   await page.waitForFunction(()=>window.__projectileTest.failedImages.some(url=>url.includes('504_blue.webp')),null,{timeout:2000});
   assert.ok((await page.evaluate(()=>window.__projectileTest.failedImages)).some(url=>url.includes('504_blue.webp')));
   assert.ok(hydraFrames.targetHp<hydra.hp,'Hydralisk damage remains immediate');
   await page.screenshot({path:'/tmp/ministar-projectile-hydra.png'});

   const fallbackProbes=await page.evaluate(async()=>{window.__projectileTest.probeFallbacks();await new Promise(requestAnimationFrame);return window.__projectileFallbacks||[]});
   assert.ok(fallbackProbes.includes(524),'a missing photon image uses the explicit orb fallback');
   assert.ok(fallbackProbes.includes(503),'the empty scarab atlas uses the explicit directional fallback');

   const delayed=await page.evaluate(()=>{
    const info=window.__projectileTest.fire('dragoon');window.__projectileTest.battle.simulateStep(.15);
    return{...info,visual:window.__projectileTest.battle.projectileVisuals.find(v=>v.id===info.visualId)};
   });
   assert.ok(delayed.visual&&!delayed.visual.firstRendered,'a 0.15-second simulation interval preserves the first draw');
   const longFrame=await page.evaluate(async id=>{const b=window.__projectileTest.battle;await new Promise(requestAnimationFrame);const visual=b.projectileVisuals.find(v=>v.id===id);return{firstRendered:visual?.firstRendered,actual:b.projectiles.filter(projectile=>projectile.visualId===id).length}},delayed.visualId);
   assert.equal(longFrame.firstRendered,true,'the delayed first frame is rendered before visual cleanup');
   assert.equal(longFrame.actual,0,'the real fast projectile is removed on its original impact schedule');
   await page.screenshot({path:'/tmp/ministar-projectile-delayed-frame.png'});

   await page.setViewportSize({width:768,height:900});
   assert.equal(await page.evaluate(()=>window.__projectileTest.camera.zoom),1.2);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:'/tmp/ministar-projectile-fold.png'});
   console.log('Cold-cache projectile frames passed at 390 × 844 and 768 × 900; failure fallbacks and 0.15-second first draw were recorded.');
  }finally{await context.close()}

  // A separate, unblocked context verifies original sprite rendering; the
  // failure-only context above cannot detect trails added beside good images.
  const healthy=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
   const page=await healthy.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    window.__originalProjectileDraws=[];
    const original=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image?.__ministarSource)window.__originalProjectileDraws.push(image.__ministarSource);return original.call(this,image,...args)};
   });
   await page.route('**/app.js?*',route=>{
    let source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
    assert.ok(!source.includes('drawProjectileTrail('),'general-purpose projectile canvas trails must not be restored');
    source=source.replace('function drawProjectileFallback(visual,color,alpha){','function drawProjectileFallback(visual,color,alpha){(window.__healthyFallbacks||=[]).push(visual.image);');
    source=source.replace('ctx.moveTo(hx-ux*head,hy-uy*head);', '(window.__stingSamples||=[]).push({head,progress,x:hx,y:hy});ctx.moveTo(hx-ux*head,hy-uy*head);');
    source+='\nwindow.__healthyProjectiles={get battle(){return battle},async ready(){const images=[523,504];const loaded=await Promise.all(images.map(id=>loadImage(data.graphics[id].images.blue)));return loaded.every(Boolean)},fire(type){const b=battle;b.paused=true;b.units=[];b.spatial=null;b.map.rocks=[];b.canSee=()=>true;b.botStep=()=>{};b.waveClock=1e8;b.projectiles=[];b.projectileVisuals=[];const a=b.create(type,0,560,1120),t=b.create(0,1,680,1120);t.order="move";t.hp=t.maxHp=30000;a.direction=8;a.motion.heading256=a.motion.velocityDirection256=a.motion.desiredDirection256=64;a.turretDirection256=64;const w=b.weapon(a,t);a.order="focus";a.target=t;if(!b.attack(a,t,w))throw Error("attack failed "+type);for(let i=0;i<24&&!b.projectileVisuals.some(v=>v.sourceId===a.id);i++)b.step(1/24);camera.x=640;camera.y=1120;camera.zoom=1.2;limitCamera();window.__originalProjectileDraws=[];window.__stingSamples=[];window.__healthyFallbacks=[];return{attackerId:a.id,baselineHp:30000,visuals:b.projectileVisuals.map(v=>({kind:v.kind,image:v.image,age:v.age,visualAge:v.visualAge,firstRendered:v.firstRendered}))}},advance(){battle.step(1/24);return{visuals:battle.projectileVisuals.map(v=>({kind:v.kind,visualAge:v.visualAge,firstRendered:v.firstRendered})),targetHp:battle.units.find(u=>u.team===1)?.hp}},get draws(){return window.__originalProjectileDraws},get sting(){return window.__stingSamples},get fallbacks(){return window.__healthyFallbacks}};';
    route.fulfill({contentType:'application/javascript',body:source});
   });
   await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');
   await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();await page.locator('#spaceToggle').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.__healthyProjectiles.ready()),true,'the original 523 and 504 sprites preload successfully');

   const originalDragoon=await page.evaluate(()=>window.__healthyProjectiles.fire(66));
   assert.equal(originalDragoon.visuals[0]?.image,523);
   const dragoonSamples=[];
   for(let i=0;i<12;i++)dragoonSamples.push(await page.evaluate(async()=>{const state=window.__healthyProjectiles.advance();await new Promise(requestAnimationFrame);return{...state,draws:window.__healthyProjectiles.draws.filter(url=>url.includes('523_blue.webp')).length,fallbacks:window.__healthyProjectiles.fallbacks.slice()}}));
   assert.ok(dragoonSamples.some(sample=>sample.draws>0),'the loaded original Dragoon sprite is actually drawn by Canvas');
   assert.ok(!dragoonSamples.some(sample=>sample.fallbacks.includes(523)),'the loaded Dragoon sprite has no extra fallback shape');
   assert.ok(dragoonSamples.at(-1).targetHp<originalDragoon.baselineHp,'the original impact still deals damage');
   await page.screenshot({path:'/tmp/ministar-projectile-original-390.png'});

   const hydra=await page.evaluate(()=>window.__healthyProjectiles.fire(38));
   assert.deepEqual(hydra.visuals.map(v=>v.kind),['hitscan','contact']);
   assert.ok(hydra.visuals.every(v=>!v.firstRendered));
   assert.ok((await page.evaluate(()=>window.__healthyProjectiles.battle.units.find(u=>u.team===1).hp))<hydra.baselineHp,'the Hydralisk hit is resolved at the script event');
   await page.evaluate(()=>{const b=window.__healthyProjectiles.battle;for(let i=0;i<8;i++)b.tickProjectileVisuals(1/24)});
   const hydraFirst=await page.evaluate(async()=>{await new Promise(requestAnimationFrame);return{sting:window.__healthyProjectiles.sting.slice(),draws:window.__healthyProjectiles.draws.slice(),visuals:window.__healthyProjectiles.battle.projectileVisuals.map(v=>({kind:v.kind,firstRendered:v.firstRendered,visualAge:v.visualAge}))}});
   assert.ok(hydraFirst.sting.some(sting=>sting.head>0&&sting.head<=6&&sting.progress<=.025),'delayed first render starts a single short sting at the source');
   assert.ok(hydraFirst.draws.some(url=>url.includes('504_blue.webp')),'504 renders only as the original contact sprite');
   assert.ok(hydraFirst.visuals.every(v=>v.firstRendered));
   for(let i=0;i<4;i++)await page.evaluate(async()=>{window.__healthyProjectiles.advance();await new Promise(requestAnimationFrame)});
   assert.ok((await page.evaluate(()=>window.__healthyProjectiles.sting)).every(sting=>sting.head<=6),'sting lines have no secondary tail');
   await page.screenshot({path:'/tmp/ministar-projectile-hydra-original-390.png'});
   await page.setViewportSize({width:768,height:900});
   const foldShot=await page.evaluate(()=>window.__healthyProjectiles.fire(66));
   assert.equal(foldShot.visuals[0].image,523);
   for(let i=0;i<5;i++)await page.evaluate(async()=>{window.__healthyProjectiles.advance();await new Promise(requestAnimationFrame)});
   assert.ok((await page.evaluate(()=>window.__healthyProjectiles.draws)).some(url=>url.includes('523_blue.webp')),'768px viewport draws source sprite');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:'/tmp/ministar-projectile-original-768.png'});
   console.log('Loaded original Dragoon/Hydra sprites, short no-tail sting and contact 504 passed at 390x844 and 768x900.');
  }finally{await healthy.close()}
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
