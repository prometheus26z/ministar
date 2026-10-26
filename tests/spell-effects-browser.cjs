const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createServer}=require('../server.cjs');

(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/app.js?*',route=>{
   let source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
   source=source.replace('const g=data.graphics[id];if(!g||stack.has(id)||stack.size>8)return false;','if(window.__spellWatch?.has(id))window.__spellDraws.push(id);const g=data.graphics[id];if(!g||stack.has(id)||stack.size>8)return false;');
   source+='\nwindow.__spellTest={get battle(){return battle},async setup(){const b=battle;b.paused=true;camera={x:640,y:1400,zoom:1};limitCamera();const queen=b.create(45,0,610,1400),organic=b.create(0,1,650,1400),mechanical=b.create(2,1,675,1400),ally=b.create(0,0,710,1400);queen.energy=200;window.__spellDraws=[];window.__spellWatch=new Set([525,...Object.values(spellVisualData.images).flat()]);await Promise.all([...window.__spellWatch].map(id=>warmImageUrls(graphicUrls(data.graphics[id]))));for(const key of ["ensnare","plague","maelstrom","stasis"]){queen.energy=200;b.cast(queen,key,{x:650,y:1400})}queen.energy=200;b.cast(queen,"irradiate",null,organic);queen.energy=200;b.cast(queen,"lockdown",null,mechanical);queen.energy=200;b.cast(queen,"matrix",null,ally);for(const key of ["storm","swarm","web"]){queen.energy=200;b.cast(queen,key,{x:710,y:1400})}return{draws:window.__spellDraws,areas:b.areas.map(area=>area.image),effects:b.effects.map(effect=>effect.image)}}};';
   route.fulfill({contentType:'application/javascript',body:source});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});await page.locator('#deploy').click();
  const result=await page.evaluate(()=>window.__spellTest.setup());
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const draws=await page.evaluate(()=>window.__spellDraws),required=[337,364,365,371,374,377,380,383,384,387,388,951,982,998,525];
  for(const image of required)assert.ok(draws.includes(image),`original spell image ${image} should be rendered`);
  assert.ok(result.effects.includes(383)&&result.effects.includes(387)&&result.effects.includes(998)&&result.effects.includes(364));
  assert.ok(result.areas.includes(337)&&result.areas.includes(951)&&result.areas.includes(525));
  assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/ministar-spell-effects-mobile.png'});
  console.log('Original spell and unit overlays rendered on mobile (390 × 844).');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
