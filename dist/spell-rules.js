// Brood War values shared by lane spell selection and combat resolution.
// Times are in simulation seconds (24 frames/second).
export const SPELL_RULES=Object.freeze({
 feedback:{range:320,cost:50},maelstrom:{range:320,cost:100,radius:48,duration:180/24},
 broodlings:{range:288,cost:150},ensnare:{range:288,cost:75,radius:64,duration:75*8/24},
 matrix:{range:320,cost:100,duration:168*8/24,shield:250},emp:{range:256,cost:100,radius:64},
 irradiate:{range:288,cost:75,duration:75*8/24,damage:250,radius:32},
 storm:{range:288,cost:75,radius:48,duration:8*7/24,damage:14,interval:7/24},
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

export const spellRange=(key)=>SPELL_RULES[key]?.range??320;
export const spellEdgeInRange=(battle,caster,target,key)=>battle.edgeDistance(caster,target)<=spellRange(key);
export function broodlingsTargetValid(target){
 return !!target?.alive&&!target.def.building&&!target.def.air&&!BROODLING_TARGET_EXCLUDED.has(target.type)&&
  !ROBOTIC_UNIT_IDS.has(target.type)&&(!!target.def.organic||!!target.def.mechanical);
}
export function feedbackTargetValid(target){return !!target?.alive&&!target.def.building&&!target.hallucination&&(target.def.energy||0)>0;}
export function mindTargetValid(caster,target){return !!target?.alive&&target.team!==caster.team&&!target.def.building&&!MIND_CONTROL_EXCLUDED.has(target.type);}
export function pointInSpellArea(unit,point,radius){return Math.abs(unit.x-point.x)<=radius&&Math.abs(unit.y-point.y)<=radius;}
