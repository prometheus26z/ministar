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
const counts=list(process.env.PROFILE_COUNT,[120,360,600]),scenes=process.env.PROFILE_SCENE?.split(',')||['march','contact'];
const warmup=Math.max(0,Number(process.env.PROFILE_WARMUP??10)),measured=Math.max(1,Number(process.env.PROFILE_STEPS??60)),repetitions=Math.max(1,Number(process.env.PROFILE_RUNS??1));
const percentile=(values,p)=>values[Math.min(values.length-1,Math.floor((values.length-1)*p))];
for(const count of counts)for(const scene of scenes){
 const allTimes=[],runs=[];let targetChecks=0;
 for(let run=0;run<repetitions;run++){
  let seed=123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),oldRandom=Math.random;Math.random=random;
  try{
   const b=new Battle(data,{race:'terran',enemyRace:'terran',random});b.begin();b.botStep=()=>{};b.waveClock=1e9;
   for(let i=0;i<count;i++){const team=i%2,n=Math.floor(i/2),u=b.create([0,65,37][n%3],team,120+(n%24)*44,scene==='contact'?930+team*100+Math.floor(n/24)*4:(team?180:1800)+(team?1:-1)*Math.floor(n/24)*32);u.order='attackmove';u.laneArmy=true;u.laneOffset=(n%12-5.5)*24;b.setAdvanceGoal(u,b.laneObjective(team));u.laneObjectiveId=b.laneObjective(team).id}
   let checks=0;const can=b.canAttackTarget;b.canAttackTarget=function(...args){checks++;return can.apply(this,args)};
   const times=[];for(let i=0;i<warmup+measured;i++){const start=performance.now();b.step(1/30);if(i>=warmup)times.push(performance.now()-start)}
   allTimes.push(...times);targetChecks+=checks;const sorted=[...times].sort((a,b)=>a-b);
   runs.push({run:run+1,medianMs:+percentile(sorted,.5).toFixed(3),p95Ms:+percentile(sorted,.95).toFixed(3),targetChecks:checks});
  }finally{Math.random=oldRandom}
 }
 allTimes.sort((a,b)=>a-b);
 results.push({count,scene,repetitions,warmupSteps:warmup,measuredSteps:measured,medianMs:+percentile(allTimes,.5).toFixed(3),p95Ms:+percentile(allTimes,.95).toFixed(3),p99Ms:+percentile(allTimes,.99).toFixed(3),targetChecksPerRun:Math.round(targetChecks/repetitions),runs});
}
console.log(JSON.stringify({node:process.version,results},null,2));
