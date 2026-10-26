import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle,Battlefield,dist} from '../dist/core.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const data=read('../dist/assets/data.json'),extra=read('../dist/rts-data.json');
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,read('../dist/original-animation-data.json'));
function fresh(){const battle=new Battle(data,{race:'terran'});battle.begin();return battle}

test('open ground paths use diagonal steps and keep the direct heading',()=>{
 const path=new Battlefield().path({x:100,y:100},{x:400,y:400});
 assert.equal(path.length,1);assert.ok(Math.abs(path[0].x-path[0].y)<1e-8);
});

test('a unit can move diagonally at its normal travel distance',()=>{
 const battle=fresh(),unit=battle.create(0,0,760,1500),start={x:unit.x,y:unit.y};
 unit.direction=4;unit.motion.heading256=unit.motion.velocityDirection256=32;
 assert.equal(battle.move(unit,{x:860,y:1400},.25),true);
 const dx=unit.x-start.x,dy=start.y-unit.y;
 assert.ok(dx>0&&dy>0);assert.ok(Math.abs(dx-dy)<1e-6);assert.ok(Math.abs(Math.hypot(dx,dy)-24)<1e-6);
});

test('ground units steer around each other without moving the blocker',()=>{
 const battle=fresh(),mover=battle.create(0,0,760,1500),blocker=battle.create(0,1,790,1500),start={x:blocker.x,y:blocker.y},goal={x:1000,y:1500};
 for(let i=0;i<20;i++){battle.time+=.1;battle.move(mover,goal,.1);assert.ok(dist(mover,blocker)>=mover.r+blocker.r-1e-3)}
 assert.ok(mover.x>blocker.x+blocker.r);assert.deepEqual({x:blocker.x,y:blocker.y},start);
});

test('a mover stops or turns before a building footprint without displacing it',()=>{
 const battle=fresh(),mover=battle.create(0,0,720,1500),building=battle.create(109,1,800,1500),start={x:building.x,y:building.y};
 assert.equal(building.def.building,true);
 for(let i=0;i<12;i++){battle.move(mover,{x:1000,y:1500},.1);const [w,h]=building.def.footprint;assert.ok(Math.abs(mover.x-building.x)>=w/2+mover.r*.55-1e-3||Math.abs(mover.y-building.y)>=h/2+mover.r*.55-1e-3)}
 assert.deepEqual({x:building.x,y:building.y},start);
});
