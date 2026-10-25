import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {DESERT_STRIKE,BUILDING_COSTS,BUILDING_WAVES,GAS_BUILDING,PRODUCTION_OFFSET,WAVE_SECONDS,INCOME_SECONDS} from '../dist/lane-rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(race='terran')=>{const b=new Battle(data,{race,enemyRace:race});b.begin();b.botStep=()=>{};return b};
const producer=(b,type,team=0)=>{const u=b.create(type,team,640,PRODUCTION_OFFSET+900);u.productionOnly=true;return u};
function gas(b,slot,team=0,ready=true){const n=b.nodes.find(n=>n.team===team&&n.slot===slot),u=producer(b,GAS_BUILDING[b.race],team);u.x=n.x;u.y=n.y;u.gasNode=n.id;n.occupiedBy=u.id;u.completed=ready;if(!ready)u.construction={time:0,total:100,started:true};return u}

test('costs and production quantities agree with original UNIx/TRIG bytes rather than property indices',()=>{
 const evidence=JSON.parse(fs.readFileSync(new URL('../resources/desert-strike-evidence.json',import.meta.url))),unix=Buffer.from(evidence.UNIx,'base64');
 for(const [type,cost]of Object.entries(BUILDING_COSTS))assert.deepEqual(cost,[unix.readUInt16LE(2280+Number(type)*2),unix.readUInt16LE(2736+Number(type)*2)]);
 for(const [type,groups]of Object.entries(BUILDING_WAVES)){
  const raw=Object.entries(evidence.triggers).filter(([i])=>+i>=218&&+i<=246).map(([,v])=>Buffer.from(v,'base64')).filter(b=>Array.from({length:16},(_,i)=>i*20).some(o=>b[o+15]===3&&b.readUInt16LE(o+12)===+type));
  assert.ok(raw.some(b=>{const actual=[];for(let o=320;o<2368;o+=32)if(b[o+26]===11)actual.push({unit:b.readUInt16LE(o+24),count:b[o+27]});return JSON.stringify(actual)===JSON.stringify(groups)}),'TRIG mismatch for '+type);
 }
 assert.deepEqual(BUILDING_WAVES[111],[{unit:0,count:6}]);
 assert.deepEqual(BUILDING_WAVES[133],[{unit:103,count:2},{unit:42,count:1}]);
});

test('income runs independently from waves and outpost destruction gives no resource bonus',()=>{
 const b=fresh();b.tickIncome(INCOME_SECONDS-1e-5);assert.equal(b.money,300);b.tickIncome(1e-5);assert.equal(b.money,310);
 b.waveClock=.01;b.incomeRemaining=[INCOME_SECONDS,INCOME_SECONDS];b.step(.01);assert.equal(b.money,310);
 for(const u of [...b.outpostDefenses[1]])b.die(u,0);b.tickIncome(INCOME_SECONDS);assert.equal(b.money,320);assert.equal(b.gas,0);assert.ok(WAVE_SECONDS>30&&WAVE_SECONDS<31);
});

test('each race receives the original gas income ladder with each investment delay charged once',()=>{
 for(const race of ['terran','zerg','protoss']){
  const b=fresh(race);assert.deepEqual(b.buildingCost(GAS_BUILDING[race]),[race==='zerg'?500:600,0]);
  for(let count=0;count<=5;count++){
   if(count)gas(b,count-1);const before=b.money,remaining=b.incomeRemaining[0];b.tickIncome(0);
   assert.equal(b.incomeAmount(),[10,12,15,18,22,26][count]);
   if(count)assert.ok(Math.abs(b.incomeRemaining[0]-remaining-[0,0,333,347,667,655][count]*.084)<1e-8);
   b.tickIncome(b.incomeRemaining[0]-1e-5);assert.equal(b.money,before);b.tickIncome(1e-5);assert.equal(b.money,before+b.incomeAmount());
   const after=b.incomeRemaining[0];b.tickIncome(0);assert.equal(b.incomeRemaining[0],after);
  }
  assert.equal(b.gas,0);assert.equal(b.botGas,0);
 }
});

