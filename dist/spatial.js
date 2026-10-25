// Per-step broad phase. Exact distance, visibility and weapon rules stay with callers.
export class UnitGrid{
 constructor(units,cell=128){
  this.cell=cell;this.buckets=new Map();this.locations=new Map();this.order=new Map();this.byId=new Map();this.buildings=[];this.maxRadius=0;this.maxExtent=0;this.maxSight=64;
  for(const u of units)this.add(u);
 }
 key(u){return `${Math.floor(u.x/this.cell)},${Math.floor(u.y/this.cell)}`}
 add(u){
  if(!this.order.has(u))this.order.set(u,this.order.size);
  this.byId.set(u.id,u);if(u.def.building&&!this.buildings.includes(u))this.buildings.push(u);this.maxRadius=Math.max(this.maxRadius,u.r||0);
  this.maxExtent=Math.max(this.maxExtent,u.r||0,Math.hypot(...(u.def.footprint||(u.def.building?[64,64]:[0,0])))/2);
  this.maxSight=Math.max(this.maxSight,u.def.sight||0);this.update(u);
 }
 update(u){
  const old=this.locations.get(u),key=u.alive?this.key(u):null;if(old===key)return;
  if(old!==undefined){const bucket=this.buckets.get(old);bucket?.delete(u);if(!bucket?.size)this.buckets.delete(old);this.locations.delete(u)}
  if(key!==null){let bucket=this.buckets.get(key);if(!bucket)this.buckets.set(key,bucket=new Set());bucket.add(u);this.locations.set(u,key)}
 }
 query(point,radius,fallback=null){
  const found=[],size=this.cell;let candidates=0;
  for(let y=Math.floor((point.y-radius)/size);y<=Math.floor((point.y+radius)/size);y++)for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
   const bucket=this.buckets.get(`${x},${y}`);candidates+=bucket?.size||0;
   // In a packed melee, sorting most of the army costs more than scanning it.
   // Callers retain exact predicates, so the complete array is a safe superset.
   if(fallback&&candidates>fallback.length/3)return fallback;
   for(const u of bucket||[])if(Math.abs(u.x-point.x)<=radius&&Math.abs(u.y-point.y)<=radius)found.push(u);
  }
  // Preserve array order, including equal-score target and healing choices.
  return found.sort((a,b)=>this.order.get(a)-this.order.get(b));
 }
}
