import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as CombatBattle,MAX_DEATH_VISUAL_SECONDS} from '../dist/core.js';
import {Battle as LaneBattle} from '../dist/autobattle.js';
import {layeredActionSeconds} from '../dist/animation.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);Object.assign(data.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));
const lane=(race='protoss')=>{const b=new LaneBattle(data,{race,enemyRace:race,difficulty:'easy'});b.begin();b.botStep=()=>{};b.waveClock=99999;return b};
const combat=()=>{const b=new CombatBattle(data,{race:'terran'});b.phase='battle';return b};

test('eight Protoss Zealots reach and damage the durable temple outpost',()=>{
 const b=lane(),temple=b.enemyOutpost,hp=temple.hp;
 for(let i=0;i<8;i++){const u=b.create(65,0,570+(i%4)*40,730+Math.floor(i/4)*40),objective=b.laneObjective(0);u.laneArmy=true;u.laneOffset=0;b.setAdvanceGoal(u,objective);u.laneObjectiveId=objective.id}
 for(let i=0;i<600;i++)b.step(1/30);
 assert.ok(temple.alive);assert.ok(temple.hp<hp);
 const zealots=b.units.filter(u=>u.team===0&&u.type===65&&u.alive);assert.equal(zealots.length,8);
 assert.ok(zealots.some(u=>u.target===temple&&b.edgeDistance(u,temple)<=b.weapon(u,temple).range));
});

test('melee attackers spread around a building instead of remaining stacked',()=>{
 const b=lane(),pylon=b.enemyOutpost;
 for(let i=0;i<8;i++){const u=b.create(65,0,570+(i%4)*40,730+Math.floor(i/4)*40),objective=b.laneObjective(0);u.laneArmy=true;u.laneOffset=0;b.setAdvanceGoal(u,objective);u.laneObjectiveId=objective.id}
 for(let i=0;i<600;i++)b.step(1/30);
 const group=b.units.filter(u=>u.team===0&&u.type===65&&u.alive),gaps=[];
 for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)gaps.push(Math.hypot(group[i].x-group[j].x,group[i].y-group[j].y)-group[i].r-group[j].r);
 assert.ok(Math.min(...gaps)>-9,'pair separation prevents deep overlap while units gather at the Pylon');
 assert.ok(group.some(u=>u.target===pylon||u.target?.type===162));
});

test('an in-range armed threat wins over an unarmed Pylon even when it was added later',()=>{
 const b=lane();b.units=[];
 const zealot=b.create(65,0,640,640),pylon=b.create(156,1,600,640),cannon=b.create(162,1,700,640),marine=b.create(0,1,660,640);pylon.isFortification=true;cannon.isFortification=true;zealot.order='attackmove';
 b.tickUnit(zealot,.05);
 assert.equal(b.unitThreatens(pylon,zealot),false,'Pylon fortification metadata alone does not make it a threat');
 assert.equal(zealot.target,marine,'an in-range armed unit outranks an in-range passive Pylon and an out-of-range Cannon');
 b.units=b.units.filter(u=>u!==marine);zealot.target=null;zealot.attackPathTarget=null;b.tickUnit(zealot,.05);assert.equal(zealot.target,pylon,'the in-range Pylon is chosen before an out-of-range armed building');
});

test('an acquired target stays locked when a similar target moves closer',()=>{
 const b=lane();b.units=[];
 const attacker=b.create(65,0,500,700),first=b.create(0,1,530,700),later=b.create(0,1,550,700);attacker.order='attackmove';
 b.tickUnit(attacker,.05);assert.equal(attacker.target,first);
 later.x=502;b.tickUnit(attacker,.05);
 assert.equal(attacker.target,first,'small distance changes do not make units oscillate targets');
});
test('lane armies can engage valid threats on either side of the central corridor',()=>{
 const b=lane();b.units=[];
 const attacker=b.create(65,0,640,700),flanker=b.create(0,1,910,700);attacker.laneArmy=true;attacker.order='attackmove';
 assert.ok(Math.abs(flanker.x-640)>240);
 assert.ok(Math.hypot(attacker.x-flanker.x,attacker.y-flanker.y)>96);
 assert.ok(b.weapon(attacker,flanker),'lane positioning does not disable a valid side target');
 assert.equal(b.canAttackTarget(attacker,flanker),true);
});

