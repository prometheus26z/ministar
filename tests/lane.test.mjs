import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {GAS_BUILDING,GAS_SLOT_X,GAS_SLOT_Y,PRODUCTION_GROUND_Y,PRODUCTION_OFFSET,BUILDING_WAVES,WAVE_SECONDS,constructionSeconds} from '../dist/lane-rules.js';
import {constructionVisual,healthBarPixels} from '../dist/presentation.js';
import {RESEARCH} from '../dist/tech.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
for(const [key,spec]of Object.entries(extra.research))Object.assign(RESEARCH[key],spec);
const fresh=(race='terran',difficulty='normal')=>{const battle=new Battle(data,{race,enemyRace:race,difficulty});battle.begin();return battle};
const flushPending=battle=>{let guard=0;while(battle.pendingDeployments.some(queue=>queue.length)){battle.deploymentBudget=[8,8];const spawned=battle.drainPendingDeployments();assert.ok(spawned.length,'rear deployment space is available');if(++guard>100)throw Error('deployment queue did not drain')}};

test('eight Marines form a horizontal rank across producers and keep separate advance lanes',()=>{
 for(const team of [0,1]){
  const battle=fresh();
  for(let i=0;i<4;i++){const producer=battle.create(111,team,320+i*160,PRODUCTION_OFFSET+900);producer.productionOnly=true;producer.completed=true}
  battle.spawnWave(team);
  const marines=battle.units.filter(u=>u.laneArmy&&u.team===team).slice(0,8);
  assert.equal(marines.length,8);assert.equal(new Set(marines.map(u=>u.x)).size,8);
  assert.equal(new Set(marines.map(u=>u.y)).size,1);
  assert.equal(Math.max(...marines.map(u=>u.x))-Math.min(...marines.map(u=>u.x)),224);
  for(const u of marines)assert.equal(u.goal.x,u.x);
  for(let i=0;i<100;i++)for(const u of marines)battle.tickUnit(u,.05);
  assert.ok(Math.max(...marines.map(u=>u.x))-Math.min(...marines.map(u=>u.x))>=200);
 }
});

test('extra wave members spawn in following ranks without overlapping the first eight',()=>{
 const battle=fresh();for(let i=0;i<6;i++){const b=battle.create(111,0,200+i*150,PRODUCTION_OFFSET+900);b.productionOnly=true;b.completed=true}
 battle.spawnWave(0);flushPending(battle);const army=battle.units.filter(u=>u.laneArmy);
 assert.equal(new Set(army.map(u=>`${u.x},${u.y}`)).size,36);
 assert.ok(new Set(army.map(u=>u.y)).size>=5);
});

test('bunker garrison fire emits original effects, sound and functioning weapon impacts',()=>{
 const battle=fresh(),bunker=battle.makeBunker(0,640,1568);
 for(const u of battle.units)if(u!==bunker&&u.garrison)u.garrison=[];
 const target=battle.create(106,1,bunker.x,bunker.y-100),hp=target.hp,events=[];
 battle.on(e=>events.push(e));battle.fireBunkers(.01);
 assert.ok(target.hp<hp);assert.ok(events.some(e=>e.type==='sfx'&&data.audio[e.id]));
 assert.equal(battle.effects.filter(e=>e.kind==='bunker-shot').length,4);
 assert.ok(battle.effects.some(e=>e.image===421));
 for(const p of battle.projectiles)assert.ok(p.weapon);
});

test('construction chooses original stages for all races and gas footprints touch the top land boundary',()=>{
 const graphics=JSON.parse(fs.readFileSync(new URL('../dist/construction-data.json',import.meta.url)));
 for(const [race,type]of [['terran',111],['zerg',142],['protoss',160]]){
  const battle=fresh(race),u=battle.create(type,0,640,PRODUCTION_OFFSET+900);
  u.construction={time:0,total:10,started:true};
  const start=constructionVisual(u,data);u.construction.time=5;const middle=constructionVisual(u,data);
  assert.ok(graphics[start.image]);
  if(race!=='protoss')assert.notDeepEqual(start,middle);else assert.equal(start.warp,true);
  u.construction=null;assert.equal(constructionVisual(u,data),null);
 }
 for(const race of ['terran','zerg','protoss']){
  const battle=fresh(race),type=GAS_BUILDING[race],node=battle.nodes.find(n=>n.team===0);battle.money=1000;
  assert.equal(battle.placement(battle.builder,type,node).reason,'');
  assert.ok(GAS_SLOT_Y-battle.footprint(type)[1]/2>=PRODUCTION_GROUND_Y);
  assert.ok(GAS_SLOT_Y-battle.footprint(type)[1]/2-PRODUCTION_GROUND_Y<32);
 }
 assert.equal(healthBarPixels(81),Math.round(79*.85));
});

test('all races begin with a production base, fixed objectives and five original gas slots per side',()=>{
 for(const race of ['terran','zerg','protoss']){
  const battle=fresh(race),playerSlots=battle.nodes.filter(node=>node.team===0&&node.kind==='gas'),enemySlots=battle.nodes.filter(node=>node.team===1&&node.kind==='gas');
  assert.equal(battle.money,300);assert.equal(battle.gas,0);
  assert.deepEqual(playerSlots.map(node=>node.x),GAS_SLOT_X);
  assert.deepEqual(enemySlots.map(node=>node.x),GAS_SLOT_X.map(x=>1280-x));
  assert.equal(battle.units.filter(unit=>unit.team===0&&unit.productionOnly).length,1);
  assert.equal(battle.units.filter(unit=>unit.team===1&&unit.productionOnly).length,1);
  assert.equal(battle.units.filter(unit=>unit.isMain).length,2);
  assert.equal(battle.units.filter(unit=>unit.isOutpost).length,2);
  assert.equal(battle.outpostDefenses[0].length,1);
  assert.equal(battle.outpostDefenses[1].length,1);
  assert.equal(battle.activeWave(0).size,0);
  assert.equal(battle.activeWave(1).size,0);
 }
});

