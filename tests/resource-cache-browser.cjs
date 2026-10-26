const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../server.cjs');
const root=path.join(__dirname,'../dist');
const packageVersion=require('../package.json').version;
const fixturePath='assets/test-cache-fixture.webp';
let fixture=Buffer.from('first fixture resource');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const totals=new Map();
const track=page=>page.on('request',request=>{const pathname=new URL(request.url()).pathname;totals.set(pathname,(totals.get(pathname)||0)+1)});
const requestCount=path=>totals.get('/ministar/'+path)||0;

(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.MINISTAR_CHROMIUM_PATH?{executablePath:process.env.MINISTAR_CHROMIUM_PATH}:{})});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();track(page);
  const session=await context.newCDPSession(page);await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
  await page.route('**/app.js?*',async route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.__resourceTest={store:resourceStore,planner:resourcePlanner};'}));
  await page.route('**/resource-manifest.json',async route=>{
   const manifest=JSON.parse(fs.readFileSync(path.join(root,'resource-manifest.json'),'utf8'));
   manifest.entries[fixturePath]={sha256:sha256(fixture),bytes:fixture.length,mime:'image/webp',kind:'image'};
   manifest.buildId=sha256(Buffer.from(JSON.stringify({schema:manifest.schema,appVersion:manifest.appVersion,entries:manifest.entries})));
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(manifest)});
  });
  await page.route('**/assets/test-cache-fixture.webp*',route=>route.fulfill({status:200,contentType:'image/webp',body:fixture}));
  const url=`http://127.0.0.1:${server.address().port}/ministar/`;
  await page.goto(url);await page.locator('#title').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.__resourceTest?.store.stats().storedBytes>0);
  const firstDataRequests=requestCount('assets/data.json'),firstTerrainRequests=requestCount('assets/terrain.webp');
  assert.ok(firstDataRequests>0);assert.ok(firstTerrainRequests>0);
  assert.equal(await page.evaluate(async path=>await(await window.__resourceTest.store.response(path)).text(),fixturePath),'first fixture resource');
  const coldFixtureRequests=requestCount(fixturePath);
  await page.waitForFunction(()=>performance.getEntriesByName('ministar:optional-assets-start','mark').length>0);
  const titleAt=await page.evaluate(()=>performance.getEntriesByName('ministar:title-ready','mark')[0]?.startTime),warmupAt=await page.evaluate(()=>performance.getEntriesByName('ministar:optional-assets-start','mark')[0]?.startTime);
  assert.ok(Number.isFinite(titleAt)&&Number.isFinite(warmupAt)&&warmupAt>=titleAt,'optional warmup starts after the title becomes ready');
  const coldSnapshot=Object.fromEntries(totals),coldFixtureBytes=fixture.length;

  await page.reload();await page.locator('#title').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.__resourceTest?.store.stats().cacheHitBytes>0);
  const warmFixture=await page.evaluate(async path=>await(await window.__resourceTest.store.response(path)).text(),fixturePath);
  assert.equal(warmFixture,'first fixture resource');
  assert.equal(requestCount('assets/data.json'),firstDataRequests,'warm metadata is served from Cache Storage');
  assert.equal(requestCount('assets/terrain.webp'),firstTerrainRequests,'warm terrain is served from Cache Storage');
  assert.equal(requestCount(fixturePath),coldFixtureRequests,'warm fixture is served from Cache Storage');
  const warmSnapshot=Object.fromEntries(totals);

  const stableBefore=requestCount('assets/data.json');fixture=Buffer.from('changed fixture resource');
  const updated=await page.evaluate(async()=>window.__resourceTest.store.init());assert.equal(updated.manifest,true);
  assert.equal(await page.evaluate(async path=>await(await window.__resourceTest.store.response(path)).text(),fixturePath),'changed fixture resource');
  assert.equal(await page.evaluate(async()=>await(await window.__resourceTest.store.response('assets/data.json')).json().then(()=>true)),true);
  assert.equal(requestCount(fixturePath),coldFixtureRequests+1,'one changed hash fetches one resource body');
  assert.equal(requestCount('assets/data.json'),stableBefore,'unchanged data remains cached after the manifest update');
  assert.deepEqual(await page.evaluate(async()=>{const keys=await caches.keys();return{own:keys.filter(key=>key.startsWith('ministar-resource-v1:')).length,legacy:keys.filter(key=>key.startsWith('ministar-pages-')).length,other:keys.filter(key=>key==='other-app-cache').length}}),{own:1,legacy:0,other:0});
  const baseManifest=JSON.parse(fs.readFileSync(path.join(root,'resource-manifest.json'),'utf8'));
  const bodyBytes=snapshot=>Object.entries(snapshot).reduce((sum,[pathname,count])=>{const relative=pathname.startsWith('/ministar/')?pathname.slice('/ministar/'.length):'';return sum+count*(baseManifest.entries[relative]?.bytes||0)},0);
  const coldBodyBytes=bodyBytes(coldSnapshot),warmBodyBytes=Object.entries(warmSnapshot).reduce((sum,[pathname,count])=>{const delta=count-(coldSnapshot[pathname]||0),relative=pathname.startsWith('/ministar/')?pathname.slice('/ministar/'.length):'';return sum+delta*(baseManifest.entries[relative]?.bytes||0)},0);
  const summary={browser:'Chromium',viewport:{width:390,height:844},httpCacheDisabled:true,cold:{dataRequests:firstDataRequests,terrainRequests:firstTerrainRequests,fixtureRequests:coldFixtureRequests,manifestBodyBytes:coldBodyBytes+coldFixtureRequests*coldFixtureBytes},warm:{dataRequests:requestCount('assets/data.json')-stableBefore,terrainRequests:requestCount('assets/terrain.webp')-firstTerrainRequests,fixtureRequests:(warmSnapshot['/ministar/'+fixturePath]||0)-(coldSnapshot['/ministar/'+fixturePath]||0),manifestBodyBytes:warmBodyBytes},changedFixtureRequests:requestCount(fixturePath)-coldFixtureRequests,changedFixtureBodyBytes:fixture.length,cacheStats:await page.evaluate(()=>window.__resourceTest.store.stats()),manifestVersion:packageVersion};
  fs.writeFileSync('/tmp/ministar-resource-cache.json',JSON.stringify(summary,null,2)+'\n');
  await context.close();console.log('Cache Storage cold/warm reuse, one-resource hash change, scope migration and deferred warmup passed.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
