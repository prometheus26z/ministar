import {UNIT_UI} from './selection-ui-data.js?v=0.16.18';
import {attackHitCount} from './combat-rules.js?v=0.16.18';

const floorNonNegative=value=>Math.floor(Math.max(0,Number(value)||0));
const ceilNonNegative=value=>Math.ceil(Math.max(0,Number(value)||0));

function resolvedWeapon(battle,unit,air,data){
 if(unit.type===103&&!(unit.burrowed&&unit.lurkerState==='burrowed'))return null;
 let attacker=unit;if(unit.type===72||unit.type===83){const type=unit.type===72?73:85,def=data.units[type];if(def)attacker={...unit,type,baseDef:def,def}}
 const weapon=battle.weapon?.(attacker,{def:{air}});
 return weapon?.damage>0?{weapon,attacker}:null;
}

export function selectionPanelModel(battle,unit,data,unitUi=UNIT_UI){
 if(!unit)return null;
 const unitMap=unitUi.units?.[unit.type]||{},weapons=[];
 const ground=resolvedWeapon(battle,unit,false,data),air=resolvedWeapon(battle,unit,true,data);
 for(const [kind,resolved]of [['ground',ground],['air',air]]){
  if(!resolved)continue;const {weapon,attacker}=resolved;
  const sourceId=weapon.sourceWeaponId??weapon.id??unit.def[kind==='air'?'airWeapon':'groundWeapon'];
  if(weapons.some(entry=>entry.sourceId===sourceId))continue;
  const weaponMap=unitUi.weapons?.[sourceId];if(!weaponMap?.icon)continue;
  const upgrade=Number.isInteger(weaponMap.damageUpgrade)?weaponMap.damageUpgrade:null;
  weapons.push({kind,sourceId,icon:weaponMap.icon,level:upgrade===null?0:floorNonNegative(unit.def.combatUpgrades?.[upgrade]),damage:weapon.damage,hits:attackHitCount(attacker,weapon,air)||1,range:weapon.range||0,name:data.weapons?.[sourceId]?.name||(kind==='air'?'공중 공격':'지상 공격')});
 }
 const armorUpgrade=Number.isInteger(unitMap.armorUpgrade)?unitMap.armorUpgrade:null;
 const armor=unitMap.armorIcon?{icon:unitMap.armorIcon,level:armorUpgrade===null?0:floorNonNegative(unit.def.combatUpgrades?.[armorUpgrade]),value:floorNonNegative(unit.def.armor)}:null;
 const hasShield=Number(unit.def.shield)>0,shield=hasShield?{icon:unitMap.shieldIcon||null,level:floorNonNegative(unit.def.combatUpgrades?.[15]),current:floorNonNegative(unit.shield),max:floorNonNegative(unit.def.shield),armor:floorNonNegative(unit.def.shieldArmor)}:null;
 const ownsEnergy=unit.team===0&&(!battle.laneMode||unit.commanderId===0),maxEnergy=Number(unit.maxEnergy??unit.def.energy)||0;
 const energy=ownsEnergy&&maxEnergy>0?{current:floorNonNegative(unit.energy),max:floorNonNegative(maxEnergy)}:null;
 const snapshot=battle.hangarSnapshot?.(unit)||null;
 const hangar=snapshot?.kind==='carrier'?{kind:'carrier',current:snapshot.total,max:snapshot.capacity,active:snapshot.active}:snapshot?.kind==='reaver'?{kind:'reaver',current:snapshot.inside,max:snapshot.capacity,active:snapshot.active}:null;
 const lifespan=Number.isFinite(unit.expiresAt)?Math.max(0,Math.ceil(unit.expiresAt-(battle.time||0))):null;
 const status=[];
 if(unit.buffs?.lockdown>0)status.push('잠금');
 if(unit.buffs?.stasis>0)status.push('정지');
 if(unit.buffs?.maelstrom>0)status.push('메일스트롬');
 if(unit.buffs?.ensnare>0)status.push('인스네어');
 if(unit.buffs?.plague>0)status.push('플레이그');
 if(unit.buffs?.blind>0)status.push('실명');
 if(unit.acidSporeTimers?.length)status.push(`애시드 스포어 ${unit.acidSporeTimers.length}`);
 if(unit.def.building&&!battle.powered?.(unit))status.push('동력 공급 중단');
 if(unit.construction)status.push('건설 중');
 if(unit.egg)status.push('변태 중');
 if(unit.burrowed)status.push(unit.burrowState==='unburrowing'?'잠복 해제 중':'잠복');
 if(unit.cloaked)status.push('은폐');
 if(hangar)status.push(hangar.kind==='carrier'?`인터셉터 ${hangar.current}/${hangar.max}`:`스캐럽 ${hangar.current}/${hangar.max}`);
 return {
  id:unit.id,type:unit.type,name:unit.def.name||data.units?.[unit.type]?.name||'',
  hp:{current:ceilNonNegative(unit.hp),max:ceilNonNegative(unit.maxHp||unit.def.hp)},
  shield,energy,lifespan,status,killCount:unit.def.building?null:floorNonNegative(unit.killCount),
  armor,weapons,hangar,defenseValue:floorNonNegative(unit.def.armor),shieldArmor:shield?.armor??0,
  supply:unit.def.supply||0
 };
}

export function inspectionDetailRows(model){
 if(!model)return[];
 const rows=model.weapons.map(weapon=>({label:weapon.name,value:`${weapon.damage}${weapon.hits>1?` × ${weapon.hits}`:''} · 사거리 ${weapon.range}`}));
 if(model.armor)rows.unshift({label:'방어력',value:String(model.defenseValue)});
 if(model.shield)rows.push({label:'실드 방어력',value:String(model.shieldArmor)});
 if(model.hangar)rows.push({label:model.hangar.kind==='carrier'?'인터셉터':'스캐럽',value:`${model.hangar.current}/${model.hangar.max}${model.hangar.active?` · 비행 ${model.hangar.active}`:''}`});
 if(model.lifespan!==null)rows.push({label:'남은 시간',value:`${model.lifespan}초`});
 return rows;
}
