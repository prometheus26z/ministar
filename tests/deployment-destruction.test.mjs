import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {buildingDestruction} from '../dist/presentation.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(race='terran')=>{const b=new Battle(data,{race});b.begin();b.weapon=()=>null;b.autoCast=()=>{};return b};

test('36-unit waves on both sides spawn clear of HQ and turrets and every member leaves the base',()=>{
 for(const team of [0,1]){
  const b=fresh();for(let i=0;i<6;i++){const u=b.create(111,team,200+i*150,3100);u.productionOnly=true}
  b.spawnWave(team);const army=b.units.filter(u=>u.laneArmy);
  assert.equal(army.length,36);assert.equal(new Set(army.map(u=>`${u.x},${u.y}`)).size,36);
  assert.ok(army.every(u=>!b.map.blocked(u.x,u.y,Math.max(20,u.r*.55))));
  for(let frame=0;frame<300;frame++)for(const u of army)b.tickUnit(u,1/30);
  assert.ok(army.every(u=>team?u.y>500:u.y<1500),JSON.stringify(army.filter(u=>team?u.y<=500:u.y>=1500).map(u=>[u.x,u.y,u.order])));
 }
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
