const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');

const root=path.join(__dirname,'../dist');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const injection=`
window.__inspectionTest={
 get battle(){return battle},
 get camera(){return camera},
 get wireframeCacheSize(){return wireframeCache.size},
 createPanelScene(){
  const b=battle;b.paused=true;b.waveClock=1e9;b.botStep=()=>{};
  const dragoon=b.create(66,0,360,1640);dragoon.hp=73.2;dragoon.shield=51.7;dragoon.killCount=3;
  const enemy=b.create(0,1,890,1640);enemy.order='hold';
  const building=b.create(111,0,520,1770);building.order='hold';
  return{dragoon:dragoon.id,enemy:enemy.id,building:building.id,portrait:dragoon.def.portrait};
 },
 createVisibilityScene(kind){
  const b=battle;b.paused=true;b.waveClock=1e9;b.botStep=()=>{};
  const type=kind==='cloak'?8:kind==='lurker'?103:37,unit=b.create(type,1,1000,1680);unit.order='hold';
  for(const other of b.units)if(other!==unit&&!other.def.building)other.hidden=true;
  if(kind==='burrow')b.researched.add('burrow');
  if(kind==='lurker')b.researched.add('burrow');
  camera={x:unit.x,y:unit.y,zoom:1.2};limitCamera();
  return unit.id;
 },
 getUnit(id){return battle.units.find(u=>u.id===id)},
 setDetected(id,on){const b=battle;if(!b.__inspectionDetectedBase)b.__inspectionDetectedBase=b.detectedBy.bind(b);b.detectedBy=(team,u)=>(on&&team===0&&u.id===id)||b.__inspectionDetectedBase(team,u)},
 canAttack(id){const u=this.getUnit(id),attacker=battle.create(0,0,u.x,u.y+100);attacker.hidden=true;return battle.canAttackTarget(attacker,u)},
 inspect(id){return !!battle.inspect(this.getUnit(id))},
 clearSelection(){battle.select([],false)},
 centerOn(id,zoom){const u=this.getUnit(id);camera={x:u.x,y:u.y,zoom};limitCamera();return this.project(u)},
 project(p){return{x:W/2+(p.x-camera.x)*camera.zoom,y:cy()+(p.y-camera.y)*camera.zoom}},
 bar(id){const u=this.getUnit(id);return healthBarLayout(u,data.graphics[u.def.image],camera.zoom)},
 renderUnit(id){const u=this.getUnit(id);let draws=0;const draw=ctx.drawImage;ctx.drawImage=function(...args){draws++;return draw.apply(this,args)};try{unit(u)}finally{ctx.drawImage=draw}return draws},
 advanceTicks(id,count){const b=battle,u=this.getUnit(id),levels=[];for(let i=0;i<count;i++){b.step(1/24);if((i+1)%4===0)levels.push(u.cloakLevel)}return levels},
 async advanceBurrow(id){const b=battle,u=this.getUnit(id),states=[];for(let i=0;i<100&&['burrowing','unburrowing'].includes(u.type===103?u.lurkerState:u.burrowState);i++){b.step(1/24);if(i%2===0)await new Promise(requestAnimationFrame);states.push(u.type===103?u.lurkerState:u.burrowState)}return states}
};`;

async function openBattle(browser,recordVideoDir){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,...(recordVideoDir?{recordVideo:{dir:recordVideoDir,size:{width:390,height:844}}}:{})});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
 page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()}: ${response.url()}`)});
 await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:appSource+injection}));
 await page.goto(`http://127.0.0.1:${server.address().port}/ministar/`);
 await page.locator('#title').waitFor({state:'visible'});
 await page.locator('#deploy').click();
 await page.locator('#spaceToggle').waitFor({state:'visible'});
 await page.locator('#panel').waitFor({state:'visible'});
 return{context,page,errors};
}

