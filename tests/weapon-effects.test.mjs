import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../dist/core.js';
import {cooldownFrames,healthDamageAfterArmor} from '../dist/combat-rules.js';
import {combatData,emptyLaneBattle} from './combat-test-data.mjs';

const fresh=()=>{const b=new Battle(combatData());b.phase='battle';b.map.rocks=[];return b};
const splash=(explosionType='Radial_Splash',splashRadii=[10,20,30])=>({explosionType,splash:splashRadii,air:true,ground:true,type:3});

test('armor damage spill after shield break skips the secondary minimum-damage floor',()=>{
 const b=fresh(),u=b.create(0,1,400,900);u.def={...u.def,armor:10,shieldArmor:0,size:3};u.hp=100;u.shield=1;
 b.hurt(u,2,0,3);assert.equal(u.hp,100);assert.equal(u.shield,0);
 u.def={...u.def,armor:0,size:1};u.hp=100;u.shield=1;b.hurt(u,1.25,0,3);assert.equal(u.hp,99.75);
 u.hp=100;u.shield=0;u.def={...u.def,armor:10};b.hurt(u,1,0,3);assert.equal(u.hp,99.5,'unshielded armor still enforces the half-point floor');
 u.hp=100;u.shield=20;u.def={...u.def,armor:0,shieldArmor:0,size:3};b.hurt(u,20,0,1);assert.equal(u.shield,0,'explosive damage type does not reduce shield damage by size');assert.equal(u.hp,100);
 assert.equal(healthDamageAfterArmor({...u,def:{...u.def,armor:10,size:3}},1,3),.5,'unshielded minimum remains intact');
});

test('radial splash damages nearby allies while enemy splash excludes them',()=>{
 const b=fresh(),source=b.create(0,0,300,900),primary=b.create(0,1,400,900),ally=b.create(0,0,402,900),outer=b.create(0,1,435,900);for(const u of [primary,ally,outer])u.hp=u.maxHp=200;
 b.weaponImpact(primary,splash(),70,0,3,{x:400,y:900},false,source);
 assert.equal(primary.hp,130);assert.equal(ally.hp,130);assert.equal(outer.hp,182.5);
 const b2=fresh(),s=b2.create(0,0,300,900),p=b2.create(0,1,400,900),friend=b2.create(0,0,402,900);for(const u of [p,friend])u.hp=u.maxHp=200;
 b2.weaponImpact(p,splash('Enemy_Splash'),70,0,3,{x:400,y:900},false,s);
 assert.equal(friend.hp,200);assert.equal(p.hp,130);
});

test('ground splash respects weapon layers, burrow inner-only damage, and excludes its attacker',()=>{
 const b=fresh(),source=b.create(0,0,401,900),primary=b.create(0,1,400,900),air=b.create(0,1,402,900);
 air.def={...air.def,air:true};for(const u of [source,primary,air])u.hp=u.maxHp=200;
 b.weaponImpact(primary,{...splash(),air:false,ground:true},70,0,3,{x:400,y:900},false,source);
 assert.equal(source.hp,200);assert.equal(primary.hp,130);assert.equal(air.hp,200);
 const c=fresh(),attacker=c.create(0,0,300,900),inner=c.create(103,1,400,900),middle=c.create(0,1,428,900),outer=c.create(0,1,445,900);
 for(const u of [inner,middle,outer]){u.burrowed=true;u.hp=u.maxHp=200;u.def={...u.def,armor:0}}
 c.weaponImpact(null,splash('Radial_Splash',[10,20,40]),100,0,3,{x:400,y:900},false,attacker);
 assert.equal(inner.hp,100);assert.equal(middle.hp,200,'burrowed targets ignore medium splash');assert.equal(outer.hp,200,'burrowed targets ignore outer splash');
});

test('air splash uses an enemy air primary hit, medium splash, and friendly/interceptor exclusions',()=>{
 const b=fresh();b.random=()=>0;const source=b.create(60,0,300,900),primary=b.create(0,1,400,900),middle=b.create(0,1,430,900),friend=b.create(0,0,405,900),interceptor=b.create(73,1,405,900);
 primary.def={...primary.def,air:true};middle.def={...middle.def,air:true};friend.def={...friend.def,air:true};interceptor.def={...interceptor.def,air:true};for(const u of [primary,middle,friend,interceptor])u.hp=u.maxHp=100;
 b.weaponImpact(primary,splash('Air_Splash',[5,50,100]),20,0,3,{x:400,y:900},false,source);
 assert.equal(primary.hp,80);assert.equal(middle.hp,90);assert.equal(friend.hp,100);assert.equal(interceptor.hp,100);
});