test('actual damage draws aggro to a valid source and releases a dead source',()=>{
 const b=lane();b.units=[];
 const defender=b.create(65,0,600,700),friend=b.create(65,0,620,700),source=b.create(0,1,610,700),pylon=b.create(156,1,620,700);
 defender.target=pylon;friend.target=pylon;b.hitUnit(defender,5,1,3,null,source);
 assert.equal(defender.aggroTarget,source.id);assert.equal(defender.target,source);
 assert.equal(friend.aggroTarget,source.id,'nearby allies receive the recent attack cue');
 b.die(source,0);b.tickUnit(defender,.05);
 assert.notEqual(defender.target,source,'a dead attacker cannot remain a target');
});
test('a flank Marine stays the retaliation target while the old target is not attacking back',()=>{
 const b=lane();b.units=[];
 const defender=b.create(65,0,600,700),oldTarget=b.create(65,1,620,700),marine=b.create(0,1,675,700);
 defender.order='attackmove';defender.target=oldTarget;oldTarget.target=null;oldTarget.action='idle';
 assert.ok(b.weapon(defender,marine));assert.ok(b.edgeDistance(defender,marine)>b.weapon(defender,marine).range,'Marine is visible but outside immediate weapon range');
 b.hitUnit(defender,5,1,3,null,marine);
 assert.equal(defender.target,marine,'damage from the flank replaces an unrelated current target');
 b.tickUnit(defender,.05);
 assert.equal(defender.target,marine,'target review must preserve the recent attacker while the unit closes distance');
 assert.ok(defender.attackPathTarget===marine.id||defender.combatMoving,'the unit routes toward its attacker');
 oldTarget.target=defender;oldTarget.action='attack';
 defender.target=oldTarget;
 assert.equal(b.betterTarget(defender,oldTarget),oldTarget,'an enemy actively attacking this unit can still win over the temporary retaliation target');
});
test('damage does not pull a unit off an enemy already attacking it',()=>{
 const b=lane();b.units=[];
 const defender=b.create(65,0,600,700),current=b.create(65,1,620,700),newSource=b.create(0,1,610,700);
 defender.target=current;current.target=defender;current.action='attack';current.animTime=.2;
 b.hitUnit(defender,5,1,3,null,newSource);
 assert.equal(defender.target,current,'the current enemy is actively attacking this unit');
 assert.equal(defender.aggroTarget,newSource.id,'the new damage source remains recorded for later retargeting');
});


test('lane Lurkers march unburrowed, burrow for ground threats, and resume marching after they leave range',()=>{
 const b=lane('zerg'),lurker=b.spawnUnit(103,0,0,1,b.main);
 assert.ok(lurker);assert.equal(lurker.burrowed,false);assert.equal(lurker.action,'unburrow');assert.equal(lurker.order,'attackmove');
 assert.ok(b.availableAbilities(lurker).includes('burrow'),'Lurker can use its innate burrow ability');
 for(let i=0;i<30&&lurker.lurkerTransition>0;i++)b.tickUnit(lurker,.1);
 const enemy=b.create(0,1,lurker.x+60,lurker.y);
 b.tickUnit(lurker,.05);assert.equal(lurker.burrowed,true);assert.equal(lurker.action,'burrow');
 for(let i=0;i<30&&lurker.lurkerTransition>0;i++)b.tickUnit(lurker,.1);
 assert.equal(lurker.burrowed,true,'a Lurker stays burrowed while a ground target is in weapon range');
 enemy.x=lurker.x+420;b.tickUnit(lurker,.05);
 assert.equal(lurker.burrowed,false);assert.equal(lurker.action,'unburrow');assert.equal(lurker.order,'attackmove');assert.ok(lurker.goal);
});
test('Medic follows an injured ally, heals while stationary, and charges energy for HP restored',()=>{
 const b=combat(),medic=b.create(34,0,200,200),patient=b.create(0,0,350,200);patient.hp=patient.maxHp-10;
 b.setGoal(medic,{x:800,y:200},'attackmove');const savedGoal={...medic.goal},startX=medic.x;
 for(let i=0;i<180&&patient.hp<patient.maxHp;i++)b.tickUnit(medic,.05);
 assert.ok(patient.hp>patient.maxHp-10);assert.equal(patient.hp,patient.maxHp);
 assert.ok(medic.x>startX);assert.equal(medic.goal.x,savedGoal.x,'patient pursuit keeps the march goal');assert.equal(medic.healTarget,null);const afterHeal=medic.x;for(let i=0;i<10;i++)b.tickUnit(medic,.05);assert.ok(medic.x>afterHeal,'Medic resumes its march when the patient is fully healed');
 const nearby=b.create(0,0,medic.x+15,medic.y);nearby.hp=nearby.maxHp-8;medic.energy=20;const x=medic.x,hp=nearby.hp,energy=medic.energy;
 assert.equal(b.medicHeal(medic,.2),true);assert.equal(medic.x,x,'healing range holds position');assert.equal(nearby.hp-hp,Math.min(3.75,8));assert.equal(energy-medic.energy,(nearby.hp-hp)*.5);
});

