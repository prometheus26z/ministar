import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Battle} from '../dist/core.js';
import {trackFor} from '../dist/animation.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));

test('Medic uses original healing track and animates a patient while healing',()=>{
 const battle=new Battle(data,{race:'terran'});battle.phase='battle';
 const medic=battle.create(34,0,200,200),patient=battle.create(0,0,220,200);patient.hp-=20;
 assert.ok(data.graphics[medic.def.image]?.tracks?.heal,'source heal track exists on the Medic image');
 assert.equal(trackFor(data.graphics[medic.def.image],'heal'),data.graphics[medic.def.image].tracks.heal);
 assert.equal(battle.medicHeal(medic,.1),true);assert.equal(medic.action,'heal');assert.ok(medic.healVisualTime>0);assert.equal(medic.healVisualTarget,patient.id);assert.equal(patient.healSpark.startedAt,battle.time);
 battle.medicHeal(medic,.1);assert.ok(medic.healVisualTime>.1,'the healing animation progresses continuously');
 battle.setGoal(medic,{x:500,y:200},'move');assert.equal(medic.action,'idle');assert.equal(medic.healVisualTarget,null);
});

test('healing visual stops when a Medic becomes disabled',()=>{
 const battle=new Battle(data,{race:'terran'});battle.phase='battle';
 const medic=battle.create(34,0,200,200),patient=battle.create(0,0,220,200);patient.hp-=20;
 battle.medicHeal(medic,.1);medic.buffs.stasis=1;battle.tickUnit(medic,.1);
 assert.notEqual(medic.action,'heal');assert.equal(medic.healVisualTarget,null);
});
