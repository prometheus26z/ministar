const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('../server.cjs');

(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.MINISTAR_CHROMIUM||undefined});
 try{
  for(const viewport of [{width:390,height:844},{width:768,height:900}]){
   const page=await browser.newPage({viewport,isMobile:viewport.width===390,hasTouch:viewport.width===390}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/app.js?*',route=>{
    let source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
    source=source.replace('const bodyPose=g&&!u.construction&&!u.egg?pose(g,drawAction,drawTime,u.direction,visual):null;',
     'const bodyPose=g&&!u.construction&&!u.egg?pose(g,drawAction,drawTime,u.direction,visual):null;'+
     'if(u.id===window.__walkingId&&bodyPose){(window.__walkingFrames||=[]).push({id:u.id,x:u.x,action:drawAction,frame:bodyPose.frame,override:visual.trackOverride,track:trackFor(g,drawAction,visual)===g.tracks.walk?"walk":"other",animTime:u.animTime});}');
    source+='\nwindow.__walkBrowser={get battle(){return battle},get data(){return data},async preload(ids){return Promise.all(ids.map(id=>loadImage(data.graphics[id]?.images?.blue)))},prepare(type){const b=battle;b.paused=true;b.units=[];b.nextId=1000+type;b.spatial=null;b.map.rocks=[];b.map.blocked=()=>false;b.canSee=()=>true;b.botStep=()=>{};b.waveClock=1e8;const a=b.create(type,0,560,1120),t=b.create(0,1,585,1120);t.order="move";t.hp=t.maxHp=30000;a.order="focus";a.target=t;a.direction=8;a.motion.heading256=a.motion.velocityDirection256=a.motion.desiredDirection256=64;a.turretDirection256=64;const w=b.weapon(a,t);t.x=a.x+a.r+t.r+Math.max(8,w.range-12);if(!b.attack(a,t,w))throw Error("Could not start attack "+type);for(let i=0;i<300;i++){b.step(1/24);if(a.attackGeneration>=2&&a.attackVisualTrack&&!a.attackControl)break;}if(!a.attackVisualTrack)throw Error("No repeat track for "+type);const repeatTrack=a.attackVisualTrack;t.x+=280;window.__walkingId=a.id;window.__walkingFrames=[];camera.x=640;camera.y=1120;camera.zoom=1.2;limitCamera();return{unitId:a.id,repeatTrack,image:a.def.image}},advance(){const a=battle.units.find(u=>u.id===window.__walkingId);battle.step(1/24);return{action:a.action,x:a.x,animTime:a.animTime,attackVisualTrack:a.attackVisualTrack}},get frames(){return window.__walkingFrames||[]}};';
    route.fulfill({contentType:'application/javascript',body:source});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/ministar/`);
   await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();await page.locator('#spaceToggle').waitFor({state:'visible'});
   for(const type of [65,37,38,66]){
    const image=await page.evaluate(type=>window.__walkBrowser.prepare(type),type);
    assert.ok(image.repeatTrack.includes('Repeat'),`type ${type} begins a repeated attack`);
    await page.evaluate(id=>window.__walkBrowser.preload([id]),image.image);
    const samples=[];
    for(let tick=0;tick<30;tick++){
     const result=await page.evaluate(async()=>{const state=window.__walkBrowser.advance();await new Promise(requestAnimationFrame);return{...state,rendered:window.__walkBrowser.frames.at(-1)}});
     if(result.action==='walk'&&result.rendered?.action==='walk'&&result.rendered.x===result.x)samples.push(result.rendered);
     if(type===65&&[8,15,22].includes(tick))await page.screenshot({path:`/tmp/ministar-walk-${viewport.width}-${tick}.png`});
    }
    assert.ok(samples.length>=6,`type ${type}: moving frames rendered on ${viewport.width}px`);
    assert.ok(samples.every(frame=>frame.track==='walk'&&!frame.override),`type ${type}: app-rendered body never takes stale attack override`);
    assert.ok(new Set(samples.map(frame=>frame.frame)).size>=2,`type ${type}: successive app-rendered frames change`);
    console.log(`${viewport.width}x${viewport.height} unit ${type}: ${samples.length} walk samples, frames ${[...new Set(samples.map(x=>x.frame))].join(',')}`);
   }
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
