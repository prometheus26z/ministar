import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as CombatBattle} from '../dist/core.js';
import {Battle as LaneBattle} from '../dist/autobattle.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const lane=(race='protoss')=>{const b=new LaneBattle(data,{race,difficulty:'easy'});b.begin();b.botStep=()=>{};b.waveClock=99999;return b};
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

test('actual damage draws aggro to a valid source and releases a dead source',()=>{
 const b=lane();b.units=[];
 const defender=b.create(65,0,600,700),friend=b.create(65,0,620,700),source=b.create(0,1,610,700),pylon=b.create(156,1,850,700);
 defender.target=pylon;friend.target=pylon;b.hitUnit(defender,5,1,3,null,source);
 assert.equal(defender.aggroTarget,source.id);assert.equal(defender.target,source);
 assert.equal(friend.aggroTarget,source.id,'nearby allies receive the recent attack cue');
 b.die(source,0);b.tickUnit(defender,.05);
 assert.notEqual(defender.target,source,'a dead attacker cannot remain a target');
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
