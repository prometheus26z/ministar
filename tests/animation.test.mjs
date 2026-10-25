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
 Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);Object.assign(data.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));
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
 assert.equal(layeredActionSeconds(data.graphics,925,'death'),15/24,'Dark Archon uses the recovered original 15-tick death effect');
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

test('original source frames fit their real texture atlas and remain complete',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))),sizes=new Map();
 function size(url){
  if(sizes.has(url))return sizes.get(url);const b=fs.readFileSync(new URL('../dist/'+url,import.meta.url));let result;
  for(let p=12;p+8<=b.length;){const tag=b.toString('ascii',p,p+4),n=b.readUInt32LE(p+4),o=p+8;
   if(tag==='VP8X')result=[b.readUIntLE(o+4,3)+1,b.readUIntLE(o+7,3)+1];
   if(tag==='VP8 ')result=[b.readUInt16LE(o+6)&16383,b.readUInt16LE(o+8)&16383];
   if(tag==='VP8L'){const v=b.readUInt32LE(o+1);result=[(v&16383)+1,((v>>>14)&16383)+1]}
   if(result)break;p=o+n+(n%2);
  }
  assert.ok(result,'WebP dimensions '+url);sizes.set(url,result);return result;
 }
 for(const [id,g]of Object.entries(source)){
  if(g.sourceFrameCount)assert.equal(g.frames.length,g.sourceFrameCount,'all original frames '+id);
  for(const url of Object.values(g.images)){const [w,h]=size(url);for(const [x,y,ox,oy,fw,fh]of g.frames)assert.ok(x>=0&&y>=0&&x+fw<=w&&y+fh<=h,'frame crop fits source texture '+id)}
 }
 assert.equal(source[135].frames.length,238);assert.equal(source[926].frames.length,187);
 for(const id of [134,925])for(let t=1;t<10;t+=.13)assert.ok(pose(source[id],'idle',t,0).frame<10,'merge intro never repeats');
 assert.equal(pose(source[134],'death',.2,0).hidden,true,'base image ends before its spawned effect');
 assert.equal(pose(source[928],'idle',15/24,0).hidden,true,'original Dark Archon death effect ends after 15 ticks');
});
