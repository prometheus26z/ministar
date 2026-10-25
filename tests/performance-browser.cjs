const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app.js?*',route=>{
   let source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
   source=source.replace('function drawHealthBar(u){','function drawHealthBar(u){window.__lastBar={id:u.id,...healthBarLayout(u,data.graphics[u.def.image],camera.zoom)};');
   source=source.replace('function selectionUI(){','function selectionUI(){window.__panelRefreshes=(window.__panelRefreshes||0)+1;');
   source=source.replace('const selected=battle.isHighlighted(u)', 'window.__drawnUnitIds?.add(u.id);const selected=battle.isHighlighted(u)');
   source+='\nwindow.__perfTest={get battle(){return battle},center(x,y){camera.x=x;camera.y=y;limitCamera()},project(p){return toScreen(p.x,p.y)},focusBar(type,z){if(window.__barFixture)window.__barFixture.hidden=true;const u=battle.create(type,0,640,1000);window.__barFixture=u;battle.select([u.id],false);camera={x:640,y:1000,zoom:z};limitCamera();const g=data.graphics[u.def.image];return{id:u.id,width:g.frames[0][4]*.5,zoom:camera.zoom}}};';
   return route.fulfill({contentType:'application/javascript',body:source});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();
  const fixture=await page.evaluate(()=>{
   const b=window.__perfTest.battle;b.paused=true;
   for(let i=0;i<360;i++){const u=b.create([0,65,37,66,39,5][i%6],i%2,100+(i%24)*45,1400+Math.floor(i/24)*30);u.laneArmy=true}
   const dark=b.create(61,1,500,850);window.__drawnUnitIds=new Set();window.__perfTest.center(640,1100);return {dark:dark.id,name:dark.def.name};
  });
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await frames();
  assert.equal(await page.evaluate(id=>window.__drawnUnitIds.has(id),fixture.dark),false,'an undetected Dark Templar must not be rendered');
  const point=await page.evaluate(id=>window.__perfTest.project(window.__perfTest.battle.units.find(u=>u.id===id)),fixture.dark);await page.locator('#field').tap({position:point});await frames();assert.equal(await page.locator('#unitName').innerText(),'');
  await page.evaluate(()=>window.__perfTest.battle.create(84,0,500,850));await frames();
  assert.equal(await page.evaluate(id=>window.__drawnUnitIds.has(id),fixture.dark),true);await page.locator('#field').tap({position:point});await frames();assert.equal(await page.locator('#unitName').innerText(),fixture.name);
  const refreshes=await page.evaluate(async()=>{window.__panelRefreshes=0;for(let i=0;i<2000;i++)window.__perfTest.battle.emit('selection');await Promise.resolve();return window.__panelRefreshes});assert.equal(refreshes,1,'a simulation notification burst must refresh the DOM once');
  const timing=await page.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now();const sample=now=>{times.push(now-last);last=now;if(times.length<90)requestAnimationFrame(sample);else{times.sort((a,b)=>a-b);resolve({medianFrameMs:times[45],p95FrameMs:times[85],units:window.__perfTest.battle.units.length})}};requestAnimationFrame(sample)}));
  assert.ok(Number.isFinite(timing.p95FrameMs));assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/ministar-performance-mobile.png'});
  for(const type of [173,174,142,111])for(const zoom of [.3,.6,1.2]){
   const target=await page.evaluate(({type,zoom})=>window.__perfTest.focusBar(type,zoom),{type,zoom});await frames();
   const bar=await page.evaluate(()=>window.__lastBar);assert.equal(bar.id,target.id);assert.ok(Math.abs(bar.pixels-target.width*target.zoom*.85)<=.5,JSON.stringify({target,bar}));
   if((type===174||type===142)&&zoom===.6)await page.screenshot({path:`/tmp/ministar-health-bar-${type}.png`});
  }
  fs.writeFileSync('/tmp/ministar-browser-performance.json',JSON.stringify(timing,null,2));console.log('360-unit DPR-2 render profile, detection touch selection and batched panel updates:',timing);
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
