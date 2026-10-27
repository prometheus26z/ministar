// Per-step broad phase. Exact distance, visibility and weapon rules stay with callers.
export class UnitGrid{
 constructor(units,cell=128){
  this.cell=cell;this.buckets=new Map();this.locations=new Map();this.order=new Map();this.byId=new Map();this.buildings=[];this.arbiters=new Set();this.detectors=new Set();this.maxRadius=0;this.maxMobileRadius=0;this.maxExtent=0;this.maxSight=64;
  for(const u of units)this.add(u);
 }
 key(u){return[Math.floor(u.x/this.cell),Math.floor(u.y/this.cell)]}
 bucket(x,y,create=false){let row=this.buckets.get(y);if(!row&&create)this.buckets.set(y,row=new Map());let bucket=row?.get(x);if(!bucket&&create)row.set(x,bucket=new Set());return bucket}
 add(u){
  if(!this.order.has(u))this.order.set(u,this.order.size);
  this.byId.set(u.id,u);if(u.def.building&&!this.buildings.includes(u))this.buildings.push(u);this.maxRadius=Math.max(this.maxRadius,u.r||0);
  if(!u.def.building)this.maxMobileRadius=Math.max(this.maxMobileRadius,u.r||0);
  this.refreshCapabilities(u);
  this.maxExtent=Math.max(this.maxExtent,u.r||0,Math.hypot(...(u.def.footprint||(u.def.building?[64,64]:[0,0])))/2);
  this.maxSight=Math.max(this.maxSight,u.def.sight||0);this.update(u);
 }
 refreshCapabilities(u){
  if(u.type===71||u.type===86)this.arbiters.add(u);else this.arbiters.delete(u);
  if(u.def.detector)this.detectors.add(u);else this.detectors.delete(u);
  if(u.def.building&&!this.buildings.includes(u))this.buildings.push(u);
  if(!u.def.building)this.maxMobileRadius=Math.max(this.maxMobileRadius,u.r||0);
 }
 update(u){
  // Morphs can change the type/definition without changing the grid cell.
  if((u.type===71||u.type===86)!==this.arbiters.has(u)||!!u.def.detector!==this.detectors.has(u))this.refreshCapabilities(u);
  if(u.def.building&&!this.buildings.includes(u))this.buildings.push(u);
  if(!u.def.building&&u.r>this.maxMobileRadius)this.maxMobileRadius=u.r;
  const old=this.locations.get(u),key=u.alive?this.key(u):null;if(old&&key&&old[0]===key[0]&&old[1]===key[1]||!old&&!key)return;
  if(old){const bucket=this.bucket(old[0],old[1]);bucket?.delete(u);const row=this.buckets.get(old[1]);if(!bucket?.size)row?.delete(old[0]);if(!row?.size)this.buckets.delete(old[1]);this.locations.delete(u)}
  if(key){this.bucket(key[0],key[1],true).add(u);this.locations.set(u,key)}
 }
 query(point,radius,fallback=null){
  const found=[],size=this.cell;let candidates=0;
  for(let y=Math.floor((point.y-radius)/size);y<=Math.floor((point.y+radius)/size);y++)for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
   const bucket=this.bucket(x,y);candidates+=bucket?.size||0;
   // In a packed melee, sorting most of the army costs more than scanning it.
   // Callers retain exact predicates, so the complete array is a safe superset.
   if(fallback&&candidates>fallback.length/3)return fallback;
   for(const u of bucket||[])if(Math.abs(u.x-point.x)<=radius&&Math.abs(u.y-point.y)<=radius)found.push(u);
  }
  // Preserve array order, including equal-score target and healing choices.
  return found.sort((a,b)=>this.order.get(a)-this.order.get(b));
 }
 // Collision broad phase only: callers that reduce results with a commutative
 // minimum do not need array ordering or the dense-query fallback scan.
 queryLocal(point,radius){
  const found=[],size=this.cell;
  for(let y=Math.floor((point.y-radius)/size);y<=Math.floor((point.y+radius)/size);y++)for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
   for(const u of this.bucket(x,y)||[])if(Math.abs(u.x-point.x)<=radius&&Math.abs(u.y-point.y)<=radius)found.push(u);
  }
  return found;
 }
 // The moving-unit broad phase must not expand by a large building footprint.
 // Buildings are swept separately against the entire movement segment.
 collisionCandidates(unit,from,to,allDirections=false){
  const length=Math.hypot(to.x-from.x,to.y-from.y),reach=length+(unit.r||0)+this.maxMobileRadius;
  const found=this.queryLocal(from,reach).filter(other=>!other.def.building);
  const minX=(allDirections?from.x-length:Math.min(from.x,to.x))-(unit.r||0),maxX=(allDirections?from.x+length:Math.max(from.x,to.x))+(unit.r||0);
  const minY=(allDirections?from.y-length:Math.min(from.y,to.y))-(unit.r||0),maxY=(allDirections?from.y+length:Math.max(from.y,to.y))+(unit.r||0);
  for(const b of this.buildings){
   if(!b.def.building)continue;
   const [w,h]=b.def.footprint||[64,64];
   if(b.x+w/2>=minX&&b.x-w/2<=maxX&&b.y+h/2>=minY&&b.y-h/2<=maxY)found.push(b);
  }
  return found;
 }
 queryAny(point,radius,predicate,fallback=null){
  const size=this.cell;let candidates=0;
  for(let y=Math.floor((point.y-radius)/size);y<=Math.floor((point.y+radius)/size);y++)for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
   const bucket=this.bucket(x,y);candidates+=bucket?.size||0;
   if(fallback&&candidates>fallback.length/3)return fallback.some(predicate);
   for(const u of bucket||[])if(Math.abs(u.x-point.x)<=radius&&Math.abs(u.y-point.y)<=radius&&predicate(u))return true;
  }
  return false;
 }
}
