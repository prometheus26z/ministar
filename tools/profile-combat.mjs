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
for(const count of (process.env.PROFILE_COUNT?[Number(process.env.PROFILE_COUNT)]:[120,360,600]))for(const scene of (process.env.PROFILE_SCENE?[process.env.PROFILE_SCENE]:['march','contact'])){
 let seed=123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),oldRandom=Math.random;Math.random=random;
 try{
  const b=new Battle(data,{race:'terran',enemyRace:'terran',random});b.begin();b.botStep=()=>{};b.waveClock=1e9;
  for(let i=0;i<count;i++){const team=i%2,n=Math.floor(i/2),u=b.create([0,65,37][n%3],team,120+(n%24)*44,scene==='contact'?930+team*100+Math.floor(n/24)*4:(team?180:1800)+(team?1:-1)*Math.floor(n/24)*32);u.order='attackmove';u.laneArmy=true;u.laneOffset=(n%12-5.5)*24;b.setAdvanceGoal(u,b.laneObjective(team));u.laneObjectiveId=b.laneObjective(team).id}
  let checks=0;const can=b.canAttackTarget;b.canAttackTarget=function(...args){checks++;return can.apply(this,args)};
  const times=[];for(let i=0;i<70;i++){const start=performance.now();b.step(1/30);if(i>=10)times.push(performance.now()-start)}times.sort((a,b)=>a-b);
  results.push({count,scene,medianMs:+times[30].toFixed(3),p95Ms:+times[57].toFixed(3),targetChecks:checks});
 }finally{Math.random=oldRandom}
}
console.log(JSON.stringify({node:process.version,results},null,2));