test('main and outpost buildings detect cloaked enemies while enemies outside both detector ranges stay hidden',()=>{
 const battle=fresh(),darkTemplar=battle.create(63,1,0,0);darkTemplar.cloaked=true;
 darkTemplar.x=battle.main.x+250;darkTemplar.y=battle.main.y;assert.equal(battle.canSee(0,darkTemplar),true,'the main base detector reveals a nearby cloaked unit');
 darkTemplar.x=battle.main.x+350;assert.equal(battle.canSee(0,darkTemplar),false,'ordinary vision and the outpost do not reveal it outside detector range');
 const marine=battle.create(65,0,darkTemplar.x-80,darkTemplar.y);assert.equal(battle.canAttackTarget(marine,darkTemplar),false);assert.equal(battle.inspect(darkTemplar),false);
 darkTemplar.x=battle.playerOutpost.x+250;darkTemplar.y=battle.playerOutpost.y;assert.equal(battle.canSee(0,darkTemplar),true,'the outpost detector covers its own approaches');
 darkTemplar.x=battle.playerOutpost.x+350;assert.equal(battle.canSee(0,darkTemplar),false);
});

test('lane production prevents templar fusion from removing the Dark Templar pair',()=>{
 const battle=fresh('protoss'),templars=[battle.create(61,0,560,900),battle.create(61,0,720,900)];battle.select(templars.map(unit=>unit.id),false);
 const before=templars.map(unit=>[unit.alive,unit.hp]);assert.ok(!battle.productionOptions(templars[0]).includes(63));assert.match(battle.trainReason(templars[0],63),/합체/);assert.equal(battle.train(templars[0],63),false);
 assert.deepEqual(templars.map(unit=>[unit.alive,unit.hp]),before);
});

test('gas buildings use the original race-specific mineral cost and reserve their site while building for five percent time',()=>{
 for(const race of ['terran','zerg','protoss']){
  const battle=fresh(race),type=GAS_BUILDING[race],node=battle.nodes.find(entry=>entry.team===0&&entry.kind==='gas');
  battle.money=900;battle.gas=180;
  assert.deepEqual(battle.buildingCost(type),[race==='zerg'?500:600,0]);
  assert.equal(battle.placement(battle.builder,type,{x:node.x,y:node.y}).reason,'');
  assert.equal(battle.build(battle.builder,type,{x:node.x,y:node.y}),true,battle.lastError);
  const refinery=battle.units.find(unit=>unit.team===0&&unit.gasNode===node.id);
  assert.equal(battle.money,900-battle.buildingCost(type)[0]);assert.equal(battle.gas,180);
  assert.equal(refinery.construction.total,constructionSeconds(data,type));
  assert.equal(refinery.construction.total,data.units[type].buildTime*.05);
  assert.equal(node.occupiedBy,refinery.id);
  battle.money=900;
  assert.match(battle.placement(battle.builder,type,{x:node.x,y:node.y}).reason,/비어 있는/);
 }
});

test('Zerg creep requirements do not block construction inside the production area',()=>{
 const battle=fresh('zerg');battle.money=1000;
 const site={x:640,y:PRODUCTION_OFFSET+960};
 assert.equal(battle.placement(battle.builder,142,site).reason,'');
 assert.equal(battle.build(battle.builder,142,site),true,battle.lastError);
 const pool=battle.units.find(unit=>unit.team===0&&unit.type===142&&unit.productionOnly);
 assert.equal(pool.construction.total,data.units[142].buildTime*.05);
});

test('completed production buildings always spawn their fixed wave, including unit ID zero and over supply',()=>{
 const cases=[['terran',111,0,6],['zerg',142,37,5],['protoss',160,65,4]];
 for(const [race,building,unit,count]of cases){
  const battle=fresh(race),producer=battle.create(building,0,640,PRODUCTION_OFFSET+768);producer.productionOnly=true;producer.completed=true;
  battle.supplyCap=()=>0;
  assert.equal(battle.setAutoProduction(producer,null),false);
  battle.spawnWave(0);
  flushPending(battle);
  assert.equal(battle.units.filter(entry=>entry.team===0&&entry.type===unit&&!entry.productionOnly&&!entry.def.building).length,count);
 }
 const battle=fresh('terran');
 for(let i=0;i<2;i++){const producer=battle.create(111,0,320+i*160,PRODUCTION_OFFSET+768);producer.productionOnly=true;producer.completed=true}
 battle.supplyCap=()=>0;battle.spawnWave(0);
 flushPending(battle);
 assert.equal(battle.units.filter(entry=>entry.team===0&&entry.type===0&&!entry.productionOnly&&!entry.def.building).length,12);
 assert.equal(BUILDING_WAVES[111][0].unit,0);
});

test('the field stays flat and unblocked while waves attack the outpost before the main',()=>{
 const battle=fresh('terran');
 assert.deepEqual(battle.map.rocks,[]);
 assert.equal(battle.map.blocked(128,900),false);
 assert.equal(battle.map.blocked(1152,900),false);
 assert.equal(battle.map.blocked(640,900),false);
 const marine=battle.spawnUnit(0,0,0,1,{x:640,y:battle.main.y});
 assert.equal(marine.goal.y,battle.enemyOutpost.y);
 for(const defense of [...battle.outpostDefenses[1]])battle.die(defense,0);battle.tickUnit(marine,.01);
 assert.equal(marine.goal.y,battle.core.y);
});
