import {COMBAT_SOURCE} from './broodwar-combat-data.js?v=0.16.16';

// Brood War values shared by lane spell selection and combat resolution.
// Times are in simulation seconds (24 frames/second).
export const SPELL_RULES=Object.freeze({
 feedback:{range:320,cost:50},maelstrom:{range:320,cost:100,radius:48,duration:180/24},
 broodlings:{range:288,cost:150},ensnare:{range:288,cost:75,radius:64,duration:75*8/24},
 matrix:{range:320,cost:100,duration:168*8/24,shield:250},emp:{range:256,cost:100,radius:64},
 irradiate:{range:288,cost:75,duration:75*8/24,damage:250,radius:32},
 storm:{range:288,cost:75,radius:48,duration:65/24,damage:14,interval:7/24},
 swarm:{range:288,cost:100,duration:900/24,halfWidth:80,halfHeight:80},plague:{range:288,cost:150,radius:64,duration:75*8/24,damage:300},
 stasis:{range:288,cost:100,radius:48,duration:131*8/24},web:{range:288,cost:125,duration:360/24,halfWidth:60,halfHeight:40},
 lockdown:{range:256,cost:100,duration:131*8/24},yamato:{range:320,cost:150,damage:260},
 mind:{range:256,cost:150},parasite:{range:384,cost:75},hallucinate:{range:224,cost:100,duration:1350/24},
 restore:{range:288,cost:50},flare:{range:288,cost:75},consume:{range:16,cost:0},
});

// UnitType::isRobotic from BWAPI UnitType.cpp. Other Spell TargetFlags are
// represented with the generated units.dat organic/mechanical/building fields.
export const ROBOTIC_UNIT_IDS=new Set([64,69,81,83,84]);
export const BROODLING_TARGET_EXCLUDED=new Set([13,35,36,73,85,97]);
export const MIND_CONTROL_EXCLUDED=new Set([13,35,73,85]);
export const IRRADIATE_DAMAGE_EXCLUDED=new Set([35,36,97]);

export const spellRange=(key)=>SPELL_RULES[key]?.range??320;
export const spellEdgeInRange=(battle,caster,target,key)=>battle.edgeDistance(caster,target)<=spellRange(key);
export function broodlingsTargetValid(target){
 return !!target?.alive&&!target.def.building&&!target.def.air&&!BROODLING_TARGET_EXCLUDED.has(target.type)&&
  !ROBOTIC_UNIT_IDS.has(target.type)&&(!!target.def.organic||!!target.def.mechanical);
}
export function feedbackTargetValid(target){return !!target?.alive&&!target.def.building&&!target.hallucination&&(target.def.energy||0)>0;}
export function mindTargetValid(caster,target){return !!target?.alive&&target.team!==caster.team&&!target.def.building&&!MIND_CONTROL_EXCLUDED.has(target.type);}
export function pointInSpellArea(unit,point,radius){return Math.abs(unit.x-point.x)<=radius&&Math.abs(unit.y-point.y)<=radius;}
export function spellCastTargetValid(key,caster,target){
 if(!target?.alive||target.hidden||target.productionOnly||target.loaded||target.fighter?.docked||target.def?.invincible||target.buffs?.stasis>0)return false;
 if(key==='irradiate')return !target.def.building;
 return true;
}

export function spellAffectedTargetValid(key,target,source=null,{allowLoaded=false}={}){
 if(!target?.alive||target.hidden||target.productionOnly||target.loaded&&!allowLoaded||target.fighter?.docked||target.def?.invincible||target.buffs?.stasis>0)return false;
 if(key==='irradiate')return !!target.def.organic&&!target.def.building&&!IRRADIATE_DAMAGE_EXCLUDED.has(target.type);
 if(key==='plague')return target!==source&&!target.burrowed;
 if(key==='storm')return !target.def.building;
 return true;
}

export function unitRect(unit,data={}){
 if(unit?.def?.building){const [w,h]=unit.def.footprint||data.units?.[unit.type]?.footprint||[64,64];return {left:unit.x-w/2,right:unit.x+w/2,top:unit.y-h/2,bottom:unit.y+h/2}}
 const source=COMBAT_SOURCE.units?.[Number(unit?.sieged?30:unit?.type)]?.dimensions;
 const r=unit?.r||0,left=source?.left??r,right=source?.right??r,up=source?.up??r,down=source?.down??r;
 return {left:unit.x-left,right:unit.x+right,top:unit.y-up,bottom:unit.y+down};
}

export function unitBoundsDistance(a,b,data={}){
 const aa=unitRect(a,data),bb=unitRect(b,data),dx=Math.max(0,aa.left-bb.right,bb.left-aa.right),dy=Math.max(0,aa.top-bb.bottom,bb.top-aa.bottom);
 return Math.hypot(dx,dy);
}

export function spellAreaContains(battle,key,unit,point){
 const rect=unitRect(unit,battle?.data);
 if(key==='storm'){
  const dx=Math.max(rect.left-point.x,0,point.x-rect.right),dy=Math.max(rect.top-point.y,0,point.y-rect.bottom),radius=SPELL_RULES.storm.radius;
  return dx*dx+dy*dy<=radius*radius;
 }
 if(key==='plague')return rect.right>=point.x-64&&rect.left<=point.x+64&&rect.bottom>=point.y-64&&rect.top<=point.y+64;
 return pointInSpellArea(unit,point,SPELL_RULES[key]?.radius??64);
}
