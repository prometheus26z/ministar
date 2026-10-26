import {COMBAT_SOURCE} from './broodwar-combat-data.js?v=0.16.23';

const NO_WEAPON=130;
const SPEED_UPGRADES={2:17,37:27,38:29,39:53,42:26,65:34,69:37,70:42,84:39};
const ATTACK_SPEED_UPGRADES={37:28};
const ENERGY_UPGRADES={1:21,8:22,9:19,12:23,34:51,45:31,46:32,60:47,63:49,67:40,71:44};
const SIGHT_UPGRADES={1:20,42:25,84:38,70:41};
const PROFILE_CACHE=new WeakMap();
const CONTROL_WEAPONS=Object.freeze({
 carrier:Object.freeze({id:79,damage:0,cooldown:0,range:256,minRange:0,type:3,factor:1,splash:[0,0,0],air:true,ground:true,controlOnly:true}),
 reaver:Object.freeze({id:82,damage:0,cooldown:0,range:256,minRange:0,type:3,factor:1,splash:[0,0,0],air:false,ground:true,controlOnly:true})
});

export function sourcePlayerForUnit(battle,unit){
 if(battle?.laneMode&&unit?.productionOnly&&!unit?.fixedCombatDefense&&!unit?.isMain&&!unit?.isOutpost){
  const player=COMBAT_SOURCE.sourceProductionPlayerByCommander?.[unit.commanderId];
  if(Number.isInteger(player))return player;
 }
 if(Number.isInteger(unit?.sourceCombatPlayer))return unit.sourceCombatPlayer;
 if(!battle?.laneMode)return null;
 return COMBAT_SOURCE.sourceCombatPlayerByTeam?.[unit?.team]??(unit?.team?7:3);
}

export function upgradeLevel(player,upgrade){
 if(!Number.isInteger(player)||!Number.isInteger(upgrade)||upgrade<0||upgrade>=61)return 0;
 return COMBAT_SOURCE.players[player]?.initial?.[upgrade]||0;
}

function levelFor(battle,unit,upgrade){return upgradeLevel(sourcePlayerForUnit(battle,unit),upgrade)}
function unitId(unit){return Number(unit?.sieged?30:unit?.type)}
function unitRule(unit){return COMBAT_SOURCE.units[unitId(unit)]||null}
function profileCache(baseDef){let cache=PROFILE_CACHE.get(baseDef);if(!cache)PROFILE_CACHE.set(baseDef,cache=new Map());return cache}

export function resolveUnitDefinition(battle,unit,baseDef=unit?.baseDef||unit?.def,mapOverride=unit?.mapDefOverride||null){
 if(!baseDef)return baseDef;
 const player=sourcePlayerForUnit(battle,unit),key=`${player??'base'}:${unitId(unit)}:${mapOverride?'override':''}`;
 if(!mapOverride){const cached=profileCache(baseDef).get(key);if(cached)return cached}
 const rule=unitRule(unit),engine=COMBAT_SOURCE.unitEngine?.[unitId(unit)],profile=Number.isInteger(player)?COMBAT_SOURCE.players[player]:null;
 const def={...baseDef,...(mapOverride||{})};
 if(engine)def.regeneratesHp=!!engine.regeneratesHp;
 if(profile&&rule){
  const armorUpgrade=rule.armorUpgrade;
  const armorLevel=Number.isInteger(armorUpgrade)&&armorUpgrade<60?profile.initial[armorUpgrade]||0:0;
  const ultraCarapace=unitId(unit)===39&&(profile.initial[52]||0)>0?2:0;
  def.armor=(mapOverride?.armor??baseDef.armor??0)+armorLevel+ultraCarapace;
  def.shieldArmor=(baseDef.shield>0||def.shield>0)?(profile.initial[15]||0):0;
  const energyUpgrade=ENERGY_UPGRADES[unitId(unit)];
  if((baseDef.energy||0)>0&&energyUpgrade!==undefined&&(profile.initial[energyUpgrade]||0)>0)def.energy=250;
  const sightUpgrade=SIGHT_UPGRADES[unitId(unit)];
  if(sightUpgrade!==undefined&&(profile.initial[sightUpgrade]||0)>0)def.sight=352;
  def.acquisitionRangeSightBasis=def.sight||baseDef.sight||0;
  const speedUpgrade=SPEED_UPGRADES[unitId(unit)];
  def.speedUpgradeActive=speedUpgrade!==undefined&&(profile.initial[speedUpgrade]||0)>0;
  def.acquisitionRangeGround=acquisitionRange(battle,unit,false,def,baseDef);
  def.acquisitionRangeAir=acquisitionRange(battle,unit,true,def,baseDef);
  def.acquisitionRange=Math.max(def.acquisitionRangeGround,def.acquisitionRangeAir);
  def.combatUpgrades=profile.initial;
  def.combatProfilePlayer=player;
  def.invincible=mapOverride?.invincible??!!rule.invincible;
 }
 const result=Object.freeze(def);
 if(!mapOverride)profileCache(baseDef).set(key,result);
 return result;
}

