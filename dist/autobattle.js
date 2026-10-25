import {LaneAI} from './lane-ai.js?v=0.16.0';
import {SATISFIES} from './tech.js?v=0.16.0';
import {gasSlots,productionTileAllowed} from './lane-rules.js?v=0.16.0';
import {buildingDestruction} from './presentation.js?v=0.16.0';
import {Battle as EconomyBattle,BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH} from './economy.js?v=0.16.0';
import {clamp,dist} from './core.js?v=0.16.0';
import {DESERT_STRIKE,TECH_IDS,INCOME_SECONDS,BUILDING_WAVES,GAS_BUILDING,GAS_SLOT_X,GAS_SLOT_Y,WAVE_SECONDS,PRODUCTION_OFFSET,PRODUCTION_HEIGHT,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y,constructionSeconds,buildingCost} from './lane-rules.js?v=0.16.0';
export {BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH};
export {WAVE_SECONDS,PRODUCTION_OFFSET,PRODUCTION_HEIGHT,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y};
export const ENEMY_RACES=Object.freeze(['terran','zerg','protoss']);
export function randomEnemyRace(random=Math.random){return ENEMY_RACES[Math.min(2,Math.max(0,Math.floor(random()*3)))]}

export class Battle extends EconomyBattle{
 constructor(data,options={}){
  super(data,options);
  this.laneMode=true;
  this.map.elevation=false;this.map.water=[];this.map.rocks=[{x:0,y:640,w:256,h:768},{x:1024,y:640,w:256,h:768}];
  this.phase='title';
  this.timeLimit=Infinity;
  this.waveClock=WAVE_SECONDS;
  this.botMoney=DESERT_STRIKE.startingMinerals;
  this.botGas=0;
  this.builder=null;
  this.wrecks=[];this.outpostDefenses=[[],[]];this.incomeRemaining=[INCOME_SECONDS,INCOME_SECONDS];this.gasInvestmentLevel=[0,0];
  this.menuMode='build';
  this.teamSize=[1,2,3].includes(Number(options.teamSize))?Number(options.teamSize):1;this.random=options.random||Math.random;this.ownerByTeam=[0,3];this.commanders=[];this.commanderScopeDepth=0;this.commanderEvents=[];
  this.enemyRace=ENEMY_RACES.includes(options.enemyRace)?options.enemyRace:randomEnemyRace(options.random);
  this.ai=new LaneAI(this);this.waveHistory=[];this.incomeTotal=[0,0];this.spendingHistory=[];this.specialStates=[{},{}];this.evolutionBonus=[false,false];this.baseWarnings=[false,false];this.gasDelayApplied=[new Set(),new Set()];
 }
 get battleTimeScale(){return 1}
 get timeScale(){return 1}
 powered(unit){if(unit?.sourceProducer)return this.units.some(u=>u.id===unit.sourceProducer&&this.ready(u));if(unit?.productionOnly&&unit.def.race==='protoss')return true;return super.powered(unit)}
 get nextWave(){return Math.max(0,this.waveClock)}
 get supply(){return this.allies.filter(u=>u.commanderId===0&&!u.hidden&&!u.def.building&&!u.egg).reduce((n,u)=>n+u.def.supply,0)}
 supplyCap(team=0){return Math.min(200,this.units.filter(u=>u.alive&&u.team===team&&u.commanderId===this.ownerByTeam[team]&&this.ready(u)).reduce((n,u)=>n+(this.race==='zerg'&&[131,132,133].includes(u.type)?10:BUILDINGS[u.type]?.supply||(u.type===42?8:0)),0))}
 armySupply(team=0){return this.units.filter(u=>u.alive&&u.team===team&&!u.hidden&&!u.def.building&&!u.egg).reduce((n,u)=>n+u.def.supply,0)}
 refreshSupply(){this.maxSupply=this.supplyCap(0)}
 canSee(){return true}
 updateVision(){this.fog.fill(1);this.explored.fill(1)}
 get inspectedUnit(){return this.units.find(u=>u.id===this.inspectedId&&u.alive&&!u.hidden&&!u.loaded&&this.canSee(0,u))||null}
 isHighlighted(u){return this.selection.includes(u.id)||this.inspectedId===u.id&&this.inspectedUnit===u}
 select(ids,voice=true){this.inspectedId=null;return super.select(ids.filter(id=>{const u=this.units.find(a=>a.id===id);return u?.alive&&u.team===0&&!u.hidden&&(!u.productionOnly||u.commanderId===0)}),voice)}
 inspect(unit){
  if(!unit?.alive||unit.hidden||unit.loaded||!this.canSee(0,unit))return false;
  const own=unit.team===0&&(!unit.productionOnly||unit.commanderId===0);this.select(own?[unit.id]:[],false);
  if(!own){this.inspectedId=unit.id;this.emit('selection')}
  return true;
 }
 openMenu(mode='build'){
  if(this.phase!=='battle')return false;
  this.menuMode=mode;this.menuOpen=true;this.targeting=null;this.emit('menu');return true;
 }
 begin(){
  if(this.phase!=='title')return false;
  this.phase='battle';this.paused=false;this.time=0;this.timeLeft=Infinity;this.ownerByTeam=[0,3];this.commanders=[];
  this.units=[];this.projectiles=[];this.areas=[];this.effects=[];this.nodes=[];this.wrecks=[];this.outpostDefenses=[[],[]];
  this.ai=new LaneAI(this);this.waveHistory=[];this.incomeTotal=[0,0];this.spendingHistory=[];this.specialStates=[{},{}];this.evolutionBonus=[false,false];this.baseWarnings=[false,false];this.gasDelayApplied=[new Set(),new Set()];
  this.money=DESERT_STRIKE.startingMinerals;this.gas=0;this.botMoney=DESERT_STRIKE.startingMinerals;this.botGas=0;this.maxSupply=200;
  this.produced=0;this.kills=0;this.losses=0;this.damageDone=0;this.waveClock=WAVE_SECONDS;
  const player=this.installSide(0),enemy=this.installSide(1);
  this.main=player.main;this.core=enemy.main;this.builder=this.create(WORKER[this.race],0,640,1930);this.builder.hidden=true;
  this.builder.completed=true;this.builder.order='stop';this.enemyMain=enemy.main;
  this.playerOutpost=player.outpost;this.enemyOutpost=enemy.outpost;
  for(const team of [0,1])for(const node of gasSlots(team))this.addGasNode(team,node.x,node.y,node.slot);
  for(const team of [0,1]){const town=this.create(BASE[this.raceFor(team)],team,640,PRODUCTION_OFFSET+1056);town.productionOnly=true;town.startingBase=true;}
  this.installDefenses(0,player);this.installDefenses(1,enemy);
  this.incomeRemaining=[INCOME_SECONDS,INCOME_SECONDS];this.gasInvestmentLevel=[0,0];for(const [key,id]of Object.entries(TECH_IDS))if(DESERT_STRIKE.technologies[id]?.researched)this.researched.add(key);this.installCommanders();this.refreshSupply();this.updateVision();this.select([],false);this.emit('phase');this.emit('change');return true;
 }
 emit(type,rest={}){if(this.commanderScopeDepth){this.commanderEvents.push([type,rest]);return}return super.emit(type,rest)}
 commanderIdFor(team,slot=0){return team*3+slot}
 ownsProduction(u,team){return !!u.productionOnly&&u.team===team&&u.commanderId===this.ownerByTeam[team]}
 installCommanders(){
  this.commanders=[{id:0,team:0,slot:0,race:this.race,human:true,difficulty:'normal'},{id:3,team:1,slot:0,race:this.enemyRace,human:false,difficulty:this.difficulty,ai:this.ai}];
  for(let slot=1;slot<this.teamSize;slot++)for(const team of [0,1]){
   const c={id:this.commanderIdFor(team,slot),team,slot,race:randomEnemyRace(this.random),human:false,difficulty:team?this.difficulty:'normal',economy:{minerals:300,gas:0,incomeRemaining:INCOME_SECONDS,gasInvestmentLevel:0,incomeTotal:0,gasDelayApplied:new Set(),specialStates:{},evolutionBonus:false}};
   c.ai=new LaneAI(this,{team,commanderId:c.id,difficulty:c.difficulty});this.commanders.push(c);
   this.withCommander(c.id,()=>{for(const n of gasSlots(team))this.addGasNode(team,n.x,n.y,n.slot);const base=this.create(BASE[c.race],team,640,PRODUCTION_OFFSET+1056);base.productionOnly=true;base.startingBase=true});
  }
  this.commanders.sort((a,b)=>a.id-b.id);
 }
 withCommander(id,fn){
  const c=this.commanders.find(c=>c.id===id);if(!c||c.slot===0)return fn();
  const team=c.team,keys=['incomeRemaining','gasInvestmentLevel','incomeTotal','gasDelayApplied','specialStates','evolutionBonus'],moneyKey=team?'botMoney':'money',gasKey=team?'botGas':'gas',raceKey=team?'enemyRace':'race';
  const saved={owner:this.ownerByTeam[team],money:this[moneyKey],gas:this[gasKey],race:this[raceKey],difficulty:this.difficulty,maxSupply:this.maxSupply,arrays:{}};
  this.ownerByTeam[team]=id;this[moneyKey]=c.economy.minerals;this[gasKey]=c.economy.gas;this[raceKey]=c.race;this.difficulty=c.difficulty;
  for(const key of keys){saved.arrays[key]=this[key];this[key]=[...this[key]];this[key][team]=c.economy[key]}
  this.commanderScopeDepth++;try{return fn()}finally{
   c.economy.minerals=this[moneyKey];c.economy.gas=this[gasKey];for(const key of keys){c.economy[key]=this[key][team];this[key]=saved.arrays[key]}
   this.ownerByTeam[team]=saved.owner;this[moneyKey]=saved.money;this[gasKey]=saved.gas;this[raceKey]=saved.race;this.difficulty=saved.difficulty;this.maxSupply=saved.maxSupply;
   this.commanderScopeDepth--;if(!this.commanderScopeDepth){const events=this.commanderEvents;this.commanderEvents=[];for(const [type,rest]of events)super.emit(type,rest)}
  }
 }
 commanderWave(id,buildingId=null){const c=this.commanders.find(c=>c.id===id);return c?this.withCommander(id,()=>this.activeWave(c.team,buildingId)):new Map()}
 commanderSnapshot(id){const c=this.commanders.find(c=>c.id===id);if(!c)return null;return this.withCommander(id,()=>({id,team:c.team,slot:c.slot,race:c.race,human:c.human,minerals:c.team?this.botMoney:this.money,income:this.incomeTotal[c.team],gas:this.completedGasCount(c.team),units:[...this.activeWave(c.team).values()].reduce((n,v)=>n+v,0),production:this.waveProducers(c.team).length}))}
 raceFor(team){return team?this.enemyRace:this.race}
 create(type,team,x,y){const u=super.create(type,team,x,y);if(!u)return u;u.commanderId=this.ownerByTeam?.[team]??team*3;const override=DESERT_STRIKE.unitOverrides?.[type];if(override){u.def={...u.def,...override,shield:u.def.shield?override.shield:0};u.hp=u.maxHp=override.hp;u.shield=u.def.shield}return u}
 installSide(team){
  const main=this.create(173,team,640,team?160:1888);main.isMain=true;main.order='hold';main.hp=main.maxHp=30000;
  const outpost=this.create(174,team,640,team?480:1568);outpost.isOutpost=true;outpost.order='hold';outpost.hp=outpost.maxHp=15000;
  return {main,outpost,team};
 }
 addGasNode(team,x,y,slot){this.nodes.push({id:`geyser-${this.ownerByTeam[team]}-${slot}`,team,commanderId:this.ownerByTeam[team],slot,x,y,r:36,kind:'gas',amount:5000,miner:null,occupiedBy:null})}
 buildingCost(type){return buildingCost(this.race,type,this.data)}
 constructionSeconds(type){return constructionSeconds(this.data,type)}
 waveUnitsForBuilding(type){return BUILDING_WAVES[type]||null}
 laneObjective(team){const enemy=1-team,outpost=this.outpostDefenses[enemy].find(u=>u.alive);return outpost?{id:`outpost-${enemy}`,x:640,y:outpost.y}:team===0?this.core:this.main}
 completedGasCount(team){return this.units.filter(u=>u.alive&&this.ownsProduction(u,team)&&u.gasNode&&this.ready(u)).length}
 incomeAmount(team=0){return DESERT_STRIKE.income[Math.min(5,this.completedGasCount(team))]}
 get incomePauseLeft(){return Math.max(0,this.incomeRemaining[0]-INCOME_SECONDS)}
 tickIncome(dt,teams=[0,1]){
  for(const team of teams){
   const count=this.completedGasCount(team);
   this.gasInvestmentLevel[team]=Math.max(this.gasInvestmentLevel[team],count);
   if(count>=2&&!this.gasDelayApplied[team].has(count)){this.gasDelayApplied[team].add(count);this.incomeRemaining[team]+=DESERT_STRIKE.gasPenaltyCycles[count]*DESERT_STRIKE.hyperCycleSeconds}
   this.incomeRemaining[team]-=dt;
   while(this.incomeRemaining[team]<=1e-9){const amount=this.incomeAmount(team);if(team===0)this.money+=amount;else this.botMoney+=amount;this.incomeRemaining[team]+=INCOME_SECONDS;this.incomeTotal[team]+=amount;this.emit('income',{team,commanderId:this.ownerByTeam[team],minerals:amount})}
  }
 }
 waveProducers(team){return this.units.filter(u=>u.alive&&this.ownsProduction(u,team)&&u.def.building&&this.ready(u)&&!u.flying&&BUILDING_WAVES[u.type])}
 waveGroups(producer,poolsRemaining=1){
  if(producer.type===142&&poolsRemaining>=DESERT_STRIKE.poolBonusThreshold[producer.team])return[{unit:37,count:DESERT_STRIKE.poolBonusCount}];
  return this.waveUnitsForBuilding(producer.type)||[];
 }
 activeWave(team=0,buildingId=null){
  const counts=new Map(),producers=this.waveProducers(team);let poolsRemaining=producers.filter(u=>u.type===142).length;
  for(const u of producers){const groups=this.waveGroups(u,poolsRemaining);if(u.type===142)poolsRemaining--;if(buildingId!==null&&u.id!==buildingId)continue;for(const {unit,count}of groups)counts.set(unit,(counts.get(unit)||0)+count)}return counts;
 }
 releaseGasSlot(unit){const node=this.nodes.find(n=>n.id===unit?.gasNode);if(node?.occupiedBy===unit.id)node.occupiedBy=null}
 spawnLarva(){return null}
 productionOptions(unit){if(unit?.type===142)return[37];return super.productionOptions(unit).filter(type=>type!==WORKER[this.race])}
 installDefenses(team,side){this.outpostDefenses[team].push(side.outpost)}
 makeBunker(team,x,y){
  const bunker=this.create(125,team,x,y);bunker.order='hold';bunker.isFortification=true;bunker.garrison=[0,0,0,32];bunker.garrisonClock=0;
  return bunker;
 }
 makeTower(team,type,x,y){
  const u=this.create(type,team,x,y);u.order='hold';u.isFortification=true;u.hp=u.maxHp=Math.max(u.maxHp,380);
  if(this.race==='terran')u.def={...u.def,groundWeapon:80,airWeapon:81,sight:400,armor:1};
  return u;
 }
 hasTeam(team,type){return this.units.some(u=>this.ownsProduction(u,team)&&this.ready(u)&&(SATISFIES[type]||[Number(type)]).includes(u.type))}
 teamBuildReason(team,type,parent=null,morph=false){
  const spec=BUILDINGS[type];if(!spec||spec.race!==this.raceFor(team))return '건설할 수 없는 건물입니다.';
  const count=this.units.filter(u=>u.alive&&this.ownsProduction(u,team)&&(u.type===type||u.construction?.nextType===type)).length;
  if(count>=(DESERT_STRIKE.maxBuildings[type]??Infinity))return '건설 한도에 도달했습니다.';
  if(spec.gas&&this.units.filter(u=>u.alive&&this.ownsProduction(u,team)&&u.gasNode).length>=5)return '가스 시설은 최대 5개입니다.';
  if(spec.addon&&(!this.ready(parent)||!this.ownsProduction(parent,team)||parent.type!==spec.addon))return '부착할 건물을 선택하세요.';
  if(spec.addon&&this.units.some(u=>u.alive&&u.parent===parent.id))return '이미 부속 건물이 있습니다.';
  if(spec.morph&&(!morph||!this.ready(parent)||!this.ownsProduction(parent,team)||parent.type!==spec.morph))return '변태할 건물을 선택하세요.';
  const requires=[...spec.requires,...(DESERT_STRIKE.specials[type]?.requires||[])],missing=requires.filter(id=>!this.hasTeam(team,id));
  if(missing.length)return '필요: '+missing.map(id=>this.data.units[id]?.name||id).join(', ');
  const money=team?this.botMoney:this.money;return money<this.buildingCost(type)[0]?'미네랄이 부족합니다.':'';
 }
 buildReason(worker,type){return this.teamBuildReason(0,Number(type))}
 placementForTeam(team,type,point,parent=null){
  const size=this.footprint(type),spec=BUILDINGS[type],p={x:Math.round((point.x-size[0]/2)/32)*32+size[0]/2,y:Math.round((point.y-PRODUCTION_OFFSET-size[1]/2)/32)*32+size[1]/2+PRODUCTION_OFFSET};
  let gasNode=null;
  if(spec?.gas){gasNode=this.nodes.find(n=>n.team===team&&n.commanderId===this.ownerByTeam[team]&&!n.occupiedBy&&dist(n,point)<56);if(!gasNode)return {point:p,reason:'비어 있는 가스 지점에 건설하세요.'};p.x=gasNode.x;p.y=gasNode.y}
  for(let y=p.y-size[1]/2+16;y<p.y+size[1]/2;y+=32)for(let x=p.x-size[0]/2+16;x<p.x+size[0]/2;x+=32)if(!productionTileAllowed(x,y,team))return {point:p,reason:'건설할 수 없는 지형입니다.'};
  for(const u of this.units)if(u.alive&&this.ownsProduction(u,team)&&u.def.building&&u!==parent){const [w,h]=this.footprint(u.type);if(Math.abs(u.x-p.x)<(w+size[0])/2&&Math.abs(u.y-p.y)<(h+size[1])/2)return {point:p,reason:'건물이 겹칩니다.'}}
  for(const n of this.nodes)if(n.team===team&&n.commanderId===this.ownerByTeam[team]&&n!==gasNode&&Math.abs(n.x-p.x)<(128+size[0])/2&&Math.abs(n.y-p.y)<(64+size[1])/2)return {point:p,reason:'가스 지점과 겹칩니다.'};
  return {point:p,reason:'',gasNode};
 }
 placement(worker,type,point){const reason=this.buildReason(worker,Number(type));return reason?{point,reason}:this.placementForTeam(0,Number(type),point)}
 startConstruction(team,type,result,parent=null,morph=false){
  const reason=this.teamBuildReason(team,type,parent,morph);if(reason||result.reason)return false;
  const def=this.data.units[type],cost=this.buildingCost(type);if(team)this.botMoney-=cost[0];else this.money-=cost[0];
  this.spendingHistory.push({time:this.time,team,commanderId:this.ownerByTeam[team],type,minerals:cost[0]});
  if(morph){parent.completed=false;parent.construction={time:0,total:this.constructionSeconds(type),started:true,cost:[...cost],original:{type:parent.type,hp:parent.hp,shield:parent.shield},nextType:type};return parent}
  const u=this.create(type,team,result.point.x,result.point.y);u.completed=false;u.hp=Math.max(1,u.maxHp*.1);u.shield=u.def.shield*.1;u.productionOnly=true;
  u.parent=parent?.id||(team?'bot-builder':'lane-builder');u.construction={time:0,total:this.constructionSeconds(type),builder:null,started:true,cost:[...cost],original:null};
  u.gasNode=result.gasNode?.id;if(result.gasNode)result.gasNode.occupiedBy=u.id;return u;
 }
 build(worker,type,point){type=Number(type);const result=this.placement(worker,type,point);if(result.reason)return this.fail(result.reason);if(!this.startConstruction(0,type,result))return false;this.closeMenu();this.emit('change');return true}

