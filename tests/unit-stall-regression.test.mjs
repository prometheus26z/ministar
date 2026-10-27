import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as LaneBattle} from '../dist/autobattle.js';
import {Battle as CombatBattle} from '../dist/core.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);
Object.assign(data.graphics,extra.graphics);
const lane=()=>{const b=new LaneBattle(data,{race:'protoss',enemyRace:'protoss',difficulty:'easy'});b.begin();b.waveClock=1e9;b.botStep=()=>{};b.map.rocks=[];return b};
const combat=()=>{const b=new CombatBattle(data);b.phase='battle';b.map.rocks=[];return b};
const advance=(b,u,seconds)=>{const dt=1/24;for(let i=0;i<Math.round(seconds/dt);i++){b.time+=dt;b.tickUnit(u,dt)}};
const diagnostics=(b,u)=>({id:u.id,type:u.type,team:u.team,x:u.x,y:u.y,order:u.order,action:u.action,goal:u.goal,pathFirst:u.path?.[0],pathLast:u.path?.at(-1),target:u.target?.id,targetAlive:u.target?.alive,targetDistance:u.target&&b.edgeDistance(u,u.target),targetRange:u.target&&b.weapon(u,u.target)?.range,combatMoving:u.combatMoving,waitingAttackSlot:u.waitingAttackSlot,attackControl:!!u.attackControl,nonInterruptible:u.attackControl?.nonInterruptible,laneStall:u.laneStall,attackProgress:u.attackProgress,attackRetries:u.attackRetries,heading:u.motion?.heading256,desired:u.motion?.desiredDirection256});

test('stale attack, airAttack and cast poses do not suppress route recovery or resumed movement',()=>{
 for(const action of ['attack','airAttack','cast']){
  const b=lane();b.units=[];const u=b.create(66,0,640,1700),objective=b.laneObjective(0);
  u.laneArmy=true;u.laneOffset=0;b.setAdvanceGoal(u,objective);u.laneObjectiveId=objective.id;
  u.action=action;const start={x:u.x,y:u.y},move=b.move.bind(b);let recoveries=0;
  b.move=()=>false;b.recoverLaneRoute=()=>{recoveries++;return true};
  advance(b,u,1.6);
  assert.ok(recoveries>=1,`${action}: stalled route recovery must run`);
  b.move=move;advance(b,u,1.5);
  assert.ok(Math.hypot(u.x-start.x,u.y-start.y)>2,`${action}: unit must advance after blockage clears`);
 }
});

test('replacing an unmoved waypoint never resets lane stall; active combat and disabled units are preserved',()=>{
 const b=lane();b.units=[];const u=b.create(66,0,640,1700),objective=b.laneObjective(0);
 u.laneArmy=true;b.setAdvanceGoal(u,objective);u.laneObjectiveId=objective.id;
 let recoveries=0;b.recoverLaneRoute=()=>{recoveries++;return true};
 for(let i=0;i<35;i++){u.path=[{x:640,y:1450}];b.time+=1/24;b.maintainAdvance(u,1/24)}
 assert.ok(recoveries>0,'waypoint object recreation must not count as travel');
 const before=recoveries;u.attackControl={targetId:77,nonInterruptible:true};u.laneStall=2;
 b.maintainAdvance(u,1/24);assert.equal(recoveries,before,'live noninterruptible attack control blocks lane detour');
 u.attackControl=null;u.buffs.stasis=2;b.maintainAdvance(u,1/24);
 assert.equal(recoveries,before,'stasis cannot be interrupted to force a move');
});

