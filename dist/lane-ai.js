import {BUILDINGS} from './tech.js?v=0.16.0';
import {BUILDING_WAVES,GAS_BUILDING,PRODUCTION_OFFSET,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,DESERT_STRIKE,WAVE_SECONDS,INCOME_SECONDS} from './lane-rules.js?v=0.16.0';

// Operates only through the same placement, prerequisites, payment and completion
// methods as the player. Observations are taken from already deployed waves.
export const AI_PROFILES=Object.freeze({
 easy:Object.freeze({decisionSeconds:3,observationSeconds:WAVE_SECONDS*3,maxConstruction:1,techWaves:4,techStart:2,gasStart:300,gasSpacing:300,gasArmyStep:3,counterWeight:.2,reserve:80}),
 normal:Object.freeze({decisionSeconds:.35,observationSeconds:WAVE_SECONDS,maxConstruction:2,techWaves:2,techStart:0,gasStart:180,gasSpacing:240,gasArmyStep:2,counterWeight:1,reserve:0}),
 hard:Object.freeze({decisionSeconds:.2,observationSeconds:3,maxConstruction:3,techWaves:1.5,techStart:0,gasStart:180,gasSpacing:240,gasArmyStep:2,counterWeight:1.8,reserve:0})
});
export class LaneAI{
 constructor(battle,options={}){this.b=battle;this.team=options.team??1;this.commanderId=options.commanderId??3;this.profile=AI_PROFILES[options.difficulty||battle.difficulty]||AI_PROFILES.normal;this.cooldown=0;this.nextObservation=0;this.observed={air:0,ground:0,heavy:0,melee:0};this.lastBuildAt=0;this.decisions=[];this.reservation=null}
 get buildings(){return this.b.units.filter(u=>u.alive&&u.team===this.team&&u.commanderId===this.commanderId&&u.productionOnly&&u.def.building)}
 observe(){
  if(this.b.time<this.nextObservation)return false;
  this.nextObservation=this.b.time+this.profile.observationSeconds;
  const units=this.b.units.filter(u=>u.alive&&u.team!==this.team&&u.laneArmy&&!u.hidden);
  this.observed={air:units.filter(u=>u.def.air).length,ground:units.filter(u=>!u.def.air).length,heavy:units.filter(u=>u.def.size===3).length,melee:units.filter(u=>!u.def.air&&(this.b.data.weapons[u.def.groundWeapon]?.range||0)<40).length};
  return true;
 }
 parent(type){const b=this.b,s=BUILDINGS[type];return this.buildings.find(u=>b.ready(u)&&u.type===(s.addon||s.morph)&&(!s.addon||!this.buildings.some(a=>a.parent===u.id)))}
 site(type,parent=null){
  const b=this.b,s=BUILDINGS[type];
  if(s.morph)return parent?{point:parent,reason:''}:null;
  if(s.addon){if(!parent)return null;const p=b.placementForTeam(this.team,type,b.addonPoint(parent,type));return p.reason?null:p}
  if(s.gas){for(const n of b.nodes.filter(n=>n.team===this.team&&n.commanderId===this.commanderId&&!n.occupiedBy)){const p=b.placementForTeam(this.team,type,n);if(!p.reason)return p}return null}
  const [w,h]=b.footprint(type),padding= s.race==='terran'&&[106,113,114,116].includes(type)?64:0;
  for(let y=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+h/2;y<=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT-h/2;y+=32){
   for(let x=PRODUCTION_GROUND_X+w/2;x<=PRODUCTION_GROUND_X+PRODUCTION_GROUND_WIDTH-w/2-padding;x+=32){
    const p=b.placementForTeam(this.team,type,{x,y});if(p.reason)continue;
    if(padding){const reserved=b.placementForTeam(this.team,120,{x:x+w/2+32,y});if(reserved.reason)continue}
    return p;
   }
  }
  return null;
 }
 build(type){
  if(this.b.ownerByTeam[this.team]!==this.commanderId)return this.b.withCommander(this.commanderId,()=>this.build(type));
  const b=this.b,s=BUILDINGS[type];if(!s||!b.data.units[type])return false;
  const parent=s.addon||s.morph?this.parent(type):null;
  if(b.teamBuildReason(this.team,type,parent,!!s.morph))return false;
  if(this.buildings.some(u=>BUILDING_WAVES[u.type])&&(this.team?b.botMoney:b.money)-b.buildingCost(type)[0]<this.profile.reserve)return false;
  const site=this.site(type,parent);if(!site)return false;
  const u=b.startConstruction(this.team,type,site,parent,!!s.morph);if(!u)return false;
  this.lastBuildAt=b.time;this.decisions.push({time:b.time,type,money:(this.team?b.botMoney:b.money)});if(this.decisions.length>300)this.decisions.shift();return true;
 }
 nextRequirement(type,seen=new Set()){
  const b=this.b,s=BUILDINGS[type];if(!s||seen.has(type))return null;seen.add(type);
  for(const r of s.requires)if(!b.hasTeam(this.team,r))return this.buildings.some(u=>u.type===r||u.construction?.nextType===r)?null:this.nextRequirement(r,seen);
  if(s.morph&&!this.parent(type))return this.buildings.some(u=>u.type===s.morph&&u.construction)?null:this.nextRequirement(s.morph,seen);
  if(s.addon&&!this.parent(type))return this.nextRequirement(s.addon,seen);
  return type;
 }
 score(type){
  const b=this.b,groups=BUILDING_WAVES[type],count=this.buildings.filter(u=>u.type===type).length,cost=b.buildingCost(type)[0];
  let score=60/(1+count*.8)+Math.min(20,cost/100);
  for(const {unit} of groups){const d=b.data.units[unit],air=b.data.weapons[d?.airWeapon];if(this.observed.air&&air?.air&&air.damage)score+=Math.min(50,this.observed.air*4)*this.profile.counterWeight;if(this.observed.heavy&&[5,103,83,68,39,12,72].includes(unit))score+=20*this.profile.counterWeight;if(this.observed.melee&&[2,32,103,83].includes(unit))score+=20*this.profile.counterWeight}
  return score;
 }
 step(dt){
  if(this.b.ownerByTeam[this.team]!==this.commanderId)return this.b.withCommander(this.commanderId,()=>this.step(dt));
  this.cooldown-=dt;if(this.cooldown>0)return;this.cooldown=this.profile.decisionSeconds;this.observe();
  const b=this.b,buildings=this.buildings,producers=buildings.filter(u=>BUILDING_WAVES[u.type]),gas=buildings.filter(u=>u.gasNode).length;
  if(buildings.filter(u=>u.construction).length>=this.profile.maxConstruction)return;
  const basic={terran:111,zerg:142,protoss:160}[b.raceFor(this.team)];
  if(!producers.length){const type=this.nextRequirement(basic);if(type)this.build(type);return}
  if(b.difficulty==='hard'&&this.observed.air>=3){
   const antiAir=[...b.activeWave(this.team)].reduce((n,[type,count])=>{const weapon=b.data.weapons[b.data.units[type]?.airWeapon];return n+(weapon?.air&&weapon.damage?count:0)},0);
   if(antiAir<this.observed.air*1.3){const target={terran:113,zerg:135,protoss:164}[b.raceFor(this.team)],next=this.nextRequirement(target);if(next){this.reservation={type:next,reason:'observed air counter'};if(this.build(next))this.reservation=null;return}}
  }
  // Reserve for the next economy investment only after establishing an army.
  // Payback includes the income lost during the original adjustment counter.
  const desiredGas=b.time>this.profile.gasStart+gas*this.profile.gasSpacing&&producers.length>=2+gas*this.profile.gasArmyStep&&gas<5;
  if(desiredGas){const type=GAS_BUILDING[b.raceFor(this.team)],cost=b.buildingCost(type)[0],payback=(cost+DESERT_STRIKE.gasPenaltyCycles[gas+1]*DESERT_STRIKE.hyperCycleSeconds*b.incomeAmount(this.team)/INCOME_SECONDS)/((DESERT_STRIKE.income[gas+1]-DESERT_STRIKE.income[gas])/INCOME_SECONDS);
   const pressure=this.b.units.filter(u=>u.alive&&u.team!==this.team&&u.laneArmy&&(this.team?u.y<640:u.y>1408)).length;
   if(pressure<8&&payback<1200){this.reservation={type,reason:'income investment',payback};if(this.build(type))this.reservation=null;return}
  }
  const techPlan={terran:[113,114,123,116,117,118,107],zerg:[135,132,141,138,133,140,137,136],protoss:[164,163,165,155,171,167,169,170,159]}[b.raceFor(this.team)];
  const desiredTier=Math.max(0,Math.min(techPlan.length,Math.floor((b.time/WAVE_SECONDS-this.profile.techStart)/this.profile.techWaves)+1));
  if(b.difficulty==='easy'&&producers.length>=2+Math.floor(b.time/(WAVE_SECONDS*5)))return;
  for(const target of techPlan.slice(0,desiredTier)){
   if(buildings.some(u=>u.type===target||u.construction?.nextType===target)||b.hasTeam(this.team,target))continue;
   const next=this.nextRequirement(target);if(next){this.reservation={type:next,reason:'technology'};if(this.build(next))this.reservation=null;return}
  }
  // Beginner AI expands in small stages rather than flooding the map with
  // cheap buildings while waiting for its next technology decision.
  if(b.difficulty==='easy'&&producers.length>=2+desiredTier)return;
  const candidates=Object.keys(BUILDING_WAVES).map(Number).filter(type=>BUILDINGS[type]?.race===b.raceFor(this.team)&&(techPlan.indexOf(type)<0||techPlan.indexOf(type)<desiredTier)).map(type=>({type,parent:this.parent(type)})).filter(({type,parent})=>['','미네랄이 부족합니다.'].includes(b.teamBuildReason(this.team,type,parent,!!BUILDINGS[type].morph)));
  candidates.sort((a,c)=>this.score(c.type)-this.score(a.type)||a.type-c.type);
  if(candidates[0]){this.reservation={type:candidates[0].type,reason:'production'};if(this.build(candidates[0].type))this.reservation=null}
 }
 snapshot(){
  if(this.b.ownerByTeam[this.team]!==this.commanderId)return this.b.withCommander(this.commanderId,()=>this.snapshot());
  const b=this.b,buildings=this.buildings,groups=b.activeWave(this.team),count=[...groups.values()].reduce((n,c)=>n+c,0);
  const spent=b.spendingHistory.filter(s=>s.team===this.team&&s.commanderId===this.commanderId).reduce((n,s)=>n+s.minerals,0);
  return {wave:b.waveHistory.length+1,time:b.time,race:b.raceFor(this.team),minerals:(this.team?b.botMoney:b.money),income:b.incomeTotal[this.team],spent,gas:b.completedGasCount(this.team),production:buildings.filter(u=>BUILDING_WAVES[u.type]&&b.ready(u)).length,tech:buildings.filter(u=>!BUILDING_WAVES[u.type]&&!u.gasNode).length,construction:buildings.filter(u=>u.construction).length,units:count,composition:Object.fromEntries(groups),air:[...groups].reduce((n,[type,c])=>n+(b.data.units[type]?.air?c:0),0),value:[...groups].reduce((n,[type,c])=>n+c*(b.data.units[type]?.cost?.[0]||0),0),idleFor:b.time-this.lastBuildAt,reservation:this.reservation};
 }
}
