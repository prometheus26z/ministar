import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle as CombatBattle} from '../dist/core.js';
import {COMBAT_SOURCE,resolveUnitDefinition,resolveWeapon,attackHitCount,cooldownFrames,movementSpeed,sourcePlayerForUnit,upgradeLevel} from '../dist/combat-rules.js?v=0.16.16';
import {combatData,laneBattle} from './combat-test-data.mjs';

test('both lane combat profiles use the map starting weapon, armor, shield, and range upgrades',()=>{
 const data=combatData(),battle=laneBattle();
 for(const team of [0,1]){
  const marine=battle.create(0,team,300+team*500,900),dragoon=battle.create(66,team,300+team*500,1000),goliath=battle.create(3,team,300+team*500,1100),hydra=battle.create(38,team,300+team*500,1200),zealot=battle.create(65,team,300+team*500,1300),siege=battle.create(30,team,300+team*500,1400),ultra=battle.create(39,team,300+team*500,1500);
  assert.equal(sourcePlayerForUnit(battle,marine),team?7:3);
  assert.equal(resolveWeapon(data,battle,marine,false).damage,9);assert.equal(marine.def.armor,3);assert.equal(resolveWeapon(data,battle,marine,false).range,160);
  assert.equal(resolveWeapon(data,battle,dragoon,false).damage,26);assert.equal(dragoon.def.armor,4);assert.equal(dragoon.def.shieldArmor,3);assert.equal(resolveWeapon(data,battle,dragoon,false).range,192);
  const antiAir=resolveWeapon(data,battle,goliath,true);assert.equal(antiAir.damage,16);assert.equal(antiAir.factor,2);assert.equal(antiAir.range,256);assert.equal(resolveWeapon(data,battle,goliath,false).range,192);
  assert.equal(resolveWeapon(data,battle,hydra,false).damage,13);assert.equal(resolveWeapon(data,battle,hydra,false).range,160);
  assert.equal(resolveWeapon(data,battle,zealot,false).damage,11);assert.equal(attackHitCount(zealot,resolveWeapon(data,battle,zealot,false),false),2);assert.equal(zealot.def.shieldArmor,3);
  assert.equal(resolveWeapon(data,battle,siege,false).damage,85);assert.equal(ultra.def.armor,6);
 }
 assert.equal(data.units[0].armor,0,'the resolver never mutates shared DAT records');
});

test('lane profiles keep source-player identities, human shield level 8, and full starting energy',()=>{
 const battle=laneBattle(),data=battle.data;
 for(const [team,commander,sourcePlayer]of [[0,0,0],[1,3,4]]){
  const corsair=battle.create(60,team,400,900);corsair.commanderId=commander;corsair.productionOnly=true;
  corsair.def=resolveUnitDefinition(battle,corsair,corsair.baseDef,corsair.mapDefOverride);
  assert.equal(sourcePlayerForUnit(battle,corsair),sourcePlayer);assert.equal(corsair.def.shieldArmor,8);assert.equal(upgradeLevel(sourcePlayer,15),8);
 }
 for(const id of [1,8,9,12,34,45,46,60,63,67,71]){
  const caster=battle.createDeployedUnit({type:id,team:0,commanderId:0,spread:0,waveId:1},{x:300+id*2,y:700});
  const effective=caster.def.energy;
  assert.equal(effective,250,`unit ${id} effective max energy`);
  assert.equal(caster.maxEnergy,250);assert.equal(caster.energy,250,`unit ${id} starts at effective max energy`);
 }
 const source={...COMBAT_SOURCE.units[106]},commandCenter=battle.create(106,0,300,1600);
 assert.equal(source.armorUpgrade,60);assert.equal(commandCenter.def.armor,commandCenter.baseDef.armor,'upgrade sentinel 60 is not an armor upgrade');
});

test('non-lane combat keeps vanilla weapon values and resolves every hit separately',()=>{
 const data=combatData(),battle=new CombatBattle(data);battle.phase='battle';
 const zealot=battle.create(65,0,400,900),victim=battle.create(0,1,420,900);victim.def={...victim.def,armor:1,size:1,shield:0};victim.hp=victim.maxHp=100;
 const weapon=battle.weapon(zealot,victim);assert.equal(weapon.damage,8);assert.equal(attackHitCount(zealot,weapon,false),2);
 zealot.direction=8;zealot.motion.heading256=zealot.motion.velocityDirection256=64;
 assert.equal(battle.attack(zealot,victim,weapon),true);assert.equal(victim.hp,100,'attacks do not hit on the command frame');
 for(let frame=0;frame<3;frame++)battle.step(1/24);assert.equal(victim.hp,100,'the source script delays the first melee event');
 battle.step(1/24);assert.equal(victim.hp,93,'the first 8-damage hit subtracts armor 1 at script tick 4');
 battle.step(2/24);assert.equal(victim.hp,86,'the second hit is a separate armor-adjusted melee event at tick 6');
});

test('armor, shields, ignore-armor weapons, size divisors, and minimum damage follow the hit order',()=>{
 const battle=new CombatBattle(combatData());battle.phase='battle';
 const victim=battle.create(0,1,400,900);victim.def={...victim.def,armor:1,shieldArmor:3,size:1,shield:40};victim.hp=victim.maxHp=100;victim.shield=40;
 battle.hurt(victim,9,0,3);assert.equal(victim.shield,34);assert.equal(victim.hp,100);
 victim.shield=4;victim.hp=100;battle.hurt(victim,9,0,3);assert.equal(victim.shield,0);assert.equal(victim.hp,99);
 victim.shield=3;victim.def={...victim.def,armor:10,shieldArmor:3,size:3};victim.hp=100;battle.hurt(victim,20,0,4);assert.equal(victim.shield,0);assert.equal(victim.hp,83);
 victim.def={...victim.def,armor:2,shieldArmor:0,size:2};victim.shield=0;victim.hp=100;battle.hurt(victim,20,0,1);assert.equal(victim.hp,86.5,'explosive damage vs medium is (20 - 2) × .75');
 victim.def={...victim.def,armor:10,size:3};victim.hp=100;battle.hurt(victim,1,0,3);assert.equal(victim.hp,99.5,'an armored unshielded hit deals at least .5');
 victim.def={...victim.def,invincible:true};victim.hp=100;assert.equal(battle.hurt(victim,50,0,3),0);assert.equal(victim.hp,100);
});

test('range acquisition and attack speed use their own source upgrades',()=>{
 const battle=laneBattle(),marine=battle.create(0,0,300,900),goliath=battle.create(3,0,400,900),zealot=battle.create(65,0,500,900),zergling=battle.create(37,0,600,900);
 assert.equal(marine.def.acquisitionRange,256);assert.equal(goliath.def.acquisitionRange,256);assert.equal(zealot.def.acquisitionRange,COMBAT_SOURCE.units[65].acquisitionRangePixels);
 const lingWeapon=resolveWeapon(battle.data,battle,zergling,false);assert.equal(cooldownFrames(battle,zergling,lingWeapon),5);
 zergling.buffs.ensnare=1;assert.equal(cooldownFrames(battle,zergling,lingWeapon),8,'ensnare offsets the Adrenal Glands modifier');
 assert.equal(movementSpeed(battle,zergling),zergling.baseDef.speed,'ensnare offsets the active movement-speed upgrade');zergling.buffs.stim=1;zergling.buffs.ensnare=0;assert.equal(movementSpeed(battle,zergling),zergling.baseDef.speed*1.5);
});
