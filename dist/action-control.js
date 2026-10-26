import {COMBAT_SOURCE,movementProfile,scriptProgramForImage} from './combat-rules.js?v=0.16.18';

const EPS=1e-9;
const signedDelta=(from,to)=>((to-from+384)%256)-128;
const angle256=(dx,dy)=>((Math.round(Math.atan2(dx,-dy)*128/Math.PI)+256)%256);
const direction32=value=>((Math.round(value/8)%32)+32)%32;
const rotate=(from,to,amount)=>{const delta=signedDelta(from,to);return (from+Math.sign(delta)*Math.min(Math.abs(delta),Math.max(0,amount))+256)%256};

// Apply collision to the actual source-controlled movement segment, including
// turning and braking. Only the moving unit may change position.
function collisionStep(battle,unit,x,y){
 if(unit.def.air)return{x,y,blocked:false};
 const distance=Math.hypot(x-unit.x,y-unit.y);
 if(distance<EPS)return{x:unit.x,y:unit.y,blocked:true};
 if(typeof battle.movementLimit==='function'){
  const allowed=battle.movementLimit(unit,unit,{x,y}),ratio=Math.min(1,allowed/distance);
  return{x:unit.x+(x-unit.x)*ratio,y:unit.y+(y-unit.y)*ratio,blocked:ratio<1-EPS};
 }
 return battle.map.blocked(x,y,unit.r*.55)?{x:unit.x,y:unit.y,blocked:true}:{x,y,blocked:false};
}

export function ensureMotion(unit){
 return unit.motion||=(()=>{const heading=(unit.direction||0)*8;return{speedRaw:0,heading256:heading,velocityDirection256:heading,desiredDirection256:heading,walkTick:0,walkSpeedRaw:0,walkStarted:false,walkImage:null}})();
}

export function clearMovementControl(unit,{stop=true}={}){
 const motion=ensureMotion(unit);motion.walkTick=0;motion.walkSpeedRaw=0;motion.walkStarted=false;motion.walkImage=null;
 if(stop)motion.speedRaw=0;
}

export function brakeUnitMovement(battle,unit,dt){
 const motion=ensureMotion(unit),profile=movementProfile(battle,unit),frames=Math.max(0,dt*24);
 if(profile.movementControl===2){clearMovementControl(unit);return false}
 if(profile.movementControl!==0&&profile.movementControl!==1||profile.accelerationRaw<=0){clearMovementControl(unit);return false}
 const before=motion.speedRaw;motion.speedRaw=Math.max(0,before-profile.accelerationRaw*frames);const distance=(before+motion.speedRaw)*.5/256*frames;
 if(distance<=0)return false;
 const angle=motion.velocityDirection256*Math.PI/128,x=unit.x+Math.sin(angle)*distance,y=unit.y-Math.cos(angle)*distance;
 const next=collisionStep(battle,unit,x,y);if(next.blocked)motion.speedRaw=0;if(Math.hypot(next.x-unit.x,next.y-unit.y)<EPS)return false;
 unit.x=next.x;unit.y=next.y;unit.action='walk';battle.spatial?.update(unit);return true;
}

function movementScriptDistance(unit,motion,frames,profile){
 const image=unit.def?.image,program=scriptProgramForImage(image,11,false),identity=`${image}:${program?.scriptId??'none'}`;
 if(motion.walkImage!==identity){motion.walkImage=identity;motion.walkTick=0;motion.walkSpeedRaw=0;motion.walkStarted=false}
 const old=motion.walkTick||0,next=old+frames,events=program?.events?.filter(event=>event.op==='move')||[],period=program?.loopPeriodTicks||0;
 const base=Number(unit.movementSpeedOverride)>0?unit.movementSpeedOverride/24:null;
 const apply=amount=>{
  let speed=base??Number(amount||0);
  if(base===null){if(profile.modifier>0)speed=Math.max(speed*1.5,unit.type===70?6.25:10/3);else if(profile.modifier<0)speed*=.5}
  motion.walkSpeedRaw=Math.max(0,speed*256);
 };
 if(!motion.walkStarted){const initial=events.find(event=>event.tick<=EPS);if(initial)apply(initial.operands[0]);else apply(base??((unit.def?.speed||0)/24));motion.walkStarted=true}
 let distance=0,cursor=old;
 if(events.length){
  const firstCycle=period?Math.max(0,Math.floor(old/period)-1):0,lastCycle=period?Math.floor(next/period)+1:0,scheduled=[];
  for(let cycle=firstCycle;cycle<=lastCycle;cycle++)for(const event of events){const at=event.tick+(period?cycle*period:0);if(at>old+EPS&&at<=next+EPS)scheduled.push({at,event})}
  scheduled.sort((a,b)=>a.at-b.at||a.event.sourcePc-b.event.sourcePc);
  for(const {at,event} of scheduled){distance+=motion.walkSpeedRaw/256*(at-cursor);apply(event.operands[0]);cursor=at}
 }
 distance+=motion.walkSpeedRaw/256*(next-cursor);
 motion.walkTick=next;
 return distance;
}

