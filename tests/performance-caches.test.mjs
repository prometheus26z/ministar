import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as LaneBattle} from '../dist/autobattle.js';
import {UnitGrid} from '../dist/spatial.js';
import {advanceUnitMovement} from '../dist/action-control.js';
import {resolveWeapon,WEAPON_CACHE_METRICS} from '../dist/combat-rules.js';
// Match autobattle's versioned module identity (two URLs yield two caches).
import {RESEARCH,invalidateAbilityRequirements} from '../dist/economy.js?v=0.16.25-stall-ui34';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const data=read('../dist/assets/data.json'),extra=read('../dist/rts-data.json');
Object.assign(data.units,extra.units);
Object.assign(data.graphics,extra.graphics,read('../dist/original-animation-data.json'));

test('presentation visibility uses fresh capability lists, skips full scans, and leaves simulation untouched',()=>{
 const b=new LaneBattle(data,{race:'terran',enemyRace:'terran'});b.begin();
 const enemy=b.create(0,1,640,850),friend=b.create(0,0,640,850),decoy=b.create(65,0,100,1500);
 let visited=0;Object.defineProperty(decoy,'alive',{configurable:true,get(){visited++;return true}});
 b.spatial=null;
 assert.equal(b.hasArbiterAura(enemy),false);assert.ok(visited>0);
 visited=0;
 b.withPresentationQueries(()=>{
  assert.equal(b.hasArbiterAura(enemy),false);
  assert.equal(b.detectedBy(0,enemy),false);
  assert.equal(b.canSee(0,enemy),true);
  assert.equal(visited,0,'unrelated units should not be visited for aura or detector queries');
  assert.equal(b.presentationQueries.byId,null);
  assert.equal(b.spatial,null);
 });
 assert.equal(b.presentationQueries,null);
 const arbiter=b.create(71,1,enemy.x,enemy.y),detector=b.create(9,0,enemy.x,enemy.y);
 b.withPresentationQueries(()=>{
  assert.ok(b.presentationQueries.arbiters.has(arbiter));
  assert.ok(b.presentationQueries.detectors.has(detector));
  assert.equal(b.presentationQueries.byId.get(enemy.id),enemy);
  assert.equal(b.hasArbiterAura(enemy),true);
  assert.equal(b.canSee(0,enemy),true);
 },{byId:true});
 detector.alive=false;
 b.withPresentationQueries(()=>assert.equal(b.canSee(0,enemy),false));
 arbiter.team=0;
 b.withPresentationQueries(()=>assert.equal(b.canSee(0,enemy),true));
 assert.throws(()=>b.withPresentationQueries(()=>{throw Error('render aborted')}),/render aborted/);
 assert.equal(b.presentationQueries,null);
 assert.equal(b.spatial,null);
 assert.equal(friend.team,0);
});

test('filtered ordered queries preserve original array order even for dense and negative coordinates',()=>{
 const units=Array.from({length:240},(_,id)=>({id:239-id,x:-160+(id%20)*14,y:-130+Math.floor(id/20)*11,alive:true,r:8,def:{building:false,detector:false}}));
 const grid=new UnitGrid(units,32);
 for(const point of [{x:-150,y:-140},{x:0,y:0},{x:128,y:-64}])for(const radius of [0,1,32,96,200,600]){
  const predicate=u=>u.id%3===0&&Math.hypot(u.x-point.x,u.y-point.y)<=radius;
  assert.deepEqual(grid.queryFilteredOrdered(point,radius,predicate),units.filter(predicate));
 }
});

