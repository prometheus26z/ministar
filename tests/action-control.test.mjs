import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../dist/core.js';
import {COMBAT_SOURCE,movementProfile,scriptProgramForImage} from '../dist/combat-rules.js?v=0.16.16';
import {combatData} from './combat-test-data.mjs';
import {unitRenderTracks} from '../dist/unit-render-state.js';
import {pose,trackFor} from '../dist/animation.js';
import {brakeUnitMovement} from '../dist/action-control.js';

const fresh=()=>{const battle=new Battle(combatData());battle.phase='battle';battle.core={alive:true};battle.map.blocked=()=>false;battle.map.water=[];battle.map.rocks=[];battle.canSee=()=>true;return battle};
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

test('real repeat attacks recover animated walk tracks during automatic pursuit',()=>{
 for(const type of [65,37,38,66]){
  const battle=fresh(),attacker=battle.create(type,0,400,800),target=battle.create(0,1,425,800);
  target.order='move';target.hp=target.maxHp=30000;attacker.order='focus';attacker.target=target;face(attacker,8);
  const weapon=battle.weapon(attacker,target),graphic=battle.data.graphics[attacker.def.image];
  target.x=attacker.x+attacker.r+target.r+Math.max(8,weapon.range-12);
  assert.ok(battle.attack(attacker,target,weapon),`type ${type} begins its first attack`);
  let repeated=false;
  for(let frame=0;frame<300;frame++){
   battle.step(1/24);
   if(attacker.attackGeneration>=2&&attacker.attackVisualTrack&&!attacker.attackControl){repeated=true;break}
  }
  assert.ok(repeated,`type ${type} completes a source-script repeat attack`);
  const repeatTrack=attacker.attackVisualTrack;
  assert.ok(trackFor(graphic,'attack',{trackOverride:repeatTrack}));
  target.x+=280;const x=attacker.x,frames=[],times=[];
  for(let frame=0;frame<60;frame++){
   const beforeX=attacker.x;battle.step(1/24);
   if(attacker.x<=beforeX+1e-6)continue;
   assert.equal(attacker.action,'walk',`type ${type} walks while chasing`);
   const visual=unitRenderTracks(attacker,attacker.action);
   assert.equal(visual.bodyTrackOverride,null,`type ${type} ignores its lingering ${repeatTrack}`);
   const context={trackOverride:visual.bodyTrackOverride,seed:attacker.id};
   assert.equal(trackFor(graphic,attacker.action,context),graphic.tracks.walk,`type ${type} renders the walk track`);
   frames.push(pose(graphic,attacker.action,attacker.animTime,attacker.direction,context).frame);
   times.push(attacker.animTime);
   if(frames.length>=12)break;
  }
  assert.ok(attacker.x>x+5,`type ${type} pursues its retreating target`);
  assert.ok(frames.length>=6,`type ${type} has consecutive walking frames`);
  assert.ok(new Set(frames).size>=2,`type ${type} does not skate on its final attack pose: ${frames}`);
  assert.ok(times.some(time=>time>1/24),`type ${type} does not reset walk time each movement tick`);
 }
});

test('walk animation resets once on displacement, but not while turning or blocked',()=>{
 const battle=fresh(),ling=battle.create(37,0,400,800);face(ling,0);ling.action='attack';ling.animTime=.7;ling.visualTime=5;
 assert.equal(battle.move(ling,{x:700,y:800},1/24,false),false,'the source unit first turns in place');
 assert.equal(ling.action,'attack');assert.equal(ling.animTime,.7);assert.equal(ling.visualTime,5);
 face(ling,8);battle.movementLimit=()=>0;
 assert.equal(battle.move(ling,{x:700,y:800},1/24,false),false,'collision does not start a walk');
 assert.equal(ling.animTime,.7);
 battle.movementLimit=()=>Infinity;
 assert.equal(battle.move(ling,{x:700,y:800},1/24,false),true);
 assert.equal(ling.action,'walk');assert.equal(ling.animTime,0);assert.equal(ling.visualTime,5,'persistent overlay clock is intact');
 ling.animTime=.25;const walkTick=ling.motion.walkTick;
 assert.equal(battle.move(ling,{x:700,y:800},1/24,false),true);
 assert.equal(ling.animTime,.25);assert.ok(ling.motion.walkTick>walkTick,'the iscript movement clock continues');
});

test('turret track ownership and stale attacks cannot override body movement or status actions',()=>{
 const battle=fresh(),goliath=battle.create(3,0,400,800),target=battle.create(0,1,450,800);target.hp=target.maxHp=30000;face(goliath,8);goliath.turretDirection256=64;goliath.order='focus';goliath.target=target;
 assert.ok(battle.attack(goliath,target,battle.weapon(goliath,target)));
 assert.notEqual(goliath.attackControl.image,goliath.def.image,'Goliath fires from a separate turret image');
 assert.equal(goliath.attackVisualTrack,null,'the turret attack track is not owned by the body');
 goliath.turretVisualTrack='attackRepeat';goliath.action='walk';goliath.cooldown=.4;
 let tracks=unitRenderTracks(goliath,'walk');assert.equal(tracks.bodyTrackOverride,null);assert.equal(tracks.turretTrackOverride,'attackRepeat','turret retains its valid cooldown pose');
 for(const action of ['idle','heal','burrow','unburrow','death'])assert.equal(unitRenderTracks({...goliath,attackVisualTrack:'attackRepeat'},action).bodyTrackOverride,null);
 goliath.cooldown=0;goliath.attackControl=null;tracks=unitRenderTracks(goliath,'walk');assert.equal(tracks.turretAction,'idle');assert.equal(tracks.turretTrackOverride,null);
 assert.equal(unitRenderTracks({...goliath,action:'attack',attackVisualTrack:'attackRepeat'},'attack').bodyTrackOverride,'attackRepeat');
});

test('visual track changes do not reschedule the two Zealot hits on first or repeat attacks',()=>{
 const battle=fresh(),zealot=battle.create(65,0,400,700),target=battle.create(0,1,427,700);
 target.hp=target.maxHp=30000;target.order='move';zealot.order='focus';zealot.target=target;face(zealot,8);
 assert.ok(battle.attack(zealot,target,battle.weapon(zealot,target)));
 const hits=[];let hp=target.hp;
 for(let tick=1;tick<=32;tick++){
  battle.step(1/24);
  if(target.hp!==hp){hits.push([tick,hp-target.hp]);hp=target.hp}
 }
 assert.deepEqual(hits,[[4,8],[6,8],[26,8],[28,8]],'each first/repeat swing retains both source-timed impacts');
});

test('braking displacement enters walk once without resetting persistent visuals',()=>{
 const battle=fresh(),vulture=battle.create(2,0,400,700);
 vulture.motion.speedRaw=500;vulture.motion.velocityDirection256=64;vulture.action='attack';vulture.animTime=.6;vulture.visualTime=4;
 assert.equal(brakeUnitMovement(battle,vulture,1/24),true);
 assert.equal(vulture.action,'walk');assert.equal(vulture.animTime,0);assert.equal(vulture.visualTime,4);
 vulture.animTime=.3;assert.equal(brakeUnitMovement(battle,vulture,1/24),true);assert.equal(vulture.animTime,.3);
});