export function aimUnit(battle,unit,target,dt,{turret=false}={}){
 const motion=ensureMotion(unit),direction=angle256(target.x-unit.x,target.y-unit.y),frameCount=Math.max(0,dt*24),profile=movementProfile(battle,unit);
 if(turret){
  const subunit=unit.def?.subunit,engine=Number.isInteger(subunit)?(COMBAT_SOURCE.unitEngine?.[subunit]||null):null,turn=engine?.turnRateRaw||profile.turnRateRaw;
  unit.turretDirection256=(unit.turretDirection256??motion.heading256);
  unit.turretDirection256=rotate(unit.turretDirection256,direction,turn*frameCount);
  unit.turretDirection=direction32(unit.turretDirection256);
  return Math.abs(signedDelta(unit.turretDirection256,direction))<=8;
 }
 motion.desiredDirection256=direction;
 motion.heading256=rotate(motion.heading256,direction,profile.turnRateRaw*frameCount);
 unit.direction=direction32(motion.heading256);
 return Math.abs(signedDelta(motion.heading256,direction))<=8;
}

export function advanceUnitMovement(battle,unit,point,dt,{finalWaypoint=true,stop=false}={}){
 if(!point||!unit?.alive||unit.def?.building||unit.burrowed||unit.type===103&&unit.lurkerState!=='ground'||unit.sieged||unit.buffs?.stasis>0||unit.buffs?.lockdown>0||unit.buffs?.maelstrom>0)return false;
 const motion=ensureMotion(unit),dx=point.x-unit.x,dy=point.y-unit.y,distance=Math.hypot(dx,dy),frames=Math.max(0,dt*24);
 if(distance<.05){if(stop)clearMovementControl(unit);return false}
 const desired=angle256(dx,dy),profile=movementProfile(battle,unit),control=profile.movementControl;
 motion.desiredDirection256=desired;
 const originalError=Math.abs(signedDelta(motion.heading256,desired));
 motion.heading256=rotate(motion.heading256,desired,profile.turnRateRaw*frames);
 unit.direction=direction32(motion.heading256);
 if(control===2){
  if(unit.action!=='walk'){motion.walkTick=0;motion.walkStarted=false;motion.walkSpeedRaw=0;motion.walkImage=null}
  if(originalError>=32||Math.abs(signedDelta(motion.heading256,desired))>16){motion.speedRaw=0;return false}
  const scriptDistance=movementScriptDistance(unit,motion,frames,profile),step=Math.min(distance,scriptDistance);
  if(step<=0)return false;
  const x=unit.x+dx/distance*step,y=unit.y+dy/distance*step;
  const next=collisionStep(battle,unit,x,y);if(Math.hypot(next.x-unit.x,next.y-unit.y)<EPS)return false;
  unit.x=next.x;unit.y=next.y;motion.speedRaw=next.blocked?0:motion.walkSpeedRaw;
  if(!next.blocked&&finalWaypoint&&step>=distance-EPS){unit.x=point.x;unit.y=point.y;clearMovementControl(unit)}
  battle.spatial?.update(unit);unit.action='walk';return true;
 }
 if(control!==0&&control!==1){
  const speed=unit.movementSpeedOverride??unit.def?.speed??0,step=Math.min(distance,speed*dt),x=unit.x+dx/distance*step,y=unit.y+dy/distance*step;
  const next=collisionStep(battle,unit,x,y);if(Math.hypot(next.x-unit.x,next.y-unit.y)<EPS)return false;
  unit.x=next.x;unit.y=next.y;battle.spatial?.update(unit);unit.action='walk';return step>0;
 }
 const turnError=Math.abs(signedDelta(motion.velocityDirection256,desired));
 motion.velocityDirection256=rotate(motion.velocityDirection256,desired,Math.floor(profile.turnRateRaw/2)*frames);
 let accelerate=turnError===0||distance>=32;
 if(!accelerate&&profile.turnRateRaw>0&&profile.accelerationRaw>0){
  const turnFrames=Math.ceil(2*turnError/profile.turnRateRaw),nextSpeed=(motion.speedRaw+profile.accelerationRaw*frames)/256;
  accelerate=Math.floor(turnFrames*nextSpeed)*1.5<=distance;
 }
 const halt=control===0&&profile.accelerationRaw>0?(motion.speedRaw===profile.baseTopSpeedRaw&&profile.topSpeedRaw===profile.baseTopSpeedRaw&&profile.accelerationRaw===profile.baseAccelerationRaw?profile.haltDistanceRaw/256:motion.speedRaw*motion.speedRaw/(2*profile.accelerationRaw*256)):0;
 if(stop||finalWaypoint&&halt>0&&distance<=halt)accelerate=false;
 if(profile.accelerationRaw>0){const delta=profile.accelerationRaw*frames;motion.speedRaw=accelerate?Math.min(profile.topSpeedRaw,motion.speedRaw+delta):Math.max(0,motion.speedRaw-delta)}
 else motion.speedRaw=profile.topSpeedRaw;
 const travel=Math.max(0,(motion.speedRaw/256)*frames),step=Math.min(distance,travel),angle=motion.velocityDirection256*Math.PI/128,x=unit.x+Math.sin(angle)*step,y=unit.y-Math.cos(angle)*step;
 if(step<=0)return false;
 const next=collisionStep(battle,unit,x,y);if(next.blocked)motion.speedRaw=0;if(Math.hypot(next.x-unit.x,next.y-unit.y)<EPS)return false;
 unit.x=next.x;unit.y=next.y;
 if(!next.blocked&&finalWaypoint&&step>=distance-EPS){unit.x=point.x;unit.y=point.y;clearMovementControl(unit)}
 battle.spatial?.update(unit);unit.action='walk';return true;
}
