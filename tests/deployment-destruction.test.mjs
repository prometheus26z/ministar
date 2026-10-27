import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {buildingDestruction} from '../dist/presentation.js';
import {DESERT_STRIKE} from '../dist/lane-rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(race='terran')=>{const b=new Battle(data,{race,enemyRace:race});b.begin();b.weapon=()=>null;b.autoCast=()=>{};return b};
const flushPending=b=>{let guard=0;while(b.pendingDeployments.some(queue=>queue.length)){b.deploymentBudget=[8,8];assert.ok(b.drainPendingDeployments().length,'rear deployment space is available');if(++guard>100)throw Error('deployment queue did not drain')}};

test('36-unit waves on both sides spawn clear of HQ and turrets and every member leaves the base',()=>{
 for(const team of [0,1]){
  const b=fresh();for(let i=0;i<6;i++){const u=b.create(111,team,200+i*150,3100);u.productionOnly=true}
  b.spawnWave(team);assert.equal(b.units.filter(u=>u.laneArmy).length,8,'one simulation slice deploys at most eight units');flushPending(b);const army=b.units.filter(u=>u.laneArmy);
  assert.equal(army.length,36);assert.equal(new Set(army.map(u=>`${u.x},${u.y}`)).size,36);
  const main=team?b.core:b.main,zone=DESERT_STRIKE.map.mobileLayout.deploymentZones[team],direction=team?1:-1;
  assert.ok(army.every(u=>direction*(u.y-main.y)<0&&u.x>=zone.left+u.r&&u.x<=zone.right-u.r&&u.y>=zone.top+u.r&&u.y<=zone.bottom-u.r));
  const firstRow=army.slice(0,8),lastRow=army.slice(-8);
  assert.ok(firstRow.every(u=>team?u.y<=zone.top+u.r+8:u.y>=zone.bottom-u.r-8),'the first deployment row enters from the map edge');
  assert.ok((firstRow.reduce((n,u)=>n+u.y,0)/firstRow.length)*(team?1:-1)<(lastRow.reduce((n,u)=>n+u.y,0)/lastRow.length)*(team?1:-1),'overflow rows form towards the base, not behind it');
  assert.ok(army.every(u=>!b.map.blocked(u.x,u.y,Math.max(20,u.r*.55))));
  for(let frame=0;frame<450;frame++)for(const u of army)b.tickUnit(u,1/30);
  assert.ok(army.every(u=>team?u.y>500:u.y<1500),JSON.stringify(army.filter(u=>team?u.y<=500:u.y>=1500).map(u=>[u.x,u.y,u.order])));
 }
});

test('a congested lane rebuilds a stable sideways route without changing the attack objective',()=>{
 const b=fresh(),u=b.create(0,0,640,1500),objective=b.laneObjective(0);
 u.laneArmy=true;u.laneOffset=0;u.laneObjectiveId=objective.id;b.setAdvanceGoal(u,objective);
 // The normal straight route is obstructed by units parked across the lane.
 for(let x=560;x<=720;x+=32){const blocker=b.create(0,0,x,1465);blocker.order='hold'}
 const firstGoal={...u.goal};
 assert.equal(b.recoverLaneRoute(u,objective),true);
 assert.deepEqual(u.goal,firstGoal);
 assert.ok(u.path.length>1,'recovery plans a flank plus a route back to the original objective');
 const firstSide=u.laneDetourSide,firstWaypoint={...u.path[0]};
 assert.ok(firstSide===1||firstSide===-1);
 b.time+=.9;u.laneStall=1.0;u.laneCheckpoint={x:u.x,y:u.y};b.maintainAdvance(u,1/24);
 assert.equal(u.laneDetourSide,firstSide,'the escape direction is held while the unit turns');
 assert.deepEqual(u.path[0],firstWaypoint,'stalls do not immediately discard the detour');
});

test('rear-zone congestion queues units without forward fallback or cross-team starvation',()=>{
 const b=fresh();for(const team of [0,1]){const producer=b.create(111,team,640,1200);producer.productionOnly=true;producer.completed=true}
 const find=b.findRearDeploymentPoint.bind(b);b.findRearDeploymentPoint=(def,team,...args)=>team===0?null:find(def,team,...args);
 b.spawnWave(0);b.spawnWave(1);
 assert.equal(b.units.filter(u=>u.laneArmy&&u.team===0).length,0);
 assert.equal(b.pendingDeployments[0].length,6,'blocked requests remain queued');
 assert.equal(b.units.filter(u=>u.laneArmy&&u.team===1).length,6,'the clear team deploys independently');
 b.findRearDeploymentPoint=find;flushPending(b);
 assert.equal(b.units.filter(u=>u.laneArmy&&u.team===0).length,6);
 assert.equal(b.pendingDeployments[0].length+b.pendingDeployments[1].length,0);
 assert.ok(b.units.filter(u=>u.laneArmy).every(u=>u.team===0?u.y>b.main.y:u.y<b.core.y));
});

test('an idle soldier accidentally trapped in the HQ regains an open route without resetting its objective',()=>{
 const b=fresh(),u=b.create(0,0,b.main.x,b.main.y);u.laneArmy=true;u.laneObjectiveId=b.laneObjective(0).id;u.laneOffset=0;
 for(let frame=0;frame<180;frame++)b.tickUnit(u,1/30);
 assert.ok(!b.map.blocked(u.x,u.y,u.r*.55));assert.ok(u.y<1600);assert.equal(u.order,'attackmove');
});

test('building death emits race-specific original explosion and persistent nonblocking rubble exactly once',()=>{
 for(const [race,type]of [['terran',125],['zerg',146],['protoss',162]]){
  const b=fresh(race),u=b.create(type,0,640,900),visual=buildingDestruction(u);
  assert.equal(b.map.blocked(640,900),true);b.die(u,1);b.die(u,1);
  assert.equal(b.wrecks.length,1);assert.equal(b.wrecks[0].image,visual.rubble);
  assert.ok(b.effects.some(e=>e.kind==='building-death'&&e.image===visual.explosion));assert.equal(b.map.blocked(640,900),false);
  for(let i=0;i<60;i++)b.step(1/30);
  assert.equal(b.wrecks.length,1);assert.equal(b.effects.some(e=>e.kind==='building-death'),false);
 }
});

test('original turret head has all directional frames and rubble assets resolve for every race',()=>{
 const graphics=JSON.parse(fs.readFileSync(new URL('../dist/turret-data.json',import.meta.url)));
 Object.assign(graphics,JSON.parse(fs.readFileSync(new URL('../dist/destruction-data.json',import.meta.url))));
 assert.equal(graphics[297].frames.length,34);assert.equal(graphics[297].turns,true);
 for(const g of Object.values(graphics))for(const path of Object.values(g.images))assert.ok(fs.existsSync(new URL('../dist/'+path,import.meta.url)),path);
 for(const type of [125,106,146,131,162,154]){const v=buildingDestruction({def:data.units[type]});assert.ok(graphics[v.rubble]);assert.ok(graphics[v.explosion]||data.graphics[v.explosion])}
});
