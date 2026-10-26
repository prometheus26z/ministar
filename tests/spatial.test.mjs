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

}
const snapshot=b=>({units:b.units.map(u=>[u.id,u.type,u.team,u.x,u.y,u.hp,u.shield,u.energy,u.alive,u.target?.id,u.action,u.lurkerState,u.buffs,u.path,u.healTarget?.id]),projectiles:b.projectiles.map(p=>[p.x,p.y,p.endX,p.endY,p.target?.id]),kills:b.kills,losses:b.losses,money:b.money});
const seeded=()=>{let seed=47;return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)};
const run=(random,fn)=>{const old=Math.random;Math.random=random;try{return fn()}finally{Math.random=old}};

test('spatial combat preserves full-scan targets, damage, healing, and movement each step',()=>{
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

test('local collision queries return the exact nearby superset without a full-army fallback',()=>{
 const units=Array.from({length:240},(_,id)=>({id,x:(id%24-12)*31,y:(Math.floor(id/24)-5)*27,r:9,alive:true,def:{sight:64,footprint:id%37===0?[224,128]:[18,18]}}));
 const grid=new UnitGrid(units,32);
 for(const point of [{x:0,y:0},{x:-190,y:65},{x:320,y:-81}])for(const radius of [0,12,48,128,320]){
  const expected=units.filter(u=>Math.abs(u.x-point.x)<=radius&&Math.abs(u.y-point.y)<=radius);
  assert.deepEqual(new Set(grid.queryLocal(point,radius)),new Set(expected),JSON.stringify({point,radius}));
 }
});

test('one local collision candidate set matches the legacy query in every movement direction',()=>{
 const battle=new Battle(data,{race:'terran',enemyRace:'terran'});battle.map.rocks=[];battle.map.water=[];
 const mover=battle.create(65,0,640,900);let seed=71;
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<180;i++){
  const type=i%19===0?174:[0,37,65][i%3],team=i%2;
  battle.create(type,team,590+random()*100,850+random()*100);
 }
 battle.spatial=new UnitGrid(battle.units);
 const from={x:mover.x,y:mover.y},travel=48,radius=travel+mover.r+battle.spatial.maxExtent;
 const candidates=battle.spatial.queryLocal(from,radius);
 for(let direction=0;direction<16;direction++){
  const angle=direction*Math.PI/8,to={x:from.x+Math.cos(angle)*travel,y:from.y+Math.sin(angle)*travel};
  const legacy=battle.movementLimit(mover,from,to),optimized=battle.movementLimit(mover,from,to,candidates);
  assert.equal(optimized,legacy,`movement direction ${direction}`);
 }
 battle.spatial=null;
});

test('any-match queries preserve the legacy broad-phase fallback and handle both bucketed coordinate axes',()=>{
 const make=(id,x,y,alive=true)=>({id,x,y,r:10,alive,def:{sight:320,footprint:[64,64]}});
 const units=[make(0,-257,-129),make(1,-128,-128),make(2,0,0),make(3,128,128),make(4,257,257)];
 const grid=new UnitGrid(units,32),near=(point,r,predicate)=>grid.queryAny(point,r,predicate,units);
 for(const point of [{x:-128,y:-128},{x:0,y:0},{x:256,y:256}])for(const radius of [0,1,32,128,512])for(const wanted of [-1,0,1,2,3,4,5]){
  const predicate=u=>u.id===wanted;
  assert.equal(near(point,radius,predicate),grid.query(point,radius,units).some(predicate),JSON.stringify({point,radius,wanted}));
 }
 const packed=Array.from({length:9},(_,id)=>make(id,id<4?0:512,0)),packedGrid=new UnitGrid(packed,32);
 assert.equal(packedGrid.queryAny({x:0,y:0},0,u=>u.id===8,packed),true,'dense fallback intentionally checks the same full-array superset as query()');
 const dead=units[2];dead.alive=false;grid.update(dead);
 assert.equal(grid.queryAny({x:0,y:0},0,u=>u.id===dead.id,units),false);
});

test('bounded exact any-match predicates need no full-array fallback',()=>{
 const units=Array.from({length:300},(_,id)=>({id,x:(id%30-15)*41,y:(Math.floor(id/30)-5)*37,team:id%2,alive:id%17!==0,r:8,def:{sight:64,footprint:[16,16]}})),grid=new UnitGrid(units,32);
 for(const point of [{x:0,y:0},{x:-220,y:75},{x:405,y:-80}])for(const radius of [0,24,64,110,260]){
  const predicate=u=>u.alive&&u.team===1&&dist(point,u)<radius;
  assert.equal(grid.queryAny(point,radius,predicate),units.some(predicate),JSON.stringify({point,radius}));
 }
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
