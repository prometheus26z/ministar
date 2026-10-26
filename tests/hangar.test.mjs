import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLaneBattle} from './combat-test-data.mjs';

test('Carrier and Reaver initialize to source capacities without affecting supply',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),reaver=battle.create(83,0,800,900),expectedSupply=carrier.def.supply+reaver.def.supply;
 assert.deepEqual(battle.hangarSnapshot(carrier),{kind:'carrier',capacity:8,total:8,docked:8,active:0});
 assert.deepEqual(battle.hangarSnapshot(reaver),{kind:'reaver',capacity:10,inside:10,active:0});
 assert.equal(battle.supply,expectedSupply,'hidden ammunition children have no supply cost');
 assert.equal(battle.units.filter(unit=>unit.type===73).length,8);
 assert.equal(battle.units.filter(unit=>unit.type===85).length,0,'Reaver ammunition is not deployed as a unit before launch');
});

test('reinitializing inventory preserves damage and ammunition; refill stays within capacity',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),reaver=battle.create(83,0,800,900),children=battle.units.filter(unit=>unit.type===73);
 children[0].hp-=7;battle.initializeHangar(carrier);assert.equal(children[0].hp,children[0].maxHp-7);
 battle.initializeHangar(carrier,4);assert.equal(battle.hangarSnapshot(carrier).total,4);
 for(let i=0;i<1000;i++)battle.refillCarrier(carrier,8);
 assert.equal(battle.hangarSnapshot(carrier).total,8);
 battle.initializeHangar(reaver,3);battle.initializeHangar(reaver);assert.equal(battle.hangarSnapshot(reaver).inside,3);
 assert.equal(battle.refillReaver(reaver,10),7);assert.equal(battle.refillReaver(reaver,10),0);assert.equal(battle.hangarSnapshot(reaver).inside,10);
});

test('ownership transfer updates every docked fighter profile without filling inventory',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),children=battle.units.filter(unit=>unit.type===73);
 children[0].hp-=9;const ids=children.map(unit=>unit.id);
 assert.equal(battle.transferOwnershipWithChildren(carrier,1,3),true);
 assert.equal(carrier.team,1);assert.equal(carrier.commanderId,3);assert.equal(carrier.sourceCombatPlayer,7);
 for(const fighter of children){assert.equal(fighter.team,1);assert.equal(fighter.commanderId,3);assert.equal(fighter.sourceCombatPlayer,7)}
 assert.deepEqual(battle.units.filter(unit=>unit.type===73).map(unit=>unit.id),ids);
 assert.equal(children[0].hp,children[0].maxHp-9);assert.equal(battle.hangarSnapshot(carrier).total,8);
});

test('docked fighters are hidden, unselectable, and immune to ordinary splash damage',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),fighter=battle.units.find(unit=>unit.type===73);
 assert.equal(fighter.hidden,true);assert.equal(fighter.loaded,carrier.id);
 assert.deepEqual(battle.select([fighter.id],false),[]);
 const hp=fighter.hp,shield=fighter.shield;assert.equal(battle.hurt(fighter,50,1,3),0);assert.equal(fighter.hp,hp);assert.equal(fighter.shield,shield);
});

test('a hallucinated Carrier never keeps or replenishes fighters',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900);carrier.hallucination=true;battle.clearHangar(carrier);
 assert.equal(battle.hangarSnapshot(carrier).total,0);
 assert.equal(battle.initializeHangar(carrier),null);
 assert.equal(battle.refillCarrier(carrier,8),0);
 assert.ok(battle.units.filter(unit=>unit.type===73).every(unit=>!unit.alive));
});
