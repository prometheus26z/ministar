import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {Battle} from '../dist/autobattle.js';
import {gasSlots,productionTileAllowed,PRODUCTION_OFFSET,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y,BUILDING_WAVES,DESERT_STRIKE,WAVE_SECONDS,INCOME_SECONDS} from '../dist/lane-rules.js';
import {BUILDINGS} from '../dist/tech.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(race='terran',enemyRace=race)=>{const b=new Battle(data,{race,enemyRace});b.begin();return b};
const complete=(b,type,team=0)=>{const u=b.create(type,team,640,PRODUCTION_OFFSET+1100);u.productionOnly=true;return u};

test('all 328 source triggers have complete audited conditions/actions and exact source hash',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../resources/original-desertstrike.json',import.meta.url))),raw=zlib.gunzipSync(fs.readFileSync(new URL('../resources/desertstrike/scenario.chk.gz',import.meta.url)));
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),original.source.chkSha256);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../resources/desertstrike/original.scx',import.meta.url))).digest('hex'),original.source.sha256);
 assert.deepEqual(original.originalTriggers.map(t=>t.id),Array.from({length:328},(_,i)=>i+1));
 for(const t of original.originalTriggers){assert.ok(['적용','변환 적용','제외','버그 수정'].includes(t.portStatus));assert.ok(t.mappedRule);assert.ok(t.conditions.length);assert.ok(t.actions.length)}
 assert.equal(original.map.gasSlots.length,30);assert.equal(original.map.productionRegion.exclusiveInOriginal,false);
});

test('production crop uses original buildable mask and L-shaped geyser centers with fixed mirror transform',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../resources/original-desertstrike.json',import.meta.url)));
 for(const race of ['terran','zerg','protoss']){const b=fresh(race);for(const team of [0,1]){
  const slots=b.nodes.filter(n=>n.team===team);assert.deepEqual(slots.map(n=>({slot:n.slot,x:n.x,y:n.y})),gasSlots(team));
  const normalized=slots.map(n=>[team?1280-PRODUCTION_GROUND_X-n.x:n.x-PRODUCTION_GROUND_X,n.y-PRODUCTION_OFFSET-PRODUCTION_GROUND_Y]);assert.deepEqual(normalized,[[64,32],[192,32],[320,32],[64,96],[64,160]]);
 }}
 const mask=DESERT_STRIKE.map.productionRegion.buildable;
 for(let y=0;y<19;y++)for(let x=0;x<33;x++)assert.equal(productionTileAllowed(PRODUCTION_GROUND_X+x*32+16,PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+y*32+16),!!original.map.buildable[y*96+x]);
 assert.equal(mask.reduce((n,v)=>n+v,0),606);
});

test('gas capacity, slot reservation, destruction reuse and simultaneous completion counters',()=>{
 const b=fresh();b.money=10000;
 for(const node of b.nodes.filter(n=>n.team===0))assert.ok(b.build(b.builder,110,node),b.lastError);
 assert.match(b.teamBuildReason(0,110),/최대 5/);assert.equal(b.units.filter(u=>u.gasNode&&u.team===0).length,5);
 for(const u of b.units.filter(u=>u.gasNode))b.tickBotConstruction(u,100);
 b.tickIncome(0);assert.equal(b.incomeAmount(),26);assert.ok(Math.abs(b.incomePauseLeft-655*.084)<1e-8,'exact-count one-shot triggers do not charge skipped levels');
 const u=b.units.find(u=>u.gasNode),node=b.nodes.find(n=>n.id===u.gasNode);b.die(u,1);assert.equal(node.occupiedBy,null);assert.ok(b.build(b.builder,110,node));
});

test('shared construction checks prerequisites, geometry and payment for player and AI',()=>{
 for(const race of ['terran','zerg','protoss']){const b=fresh(race);const type={terran:111,zerg:142,protoss:160}[race];b.botMoney=10000;
  const before=b.botMoney;assert.ok(b.ai.build(type));const u=b.units.find(u=>u.team===1&&u.type===type&&u.construction);assert.equal(b.botMoney,before-b.buildingCost(type)[0]);assert.equal(b.activeWave(1).size,0);
  b.tickBotConstruction(u,u.construction.total);assert.ok(b.activeWave(1).size>0);b.die(u,0);assert.equal(b.activeWave(1).size,0);
  assert.equal(b.ai.build({terran:118,zerg:140,protoss:169}[race]),false,'cannot skip prerequisites');
  for(const team of [0,1]){const main=team?b.core:b.main,post=team?b.enemyOutpost:b.playerOutpost;assert.equal(main.type,173);assert.equal(post.type,174);assert.ok(main.maxHp>post.maxHp);const prior=b.units.filter(u=>u.laneArmy&&u.team===team).length;b.die(post,1-team);assert.ok(b.units.filter(u=>u.laneArmy&&u.team===team).length>prior);const after=b.units.length;b.die(post,1-team);assert.equal(b.units.length,after)}
 }
});

test('tribunal and active-arbiter limits are separate and symmetric; source properties preserve disabled shields',()=>{
 const b=fresh('protoss');for(const team of [0,1]){complete(b,167,team);complete(b,165,team);complete(b,170,team);complete(b,170,team);assert.match(b.teamBuildReason(team,170),/한도/);for(let i=0;i<4;i++)b.spawnWave(team);assert.equal(b.units.filter(u=>u.alive&&u.team===team&&u.type===71).length,3)}
 const m=b.spawnUnit(0,0,0,1,b.main);assert.equal(m.shield,0);const lurker=b.spawnUnit(103,0,0,1,b.main);assert.equal(lurker.burrowed,true);
});

