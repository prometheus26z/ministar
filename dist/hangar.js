import {COMBAT_SOURCE,sourcePlayerForUnit,upgradeLevel,resolveWeapon,cooldownFrames,unitBoundsGap} from './combat-rules.js?v=0.16.23';

const FRAME=1/24,MAX_CARRIER=8,MAX_REAVER=10,INTERCEPTOR_LAUNCH_GAP=7,INTERCEPTOR_WARMUP=15,SCARAB_LAUNCH_GAP=60,SCARAB_COLLISION_GRACE=7,SCARAB_LIFETIME=90,SCARAB_SPEED=384;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const aliveById=(battle,id)=>battle.units.find(unit=>unit.id===id&&unit.alive)||null;
const frameNow=battle=>battle.hangarFrame||0;
const playerLevel=(battle,unit,id)=>upgradeLevel(sourcePlayerForUnit(battle,unit),id);
const carrierCapacity=(battle,parent)=>playerLevel(battle,parent,43)>0?8:4;
const reaverCapacity=(battle,parent)=>playerLevel(battle,parent,36)>0?10:5;
const combatDisabled=unit=>!unit?.alive||unit.buffs?.stasis>0||unit.buffs?.lockdown>0||unit.buffs?.maelstrom>0;

function childArray(battle,parent){return [...(parent.hangar?.childIds||[])].map(id=>aliveById(battle,id)).filter(Boolean).sort((a,b)=>a.id-b.id)}
function makeDockedInterceptor(battle,parent){
 const child=battle.create(73,parent.team,parent.x,parent.y);if(!child)return null;
 child.commanderId=parent.commanderId;child.sourceCombatPlayer=sourcePlayerForUnit(battle,parent);child.def=Object.freeze({...child.def,combatProfilePlayer:child.sourceCombatPlayer});
 child.maxHp=child.def.hp;child.maxEnergy=child.def.energy||0;child.hidden=true;child.loaded=parent.id;child.laneArmy=false;child.target=null;child.order='hold';child.fighter={kind:'interceptor',state:'docked',parentId:parent.id,stateTick:frameNow(battle),targetId:null,waypoint:null,shotReadyFrame:0,launchFrame:0,orphanUntil:null};
 parent.hangar.childIds.add(child.id);battle.spatial?.update(child);return child;
}

export function carrierChildren(battle,parent){return childArray(battle,parent)}
export function carrierCapacityFor(battle,parent){return carrierCapacity(battle,parent)}
export function reaverCapacityFor(battle,parent){return reaverCapacity(battle,parent)}

export function initializeHangar(battle,parent,requested=null){
 if(!parent||![72,83].includes(parent.type)||parent.hallucination)return null;
 const frame=frameNow(battle);
 if(parent.type===72){
  const isNew=!parent.hangar;
  if(isNew)parent.hangar={kind:'carrier',childIds:new Set(),launchReadyTick:frame,repairCursor:0};
  const capacity=carrierCapacity(battle,parent),desired=Math.min(capacity,Math.max(0,Math.trunc(requested??(isNew?capacity:childArray(battle,parent).length))));
  while(childArray(battle,parent).length<desired)if(!makeDockedInterceptor(battle,parent))break;
  while(childArray(battle,parent).length>desired){const child=childArray(battle,parent).at(-1);removeDockedSilently(battle,child)}
  return parent.hangar;
 }
 const capacity=reaverCapacity(battle,parent),initial=Math.min(capacity,Math.max(0,Math.trunc(requested??(parent.hangar?parent.hangar.stock:capacity))));
 if(!parent.hangar)parent.hangar={kind:'reaver',stock:initial,activeScarabId:null,launchReadyTick:frame};
 else if(requested!==null)parent.hangar.stock=initial;
 return parent.hangar;
}

export function refillCarrier(battle,parent,amount=1){
 if(parent?.type!==72||!parent.alive||parent.hallucination)return 0;
 initializeHangar(battle,parent,null);const before=childArray(battle,parent).length,limit=carrierCapacity(battle,parent),wanted=Math.min(limit,before+Math.max(0,Math.trunc(amount)));
 let added=0;while(childArray(battle,parent).length<wanted){if(!makeDockedInterceptor(battle,parent))break;added++}return added;
}

export function refillReaver(battle,parent,amount=10){
 if(parent?.type!==83||!parent.alive||parent.hallucination)return 0;
 initializeHangar(battle,parent,null);const h=parent.hangar,before=h.stock||0;h.stock=Math.min(reaverCapacity(battle,parent),before+Math.max(0,Math.trunc(amount)));return h.stock-before;
}

