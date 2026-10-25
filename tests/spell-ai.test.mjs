import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as LaneBattle} from '../dist/autobattle.js';
import {SPELL_RULES,ROBOTIC_UNIT_IDS,MIND_CONTROL_EXCLUDED,broodlingsTargetValid,mindTargetValid} from '../dist/spell-rules.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=()=>{const b=new LaneBattle(data,{race:'protoss',enemyRace:'terran'});b.begin();b.botStep=()=>{};b.units=[];return b};

test('lane auto-cast spends caster energy and drains energy from a valid Feedback target',()=>{
 const b=fresh(),caster=b.create(63,0,600,700),target=b.create(45,1,650,700);caster.energy=200;target.energy=150;
 b.autoCast(caster);
 assert.equal(target.energy,0);assert.equal(target.hp,0);assert.equal(target.alive,false);assert.equal(caster.energy,150);
});

test('Queen Broodlings can kill a Siege Tank, create two owned Broodlings and keep their expiry',()=>{
 const b=fresh(),queen=b.create(45,0,600,700),tank=b.create(5,1,650,700);queen.energy=200;
 assert.equal(b.cast(queen,'broodlings',null,tank),true);assert.equal(tank.alive,false);assert.equal(queen.energy,50);
 const brood=b.units.filter(u=>u.type===40&&u.alive);assert.equal(brood.length,2);assert.ok(brood.every(u=>u.team===0&&u.expiresAt===75));
});

test('Broodlings reject robotic, flying, building and non-mechanical non-organic targets',()=>{
 const b=fresh(),queen=b.create(45,0,600,700),probe=b.create(64,1,650,700),dragoon=b.create(66,1,650,700),scv=b.create(7,1,650,700),marine=b.create(0,1,650,700);
 assert.equal(broodlingsTargetValid(probe),false);assert.equal(broodlingsTargetValid(dragoon),true);assert.equal(broodlingsTargetValid(scv),true);assert.equal(broodlingsTargetValid(marine),true);
 queen.energy=200;assert.equal(b.cast(queen,'broodlings',null,probe),false);assert.equal(queen.energy,200);
});

test('Brood War robotic IDs and Mind Control exclusions match BWAPI and the original Dark Archon rules',()=>{
 assert.deepEqual([...ROBOTIC_UNIT_IDS],[64,69,81,83,84]);assert.deepEqual([...MIND_CONTROL_EXCLUDED],[13,35,73,85]);
 const b=fresh(),caster=b.create(63,0,600,700);for(const id of [69,83,84])assert.equal(mindTargetValid(caster,b.create(id,1,650,700)),true,`controllable type ${id}`);
 for(const id of [13,35,73,85])assert.equal(mindTargetValid(caster,b.create(id,1,650,700)),false,`uncontrollable type ${id}`);
});

test('Mind Control can capture a Reaver and its Shuttle passengers while draining the caster shields',()=>{
 const b=fresh(),archon=b.create(63,0,600,700),shuttle=b.create(69,1,650,700),reaver=b.create(83,1,660,700);archon.energy=200;archon.shield=200;shuttle.energy=37;shuttle.passengers=[reaver.id];reaver.loaded=shuttle.id;b.researched.add('mind');
 assert.equal(b.cast(archon,'mind',null,shuttle),true);assert.equal(shuttle.team,0);assert.equal(reaver.team,0);assert.equal(shuttle.energy,37);assert.equal(archon.shield,0);
});

test('Maelstrom applies once to organic units in its original square radius and expires',()=>{
 const b=fresh(),archon=b.create(63,0,600,700),enemy=b.create(0,1,660,700),ally=b.create(65,0,620,700),mech=b.create(3,1,610,740);archon.energy=200;
 assert.equal(b.cast(archon,'maelstrom',{x:620,y:700}),true);assert.ok(enemy.buffs.maelstrom>7);assert.ok(ally.buffs.maelstrom>7);assert.equal(mech.buffs.maelstrom,undefined);
 b.tickUnit(enemy,8);assert.equal(enemy.buffs.maelstrom,0);
});

test('Dark Archon auto-casts Maelstrom on a nearby organic group and spends 100 energy',()=>{
 const b=fresh(),archon=b.create(63,0,600,700);archon.energy=200;b.researched.add('maelstrom');for(let i=0;i<6;i++)b.create(37,1,650+i%3*8,700+Math.floor(i/3)*8);
 b.autoCast(archon);assert.equal(archon.energy,100);assert.ok(b.units.filter(u=>u.team===1&&u.type===37).every(u=>u.buffs.maelstrom>7));
});

test('Ensnare is an instant persistent debuff, slows movement and reveals cloak but not burrow',()=>{
 const b=fresh(),queen=b.create(45,0,600,700),enemy=b.create(0,1,650,700);queen.energy=200;enemy.cloaked=true;
 assert.equal(b.cast(queen,'ensnare',{x:650,y:700}),true);assert.ok(enemy.buffs.ensnare>24);assert.equal(b.canSee(0,enemy),true);
 enemy.burrowed=true;enemy.buffs.ensnare=0;assert.equal(b.canSee(0,enemy),false);
});

test('Queen auto-casts Ensnare over a packed group when Broodlings are unaffordable',()=>{
 const b=fresh(),queen=b.create(45,0,600,700);queen.energy=100;b.researched.add('ensnare');for(const [x,y]of [[650,700],[660,700],[655,715]])b.create(0,1,x,y);
 b.autoCast(queen);assert.equal(queen.energy,25);assert.ok(b.units.filter(u=>u.team===1&&u.type===0).every(u=>u.buffs.ensnare>24));
});

