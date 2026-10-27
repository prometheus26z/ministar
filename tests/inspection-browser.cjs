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
  const medic=b.create(34,0,700,1500);medic.energy=75;medic.maxEnergy=250;
  const enemy=b.create(0,1,890,1640);enemy.order='hold';
  const building=b.create(111,0,520,1770);building.order='hold';
  return{dragoon:dragoon.id,medic:medic.id,enemy:enemy.id,building:building.id,portrait:dragoon.def.portrait};
 },
 startManaBarSpy(id){
  const unit=this.getUnit(id),bar=healthBarLayout(unit,data.graphics[unit.def.image],camera.zoom),energyY=bar.y+(unit.def.shield>0?11:5)+1,original=ctx.fillRect;
  ctx.__manaSpyHits=0;this.manaSpyOriginal=original;
  ctx.fillRect=function(x,y,w,h){if(this.fillStyle==='#c3a0dc'&&Math.abs(y-energyY)<.001&&w>0)this.__manaSpyHits++;return original.call(this,x,y,w,h)};
 },
 stopManaBarSpy(){const count=ctx.__manaSpyHits||0;if(this.manaSpyOriginal)ctx.fillRect=this.manaSpyOriginal;this.manaSpyOriginal=null;return count},
 createAddonScene(){
  const b=battle;b.paused=true;b.waveClock=1e9;b.botStep=()=>{};
  const pairs=[[106,107,256,528],[106,108,1024,528],[114,115,256,1008],[116,117,1024,1008],[116,118,256,1488],[113,120,1024,1488]],result=[];
  for(const [parentType,addonType,x,y]of pairs){const parent=b.create(parentType,0,x,y);parent.order='hold';const point={x:x+b.footprint(parentType)[0]/2+b.footprint(addonType)[0]/2,y:y+b.footprint(parentType)[1]/2-b.footprint(addonType)[1]/2},addon=b.create(addonType,0,point.x,point.y);addon.parent=parent.id;addon.order='hold';result.push({parent:parent.id,addon:addon.id,point})}
  camera={x:640,y:1000,zoom:.3};limitCamera();return result;
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
  assert.equal(await page.locator('#commandTabs').count(),0,'the original command card has no separate basic/advanced tabs');assert.equal(await page.locator('#commandGrid .command-slot:not(:disabled)').count(),0,'field inspection has no build commands');
  await page.evaluate(id=>window.__inspectionTest.inspect(id),ids.dragoon);
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='드라군');
  await page.waitForFunction(()=>window.__inspectionTest.wireframeCacheSize>0);
  assert.equal(await page.locator('#shields').innerText(),'실드 51/80');
  assert.match(await page.locator('#hp').innerText(),/HP 74\/100/,'inspection values use original HP ceiling and shield floor rules');
  assert.equal(await page.locator('#killCount').innerText(),'처치 3');
  assert.ok(await page.locator('#statIcons .stat-icon').count()>=2,'armor and weapon icons appear in the source panel slots');
  assert.equal(await page.locator('#portrait').getAttribute('src'),ids.portrait);
  assert.equal(await page.locator('#portrait').isVisible(),true);
  assert.equal(await page.locator('#mission #settings').count(),0,'the mission bar has no settings gear');
  assert.equal(await page.locator('#panel #settings').count(),1,'the panel has one Menu button');
  await page.locator('#settings').tap();
  await page.locator('#modal').waitFor({state:'visible'});
  await page.locator('#closeModal').tap();
  await page.locator('#modal').waitFor({state:'hidden'});
  const stat=page.locator('#statIcons button').first();
  await stat.tap();
  await page.locator('#statTooltip').waitFor({state:'visible'});
  assert.equal(await page.locator('#modal').isVisible(),false);
  assert.equal(await page.locator('#statTooltip').innerText(),'프로토스 아머\n장갑: 1+3');
  const callout=await page.locator('#statTooltip').boundingBox(),anchor=await stat.boundingBox();
  assert.ok(callout.y+callout.height<=anchor.y,'stat callout appears above the tapped icon');
  await stat.tap();
  assert.equal(await page.locator('#statTooltip').isVisible(),false);
  await stat.tap();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#statTooltip').isVisible(),false);

  const enemyPoint=await page.evaluate(id=>window.__inspectionTest.centerOn(id,1.2),ids.enemy);
  await page.locator('#field').tap({position:enemyPoint});
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='마린');
  assert.equal(await page.locator('#commandTabs').count(),0,'the command tab bar stays absent');assert.equal(await page.locator('#commandGrid .command-slot:not(:disabled)').count(),0);
  assert.equal(await page.locator('#portrait').getAttribute('src'),'assets/portraits/0.webm');

  const buildingPoint=await page.evaluate(id=>window.__inspectionTest.centerOn(id,1.2),ids.building);
  await page.locator('#field').tap({position:buildingPoint});
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='배럭');
  assert.equal(await page.locator('#killCount').isVisible(),false,'buildings have no unit kill count');
  assert.equal(await page.locator('#portrait').getAttribute('src'),'assets/portraits/111.webm');
  await page.evaluate(()=>window.__inspectionTest.clearSelection());
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='');
  assert.equal(await page.locator('#portrait').getAttribute('src'),null,'clearing inspection releases the previous portrait');
  assert.equal(await page.locator('#statIcons button').count(),0);
  const emptyFrame=await page.locator('.portrait-frame').boundingBox();
  assert.ok(emptyFrame?.width>0&&emptyFrame.height>emptyFrame.width,'the portrait stretches to occupy its independent full-height column');

  await page.evaluate(id=>window.__inspectionTest.inspect(id),ids.dragoon);
  await page.waitForFunction(()=>document.querySelector('#unitName').textContent==='드라군');
  await page.evaluate(id=>window.__inspectionTest.inspect(id),ids.medic);
  await page.waitForFunction(()=>document.querySelector('#energy').textContent==='마나 75/250');
  await page.evaluate(id=>window.__inspectionTest.centerOn(id,.6),ids.medic);
  await page.evaluate(id=>window.__inspectionTest.startManaBarSpy(id),ids.medic);
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>window.__inspectionTest.stopManaBarSpy())>0,'the real renderer draws the mana row below HP');
  await page.evaluate(id=>window.__inspectionTest.centerOn(id,.6),ids.medic);await page.waitForTimeout(80);
  await page.locator('#field').screenshot({path:'/tmp/ministar-mana-bar.png'});
  for(const viewport of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:412,height:915},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   const layout=await page.evaluate(()=>{const frame=document.querySelector('.portrait-frame').getBoundingClientRect(),portrait=document.querySelector('#portraitArea').getBoundingClientRect(),menu=document.querySelector('#settings').getBoundingClientRect(),grid=document.querySelector('#commandGrid').getBoundingClientRect(),mini=document.querySelector('#consoleMinimap').getBoundingClientRect(),info=document.querySelector('#inspectionWrap').getBoundingClientRect(),console=document.querySelector('#consoleMain').getBoundingClientRect();return{viewport:innerWidth,document:document.documentElement.scrollWidth,wrap:info.toJSON(),console:console.toJSON(),footer:document.querySelector('#panel').getBoundingClientRect().toJSON(),frame:{top:frame.top,bottom:frame.bottom,height:frame.height},portrait:{left:portrait.left,right:portrait.right,top:portrait.top,bottom:portrait.bottom},menu:{bottom:menu.bottom},grid:{left:grid.left,right:grid.right,top:grid.top,bottom:grid.bottom},mini:{left:mini.left,right:mini.right,top:mini.top,bottom:mini.bottom,height:mini.height}}});
   assert.ok(layout.document<=viewport.width,JSON.stringify(layout));
   assert.ok(layout.wrap.left>=0&&layout.wrap.right<=viewport.width+1,JSON.stringify(layout));
   assert.ok(layout.footer.left>=0&&layout.footer.right<=viewport.width+1,JSON.stringify(layout));
   assert.ok(layout.frame.top>=layout.portrait.top&&layout.frame.bottom<=layout.portrait.bottom+1,JSON.stringify(layout));
   assert.ok(layout.menu.bottom<=layout.frame.top+1,JSON.stringify(layout));
   assert.ok(layout.grid.left>=0&&layout.grid.right<=viewport.width+1&&layout.mini.left>=0&&layout.mini.right<=viewport.width+1,JSON.stringify(layout));
   assert.ok(layout.mini.right<=layout.wrap.left+3&&layout.wrap.right<=layout.portrait.left+3&&layout.portrait.right<=layout.grid.left+3,'map, unit information, Menu/portrait and card occupy separate columns: '+JSON.stringify(layout));
   assert.ok(Math.abs(layout.mini.height-(layout.grid.bottom-layout.grid.top))<1.5&&layout.mini.bottom<=layout.console.bottom+1&&layout.grid.bottom>=layout.console.bottom-3,'minimap and card stretch inside the console frame: '+JSON.stringify(layout));
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(id=>window.__inspectionTest.centerOn(id,.4),ids.dragoon);await page.waitForTimeout(80);
  const small=await page.evaluate(id=>window.__inspectionTest.bar(id),ids.dragoon);
  await page.locator('#field').screenshot({path:'/tmp/ministar-health-bar-zoom-04.png'});
  await page.evaluate(id=>window.__inspectionTest.centerOn(id,1.4),ids.dragoon);await page.waitForTimeout(80);
  const large=await page.evaluate(id=>window.__inspectionTest.bar(id),ids.dragoon);
  assert.equal(large.width,small.width);assert.ok(Math.abs(large.pixels/small.pixels-3.5)<1e-8);
  await page.locator('#field').screenshot({path:'/tmp/ministar-health-bar-zoom-14.png'});
  await page.locator('#statIcons button').first().focus();
  const consoleLayout=await page.evaluate(()=>{const info=document.querySelector('#panel .unit-info'),name=document.querySelector('#unitName').getBoundingClientRect(),hp=document.querySelector('#hp').getBoundingClientRect(),icons=document.querySelector('#statDetails').getBoundingClientRect(),bounds=info.getBoundingClientRect();return{scroll:info.scrollTop,nameTop:name.top,top:bounds.top,hpRight:hp.right,hpTop:hp.top,iconsLeft:icons.left,bottom:bounds.bottom,iconsBottom:icons.bottom}});
  assert.equal(consoleLayout.scroll,0,'focusing details must not scroll and clip the unit name');
  assert.ok(consoleLayout.nameTop>=consoleLayout.top&&(consoleLayout.hpRight<=consoleLayout.iconsLeft||consoleLayout.hpTop>=consoleLayout.iconsBottom-1)&&consoleLayout.iconsBottom<=consoleLayout.bottom,JSON.stringify(consoleLayout));
  await page.screenshot({path:'/tmp/ministar-inspection-panel-mobile.png',fullPage:true});
  await page.locator('#spaceToggle').tap();
  await page.waitForFunction(()=>document.body.dataset.space==='production');
  await page.evaluate(()=>{window.__inspectionTest.battle.money=5000});
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#commandTabs').count(),0);
  await page.screenshot({path:'/tmp/ministar-construction-console-mobile.png'});
  const availableBuilding=page.locator('#commandGrid .building-card:not(.unavailable)').first();
  assert.ok(await availableBuilding.count(),'the basic 3×3 card displays constructible buildings');
  await availableBuilding.tap();
  assert.equal(await page.locator('#target').isVisible(),true);
  const mineralPrice=await page.locator('#targetCostAmount').innerText();
  assert.match(mineralPrice,/^[\d,]+$/);
  assert.equal(await page.locator('#targetCost img').getAttribute('src'),'assets/icons/resource_000.png');
  const buttonLayout=await page.evaluate(()=>{const a=document.querySelector('#confirmBuild').getBoundingClientRect(),b=document.querySelector('#cancel').getBoundingClientRect(),bar=document.querySelector('#target').getBoundingClientRect();return{build:a.toJSON(),cancel:b.toJSON(),bar:bar.toJSON()}});
  assert.ok(buttonLayout.build.width>=69&&Math.abs(buttonLayout.build.width-buttonLayout.cancel.width)<1&&buttonLayout.cancel.left-buttonLayout.build.right>=6,'construction buttons have matching larger widths and a gap');
  assert.ok(buttonLayout.bar.right-buttonLayout.cancel.right<20,'construction/cancel actions align at the far right');
  await page.screenshot({path:'/tmp/ministar-build-target-mobile.png'});
  await page.locator('#cancel').tap();
  await page.locator('#commandGrid [aria-label="건설 명령 취소"]').tap();
  assert.equal(await page.locator('#commandGrid [aria-label="기본 건설 명령"]').count(),1);
  assert.equal(await page.locator('#commandGrid [aria-label="고급 건설 명령"]').count(),1);
  await page.locator('#commandGrid [aria-label="고급 건설 명령"]').tap();
  assert.ok(await page.locator('#commandGrid .building-card').count()>0,'advanced buildings remain accessible in the 3×3 menu');
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}

async function testAddonConnections(browser){
 const{context,page,errors}=await openBattle(browser);
 try{
  const pairs=await page.evaluate(()=>window.__inspectionTest.createAddonScene());
  assert.equal(pairs.length,6);
  for(const pair of pairs){const unit=await page.evaluate(id=>window.__inspectionTest.getUnit(id),pair.addon);assert.ok(unit);assert.equal(unit.x,pair.point.x);assert.equal(unit.y,pair.point.y)}
  await page.waitForTimeout(400);
  await page.locator('#field').screenshot({path:'/tmp/ministar-addon-connections.png'});
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
 try{await testInspection(browser);await testAddonConnections(browser);await testCloakVideo(browser);await testBurrowVideo(browser);console.log('Mobile inspection, mana bars, add-on connections, Menu alignment, cloak transitions and Burrow rendering passed.')}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(async error=>{console.error(error);await new Promise(resolve=>server?.close(resolve));process.exitCode=1});