export function hangarSnapshot(battle,parent){
 if(parent?.type===72){const children=childArray(battle,parent);return Object.freeze({kind:'carrier',capacity:carrierCapacity(battle,parent),total:children.length,docked:children.filter(u=>u.fighter?.state==='docked').length,active:children.filter(u=>u.fighter?.state!=='docked').length})}
 if(parent?.type===83)return Object.freeze({kind:'reaver',capacity:reaverCapacity(battle,parent),inside:parent.hangar?.stock||0,active:aliveById(battle,parent.hangar?.activeScarabId)?.alive?1:0});
 return null;
}

function removeDockedSilently(battle,child){
 if(!child?.alive)return;
 const parent=aliveById(battle,child.fighter?.parentId);parent?.hangar?.childIds?.delete(child.id);
 child.alive=false;child.hidden=true;child.loaded=null;child.refunded=true;child.hp=0;child.fighter=null;battle.spatial?.update(child);
}

export function clearHangar(battle,parent){
 if(!parent?.hangar)return;
 if(parent.type===72){for(const child of childArray(battle,parent))removeDockedSilently(battle,child);parent.hangar.childIds.clear()}
 else if(parent.type===83){const active=aliveById(battle,parent.hangar.activeScarabId);if(active){active.fighter.parentId=null;parent.hangar.activeScarabId=null}parent.hangar.stock=parent.hallucination?reaverCapacity(battle,parent):0}
}

export function onHangarUnitDeath(battle,unit){
 if(unit?.type===72){
  const children=unit.hangar?.childIds?childArray(battle,unit):[];unit.hangar?.childIds?.clear();
  for(const child of children){
   if(child.fighter.state==='docked'){child.alive=false;child.hidden=true;child.loaded=null;child.refunded=true;child.hp=0;child.fighter=null;battle.spatial?.update(child);continue}
   child.fighter.parentId=null;child.loaded=null;child.hidden=false;
   if(child.fighter.state==='returning'){child.fighter.orphanUntil=frameNow(battle);child.alive=false;child.hp=0;child.refunded=true;battle.spatial?.update(child)}
   else child.fighter.orphanUntil=frameNow(battle)+15+Math.floor((battle.random||Math.random)()*31);
  }
 }
 if(unit?.type===83){const child=aliveById(battle,unit.hangar?.activeScarabId);if(child){child.fighter.parentId=null;child.loaded=null;child.hidden=false}if(unit.hangar)unit.hangar.stock=0}
 if(unit?.fighter){
  const parent=aliveById(battle,unit.fighter.parentId);
  if(parent?.hangar?.kind==='carrier')parent.hangar.childIds.delete(unit.id);
  if(parent?.hangar?.kind==='reaver'&&parent.hangar.activeScarabId===unit.id){parent.hangar.activeScarabId=null;if(unit.fighter.exploded)parent.hangar.stock=Math.max(0,(parent.hangar.stock||0)-1)}
 }
}

export function transferHangarOwnership(battle,parent,team,commanderId=null){
 if(!parent?.hangar)return;
 if(Number.isInteger(commanderId))parent.commanderId=commanderId;
 parent.team=team;parent.sourceCombatPlayer=COMBAT_SOURCE.sourceCombatPlayerByTeam?.[team]??(team?7:3);
 for(const child of childArray(battle,parent)){
  child.team=team;child.commanderId=parent.commanderId;child.sourceCombatPlayer=parent.sourceCombatPlayer;child.target=null;
  if(child.fighter.state!=='docked')child.fighter.targetId=null;
  battle.spatial?.update(child);
 }
 battle.spatial?.update(parent);
}

function targetValid(battle,parent,target,groundOnly=false){
 return !!target?.alive&&!target.hidden&&!target.productionOnly&&!target.loaded&&!target.def?.invincible&&!target.buffs?.stasis&&target.team!==parent.team&&(!groundOnly||!target.def.air)&&battle.canSee(parent.team,target);
}

function selectTarget(battle,parent,{groundOnly=false,range=256}={}){
 const radius=range+parent.r+(battle.spatial?.maxExtent||64);
 return battle.nearby(parent,radius).filter(target=>targetValid(battle,parent,target,groundOnly)&&battle.edgeDistance(parent,target)<=range)
  .sort((a,b)=>battle.targetScore?battle.targetScore(parent,a)-battle.targetScore(parent,b):distance(parent,a)-distance(parent,b))[0]||null;
}

