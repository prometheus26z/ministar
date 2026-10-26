import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {commandSlots,creepEdgeFrameIndex,creepNeighborMask,minimapTransform,minimapWorldPoint} from '../dist/console-panel.js';

const layout=JSON.parse(await readFile(new URL('../resources/original-ui/build-command-layout.json',import.meta.url),'utf8'));
const icons=JSON.parse(await readFile(new URL('../resources/original-ui/command-icon-map.json',import.meta.url),'utf8'));
const edgeMap=JSON.parse(await readFile(new URL('../resources/original-ui/creep-edge-map.json',import.meta.url),'utf8'));

test('race build pages keep nine fixed positions and filter unavailable building IDs',()=>{
 for(const race of ['terran','zerg','protoss'])for(const page of ['basic','advanced']){
  const ids=layout[race][page],filtered=commandSlots(layout,race,page,ids.filter((_,index)=>index%2===0));
  assert.equal(ids.length,9);assert.equal(filtered.length,9);
  assert.equal(ids[8],'cancel');
  for(let index=0;index<9;index++)assert.equal(filtered[index],ids[index]==='cancel'?'cancel':index%2===0?ids[index]:null);
 }
 assert.deepEqual(layout.terran.basic,[106,109,110,111,122,124,112,125,'cancel']);
 assert.deepEqual(layout.zerg.basic,[131,143,149,142,139,null,135,null,'cancel']);
 assert.deepEqual(layout.protoss.basic,[154,156,157,160,166,162,164,172,'cancel']);
 assert.deepEqual(commandSlots(layout,'terran','basic',[110]),[null,null,110,null,null,null,null,null,'cancel']);
 assert.throws(()=>commandSlots(layout,'terran','invalid',[]),/Invalid/);
});

test('original command art has a valid atlas coordinate for every build slot',()=>{
 const [width,height]=icons.atlasSize,[iw,ih]=icons.iconSize;
 for(const race of ['terran','zerg','protoss']){
  for(const page of ['basic','advanced'])for(const id of layout[race][page])if(Number.isInteger(id)){
   const pos=icons.buildings[id];assert.ok(pos,`${race} ${page} missing ${id}`);
   assert.ok(pos[0]>=0&&pos[0]+iw<=width&&pos[1]>=0&&pos[1]+ih<=height);
  }
  for(const page of ['basic','advanced'])assert.equal(icons.menu[race][page].length,2);
 }
 assert.deepEqual(icons.menu.cancel,[216,374]);
});

test('creep edges use the fixture neighbor order and leave creep interiors undecorated',()=>{
 const neighbors=edgeMap.neighborOrder;
 for(let index=0;index<8;index++){
  const tiles=new Set([`${8+neighbors[index][0]},${9+neighbors[index][1]}`]);
  const field={hasTile:(x,y)=>tiles.has(`${x},${y}`)};
  assert.equal(creepNeighborMask(field,8,9,neighbors),1<<index);
 }
 const field={hasTile:(x,y)=>x===8&&y===9};
 assert.equal(creepEdgeFrameIndex(field,8,9,edgeMap),null);
 assert.equal(creepEdgeFrameIndex(field,7,9,edgeMap),edgeMap.frames[1<<3]);
 assert.equal(edgeMap.frames.length,256);
});

test('square minimaps contain the world and reverse taps through centered letterboxing',()=>{
 const bounds={x:0,y:0,width:1280,height:2048},layout=minimapTransform(128,128,bounds,3);
 assert.equal(layout.drawnHeight,122);assert.ok(layout.offsetX>3);assert.equal(layout.offsetY,3);
 assert.equal(minimapWorldPoint(layout.offsetX-1,64,128,128,bounds,3),null);
 assert.deepEqual(minimapWorldPoint(layout.offsetX+layout.drawnWidth/2,64,128,128,bounds,3),{x:640,y:1024});
 const production={x:0,y:4096,width:1280,height:4096};
 assert.deepEqual(minimapWorldPoint(64,64,128,128,production,3),{x:640,y:6144});
 assert.throws(()=>minimapTransform(0,128,bounds),RangeError);
});
