import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {GAS_BUILDING,GAS_SLOT_X,PRODUCTION_OFFSET,BUILDING_WAVES,constructionSeconds} from '../dist/lane-rules.js';
import {RESEARCH} from '../dist/tech.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
for(const [key,spec]of Object.entries(extra.research))Object.assign(RESEARCH[key],spec);
const fresh=(race='terran',difficulty='normal')=>{const battle=new Battle(data,{race,difficulty});battle.begin();return battle};

test('all races begin with empty hidden production lanes and five horizontal gas slots per side',()=>{
 for(const race of ['terran','zerg','protoss']){
  const battle=fresh(race),playerSlots=battle.nodes.filter(node=>node.team===0&&node.kind==='gas'),enemySlots=battle.nodes.filter(node=>node.team===1&&node.kind==='gas');
  assert.equal(battle.money,600);assert.equal(battle.gas,180);
  assert.deepEqual(playerSlots.map(node=>node.x),GAS_SLOT_X);
  assert.deepEqual(enemySlots.map(node=>node.x),[...GAS_SLOT_X].reverse());
  assert.equal(battle.units.filter(unit=>unit.team===0&&unit.productionOnly).length,0);
  assert.equal(battle.units.filter(unit=>unit.team===1&&unit.productionOnly).length,0);
  assert.equal(battle.units.filter(unit=>unit.isMain).length,2);
  assert.equal(battle.units.some(unit=>unit.isOutpost),false);
  assert.equal(battle.outpostDefenses[0].length,race==='protoss'?3:2);
  assert.equal(battle.outpostDefenses[1].length,race==='protoss'?3:2);
  assert.equal(battle.activeWave(0).size,0);
  assert.equal(battle.activeWave(1).size,0);
 }
});

test('gas buildings cost 500 minerals in every race and reserve their site while building for five percent time',()=>{
 for(const race of ['terran','zerg','protoss']){
  const battle=fresh(race),type=GAS_BUILDING[race],node=battle.nodes.find(entry=>entry.team===0&&entry.kind==='gas');
  battle.money=900;battle.gas=180;
  assert.deepEqual(battle.buildingCost(type),[500,0]);
  assert.equal(battle.placement(battle.builder,type,{x:node.x,y:node.y}).reason,'');
  assert.equal(battle.build(battle.builder,type,{x:node.x,y:node.y}),true,battle.lastError);
  const refinery=battle.units.find(unit=>unit.team===0&&unit.gasNode===node.id);
  assert.equal(battle.money,400);assert.equal(battle.gas,180);
  assert.equal(refinery.construction.total,constructionSeconds(data,type));
  assert.equal(refinery.construction.total,data.units[type].buildTime*.05);
  assert.equal(node.occupiedBy,refinery.id);
  battle.money=900;
  assert.match(battle.placement(battle.builder,type,{x:node.x,y:node.y}).reason,/비어 있는/);
 }
});

test('Zerg creep requirements do not block construction inside the production area',()=>{
 const battle=fresh('zerg');battle.money=1000;
 const site={x:640,y:PRODUCTION_OFFSET+832};
 assert.equal(battle.placement(battle.builder,142,site).reason,'');
 assert.equal(battle.build(battle.builder,142,site),true,battle.lastError);
 const pool=battle.units.find(unit=>unit.team===0&&unit.type===142&&unit.productionOnly);
 assert.equal(pool.construction.total,data.units[142].buildTime*.05);
});

test('completed production buildings always spawn their fixed wave, including unit ID zero and over supply',()=>{
 const cases=[['terran',111,0,2],['zerg',142,37,3],['protoss',160,65,1]];
 for(const [race,building,unit,count]of cases){
  const battle=fresh(race),producer=battle.create(building,0,640,PRODUCTION_OFFSET+768);producer.productionOnly=true;producer.completed=true;
  battle.supplyCap=()=>0;
  assert.equal(battle.setAutoProduction(producer,null),false);
  battle.spawnWave(0);
  assert.equal(battle.units.filter(entry=>entry.team===0&&entry.type===unit&&!entry.productionOnly&&!entry.def.building).length,count);
 }
 const battle=fresh('terran');
 for(let i=0;i<2;i++){const producer=battle.create(111,0,320+i*160,PRODUCTION_OFFSET+768);producer.productionOnly=true;producer.completed=true}
 battle.supplyCap=()=>0;battle.spawnWave(0);
 assert.equal(battle.units.filter(entry=>entry.team===0&&entry.type===0&&!entry.productionOnly&&!entry.def.building).length,4);
 assert.equal(BUILDING_WAVES[111].unit,0);
});

test('each wave pays 200 minerals plus 100 minerals and 50 gas per completed refinery',()=>{
 const battle=fresh('terran');battle.money=0;battle.gas=0;
 const addRefinery=(slot,completed=true)=>{
  const node=battle.nodes.find(entry=>entry.team===0&&entry.slot===slot),unit=battle.create(110,0,node.x,node.y);
  unit.productionOnly=true;unit.gasNode=node.id;unit.completed=completed;node.occupiedBy=unit.id;
  if(!completed)unit.construction={time:0,total:10,builder:battle.builder.id,started:true,cost:[500,0],original:null};
  return unit;
 };
 addRefinery(0,true);addRefinery(1,false);battle.waveClock=1;battle.step(1);
 assert.equal(battle.money,300);assert.equal(battle.gas,50);
 addRefinery(2,true);battle.waveClock=1;battle.step(1);
 assert.equal(battle.money,700);assert.equal(battle.gas,150);
});

test('the central water blocks both side bypasses and waves attack the outpost before the main',()=>{
 const battle=fresh('terran');
 assert.equal(battle.map.blocked(128,900),true);
 assert.equal(battle.map.blocked(1152,900),true);
 assert.equal(battle.map.blocked(640,900),false);
 const marine=battle.spawnUnit(0,0,0,1,{x:640,y:battle.main.y});
 assert.equal(marine.goal.y,battle.enemyOutpost.y);
 for(const defense of [...battle.outpostDefenses[1]])battle.die(defense,0);battle.tickUnit(marine,.01);
 assert.equal(marine.goal.y,battle.core.y);
});