export function controlWeapon(unit){
 if(unit?.type===72)return CONTROL_WEAPONS.carrier;
 if(unit?.type===83)return CONTROL_WEAPONS.reaver;
 return null;
}

function rangeBonus(unit,weaponId,player){
 if(!Number.isInteger(player))return 0;
 const upgrades=COMBAT_SOURCE.players[player]?.initial||[];
 if(unitId(unit)===0&&upgrades[16]>0)return 32;
 if(unitId(unit)===38&&upgrades[30]>0)return 32;
 if(unitId(unit)===66&&upgrades[33]>0)return 64;
 if(unitId(unit)===3&&weaponId===8&&upgrades[54]>0)return 96;
 return 0;
}

export function resolveWeapon(data,battle,unit,targetAir=false,forcedWeaponId=null){
 if((unit?.type===72||unit?.type===83)&&!Number.isInteger(forcedWeaponId))return controlWeapon(unit);
 if(unit?.type===103&&(unit.lurkerState!=='burrowed'||!unit.burrowed))return null;
 if(unit?.type!==103&&unit?.burrowed)return null;
 const id=unitId(unit),rule=COMBAT_SOURCE.units[id],fallback=unit?.def||data.units[id];
 const weaponId=Number.isInteger(forcedWeaponId)?forcedWeaponId:rule?(targetAir?rule.sourceAirWeapon:rule.sourceGroundWeapon):(targetAir?fallback?.airWeapon:fallback?.groundWeapon);
 if(!Number.isInteger(weaponId)||weaponId===NO_WEAPON)return null;
 const base=data.weapons?.[weaponId];if(!base||!base.damage||targetAir&&!base.air||!targetAir&&!base.ground)return null;
 const player=sourcePlayerForUnit(battle,unit),weaponRule=COMBAT_SOURCE.weapons[weaponId];
 const upgrades=Number.isInteger(player)?COMBAT_SOURCE.players[player]?.initial||[]:[];
 const mapCombat=!!battle?.laneMode&&Number.isInteger(player);
 const damageUpgrade=weaponRule?.damageUpgrade??NO_WEAPON;
 const damageLevel=damageUpgrade<60?(upgrades[damageUpgrade]||0):0;
 const rawDamage=mapCombat&&Number.isFinite(weaponRule?.mapDamage)?weaponRule.mapDamage:base.damage;
 const bonus=mapCombat&&Number.isFinite(weaponRule?.mapBonus)?weaponRule.mapBonus:0;
 const damage=Math.max(0,rawDamage+bonus*damageLevel);
 const range=base.range+rangeBonus(unit,weaponId,player);
 const splash=weaponRule?[weaponRule.wpnSplashRangeInner,weaponRule.wpnSplashRangeMid,weaponRule.wpnSplashRangeOuter]:base.splash;
 return Object.freeze({...base,damage,range,splash,explosionType:weaponRule?.explosionType||base.explosionType||'Normal',sourceWeaponId:weaponId,damageUpgrade,damageLevel,mapDamage:rawDamage,mapBonus:bonus,combatProfilePlayer:player});
}