function marchParent(battle,parent,dt){
 const goal=parent.goal;if(!parent.laneArmy||!goal)return;
 if(parent.def.air){battle.move(parent,goal,dt);return}
 if(!parent.path?.length||!parent.pathGoal||distance(parent.pathGoal,goal)>16){parent.path=battle.path(parent,goal,false,parent.r*.55,parent);parent.pathGoal={x:goal.x,y:goal.y}}
 const waypoint=parent.path?.[0];if(!waypoint)return;
 battle.move(parent,waypoint,dt);if(distance(parent,waypoint)<5)parent.path.shift();
}

function fighterTarget(battle,parent,child,groundOnly=false){
 let target=aliveById(battle,child.fighter.targetId);
 if(!targetValid(battle,parent||{team:child.team},target,groundOnly))target=null;
 if(parent&&target&&distance(parent,target)>320+target.r)target=null;
 if(!target&&parent)target=selectTarget(battle,parent,{groundOnly,range:320});
 if(target)child.fighter.targetId=target.id;else child.fighter.targetId=null;
 return target;
}

function clampFlightPoint(point,unit){
 const margin=Math.max(20,unit.r||8);let x=point.x,y=point.y;
 if(x<margin)x=margin+(margin-x);if(x>1280-margin)x=1280-margin-(x-(1280-margin));
 if(y<margin)y=margin+(margin-y);if(y>2048-margin)y=2048-margin-(y-(2048-margin));
 return{x:Math.max(margin,Math.min(1280-margin,x)),y:Math.max(margin,Math.min(2048-margin,y))};
}

function randomWaypoint(battle,target,unit,multiplier){
 const random=battle.random||Math.random,offset=()=>Math.floor(random()*256)-127;
 return clampFlightPoint({x:target.x+offset()*multiplier,y:target.y+offset()*multiplier},unit);
}

function setReturning(battle,child){child.fighter.state='returning';child.fighter.stateTick=frameNow(battle);child.fighter.targetId=null;child.fighter.waypoint=null;child.fighter.returnLayer=false;child.target=null;child.order='hold'}

function dockInterceptor(battle,parent,child){
 child.x=parent.x;child.y=parent.y;child.hidden=true;child.loaded=parent.id;child.target=null;child.order='hold';child.goal=null;child.path=[];child.cooldown=0;child.action='idle';child.animTime=0;
 child.fighter.state='docked';child.fighter.stateTick=frameNow(battle);child.fighter.targetId=null;child.fighter.waypoint=null;child.fighter.returnLayer=false;child.fighter.orphanUntil=null;
 battle.spatial?.update(child);
}

function launchInterceptor(battle,parent,child,target){
 const frame=frameNow(battle),h=parent.hangar;
 child.hidden=false;child.loaded=null;child.x=parent.x;child.y=parent.y;child.team=parent.team;child.commanderId=parent.commanderId;child.sourceCombatPlayer=parent.sourceCombatPlayer;
 child.shield=child.def.shield;child.fighter.state='launch';child.fighter.stateTick=frame;child.fighter.launchFrame=frame;child.fighter.warmupFrame=frame+INTERCEPTOR_WARMUP;child.fighter.targetId=target.id;child.fighter.waypoint=randomWaypoint(battle,target,child,3);child.fighter.shotReadyFrame=frame+INTERCEPTOR_WARMUP;child.fighter.orphanUntil=null;child.target=target;child.order='hold';
 h.launchReadyTick=frame+INTERCEPTOR_LAUNCH_GAP;battle.spatial?.update(child);
}

function fireInterceptor(battle,child,target){
 const weapon=resolveWeapon(battle.data,battle,child,!!target.def.air);if(!weapon||weapon.controlOnly)return false;
 const jitter=Math.floor((battle.random||Math.random)()*4)-1,interval=cooldownFrames(battle,child,weapon,{jitter});
 if(!battle.attack(child,target,weapon))return false;
 child.fighter.shotReadyFrame=frameNow(battle)+interval;return true;
}

function advanceInterceptor(battle,child,point,dt){
 if(!point)return;
 battle.move(child,point,dt);battle.spatial?.update(child);
}