test('Medic selects separate wounded patients and rejects invalid or disabled targets',()=>{
 const b=combat(),m1=b.create(34,0,300,300),m2=b.create(34,0,310,300),a=b.create(0,0,350,300),c=b.create(0,0,380,300);a.hp-=20;c.hp-=15;
 b.medicHeal(m1,.05);b.medicHeal(m2,.05);assert.ok(m1.healTarget);assert.ok(m2.healTarget);assert.notEqual(m1.healTarget,m2.healTarget);
 const enemy=b.create(0,1,300,300),building=b.create(131,0,300,300),air=b.create(43,0,300,300),hallucination=b.create(0,0,300,300),loaded=b.create(0,0,300,300),disabled=b.create(0,0,300,300),hidden=b.create(0,0,300,300),producer=b.create(0,0,300,300);
 hallucination.hallucination=true;loaded.loaded=m1.id;disabled.buffs.stasis=2;hidden.hidden=true;producer.productionOnly=true;
 for(const target of [m1,enemy,building,air,hallucination,loaded,disabled,hidden,producer]){target.hp-=5;assert.equal(b.medicTargetValid(m1,target),false)}
});

test('zero-energy Medic releases a patient and resumes its existing march',()=>{
 const b=combat(),medic=b.create(34,0,200,200),patient=b.create(0,0,220,200);patient.hp-=20;medic.energy=0;medic.order='attackmove';b.setGoal(medic,{x:400,y:200},'attackmove');
 const x=medic.x;b.tickUnit(medic,.1);
 assert.ok(!medic.healTarget);assert.ok(medic.x>x);assert.equal(patient.hp,patient.maxHp-20);
});


test('fast Vulture and Zergling approach points without overshooting them',()=>{
 for(const type of [2,37]){const b=lane();b.units=[];const unit=b.create(type,0,400,700),pylon=b.create(156,1,760,700);unit.def={...unit.def,sight:500,speed:500};unit.order='attackmove';
  for(let i=0;i<100&&pylon.alive;i++)b.tickUnit(unit,.1);
  assert.ok(b.edgeDistance(unit,pylon)<=b.weapon(unit,pylon).range,`${unit.def.name} reaches its final attack waypoint`);
  assert.equal(unit.action,'attack');
 }
});


test('death clips remain available for their full animation duration',()=>{
 const b=combat(),marine=b.create(0,0,200,200),track=b.data.graphics[marine.def.image]?.tracks?.death;
 b.die(marine);
 const sourceDuration=layeredActionSeconds(b.data.graphics,marine.def.image,'death',1.8),expected=Math.max(.2,Math.min(MAX_DEATH_VISUAL_SECONDS,sourceDuration));
 assert.equal(marine.action,'death');assert.equal(marine.animTime,0);assert.equal(marine.deathDuration,expected);
 const fallback=b.create(0,0,240,200);fallback.def={...fallback.def,image:999999};b.die(fallback);assert.equal(fallback.deathDuration,1.8);
 const archon=b.create(68,0,260,200),darkArchon=b.create(63,0,280,200);b.die(archon);b.die(darkArchon);
 assert.ok(archon.deathDuration>Number(b.data.graphics[134].tracks.death.ticks)/24,'Archon keeps its longer layered death effect visible');
 assert.equal(archon.deathDuration,20/24);assert.equal(darkArchon.deathDuration,15/24,'Dark Archon uses its original death effect lifetime');
 const ultralisk=b.create(39,0,300,200);b.die(ultralisk);
 assert.equal(ultralisk.deathDuration,11.25,'the original Ultralisk corpse timeline remains visible beyond the prior eight-second clamp');
 const longestSourceDeath=Math.max(...Object.values(b.data.units).map(unit=>layeredActionSeconds(b.data.graphics,unit.image,'death',1.8)));
 assert.equal(longestSourceDeath,11.25);assert.ok(longestSourceDeath<=MAX_DEATH_VISUAL_SECONDS,'the visual cap covers every recovered playable-unit death and corpse track');
});
test('bunker garrison hits use the canonical live source and bunker victims do not crash aggro selection',()=>{
 const b=lane('terran'),bunker=b.makeBunker(1,640,480),target=b.create(0,0,bunker.x,bunker.y-35),clone={...bunker,alive:true};
 b.hitUnit(target,5,1,3,null,clone);assert.equal(target.aggroTarget,bunker.id,'a garrison shooter resolves to its real bunker');
 const counter=b.create(0,0,bunker.x,bunker.y+35);assert.doesNotThrow(()=>b.hitUnit(bunker,5,0,3,null,counter));
 b.die(bunker,0);b.tickUnit(target,.05);assert.notEqual(target.target,bunker,'a destroyed source is no longer retained as a target');
});