test('actual swept movement reuses candidates only inside the guaranteed segment length',()=>{
 const b=new LaneBattle(data,{race:'terran',enemyRace:'terran'});b.begin();b.map.rocks=[];b.map.water=[];
 const u=b.create(0,0,640,900),other=b.create(37,1,660,850);
 b.spatial=new UnitGrid(b.units);
 const original=b.movementLimit;let reused=0,fallback=0;
 b.movementLimit=function(unit,from,to,candidates){if(from===u){if(candidates)reused++;else fallback++}return original.call(this,unit,from,to,candidates)};
 const candidates=b.spatial.collisionCandidates(u,{x:u.x,y:u.y},{x:u.x+100,y:u.y},true);
 const context={unit:u,origin:{x:u.x,y:u.y},maxTravel:100,radius:u.r,candidates,spatial:b.spatial};
 advanceUnitMovement(b,u,{x:640,y:500},1/24,{finalWaypoint:false,collisionContext:context});
 assert.ok(reused>0,'actual swept collision should use the same broad phase');
 const beforeFallback=fallback;
 const tiny={...context,origin:{x:u.x,y:u.y},maxTravel:0};
 advanceUnitMovement(b,u,{x:640,y:500},1/24,{finalWaypoint:false,collisionContext:tiny});
 assert.ok(fallback>beforeFallback,'movement longer than the bound must query again');
 assert.equal(other.x,660);assert.equal(other.y,850);
 b.spatial=null;
});

test('weapon profiles retain values while caching immutable derived results and invalidating data changes',()=>{
 const b=new LaneBattle(data,{race:'terran',enemyRace:'terran'});b.begin();
 const u=b.create(0,0,640,900),enemy=b.create(0,1,640,800);
 b.laneMode=false;
 const before=WEAPON_CACHE_METRICS.hits,first=resolveWeapon(data,b,u,false),second=resolveWeapon(data,b,u,false);
 assert.strictEqual(first,second);assert.ok(WEAPON_CACHE_METRICS.hits>before);
 const copy=structuredClone(data),other=resolveWeapon(copy,b,u,false);
 assert.deepEqual(first,other);assert.notStrictEqual(first,other);
 const base=data.weapons[first.sourceWeaponId],original=base.damage;
 try{base.damage=original+3;const changed=resolveWeapon(data,b,u,false);assert.equal(changed.damage,first.damage+3);assert.notStrictEqual(first,changed)}
 finally{base.damage=original}
 assert.deepEqual(resolveWeapon(data,b,u,false),first);
 u.sourceCombatPlayer=7;const switched=resolveWeapon(data,b,u,false);
 assert.equal(switched.combatProfilePlayer,7);
 assert.deepEqual(b.weapon(u,enemy),switched);
});

test('ability requirements follow research, types and metadata invalidation without caching the outcome',()=>{
 const b=new LaneBattle(data,{race:'terran',enemyRace:'terran'});b.begin();
 const u=b.create(0,0,640,900),oldAbilities=u.def.abilities;
 const original=RESEARCH.__cacheTest,secondOriginal=RESEARCH.__cacheTest2;
 try{
  u.def={...u.def,abilities:['stim','cacheAbility','burrow']};
  RESEARCH.__cacheTest={ability:'cacheAbility',types:[0]};
  RESEARCH.__cacheTest2={ability:'cacheAbility',types:[0]};
  invalidateAbilityRequirements();
  assert.ok(!b.availableAbilities(u).includes('cacheAbility'));
  b.researched.add('__cacheTest');assert.ok(!b.availableAbilities(u).includes('cacheAbility'));
  b.researched.add('__cacheTest2');assert.ok(b.availableAbilities(u).includes('cacheAbility'));
  b.researched=new Set();assert.ok(!b.availableAbilities(u).includes('cacheAbility'));
  RESEARCH.__cacheTest.types=[37];RESEARCH.__cacheTest2.types=[37];invalidateAbilityRequirements();
  assert.ok(b.availableAbilities(u).includes('cacheAbility'));
  u.type=37;assert.ok(!b.availableAbilities(u).includes('cacheAbility'));
  assert.deepEqual(b.availableAbilities({...u,type:0,def:{abilities:['cacheAbility','stim']}}),['cacheAbility']);
 }finally{if(original===undefined)delete RESEARCH.__cacheTest;else RESEARCH.__cacheTest=original;if(secondOriginal===undefined)delete RESEARCH.__cacheTest2;else RESEARCH.__cacheTest2=secondOriginal;invalidateAbilityRequirements();u.def={...u.def,abilities:oldAbilities}}
});