function tickInterceptor(battle,parent,child,dt){
 const frame=frameNow(battle),fighter=child.fighter;
 if(fighter.orphanUntil!==null&&fighter.orphanUntil!==undefined&&frame>=fighter.orphanUntil){battle.die(child);return}
 if(child.hidden||fighter.state==='docked'){
  for(const key of Object.keys(child.buffs||{}))if(child.buffs[key]!==Infinity)child.buffs[key]=Math.max(0,child.buffs[key]-dt);
  if(child.shield<child.def.shield)child.shield=Math.min(child.def.shield,child.shield+.65*dt);
  return;
 }
 if(combatDisabled(child))return;
 if(!parent){if(fighter.state==='returning'){battle.die(child);return}if(fighter.orphanUntil===undefined)fighter.orphanUntil=frame+15+Math.floor((battle.random||Math.random)()*31)}
 let target=parent?fighterTarget(battle,parent,child,false):aliveById(battle,fighter.targetId);
 if(target&&(!targetValid(battle,parent||{team:child.team},target,false)||parent&&distance(parent,target)>320+target.r))target=null;
 if(target)fighter.targetId=target.id;else fighter.targetId=null;
 if(parent&&(combatDisabled(parent)||!target||child.shield<child.def.shield/4))setReturning(battle,child);
 if(fighter.state==='returning'){
  if(!parent){battle.die(child);return}
  fighter.returnLayer=distance(child,parent)<=60;
  advanceInterceptor(battle,child,parent,dt);
  if(distance(child,parent)<=10)dockInterceptor(battle,parent,child);
  return;
 }
 if(!target){if(parent)setReturning(battle,child);return}
 const weapon=resolveWeapon(battle.data,battle,child,!!target.def.air),edge=battle.edgeDistance(child,target);
 if(child.attackControl){battle.advanceAttackControl(child,dt);if(child.attackControl)return}
 if(frame>=fighter.warmupFrame&&frame>=fighter.shotReadyFrame&&weapon&&edge<=weapon.range&&battle.aimTarget(child,target,dt)){
  fireInterceptor(battle,child,target);if(child.attackControl)return;
 }
 if(fighter.state==='launch'){
  advanceInterceptor(battle,child,fighter.waypoint||target,dt);
  if(frame-fighter.stateTick>=INTERCEPTOR_WARMUP){fighter.state='approach';fighter.stateTick=frame;fighter.waypoint=null}
  return;
 }
 if(fighter.state==='approach'){
  advanceInterceptor(battle,child,target,dt);
  if(edge<=50){fighter.state='pass1';fighter.stateTick=frame;fighter.waypoint=randomWaypoint(battle,target,child,1)}
  return;
 }
 if(fighter.state==='pass1'||fighter.state==='pass2'){
  const waypoint=fighter.waypoint||target;advanceInterceptor(battle,child,waypoint,dt);
  if(distance(child,waypoint)<=50){if(fighter.state==='pass1'){fighter.state='pass2';fighter.stateTick=frame;fighter.waypoint=randomWaypoint(battle,target,child,2)}else{fighter.state='approach';fighter.stateTick=frame;fighter.waypoint=null}}
 }
}

function canReachTarget(battle,parent,target){
 const route=battle.path(parent,target,false,parent.r*.55,parent);if(!route.length||distance(route.at(-1),target)>36)return false;
 let length=distance(parent,route[0]);for(let i=1;i<route.length;i++)length+=distance(route[i-1],route[i]);
 return length<512;
}

function launchScarab(battle,parent,target){
 const h=parent.hangar,frame=frameNow(battle);if(!h?.stock||aliveById(battle,h.activeScarabId))return null;
 const angle=parent.direction*Math.PI/16,child=battle.create(85,parent.team,parent.x+Math.sin(angle)*25,parent.y-Math.cos(angle)*25);if(!child)return null;
 child.commanderId=parent.commanderId;child.sourceCombatPlayer=parent.sourceCombatPlayer;child.def=Object.freeze({...child.def,invincible:true,combatProfilePlayer:child.sourceCombatPlayer});child.hidden=false;child.loaded=null;child.laneArmy=false;
 child.hallucination=!!parent.hallucination;child.fighter={kind:'scarab',state:'seeking',parentId:parent.id,targetId:target.id,lastX:target.x,lastY:target.y,launchFrame:frame,expiresTick:frame+SCARAB_LIFETIME,path:[],pathTarget:{x:target.x,y:target.y},repathAt:frame};child.order='hold';child.target=target;child.action='walk';
 h.activeScarabId=child.id;h.launchReadyTick=frame+SCARAB_LAUNCH_GAP;battle.spatial?.update(child);return child;
}