export function acquisitionRange(battle,unit,targetAir=null,definition=unit?.def,baseDef=unit?.baseDef){
 const stored=targetAir===null?definition?.acquisitionRange:targetAir?definition?.acquisitionRangeAir:definition?.acquisitionRangeGround;
 if(Number.isFinite(stored))return Math.max(0,stored+Math.max(0,(Number(definition?.sight)||0)-(Number(definition?.acquisitionRangeSightBasis)||0)));
 const rule=unitRule(unit),baseSight=Number(definition?.sight??baseDef?.sight)||0;
 if(!Number.isInteger(sourcePlayerForUnit(battle,unit)))return Number(definition?.sight)||baseSight;
 const baseAcquisition=Number(rule?.acquisitionRangePixels)||baseSight;
 const targets=targetAir===null?[false,true]:[!!targetAir],ranges=[];
 for(const air of targets){
  const weapon=resolveWeapon(battle?.data||{},battle,unit,air);
  if(!weapon||weapon.controlOnly)continue;
  const original=COMBAT_SOURCE.weapons[weapon.sourceWeaponId]?.wpnMaxRange;
  const baseRange=Number.isFinite(original)?original:(battle?.data?.weapons?.[weapon.sourceWeaponId]?.range||weapon.range);
  ranges.push(Math.max(weapon.range,baseAcquisition+Math.max(0,weapon.range-baseRange)));
 }
 return Math.max(baseAcquisition,...ranges);
}

export function attackHitCount(unit,weapon,targetAir=false){
 const unitHits=targetAir?(unit?.def?.airHits||1):(unit?.def?.groundHits||1);
 return Math.max(1,Math.trunc(weapon?.factor||1))*Math.max(1,Math.trunc(unitHits));
}

export function cooldownFrames(battle,unit,weapon,{jitter=0}={}){
 const weaponId=weapon?.sourceWeaponId??weapon?.id,source=COMBAT_SOURCE.weapons[weaponId];
 let base=Math.max(1,Math.round(source?.wpnDamageCooldowns??(weapon?.cooldown||0)*24));
 const acidSporeCount=Math.min(9,Math.max(0,Math.trunc(unit?.acidSporeTimers?.length??unit?.acidSporeCount??0)));
 if(acidSporeCount)base+=Math.max(Math.floor(base/8),3)*acidSporeCount;
 const player=sourcePlayerForUnit(battle,unit),upgrades=Number.isInteger(player)?COMBAT_SOURCE.players[player]?.initial||[]:[];
 const speedUpgrade=ATTACK_SPEED_UPGRADES[unitId(unit)],speed=Number.isInteger(speedUpgrade)&&(upgrades[speedUpgrade]||0)>0;
 const modifier=Number(unit?.buffs?.stim>0)+Number(speed)-Number(unit?.buffs?.ensnare>0);
 const modified=modifier>0?Math.floor(base/2):modifier<0?base+Math.floor(base/4):base;
 return Math.max(5,Math.min(250,modified+jitter));
}

export function movementSpeed(battle,unit){
 const def=unit?.def||{},profile=movementProfile(battle,unit);
 if(!unit?.movementSpeedOverride&&(profile.movementControl===0||profile.movementControl===1))return profile.topSpeedRaw/256*24;
 const base=unit?.movementSpeedOverride??def.speed??unit?.baseDef?.speed??0;
 const modifier=Number(unit?.buffs?.stim>0)+Number(!!def.speedUpgradeActive)-Number(unit?.buffs?.ensnare>0);
 if(modifier>0){const minimum=unitId(unit)===70?160:80;return Math.max(base*1.5,minimum)}
 if(modifier<0)return base*.5;
 return base;
}

