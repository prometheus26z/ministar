// Reproducible CPU-only simulation profile; not a phone FPS measurement.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=path.resolve(process.argv[2]||'.');
const {Battle}=await import(pathToFileURL(path.join(root,'dist/autobattle.js')));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const data=read('dist/assets/data.json'),extra=read('dist/rts-data.json');
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,read('dist/original-animation-data.json'));
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
  let seed=123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),oldRandom=Math.random;Math.random=random;
  try{
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
   let checks=0;const can=b.canAttackTarget;b.canAttackTarget=function(...args){checks++;return can.apply(this,args)};
   for(const method of Object.keys(operations)){const original=b[method].bind(b);b[method]=(...args)=>{operations[method]++;return original(...args)}}
   const times=[];for(let i=0;i<warmup+measured;i++){const start=performance.now();b.step(dt);if(i>=warmup)times.push(performance.now()-start)}
   allTimes.push(...times);targetChecks+=checks;for(const key of Object.keys(totalOperations))totalOperations[key]+=operations[key];const sorted=[...times].sort((a,b)=>a-b);
   runs.push({run:run+1,medianMs:+percentile(sorted,.5).toFixed(3),p95Ms:+percentile(sorted,.95).toFixed(3),targetChecks:checks,operations:{...operations}});
  }finally{Math.random=oldRandom}
 }
 allTimes.sort((a,b)=>a-b);
 results.push({count,scene,dt,dtHz:1/dt,repetitions,warmupSteps:warmup,measuredSteps:measured,medianMs:+percentile(allTimes,.5).toFixed(3),p95Ms:+percentile(allTimes,.95).toFixed(3),p99Ms:+percentile(allTimes,.99).toFixed(3),targetChecksPerRun:Math.round(targetChecks/repetitions),operationsPerRun:Object.fromEntries(Object.entries(totalOperations).map(([key,value])=>[key,Math.round(value/repetitions)])),runs});
}
console.log(JSON.stringify({node:process.version,results},null,2));
