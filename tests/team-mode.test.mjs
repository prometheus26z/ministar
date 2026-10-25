import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {GAS_BUILDING,INCOME_SECONDS} from '../dist/lane-rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(teamSize=3,race='terran',random=()=>0)=>{const b=new Battle(data,{teamSize,race,enemyRace:race,random,difficulty:'hard'});b.begin();return b};
const drainDeployments=b=>{let guard=0;while(b.pendingDeployments.some(queue=>queue.length)){b.deploymentBudget=[8,8];assert.ok(b.drainPendingDeployments().length,'rear-zone queue has space');if(++guard>100)throw Error('deployment queue did not drain')}};
test('1v1, 2v2 and 3v3 create real independent commanders, five gas slots each and shared team objectives',()=>{
 for(const size of [1,2,3]){const b=fresh(size);assert.equal(b.teamSize,size);assert.equal(b.commanders.length,size*2);assert.equal(b.commanders.filter(c=>c.human).length,1);assert.equal(b.nodes.length,size*10);
  for(const team of [0,1])assert.equal(b.commanders.filter(c=>c.team===team).length,size);
  for(const c of b.commanders){assert.equal(b.commanderSnapshot(c.id).minerals,300);assert.equal(b.nodes.filter(n=>n.commanderId===c.id).length,5);assert.equal(b.units.filter(u=>u.productionOnly&&u.commanderId===c.id).length,1);if(!c.human)assert.equal(c.difficulty,c.team?'hard':'normal')}
  assert.equal(b.units.filter(u=>u.isMain||u.isOutpost).length,4);
 }
 assert.equal(fresh(100).teamSize,1);
});
test('allied construction and prerequisites are isolated while buildings at matching board positions coexist',()=>{
 const b=fresh(3,'protoss',()=>.9),ally=b.commanders.find(c=>c.id===1);ally.economy.minerals=5000+b.buildingCost(156)[0];const playerMoney=b.money;
 const cyber=b.withCommander(1,()=>{const u=b.create(164,0,700,3300);u.productionOnly=true;return u});
 assert.equal(cyber.commanderId,1);assert.equal(b.hasTeam(0,164),false);assert.equal(b.withCommander(1,()=>b.hasTeam(0,164)),true);assert.match(b.teamBuildReason(0,163),/필요/);
 b.withCommander(1,()=>{assert.ok(ally.ai.build(156));const pylon=b.units.find(u=>u.commanderId===1&&u.type===156&&u.construction);b.tickBotConstruction(pylon,pylon.construction.total);assert.ok(ally.ai.build(160));assert.equal(b.money,4720)});assert.equal(ally.economy.minerals,4720);assert.equal(b.money,playerMoney);
 const allied=b.units.find(u=>u.commanderId===1&&u.type===160);b.withCommander(0,()=>{const pylon=b.create(156,0,allied.x+(allied.x<640?160:-160),allied.y);pylon.productionOnly=true});b.money=1000;assert.equal(b.placement(b.builder,160,allied).reason,'');
 b.inspect(allied);assert.equal(b.selected.length,0);assert.equal(b.inspectedUnit,allied);assert.equal(b.commanderWave(1,allied.id).size,0,'unfinished allied buildings do not produce');
 const balance=b.money,events=[];b.on(e=>{if(e.type==='change')events.push(b.money)});b.withCommander(1,()=>b.tickBotConstruction(allied,100));assert.ok(events.every(m=>m===balance),'UI events must observe restored human economy');assert.equal(b.commanderWave(1).get(65),4);assert.equal(b.commanderWave(0).size,0);
});
test('every commander has its own five-facility cap and gas investment timer',()=>{
 const b=fresh();
 for(const c of b.commanders){b.withCommander(c.id,()=>{if(c.team)b.botMoney=10000;else b.money=10000;const type=GAS_BUILDING[c.race];for(const n of b.nodes.filter(n=>n.commanderId===c.id)){const result=b.placementForTeam(c.team,type,n);assert.equal(result.reason,'');assert.ok(b.startConstruction(c.team,type,result))}assert.match(b.teamBuildReason(c.team,type),/최대 5/)});}
 assert.equal(b.units.filter(u=>u.gasNode).length,30);
 const c=b.commanders.find(c=>c.id===4),units=b.units.filter(u=>u.commanderId===4&&u.gasNode);
 b.withCommander(c.id,()=>{for(const u of units.slice(0,2))b.tickBotConstruction(u,100);b.tickIncome(0,[c.team]);assert.ok(b.incomeRemaining[c.team]>27)});
 assert.equal(b.incomeRemaining[0],INCOME_SECONDS);assert.equal(b.incomeRemaining[1],INCOME_SECONDS);
 assert.ok(c.economy.incomeRemaining>27);assert.equal(b.commanderSnapshot(5).gas,0);
});
test('simultaneous team waves use each commander production once without hidden multipliers or overlap',()=>{
 for(const size of [1,2,3]){const b=fresh(size);b.botStep=()=>{};
  for(const c of b.commanders){if(c.slot)c.ai.step=()=>{};b.withCommander(c.id,()=>{const u=b.create(111,c.team,500,3200);u.productionOnly=true})}
  b.waveClock=.01;b.step(.01);drainDeployments(b);
  for(const c of b.commanders)assert.equal(b.units.filter(u=>u.laneArmy&&u.commanderId===c.id).length,6);
  const army=b.units.filter(u=>u.laneArmy);assert.equal(army.length,size*12);assert.equal(new Set(army.map(u=>`${u.x},${u.y}`)).size,army.length);assert.equal(b.waveHistory[0].commanders.length,size*2);
 }
});
test('all five AIs in 3v3 grow using only their own paid economy while human income remains unchanged',()=>{
 const b=fresh(3,'terran',()=>.8);
 for(let t=0;t<500;t+=.5){b.time=t;b.tickIncome(.5);for(const c of b.commanders.filter(c=>c.slot>0))b.withCommander(c.id,()=>b.tickIncome(.5,[c.team]));for(const u of [...b.units])if(u.construction)b.withCommander(u.commanderId,()=>b.tickBotConstruction(u,.5));b.botStep(.5);for(const c of b.commanders.filter(c=>c.slot>0))b.withCommander(c.id,()=>c.ai.step(.5));}
 assert.equal(b.money,300+b.incomeTotal[0]);
 for(const c of b.commanders.filter(c=>!c.human)){const state=b.commanderSnapshot(c.id),spent=b.spendingHistory.filter(s=>s.commanderId===c.id).reduce((n,s)=>n+s.minerals,0);assert.equal(state.minerals,300+state.income-spent);assert.ok(state.production>=3);assert.ok(state.gas<=5);assert.ok(state.minerals>=0)}
 assert.deepEqual(b.ownerByTeam,[0,3]);assert.equal(b.race,'terran');assert.equal(b.enemyRace,'terran');assert.equal(b.difficulty,'hard');
});
test('destroying the shared enemy main ends a 3v3 match without per-commander extra bases',()=>{
 const b=fresh();b.die(b.core,0);assert.equal(b.phase,'result');assert.equal(b.result.win,true);
});
test('an allied AI Mind Control transfers combat ownership to its own commander',()=>{
 const b=fresh(3,'protoss',()=>.9);
 b.withCommander(1,()=>{for(const type of [165,172]){const u=b.create(type,0,600,3300);u.productionOnly=true}});
 for(let i=0;i<4;i++)b.create(0,1,500+i*40,900);
 b.withCommander(1,()=>b.tickSpecials(.1,[0]));
 const captured=b.units.filter(u=>u.type===0&&u.team===0);assert.equal(captured.length,2);assert.ok(captured.every(u=>u.commanderId===1));
});
