const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:960},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__drawn=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image?.src)window.__drawn.push(image.__ministarSource||image.src);return draw.call(this,image,...args)}});
  await page.route('**/app.js?*',route=>{
   let source=fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8');source=source.replace('function render(now){','function render(now){if(window.__freezeVisual)return;');
   source+=`\nwindow.__originalVisual={async sheet(){
    window.__freezeVisual=true;
    const ids=[134,135,136,214,925,926,927,928,549];await Promise.all(ids.flatMap(id=>Object.values(data.graphics[id].images)).map(loadImage));
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#182127';ctx.fillRect(0,0,1100,960);ctx.font='16px sans-serif';ctx.fillStyle='#fff';ctx.fillText('Original Archon / Dark Archon animation layers',20,26);
    const columns=[[134,0,'Archon blue'],[134,1,'Archon red'],[925,0,'Dark Archon blue'],[925,1,'Dark Archon red']];columns.forEach((col,i)=>ctx.fillText(col[2],175+i*235,55));
    const scenes=[['idle',2,100],['walk',2,100],['attack',.25,100],['attack',.25,20],['death',.1,100],['death',.35,100],['death',.7,100]],evidence=[];
    scenes.forEach(([action,time,distance],row)=>{
     ctx.fillStyle='#fff';ctx.fillText(action+' '+time+'s'+(action==='attack'?' d='+distance:''),12,100+row*120);
     columns.forEach(([id,team],column)=>{window.__drawn=[];sprite(id,team,220+column*235,105+row*120,action,time,8,1,new Set(),null,{seed:17,lifetime:action==='death'?time:2,targetDistance:distance});evidence.push({id,team,action,time,distance,urls:[...new Set(window.__drawn)].map(url=>new URL(url,location.href).pathname)});});
    });
    const source=data.graphics[134].tracks.idle,variants=data.graphics[135].tracks.attack;
    return{evidence,loopStart:source.loopStart,near:trackFor(data.graphics[135],'attack',{targetDistance:20}).overlays,far:trackFor(data.graphics[135],'attack',{targetDistance:100}).overlays};
   }};
   window.__originalVisual.deaths=async()=>{
    const types=[0,1,34,37,38,39,40,41,45,46,62,66,103],urls=new Set();
    const collect=(id,action,seen=new Set())=>{if(seen.has(id))return;seen.add(id);const g=data.graphics[id];if(!g)throw Error('Missing original corpse '+id);Object.values(g.images).forEach(url=>urls.add(url));const track=trackFor(g,action);for(const id of track?.overlays||[])collect(id,'idle',seen)};
    for(const type of types)collect(data.units[type].image,'death');const imageUrls=[...urls],loaded=await Promise.all(imageUrls.map(loadImage));if(loaded.some(x=>!x))throw Error('Original corpse image failed to load: '+JSON.stringify({missing:imageUrls.filter((_,i)=>!loaded[i]),failed:[...failedImages.keys()],stats:resourceStore.stats()}));
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#182127';ctx.fillRect(0,0,1100,1240);ctx.fillStyle='#fff';ctx.font='15px sans-serif';ctx.fillText('Original source death sprites: 0s / 0.2s / 0.5s / 1s',20,25);
    types.forEach((type,row)=>{const u=data.units[type];ctx.fillStyle='#fff';ctx.fillText(u.en||u.name,12,90+row*85);[0,.2,.5,1].forEach((time,col)=>sprite(u.image,0,330+col*220,85+row*85,'death',time,8,1,new Set(),null,{seed:type,lifetime:time}));});
    return types.length;
   };`;
   return route.fulfill({contentType:'application/javascript',body:source});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/ministar/');await page.locator('#title').waitFor({state:'visible'});
  await page.addStyleTag({content:'body > :not(canvas#field) {visibility:hidden!important}'});
  const result=await page.evaluate(()=>window.__originalVisual.sheet());
  assert.equal(result.loopStart,11);assert.ok(!result.near.includes(549)&&result.far.includes(549),'source range branch creates the far attack overlay only');
  for(const row of result.evidence.filter(x=>['idle','walk','attack'].includes(x.action))){for(const id of row.id===134?[134,135,136]:[925,926,927])assert.ok(row.urls.some(url=>url.includes('/'+id+'-')),JSON.stringify(row))}
  for(const row of result.evidence.filter(x=>x.action==='death'&&x.time===.35)){
   assert.ok(!row.urls.some(url=>url.includes('/'+row.id+'-')),'base image ends at its source end instruction');const effect=row.id===134?214:928;assert.ok(row.urls.some(url=>url.includes('/'+effect+(effect===214?'_':'-'))),JSON.stringify(row));
  }
  const darkEnded=result.evidence.filter(x=>x.id===925&&x.action==='death'&&x.time===.7);assert.ok(darkEnded.every(x=>x.urls.length===0),'Dark Archon source effect ends after 15 ticks');
  assert.deepEqual(errors,[]);await page.locator('#field').screenshot({path:'/tmp/ministar-original-animations.png'});await page.setViewportSize({width:1100,height:1240});assert.equal(await page.evaluate(()=>window.__originalVisual.deaths()),13);await page.locator('#field').screenshot({path:'/tmp/ministar-original-deaths.png'});console.log('Original layered sprites, source loop, range variants, death end timing and 13 original corpse scenes passed.');
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
