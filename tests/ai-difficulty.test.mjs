import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle,randomEnemyRace,ENEMY_RACES} from '../dist/autobattle.js';
import {AI_PROFILES} from '../dist/lane-ai.js';
import {BUILDING_WAVES,WAVE_SECONDS,DESERT_STRIKE} from '../dist/lane-rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(difficulty='normal',enemyRace='terran')=>{const b=new Battle(data,{difficulty,enemyRace});b.begin();return b};
test('random opponents use equal thirds independent of the player race, including mirror matches',()=>{
 for(const race of ENEMY_RACES)for(let i=0;i<3;i++){
  const b=new Battle(data,{race,random:()=>i/3+.01});b.begin();assert.equal(b.enemyRace,ENEMY_RACES[i]);
  assert.ok(b.units.some(u=>u.team===1&&u.productionOnly&&u.def.race===b.enemyRace));
 }
 assert.equal(randomEnemyRace(()=>0),'terran');assert.equal(randomEnemyRace(()=>.99999),'protoss');
 assert.equal(new Battle(data,{enemyRace:'zerg',random:()=>0}).enemyRace,'zerg');
});
test('difficulty changes reaction and observation speed without changing original economic rules',()=>{
 for(const difficulty of ['easy','normal','hard']){
  const b=fresh(difficulty);assert.deepEqual(b.ai.profile,AI_PROFILES[difficulty]);assert.equal(b.money,300);assert.equal(b.botMoney,300);
  b.tickIncome(DESERT_STRIKE.incomeCycles*DESERT_STRIKE.hyperCycleSeconds);assert.equal(b.money,310);assert.equal(b.botMoney,310);assert.deepEqual(b.buildingCost(111),[330,0]);
  assert.equal(b.ai.observe(),true);b.create(8,0,640,900).laneArmy=true;
  b.time=2;assert.equal(b.ai.observe(),false);assert.equal(b.ai.observed.air,0);
  b.time=3;assert.equal(b.ai.observe(),difficulty==='hard');
 }
 assert.ok(AI_PROFILES.easy.decisionSeconds>AI_PROFILES.normal.decisionSeconds);assert.ok(AI_PROFILES.normal.decisionSeconds>AI_PROFILES.hard.decisionSeconds);
});
test('hard AI prioritizes a paid anti-air response to observed aircraft before its technology reservation',()=>{
 for(const race of ENEMY_RACES){const b=fresh('hard',race);b.botMoney=5000;
  const type={terran:111,zerg:142,protoss:160}[race];assert.ok(b.ai.build(type));const basic=b.units.find(u=>u.team===1&&u.type===type);b.tickBotConstruction(basic,100);
  for(let i=0;i<12;i++)b.create(8,0,450+i*20,900).laneArmy=true;
  const money=b.botMoney;b.botStep(.25);const counter={terran:113,zerg:135,protoss:164}[race];assert.equal(b.spendingHistory.at(-1).type,counter);assert.equal(b.botMoney,money-b.buildingCost(counter)[0]);
 }
});
test('counter-unit priorities increase with difficulty using only observed enemy waves',()=>{
 const boosts=[];for(const difficulty of ['easy','normal','hard']){const b=fresh(difficulty),base=b.ai.score(113);b.ai.observed.air=8;boosts.push(b.ai.score(113)-base)}
 assert.ok(boosts[0]<boosts[1]);assert.ok(boosts[1]<boosts[2]);
});
test('each race and difficulty develops for 30 waves with exact paid resource accounting',()=>{
 for(const race of ENEMY_RACES)for(const difficulty of ['easy','normal','hard']){
  const b=fresh(difficulty,race);let atTen;
  for(let time=0;time<=30*WAVE_SECONDS;time+=.25){b.time=time;b.tickIncome(.25);for(const u of [...b.units])if(u.construction)b.tickBotConstruction(u,.25);b.tickSpecials(.25);b.botStep(.25);if(!atTen&&time>=10*WAVE_SECONDS)atTen=b.ai.snapshot()}
  const last=b.ai.snapshot();assert.equal(b.botMoney,300+b.incomeTotal[1]-last.spent);assert.ok(b.botMoney>=0);assert.ok(last.production>=3);assert.ok(last.production>atTen.production);assert.ok(last.units>atTen.units);assert.ok(last.gas<=5);
  assert.ok(b.units.filter(u=>u.team===1&&u.productionOnly&&BUILDING_WAVES[u.type]).every(u=>u.def.race===race));
 }
});