 morphReason(unit,type){return this.teamBuildReason(0,Number(type),unit,true)}
 morph(unit,type){type=Number(type);const reason=this.morphReason(unit,type);if(reason)return this.fail(reason);const u=this.startConstruction(0,type,{point:unit,reason:''},unit,true);if(u){this.closeMenu();this.emit('change')}return !!u}
 addonOptions(unit){return Object.keys(BUILDINGS).map(Number).filter(id=>BUILDINGS[id].addon===unit?.type)}
 addonPoint(parent,type){const [w]=this.footprint(parent.type),[aw]=this.footprint(type);return{x:parent.x+w/2+aw/2,y:parent.y}}
 addonReason(parent,type){const reason=this.teamBuildReason(0,Number(type),parent);return reason||this.placementForTeam(0,Number(type),this.addonPoint(parent,type)).reason}
 addon(parent,type){type=Number(type);const reason=this.addonReason(parent,type);if(reason)return this.fail(reason);const u=this.startConstruction(0,type,this.placementForTeam(0,type,this.addonPoint(parent,type)),parent);if(u){this.closeMenu();this.emit('change')}return !!u}

 cancel(unit,index=0){if(unit?.productionOnly&&unit.commanderId!==0)return false;if(unit?.team===0&&unit.construction)this.releaseGasSlot(unit);return super.cancel(unit,index)}
 execute(command,point=null,target=null){
  if(command.startsWith('build:'))return this.build(this.builder,Number(command.split(':')[1]),point);
  return false;
 }
 trainReason(){return '유닛은 완성된 건물에 지정된 편성으로 출격합니다.'}
 train(){return this.fail('출격 편성은 건물에 따라 자동으로 정해집니다.')}
 setAutoProduction(){return this.fail('출격 유닛은 건물에 따라 자동으로 정해집니다.')}
 researchOptions(){return []}
 researchReason(unit,key){return this.researched.has(key)?'원본 맵에서 이미 연구된 기술입니다.':'원본 맵에서 사용할 수 없는 연구입니다.'}
 research(unit,key){return this.fail(this.researchReason(unit,key))}
 formationGoal(u,objective){return{x:clamp(objective.x+(u.laneOffset||0),352,928),y:objective.y}}
 setAdvanceGoal(u,objective){
  const goal=this.formationGoal(u,objective),direction=u.team?1:-1,end={x:goal.x,y:goal.y-direction*128};
  // A shared open corridor needs no per-soldier A* search. Verify every tile
  // before using this route; blocked approach routes retain the pathfinder.
  const clear=(a,b)=>{const length=dist(a,b),steps=Math.max(1,Math.ceil(length/32));for(let i=0;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(!u.def.air&&this.map.blocked(p.x,p.y,u.r*.55))return false}return true};
  const turn={x:goal.x,y:u.y};
  if(clear(u,turn)&&clear(turn,end)){
   u.goal=goal;u.path=[turn,end];u.order='attackmove';u.target=null;u.combatMoving=false;u.attackPathTarget=null;u.attackPath=[];u.attackRetries=0;u.aiClock=0;u.stuck=0;
  }else this.setGoal(u,goal,'attackmove');
 }

