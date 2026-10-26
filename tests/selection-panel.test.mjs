import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectionPanelModel,inspectionDetailRows} from '../dist/selection-panel.js';
import {UNIT_UI} from '../dist/selection-ui-data.js';
import {formatSupply} from '../dist/presentation.js';
import {Battle} from '../dist/autobattle.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const battle=()=>{const value=new Battle(data,{race:'zerg',enemyRace:'zerg',difficulty:'easy'});value.phase='battle';return value};

test('inspection model rounds displayed vitals and preserves actual half supply',()=>{
 const b=battle(),unit=b.create(37,0,100,100);unit.hp=34.2;unit.killCount=2;
 const model=selectionPanelModel(b,unit,data);
 assert.deepEqual(model.hp,{current:35,max:35});assert.equal(model.killCount,2);assert.equal(model.supply,.5);assert.equal(formatSupply(model.supply,30),'1/30');assert.equal(formatSupply(1.5,30),'2/30');assert.equal(formatSupply(199.5,200),'200/200');assert.equal(formatSupply(200.5,200),'201/200');
});

test('weapon icons follow resolved weapon IDs, collapse duplicate air weapons, and show upgrade level',()=>{
 const b=battle(),unit=b.create(65,0,100,100);unit.def={...unit.def,combatUpgrades:{...unit.def.combatUpgrades,8:2}};
 const model=selectionPanelModel(b,unit,data);
 assert.equal(model.weapons.length,1);assert.equal(model.weapons[0].sourceId,64);assert.equal(model.weapons[0].level,unit.def.combatUpgrades[UNIT_UI.weapons[64].damageUpgrade]);
 const dragoon=b.create(66,0,100,140),dragoonModel=selectionPanelModel(b,dragoon,data);
 assert.equal(dragoonModel.weapons.length,1,'a Dragoon does not get a duplicate air icon');
});

test('energy is owner-only and Lurker weapon appears only after a complete burrow',()=>{
 const b=battle(),ghost=b.create(1,0,100,100),enemy=b.create(1,1,100,140);
 assert.ok(selectionPanelModel(b,ghost,data).energy);assert.equal(selectionPanelModel(b,enemy,data).energy,null);
 const lurker=b.create(103,0,100,180);assert.equal(selectionPanelModel(b,lurker,data).weapons.length,0);
 lurker.burrowed=true;lurker.lurkerState='burrowed';assert.ok(selectionPanelModel(b,lurker,data).weapons.length>0);
});

test('Carrier and Reaver show live hangar capacities and weapons in details',()=>{
 const b=battle(),carrier=b.create(72,0,100,100),reaver=b.create(83,0,100,140);
 const carrierModel=selectionPanelModel(b,carrier,data),reaverModel=selectionPanelModel(b,reaver,data);assert.equal(carrierModel.hangar.max,b.hangarSnapshot(carrier).capacity);assert.equal(reaverModel.hangar.max,b.hangarSnapshot(reaver).capacity);assert.ok(carrierModel.weapons.length>0);assert.ok(reaverModel.weapons.length>0);
 assert.ok(inspectionDetailRows(carrierModel).some(row=>row.label==='인터셉터'));
});

test('a lethal weapon hit credits the live source unit once for its inspection kill count',()=>{
 const b=battle(),attacker=b.create(0,0,100,100),target=b.create(0,1,140,100);target.hp=1;
 b.hitUnit(target,10,0,3,null,attacker);assert.equal(target.alive,false);assert.equal(attacker.killCount,1);
 b.die(target,0,attacker.id);assert.equal(attacker.killCount,1);
});
