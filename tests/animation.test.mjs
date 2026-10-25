import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layeredActionSeconds,pose,teamImage,transitionSeconds} from '../dist/animation.js';

test('animation aliases keep moving, attacking, and dying sprites on their original tracks',()=>{
 const graphic={turns:true,frames:Array.from({length:64},(_,i)=>[i,0,0,0,32,32]),images:{blue:'blue.webp'},tracks:{
  move:{loop:true,ticks:8,frames:[[0,4],[1,4]]},
  attack:{loop:true,ticks:8,frames:[[2,4],[3,4]]},
  dead:{loop:false,ticks:8,frames:[[4,4],[5,4]]}
 }};
 assert.deepEqual(pose(graphic,'walk',.2,5),{frame:6,flip:false},'walk uses the original move track and facing');
 assert.deepEqual(pose(graphic,'airAttack',0,31),{frame:3,flip:true},'air attack falls back to attack');
 assert.deepEqual(pose(graphic,'death',.2,0),{frame:5,flip:false},'death falls back to dead');
 assert.equal(teamImage(graphic,1),'blue.webp','missing team palette falls back to the available sprite');
});

test('Archon and Dark Archon graphics retain complete directional action tracks',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
 const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
 Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
 for(const type of [63,68]){
  const unit=data.units[type],graphic=data.graphics[unit?.image];
  assert.ok(unit&&graphic,'unit '+type+' has a source graphic');
  assert.ok(graphic.frames?.length,unit.name+' has frames');
  assert.ok(teamImage(graphic,0)||teamImage(graphic,1),unit.name+' has a renderable palette');
  for(const action of ['idle','walk','attack','death']){
   const frame=pose(graphic,action,.25,16).frame;
   assert.ok(Number.isInteger(frame)&&frame>=0&&frame<graphic.frames.length,unit.name+' '+action+' frame is in range');
  }
  assert.ok(Object.values(graphic.tracks||{}).some(track=>track?.frames?.length),unit.name+' has source animation tracks');
  assert.equal(graphic.turns,false,unit.name+' uses the source animation without fabricated facing frames');
 }
 assert.equal(layeredActionSeconds(data.graphics,134,'death'),20/24,'Archon remains visible for its 20-tick death overlay');
 assert.equal(layeredActionSeconds(data.graphics,925,'death'),3/24,'missing source overlays must not acquire invented durations');
});

test('Lurker burrow transitions use the playable frames and omit the trailing hold',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),g=data.graphics[921];
 assert.equal(transitionSeconds(g,'burrow'),20/24);
 assert.equal(transitionSeconds(g,'unburrow'),7/24);
});

test('entrypoint and legacy migration use the package cache version',()=>{
 const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version;
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),worker=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');
 assert.ok(fs.readFileSync(new URL('../dist/economy.js',import.meta.url),'utf8').includes('core.js?v='+version));
 assert.ok(html.includes('app.js?v='+version+'-lane'));assert.ok(html.includes('v'+version+'</small>'));assert.ok(worker.includes("set('v','"+version+"')"));
});
