import {BUILDINGS} from './tech.js?v=0.15.0';
import {BUILDING_WAVES,GAS_BUILDING,PRODUCTION_OFFSET,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,DESERT_STRIKE,WAVE_SECONDS,INCOME_SECONDS} from './lane-rules.js?v=0.15.0';

// Operates only through the same placement, prerequisites, payment and completion
// methods as the player. Observations are taken from already deployed waves.
export class LaneAI{
 constructor(battle){this.b=battle;this.cooldown=0;this.observed={air:0,ground:0,heavy:0,melee:0};this.lastBuildAt=0;this.decisions=[];this.reservation=null}
 get buildings(){return this.b.units.filter(u=>u.alive&&u.team===1&&u.productionOnly&&u.def.building)}
 observe(){
  const units=this.b.units.filter(u=>u.alive&&u.team===0&&u.laneArmy&&!u.hidden);
  this.observed={air:units.filter(u=>u.def.air).length,ground:units.filter(u=>!u.def.air).length,heavy:units.filter(u=>u.def.size===3).length,melee:units.filter(u=>!u.def.air&&(this.b.data.weapons[u.def.groundWeapon]?.range||0)<40).length};
 }
 parent(type){const b=this.b,s=BUILDINGS[type];return this.buildings.find(u=>b.ready(u)&&u.type===(s.addon||s.morph)&&(!s.addon||!this.buildings.some(a=>a.parent===u.id)))}
 site(type,parent=null){
  const b=this.b,s=BUILDINGS[type];
  if(s.morph)return parent?{point:parent,reason:''}:null;
  if(s.addon){if(!parent)return null;const p=b.placementForTeam(1,type,b.addonPoint(parent,type));return p.reason?null:p}
  if(s.gas){for(const n of b.nodes.filter(n=>n.team===1&&!n.occupiedBy)){const p=b.placementForTeam(1,type,n);if(!p.reason)return p}return null}
  const [w,h]=b.footprint(type),padding= s.race==='terran'&&[106,113,114,116].includes(type)?64:0;
  for(let y=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+h/2;y<=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT-h/2;y+=32){
   for(let x=PRODUCTION_GROUND_X+w/2;x<=PRODUCTION_GROUND_X+PRODUCTION_GROUND_WIDTH-w/2-padding;x+=32){
    const p=b.placementForTeam(1,type,{x,y});if(p.reason)continue;
    if(padding){const reserved=b.placementForTeam(1,120,{x:x+w/2+32,y});if(reserved.reason)continue}
    return p;
   }
  }
  return null;
 }
 build(type){
  const b=this.b,s=BUILDINGS[type];if(!s||!b.data.units[type])return false;
  const parent=s.addon||s.morph?this.parent(type):null;
  if(b.teamBuildReason(1,type,parent,!!s.morph))return false;
  const site=this.site(type,parent);if(!site)return false;
  const u=b.startConstruction(1,type,site,parent,!!s.morph);if(!u)return false;
  this.lastBuildAt=b.time;this.decisions.push({time:b.time,type,money:b.botMoney});if(this.decisions.length>300)this.decisions.shift();return true;
 }
 nextRequirement(type,seen=new Set()){
  const b=this.b,s=BUILDINGS[type];if(!s||seen.has(type))return null;seen.add(type);
  for(const r of s.requires)if(!b.hasTeam(1,r))return this.buildings.some(u=>u.type===r||u.construction?.nextType===r)?null:this.nextRequirement(r,seen);
  if(s.morph&&!this.parent(type))return this.buildings.some(u=>u.type===s.morph&&u.construction)?null:this.nextRequirement(s.morph,seen);
  if(s.addon&&!this.parent(type))return this.nextRequirement(s.addon,seen);
  return type;
 }
 score(type){
  const b=this.b,groups=BUILDING_WAVES[type],count=this.buildings.filter(u=>u.type===type).length,cost=b.buildingCost(type)[0];
  let score=60/(1+count*.8)+Math.min(20,cost/100);
  for(const {unit,n} of groups.map(g=>({unit:g.unit,n:g.count}))){const d=b.data.units[unit],air=b.data.weapons[d?.airWeapon];if(this.observed.air&&air?.air&&air.damage)score+=Math.min(50,this.observed.air*4);if(this.observed.heavy&&[5,103,83,68,39,12,72].includes(unit))score+=20;if(this.observed.melee&&[2,32,103,83].includes(unit))score+=20}
  return score;
 }
 step(dt){
  this.cooldown-=dt;if(this.cooldown>0)return;this.cooldown=.35;
  const b=this.b,buildings=this.buildings,producers=buildings.filter(u=>BUILDING_WAVES[u.type]),gas=buildings.filter(u=>u.gasNode).length;
  if(buildings.filter(u=>u.construction).length>=2)return;
  const basic={terran:111,zerg:142,protoss:160}[b.enemyRace];
  if(!producers.length){const type=this.nextRequirement(basic);if(type)this.build(type);return}
  // Reserve for the next economy investment only after establishing an army.
  // Payback includes the income lost during the original adjustment counter.
  const desiredGas=b.time>180+gas*240&&producers.length>=2+gas*2&&gas<5;
  if(desiredGas){const type=GAS_BUILDING[b.enemyRace],cost=b.buildingCost(type)[0],payback=(cost+DESERT_STRIKE.gasPenaltyCycles[gas+1]*DESERT_STRIKE.hyperCycleSeconds*b.incomeAmount(1)/INCOME_SECONDS)/((DESERT_STRIKE.income[gas+1]-DESERT_STRIKE.income[gas])/INCOME_SECONDS);
   const pressure=this.b.units.filter(u=>u.alive&&u.team===0&&u.laneArmy&&u.y<640).length;
   if(pressure<8&&payback<1200){this.reservation={type,reason:'income investment',payback};if(this.build(type))this.reservation=null;return}
  }
  const techPlan={terran:[113,114,123,116,117,118,107],zerg:[135,132,141,138,133,140,137,136],protoss:[164,163,165,155,171,167,169,170,159]}[b.enemyRace];
  const desiredTier=Math.min(techPlan.length,Math.floor(b.time/(WAVE_SECONDS*2))+1);
  for(const target of techPlan.slice(0,desiredTier)){
   if(buildings.some(u=>u.type===target||u.construction?.nextType===target)||b.hasTeam(1,target))continue;
   const next=this.nextRequirement(target);if(next){this.reservation={type:next,reason:'technology'};if(this.build(next))this.reservation=null;return}
  }
  const candidates=Object.keys(BUILDING_WAVES).map(Number).filter(type=>BUILDINGS[type]?.race===b.enemyRace).map(type=>({type,parent:this.parent(type)})).filter(({type,parent})=>['','미네랄이 부족합니다.'].includes(b.teamBuildReason(1,type,parent,!!BUILDINGS[type].morph)));
  candidates.sort((a,c)=>this.score(c.type)-this.score(a.type)||a.type-c.type);
  if(candidates[0]){this.reservation={type:candidates[0].type,reason:'production'};if(this.build(candidates[0].type))this.reservation=null}
 }
 snapshot(){
  const b=this.b,buildings=this.buildings,groups=b.activeWave(1),count=[...groups.values()].reduce((n,c)=>n+c,0);
  const spent=b.spendingHistory.filter(s=>s.team===1).reduce((n,s)=>n+s.minerals,0);
  return {wave:b.waveHistory.length+1,time:b.time,race:b.enemyRace,minerals:b.botMoney,income:b.incomeTotal[1],spent,gas:b.completedGasCount(1),production:buildings.filter(u=>BUILDING_WAVES[u.type]&&b.ready(u)).length,tech:buildings.filter(u=>!BUILDING_WAVES[u.type]&&!u.gasNode).length,construction:buildings.filter(u=>u.construction).length,units:count,composition:Object.fromEntries(groups),air:[...groups].reduce((n,[type,c])=>n+(b.data.units[type]?.air?c:0),0),value:[...groups].reduce((n,[type,c])=>n+c*(b.data.units[type]?.cost?.[0]||0),0),idleFor:b.time-this.lastBuildAt,reservation:this.reservation};
 }
}
