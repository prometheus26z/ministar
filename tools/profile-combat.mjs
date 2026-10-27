// Reproducible CPU-only simulation profile; not a phone FPS measurement.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=path.resolve(process.argv[2]||'.');
const loadStart=performance.now();
const {Battle}=await import(pathToFileURL(path.join(root,'dist/autobattle.js')));
const moduleLoadMs=performance.now()-loadStart;
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const dataLoadStart=performance.now();
const data=read('dist/assets/data.json'),extra=read('dist/rts-data.json');
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,read('dist/original-animation-data.json'));
const dataLoadMs=performance.now()-dataLoadStart;
const instrument=process.env.PROFILE_INSTRUMENT==='1';
const legacyCore=process.env.PROFILE_DISABLE_C?await import(pathToFileURL(path.join(path.resolve(process.env.PROFILE_DISABLE_C),'dist/core.js'))):null;
let activeMetrics=null,weaponMetrics=null;
if(instrument){
 const version=read('package.json').version,url=name=>pathToFileURL(path.join(root,`dist/${name}.js`)).href+`?v=${version}`;
 const {UnitGrid}=await import(url('spatial'));
 ({WEAPON_CACHE_METRICS:weaponMetrics}=await import(url('combat-rules')));
 for(const method of ['query','queryFilteredOrdered','queryAny','collisionCandidates'])if(typeof UnitGrid.prototype[method]==='function'){
  const original=UnitGrid.prototype[method];
  UnitGrid.prototype[method]=function(...args){
   const result=original.apply(this,args),stats=activeMetrics;if(!stats)return result;
   stats[method]++;
   if(method==='query'||method==='queryFilteredOrdered'){
    if(method==='query'&&args[2]&&result===args[2])stats.denseFallback++;
    else{stats.sortCalls++;stats.sortedElements+=result.length}
   }
   return result;
  };
 }
}
const results=[];
const list=(value,fallback)=>value?value.split(',').map(Number).filter(n=>Number.isFinite(n)&&n>0):fallback;
const counts=list(process.env.PROFILE_COUNT,[120,360,600]),scenes=process.env.PROFILE_SCENE?.split(',')||['march','contact','outpost-ring'];
const dt=Math.max(1/240,Number(process.env.PROFILE_DT??1/24));
const warmup=Math.max(0,Number(process.env.PROFILE_WARMUP??30)),measured=Math.max(1,Number(process.env.PROFILE_STEPS??120)),repetitions=Math.max(1,Number(process.env.PROFILE_RUNS??3));
const percentile=(values,p)=>values[Math.min(values.length-1,Math.floor((values.length-1)*p))];
for(const count of counts)for(const scene of scenes){
 const allTimes=[],runs=[];let targetChecks=0;const totalOperations={path:0,approachPath:0,movementLimit:0,moveSafely:0};
 for(let run=0;run<repetitions;run++){
  const operations={path:0,approachPath:0,movementLimit:0,moveSafely:0};
  const metrics={query:0,queryFilteredOrdered:0,queryAny:0,collisionCandidates:0,denseFallback:0,sortCalls:0,sortedElements:0,finalCollisionReuse:0,finalCollisionFallback:0,maxVisualQueue:0,aliveUnitSteps:0,weaponHits:0,weaponMisses:0};
  let seed=123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),oldRandom=Math.random;Math.random=random;
  try{
   const setupStart=performance.now();
   const b=new Battle(data,{race:'terran',enemyRace:'terran',random});b.begin();b.botStep=()=>{};b.waveClock=1e9;
   for(let i=0;i<count;i++){
    const n=scene==='outpost-ring'?i:Math.floor(i/2),team=scene==='outpost-ring'?0:i%2,type=[0,65,37][n%3];let x,y;
    if(scene==='outpost-ring'){
     const target=b.enemyOutpost,spacing=32,ring=Math.floor(n/24),slot=n%24,halfW=(target.def.footprint?.[0]||224)/2+24+ring*spacing,halfH=(target.def.footprint?.[1]||96)/2+24+ring*spacing;
     if(slot<8){x=target.x-halfW+slot*2*halfW/7;y=target.y-halfH}
     else if(slot<16){x=target.x-halfW+(slot-8)*2*halfW/7;y=target.y+halfH}
     else if(slot<20){x=target.x-halfW;y=target.y-halfH+(slot-16)*2*halfH/3}
     else{x=target.x+halfW;y=target.y-halfH+(slot-20)*2*halfH/3}
    }else{
     const teamOffset=scene==='contact'?team*100:0;x=120+(n%24)*44;y=scene==='contact'?930+teamOffset+Math.floor(n/24)*4:(team?180:1800)+(team?1:-1)*Math.floor(n/24)*32;
    }
    const u=b.create(type,team,x,y);u.order='attackmove';u.laneArmy=scene!=='outpost-ring';u.laneOffset=(n%12-5.5)*24;
    if(scene==='outpost-ring'){u.target=null;u.order='attackmove';u.goal=null;u.path=[]}
    else{b.setAdvanceGoal(u,b.laneObjective(team));u.laneObjectiveId=b.laneObjective(team).id}
   }
   if(process.env.PROFILE_DISABLE_B)b.filteredNearby=(point,radius,predicate)=>b.nearby(point,radius).filter(predicate);
   if(legacyCore)b.moveSafely=legacyCore.Battle.prototype.moveSafely.bind(b);
   let checks=0;const can=b.canAttackTarget;b.canAttackTarget=function(...args){checks++;return can.apply(this,args)};
   for(const method of Object.keys(operations)){const original=b[method].bind(b);b[method]=(...args)=>{operations[method]++;if(instrument&&method==='movementLimit'&&args[1]===args[0])metrics[args[3]?'finalCollisionReuse':'finalCollisionFallback']++;return original(...args)}}
   const setupMs=performance.now()-setupStart,weaponStart=weaponMetrics?{...weaponMetrics}:null;
   const times=[];let warmupMs=0,measuredMs=0;activeMetrics=instrument?metrics:null;
   for(let i=0;i<warmup+measured;i++){
    const start=performance.now();b.step(dt);const elapsed=performance.now()-start;
    if(i>=warmup){times.push(elapsed);measuredMs+=elapsed;if(instrument){metrics.aliveUnitSteps+=b.units.filter(u=>u.alive&&!u.hidden&&!u.loaded&&!u.productionOnly).length;metrics.maxVisualQueue=Math.max(metrics.maxVisualQueue,b.projectileVisuals.length)}}else warmupMs+=elapsed;
   }
   activeMetrics=null;
   if(weaponStart){metrics.weaponHits=weaponMetrics.hits-weaponStart.hits;metrics.weaponMisses=weaponMetrics.misses-weaponStart.misses}
   allTimes.push(...times);targetChecks+=checks;for(const key of Object.keys(totalOperations))totalOperations[key]+=operations[key];const sorted=[...times].sort((a,b)=>a-b);
   runs.push({run:run+1,setupMs:+setupMs.toFixed(3),warmupMs:+warmupMs.toFixed(3),measuredMs:+measuredMs.toFixed(3),medianMs:+percentile(sorted,.5).toFixed(3),p95Ms:+percentile(sorted,.95).toFixed(3),targetChecks:checks,operations:{...operations},...(instrument?{metrics,meanAliveUnits:Math.round(metrics.aliveUnitSteps/measured)}:{})});
  }finally{activeMetrics=null;Math.random=oldRandom}
 }
 allTimes.sort((a,b)=>a-b);
 results.push({count,scene,dt,dtHz:1/dt,repetitions,warmupSteps:warmup,measuredSteps:measured,medianMs:+percentile(allTimes,.5).toFixed(3),p95Ms:+percentile(allTimes,.95).toFixed(3),p99Ms:+percentile(allTimes,.99).toFixed(3),targetChecksPerRun:Math.round(targetChecks/repetitions),operationsPerRun:Object.fromEntries(Object.entries(totalOperations).map(([key,value])=>[key,Math.round(value/repetitions)])),runs});
}
console.log(JSON.stringify({node:process.version,moduleLoadMs:+moduleLoadMs.toFixed(3),dataLoadMs:+dataLoadMs.toFixed(3),instrumented:instrument,results},null,2));