test('after a pursuit and kill the march resumes ahead instead of returning to stale waypoints',()=>{
 const b=combat();b.map.rocks=[];b.canSee=()=>true;
 const marine=b.create(0,0,200,700),enemy=b.create(0,1,600,700);enemy.hp=1;
 b.setGoal(marine,{x:900,y:700},'attackmove');
 for(let i=0;i<200&&enemy.alive;i++)b.tickUnit(marine,.05);
 assert.equal(enemy.alive,false);const x=marine.x;
 b.tickUnit(marine,.05);assert.ok(marine.x>x,'resume route starts at the end of the pursuit');
 assert.equal(marine.goal.x,900);
});

test('a loaded or disabled Medic does not reserve the wounded patient from another Medic',()=>{
 for(const state of ['loaded','stasis','energy']){
  const b=combat(),first=b.create(34,0,200,200),second=b.create(34,0,210,200),patient=b.create(0,0,230,200);patient.hp-=20;first.healTarget=patient;
  if(state==='loaded')first.loaded=999;else if(state==='stasis')first.buffs.stasis=5;else first.energy=0;
  const hp=patient.hp;assert.equal(b.medicHeal(second,.1),true);assert.equal(second.healTarget,patient);assert.ok(patient.hp>hp);
 }
});

test('explicit movement and hold orders limit Medic pursuit',()=>{
 const b=combat();b.map.rocks=[];
 const medic=b.create(34,0,200,700),patient=b.create(0,0,350,700);patient.hp-=20;
 b.setGoal(medic,{x:900,y:700},'move');b.tickUnit(medic,.1);
 assert.equal(medic.healTarget,undefined);assert.ok(medic.x>200);
 b.select([medic.id],false);b.openMenu();assert.ok(b.execute('hold'));const x=medic.x;b.tickUnit(medic,.1);assert.equal(medic.x,x);assert.ok(!medic.healTarget);
 patient.x=medic.x+30;b.tickUnit(medic,.1);assert.ok(patient.hp>patient.maxHp-20);assert.equal(medic.x,x);
});

test('disabled Lurkers cannot burrow and status timers continue during transitions',()=>{
 for(const status of ['stasis','lockdown','maelstrom']){
  const b=lane('zerg');b.units=[];const u=b.create(103,0,600,700);u.laneArmy=true;u.order='attackmove';u.buffs[status]=1;u.cooldown=2;b.create(0,1,660,700);
  b.tickUnit(u,.1);assert.equal(u.burrowed,false,status);assert.ok(Math.abs(u.buffs[status]-.9)<1e-8);assert.ok(Math.abs(u.cooldown-1.9)<1e-8);assert.equal(b.cast(u,'burrow'),false);
  u.buffs[status]=0;b.tickUnit(u,.1);assert.equal(u.action,'burrow');const remaining=u.lurkerTransition,anim=u.animTime;u.buffs[status]=.5;
  b.tickUnit(u,.1);assert.equal(u.lurkerTransition,remaining,'disabled transitions pause');assert.equal(u.animTime,anim,'disabled transition visuals pause');assert.ok(Math.abs(u.buffs[status]-.4)<1e-8);assert.ok(Math.abs(u.cooldown-1.7)<1e-8);
  u.buffs[status]=0;assert.equal(b.cast(u,'burrow'),false,'an active transition cannot be toggled again');b.tickUnit(u,.1);assert.ok(u.lurkerTransition<remaining);
 }
});