test('special buildings consume once, heal in pulses, replace finite enemy snapshot, and require Archives',()=>{
 const b=fresh();const marine=b.create(0,0,600,900);marine.hp=1;const heal=complete(b,115);b.tickSpecials(.01);assert.equal(heal.alive,false);b.tickSpecials(13*.084);assert.equal(marine.hp,marine.maxHp);assert.ok(b.specialStates[0].heal);b.tickSpecials(45*13*.084);assert.equal(b.specialStates[0].heal,undefined);
 const z=fresh('zerg');for(let i=0;i<10;i++)z.create(0,1,400+i*25,900);const nydus=complete(z,134);z.tickSpecials(.01);assert.equal(nydus.alive,false);assert.equal(z.units.filter(u=>u.alive&&u.type===40).length,10);const count=z.units.length;z.tickSpecials(.01);assert.equal(z.units.length,count);assert.ok(z.units.filter(u=>u.type===40).every(u=>u.expiresAt));
 const p=fresh('protoss');p.money=9999;assert.match(p.teamBuildReason(0,172),/필요/);complete(p,160);complete(p,165);assert.equal(p.teamBuildReason(0,172),'');for(let i=0;i<6;i++)p.create(0,1,400+i*30,900);const battery=complete(p,172);p.tickSpecials(.01);assert.equal(battery.alive,false);assert.equal(p.units.filter(u=>u.alive&&u.type===0&&u.team===0).length,3);
});

// Economic/construction simulation isolates investment from battle outcome.
// Units are really deployed each wave, then retired between observations.
export function simulate(race,enemyRace=race){
 const b=fresh(race,enemyRace),history=[];let next=WAVE_SECONDS;
 for(let time=0;time<30*WAVE_SECONDS+.25;time+=.25){
  b.time=time;b.tickIncome(.25);for(const u of [...b.units])if(u.construction)b.tickBotConstruction(u,.25);b.tickSpecials(.25);b.botStep(.25);
  if(time+.25>=next){b.ai.observe();const snapshot=b.ai.snapshot();snapshot.wave=history.length+1;const before=b.units.filter(u=>u.alive&&u.team===1&&u.laneArmy).length;b.spawnWave(1);const deployed=b.units.filter(u=>u.alive&&u.team===1&&u.laneArmy).length-before;assert.equal(deployed,snapshot.units);snapshot.deployed=deployed;history.push(snapshot);b.waveHistory.push(snapshot);b.units=b.units.filter(u=>!u.laneArmy);next+=WAVE_SECONDS}
 }
 assert.equal(history.length,30);return {b,history};
}
test('all nine race pairings grow through 5/10/20/30 real paid construction/deployment snapshots',()=>{
 const results=[];
 for(const race of ['terran','zerg','protoss'])for(const enemyRace of ['terran','zerg','protoss']){
  const {b,history}=simulate(race,enemyRace),last=history.at(-1);
  assert.equal(b.botMoney,300+b.incomeTotal[1]-last.spent);assert.ok(b.botMoney>=0);assert.ok(last.gas<=5);assert.ok(last.production>history[4].production);assert.ok(last.units>history[4].units);assert.ok(last.value>history[4].value);assert.ok(Object.keys(last.composition).length>=4);assert.ok(last.air>0);assert.ok(last.production>=8);assert.ok(last.spent>6000);
  assert.ok(b.units.filter(u=>u.productionOnly&&u.team===1).every(u=>u.def.race===enemyRace));
  results.push({player:race,enemy:enemyRace,snapshots:history.filter(h=>[5,10,20,30].includes(h.wave))});
 }
 fs.writeFileSync(new URL('../docs/desertstrike-ai-simulation.json',import.meta.url),JSON.stringify({scope:'economy/construction and actual deployment; armies retired between waves, not a combat win-rate measurement',results},null,2)+'\n');
});

test('AI observes deployed air and shifts candidate score without reading future builds',()=>{
 const b=fresh('terran');b.create(8,0,640,900).laneArmy=true;b.ai.observe();assert.equal(b.ai.observed.air,1);const score=b.ai.score(113);b.ai.observed.air=0;assert.ok(score>b.ai.score(113));
});

test('paid defensive structures deploy only on completion and share destruction with their producer',()=>{
 for(const [race,type]of [['terran',124],['zerg',146],['protoss',162]]){
  const b=fresh(race);assert.equal(b.units.filter(u=>u.isFortification).length,0);
  const u=complete(b,type);u.completed=false;u.construction={time:0,total:2,started:true};
  b.tickBotConstruction(u,1);assert.equal(u.deployedDefenseId,undefined);
  b.tickBotConstruction(u,1);const defense=b.units.find(t=>t.id===u.deployedDefenseId);assert.ok(defense);assert.equal(b.powered(defense),true);
  if(type===124){const ground=b.create(0,1,defense.x,defense.y-70),air=b.create(8,1,defense.x,defense.y-70);assert.equal(b.weapon(defense,ground),null);assert.ok(b.weapon(defense,air))}
  b.die(u,1);assert.equal(defense.alive,false);
 }
});