test('Queen auto-casts Broodlings on a high-value legal ground target',()=>{
 const b=fresh(),queen=b.create(45,0,600,700),tank=b.create(5,1,650,700);queen.energy=200;b.researched.add('broodlings');
 b.autoCast(queen);assert.equal(queen.energy,50);assert.equal(tank.alive,false);assert.equal(b.units.filter(u=>u.type===40&&u.alive).length,2);
});

test('Science Vessel Matrix absorbs damage and expires after 56 seconds',()=>{
 const b=fresh(),vessel=b.create(9,0,600,700),marine=b.create(0,0,650,700);vessel.energy=200;
 assert.equal(b.cast(vessel,'matrix',null,marine),true);assert.equal(marine.matrix,250);const hp=marine.hp;b.hurt(marine,100,1,3,true);assert.equal(marine.hp,hp);assert.equal(marine.matrix,150);
 b.tickUnit(marine,SPELL_RULES.matrix.duration);assert.equal(marine.matrix,0);assert.equal(marine.buffs.matrix,0);
});

test('Science Vessel auto-casts Matrix on a nearby damaged ally in combat',()=>{
 const b=fresh(),vessel=b.create(9,0,600,700),ally=b.create(5,0,650,700),enemy=b.create(0,1,680,700);vessel.energy=200;b.researched.add('matrix');ally.hp=ally.maxHp*.5;ally.target=enemy;
 b.autoCast(vessel);assert.equal(vessel.energy,100);assert.equal(ally.matrix,250);
});

test('EMP drains units and buildings in its square blast but excludes the Science Vessel itself',()=>{
 const b=fresh(),vessel=b.create(9,0,600,700),archon=b.create(63,0,650,700),pylon=b.create(156,1,630,740);vessel.energy=200;archon.energy=150;archon.shield=200;pylon.energy=100;pylon.shield=200;
 assert.equal(b.cast(vessel,'emp',{x:640,y:700}),true);assert.equal(vessel.energy,100);assert.equal(archon.energy,0);assert.equal(archon.shield,0);assert.equal(pylon.energy,0);assert.equal(pylon.shield,0);
});

test('Science Vessel auto-casts EMP when it can drain meaningful enemy shields',()=>{
 const b=fresh(),vessel=b.create(9,0,600,700),archon=b.create(63,1,650,700);vessel.energy=200;archon.energy=150;archon.shield=200;b.researched.add('emp');
 b.autoCast(vessel);assert.equal(vessel.energy,100);assert.equal(archon.energy,0);assert.equal(archon.shield,0);
});

test('Irradiate deals at most 250 damage over its duration and never damages mechanical units',()=>{
 const b=fresh(),vessel=b.create(9,0,600,700),organic=b.create(0,1,650,700),mech=b.create(3,1,660,700);vessel.energy=200;
 assert.equal(b.cast(vessel,'irradiate',null,organic),true);assert.equal(vessel.energy,125);b.tickUnit(organic,25);assert.equal(organic.hp,0);assert.equal(mech.hp,mech.maxHp);
});

test('Science Vessel auto-casts Irradiate on an organic enemy and spends 75 energy',()=>{
 const b=fresh(),vessel=b.create(9,0,600,700),mutalisk=b.create(43,1,650,700);vessel.energy=200;b.researched.add('irradiate');
 b.autoCast(vessel);assert.equal(vessel.energy,125);assert.ok(mutalisk.buffs.irradiate>24);
});

test('Defiler consumes an owned Zergling to restore spell energy',()=>{
 const b=fresh(),defiler=b.create(46,0,600,700),ling=b.create(37,0,610,700);defiler.energy=100;b.researched.add('consume');
 b.autoCast(defiler);assert.equal(ling.alive,false);assert.equal(defiler.energy,150);
});

test('automatic casting preserves energy and does not repeat a spell while cooldown is reserved',()=>{
 const b=fresh(),archon=b.create(63,0,600,700),queen=b.create(45,1,650,700);archon.energy=200;queen.energy=100;
 b.autoCast(archon);assert.equal(archon.energy,150);assert.equal(queen.energy,0);const remaining=archon.energy;b.time=.2;b.autoCast(archon);assert.equal(archon.energy,remaining);
});

test('lane debuffs reveal cloak without revealing burrowed units',()=>{
 const b=fresh(),enemy=b.create(61,1,650,700);
 for(const key of ['ensnare','maelstrom','plague']){
  enemy.buffs={[key]:5};enemy.burrowed=false;assert.equal(b.canSee(0,enemy),true,key);
  enemy.burrowed=true;assert.equal(b.canSee(0,enemy),false,key);
 }
});

test('hallucinated casters cannot spend energy or apply real spell effects',()=>{
 const b=fresh(),caster=b.create(63,0,600,700),target=b.create(45,1,650,700);
 caster.hallucination=true;caster.energy=200;target.energy=150;
 b.autoCast(caster);assert.equal(target.energy,150);assert.equal(caster.energy,200);
});

test('a stationary target receives exactly eight Storm pulses across its full lifetime',()=>{
 const b=fresh(),caster=b.create(67,0,400,700),target=b.create(0,1,600,700);
 target.hp=target.maxHp=1000;target.order='hold';caster.energy=75;
 b.researched.add('storm');assert.equal(b.cast(caster,'storm',{x:600,y:700}),true);
 for(let i=0;i<75;i++)b.step(1/30);
 assert.equal(target.hp,888);assert.equal(b.areas.length,0);
});
