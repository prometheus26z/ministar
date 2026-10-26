import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as EconomyBattle} from '../dist/economy.js';
import {Battle as LaneBattle} from '../dist/autobattle.js';
import {Battle as CombatBattle} from '../dist/core.js';
import {isFullyBurrowed} from '../dist/movement.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
Object.assign(data.units,JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url))).units);
const addons=[[106,107],[106,108],[114,115],[116,117],[116,118],[113,120]];

test('all Terran add-on anchors align their footprints at the right edge and bottom edge',()=>{
 const battle=new EconomyBattle(data,{race:'terran'});
 for(const [parentType,addonType] of addons){
  const parent=battle.create(parentType,0,640,1008),[pw,ph]=battle.footprint(parentType),[aw,ah]=battle.footprint(addonType),point=battle.addonPoint(parent,addonType);
  assert.deepEqual(point,{x:640+pw/2+aw/2,y:1008+ph/2-ah/2},`${parentType} -> ${addonType}`);
  assert.equal(point.x-aw/2,parent.x+pw/2,'right edges touch');
  assert.equal(point.y+ah/2,parent.y+ph/2,'bottom edges align');
  assert.equal((point.x-aw/2)%32,0,'add-on starts on a build tile');
  assert.equal((point.y-ah/2)%32,0,'add-on starts on a build tile');
 }
});

test('base-game add-on construction creates the module at the checked anchor',()=>{
 const battle=new EconomyBattle(data,{race:'terran'});battle.money=10000;battle.gas=10000;
 const parent=battle.create(114,0,640,1008),point=battle.addonPoint(parent,115);
 assert.equal(battle.addon(parent,115),true,battle.lastError);
 const addon=battle.units.find(unit=>unit.parent===parent.id);
 assert.ok(addon);assert.deepEqual({x:addon.x,y:addon.y},point);
 assert.equal(battle.addon(parent,115),false,'a second add-on is refused');
});

function movementBattle(){return new CombatBattle(data,{race:'terran'})}
function crossingLimit(battle,blocker){
 const mover=battle.units.find(unit=>unit.team===0&&unit.type===0)||battle.create(0,0,200,600);
 blocker.x=300;blocker.y=600;
 return battle.movementLimit(mover,{x:200,y:600},{x:400,y:600});
}

test('completed burrowed Zerg units and Spider Mines do not block ground movement',()=>{
 for(const type of [37,38,103,13]){
  const battle=movementBattle(),unit=battle.create(type,1,300,600);unit.burrowed=true;
  if(type===103)unit.lurkerState='burrowed';else unit.burrowState='burrowed';
  assert.equal(isFullyBurrowed(unit),true,`type ${type} burrow state`);
  assert.equal(crossingLimit(battle,unit),200,`type ${type} leaves ground collision disabled`);
 }
});

test('burrowing and unburrowing keep collision until the transition boundary',()=>{
 for(const type of [37,103]){
  const battle=movementBattle(),unit=battle.create(type,1,300,600);
  if(type===103){
   unit.burrowed=true;unit.lurkerState='burrowing';
   assert.equal(isFullyBurrowed(unit),false);assert.ok(crossingLimit(battle,unit)<200);
   unit.lurkerState='burrowed';assert.equal(crossingLimit(battle,unit),200);
   unit.lurkerState='unburrowing';assert.equal(isFullyBurrowed(unit),false);assert.ok(crossingLimit(battle,unit)<200);
  }else{
   unit.burrowState='burrowing';unit.burrowed=false;
   assert.ok(crossingLimit(battle,unit)<200);
   unit.burrowState='burrowed';unit.burrowed=true;assert.equal(crossingLimit(battle,unit),200);
   unit.burrowState='unburrowing';assert.equal(isFullyBurrowed(unit),false);assert.ok(crossingLimit(battle,unit)<200);
  }
 }
});

test('unburrowing an overlapped unit lets the mover escape without displacement',()=>{
 const battle=movementBattle(),mover=battle.create(0,0,305,600),burrowed=battle.create(37,1,300,600);
 burrowed.burrowed=true;burrowed.burrowState='unburrowing';
 const before={x:burrowed.x,y:burrowed.y};
 assert.ok(battle.movementLimit(mover,{x:305,y:600},{x:330,y:600})>0,'motion away from the burrowed center remains possible');
 assert.deepEqual({x:burrowed.x,y:burrowed.y},before,'collision recovery never pushes the blocker');
});

test('lane deployment can place a ground unit on a completed burrowed unit',()=>{
 const battle=new LaneBattle(data,{race:'terran',enemyRace:'zerg'}),burrowed=battle.create(37,1,640,1024),marine=data.units[0];
 burrowed.burrowed=true;burrowed.burrowState='burrowed';
 const point=battle.deploymentPoint(marine,0,{x:640,y:1024});
 assert.ok(point);
 assert.deepEqual(point,{x:640,y:1024});
});