test('air splash selects one full-hit enemy when the original target is outside inner radius',()=>{
 const b=fresh();b.random=()=>0;const source=b.create(60,0,300,900),primary=b.create(0,1,480,900),alternate=b.create(0,1,430,900);
 for(const u of [primary,alternate]){u.def={...u.def,air:true};u.hp=u.maxHp=100}
 const weapon=splash('Air_Splash',[5,50,100]);b.weaponImpact(primary,weapon,20,0,3,{x:400,y:900},false,source);
 const losses=[100-primary.hp,100-alternate.hp].sort((a,b)=>a-b);
 assert.ok(JSON.stringify(losses)==='[0,30]'||JSON.stringify(losses)==='[10,20]',`expected one full hit and the source-defined secondary splash, got ${losses}`);
});

test('Mutalisk bounce queues the next distinct target without extending the live projectile pass',()=>{
 const b=fresh(),source=b.create(43,0,400,900),first=b.create(0,1,430,900),second=b.create(0,1,470,900),third=b.create(0,1,500,900);
 const weapon=b.weapon(source,first),shot={source,target:first,team:0,image:weapon.image,type:weapon.type,weapon,speed:300,damage:9,baseDamage:9,bounceIndex:0,previousTargetIds:[],missed:false};
 b.queueMutaliskBounce(shot,first,{x:first.x,y:first.y});
 assert.equal(b.pendingProjectiles.length,1);assert.equal(b.pendingProjectiles[0].target,second);assert.equal(b.pendingProjectiles[0].damage,3);
 const next=b.pendingProjectiles[0];b.pendingProjectiles=[];b.queueMutaliskBounce(next,second,{x:second.x,y:second.y});
 assert.equal(b.pendingProjectiles[0].target,third);assert.equal(b.pendingProjectiles[0].damage,1,'the third hit is floored to 1/256 after one ninth scaling');
 assert.equal(second.hp,second.maxHp);assert.equal(third.hp,third.maxHp);
});

test('Mutalisk bounce uses the 96-pixel rectangle and marks hero weapon 49 projectiles',()=>{
 const b=fresh();b.canSee=()=>true;const source=b.create(43,0,300,900),first=b.create(0,1,400,900),corner=b.create(0,1,485,985);
 const shot={source,target:first,team:0,image:0,weapon:b.weapon(source,first),speed:300,damage:9,baseDamage:9,bounceIndex:0,previousTargetIds:[],missed:false};
 b.queueMutaliskBounce(shot,first,{x:first.x,y:first.y});assert.equal(b.pendingProjectiles[0].target,corner,'a target inside the 96-pixel search square corner remains eligible');
 const hero=b.create(43,0,300,1200),victim=b.create(0,1,400,1200);hero.type=86;hero.def={...hero.def,groundWeapon:49,airWeapon:49};const weapon=b.weapon(hero,victim);assert.equal(weapon.sourceWeaponId,49);
 b.attack(hero,victim,weapon);assert.equal(b.projectiles.at(-1).bounceIndex,0,'weapon 49 receives the same first-bounce state');
});

test('Devourer spores stack to nine, refresh only the shortest timer, and add damage before armor',()=>{
 const b=fresh(),source=b.create(62,0,400,900),air=b.create(0,1,430,900);air.def={...air.def,air:true,armor:2,size:3};
 b.addAcidSpores({x:400,y:900},0,source);assert.equal(air.acidSporeTimers.length,1);
 air.acidSporeTimers=Array.from({length:9},(_,i)=>10+i);b.addAcidSpores({x:400,y:900},0,source);
 assert.deepEqual(air.acidSporeTimers,[50,11,12,13,14,15,16,17,18]);
 const hp=air.hp;b.weaponImpact(air,{explosionType:'Corrosive_Acid',air:true,ground:false,type:3},10,0,3,{x:400,y:900},false,source);
 assert.equal(hp-air.hp,17,'10 + 9 spores - 2 armor');assert.equal(air.acidSporeTimers[0],50,'the Devourer adds its next stack after direct damage');
 const marine=b.create(0,0,350,900),weapon={id:999,cooldown:30/24};
 assert.equal(cooldownFrames(b,marine,weapon),30);marine.acidSporeTimers=[50,50,50];assert.equal(cooldownFrames(b,marine,weapon),39);
 marine.buffs.ensnare=1;assert.equal(cooldownFrames(b,marine,weapon),48);marine.buffs.ensnare=0;marine.buffs.stim=1;assert.equal(cooldownFrames(b,marine,weapon),19);
 marine.buffs.ensnare=1;assert.equal(cooldownFrames(b,marine,weapon),39,'stim and ensnare cancel after the spore penalty');
 marine.acidSporeTimers=Array(9).fill(50);assert.equal(cooldownFrames(b,marine,{id:998,cooldown:250/24}),250,'the final cooldown remains capped');
});

