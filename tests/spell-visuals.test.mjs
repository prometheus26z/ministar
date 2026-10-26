import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Battle} from '../dist/core.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const root=new URL('../dist/',import.meta.url),data=read('../dist/assets/data.json'),extra=read('../dist/rts-data.json'),original=read('../dist/original-animation-data.json'),visuals=read('../dist/spell-visual-data.json');
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,original);

test('original spell sprite atlases and iscript timelines are complete and checksum pinned',()=>{
 const manifest=read('../resources/original-spell-source/manifest.json');
 assert.equal(visuals.sourceManifestSha256,createHash(fs.readFileSync(new URL('../resources/original-spell-source/manifest.json',import.meta.url))));
 assert.equal(manifest.files.length,35);
 const ids=new Set();for(const value of Object.values(visuals.images))for(const id of Array.isArray(value)?value:[value])ids.add(id);
 for(const id of ids){const graphic=original[id];assert.ok(graphic,`missing original image ${id}`);assert.ok(graphic.frames.length>0);assert.ok(graphic.tracks.idle);for(const path of Object.values(graphic.images))assert.ok(fs.existsSync(new URL(path,root)),path)}
 assert.equal(original[365].images.blue,original[366].images.blue);assert.equal(original[380].images.blue,original[381].images.blue);assert.equal(original[380].images.blue,original[382].images.blue);
});

test('all StarCraft unit overlay sizing flags map to original effect sprite sizes',()=>{
 const source=read('../resources/original-spell-source/units.dat.json');
 assert.equal(Object.keys(visuals.unitOverlaySizes).length,source.length);
 for(const unit of source){const flags=unit.special_ability_flags,expected=flags.use_large_overlays?2:flags.use_medium_overlays?1:0;assert.equal(visuals.unitOverlaySizes[unit._id],expected,`unit ${unit._id}`)}
});

test('casts create source sprites for Ensnare, Plague, matrix hits, Storm, Swarm, and Web',()=>{
 const battle=new Battle(data,{race:'terran'});battle.begin();const caster=battle.create(45,0,600,1500),enemy=battle.create(0,1,650,1500),ally=battle.create(0,0,700,1500);caster.energy=200;
 assert.equal(battle.cast(caster,'ensnare',{x:650,y:1500}),true);assert.equal(battle.effects.at(-1).image,383);assert.ok(enemy.buffs.ensnare>0);
 caster.energy=200;assert.equal(battle.cast(caster,'plague',{x:650,y:1500}),true);assert.equal(battle.effects.at(-1).image,387);assert.ok(enemy.buffs.plague>0);
 caster.energy=200;assert.equal(battle.cast(caster,'maelstrom',{x:650,y:1500}),true);assert.equal(battle.effects.at(-1).image,998);
 caster.energy=200;assert.equal(battle.cast(caster,'stasis',{x:650,y:1500}),true);assert.equal(battle.effects.at(-1).image,364);
 caster.energy=200;assert.equal(battle.cast(caster,'matrix',null,ally),true);assert.equal(battle.effects.at(-1).image,377);assert.ok(ally.matrix>0);
 caster.energy=200;assert.equal(battle.cast(caster,'storm',{x:650,y:1500}),true);assert.equal(battle.areas.at(-1).image,525);
 caster.energy=200;assert.equal(battle.cast(caster,'swarm',{x:650,y:1500}),true);assert.equal(battle.areas.at(-1).image,337);
 caster.energy=200;assert.equal(battle.cast(caster,'web',{x:650,y:1500}),true);assert.equal(battle.areas.at(-1).image,951);
});

function createHash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}
