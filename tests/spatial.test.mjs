import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UnitGrid} from '../dist/spatial.js';
import {Battle} from '../dist/autobattle.js';
import {clamp,dist} from '../dist/core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const data=read('../dist/assets/data.json'),extra=read('../dist/rts-data.json');
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,read('../dist/original-animation-data.json'));

// Deliberately keep the old full-array broad phase and pair loop as an oracle.
class FullScanBattle extends Battle{
 nearby(){return this.units}
 simulateStep(dt){this.spatial=null;super.simulateStep(dt)}
 separateUnits(mobile,dt){
  for(let i=0;i<mobile.length;i++)for(let j=i+1;j<mobile.length;j++){
   const a=mobile[i],b=mobile[j];if(a.def.air!==b.def.air)continue;
   const d=dist(a,b),r=a.r+b.r;if(d>=r)continue;
   const dx=d?(a.x-b.x)/d:1,dy=d?(a.y-b.y)/d:0,p=Math.min((r-d)/2,dt*80);
   for(const [u,s]of [[a,1],[b,-1]]){const x=clamp(u.x+dx*p*s,16,1264),y=clamp(u.y+dy*p*s,16,2032);if(u.def.air||!this.map.blocked(x,y,u.r*.5)){u.x=x;u.y=y}}
  }
 }
}
const snapshot=b=>({units:b.units.map(u=>[u.id,u.type,u.team,u.x,u.y,u.hp,u.shield,u.energy,u.alive,u.target?.id,u.action,u.lurkerState,u.buffs,u.path,u.healTarget?.id]),projectiles:b.projectiles.map(p=>[p.x,p.y,p.endX,p.endY,p.target?.id]),kills:b.kills,losses:b.losses,money:b.money});
const seeded=()=>{let seed=47;return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)};
const run=(random,fn)=>{const old=Math.random;Math.random=random;try{return fn()}finally{Math.random=old}};

test('spatial combat preserves full-scan targets, damage, healing, movement and pair order each step',()=>{
 const make=Type=>{const b=new Type(data,{race:'terran',enemyRace:'terran',random:seeded()});b.begin();b.botStep=()=>{};b.waveClock=1e9;
  const types=[0,65,37,34,103,61,84,66,39,5,12,45];
  for(let i=0;i<96;i++){const n=Math.floor(i/2),u=b.create(types[n%types.length],i%2,220+(n%12)*70,850+(i%2)*150+Math.floor(n/12)*7);u.hp*=.8;u.order='attackmove';u.laneArmy=true;u.laneOffset=(n%6-2.5)*24;b.setAdvanceGoal(u,b.laneObjective(u.team));u.laneObjectiveId=b.laneObjective(u.team).id}
  b.areas.push({kind:'storm',x:500,y:940,r:64,left:3,duration:3,team:0});return b};
 const fast=make(Battle),reference=make(FullScanBattle),a=seeded(),b=seeded();
 for(let i=0;i<180;i++){run(a,()=>fast.step(1/30));run(b,()=>reference.step(1/30));assert.deepEqual(snapshot(fast),snapshot(reference),`divergence at step ${i}`);assert.equal(fast.spatial,null)}
});

test('grid queries include boundary centers and preserve array order after cell changes and new spawns',()=>{
 const make=(id,x,y,r=10)=>({id,x,y,r,alive:true,def:{sight:320,footprint:[128,96]}}),a=make(8,127,128),b=make(2,128,128),c=make(6,256,128),grid=new UnitGrid([a,b,c]);
 assert.deepEqual(grid.query({x:128,y:128},1),[a,b]);
 a.x=256;grid.update(a);assert.deepEqual(grid.query(c,0),[a,c]);
 const spawn=make(20,256,128);grid.add(spawn);assert.deepEqual(grid.query(c,0),[a,c,spawn]);
 c.alive=false;grid.update(c);assert.deepEqual(grid.query(spawn,0),[a,spawn]);
 assert.equal(grid.maxExtent,80);assert.equal(grid.byId.get(2),b);
});

test('same-step recalls, new units, deaths and between-step external edits refresh the broad phase',()=>{
 const b=new Battle(data,{race:'protoss',enemyRace:'protoss'});b.begin();b.botStep=()=>{};b.waveClock=1e9;
 const caster=b.create(71,0,300,700),friend=b.create(65,0,1100,1000);caster.energy=200;
 b.spatial=new UnitGrid(b.units);const old=Math.random;Math.random=()=>.5;
 try{assert.equal(b.cast(caster,'recall',{x:1100,y:1000}),true)}finally{Math.random=old}
 assert.ok(b.nearby(caster,80).includes(friend));assert.ok(!b.nearby({x:1100,y:1000},80).includes(friend));
 const spawned=b.create(0,1,320,700);assert.ok(b.nearby(caster,40).includes(spawned));b.die(spawned,0);
 assert.equal(b.acquireTarget(friend),null);
 b.spatial=null;friend.x=1150;friend.y=1900;b.step(1/30);assert.equal(b.spatial,null);assert.ok(b.nearby(friend,1).includes(friend));
});

test('building obstacle membership tracks construction starts, deaths and new buildings in the same step',()=>{
 const b=new Battle(data,{race:'terran',enemyRace:'terran'});b.begin();b.spatial=new UnitGrid(b.units);
 const depot=b.create(109,0,200,1000);depot.construction={started:false};assert.equal(b.map.blocked(200,1000,10),false);
 depot.construction.started=true;assert.equal(b.map.blocked(200,1000,10),true);
 b.die(depot,1);assert.equal(b.map.blocked(200,1000,10),false);b.spatial=null;
});

test('corpse cleanup retains complete death visuals and pending Lurker waves, then releases expired units',()=>{
 const b=new Battle(data,{race:'terran',enemyRace:'terran'});b.begin();b.botStep=()=>{};b.waveClock=1e9;
 const u=b.create(0,0,200,1000);b.die(u,1);b.time=u.deathDuration-.05;b.corpseCleanupClock=1;b.step(1/30);assert.ok(b.units.includes(u));
 b.time=u.deathDuration+.1;b.corpseCleanupClock=1;b.step(1/30);assert.ok(!b.units.includes(u));
 const lurker=b.create(103,0,200,1000);b.die(lurker,1);lurker.lurkerSpines=[{elapsed:0,nextTick:1000,endTick:1000}];b.time+=20;b.corpseCleanupClock=1;b.step(1/30);assert.ok(b.units.includes(lurker));
 lurker.lurkerSpines=[];b.corpseCleanupClock=1;b.step(1/30);assert.ok(!b.units.includes(lurker));
});
