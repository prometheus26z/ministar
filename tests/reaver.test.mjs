import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBAT_SOURCE,resolveWeapon} from '../dist/combat-rules.js?v=0.16.14';
import {HANGAR_RULES} from '../dist/hangar.js?v=0.16.14';
import {DESERT_STRIKE} from '../dist/desert-strike-data.js';
import {emptyLaneBattle} from './combat-test-data.mjs';

function setup({targetType=0,parentX=500,parentY=900,targetX=560,targetY=900}={}){
 const battle=emptyLaneBattle(),reaver=battle.create(83,0,parentX,parentY),target=battle.create(targetType,1,targetX,targetY);
 reaver.direction=targetType===0?8:0;return{battle,reaver,target};
}

test('Reaver stores 10 Scarabs and has no direct damage weapon of its own',()=>{
 const {battle,reaver,target}=setup(),weapon=battle.weapon(reaver,target);
 assert.deepEqual(battle.hangarSnapshot(reaver),{kind:'reaver',capacity:10,inside:10,active:0});
 assert.equal(weapon.damage,0);assert.equal(weapon.controlOnly,true);assert.equal(battle.attack(reaver,target,weapon),false);assert.equal(battle.projectiles.length,0);
 assert.equal(resolveWeapon(battle.data,battle,{type:85,team:0,sourceCombatPlayer:3},false).damage,100);
 assert.equal(HANGAR_RULES.scarabLaunchGapFrames,60);assert.equal(HANGAR_RULES.scarabLifetimeFrames,90);assert.equal(HANGAR_RULES.scarabCollisionGraceFrames,7);
});

test('a Scarab moves to ground impact and creates one enemy-only splash at its actual position',()=>{
 const {battle,reaver,target}=setup({targetX:560}),ally=battle.create(0,0,580,900),outerEnemy=battle.create(0,1,610,900);
 target.hp=target.maxHp=5000;ally.hp=ally.maxHp=5000;outerEnemy.hp=outerEnemy.maxHp=5000;
 const hp=target.hp,allyHp=ally.hp,outerHp=outerEnemy.hp;
 battle.tickHangarFrame();
 for(let frame=0;frame<40&&battle.units.some(unit=>unit.type===85&&unit.alive);frame++)battle.tickHangarFrame();
 assert.equal(target.hp,hp-97,'the one 100-damage normal hit applies the target Marine’s armor 3');
 assert.equal(ally.hp,allyHp,'Enemy_Splash never damages allied units');
 assert.equal(outerEnemy.hp,outerHp-22,'the outer 25% ring is reduced by the target’s armor 3');
 assert.equal(battle.effects.filter(effect=>effect.kind==='scarab-explosion'&&effect.image===444).length,1);
 assert.equal(battle.hangarSnapshot(reaver).inside,9);assert.equal(battle.hangarSnapshot(reaver).active,0);
 assert.equal(battle.projectiles.length,0,'the Reaver does not emit a fake body projectile');
});

test('a Scarab ignores unit collision for seven frames, while hallucinated Scarabs are visual only',()=>{
 const near=setup({targetX:525});near.target.hp=near.target.maxHp=5000;
 near.battle.tickHangarFrame();const scarab=near.battle.units.find(unit=>unit.type===85&&unit.alive);assert.ok(scarab);
 for(let frame=0;frame<6;frame++)near.battle.tickHangarFrame();assert.equal(!!scarab.fighter.exploded,false);
 near.battle.tickHangarFrame();assert.equal(scarab.fighter.exploded,true,'impact begins once the 7-frame collision grace ends');

 const ghost=setup({targetX:560});ghost.target.hp=ghost.target.maxHp=5000;ghost.reaver.hallucination=true;ghost.battle.clearHangar(ghost.reaver);
 assert.equal(ghost.battle.hangarSnapshot(ghost.reaver).inside,10);
 ghost.battle.tickHangarFrame();const visual=ghost.battle.units.find(unit=>unit.type===85&&unit.alive);assert.ok(visual);assert.equal(visual.hallucination,true);
 for(let frame=0;frame<20&&visual.alive;frame++)ghost.battle.tickHangarFrame();
 assert.equal(ghost.target.hp,5000);assert.equal(ghost.battle.effects.filter(effect=>effect.kind==='scarab-explosion').length,1);
});