 deploymentPoint(def,team,point,spacing=32,ignore=null){
  const clearance=Math.max(20,(def.radius||10)*.55),direction=team?1:-1;
  const free=p=>{
   if(p.x<clearance||p.x>1280-clearance||p.y<clearance||p.y>2048-clearance)return false;
   if(!def.air&&(this.map.blocked(p.x,p.y,clearance)||this.map.blocked(Math.floor(p.x/32)*32+16,Math.floor(p.y/32)*32+16,clearance)))return false;
   return !this.units.some(u=>u!==ignore&&u.alive&&!u.hidden&&!u.loaded&&!u.productionOnly&&!u.def.building&&u.def.air===def.air&&dist(u,p)<((u.r+(def.radius||10))*.85+2));
  };
  // Preserve each column, moving its spawn forward out of the HQ/tower footprints.
  for(let offset=0;offset<=2048;offset+=Math.max(32,spacing)){const p={x:point.x,y:point.y+direction*offset};if(free(p))return p}
  // Large waves may fill a column; use another clear lane rather than overlap a building.
  for(let y=team?32:2016;team?y<2048:y>0;y+=direction*32)for(let dx=0;dx<640;dx+=32)for(const sign of [1,-1]){const p={x:640+dx*sign,y};if(free(p))return p}
  return null;
 }
 spawnUnit(type,team,index,total,origin,spacing=32){
  const def=this.data.units[type];if(!def)return null;
  const cap=DESERT_STRIKE.maxActiveUnits[type];if(cap&&this.units.filter(u=>u.alive&&u.team===team&&u.type===type&&!u.productionOnly).length>=cap)return null;
  const columns=Math.min(8,Math.max(1,Math.floor(448/spacing)),total),row=Math.floor(index/columns),rowCount=Math.min(columns,total-row*columns),direction=team?1:-1;
  const spread=(index%columns-(rowCount-1)/2)*spacing;
  const point=this.deploymentPoint(def,team,{x:640+spread,y:clamp(origin.y+direction*120-direction*row*spacing,24,2024)},spacing);if(!point)return null;
  const u=this.create(type,team,point.x,point.y);
  u.order='attackmove';u.laneArmy=true;u.laneOffset=spread;const objective=this.laneObjective(team);this.setAdvanceGoal(u,objective);u.laneObjectiveId=objective.id;
  const prop=DESERT_STRIKE.properties[type===103?2:3];if(prop){u.hp=u.maxHp*prop.hp/100;u.shield=u.def.shield*prop.shield/100;u.energy=(u.def.energy||0)*prop.energy/100;if(prop.specialValid&2)u.burrowed=!!(prop.status&2)}
  if(team===0)this.produced++;return u;
 }
 spawnWave(team){
  const lineup=[];for(const [type,count]of this.activeWave(team))for(let i=0;i<count;i++)lineup.push(type);
  const origin={x:640,y:team?this.core.y:this.main.y},spacing=Math.max(32,...lineup.map(type=>(this.data.units[type]?.radius||10)*2.4));
  const direction=team?1:-1,columns=Math.min(8,Math.max(1,Math.floor(448/spacing)),lineup.length);
  for(let offset=0;offset<1024;offset+=32){
   const clear=lineup.slice(0,columns).every((type,index)=>{const point={x:640+(index-(columns-1)/2)*spacing,y:origin.y+direction*(120+offset)},p=this.deploymentPoint(this.data.units[type],team,point,spacing);return p&&p.x===point.x&&p.y===point.y});
   if(clear){origin.y+=direction*offset;break}
  }
  lineup.forEach((type,index)=>this.spawnUnit(type,team,index,lineup.length,origin,spacing));
 }
 botBuild(plan){return this.ai.build(plan.type)}
 botBuildGas(){return this.ai.build(GAS_BUILDING[this.enemyRace])}
 botStep(dt){this.ai.step(dt)}
 tickBotConstruction(u,dt){
  const c=u.construction;if(!c)return false;
  u.animTime+=dt;c.time=Math.min(c.total,c.time+dt);const def=this.data.units[c.nextType||u.type];
  if(!c.original){u.hp=Math.min(u.maxHp,u.hp+u.maxHp*.9*dt/c.total);u.shield=Math.min(u.def.shield,u.shield+u.def.shield*.9*dt/c.total)}
  if(c.time>=c.total){if(c.nextType){u.type=c.nextType;u.def=this.data.units[u.type];u.maxHp=u.def.hp;u.hp=u.maxHp;u.shield=u.def.shield}u.completed=true;u.construction=null;u.action='idle';this.deployDefense(u);this.emit('change')}
  return true;
 }
 deployDefense(u){
  if(!u.productionOnly||![124,125,144,146,162].includes(u.type)||u.deployedDefenseId)return;
  const direction=u.team?1:-1,base=u.team?this.core:this.main;
  const point=[440,840,312,968].flatMap(x=>[112,256,368].map(offset=>({x,y:base.y+direction*offset}))).find(p=>!this.map.blocked(p.x,p.y,56));
  if(!point)return;
  const defense=u.type===125?this.makeBunker(u.team,point.x,point.y):this.create(u.type,u.team,point.x,point.y);
  defense.isFortification=true;defense.order='hold';defense.sourceProducer=u.id;u.deployedDefenseId=defense.id;
 }
 tickSpecials(dt,teams=[0,1]){
  for(const team of teams){
   for(const u of this.units.filter(u=>this.ownsProduction(u,team)&&this.ready(u))){
    if(u.type===139&&!this.evolutionBonus[team]){this.evolutionBonus[team]=true;if(team)this.botMoney+=100;else this.money+=100;this.incomeTotal[team]+=100}
    const spec=DESERT_STRIKE.specials[u.type];if(!spec||this.specialStates[team][spec.effect])continue;
    const enemies=this.units.filter(t=>t.alive&&t.team!==team&&!t.productionOnly&&!t.def.building&&!t.hidden&&!t.loaded);
    if(spec.requires?.some(id=>!this.hasTeam(team,id)))continue;
    this.specialStates[team][spec.effect]={clock:0,pulses:0};u.refunded=true;this.die(u,1-team);
    if(spec.effect==='mind'){enemies.forEach((t,i)=>{if(i%2===0){t.team=team;t.commanderId=this.ownerByTeam[team];t.target=null;t.laneArmy=true;this.setAdvanceGoal(t,this.laneObjective(team))}});delete this.specialStates[team].mind}
    if(spec.effect==='broodlings'){for(const target of enemies){const p={x:target.x,y:target.y};this.die(target,team);const point=this.deploymentPoint(this.data.units[40],team,p);if(point){const a=this.create(40,team,point.x,point.y);a.laneArmy=true;a.expiresAt=this.time+1800/24;this.setAdvanceGoal(a,this.laneObjective(team))}}delete this.specialStates[team].broodlings}
    this.emit('notice',{text:spec.effect==='heal'?'Heal & Repair!':spec.effect==='mind'?'Mind Control!':'Broodling!'})
   }
   const state=this.specialStates[team].heal;if(state){state.clock+=dt;const interval=DESERT_STRIKE.specials[115].intervalCycles*DESERT_STRIKE.hyperCycleSeconds;while(state.clock>=interval&&state.pulses<45){state.clock-=interval;state.pulses++;for(const u of this.units)if(u.alive&&u.team===team&&!u.def.building&&!u.productionOnly)u.hp=u.maxHp}if(state.pulses>=45)delete this.specialStates[team].heal}
  }
 }
 checkBaseWarning(){for(const team of [0,1]){const near=this.units.some(u=>u.alive&&u.team!==team&&u.laneArmy&&!u.productionOnly&&(team?u.y<640:u.y>1408));if(near&&!this.baseWarnings[team]&&team===0)this.emit('notice',{text:'경고: 적 병력이 기지에 접근합니다.'});this.baseWarnings[team]=near}}