test('acid spore rectangle search includes corners, excludes invalid targets, and expires while loaded',()=>{
 const b=fresh(),source=b.create(62,0,400,900);b.canSee=(team,u)=>u.team===team||!u.cloaked;
 const corner=b.create(0,1,470,970),ground=b.create(0,1,470,900),building=b.create(0,1,470,900),ally=b.create(0,0,470,900),hidden=b.create(0,1,470,900),loaded=b.create(0,1,470,900),production=b.create(0,1,470,900),invincible=b.create(0,1,470,900),cloaked=b.create(0,1,470,900);
 for(const u of [corner,building,ally,hidden,loaded,production,invincible,cloaked])u.def={...u.def,air:true};
 building.def={...building.def,building:true};hidden.hidden=true;loaded.loaded=999;production.productionOnly=true;invincible.def={...invincible.def,invincible:true};cloaked.cloaked=true;
 const hp=corner.hp;b.addAcidSpores({x:400,y:900},0,source);
 assert.equal(corner.acidSporeTimers.length,1,'DAT bounds that overlap the square corner are included');assert.equal(corner.hp,hp,'spore application causes no surrounding HP damage');
 for(const unit of [ground,building,ally,hidden,loaded,production,invincible,cloaked])assert.equal(unit.acidSporeTimers.length,0);
 corner.loaded=999;corner.acidSporeTimers=[.04];b.tickUnit(corner,.05);assert.equal(corner.acidSporeTimers.length,0,'timers continue while loaded');
});

test('Irradiate uses fixed 1/256 pulses, adds spores per pulse, and continues while loaded',()=>{
 const totalDamage=loaded=>{const b=fresh(),infected=b.create(0,1,400,900),transport=b.create(9,1,400,900),near=b.create(0,1,410,900);infected.hp=infected.maxHp=1000;near.hp=near.maxHp=1000;infected.acidSporeTimers=[50,50];near.acidSporeTimers=[50,50];infected.buffs.irradiate=25;infected.irradiateOwner=1;if(loaded)infected.loaded=transport.id;b.tickUnit(infected,25);return{damage:1000-near.hp,infected,near}};
 const single=totalDamage(false),loaded=totalDamage(true),expected=75*(Math.floor(250*256/75)/256+2);
 assert.ok(Math.abs(single.damage-expected)<1e-8);assert.ok(Math.abs(loaded.damage-expected)<1e-8);assert.equal(loaded.infected.buffs.irradiate,0);
 const split=fresh(),target=split.create(0,1,400,900);target.hp=target.maxHp=1000;target.acidSporeTimers=[50,50];target.buffs.irradiate=25;target.irradiateOwner=1;
 for(let i=0;i<600;i++)split.tickUnit(target,1/24);assert.ok(Math.abs((1000-target.hp)-expected)<1e-8,'dt partitioning leaves the same pulse total');
});

test('acid bonus stays on weapon damage paths and is cleared by Restore',()=>{
 const b=fresh(),target=b.create(0,1,400,900);target.hp=target.maxHp=1000;target.acidSporeTimers=[50,50,50];
 b.hurt(target,10,0,3);assert.equal(target.hp,990,'ordinary unit damage does not receive a blanket acid bonus');
 b.hitUnit(target,10,0,3,null,null,{acidBonusEligible:true});assert.equal(target.hp,977,'eligible weapon damage receives one point per stack before armor');
 const vessel=b.create(63,0,350,900),feedbackTarget=b.create(1,1,400,900);feedbackTarget.hp=feedbackTarget.maxHp=1000;feedbackTarget.energy=10;feedbackTarget.acidSporeTimers=[50,50,50];b.canSee=()=>true;assert.equal(b.cast(vessel,'feedback',null,feedbackTarget),true);assert.equal(feedbackTarget.hp,987,'positive Feedback energy damage receives the bonus');
 const yamato=b.create(12,0,350,1000),victim=b.create(0,1,400,1000);victim.hp=victim.maxHp=1000;victim.acidSporeTimers=[50,50];b.canSee=()=>true;
 assert.equal(b.cast(yamato,'yamato',null,victim),true);const missile=b.projectiles.at(-1);missile.x=missile.endX;missile.y=missile.endY;b.core={alive:true};b.simulateStep(.01);assert.equal(victim.hp,738,'Yamato impact damage receives the existing two stacks');
 const medic=b.create(34,0,350,1100),ally=b.create(0,0,400,1100);ally.acidSporeTimers=[20,20];ally.buffs.irradiate=5;ally.irradiatePulseElapsed=.2;ally.irradiatePulseCount=3;
 assert.equal(b.cast(medic,'restore',null,ally),true);assert.deepEqual(ally.acidSporeTimers,[]);assert.equal(ally.irradiatePulseCount,0);
 const hallucinated=b.create(43,0,350,1200),air=b.create(0,1,400,1200);air.def={...air.def,air:true};hallucinated.hallucination=true;b.weaponImpact(air,{explosionType:'Corrosive_Acid',air:true,ground:false,type:3},0,0,3,{x:400,y:1200},false,hallucinated);assert.equal(air.acidSporeTimers.length,0);
});

