import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle as CombatBattle} from '../dist/core.js';
import {Battle as LaneBattle} from '../dist/autobattle.js';
import {DEFAULT_FIELD_ZOOM,DEFAULT_FRONT_ZOOM,defaultProductionZoom} from '../dist/camera.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));
function combat(){const b=new CombatBattle(data,{race:'terran'});b.phase='battle';b.core={alive:true};b.map.heightAt=()=>0;return b}
function lane(){const b=new LaneBattle(data,{race:'zerg',enemyRace:'terran',difficulty:'easy'});b.begin();b.units=[];b.map.rocks=[];b.botStep=()=>{};b.waveClock=99999;return b}
function lurkerAtEdge(b,edge,state='ground'){
 const lurker=b.create(103,0,400,800),enemy=b.create(0,1,600,800);lurker.laneArmy=true;lurker.lurkerState=state;lurker.burrowed=state==='burrowed';
 enemy.x=lurker.x+lurker.r+enemy.r+edge;enemy.order='move';return{lurker,enemy};
}

test('fast Dragoon projectile remains visible through its first rendered frame without delaying damage',()=>{
 const b=combat(),attacker=b.create(66,0,500,700),target=b.create(0,1,620,700);target.order='move';const weapon=b.weapon(attacker,target),hp=target.hp;b.attack(attacker,target,weapon);
 assert.equal(b.projectiles.length,1);assert.equal(b.projectileVisuals.length,1);assert.equal(b.projectiles[0].visualId,b.projectileVisuals[0].shotId);assert.equal(target.hp,hp);
 for(let i=0;i<3;i++)b.simulateStep(1/30);
 assert.equal(b.projectiles.length,0,'the simulation projectile is removed at its normal arrival time');
 const damage=weapon.damage*(target.def.size===1?.5:target.def.size===2?.75:1);assert.equal(target.hp,hp-damage,'damage is applied once at impact with the original size multiplier');
 assert.equal(b.projectileVisuals.length,1,'the visual record survives until a renderer consumes it');
 b.markProjectileVisualsRendered();b.simulateStep(1/30);assert.equal(b.projectileVisuals.length,1,'arrival trail remains visible for a short fade');
 b.simulateStep(1/30);assert.equal(b.projectileVisuals.length,0,'the completed trail is cleaned up');
});

test('Yamato spell shots use the same visual lifecycle and retain their normal impact',()=>{
 const b=combat(),attacker=b.create(12,0,500,700),target=b.create(0,1,620,700);target.order='move';attacker.order='move';attacker.energy=200;const hp=target.hp;
 assert.equal(b.cast(attacker,'yamato',null,target),true);assert.equal(target.hp,hp);assert.equal(b.projectiles.length,1);assert.equal(b.projectiles[0].visualId,b.projectileVisuals[0].shotId);
 assert.equal(b.projectileVisuals[0].image,536);assert.equal(b.projectileVisuals[0].weaponId,null);b.update(.3);assert.equal(b.projectiles.length,0);assert.equal(target.hp,0);assert.equal(b.projectileVisuals.length,1);
});

test('a long render interval cannot discard a short projectile before its first draw',()=>{
 const b=combat(),attacker=b.create(66,0,500,700),target=b.create(0,1,620,700);target.order='move';b.attack(attacker,target,b.weapon(attacker,target));
 b.update(.15);assert.equal(b.projectiles.length,0);assert.equal(b.projectileVisuals.length,1);assert.equal(b.projectileVisuals[0].firstRendered,false);
});

test('long flights outlive the minimum visual lifetime and still resolve damage once',()=>{
 const b=combat(),attacker=b.create(66,0,400,700),target=b.create(0,1,800,700);target.order='move';const weapon=b.weapon(attacker,target),hp=target.hp;b.attack(attacker,target,weapon);
 const visual=b.projectileVisuals[0],sizeFactor=weapon.type===1?[1,.5,.75,1][target.def.size]||1:weapon.type===2?[1,1,.5,.25][target.def.size]||1:1,expectedDamage=Math.max(.5,weapon.damage*(weapon.factor||1)*sizeFactor-target.def.armor);assert.equal(visual.weaponId,weapon.id);assert.equal(visual.sourceId,attacker.id);assert.equal(visual.targetId,target.id);
 b.markProjectileVisualsRendered();b.update(.15);assert.equal(b.projectiles.length,1);assert.equal(b.projectileVisuals.length,1);assert.equal(target.hp,hp);
 b.update(.15);assert.equal(b.projectiles.length,0);assert.equal(target.hp,hp-expectedDamage);assert.equal(b.projectileVisuals.length,1,'arrival leaves the specified visual fade');
 b.update(.08);assert.equal(b.projectileVisuals.length,0);assert.equal(target.hp,hp-expectedDamage,'visual cleanup cannot deal damage again');
});

test('Hydralisk sting adds only a visual trail and contact flash over the original immediate hit',()=>{
 const b=combat(),attacker=b.create(38,0,500,700),target=b.create(0,1,620,700);target.order='move';const weapon=b.weapon(attacker,target),hp=target.hp;b.attack(attacker,target,weapon);
 assert.equal(b.projectiles.length,0);assert.ok(target.hp<hp,'the original hitscan damage is immediate');
 assert.deepEqual(b.projectileVisuals.map(v=>v.kind),['hitscan','contact']);
 assert.equal(b.projectileVisuals[0].duration,.1);assert.equal(b.projectileVisuals[1].image,504);
 const afterAttack=target.hp;b.update(.15);assert.equal(target.hp,afterAttack,'visual expiry never applies another hit');
});