test('attack slot wait is accumulated over repeated half-second route probes, then abandoned for forward progress',()=>{
 const b=combat(),u=b.create(65,0,400,700),target=b.create(0,1,600,700),other=b.create(65,0,420,800);
 b.canSee=()=>true;b.setGoal(u,{x:900,y:700},'attackmove');u.target=target;other.target=target;
 b.reserveAttackSlot(other,target,{x:605,y:765});b.attackReservations.get(target.id)[0].expiresAt=100;
 b.approachPath=()=>({path:[],point:null,wait:true});
 advance(b,u,.75);const since=u.attackSlotWaitSince;
 assert.equal(u.waitingAttackSlot,true);assert.equal(u.attackSlotWaitTargetId,target.id);
 advance(b,u,.5);assert.equal(u.attackSlotWaitSince,since,'refresh probes cannot reset the wait clock');
 advance(b,u,.45);
 assert.equal(u.waitingAttackSlot,false,'1.5s without a slot expires the wait');
 assert.equal(u.target,null,'unreachable slot target is temporarily excluded');
 assert.ok(u.unreachableTargets[target.id]>b.time);
 assert.ok(b.activeAttackSlots(target).some(slot=>slot.unit===other),'a different unit keeps its reservation');
 const before=u.x;advance(b,u,.6);
 assert.ok(u.x>before+1,'the abandoned attacker resumes its lane goal');
});

test('an attack slot becoming available resumes pursuit and all hard command transitions clear wait ownership',()=>{
 const b=combat(),u=b.create(65,0,400,700),target=b.create(0,1,600,700);
 b.canSee=()=>true;b.setGoal(u,{x:950,y:700},'attackmove');u.target=target;
 let blocked=true;b.approachPath=()=>blocked?{path:[],point:null,wait:true}:{path:[{x:540,y:700}],point:{x:540,y:700}};
 advance(b,u,.7);assert.equal(u.waitingAttackSlot,true);
 blocked=false;advance(b,u,.6);
 assert.equal(u.waitingAttackSlot,false);assert.equal(u.attackSlotWaitSince,null);
 assert.ok(u.attackPath.length||u.x>400,'free slot is used for pursuit');
 for(const reason of ['stop','ownership','load','death']){
  b.trackAttackSlotWait(u,target,true);b.reserveAttackSlot(u,target,{x:520,y:700});
  b.clearActionControl(u,reason,true);
  assert.equal(u.waitingAttackSlot,false,reason);assert.equal(u.attackSlotWaitTargetId,null,reason);
  assert.equal(u.attackSlotTargetId,undefined,reason);
 }
});

test('base approach is silent without suppressing other notice events',()=>{
 const b=lane(),notices=[];b.on(event=>{if(event.type==='notice')notices.push(event.text)});
 const enemy=b.create(0,1,b.main.x,b.main.y+20);enemy.laneArmy=true;enemy.order='hold';
 b.step(1/24);
 assert.equal(notices.filter(text=>text?.includes('기지에 접근')).length,0);
 b.emit('notice',{text:'other notice'});assert.ok(notices.includes('other notice'));
});

test('both Dragoon columns emerge from behind their bases and keep advancing after an outpost transition',()=>{
 const b=lane(),units=[];
 for(const team of [0,1])for(let i=0;i<8;i++){
  const u=b.create(66,team,500+(i%8)*40,team?190:1850),objective=b.laneObjective(team);
  u.laneArmy=true;u.laneOffset=(i-3.5)*22;b.setAdvanceGoal(u,objective);u.laneObjectiveId=objective.id;
  units.push({u,start:{x:u.x,y:u.y}});
 }
 for(let i=0;i<240;i++)b.step(1/24);
 for(const team of [0,1]){
  const teamUnits=units.filter(({u})=>u.team===team);
  const progressed=teamUnits.filter(({u,start})=>(team?u.y-start.y:start.y-u.y)>60);
  assert.ok(progressed.length>=6,`team ${team}: ${JSON.stringify(teamUnits.map(({u})=>diagnostics(b,u)))}`);
 }
 // Isolate the objective handoff from the legitimate central Dragoon firefight.
 const follow=lane();follow.units=follow.units.filter(u=>u.def.building);
 const dragoon=follow.create(66,0,640,1000),before=dragoon.y;
 dragoon.laneArmy=true;follow.setAdvanceGoal(dragoon,follow.laneObjective(0));dragoon.laneObjectiveId=follow.laneObjective(0).id;
 follow.die(follow.enemyOutpost,0);
 for(let i=0;i<100;i++)follow.step(1/24);
 assert.ok(dragoon.y<before-20,`outpost transition: ${JSON.stringify(diagnostics(follow,dragoon))}`);
});