test('unfinished gas buildings do not improve income and rebuilding does not repeat an investment-stage delay',()=>{
 const b=fresh();gas(b,0);const second=gas(b,1,0,false);b.tickIncome(0);assert.equal(b.incomeAmount(),12);
 second.completed=true;second.construction=null;b.tickIncome(0);assert.ok(b.incomePauseLeft>27);
 b.die(second,1);b.tickIncome(0);assert.equal(b.incomeAmount(),12);gas(b,1);const remaining=b.incomeRemaining[0];b.tickIncome(0);assert.equal(b.incomeRemaining[0],remaining);
});

test('all multi-unit building groups accumulate without supply limits or per-wave costs',()=>{
 for(const [type,groups]of Object.entries(BUILDING_WAVES)){
  const b=fresh(data.units[type].race);producer(b,+type);producer(b,+type);b.supplyCap=()=>0;const money=b.money;b.spawnWave(0);
  for(const {unit,count}of groups)assert.equal(b.units.filter(u=>u.laneArmy&&u.type===unit).length,count*2,'building '+type+', unit '+unit);
  assert.equal(b.money,money);assert.equal(b.gas,0);
 }
 assert.deepEqual(DESERT_STRIKE.poolBonusThreshold,[6,8]);
 const expected={0:{0:0,1:5,5:25,6:31,7:37,8:43,9:49},1:{0:0,1:5,5:25,6:30,7:35,8:41,9:47}};
 for(const team of [0,1])for(const n of [0,1,5,6,7,8,9]){const b=fresh('zerg');for(let i=0;i<n;i++)producer(b,142,team);assert.equal(b.activeWave(team).get(37)||0,expected[team][n],`team ${team} with ${n} pools`)}
});

test('pool bonus counts only completed living grounded pools owned by the current commander',()=>{
 const b=fresh('zerg'),pools=Array.from({length:6},()=>producer(b,142,0));
 pools[5].completed=false;pools[5].construction={time:0,total:100,started:true};
 assert.equal(b.activeWave(0).get(37),25);
 pools[5].completed=true;pools[5].construction=null;pools[4].flying=true;
 assert.equal(b.activeWave(0).get(37),25);
 pools[4].flying=false;b.die(pools[4],1);assert.equal(b.activeWave(0).get(37),25);
 const teamBattle=new Battle(data,{race:'zerg',enemyRace:'zerg',teamSize:2});teamBattle.begin();teamBattle.botStep=()=>{};
 const owned=[];teamBattle.withCommander(1,()=>{for(let i=0;i<6;i++)owned.push(producer(teamBattle,142,0))});
 assert.equal(teamBattle.commanderWave(1).get(37),31);
 teamBattle.withCommander(1,()=>producer(teamBattle,142,0));
 assert.equal(teamBattle.commanderWave(1).get(37),37);
 assert.equal(teamBattle.commanderWave(0).get(37),undefined);
});

test('building morphs charge original minerals once and replace their original wave group',()=>{
 const b=fresh('zerg');b.money=10000;producer(b,142);const hatch=producer(b,131),before=b.money;
 assert.equal(b.morph(hatch,132),true);assert.equal(b.money,before-360);assert.equal(b.gas,0);
 b.tickEconomy(hatch,hatch.construction.total);assert.equal(hatch.type,132);assert.equal(b.activeWave().get(103),2);
 producer(b,138);assert.equal(b.morph(hatch,133),true);assert.equal(b.money,before-760);
 b.tickEconomy(hatch,hatch.construction.total);assert.equal(b.activeWave().get(103),2);assert.equal(b.activeWave().get(42),1);
});

test('map-researched technologies are available at start and standard gas-priced research is unavailable',()=>{
 const b=fresh();assert.ok(b.researched.has('stim'));assert.ok(b.researched.has('siege'));assert.equal(b.researched.has('burrow'),false);
 const academy=producer(b,112),money=b.money;assert.deepEqual(b.researchOptions(academy),[]);assert.equal(b.research(academy,'stim'),false);assert.equal(b.money,money);assert.equal(b.gas,0);
});
