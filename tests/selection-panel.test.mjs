import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectionPanelModel,inspectionDetailRows,selectionStatItems,inspectionEnergyMaximum} from '../dist/selection-panel.js';
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

test('all visible mana users expose runtime energy and Lurker weapon appears only after a complete burrow',()=>{
 const b=battle(),ghost=b.create(1,0,100,100),enemy=b.create(1,1,100,140);
 assert.deepEqual(selectionPanelModel(b,ghost,data).energy,{current:50,max:250});assert.deepEqual(selectionPanelModel(b,enemy,data).energy,{current:50,max:250});
 const ally=b.create(34,0,100,160);ally.commanderId=2;assert.deepEqual(selectionPanelModel(b,ally,data).energy,{current:50,max:250});
 assert.equal(inspectionEnergyMaximum(b,{maxEnergy:0,def:{energy:200}}),0,'an explicit runtime zero remains zero');
 assert.equal(inspectionEnergyMaximum(b,{maxEnergy:-5,def:{energy:200}}),0,'negative runtime maximum is clamped');
 assert.equal(inspectionEnergyMaximum(b,{maxEnergy:NaN,def:{energy:200}}),0,'invalid runtime maximum does not create an invalid bar');
 assert.equal(inspectionEnergyMaximum(b,{def:{energy:200}}),200,'units without a runtime field use base energy');
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

test('ground inspection damage uses ground hit count even when the unit also has an air weapon',()=>{
 const b=battle(),unit=b.create(0,0,100,100);unit.def={...unit.def,groundHits:2,airHits:1};
 const model=selectionPanelModel(b,unit,data);assert.equal(model.weapons[0].kind,'ground');assert.equal(model.weapons[0].hits,2);
});


test('stat callouts show original labels and combine base damage with upgrade bonuses',()=>{
 const items=selectionStatItems({armor:{icon:1,level:2,base:1,bonus:2},shield:{icon:2,level:1,armorBase:0,armorBonus:1},weapons:[{kind:'ground',sourceId:64,icon:3,level:3,baseDamage:8,bonus:3,hits:2}]});
 assert.deepEqual(items.map(item=>item.valueText),['장갑: 1+2','보호막: 0+1','공격력: 8+3']);
 assert.equal(selectionStatItems(null).length,0);
 const b=battle(),unit=b.create(1,0,100,100);unit.energy=0;
 assert.ok(inspectionEnergyMaximum(b,unit)>0,'zero current mana still has a visible maximum');
 unit.team=1;assert.equal(inspectionEnergyMaximum(b,unit),250,'visible units retain their runtime mana maximum');
});

test('source labels and multi-hit damage are shown in original form',()=>{
 const b=battle(),zealot=b.create(65,0,100,100),scout=b.create(70,0,200,100);
 const z=selectionPanelModel(b,zealot,data),s=selectionPanelModel(b,scout,data);
 assert.ok(z.weapons[0].name);assert.equal(z.weapons[0].baseDamage,16);
 assert.equal(s.weapons.find(w=>w.kind==='air').baseDamage,28);
 assert.equal(selectionStatItems(z).find(item=>item.key.startsWith('weapon:')).valueText,`공격력: ${z.weapons[0].baseDamage}${z.weapons[0].bonus?'+'+z.weapons[0].bonus:''}`);
});

test('inspection uses effective detector overrides and original English Terran ranks',()=>{
 const b=battle();b.phase='title';b.begin();
 const outpost=b.units.find(unit=>unit.isOutpost&&unit.team===0);
 for(const unit of [b.main,outpost]){
  assert.equal(unit.baseDef.detector||false,false,'objective detector is a runtime override');
  const model=selectionPanelModel(b,unit,data);
  assert.equal(model.detector,true);assert.equal(model.detectorActive,true);
  assert.equal(model.rank,'');
 }
 for(const type of [9,42,84]){
  const unit=b.create(type,0,200,200),model=selectionPanelModel(b,unit,data);
  assert.equal(model.detector,true,`detector type ${type}`);
  assert.equal(model.detectorActive,true);
 }
 const observer=b.create(84,0,200,240);observer.cloaked=true;
 const cloaked=selectionPanelModel(b,observer,data);
 assert.equal(cloaked.detector,true);assert.ok(cloaked.status.includes('은폐'));
 assert.equal(selectionPanelModel(b,b.create(0,0,200,270),data).rank,'Private');
 assert.equal(selectionPanelModel(b,b.create(3,0,200,300),data).rank,'First Sergeant');
 assert.equal(selectionPanelModel(b,b.create(34,0,200,330),data).rank,'1st Lieutenant');
 for(const type of [37,65]){const model=selectionPanelModel(b,b.create(type,0,200,360),data);assert.equal(model.detector,false);assert.equal(model.rank,'')}
 const unpowered=b.create(9,0,220,380);unpowered.buffs.stasis=2;
 assert.equal(selectionPanelModel(b,unpowered,data).detector,true);
 assert.equal(selectionPanelModel(b,unpowered,data).detectorActive,false);
});

test('kill and stat icon conditions preserve support units, upgrades and split weapons',()=>{
 const b=battle();
 const goliath=selectionPanelModel(b,b.create(3,0,100,100),data);
 const dragoon=selectionPanelModel(b,b.create(66,0,140,100),data);
 assert.deepEqual(selectionStatItems(goliath).map(item=>item.key.split(':')[0]),['armor','weapon','weapon']);
 assert.deepEqual(selectionStatItems(dragoon).map(item=>item.key.split(':')[0]),['armor','shieldArmor','weapon']);
 assert.ok(selectionStatItems(goliath).every(item=>Number.isInteger(item.level)&&item.level>=0));
 assert.equal(selectionStatItems({armor:{icon:1,level:0,base:1,bonus:0},weapons:[]}).at(0).level,0);
 assert.equal(selectionPanelModel(b,b.create(34,0,180,100),data).killCount,null);
 assert.equal(selectionPanelModel(b,b.create(0,0,200,100),data).killCount,0);
 assert.equal(selectionPanelModel(b,b.create(83,0,220,100),data).killCount,0);
 const vessel=b.create(9,0,250,100);vessel.energy=0;
 assert.equal(selectionPanelModel(b,vessel,data).energy.current,0);
 assert.equal(selectionPanelModel(b,b.create(0,0,260,100),data).shield,null);
});
