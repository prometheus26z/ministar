import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../dist/core.js';
import {COMBAT_SOURCE,movementProfile,scriptProgramForImage} from '../dist/combat-rules.js?v=0.16.16';
import {combatData} from './combat-test-data.mjs';

const fresh=()=>{const battle=new Battle(combatData());battle.phase='battle';battle.core={alive:true};battle.map.blocked=()=>false;battle.canSee=()=>true;return battle};
const face=(unit,direction)=>{unit.direction=direction;unit.motion.heading256=unit.motion.velocityDirection256=unit.motion.desiredDirection256=direction*8};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);

test('source data keeps Flingy, partial and iscript movement control separate',()=>{
 const battle=fresh(),cruiser=battle.create(12,0,400,700),vulture=battle.create(2,0,400,700),templar=battle.create(67,0,400,700),marine=battle.create(0,0,400,700),ling=battle.create(37,0,400,700);
 assert.deepEqual([movementProfile(battle,cruiser).movementControl,movementProfile(battle,vulture).movementControl,movementProfile(battle,templar).movementControl,movementProfile(battle,marine).movementControl,movementProfile(battle,ling).movementControl],[0,0,1,2,2]);
 assert.deepEqual([COMBAT_SOURCE.unitEngine[12].topSpeedRaw,COMBAT_SOURCE.unitEngine[12].accelerationRaw,COMBAT_SOURCE.unitEngine[12].haltDistanceRaw,COMBAT_SOURCE.unitEngine[12].turnRateRaw],[640,27,7585,20]);
 assert.deepEqual([COMBAT_SOURCE.unitEngine[2].topSpeedRaw,COMBAT_SOURCE.unitEngine[2].accelerationRaw,COMBAT_SOURCE.unitEngine[2].haltDistanceRaw,COMBAT_SOURCE.unitEngine[2].turnRateRaw],[1707,100,14569,40]);
 assert.equal(scriptProgramForImage(marine.def.image,11).events[0].operands[0],4);
 assert.deepEqual(scriptProgramForImage(ling.def.image,11).events.map(event=>event.operands[0]),[2,8,9,5,6,7,2]);
});

test('Flingy units accelerate from rest while control-1 units use their own profile',()=>{
 const battle=fresh(),cruiser=battle.create(12,0,400,700),templar=battle.create(67,0,500,700),vulture=battle.create(2,0,600,700);
 for(const unit of [cruiser,templar,vulture])assert.equal(battle.move(unit,{x:unit.x,y:600},1/24,false),true);
 assert.equal(cruiser.motion.speedRaw,27);close(cruiser.y,700-27/256);
 assert.equal(templar.motion.speedRaw,27);close(templar.y,700-27/256);
 assert.equal(vulture.motion.speedRaw,100);close(vulture.y,700-100/256);
 const nearby=battle.create(12,0,800,700);assert.equal(battle.move(nearby,{x:800,y:699},1/24,true),true,'a short goal accelerates from rest instead of using top-speed braking distance');assert.ok(nearby.y<700);
});

test('Marine and Zergling walk scripts set per-frame speed at source command ticks',()=>{
 const battle=fresh(),marine=battle.create(0,0,400,700),ling=battle.create(37,0,400,800);face(marine,8);face(ling,8);
 assert.equal(battle.move(marine,{x:700,y:700},1/24,false),true);close(marine.x,404);
 const start=ling.x;for(let frame=0;frame<7;frame++)assert.equal(battle.move(ling,{x:700,y:800},1/24,false),true);
 close(ling.x-start,39);assert.equal(ling.motion.walkTick,7);
});

test('Marine first fire and Zergling first and repeat melee hits follow their source script ticks',()=>{
 const marineBattle=fresh(),marine=marineBattle.create(0,0,400,700),marineTarget=marineBattle.create(0,1,400,780);marineTarget.hp=marineTarget.maxHp=1000;face(marine,16);
 assert.equal(marineBattle.attack(marine,marineTarget,marineBattle.weapon(marine,marineTarget)),true);assert.equal(marineTarget.hp,1000);
 for(let frame=0;frame<2;frame++){marineBattle.step(1/24);assert.equal(marineTarget.hp,1000)}
 marineBattle.step(1/24);assert.equal(marineTarget.hp,994,'Marine script fires on init tick 3');

 const lingBattle=fresh(),ling=lingBattle.create(37,0,400,900),lingTarget=lingBattle.create(0,1,420,900);lingTarget.hp=lingTarget.maxHp=1000;face(ling,8);
 assert.equal(lingBattle.attack(ling,lingTarget,lingBattle.weapon(ling,lingTarget)),true);lingBattle.step(1/24);assert.equal(lingTarget.hp,1000);
 lingBattle.step(1/24);assert.equal(lingTarget.hp,995,'Zergling first hit lands on tick 2');
 for(let frame=3;frame<=10;frame++){lingBattle.step(1/24);assert.equal(lingTarget.hp,995,`repeat hit has not arrived on tick ${frame}`)}
 lingBattle.step(1/24);assert.equal(lingTarget.hp,990,'repeat attack starts after cooldown and lands on repeat tick 2');
});

test('attack orders cancel before the source no-break interval and defer movement until it ends',()=>{
 const before=fresh(),first=before.create(0,0,400,700),firstTarget=before.create(0,1,400,780);face(first,16);const firstHp=firstTarget.hp;
 assert.equal(before.attack(first,firstTarget,before.weapon(first,firstTarget)),true);before.clearActionControl(first,'move');
 for(let frame=0;frame<4;frame++)before.step(1/24);assert.equal(firstTarget.hp,firstHp,'cancellation before tick 3 removes the pending shot');

 const during=fresh(),marine=during.create(0,0,400,700),target=during.create(0,1,400,780);face(marine,16);
 assert.equal(during.attack(marine,target,during.weapon(marine,target)),true);for(let frame=0;frame<3;frame++)during.step(1/24);
 const x=marine.x,y=marine.y;assert.equal(marine.attackControl.nonInterruptible,true);assert.equal(during.clearActionControl(marine,'move'),false);
 during.setGoal(marine,{x:x+100,y},'move');for(let frame=0;frame<5;frame++){during.step(1/24);assert.deepEqual([marine.x,marine.y],[x,y],'the unit remains locked through the no-break interval')}
 during.step(1/24);assert.equal(marine.attackControl,null,'the deferred command applies when the source interval ends');assert.equal(marine.order,'move');
});

test('simulation updates preserve fractional time and advance the same 24 frames at 60 and 120 Hz',()=>{
 const make=()=>{const battle=fresh();battle.create(0,0,400,700);return battle};
 const sixty=make(),oneTwenty=make();
 for(let i=0;i<60;i++)sixty.update(1/60);
 for(let i=0;i<120;i++)oneTwenty.update(1/120);
 assert.equal(sixty.simFrame,24);assert.equal(oneTwenty.simFrame,24);close(sixty.time,1);close(oneTwenty.time,1);
});