test('Arbiter cloak aura hides allied units from sight until detection or the Arbiter is removed',()=>{
 const b=fresh(),observer=b.create(0,0,400,900),protectedUnit=b.create(0,1,450,900);
 assert.equal(b.canSee(0,protectedUnit),true);
 const arbiter=b.create(71,1,430,900);assert.equal(b.hasArbiterAura(protectedUnit),true);assert.equal(b.canSee(0,protectedUnit),false);
 const detector=b.create(9,0,450,900);detector.def={...detector.def,detector:true};assert.equal(b.canSee(0,protectedUnit),true);
 detector.alive=false;const second=b.create(71,1,440,900);second.type=86;assert.equal(b.hasArbiterAura(protectedUnit),true,'the hero Arbiter source type also provides an aura');arbiter.alive=false;assert.equal(b.hasArbiterAura(protectedUnit),true);second.alive=false;assert.equal(b.canSee(0,protectedUnit),true);
 const hidden=b.create(0,1,450,900);hidden.hallucination=true;const building=b.create(162,1,450,900),otherArbiter=b.create(71,1,450,900);
 assert.equal(b.hasArbiterAura(hidden),false);assert.equal(b.hasArbiterAura(building),false);assert.equal(b.hasArbiterAura(otherArbiter),false);
 otherArbiter.alive=false;arbiter.alive=true;arbiter.buffs.lockdown=1;assert.equal(b.hasArbiterAura(protectedUnit),false,'disabled Arbiters stop cloaking');
 assert.ok(observer.alive);
});

test('lane visibility uses the same Arbiter aura and detection exceptions',()=>{
 const b=emptyLaneBattle(),target=b.create(0,1,500,900),arbiter=b.create(71,1,480,900);delete b.canSee;assert.equal(b.canSee(0,target),false);
 const detector=b.create(9,0,500,900);detector.def={...detector.def,detector:true};assert.equal(b.canSee(0,target),true);
 detector.alive=false;target.buffs.plague=1;assert.equal(b.canSee(0,target),true,'a non-burrowed aura cloak is revealed by plague');
 target.buffs.plague=0;arbiter.alive=false;assert.equal(b.canSee(0,target),true);
});

test('lane Protoss Cannon power follows its linked producer and commander Pylon',()=>{
 const b=emptyLaneBattle(),producer=b.create(162,0,400,1500);producer.productionOnly=true;producer.commanderId=0;producer.completed=true;
 const tower=b.create(162,0,400,900),enemy=b.create(0,1,450,900);tower.sourceProducer=producer.id;tower.target=enemy;tower.order='focus';b.canSee=()=>true;
 assert.equal(b.powered(tower),false);
 b.tickUnit(tower,.1);assert.equal(b.projectiles.length,0,'an unpowered linked Cannon does not fire');
 const foreign=b.create(156,0,400,1400);foreign.productionOnly=true;foreign.commanderId=1;foreign.completed=true;
 assert.equal(b.powered(tower),false,'a different commander Pylon does not power this producer');
 const pylon=b.create(156,0,400,1450);pylon.productionOnly=true;pylon.commanderId=0;pylon.completed=true;
 assert.equal(b.powered(tower),true);tower.cooldown=0;b.tickUnit(tower,.1);assert.ok(b.projectiles.length>0,'power restored through the linked producer resumes attacks');
 b.die(pylon);assert.equal(b.powered(tower),false);
});