function visibleGroundTarget(battle,parent,target){return targetValid(battle,parent,target,true)}

function areaDamage(battle,child,point,weapon){
 const splashWeapon={...weapon,explosionType:'Enemy_Splash'};const hits=battle.splashHits(point,splashWeapon,null,child);battle.applySplashHits(hits,splashWeapon,weapon.damage,child.team,child);return hits.length;
}

function explodeScarab(battle,child,point,target=null){
 const fighter=child.fighter;if(fighter.exploded)return;
 const weapon=resolveWeapon(battle.data,battle,child,false);fighter.exploded=true;fighter.state='exploding';fighter.expiresTick=frameNow(battle)+1;
 if(!child.hallucination&&weapon?.damage>0)areaDamage(battle,child,point,weapon);
 battle.effects.push({kind:'scarab-explosion',image:444,x:point.x,y:point.y,team:child.team,left:.6,duration:.6,targetId:target?.id||null});
 child.x=point.x;child.y=point.y;child.action='attack';child.animTime=0;child.target=null;child.fighter.targetId=null;
}

function updateScarabPath(battle,child,point,frame){
 const f=child.fighter,moved=Math.hypot(point.x-(f.pathTarget?.x??Infinity),point.y-(f.pathTarget?.y??Infinity));
 const waypointBlocked=f.path?.length&&battle.map.blocked(f.path[0].x,f.path[0].y,child.r*.55);
 if(moved>=32||frame>=f.repathAt||waypointBlocked){f.path=battle.path(child,point,false,child.r*.55,child);f.pathTarget={x:point.x,y:point.y};f.repathAt=frame+6}
 return f.path?.[0]||null;
}

function moveScarab(battle,child,waypoint,dt){
 if(!waypoint)return false;
 const from={x:child.x,y:child.y},length=distance(from,waypoint);if(length<.01)return false;
 const travel=Math.min(length,SCARAB_SPEED*dt),steps=Math.max(1,Math.ceil(travel/4)),frame=frameNow(battle),canHitUnits=frame-child.fighter.launchFrame>=SCARAB_COLLISION_GRACE;
 for(let step=1;step<=steps;step++){
  const fraction=Math.min(1,step*travel/steps/length),point={x:from.x+(waypoint.x-from.x)*fraction,y:from.y+(waypoint.y-from.y)*fraction};
  if(battle.map.blocked(point.x,point.y,child.r*.55))return false;
  if(canHitUnits){
   const collision=battle.nearby(point,32).filter(unit=>unit!==child&&unit.alive&&!unit.hidden&&!unit.loaded&&!unit.productionOnly&&!unit.def.air).find(unit=>unitBoundsGap(point,unit,battle.data)<=child.r);
   if(collision){if(collision.team!==child.team)explodeScarab(battle,child,point,collision);return false}
  }
  child.x=point.x;child.y=point.y;battle.spatial?.update(child);
 }
 child.direction=(Math.round(Math.atan2(waypoint.x-from.x,from.y-waypoint.y)*16/Math.PI)+32)%32;
 return true;
}

function tickScarab(battle,parent,child,dt){
 const f=child.fighter,frame=frameNow(battle);
 if(frame>=f.expiresTick){battle.die(child);return}
 if(f.exploded){if(frame>=f.expiresTick)battle.die(child);return}
 if(combatDisabled(child))return;
 let target=aliveById(battle,f.targetId);
 if(!visibleGroundTarget(battle,{team:child.team},target)){f.targetId=null;target=null}
 if(target){f.lastX=target.x;f.lastY=target.y}
 const point=target?{x:target.x,y:target.y}:{x:f.lastX,y:f.lastY};
 if(frame-f.launchFrame>=SCARAB_COLLISION_GRACE&&unitBoundsGap(child,target||{...child,x:point.x,y:point.y,def:{size:1}},battle.data)<=10){explodeScarab(battle,child,{x:child.x,y:child.y},target);return}
 const waypoint=updateScarabPath(battle,child,point,frame);
 if(waypoint&&moveScarab(battle,child,waypoint,dt)&&distance(child,waypoint)<5)f.path.shift();
 if(f.exploded)return;
 child.action='walk';child.target=target;
 if(frame-f.launchFrame>=SCARAB_COLLISION_GRACE&&!target&&distance(child,point)<=10)explodeScarab(battle,child,{x:child.x,y:child.y},null);
}

