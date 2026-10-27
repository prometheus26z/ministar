import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/core.js';
import {UnitGrid} from '../dist/spatial.js';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const data=read('../dist/assets/data.json'),extra=read('../dist/rts-data.json');
Object.assign(data.units,extra.units);
Object.assign(data.graphics,extra.graphics,read('../dist/original-animation-data.json'));
const fresh=()=>{const b=new Battle(data);b.phase='battle';b.map.rocks=[];b.map.water=[];return b};

test('absent Arbiters and detectors avoid full-army visibility queries',()=>{
 const b=fresh(),ally=b.create(65,0,500,600),enemy=b.create(0,1,530,600);
 for(let i=0;i<160;i++)b.create(0,i%2,800+i%10*20,700+Math.floor(i/10)*20);
 b.spatial=new UnitGrid(b.units);
 assert.equal(b.spatial.arbiters.size,0);
 assert.equal(b.spatial.detectors.size,0);
 b.nearbyAny=()=>{throw Error('visibility must use dedicated capability sets')};
 assert.equal(b.hasArbiterAura(ally),false);
 assert.equal(b.detectedBy(0,enemy),false);
 b.spatial=null;
});

test('Arbiter and detector capabilities react to spawn, moving, ownership, disabling and death',()=>{
 const b=fresh(),ally=b.create(65,0,500,600),enemy=b.create(0,1,510,600);
 b.spatial=new UnitGrid(b.units);
 const arbiter=b.create(71,0,520,600);
 assert.equal(b.hasArbiterAura(ally),true);
 arbiter.x=1000;b.spatial.update(arbiter);assert.equal(b.hasArbiterAura(ally),false);
 arbiter.x=520;b.spatial.update(arbiter);arbiter.team=1;assert.equal(b.hasArbiterAura(ally),false);
 arbiter.team=0;arbiter.buffs.lockdown=10;assert.equal(b.hasArbiterAura(ally),false);
 arbiter.buffs.lockdown=0;assert.equal(b.hasArbiterAura(ally),true);
 const observer=b.create(84,0,525,600);assert.equal(observer.def.detector,true);
 enemy.cloaked=true;assert.equal(b.detectedBy(0,enemy),true);
 observer.team=1;assert.equal(b.detectedBy(0,enemy),false);
 observer.team=0;observer.alive=false;b.spatial.update(observer);assert.equal(b.detectedBy(0,enemy),false);
 b.die(arbiter,1);assert.equal(b.hasArbiterAura(ally),false);
 b.spatial=null;
});

test('attack approach slots separate incoming allies and free on target changes',()=>{
 const b=fresh(),building=b.create(156,1,640,700),attackers=[];
 for(let i=0;i<12;i++){
  const u=b.create(65,0,420+i%4*28,780+Math.floor(i/4)*26);u.target=building;attackers.push(u);
 }
 for(const u of attackers){
  const plan=b.approachPath(u,building,12,{reserve:true});
  assert.ok(plan,`attacker ${u.id} has a slot or a valid queue`);
  if(plan.point)b.reserveAttackSlot(u,building,plan.point);
 }
 const slots=b.activeAttackSlots(building);
 assert.ok(slots.length>=6,`distinct reachable slots: ${slots.length}`);
 for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){
  assert.ok(Math.hypot(slots[i].point.x-slots[j].point.x,slots[i].point.y-slots[j].point.y)>=slots[i].r+slots[j].r+4-1e-6);
 }
 const first=slots[0];first.unit.target=null;b.renewAttackSlot(first.unit);
 assert.ok(!b.activeAttackSlots(building).some(slot=>slot.unit===first.unit));
 const second=slots[1];b.die(second.unit,1);
 assert.ok(!b.activeAttackSlots(building).some(slot=>slot.unit===second.unit));
});

test('mobile collision broad phase includes large edge-overlapping buildings and fast swept movers',()=>{
 const b=fresh(),mover=b.create(65,0,500,700),building=b.create(109,1,680,700),blocker=b.create(0,1,555,700);
 b.spatial=new UnitGrid(b.units,32);
 const from={x:500,y:700},to={x:700,y:700};
 const candidates=b.spatial.collisionCandidates(mover,from,to);
 assert.ok(candidates.includes(building));assert.ok(candidates.includes(blocker));
 assert.equal(b.movementLimit(mover,from,to,candidates),b.movementLimit(mover,from,to,b.units));
 const backward={x:300,y:700},fan=b.spatial.collisionCandidates(mover,from,{x:700,y:700},true);
 assert.equal(b.movementLimit(mover,from,backward,fan),b.movementLimit(mover,from,backward,b.units));
 b.spatial=null;
});

test('bounded visual-frame scheduling retains every simulation tick as backlog',()=>{
 const b=fresh();let ticks=0;
 b.step=()=>{ticks++};
 b.update(5/24,{maxTicks:2,cpuBudgetMs:Infinity});
 assert.equal(ticks,2);
 assert.ok(Math.abs(b.simBacklogSeconds-3/24)<1e-8);
 b.update(1/24,{maxTicks:2,cpuBudgetMs:Infinity});
 assert.equal(ticks,4);
 assert.ok(Math.abs(b.simBacklogSeconds-2/24)<1e-8);
 b.update(1/24);
 assert.equal(ticks,7);
 assert.ok(b.simBacklogSeconds<1e-8);
});
