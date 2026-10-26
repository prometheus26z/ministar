import {UNIT_UI,ORIGINAL_STAT_LABELS} from './selection-ui-data.js?v=0.16.22';
import {attackHitCount} from './combat-rules.js?v=0.16.22';

const floorNonNegative=value=>Math.floor(Math.max(0,Number(value)||0));
const ceilNonNegative=value=>Math.ceil(Math.max(0,Number(value)||0));
const statLabels=ORIGINAL_STAT_LABELS.labels||{};
const labelText=(value,fallback='')=>String(value||fallback).replace(/\\u000[0-9a-f]/gi,'').replace(/[\u0000-\u001f]/g,'').trim();
const compactValue=(base,bonus)=>`${displayNumber(base)}${Number(bonus)>0?`+${displayNumber(bonus)}`:''}`;
const damageFactorFor=(unit,weaponLabel)=>unit.type===58?1:[10,32,65,77].includes(unit.type)?2:Math.max(1,Number(weaponLabel?.damageFactor)||1);

function resolvedWeapon(battle,unit,air,data){
 if(unit.type===103&&!(unit.burrowed&&unit.lurkerState==='burrowed'))return null;
 let attacker=unit;if(unit.type===72||unit.type===83){const type=unit.type===72?73:85,def=data.units[type];if(def)attacker={...unit,type,baseDef:def,def}}
 const weapon=battle.weapon?.(attacker,{def:{air}});
 return weapon?.damage>0?{weapon,attacker}:null;
}

function displayNumber(value){
 const number=Number(value);
 return Number.isFinite(number)?String(Number(number.toFixed(2))):'0';
}

export function inspectionEnergyMaximum(battle,unit){
 if(!unit)return 0;
 const maximum=Number(unit.maxEnergy??unit.def?.energy??0);
 return Number.isFinite(maximum)?Math.max(0,maximum):0;
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
  const originalWeapon=ORIGINAL_STAT_LABELS.weapons?.[sourceId],factor=damageFactorFor(unit,originalWeapon);
  const upgrade=Number.isInteger(weaponMap.damageUpgrade)?weaponMap.damageUpgrade:null;
  const rawBase=Number.isFinite(weapon.mapDamage)?weapon.mapDamage:Number(data.weapons?.[sourceId]?.damage??weapon.damage),damage=Number(weapon.damage)*factor,baseDamage=rawBase*factor,bonus=Math.max(0,damage-baseDamage),fallbackName=data.weapons?.[sourceId]?.name||(kind==='air'?'공중 공격':'지상 공격'),name=sourceId===79?statLabels['791']:sourceId===82?statLabels['792']:originalWeapon?.name||fallbackName;
  weapons.push({kind,sourceId,icon:weaponMap.icon,level:upgrade===null?0:floorNonNegative(unit.def.combatUpgrades?.[upgrade]),damage,baseDamage,bonus,hits:attackHitCount(attacker,weapon,kind==='air')||1,range:weapon.range||0,name:labelText(name,fallbackName),damageLabel:labelText(statLabels['777'],'공격력:'),suffix:sourceId===103&&unit.type===58?labelText(statLabels['1301'],'로켓 당'):''});
 }
 const armorUpgrade=Number.isInteger(unitMap.armorUpgrade)?unitMap.armorUpgrade:null;
 const armorValue=floorNonNegative(unit.def.armor),armorBase=floorNonNegative(unit.mapDefOverride?.armor??unit.baseDef?.armor??data.units?.[unit.sieged?30:unit.type]?.armor??armorValue),armor=unitMap.armorIcon?{icon:unitMap.armorIcon,level:armorUpgrade===null?0:floorNonNegative(unit.def.combatUpgrades?.[armorUpgrade]),value:armorValue,base:armorBase,bonus:Math.max(0,armorValue-armorBase),title:labelText(ORIGINAL_STAT_LABELS.upgrades?.[armorUpgrade]?.name,'장갑'),valueLabel:labelText(statLabels['778'],'장갑:')}:null;
 const hasShield=Number(unit.def.shield)>0,shield=hasShield?{icon:unitMap.shieldIcon||null,level:floorNonNegative(unit.def.combatUpgrades?.[15]),current:floorNonNegative(unit.shield),max:floorNonNegative(unit.def.shield),armor:floorNonNegative(unit.def.shieldArmor),armorBase:0,armorBonus:floorNonNegative(unit.def.shieldArmor),title:labelText(ORIGINAL_STAT_LABELS.upgrades?.[15]?.name,'프로토스 플라스마 쉴드'),valueLabel:labelText(statLabels['779'],'보호막:')}:null;
 const maxEnergy=inspectionEnergyMaximum(battle,unit);
 const energy=maxEnergy>0?{current:floorNonNegative(unit.energy),max:floorNonNegative(maxEnergy)}:null;
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

export function selectionStatItems(model){
 if(!model)return[];
 const item=(key,title,valueLabel,icon,level,base,bonus,suffix='')=>{
  const valueText=`${valueLabel} ${compactValue(base,bonus)}${suffix?` ${suffix}`:''}`;
  return{key,kind:title,title,icon,level:floorNonNegative(level),valueText,accessibleLabel:`${title} ${valueText}`};
 };
 const items=[];
 if(model.armor)items.push(item('armor',model.armor.title||'장갑',model.armor.valueLabel||labelText(statLabels['778'],'장갑:'),model.armor.icon,model.armor.level,model.armor.base,model.armor.bonus));
 if(model.shield?.icon)items.push(item('shieldArmor',model.shield.title||'프로토스 플라스마 쉴드',model.shield.valueLabel||labelText(statLabels['779'],'보호막:'),model.shield.icon,model.shield.level,model.shield.armorBase,model.shield.armorBonus));
 for(const weapon of model.weapons)items.push(item(`weapon:${weapon.kind}:${weapon.sourceId}`,weapon.name||'공격',weapon.damageLabel||labelText(statLabels['777'],'공격력:'),weapon.icon,weapon.level,weapon.baseDamage,weapon.bonus,weapon.suffix));
 return items;
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