export function movementProfile(battle,unit){
 const engine=COMBAT_SOURCE.unitEngine?.[unitId(unit)];
 const movementControl=engine?.movementControl??2,baseTopSpeedRaw=engine?.topSpeedRaw??0,baseAccelerationRaw=engine?.accelerationRaw??0,baseTurnRateRaw=engine?.turnRateRaw??0;
 const modifier=Number(unit?.buffs?.stim>0)+Number(!!unit?.def?.speedUpgradeActive)-Number(unit?.buffs?.ensnare>0);
 let topSpeedRaw=baseTopSpeedRaw,accelerationRaw=baseAccelerationRaw,turnRateRaw=baseTurnRateRaw;
 if(modifier>0){topSpeedRaw=baseTopSpeedRaw+Math.floor(baseTopSpeedRaw/2);if(topSpeedRaw<Math.floor(10/3*256))topSpeedRaw=Math.floor(10/3*256);accelerationRaw=baseAccelerationRaw*2;turnRateRaw=baseTurnRateRaw*2;if(unitId(unit)===70&&unit?.def?.speedUpgradeActive)topSpeedRaw=6*256+(256-Math.floor(256/3))}
 else if(modifier<0){topSpeedRaw=Math.floor(baseTopSpeedRaw/2);accelerationRaw=baseAccelerationRaw-Math.floor(baseAccelerationRaw/4);turnRateRaw=baseTurnRateRaw-Math.floor(baseTurnRateRaw/4)}
 const unchanged=modifier===0,haltDistanceRaw=unchanged?(engine?.haltDistanceRaw??0):accelerationRaw>0?topSpeedRaw*topSpeedRaw/(2*accelerationRaw*256):0;
 return {movementControl,topSpeedRaw,accelerationRaw,turnRateRaw,haltDistanceRaw,baseTopSpeedRaw,baseAccelerationRaw,baseTurnRateRaw,modifier};
}

export function scriptProgramForImage(image,slot,targetNear=false){
 const scriptId=COMBAT_SOURCE.imageScriptIds?.[image];if(!Number.isInteger(scriptId))return null;
 return COMBAT_SOURCE.actionPrograms?.[`${scriptId}:${slot}:${targetNear?'near':'far'}`]||null;
}

function sizeMultiplier(target,type){
 const size=target?.def?.size||3;
 if(type===1)return [1,.5,.75,1][size]??1;
 if(type===2)return [1,1,.5,.25][size]??1;
 return 1;
}

export function healthDamageAfterArmor(target,damage,type=3,ignoreArmor=false,{minimum=.5}={}){
 if(!(damage>0))return 0;
 if(ignoreArmor||type===4)return damage;
 const afterArmor=damage-Math.max(0,target?.def?.armor||0);
 const scaled=afterArmor*sizeMultiplier(target,type);
 return minimum>0?Math.max(minimum,scaled):Math.max(0,scaled);
}

export function shieldDamageAfterArmor(target,damage,ignoreArmor=false){
 if(!(damage>0))return 0;
 if(ignoreArmor)return damage;
 return Math.max(.5,damage-Math.max(0,target?.def?.shieldArmor||0));
}

export function unitBoundsGap(point,unit,data){
 if(unit?.def?.building){const [w,h]=unit.def.footprint||data.units[unit.type]?.footprint||[64,64];return Math.hypot(Math.max(0,Math.abs(point.x-unit.x)-w/2),Math.max(0,Math.abs(point.y-unit.y)-h/2))}
 const dims=COMBAT_SOURCE.units[unitId(unit)]?.dimensions;
 const left=dims?.left??unit.r??0,right=dims?.right??left,up=dims?.up??unit.r??0,down=dims?.down??up;
 return Math.hypot(Math.max(0,point.x-unit.x-left,unit.x-point.x-right),Math.max(0,point.y-unit.y-up,unit.y-point.y-down));
}

// Mirrors OpenBW's noexpand unit-finder rectangle query using DAT bounds.
export function inNoExpandRect(point,unit,rect,data){
 let left,right,up,down;
 if(unit?.def?.building){const [w,h]=unit.def.footprint||data?.units?.[unit.type]?.footprint||[64,64];left=right=w/2;up=down=h/2}
 else{const dims=COMBAT_SOURCE.units[unitId(unit)]?.dimensions;left=dims?.left??unit.r??0;right=dims?.right??left;up=dims?.up??unit.r??0;down=dims?.down??up}
 const x0=unit.x-left,x1=unit.x+right,y0=unit.y-up,y1=unit.y+down;
 const xEdgeInside=rect.left<=x0&&x0<rect.right||rect.left<=x1&&x1<rect.right;
 return xEdgeInside&&x0<rect.right&&y0<rect.bottom&&y1>=rect.top;
}

export {COMBAT_SOURCE};