test('Hydralisk keeps the resolved miss point and original immediate hit timing',()=>{
 const b=combat(),attacker=b.create(38,0,500,700),target=b.create(0,1,620,700);target.order='move';const weapon=b.weapon(attacker,target),hp=target.hp;b.uphillMiss=()=>true;b.missPoint=()=>({x:560,y:715});
 b.attack(attacker,target,weapon);assert.equal(target.hp,hp);assert.equal(b.projectileVisuals[0].missed,true);assert.deepEqual([b.projectileVisuals[0].endX,b.projectileVisuals[0].endY],[560,715]);
});

test('visual-only effects are bounded to 512 records',()=>{
 const b=combat();for(let i=0;i<600;i++)b.addInstantVisual({kind:'hitscan',startX:0,startY:0,endX:i,endY:0});
 assert.equal(b.projectileVisuals.length,512);
});

test('Lurker approaches inside weapon range before burrowing at 176 pixels',()=>{
 const b=lane(),{lurker}=lurkerAtEdge(b,180),start=lurker.x;
 assert.equal(b.edgeDistance(lurker,b.units[1]),180);assert.equal(b.updateLaneLurker(lurker,1/30),true);
 assert.equal(lurker.lurkerState,'ground');assert.ok(lurker.x>start,'the Lurker advances toward the target');
});

test('Lurker burrow entry includes the 176-pixel boundary while maintenance keeps full range',()=>{
 for(const edge of [176,175.99,175.9999995,176.0000005]){const b=lane(),{lurker}=lurkerAtEdge(b,edge);assert.equal(b.updateLaneLurker(lurker,1/30),true);assert.equal(lurker.lurkerState,'burrowing')}
 for(const edge of [176.01,192]){const b=lane(),{lurker}=lurkerAtEdge(b,edge);assert.equal(b.updateLaneLurker(lurker,1/30),true);assert.equal(lurker.lurkerState,'ground')}
 const b=lane(),{lurker,enemy}=lurkerAtEdge(b,192,'burrowed');assert.equal(b.updateLaneLurker(lurker,1/30),false);assert.equal(lurker.lurkerState,'burrowed');assert.ok(b.weapon(lurker,enemy));
 const outside=lane(),out= lurkerAtEdge(outside,192.01,'burrowed');assert.equal(outside.updateLaneLurker(out.lurker,1/30),true);assert.equal(out.lurker.lurkerState,'unburrowing');
});

test('Lurker range uses unit radii and building footprints at the edge',()=>{
 for(const edge of [176,176.01]){
  const b=lane(),{lurker,enemy}=lurkerAtEdge(b,edge);enemy.r=30;enemy.x=lurker.x+enemy.r+lurker.r+edge;
  assert.ok(Math.abs(b.edgeDistance(lurker,enemy)-edge)<1e-8);b.updateLaneLurker(lurker,1/30);assert.equal(lurker.lurkerState,edge===176?'burrowing':'ground');
 }
 const b=lane(),{lurker,enemy}=lurkerAtEdge(b,1);enemy.def={...enemy.def,building:true,footprint:[256,160]};enemy.r=0;enemy.x=lurker.x+128+lurker.r+176;
 assert.ok(Math.abs(b.edgeDistance(lurker,enemy)-176)<1e-8);b.updateLaneLurker(lurker,1/30);assert.equal(lurker.lurkerState,'burrowing');
});

test('only visible, loaded-state-valid ground enemies can trigger Lurker burrowing',()=>{
 for(const mutate of [t=>{t.def={...t.def,air:true}},t=>{t.team=0},t=>{t.loaded=999},t=>{t.productionOnly=true},t=>{t.hidden=true},t=>{t.buffs.stasis=1},t=>{t.cloaked=true}]){
  const b=lane(),{lurker,enemy}=lurkerAtEdge(b,100);mutate(enemy);assert.equal(b.lurkerThreatInRange(lurker),false);
 }
});

test('a blocked Lurker retries its approach before burrowing inside actual weapon range',()=>{
 const b=lane(),{lurker}=lurkerAtEdge(b,180);let attempts=0;b.approachPath=()=>{attempts++;return null};
 for(let i=0;i<4;i++){assert.equal(b.updateLaneLurker(lurker,.1),true);assert.equal(lurker.lurkerState,'ground')}
 assert.equal(attempts,1);assert.equal(b.updateLaneLurker(lurker,.1),true);assert.equal(attempts,2);assert.equal(lurker.lurkerState,'burrowing');
 const tooFar=lane(),{lurker:blocked}=lurkerAtEdge(tooFar,192.01);let farAttempts=0;tooFar.approachPath=()=>{farAttempts++;return null};
 assert.equal(tooFar.updateLaneLurker(blocked,.1),false);assert.equal(blocked.lurkerState,'ground');assert.equal(farAttempts,0,'an out-of-range target cannot be hit through a blockage');
});

test('default camera zoom is doubled on field, front and production views',()=>{
 assert.equal(DEFAULT_FIELD_ZOOM,1.2);assert.equal(DEFAULT_FRONT_ZOOM,1);
 assert.equal(defaultProductionZoom(320),.5);assert.equal(defaultProductionZoom(768),1.2);assert.equal(defaultProductionZoom(1200),1.24);
});
