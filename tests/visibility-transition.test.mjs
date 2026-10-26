import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';
import {transitionSeconds} from '../dist/animation.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
const animations=JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,animations);
const fresh=(race='zerg')=>{const battle=new Battle(data,{race,enemyRace:race,difficulty:'easy'});battle.begin();battle.botStep=()=>{};battle.waveClock=1e9;return battle};

test('cloak advances in four 24 Hz simulation ticks and applies immediately to target visibility',()=>{
 const b=fresh(),wraith=b.create(8,1,640,700);assert.equal(b.canSee(0,wraith),true);assert.equal(b.cast(wraith,'cloak'),true);
 assert.equal(wraith.cloakLevel,0);assert.equal(b.canSee(0,wraith),false);assert.ok(wraith.cloakFadeTeams.includes(0));
 const levels=[];for(let tick=0;tick<32;tick++){b.tickUnit(wraith,1/24);if((tick+1)%4===0)levels.push(wraith.cloakLevel)}
 assert.deepEqual(levels,[1,2,3,4,5,6,7,8]);
 assert.equal(wraith.cloaked,true);assert.equal(b.canSee(0,wraith),false);
});

test('decloak reverses from its current stage and does not jump the render state',()=>{
 const b=fresh(),wraith=b.create(8,1,640,700);b.cast(wraith,'cloak');for(let i=0;i<12;i++)b.tickUnit(wraith,1/24);assert.equal(wraith.cloakLevel,3);
 assert.equal(b.cast(wraith,'cloak'),true);assert.equal(wraith.cloakLevel,3);assert.equal(b.canSee(0,wraith),true);
 for(let i=0;i<3;i++)b.tickUnit(wraith,1/24);assert.equal(wraith.cloakLevel,3);b.tickUnit(wraith,1/24);assert.equal(wraith.cloakLevel,2);
 for(let i=0;i<8;i++)b.tickUnit(wraith,1/24);assert.equal(wraith.cloakLevel,0);assert.equal(wraith.cloaked,false);
});

test('ordinary Burrow runs original enter and exit tracks without exposing or attacking early',()=>{
 const b=fresh(),ling=b.create(37,0,640,700);b.researched.add('burrow');
 assert.equal(b.availableAbilities(ling).includes('burrow'),true,'the test fixture explicitly supplies the tech');
 assert.equal(b.cast(ling,'burrow'),true);assert.equal(ling.burrowState,'burrowing');assert.equal(ling.burrowed,false);assert.equal(b.isHiddenByBurrow(ling),false);
 const enterDuration=transitionSeconds(data.graphics[ling.def.image],'burrow');assert.ok(Math.abs(ling.burrowTransitionLeft-enterDuration)<1e-8);
 for(let i=0;i<100&&ling.burrowState==='burrowing';i++)b.tickUnit(ling,1/24);
 assert.equal(ling.burrowState,'burrowed');assert.equal(ling.burrowed,true);assert.equal(b.isHiddenByBurrow(ling),true);
 assert.equal(b.cast(ling,'burrow'),true);assert.equal(ling.burrowState,'unburrowing');assert.equal(ling.burrowed,true);assert.equal(b.isHiddenByBurrow(ling),true);
 for(let i=0;i<100&&ling.burrowState==='unburrowing';i++)b.tickUnit(ling,1/24);
 assert.equal(ling.burrowState,'ground');assert.equal(ling.burrowed,false);assert.equal(b.isHiddenByBurrow(ling),false);
});

test('Lurker burrow and seeded unburrow use the current transition seed',()=>{
 const b=fresh(),lurker=b.create(103,0,640,700);b.researched.add('burrow');
 assert.equal(b.cast(lurker,'burrow'),true);
 assert.equal(lurker.lurkerTransition,transitionSeconds(data.graphics[lurker.def.image],'burrow',.45,lurker.lurkerAnimSeed));
 for(let i=0;i<100&&lurker.lurkerState==='burrowing';i++)b.tickUnit(lurker,1/24);
 assert.equal(lurker.lurkerState,'burrowed');assert.equal(b.cast(lurker,'burrow'),true);
 assert.equal(lurker.lurkerTransition,transitionSeconds(data.graphics[lurker.def.image],'unburrow',.45,lurker.lurkerAnimSeed));
});

test('lane gameplay does not gain researched Burrow when normal source tech is unavailable',()=>{
 const b=fresh(),ling=b.create(37,0,640,700);assert.equal(b.availableAbilities(ling).includes('burrow'),false);assert.equal(b.cast(ling,'burrow'),false);
});
