import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/autobattle.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(race='terran')=>{const battle=new Battle(data,{race,enemyRace:race,difficulty:'easy'});battle.begin();battle.botStep=()=>{};battle.waveClock=1e9;return battle};

test('mobile mains alone override source invulnerability and remain ordinary type 173 units elsewhere',()=>{
 const b=fresh();
 for(const main of [b.main,b.core]){assert.equal(main.type,173);assert.equal(main.def.invincible,false);assert.equal(main.mapDefOverride.invincible,false);assert.equal(main.maxHp,30000)}
 assert.equal(b.playerOutpost.def.invincible,false);assert.equal(b.enemyOutpost.def.invincible,false);
 const ordinary=b.create(173,0,400,900);assert.equal(ordinary.def.invincible,true,'the source unit remains invincible outside the objective override');
 assert.equal(b.hurt(ordinary,100,1,3),0);assert.equal(ordinary.hp,ordinary.maxHp);
});

test('real lane visibility and weapon rules let ground attackers and a ground-attacking air unit acquire a mobile main',()=>{
 const b=fresh();assert.equal(b.canSee(0,b.core),true,'the lane visibility path exposes the enemy objective');
 for(const [type,team,target]of [[0,0,b.core],[66,0,b.core],[37,0,b.core],[8,0,b.core],[3,1,b.main]]){
  const attacker=b.create(type,team,640,team?b.main.y+60:b.core.y+60),weapon=b.weapon(attacker,target);
  assert.ok(weapon?.damage,`${data.units[type].name} has a weapon against the mobile main`);assert.equal(b.canAttackTarget(attacker,target),true,`${data.units[type].name} can target the objective`);assert.equal(b.acquireTarget(attacker),target,`${data.units[type].name} acquires the mobile objective`);
 }
 for(const type of [34,124,58]){const attacker=b.create(type,0,640,b.core.y+60);assert.equal(b.canAttackTarget(attacker,b.core),false,`${data.units[type].name} cannot use an absent or air-only weapon against the ground main`)}
});

test('the enemy main is acquired after its outpost falls and a source-script attack deals damage',()=>{
 const b=fresh(),outpost=b.enemyOutpost;b.die(outpost,0);assert.equal(outpost.defenseReleased,true);const releasedUnitCount=b.units.length;b.die(outpost,0);assert.equal(b.units.length,releasedUnitCount,'defender release runs once');
 // Outpost destruction intentionally dispatches defenders. Keep this case
 // focused on the objective by removing those newly spawned enemies.
 b.units=b.units.filter(u=>u.team!==1||u===b.core);
 const attacker=b.create(0,0,640,b.core.y+60);attacker.order='focus';attacker.target=b.core;
 assert.equal(b.laneObjective(0),b.core);assert.equal(b.acquireTarget(attacker),b.core);
 const weapon=b.weapon(attacker,b.core),before=b.core.hp;assert.equal(b.attack(attacker,b.core,weapon),true);
 for(let frame=0;frame<8&&b.phase==='battle';frame++)b.step(1/24);
 assert.ok(b.core.hp<before,'a normal attack event reduces the mobile main HP');
});

test('weapon attacks destroy either mobile main and preserve victory and defeat results',()=>{
 for(const team of [0,1]){
  const b=fresh(),target=team?b.main:b.core;target.hp=5;
  const attacker=b.create(0,team,640,target.y+(team?60:-60)),weapon=b.weapon(attacker,target);
  attacker.direction=team?0:16;attacker.motion.heading256=team?0:128;
  assert.ok(weapon?.damage);assert.equal(b.canAttackTarget(attacker,target),true);
  assert.equal(b.attack(attacker,target,weapon),true);
  for(let frame=0;frame<36&&b.phase==='battle';frame++)b.step(1/24);
  assert.equal(b.phase,'result');assert.equal(b.result.win,team===0);assert.match(b.result.reason,team===0?/상대 메인 기지를 함락했습니다/:/우리 메인 기지가 함락되었습니다/);
 }
});
