const VERSION=require('../package.json').version;const fs=require('node:fs');const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../server.cjs');
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
  legacy=false;if(direct)await page.goto(url+'?v='+VERSION);else await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});
  await page.locator('#title').waitFor({state:'visible'});
  assert.equal(await page.locator('.top small').innerText(),'v'+VERSION);
  assert.equal(await page.locator('#offline').count(),0);
  assert.equal(new URL(page.url()).searchParams.get('v'),VERSION);
  assert.deepEqual(await page.evaluate(async()=>(await caches.keys()).sort()),['other-app-cache']);
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ministar.records')),'[{"win":true}]');
 }finally{await context.close();await new Promise(r=>server.close(r))}
}
async function testTeamModes(browser,url){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8')+'\nwindow.__teamTest={get battle(){return battle},get owner(){return viewCommanderId()},project(p){return{x:W/2+(p.x-camera.x)*camera.zoom,y:cy()+(p.y-camera.y)*camera.zoom}}};'}));
  await page.goto(url);await page.locator('#title').waitFor({state:'visible'});
  for(const size of [1,2,3]){
   await page.locator('#teamSizeTrigger').click();await page.getByRole('option',{name:new RegExp(`^${size} vs ${size}`)}).click();
   assert.equal(await page.locator('#teamSize').inputValue(),String(size));assert.equal(await page.locator('select:visible').count(),0);
   await page.locator('#deploy').click();assert.equal(await page.evaluate(()=>window.__teamTest.battle.commanders.length),size*2);
   await page.evaluate(()=>{const b=window.__teamTest.battle;for(let i=0;i<160;i++)b.step(.25)});
   await page.locator('#spaceToggle').click();assert.equal(await page.locator('#productionSeat').isVisible(),size>1);
   for(let slot=1;slot<size;slot++){
    await page.locator('#productionSeat').click();assert.equal(await page.evaluate(()=>window.__teamTest.owner),slot);assert.equal(await page.locator('#commandButton').isDisabled(),true);
    const target=await page.evaluate(slot=>{const t=window.__teamTest,u=t.battle.units.find(u=>u.alive&&u.productionOnly&&u.commanderId===slot&&!u.startingBase);return u?{point:t.project(u),name:u.def.name}:null},slot);
    assert.ok(target,'allied AI must actually construct a visible building');await page.locator('#field').click({position:target.point});assert.equal(await page.locator('#unitName').innerText(),target.name);
    assert.equal(await page.evaluate(()=>window.__teamTest.battle.inspectedUnit?.commanderId),slot);
    assert.match(await page.locator('#productionSeat').innerText(),new RegExp('아군 AI '+slot));
   }
   if(size===3)await page.screenshot({path:'/tmp/ministar-3v3-ally-production.png'});
   assert.equal(await page.locator('#productionSide').count(),0);assert.ok(await page.evaluate(()=>window.__teamTest.owner<3));
   await page.evaluate(()=>window.__teamTest.battle.finish(true,'test'));await page.locator('#toTitle').click();
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}
async function testBuildingCatalogUI(browser,url){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url())});
  await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8')+'\nwindow.__catalogTest={get battle(){return battle}};'}));
  await page.goto(url);await page.locator('#title').waitFor({state:'visible'});
  const choose=async race=>{await page.locator(`button[data-race=${race}]`).click();await page.locator('#deploy').click();await page.locator('#spaceToggle').waitFor({state:'visible'});await page.locator('#spaceToggle').click()};
  const inject=async race=>page.evaluate(race=>{
   const b=window.__catalogTest.battle;b.money=10000;const offset=2304,groundX=96,groundY=736,groundWidth=1056,groundHeight=608;
   const put=(type,x,y,unfinished=false)=>{const u=b.create(type,0,x,y);u.productionOnly=true;u.startingBase=false;u.completed=!unfinished;if(unfinished)u.construction={time:0,total:1000,started:true,cost:[...b.buildingCost(type)],original:null};return u.id};
   const out={};
   if(race==='terran'){
    out.factory=put(113,960,offset+880);out.academy=put(112,900,offset+1050);out.comsat=put(106,420,offset+920);out.starport=put(114,820,offset+1150);out.covertProducer=put(117,1150,offset+1250);out.nonproducer=put(116,300,offset+920,true);out.tower=put(122,1050,offset+920);
    let facility=null;
    for(let y=offset+groundY+96;y<=offset+groundY+groundHeight-96&&!facility;y+=32)for(let x=groundX+96;x<=groundX+groundWidth-96&&!facility;x+=32){
     const site=b.placementForTeam(0,116,{x,y});if(site.reason)continue;
     const candidate=put(116,site.point.x,site.point.y);const parent=b.units.find(u=>u.id===candidate);
     if(!b.placementForTeam(0,117,b.addonPoint(parent,117),parent).reason)facility=candidate;
     else b.units.splice(b.units.findIndex(u=>u.id===candidate),1);
    }
    out.facility=facility||put(116,250,offset+800);
   }else if(race==='zerg'){
    out.hatch=put(131,300,offset+900);out.pool=put(142,420,offset+900);out.evolution=put(139,900,offset+1000);out.lair=put(132,500,offset+1150);out.queens=put(138,650,offset+1150);out.hive=put(133,800,offset+1150);out.spire=put(141,900,offset+1250);out.creep=put(143,1050,offset+1250);out.special=put(134,1150,offset+1000,true);
   }else{
    out.robo=put(155,300,offset+900);out.pylon=put(156,500,offset+900);out.stargate=put(167,800,offset+900);out.special=put(172,1050,offset+1000,true);out.citadel=put(163,700,offset+1100);
   }
   return out;
  },race);
  const select=async id=>page.evaluate(id=>window.__catalogTest.battle.select([id],false),id);
  const close=async()=>{if(await page.locator('#commands').isVisible())await page.locator('#closeCommands').click()};
  const openBuild=async()=>{await page.locator('#commandButton').click();await page.locator('#commands').waitFor({state:'visible'})};
  const openWaves=async()=>{await page.locator('#productionButton').click();await page.locator('#commands').waitFor({state:'visible'})};

  await choose('terran');let ids=await inject('terran');
  await select(ids.factory);assert.match(await page.locator('#order').innerText(),/골리앗 3기/);
  await openBuild();assert.equal(await page.getByRole('button',{name:/머신샵/}).count(),0,'PUNI-disabled Machine Shop is absent from factory add-ons and the build catalog');
  assert.equal(await page.locator('#commandGrid').evaluate(el=>el.innerText.includes('머신샵')),false);await close();
  await select(ids.facility);await openBuild();
  const covert=page.getByRole('button',{name:/^코버트 옵스 부착/}),physics=page.getByRole('button',{name:/^피직스 랩 부착/});
  assert.match(await covert.innerText(),/1000 미네랄/);assert.match(await covert.innerText(),/시즈 탱크 3기/);assert.equal(await covert.isDisabled(),false);
  assert.match(await physics.innerText(),/1500 미네랄/);assert.match(await physics.innerText(),/배틀크루저 2기/);assert.equal(await physics.isDisabled(),false);
  await page.screenshot({path:'/tmp/ministar-building-catalog-terran.png',fullPage:true});await close();
  await select(ids.comsat);await openBuild();assert.match(await page.getByRole('button',{name:/^콤샛 스테이션 부착/}).innerText(),/사이언스 베슬 1기/);assert.match(await page.getByRole('button',{name:/^뉴클리어 사일로 부착/}).innerText(),/고스트 4기/);await close();
  await select(ids.starport);await openBuild();assert.match(await page.getByRole('button',{name:/^컨트롤 타워 부착/}).innerText(),/병력 HP 회복.*자동 발동·소모/);await close();
  await select(ids.academy);await openBuild();assert.match(await page.getByRole('button',{name:/아카데미 건설/}).innerText(),/파이어뱃 1기.*메딕 1기/);await close();
  ids.special=await page.evaluate(()=>{const b=window.__catalogTest.battle,u=b.create(115,0,1100,3500);u.productionOnly=true;u.completed=false;u.construction={time:0,total:1000,started:true,cost:[...b.buildingCost(115)],original:null};return u.id});
  await select(ids.nonproducer);assert.match(await page.locator('#order').innerText(),/건설 중.*탱크·배틀크루저 테크/);await openWaves();assert.match(await page.locator('#commandGrid').innerText(),/현재 출격 유닛을 생성하지 않습니다.*탱크·배틀크루저 테크/);await close();
  await select(ids.tower);assert.match(await page.locator('#order').innerText(),/미사일 터렛 해금.*최대 1개/);

  await page.evaluate(()=>window.__catalogTest.battle.finish(true,'catalog test'));await page.locator('#toTitle').click();await choose('zerg');ids=await inject('zerg');
  await select(ids.hatch);assert.match(await page.locator('#order').innerText(),/건설 기반 · 레어 변태/);await openBuild();assert.match(await page.getByRole('button',{name:/^레어 변태/}).innerText(),/러커 2기/);await close();
  await select(ids.lair);await openBuild();assert.match(await page.getByRole('button',{name:/하이브 변태/}).innerText(),/러커 2기.*오버로드 1기/);await close();
  await select(ids.spire);await openBuild();assert.match(await page.getByRole('button',{name:/그레이터 스파이어 변태/}).innerText(),/가디언 1기.*디바우러 1기/);await close();
  await select(ids.creep);await openBuild();assert.match(await page.getByRole('button',{name:/^스포어 콜로니 변태/}).innerText(),/본진에 대공 방어시설 배치/);assert.match(await page.getByRole('button',{name:/^성큰 콜로니 변태/}).innerText(),/본진에 지상 방어시설 배치/);await close();
  await select(ids.pool);assert.match(await page.locator('#order').innerText(),/저글링 5기/);await openBuild();assert.match(await page.getByRole('button',{name:/스포닝 풀 건설/}).innerText(),/저글링 5~6기/);await close();
  await select(ids.evolution);assert.match(await page.locator('#order').innerText(),/스포어 콜로니 해금.*최초 완성 시 100 미네랄.*최대 1개/);
  await select(ids.special);assert.match(await page.locator('#order').innerText(),/건설 중.*브루들링으로 전환.*자동 발동·소모/);await openWaves();assert.match(await page.locator('#commandGrid').innerText(),/현재 출격 유닛을 생성하지 않습니다.*브루들링으로 전환/);await close();
  await page.screenshot({path:'/tmp/ministar-building-catalog-zerg.png',fullPage:true});

  await page.evaluate(()=>window.__catalogTest.battle.finish(true,'catalog test'));await page.locator('#toTitle').click();await choose('protoss');ids=await inject('protoss');
  await select(ids.robo);assert.match(await page.locator('#order').innerText(),/옵저버토리·로보틱스 서포트 베이 해금 · 최대 1개/);await openBuild();assert.match(await page.getByRole('button',{name:/옵저버토리 건설/}).innerText(),/옵저버 2기/);assert.match(await page.getByRole('button',{name:/로보틱스 서포트 베이 건설/}).innerText(),/리버 2기/);await close();
  await select(ids.pylon);assert.match(await page.locator('#order').innerText(),/기존 보급 건물 · 출격 수량 증가·추가 해금 없음/);
  await select(ids.stargate);assert.match(await page.locator('#order').innerText(),/스카웃 2기 · 커세어 1기/);
  await select(ids.special);assert.match(await page.locator('#order').innerText(),/건설 중.*절반을 아군으로 전환.*자동 발동·소모/);await openWaves();assert.match(await page.locator('#commandGrid').innerText(),/현재 출격 유닛을 생성하지 않습니다.*절반을 아군으로 전환/);await close();
  await select(ids.citadel);assert.match(await page.locator('#order').innerText(),/다크 템플러 1기 · 다크 아콘 1기/);
  await page.screenshot({path:'/tmp/ministar-building-catalog-protoss.png',fullPage:true});
  for(const viewport of [{width:320,height:568},{width:390,height:844}]){await page.setViewportSize(viewport);await openBuild();const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,commands:document.querySelector('#commands').scrollWidth,grid:document.querySelector('#commandGrid').scrollWidth,gridWidth:document.querySelector('#commandGrid').clientWidth}));assert.ok(layout.document<=viewport.width,JSON.stringify(layout));assert.ok(layout.grid<=layout.gridWidth+1,JSON.stringify(layout));await close()}
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
}
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true});await testLegacyMigration(browser);await testLegacyMigration(browser,true);const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+': '+r.url())});await page.addInitScript(()=>{window.__spriteDraws=new Set();const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image?.src)window.__spriteDraws.add(image.src);return draw.call(this,image,...args)}});await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8')+'\nwindow.__visualTest={get battle(){return battle},get placement(){return placementPoint},project(p){return{x:W/2+(p.x-camera.x)*camera.zoom,y:cy()+(p.y-camera.y)*camera.zoom}}};'}));await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});// Every select uses an overlay: no Android picker, layout shift or viewport overflow.
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
 await page.getByRole('option',{name:'어려움 · 적극 대응'}).click();
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
assert.equal(await page.locator('#slow').isVisible(),false);await page.waitForFunction(()=>[...window.__spriteDraws].some(url=>url.includes('ds-assets/207')));
assert.ok(await page.evaluate(version=>[...window.__spriteDraws].some(url=>url.endsWith('ds-assets/battlefield.webp?v='+version)),VERSION),'the renderer must draw the current upright terrain asset');
await page.screenshot({path:'/tmp/ministar-upright-terrain.png'});
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
// All five original geyser centers resolve to their own touch target.
await page.evaluate(()=>{const b=window.__visualTest.battle;b.money=900});
await page.locator('#commandButton').click();await page.getByRole('button',{name:/리파이너리 건설/}).click();
for(let slot=0;slot<5;slot++){
 const point=await page.evaluate(slot=>{const t=window.__visualTest;return t.project(t.battle.nodes.find(n=>n.team===0&&n.slot===slot))},slot);
 assert.ok(point.x>0&&point.x<390&&point.y>64&&point.y<700);
 await page.locator('#field').click({position:point});
 assert.equal(await page.evaluate(()=>{const t=window.__visualTest;return t.battle.placement(t.battle.builder,110,t.placement).gasNode?.slot}),slot);
}
await page.locator('#cancel').click();
assert.equal(await page.locator('#productionSide').count(),0);
assert.equal(await page.locator('#commandButton').isDisabled(),false);
await page.locator('#commandButton').click();await page.locator('#commands').waitFor({state:'visible'});
await page.waitForFunction(()=>Number(document.getElementById('money').textContent)>=330);const barracks=page.getByRole('button',{name:/배럭 건설/});await page.waitForFunction(()=>[...document.querySelectorAll('.command-card')].some(b=>b.textContent.includes('배럭')&&!b.disabled));assert.equal(await barracks.isDisabled(),false);assert.match(await barracks.innerText(),/330 미네랄/);assert.doesNotMatch(await barracks.innerText(),/●/);
assert.match(await barracks.innerText(),/마린 6기/);assert.doesNotMatch(await barracks.innerText(),/3초/);assert.match(await page.getByRole('button',{name:/아카데미 건설/}).innerText(),/파이어뱃 1기.*메딕 1기/);
await barracks.click();assert.equal(await page.locator('#target').isVisible(),true);
assert.match(await page.locator('#targetText').innerText(),/배럭/);
assert.equal(await page.locator('#confirmBuild').isDisabled(),true);
await page.locator('#field').click({position:{x:150,y:360}});
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
assert.equal(await page.locator('#unitName').innerText(),'케이다린 수정 형성부');
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
await page.waitForFunction(()=>[...window.__spriteDraws].some(url=>url.includes('assets/sprites/215_'))&&[...window.__spriteDraws].some(url=>url.includes('destruction-assets/217-')));
await page.screenshot({path:'/tmp/ministar-building-explosion.png',fullPage:true});await page.waitForTimeout(1300);
assert.ok(await page.evaluate(()=>window.__visualTest.battle.wrecks.length>0));await page.screenshot({path:'/tmp/ministar-building-rubble.png',fullPage:true});
assert.equal(await page.locator('#offline').count(),0);assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);assert.deepEqual(errors,[]);const url='http://127.0.0.1:'+server.address().port+'/ministar/';await testTeamModes(browser,url);await testBuildingCatalogUI(browser,url);console.log('390 × 844 and 320 × 568: original UI, production/building catalog, lane permissions, team modes and legacy cache migration passed.')}finally{await browser?.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});