function tickCarrier(battle,parent,dt){
 initializeHangar(battle,parent,null);const h=parent.hangar,frame=frameNow(battle),target=parent.completed===false?null:selectTarget(battle,parent,{range:256});parent.target=target;
 const children=childArray(battle,parent),outside=children.filter(child=>child.fighter.state!=='docked');
 if(combatDisabled(parent))for(const child of outside)if(child.fighter.state!=='returning')setReturning(battle,child);
 repairOneCarrierChild(parent,children);
 for(const child of children)tickInterceptor(battle,parent,child,dt);
 if(combatDisabled(parent))return;
 if(!target){marchParent(battle,parent,dt);return}
 if(battle.edgeDistance(parent,target)>256||frame<(h.launchReadyTick||0))return;
 const next=children.filter(child=>child.fighter.state==='docked'&&child.hp>=child.maxHp/2).sort((a,b)=>(b.hp/b.maxHp)-(a.hp/a.maxHp)||a.id-b.id)[0];
 if(next)launchInterceptor(battle,parent,next,target);
}

function repairOneCarrierChild(parent,children){
 const damaged=children.filter(child=>child.fighter.state==='docked'&&child.hp<child.maxHp);
 if(!damaged.length)return;
 const cursor=(parent.hangar.repairCursor||0)%damaged.length,child=damaged[cursor];parent.hangar.repairCursor=(cursor+1)%damaged.length;
 child.hp=Math.min(child.maxHp,child.hp+.5);
}

function tickReaver(battle,parent){
 initializeHangar(battle,parent,null);const h=parent.hangar,frame=frameNow(battle);parent.target=null;if(parent.completed===false||combatDisabled(parent))return;
 if(aliveById(battle,h.activeScarabId)||!h.stock||frame<(h.launchReadyTick||0))return;
 const target=selectTarget(battle,parent,{groundOnly:true,range:256});if(!target||!canReachTarget(battle,parent,target)){marchParent(battle,parent,FRAME);return}
 const desired=(Math.round(Math.atan2(target.x-parent.x,parent.y-target.y)*16/Math.PI)+32)%32,diff=((desired-parent.direction+48)%32)-16;
 if(Math.abs(diff)>1){parent.direction=(parent.direction+(diff>0?1:31))%32;return}
 parent.direction=desired;parent.target=target;launchScarab(battle,parent,target);
}

export function tickHangarFrame(battle,dt=FRAME){
 battle.hangarFrame=(battle.hangarFrame||0)+1;
 const parents=battle.units.filter(unit=>unit.alive&&[72,83].includes(unit.type)&&(!unit.hallucination||unit.type===83)).sort((a,b)=>a.id-b.id);
 for(const parent of parents){if(parent.type===72)tickCarrier(battle,parent,dt);else tickReaver(battle,parent)}
 const liveParents=new Set(parents.map(parent=>parent.id));
 const orphans=battle.units.filter(unit=>unit.alive&&unit.fighter?.kind==='interceptor'&&!liveParents.has(unit.fighter.parentId)&&unit.fighter.state!=='docked').sort((a,b)=>a.id-b.id);
 for(const child of orphans)tickInterceptor(battle,null,child,dt);
 const scarabs=battle.units.filter(unit=>unit.alive&&unit.fighter?.kind==='scarab').sort((a,b)=>(a.fighter.parentId??0)-(b.fighter.parentId??0)||a.id-b.id);
 for(const child of scarabs){const parent=aliveById(battle,child.fighter.parentId);tickScarab(battle,parent,child,dt)}
}

export function refillAllCarriers(battle,amount=1){let added=0;for(const unit of battle.units)if(unit.alive&&unit.type===72&&!unit.hallucination)added+=refillCarrier(battle,unit,amount);return added}
export function refillAllReavers(battle,amount=10){let added=0;for(const unit of battle.units)if(unit.alive&&unit.type===83&&!unit.hallucination)added+=refillReaver(battle,unit,amount);return added}

export const HANGAR_RULES=Object.freeze({frameSeconds:FRAME,interceptorLaunchGapFrames:INTERCEPTOR_LAUNCH_GAP,interceptorWarmupFrames:INTERCEPTOR_WARMUP,scarabLaunchGapFrames:SCARAB_LAUNCH_GAP,scarabCollisionGraceFrames:SCARAB_COLLISION_GRACE,scarabLifetimeFrames:SCARAB_LIFETIME,scarabSpeed:SCARAB_SPEED});
