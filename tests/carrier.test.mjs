import test from 'node:test';
import assert from 'node:assert/strict';
import {HANGAR_RULES} from '../dist/hangar.js?v=0.16.16';
import {emptyLaneBattle} from './combat-test-data.mjs';

test('Carrier attacks through individually launched Interceptors at the 256px control range',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),target=battle.create(0,1,657,900);carrier.r=target.r=0;
 battle.tickHangarFrame();assert.equal(battle.hangarSnapshot(carrier).active,0,'257px is outside control range');
 target.x=656;battle.tickHangarFrame();assert.equal(battle.hangarSnapshot(carrier).active,1,'256px is inside control range');
 for(let frame=0;frame<6;frame++)battle.tickHangarFrame();assert.equal(battle.hangarSnapshot(carrier).active,1);
 battle.tickHangarFrame();assert.equal(battle.hangarSnapshot(carrier).active,2,'new Interceptors launch no faster than every 7 frames');
 assert.equal(battle.weapon(carrier,target).damage,0);assert.equal(battle.attack(carrier,target,battle.weapon(carrier,target)),false);
});

test('an Interceptor waits 15 frames, then emits a real 9-damage weapon shot from the child',()=>{
 const battle=emptyLaneBattle();battle.random=()=>.5;
 const carrier=battle.create(72,0,400,900),target=battle.create(0,1,450,900);carrier.r=target.r=0;
 battle.tickHangarFrame();const fighter=battle.units.find(unit=>unit.type===73&&!unit.hidden);assert.ok(fighter);
 for(let frame=0;frame<14;frame++)battle.tickHangarFrame();assert.equal(battle.projectiles.length,0,'no weapon fires during the 15-frame launch warmup');
 battle.tickHangarFrame();assert.equal(battle.projectiles.length,0,'the 15-frame launch warmup ends before the fighter begins its pass');
 battle.tickHangarFrame();assert.equal(battle.projectiles.length,0,'the fighter turns into its attack pass before starting the source script');
 battle.tickHangarFrame();assert.equal(battle.projectiles.length,0,'starting the attack animation does not fire before its event');
 battle.tickHangarFrame();assert.equal(battle.projectiles.length,1,'the source attack event creates the fighter shot after its turn');
 const shot=battle.projectiles[0];assert.equal(shot.source.id,fighter.id);assert.equal(shot.weapon.sourceWeaponId,79);assert.equal(shot.damage,9);
 assert.equal(HANGAR_RULES.interceptorWarmupFrames,15);assert.equal(HANGAR_RULES.interceptorLaunchGapFrames,7);
});

test('docked fighters cannot be hit; destroyed active fighters leave one replenishable slot',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),target=battle.create(0,1,450,900),fighters=battle.units.filter(unit=>unit.type===73);
 const docked=fighters[0],hp=docked.hp;assert.equal(battle.hurt(docked,100,1,3),0);assert.equal(docked.hp,hp);
 docked.hidden=false;docked.loaded=null;docked.fighter.state='approach';docked.fighter.targetId=target.id;
 battle.die(docked,1);assert.equal(battle.hangarSnapshot(carrier).total,7);
 assert.equal(battle.refillCarrier(carrier,1),1);assert.equal(battle.hangarSnapshot(carrier).total,8);
});

test('a destroyed Carrier clears docked fighters and times out an active orphan',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),target=battle.create(0,1,500,900),fighter=battle.units.find(unit=>unit.type===73);
 fighter.hidden=false;fighter.loaded=null;fighter.fighter.state='approach';fighter.fighter.targetId=target.id;
 battle.die(carrier,1);
 assert.equal(fighter.fighter.parentId,null);assert.equal(fighter.fighter.orphanUntil,15);
 assert.equal(battle.units.filter(unit=>unit.type===73&&unit.alive&&unit.fighter.state==='docked').length,0);
 for(let frame=0;frame<14;frame++)battle.tickHangarFrame();assert.equal(fighter.alive,true);
 battle.tickHangarFrame();assert.equal(fighter.alive,false,'orphan cleanup runs even after its Carrier is gone');
});

test('wave ammunition trigger adds one Interceptor once at its source offset',()=>{
 const battle=emptyLaneBattle(),carrier=battle.create(72,0,400,900),first=battle.units.find(unit=>unit.type===73);
 battle.die(first,1);assert.equal(battle.hangarSnapshot(carrier).total,7);
 battle.advanceAmmoRefills(2);assert.equal(battle.hangarSnapshot(carrier).total,8);
 battle.advanceAmmoRefills(0);assert.equal(battle.hangarSnapshot(carrier).total,8);
});