 maintainAdvance(u,dt){
  const objective=this.laneObjective(u.team),previous=u.laneCheckpoint;
  u.laneStall=previous&&dist(u,previous)<Math.max(.1,u.def.speed*dt*.1)?(u.laneStall||0)+dt:0;u.laneCheckpoint={x:u.x,y:u.y};
  const immobilized=u.sieged||u.burrowed||u.buffs.lockdown>0||u.buffs.stasis>0||u.buffs.maelstrom>0;
  if(immobilized)return;
  const idle=!u.goal&&!u.combatMoving&&!u.target&&!u.healTarget&&dist(u,objective)>120,stalled=u.laneStall>.9&&!u.combatMoving&&!u.target&&!u.healTarget&&!['attack','airAttack','cast'].includes(u.action)&&dist(u,objective)>120;
  if(objective?.id!==u.laneObjectiveId||idle||stalled){
   if(!u.def.air&&this.map.blocked(u.x,u.y,u.r*.55)){const p=this.deploymentPoint(u.def,u.team,u,32,u);if(p){u.x=p.x;u.y=p.y}}
   u.laneObjectiveId=objective.id;this.setAdvanceGoal(u,objective);u.laneStall=0;
  }
 }
 tickUnit(u,dt){
  if(!u.alive)return super.tickUnit(u,dt);
  if(u.expiresAt&&this.time>=u.expiresAt){this.die(u,1-u.team);return}
  if(u.hidden){u.animTime+=dt;return}
  if(u.productionOnly){if(u.construction)this.withCommander(u.commanderId,()=>this.tickBotConstruction(u,dt));else if(!u.def.building&&!u.hidden)u.animTime+=dt;return}
  if(u.team===1&&u.construction){this.tickBotConstruction(u,dt);return}
  if(!u.def.building&&u.laneArmy)this.maintainAdvance(u,dt);
  if(!u.def.building&&!u.loaded)this.autoCast(u);
  super.tickUnit(u,dt);
 }
 weapon(u,target){
  if(target.productionOnly||u.productionOnly||u.garrison)return null;
  if(u.laneArmy&&!target.def.building&&Math.abs(target.x-640)>240&&dist(u,target)>96)return null;
  if(u.isFortification&&this.raceFor(u.team)==='terran'){
   const weapon=this.data.weapons[target.def.air?u.def.airWeapon:u.def.groundWeapon];
   return weapon&&weapon.damage&&(!target.def.air||weapon.air)&& (target.def.air||weapon.ground)?weapon:null;
  }
  return super.weapon(u,target);
 }
 autoCast(u){
  const abilities=this.availableAbilities(u);if(!abilities.length)return;
  if(abilities.includes('stim')&&u.buffs.stim<=0&&u.hp>20&&this.units.some(t=>t.alive&&t.team!==u.team&&dist(u,t)<160))this.cast(u,'stim');
  if(abilities.includes('siege')&&!u.sieged&&this.units.some(t=>t.alive&&t.team!==u.team&&dist(u,t)<260))this.cast(u,'siege');
  if(abilities.includes('cloak')&&!u.cloaked&&u.energy>=25&&this.units.some(t=>t.alive&&t.team!==u.team&&dist(u,t)<240))this.cast(u,'cloak');
  if(abilities.includes('burrow')&&!u.burrowed&&this.units.some(t=>t.alive&&t.team!==u.team&&dist(u,t)<110))this.cast(u,'burrow');
 }
 step(dt){
  super.step(dt);if(this.phase!=='battle')return;
  this.fireBunkers(dt);this.tickIncome(dt);this.tickSpecials(dt);for(const c of this.commanders.filter(c=>c.slot>0))this.withCommander(c.id,()=>{this.tickIncome(dt,[c.team]);this.tickSpecials(dt,[c.team])});this.checkBaseWarning();
  this.waveClock-=dt;
  while(this.waveClock<=0){for(const c of this.commanders)this.withCommander(c.id,()=>this.spawnWave(c.team));this.ai.observe();const history=this.ai.snapshot();history.commanders=this.commanders.map(c=>this.commanderSnapshot(c.id));this.waveHistory.push(history);this.waveClock+=WAVE_SECONDS;this.emit('wave')}
  this.botStep(dt);for(const c of this.commanders.filter(c=>c.slot>0))this.withCommander(c.id,()=>c.ai.step(dt));
 }
 bunkerRange(type,weapon){
  // OpenBW weapon_max_range: +64 from the loaded soldier's bounds, not the bunker hull.
  // U-238 Shells is enabled in the original map's starting upgrade settings.
  return weapon.range+64+(type===0&&DESERT_STRIKE.upgrades[16]?.initialLevel?32:0);
 }
 fireBunkers(dt){
  for(const bunker of this.units.filter(u=>u.alive&&u.garrison?.length)){
   const cooldowns=bunker.garrisonCooldowns||=Array(bunker.garrison.length).fill(0);
   for(const [slot,id]of bunker.garrison.entries()){
    cooldowns[slot]=Math.max(0,(cooldowns[slot]||0)-dt);if(cooldowns[slot]>0)continue;
    const soldier=this.data.units[id];if(!soldier)continue;
    const weaponFor=target=>this.data.weapons[target.def.air?soldier.airWeapon:soldier.groundWeapon];
    const target=this.units.filter(u=>{
     if(!u.alive||u.productionOnly||u.hidden||u.loaded||u.team===bunker.team||!this.canSee(bunker.team,u))return false;
     const w=weaponFor(u),distance=Math.max(0,dist(u,bunker)-(soldier.radius||10)-u.r);
     return w?.damage&&(u.def.air?w.air:w.ground)&&distance<=this.bunkerRange(id,w)&&distance>=(w.minRange||0);
    }).sort((a,b)=>dist(a,bunker)-dist(b,bunker))[0];if(!target)continue;
    const weapon=weaponFor(target),direction=(Math.round(Math.atan2(target.x-bunker.x,bunker.y-target.y)*16/Math.PI)+32)%32,angle=direction*Math.PI/16;
    const x=bunker.x+Math.sin(angle)*30+(slot-1.5)*6,y=bunker.y-Math.cos(angle)*22;
    const shooter={...bunker,type:id,def:soldier,x,y};this.attack(shooter,target,weapon);cooldowns[slot]=weapon.cooldown;
    this.effects.push({x,y,image:id===32?421:527,team:bunker.team,direction,left:id===32?.45:.18,duration:id===32?.45:.18,kind:'bunker-shot'});
   }
  }
 }
 die(u,team){
  if(!u.alive)return;const wasOutpost=u.isOutpost;const wasMain=u===this.main,wasCore=u===this.core;this.releaseGasSlot(u);
  if(u.def.building){const visual=buildingDestruction(u);this.wrecks.push({x:u.x,y:u.y,team:u.team,image:visual.rubble,variant:u.id%4,productionOnly:!!u.productionOnly,commanderId:u.commanderId});this.effects.push({x:u.x,y:u.y,image:visual.explosion,left:1.15,duration:1.15,team:u.team,kind:'building-death',productionOnly:!!u.productionOnly,commanderId:u.commanderId})}
  if(u.garrison?.length){for(let i=0;i<u.garrison.length;i++){const type=u.garrison[i],crew=this.create(type,u.team,u.x+(i-1.5)*18,u.y),objective=this.laneObjective(u.team);crew.commanderId=u.commanderId;crew.order='attackmove';crew.laneArmy=true;this.setGoal(crew,{x:objective.x,y:objective.y},'attackmove');crew.laneObjectiveId=objective.id}u.garrison=[]}
  super.die(u,team);
  const linked=this.units.find(t=>t.alive&&t.id===(u.deployedDefenseId||u.sourceProducer));if(linked){u.deployedDefenseId=null;u.sourceProducer=null;this.die(linked,team)}
  this.refreshSupply();this.emit('change');
  if(wasOutpost&&!u.defenseReleased){u.defenseReleased=true;const types={terran:[0,0,0,0,0,0,0,0,3,3,34,34],zerg:[37,37,37,37,37,37,37,37,38,38,38,38],protoss:[65,65,65,65,65,65,66,66]}[this.raceFor(u.team)],base=u.team?this.core:this.main;types.forEach((type,i)=>this.spawnUnit(type,u.team,i,types.length,base))}
  if(this.phase==='battle'&&wasCore)this.finish(true,'상대 메인 기지를 함락했습니다.');
  else if(this.phase==='battle'&&wasMain)this.finish(false,'우리 메인 기지가 함락되었습니다.');
 }
 finish(win,reason){
  if(this.phase!=='battle')return;
  this.phase='result';this.paused=false;this.closeMenu();
  const army=this.allies.filter(u=>!u.def.building&&!u.hidden);
  this.result={win,reason,time:this.time,produced:this.produced,survivors:army.length,kills:this.kills,losses:this.losses,damage:this.damageDone};
  this.emit('phase');this.emit('result',{result:this.result});
 }
}
