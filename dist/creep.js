import {footprintTiles} from './build-placement.js?v=0.16.24';

export const CREEP_FRAME_SECONDS=.042;
export const CREEP_GROWTH_DELAY_FRAMES=15;
export const CREEP_LIFE_CAPACITY=1024;
export const CREEP_RECEDE_DELAYS=Object.freeze([1,3,5,6,7,8,9,9,9]);
const keyOf=(x,y)=>`${x},${y}`;
const parseKey=key=>key.split(',').map(Number);

function creepRangeContains(source,x,y){
 const dx=x*32+16-source.x,dy=y*32+16-source.y;
 return 25*dx*dx+64*dy*dy<=25*320*320;
}

// A field belongs to exactly one production board/commander. It advances on
// StarCraft's 42 ms fastest-game frame, independent of browser render cadence.
export class CreepField{
 constructor({commanderId,team,width,height,originX=0,originY=0,mirrorX=false,isEligible,seed=0x51f15e}){
  this.commanderId=commanderId;this.team=team;this.width=width;this.height=height;this.mapOriginX=originX;this.originX=mirrorX?1280-originX-width*32:originX;this.originY=originY;this.mirrorX=mirrorX;this.isEligibleTile=isEligible;
  this.minTileX=Math.floor(originX/32);this.minTileY=Math.floor(originY/32);this.tiles=new Set();this.sources=new Map();this.receding=new Set();this.sustain=new Set();this.dirty=new Set();this.version=0;this.accumulator=0;this.recedeTimer=0;this.randomState=(seed^Math.imul(commanderId+1,0x9e3779b1))>>>0;
 }
 sourceTile(x,y){
  const centerX=x*32+16,centerY=y*32+16,sourceX=this.mirrorX?1280-centerX:centerX;
  return{x:Math.floor((sourceX-this.mapOriginX)/32),y:Math.floor((centerY-this.originY)/32)};
 }
 inBounds(x,y){const tile=this.sourceTile(x,y);return tile.x>=0&&tile.y>=0&&tile.x<this.width&&tile.y<this.height}
 eligible(x,y){const tile=this.sourceTile(x,y);return tile.x>=0&&tile.y>=0&&tile.x<this.width&&tile.y<this.height&&!!this.isEligibleTile(tile.x,tile.y)}
 hasTile(x,y){return this.tiles.has(keyOf(x,y))}
 markDirty(x,y){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)this.dirty.add(keyOf(x+dx,y+dy));this.version++}
 addTile(x,y){const key=keyOf(x,y);if(this.tiles.has(key))return false;this.tiles.add(key);this.receding.delete(key);this.markDirty(x,y);return true}
 removeTile(x,y){const key=keyOf(x,y);if(!this.tiles.delete(key))return false;this.receding.delete(key);this.markDirty(x,y);return true}
 randomInt(length){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return length?this.randomState%length:0}
 addSource(unit,{full=false,occupied=()=>false}={}){
  const old=this.sources.get(unit.id);if(old){old.unit=unit;return false}
  this.sources.set(unit.id,{unit,growthTimer:CREEP_GROWTH_DELAY_FRAMES});
  const candidates=[];
  if(full){
   for(let y=this.minTileY;y<this.minTileY+this.height;y++)for(let x=this.minTileX;x<this.minTileX+this.width;x++)if(creepRangeContains(unit,x,y))candidates.push({x,y});
  }else{
   const [w,h]=unit.def.footprint||[64,64],tiles=footprintTiles(unit,[w,h]);
   const left=Math.min(...tiles.map(p=>p.x)),top=Math.min(...tiles.map(p=>p.y)),right=Math.max(...tiles.map(p=>p.x)),bottom=Math.max(...tiles.map(p=>p.y));
   const hatchery=[131,132,133].includes(unit.type),padX=hatchery?2:0,padY=hatchery?1:0;
   for(let y=top-padY;y<=bottom+padY;y++)for(let x=left-padX;x<=right+padX;x++){
    if(hatchery&&padX&&padY&&(y===top-padY||y===bottom+padY)&&(x===left-padX||x===right+padX))continue;
    candidates.push({x,y});
   }
  }
  for(const tile of candidates)if(this.eligible(tile.x,tile.y)&&!occupied(tile.x,tile.y,unit.id))this.addTile(tile.x,tile.y);
  return true;
 }
 removeSource(unit){return this.sources.delete(typeof unit==='object'?unit.id:unit)}
 syncBuildings(buildings){
  this.sustain.clear();
  const occupied=new Map();
  for(const unit of buildings){
   if(!unit.alive||!unit.def?.building)continue;
   for(const tile of footprintTiles(unit,unit.def.footprint||[64,64])){
    const key=keyOf(tile.x,tile.y);let ids=occupied.get(key);if(!ids)occupied.set(key,ids=[]);ids.push(unit.id);
    if(unit.def.race==='zerg')this.sustain.add(key);
   }
  }
  return occupied;
 }
 supported(x,y){for(const {unit}of this.sources.values())if(unit.alive&&creepRangeContains(unit,x,y))return true;return false}
 maximumCovers(point,size){return footprintTiles(point,size).every(tile=>this.eligible(tile.x,tile.y)&&this.supported(tile.x,tile.y))}
 coversFootprint(point,size){return footprintTiles(point,size).every(tile=>this.hasTile(tile.x,tile.y))}
 neighborCount(x,y){let count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&this.hasTile(x+dx,y+dy))count++;return count}
 spread(source,occupied){
  const groups=Array.from({length:9},()=>[]);
  for(let y=this.minTileY;y<this.minTileY+this.height;y++)for(let x=this.minTileX;x<this.minTileX+this.width;x++){
   const key=keyOf(x,y);if(this.tiles.has(key)||!this.eligible(x,y)||!creepRangeContains(source,x,y))continue;
   if((occupied.get(key)||[]).some(id=>id!==source.id))continue;
   const neighbors=this.neighborCount(x,y);if(neighbors)groups[neighbors].push({x,y});
  }
  for(let i=8;i>0;i--)if(groups[i].length){const tile=groups[i][this.randomInt(groups[i].length)];this.addTile(tile.x,tile.y);return true}
  return false;
 }
 recede(occupied){
  for(const key of [...this.receding]){const [x,y]=parseKey(key);if(this.supported(x,y)||this.sustain.has(key)){this.receding.delete(key);continue}if(this.receding.size>CREEP_LIFE_CAPACITY)this.receding.delete(key)}
  for(const key of this.tiles){const [x,y]=parseKey(key);if(!this.supported(x,y)&&!this.sustain.has(key)&&this.receding.size<CREEP_LIFE_CAPACITY)this.receding.add(key)}
  if(!this.receding.size)return;
  if(this.recedeTimer>0){this.recedeTimer--;return}
  const freeListSize=CREEP_LIFE_CAPACITY-this.receding.size,index=Math.min(8,Math.max(0,freeListSize>>7)),delay=CREEP_RECEDE_DELAYS[index],groups=Array.from({length:9},()=>[]);
  for(const key of this.receding){const [x,y]=parseKey(key);if(!this.tiles.has(key)||this.supported(x,y)||this.sustain.has(key))continue;groups[this.neighborCount(x,y)].push({x,y})}
  for(let i=0;i<9;i++)if(groups[i].length){const tile=groups[i][this.randomInt(groups[i].length)];this.removeTile(tile.x,tile.y);this.recedeTimer=delay;return}
  this.recedeTimer=delay;
 }
 tickFrame(buildings){
  const occupied=this.syncBuildings(buildings);
  for(const key of [...this.receding]){const [x,y]=parseKey(key);if(this.supported(x,y)||this.sustain.has(key))this.receding.delete(key)}
  for(const [id,source]of [...this.sources]){
   if(!source.unit.alive){this.sources.delete(id);continue}
   if(source.growthTimer>0){source.growthTimer--;continue}
   source.growthTimer=CREEP_GROWTH_DELAY_FRAMES;this.spread(source.unit,occupied);
  }
  this.recede(occupied);
 }
 advance(dt,buildings){
  if(!Number.isFinite(dt)||dt<=0)return 0;this.accumulator+=dt;let frames=0;
  while(this.accumulator+1e-9>=CREEP_FRAME_SECONDS){this.accumulator-=CREEP_FRAME_SECONDS;this.tickFrame(buildings);frames++}
  return frames;
 }
 takeDirty(){const result=[];for(const key of this.dirty){const [x,y]=parseKey(key);result.push({x,y,present:this.hasTile(x,y),neighbors:this.neighborCount(x,y)})}this.dirty.clear();return result}
}

export function creepTileRangeContains(source,tileX,tileY){return creepRangeContains(source,tileX,tileY)}
