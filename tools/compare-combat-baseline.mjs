// Read-only cross-version tick oracle. Usage:
// node tools/compare-combat-baseline.mjs /path/to/baseline [count] [scene] [ticks] [seed]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const current=path.resolve('.'),baseline=path.resolve(process.argv[2]||'/tmp/ministar-before-50817d6');
const count=Number(process.argv[3]||120),scene=process.argv[4]||'contact',ticks=Number(process.argv[5]||150),seed=Number(process.argv[6]||123);
const load=async root=>{
 const {Battle}=await import(pathToFileURL(path.join(root,'dist/autobattle.js')));
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
 const data=read('dist/assets/data.json'),extra=read('dist/rts-data.json');
 Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,read('dist/original-animation-data.json'));
 return {Battle,data};
};
const versions=await Promise.all([load(baseline),load(current)]);
const randomizer=initial=>{let state=initial;return()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296)};
const scoped=(random,fn)=>{const old=Math.random;Math.random=random;try{return fn()}finally{Math.random=old}};
function prepare({Battle,data}){
 const random=randomizer(seed),b=scoped(random,()=>{
  const b=new Battle(data,{race:'terran',enemyRace:'terran',random});b.begin();
  if(scene!=='natural'){b.botStep=()=>{};b.waveClock=1e9}
  else for(const team of [0,1])for(let i=0;i<6;i++){
   const producer=b.create(111,team,200+i*150,3100);producer.productionOnly=true;
  }
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
   if(scene==='outpost-ring'){u.target=null;u.goal=null;u.path=[]}
   else{b.setAdvanceGoal(u,b.laneObjective(team));u.laneObjectiveId=b.laneObjective(team).id}
  }
  return b;
 });
 return {b,random};
}
const keys=['id','type','team','alive','x','y','hp','shield','energy','cooldown','action','animTime','visualTime','direction','order','goal','path','anchor','buffs','cloaked','cloakLevel','cloakTimer','burrowed','burrowState','lurkerState','lurkerSpines','sieged','attackControl','attackGeneration','attackRepeatReady','attackPath','attackTargetPoint','attackSlotTargetId','waitingAttackSlot','healing','healPath','healSpark','motion','unreachableTargets','aggroTarget','aggroUntil','acidSporeTimers','deathDuration','deathAge','loaded','hidden','productionOnly','queue','construction','egg','sourceCombatPlayer','owner','laneObjectiveId'];
function snapshot(b){
 const unit=u=>({...Object.fromEntries(keys.filter(k=>Object.hasOwn(u,k)).map(k=>[k,u[k]])),targetId:u.target?.id??null,healTargetId:u.healTarget?.id??null});
 const projectile=p=>({x:p.x,y:p.y,endX:p.endX,endY:p.endY,sourceId:p.source?.id??null,targetId:p.target?.id??null,weapon:p.weapon,damage:p.damage,elapsed:p.elapsed,previousTargetIds:p.previousTargetIds});
 return JSON.stringify({time:b.time,simFrame:b.simFrame,units:b.units.map(unit),projectiles:b.projectiles.map(projectile),pendingProjectiles:b.pendingProjectiles.map(projectile),projectileVisuals:b.projectileVisuals,areas:b.areas,effects:b.effects,attackReservations:[...b.attackReservations].map(([id,slots])=>[id,slots.map(({unit,...slot})=>({...slot,unitId:unit.id}))]),money:b.money,gas:b.gas,botMoney:b.botMoney,botGas:b.botGas,kills:b.kills,losses:b.losses,produced:b.produced,waveClock:b.waveClock,pendingDeployments:b.pendingDeployments});
}
const states=versions.map(prepare);
assert.equal(snapshot(states[0].b),snapshot(states[1].b),'initial state mismatch');
for(let i=0;i<ticks;i++){
 for(const {b,random}of states)scoped(random,()=>b.step(1/24));
 const a=snapshot(states[0].b),b=snapshot(states[1].b);
 if(a!==b){
  const before=JSON.parse(a),after=JSON.parse(b);
  const unitIndex=before.units.findIndex((u,j)=>JSON.stringify(u)!==JSON.stringify(after.units[j]));
  const detail=unitIndex<0?{before:{...before,units:undefined},after:{...after,units:undefined}}:{unitIndex,before:before.units[unitIndex],after:after.units[unitIndex]};
  throw Error(`diverged at tick ${i+1}: ${JSON.stringify(detail).slice(0,4000)}`);
 }
 assert.equal(states[1].b.spatial,null);
}
console.log(JSON.stringify({equal:true,baseline,path:current,count,scene,ticks,seed,finalUnits:states[1].b.units.length}));