test('Reaver never launches at an air unit or through a fully blocked ground route',()=>{
 const air=setup({targetType:8,targetX:550});
 for(let frame=0;frame<12;frame++)air.battle.tickHangarFrame();
 assert.equal(air.battle.units.filter(unit=>unit.type===85&&unit.alive).length,0);
 const blocked=setup({targetX:700});blocked.battle.map.rocks=[{x:620,y:0,w:40,h:2048}];
 for(let frame=0;frame<12;frame++)blocked.battle.tickHangarFrame();
 assert.equal(blocked.battle.units.filter(unit=>unit.type===85&&unit.alive).length,0);
});

test('a flying Scarab expires harmlessly behind a newly blocked route',()=>{
 const {battle,reaver,target}=setup({targetX:600}),hp=target.hp;
 battle.tickHangarFrame();const scarab=battle.units.find(unit=>unit.type===85&&unit.alive);assert.ok(scarab);
 battle.map.rocks=[{x:560,y:0,w:40,h:2048}];
 for(let frame=0;frame<90&&scarab.alive;frame++)battle.tickHangarFrame();
 assert.equal(scarab.alive,false);assert.equal(target.hp,hp);assert.equal(reaver.hangar.stock,10);
 assert.equal(battle.effects.some(effect=>effect.kind==='scarab-explosion'),false);
});

test('the active Scarab is a single outside unit, waits 60 frames before another launch, and keeps its ammo on parent death',()=>{
 const {battle,reaver,target}=setup({targetX:800});reaver.x=500;target.x=700;reaver.direction=8;
 battle.tickHangarFrame();const first=battle.units.find(unit=>unit.type===85&&unit.alive);assert.ok(first);
 assert.equal(battle.hangarSnapshot(reaver).active,1);assert.equal(battle.hangarSnapshot(reaver).inside,10);
 battle.die(first,1);assert.equal(reaver.hangar.activeScarabId,null);assert.equal(reaver.hangar.stock,10);
 reaver.hangar.launchReadyTick=battle.hangarFrame+60;
 for(let frame=0;frame<59;frame++)battle.tickHangarFrame();assert.equal(battle.hangarSnapshot(reaver).active,0);
 battle.tickHangarFrame();assert.equal(battle.hangarSnapshot(reaver).active,1);
 const flying=battle.units.find(unit=>unit.type===85&&unit.alive);battle.die(reaver,1);
 assert.equal(flying.alive,true);assert.equal(flying.fighter.parentId,null);
 for(let frame=0;frame<90&&flying.alive;frame++)battle.tickHangarFrame();
 assert.equal(flying.alive,false,'a launched Scarab finishes its own mission after the Reaver dies');
});

test('Scarabs use upgrade 35 only, while the Desert Strike Reaver trigger refills inside stock',()=>{
 const {battle,reaver}=setup(),scarab={type:85,team:0,sourceCombatPlayer:3};
 const profile=COMBAT_SOURCE.players.find(player=>player.player===3),previous=profile.initial[35];
 try{profile.initial[35]=1;assert.equal(resolveWeapon(battle.data,battle,scarab,false).damage,125)}finally{profile.initial[35]=previous}
 reaver.hangar.stock=0;const period=DESERT_STRIKE.hyperCycleSeconds;
 battle.advanceAmmoRefills(period-1e-5);assert.equal(reaver.hangar.stock,0);
 battle.advanceAmmoRefills(2e-5);assert.equal(reaver.hangar.stock,10);
 assert.equal(battle.hangarSnapshot(reaver).active,0,'inside ammunition stays separate from the outside Scarab slot');
});
