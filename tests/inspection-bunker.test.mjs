import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {waveDescription} from '../dist/presentation.js';
import {DESERT_STRIKE,BUILDING_WAVES,isLaneBuildingAvailable} from '../dist/lane-rules.js';
import {BUILDINGS} from '../dist/tech.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=()=>{const b=new Battle(data,{enemyRace:'terran'});b.begin();return b};

test('enemy inspection highlights a living unit without selecting it for allied commands',()=>{
 const b=fresh(),enemy=b.outpostDefenses[1][0],ally=b.outpostDefenses[0][0];
 assert.equal(b.inspect(enemy),true);assert.equal(b.inspectedUnit,enemy);assert.ok(b.isHighlighted(enemy));assert.deepEqual(b.selected,[]);
 b.inspect(ally);assert.equal(b.inspectedUnit,null);assert.equal(b.isHighlighted(enemy),false);assert.equal(b.selected[0],ally);
 b.inspect(enemy);b.die(enemy,0);assert.equal(b.inspectedUnit,null);assert.equal(b.isHighlighted(enemy),false);
 const hidden=b.create(0,1,640,640);hidden.loaded=ally.id;assert.equal(b.inspect(hidden),false);
});

test('construction labels include every output group and non-producing structures',()=>{
 const b=fresh();assert.equal(waveDescription(111,b.waveUnitsForBuilding(111),data),'마린 6기');
 assert.equal(waveDescription(112,b.waveUnitsForBuilding(112),data),'파이어뱃 1기 · 메딕 1기');
 assert.match(waveDescription(106,b.waveUnitsForBuilding(106),data),/건설 기반/);
});

test('all 50 building explanations reflect source production, current roles and lane PUNI catalog',()=>{
 assert.equal(Object.keys(BUILDINGS).length,50);assert.equal(Object.keys(DESERT_STRIKE.costs).length,50);assert.equal(Object.keys(BUILDING_WAVES).length,28);
 for(const id of Object.keys(BUILDINGS).map(Number)){
  const groups=BUILDING_WAVES[id];
  if(groups){const expected=groups.map(({unit,count})=>`${data.units[unit].name} ${id===142?'5~6':count}기`).join(' · ');assert.equal(waveDescription(id,groups,data),expected,`building ${id}`)}
  else assert.equal(waveDescription(id,null,data),DESERT_STRIKE.buildingRoles[id],`building ${id} role`);
 }
 assert.equal(waveDescription(120,null,data),'원본 맵에서 건설 불가');
 assert.equal(isLaneBuildingAvailable(120,0),false);assert.equal(isLaneBuildingAvailable(117,0),true);
 assert.equal(BUILDINGS[117].addon,116);assert.equal(BUILDINGS[120].addon,113,'the non-lane Brood War production graph remains intact');
});

function setup(crew){const b=fresh(),bunker=b.makeBunker(0,640,1568);for(const u of b.units)if(u!==bunker&&u.garrison)u.garrison=[];bunker.garrison=crew;return{b,bunker}}
test('a bunker Firebat cannot shoot a Marine-range target but can shoot one within its own range',()=>{
 const {b,bunker}=setup([32]);const target=b.create(0,1,bunker.x,bunker.y-170),hp=target.hp;
 b.fireBunkers(.01);assert.equal(target.hp,hp);assert.equal(b.effects.length,0);assert.equal(b.projectiles.length,0);
 target.y=bunker.y-90;b.fireBunkers(.01);assert.ok(target.hp<hp);assert.ok(b.effects.some(e=>e.image===421));
});

test('each garrison member checks its own range, cooldown and eligible air/ground target',()=>{
 const {b,bunker}=setup([0,32]);const ground=b.create(106,1,bunker.x,bunker.y-170),hp=ground.hp;
 b.fireBunkers(.01);assert.ok(ground.hp<hp);assert.equal(b.effects.filter(e=>e.image===421).length,0);
 const air=b.create(8,1,bunker.x,bunker.y-20);ground.y=bunker.y-90;const before=ground.hp;
 b.fireBunkers(.01);assert.ok(ground.hp<before);assert.ok(b.effects.some(e=>e.image===421));
 const after=ground.hp;b.fireBunkers(.01);assert.equal(ground.hp,after);
 assert.ok(b.bunkerRange(32,data.weapons[data.units[32].groundWeapon])<b.bunkerRange(0,data.weapons[data.units[0].groundWeapon]));
 assert.equal(air.alive,true);
});