async function testInspection(browser){
 const{context,page,errors}=await openBattle(browser);
 try{
  const ids=await page.evaluate(()=>window.__inspectionTest.createPanelScene());
  assert.equal(await page.evaluate(()=>document.getElementById('researchButton')),null,'the unused research button is absent');
  assert.equal(await page.locator('#panel .panel-main button').count(),2,'the lane command row has only build and sortie controls');
  await page.evaluate(id=>window.__inspectionTest.inspect(id),ids.dragoon);
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='드라군');
  await page.waitForFunction(()=>window.__inspectionTest.wireframeCacheSize>0);
  assert.match(await page.locator('#hp').innerText(),/실드 51\/80\s+HP 74\/100/,'inspection values use original HP ceiling and shield floor rules');
  assert.equal(await page.locator('#killCount').innerText(),'처치 3');
  assert.ok(await page.locator('#statIcons .stat-icon').count()>=2,'armor and weapon icons appear in the source panel slots');
  assert.equal(await page.locator('#portrait').getAttribute('src'),ids.portrait);
  assert.equal(await page.locator('#portrait').isVisible(),true);
  assert.equal(await page.locator('#statDetails').isDisabled(),false);
  await page.locator('#statDetails').click();
  await page.locator('#modal').waitFor({state:'visible'});
  assert.match(await page.locator('#modalContent').innerText(),/방어력|지상|공중/);
  await page.locator('#closeModal').click();

  const enemyPoint=await page.evaluate(id=>window.__inspectionTest.centerOn(id,1.2),ids.enemy);
  await page.locator('#field').tap({position:enemyPoint});
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='마린');
  assert.equal(await page.locator('#commandButton').isDisabled(),true,'inspecting an enemy grants no build command');
  assert.equal(await page.locator('#portrait').getAttribute('src'),'assets/portraits/0.webm');

  const buildingPoint=await page.evaluate(id=>window.__inspectionTest.centerOn(id,1.2),ids.building);
  await page.locator('#field').tap({position:buildingPoint});
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='배럭');
  assert.equal(await page.locator('#killCount').isVisible(),false,'buildings have no unit kill count');
  assert.equal(await page.locator('#portrait').getAttribute('src'),'assets/portraits/111.webm');
  await page.evaluate(()=>window.__inspectionTest.clearSelection());
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='');
  assert.equal(await page.locator('#portrait').getAttribute('src'),null,'clearing inspection releases the previous portrait');
  assert.equal(await page.locator('#statDetails').isDisabled(),true);

  await page.evaluate(id=>window.__inspectionTest.inspect(id),ids.dragoon);
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='드라군');
  for(const viewport of [{width:360,height:844},{width:412,height:844}]){
   await page.setViewportSize(viewport);
   const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,wrap:document.querySelector('#inspectionWrap').getBoundingClientRect().toJSON(),footer:document.querySelector('#panel').getBoundingClientRect().toJSON()}));
   assert.ok(layout.document<=viewport.width,JSON.stringify(layout));
   assert.ok(layout.wrap.left>=0&&layout.wrap.right<=viewport.width+1,JSON.stringify(layout));
   assert.ok(layout.footer.left>=0&&layout.footer.right<=viewport.width+1,JSON.stringify(layout));
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(id=>window.__inspectionTest.centerOn(id,.4),ids.dragoon);await page.waitForTimeout(80);
  const small=await page.evaluate(id=>window.__inspectionTest.bar(id),ids.dragoon);
  await page.locator('#field').screenshot({path:'/tmp/ministar-health-bar-zoom-04.png'});
  await page.evaluate(id=>window.__inspectionTest.centerOn(id,1.4),ids.dragoon);await page.waitForTimeout(80);
  const large=await page.evaluate(id=>window.__inspectionTest.bar(id),ids.dragoon);
  assert.equal(large.width,small.width);assert.ok(Math.abs(large.pixels/small.pixels-3.5)<1e-8);
  await page.locator('#field').screenshot({path:'/tmp/ministar-health-bar-zoom-14.png'});
  await page.screenshot({path:'/tmp/ministar-inspection-panel-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}

async function testCloakVideo(browser){
 const dir='/tmp/ministar-cloak-video';fs.mkdirSync(dir,{recursive:true});
 const{context,page,errors}=await openBattle(browser,dir);const video=page.video();
 try{
  const id=await page.evaluate(()=>window.__inspectionTest.createVisibilityScene('cloak'));
  const unit=await page.evaluate(id=>{const u=window.__inspectionTest.getUnit(id);u.cloaked=true;u.cloakRequested=true;u.cloakLevel=0;u.cloakTimer=3;u.cloakFadeTeams=[0];return{canSee:window.__inspectionTest.battle.canSee(0,u)}},id);
  assert.equal(unit.canSee,false,'cloaking hides the enemy from target visibility immediately');
  await page.waitForTimeout(180);
  const levels=[];
  for(let stage=0;stage<8;stage++){
   const state=await page.evaluate(async id=>{const t=window.__inspectionTest;const u=t.getUnit(id);for(let i=0;i<4;i++){t.battle.step(1/24);await new Promise(requestAnimationFrame)}return{level:u.cloakLevel,draws:t.renderUnit(id),canSee:t.battle.canSee(0,u),inspect:t.inspect(id)}},id);
   levels.push(state.level);assert.equal(state.level,stage+1);assert.equal(state.canSee,false);assert.equal(state.inspect,false);
   if(stage===7)assert.equal(state.draws,0);else assert.ok(state.draws>0,`cloak stage ${stage+1} retains a fading sprite`);
   if(stage===0||stage===3||stage===6||stage===7)await page.locator('#field').screenshot({path:`/tmp/ministar-cloak-level-${stage+1}.png`});
  }
  assert.deepEqual(levels,[1,2,3,4,5,6,7,8]);
  const detected=await page.evaluate(id=>{const t=window.__inspectionTest,u=t.getUnit(id);t.setDetected(id,true);return{canSee:t.battle.canSee(0,u),draws:t.renderUnit(id),inspect:t.inspect(id)}},id);
  assert.equal(detected.canSee,true);assert.ok(detected.draws>0,'a detected cloaked sprite uses the existing shimmer rendering');assert.equal(detected.inspect,true);
  await page.evaluate(id=>{window.__inspectionTest.setDetected(id,false);window.__inspectionTest.clearSelection()},id);
  await page.evaluate(id=>{const t=window.__inspectionTest,u=t.getUnit(id);t.battle.cast(u,'cloak')},id);
  const reverse=[];
  for(let stage=0;stage<8;stage++){
   const state=await page.evaluate(async id=>{const t=window.__inspectionTest,u=t.getUnit(id);for(let i=0;i<4;i++){t.battle.step(1/24);await new Promise(requestAnimationFrame)}return{level:u.cloakLevel,draws:t.renderUnit(id),canSee:t.battle.canSee(0,u)}},id);
   reverse.push(state.level);assert.equal(state.level,7-stage);assert.equal(state.canSee,true);assert.ok(state.draws>0);
  }
  assert.deepEqual(reverse,[7,6,5,4,3,2,1,0]);assert.deepEqual(errors,[]);
 }finally{
  await context.close();
  const original=await video.path();const target=path.join(dir,'wraith-cloak-decloak.webm');if(original!==target)fs.copyFileSync(original,target);
 }
}

async function testBurrowVideo(browser){
 const dir='/tmp/ministar-burrow-video';fs.mkdirSync(dir,{recursive:true});
 const{context,page,errors}=await openBattle(browser,dir);const video=page.video();
 try{
  for(const kind of ['burrow','lurker']){
   const id=await page.evaluate(kind=>window.__inspectionTest.createVisibilityScene(kind),kind);
   await page.waitForFunction(id=>window.__inspectionTest.renderUnit(id)>0,id);
   const state=await page.evaluate(id=>{const t=window.__inspectionTest,u=t.getUnit(id);return{available:t.battle.availableAbilities(u).includes('burrow'),duration:t.battle.animationDuration(u,'burrow'),canSee:t.battle.canSee(0,u)}},id);
   assert.equal(state.available,true);assert.equal(state.canSee,true);assert.ok(state.duration>0);
   assert.equal(await page.evaluate(id=>window.__inspectionTest.battle.cast(window.__inspectionTest.getUnit(id),'burrow'),id),true);
   const enter=await page.evaluate(async id=>{const t=window.__inspectionTest,u=t.getUnit(id);const drawStart=t.renderUnit(id);const states=await t.advanceBurrow(id);return{drawStart,states,state:u.type===103?u.lurkerState:u.burrowState,hidden:t.battle.canSee(0,u),drawEnd:t.renderUnit(id)}},id);
   assert.ok(enter.drawStart>0);assert.ok(enter.states.some(state=>state==='burrowing'));assert.equal(enter.state,'burrowed');assert.equal(enter.hidden,false);assert.equal(enter.drawEnd,0);
   assert.equal(await page.evaluate(id=>window.__inspectionTest.battle.cast(window.__inspectionTest.getUnit(id),'burrow'),id),true);
   const exit=await page.evaluate(async id=>{const t=window.__inspectionTest,u=t.getUnit(id);const drawStart=t.renderUnit(id);const visible=t.battle.canSee(0,u),select=t.inspect(id),attack=t.canAttack(id),states=await t.advanceBurrow(id);return{drawStart,states,state:u.type===103?u.lurkerState:u.burrowState,visible,select,attack,drawEnd:t.renderUnit(id)}},id);
   assert.ok(exit.drawStart>0,'the enemy unburrow animation is drawn as a visual transition');
   assert.equal(exit.visible,false,'rendering the transition does not reveal it to target selection');
   assert.equal(exit.select,false);assert.equal(exit.attack,false);assert.equal(exit.state,'ground');assert.ok(exit.drawEnd>0);
  }
  assert.deepEqual(errors,[]);
 }finally{
  await context.close();
  const original=await video.path();const target=path.join(dir,'zergling-burrow-unburrow.webm');if(original!==target)fs.copyFileSync(original,target);
 }
}

let server;
(async()=>{
 server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.MINISTAR_CHROMIUM_PATH?{executablePath:process.env.MINISTAR_CHROMIUM_PATH}:{})});
 try{await testInspection(browser);await testCloakVideo(browser);await testBurrowVideo(browser);console.log('Mobile inspection, source selection console, zoomed health bars, cloak transitions and Burrow rendering passed.')}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(async error=>{console.error(error);await new Promise(resolve=>server?.close(resolve));process.exitCode=1});
