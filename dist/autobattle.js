import {Battle as EconomyBattle,BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH} from './economy.js?v=0.10.0';
import {clamp,dist} from './core.js?v=0.10.0';
import {DESERT_STRIKE,TECH_IDS,INCOME_SECONDS,BUILDING_WAVES,GAS_BUILDING,GAS_SLOT_X,GAS_SLOT_Y,WAVE_SECONDS,PRODUCTION_OFFSET,PRODUCTION_HEIGHT,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y,constructionSeconds,buildingCost} from './lane-rules.js?v=0.10.0';
export {BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH};
export {WAVE_SECONDS,PRODUCTION_OFFSET,PRODUCTION_HEIGHT,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y};

export class Battle extends EconomyBattle{
 constructor(data,options={}){
  super(data,options);
  this.laneMode=true;
  this.map.elevation=true;this.map.rocks=[];this.map.water=[{x:0,y:640,w:320,h:768},{x:960,y:640,w:320,h:768}];
  this.phase='title';
  this.timeLimit=Infinity;
  this.waveClock=WAVE_SECONDS;
  this.botMoney=DESERT_STRIKE.startingMinerals;
  this.botGas=0;
  this.builder=null;
  this.outpostDefenses=[[],[]];this.incomeRemaining=[INCOME_SECONDS,INCOME_SECONDS];this.gasInvestmentLevel=[0,0];
  this.menuMode='build';
  this.aiStep=0;
  this.aiPlans={
   terran:[{at:0,type:111,x:300,y:1620},{at:80,type:113,x:300,y:1480},{at:180,type:114,x:280,y:1540}],
   zerg:[{at:0,type:142,x:380,y:1620},{at:80,type:135,x:380,y:1500},{at:155,type:141,x:280,y:1600}],
   protoss:[{at:0,type:160,x:360,y:1750},{at:80,type:164,x:360,y:1620},{at:180,type:167,x:300,y:1600}]
  }[this.race].map(plan=>({...plan,at:plan.at*(this.difficulty==='easy'?1.35:this.difficulty==='hard'?.75:1)}));
 }
 get battleTimeScale(){return 1}
 get timeScale(){return 1}
 get nextWave(){return Math.max(0,this.waveClock)}
 get supply(){return this.allies.filter(u=>!u.hidden&&!u.def.building&&!u.egg).reduce((n,u)=>n+u.def.supply,0)}
 supplyCap(team=0){return Math.min(200,this.units.filter(u=>u.alive&&u.team===team&&this.ready(u)).reduce((n,u)=>n+(this.race==='zerg'&&[131,132,133].includes(u.type)?10:BUILDINGS[u.type]?.supply||(u.type===42?8:0)),0))}
 armySupply(team=0){return this.units.filter(u=>u.alive&&u.team===team&&!u.hidden&&!u.def.building&&!u.egg).reduce((n,u)=>n+u.def.supply,0)}
 refreshSupply(){this.maxSupply=this.supplyCap(0)}
 canSee(){return true}
 updateVision(){this.fog.fill(1);this.explored.fill(1)}
 get inspectedUnit(){return this.units.find(u=>u.id===this.inspectedId&&u.alive&&!u.hidden&&!u.loaded&&this.canSee(0,u))||null}
 isHighlighted(u){return this.selection.includes(u.id)||this.inspectedId===u.id&&this.inspectedUnit===u}
 select(ids,voice=true){this.inspectedId=null;return super.select(ids.filter(id=>{const u=this.units.find(a=>a.id===id);return u?.alive&&u.team===0&&!u.hidden}),voice)}
 inspect(unit){
  if(!unit?.alive||unit.hidden||unit.loaded||!this.canSee(0,unit))return false;
  this.select(unit.team===0?[unit.id]:[],false);
  if(unit.team!==0){this.inspectedId=unit.id;this.emit('selection')}
  return true;
 }
 openMenu(mode='build'){
  if(this.phase!=='battle')return false;
  this.menuMode=mode;this.menuOpen=true;this.targeting=null;this.emit('menu');return true;
 }
 begin(){
  if(this.phase!=='title')return false;
  this.phase='battle';this.paused=false;this.time=0;this.timeLeft=Infinity;
  this.units=[];this.projectiles=[];this.areas=[];this.effects=[];this.nodes=[];
  this.money=DESERT_STRIKE.startingMinerals;this.gas=0;this.botMoney=DESERT_STRIKE.startingMinerals;this.botGas=0;this.maxSupply=200;
  this.produced=0;this.kills=0;this.losses=0;this.damageDone=0;this.waveClock=WAVE_SECONDS;
  const player=this.installSide(0),enemy=this.installSide(1);
  this.main=player.main;this.core=enemy.main;this.builder=this.create(WORKER[this.race],0,640,1930);this.builder.hidden=true;
  this.builder.completed=true;this.builder.order='stop';this.enemyMain=enemy.main;
  this.playerOutpost=player.outpost;this.enemyOutpost=enemy.outpost;
  for(const [team,xs]of[[0,GAS_SLOT_X],[1,[...GAS_SLOT_X].reverse()]])xs.forEach((x,slot)=>this.addGasNode(team,x,PRODUCTION_OFFSET+GAS_SLOT_Y,slot));
  this.installDefenses(0,player);this.installDefenses(1,enemy);
  this.incomeRemaining=[INCOME_SECONDS,INCOME_SECONDS];this.gasInvestmentLevel=[0,0];for(const [key,id]of Object.entries(TECH_IDS))if(DESERT_STRIKE.technologies[id]?.researched)this.researched.add(key);this.refreshSupply();this.updateVision();this.select([],false);this.emit('phase');this.emit('change');return true;
 }
 installSide(team){
  const mainY=team?160:1888,outpostY=team?480:1568,baseType=BASE[this.race];
  const main=this.create(baseType,team,640,mainY);main.isMain=true;main.order='hold';
  const outpost={id:`outpost-${team}`,team,x:640,y:outpostY};
  return {main,outpost,team};
 }
 addGasNode(team,x,y,slot){this.nodes.push({id:`geyser-${team}-${slot}`,team,slot,x,y,r:36,kind:'gas',amount:5000,miner:null,occupiedBy:null})}
 buildingCost(type){return buildingCost(this.race,type,this.data)}
 constructionSeconds(type){return constructionSeconds(this.data,type)}
 waveUnitsForBuilding(type){return BUILDING_WAVES[type]||null}
 laneObjective(team){const enemy=1-team,outpost=this.outpostDefenses[enemy].find(u=>u.alive);return outpost?{id:`outpost-${enemy}`,x:640,y:outpost.y}:team===0?this.core:this.main}
 completedGasCount(team){return this.units.filter(u=>u.alive&&u.team===team&&u.gasNode&&this.ready(u)).length}
 incomeAmount(team=0){return DESERT_STRIKE.income[Math.min(5,this.completedGasCount(team))]}
 get incomePauseLeft(){return Math.max(0,this.incomeRemaining[0]-INCOME_SECONDS)}
 tickIncome(dt){
  for(const team of [0,1]){
   const count=this.completedGasCount(team);
   while(this.gasInvestmentLevel[team]<count){this.gasInvestmentLevel[team]++;this.incomeRemaining[team]+=DESERT_STRIKE.gasPenaltyCycles[this.gasInvestmentLevel[team]]*DESERT_STRIKE.hyperCycleSeconds}
   this.incomeRemaining[team]-=dt;
   while(this.incomeRemaining[team]<=1e-9){const amount=this.incomeAmount(team);if(team===0)this.money+=amount;else this.botMoney+=amount;this.incomeRemaining[team]+=INCOME_SECONDS;this.emit('income',{team,minerals:amount})}
  }
 }
 waveProducers(team){return this.units.filter(u=>u.alive&&u.team===team&&u.productionOnly&&u.def.building&&this.ready(u)&&BUILDING_WAVES[u.type])}
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
 installDefenses(team,side){
  const y=side.outpost.y,baseY=side.main.y;
  if(this.race==='terran'){
   for(const x of [510,770])this.outpostDefenses[team].push(this.makeBunker(team,x,y));
   for(const x of [500,780])this.makeTower(team,124,x,baseY+(team?92:-92));
  }else if(this.race==='zerg'){
   this.outpostDefenses[team].push(this.makeTower(team,146,550,y),this.makeTower(team,144,730,y));
   this.makeTower(team,146,520,baseY+(team?92:-92));this.makeTower(team,144,760,baseY+(team?92:-92));
  }else{
   this.outpostDefenses[team].push(this.makeTower(team,156,640,y+96),this.makeTower(team,162,550,y),this.makeTower(team,162,730,y));
   this.makeTower(team,156,640,baseY+(team?148:-148));
   this.makeTower(team,162,550,baseY+(team?92:-92));this.makeTower(team,162,730,baseY+(team?92:-92));
  }
 }
 makeBunker(team,x,y){
  const bunker=this.create(125,team,x,y);bunker.order='hold';bunker.isFortification=true;bunker.garrison=[0,0,0,32];bunker.garrisonClock=0;
  return bunker;
 }
 makeTower(team,type,x,y){
  const u=this.create(type,team,x,y);u.order='hold';u.isFortification=true;u.hp=u.maxHp=Math.max(u.maxHp,380);
  if(this.race==='terran')u.def={...u.def,groundWeapon:80,airWeapon:81,sight:400,armor:1};
  return u;
 }
 buildReason(worker,type){
  const spec=BUILDINGS[type],def=this.data.units[type];
  if(!this.builder?.alive||!spec||!def||spec.race!==this.race||spec.addon||spec.morph)return '건설할 수 없는 건물입니다.';
  const missing=this.prerequisites(spec.requires);if(missing.length)return '필요: '+missing.join(', ');
  return this.costReason(this.buildingCost(type));
 }
 placement(worker,type,point){
  type=Number(type);const spec=BUILDINGS[type],size=this.footprint(type),p={x:Math.round((point.x-size[0]/2)/32)*32+size[0]/2,y:Math.round((point.y-PRODUCTION_OFFSET-size[1]/2)/32)*32+size[1]/2+PRODUCTION_OFFSET};
  const reason=this.buildReason(this.builder,type);if(reason)return {point:p,reason};
  let gasNode=null;if(spec?.gas){gasNode=this.nodes.find(n=>n.team===0&&n.kind==='gas'&&!n.occupiedBy&&dist(n,p)<100);if(gasNode){p.x=gasNode.x;p.y=gasNode.y}}
  if(spec?.gas&&!gasNode)return {point:p,reason:'비어 있는 가스 지점에 건설하세요.'};
  if(p.x-size[0]/2<PRODUCTION_GROUND_X||p.x+size[0]/2>PRODUCTION_GROUND_X+PRODUCTION_GROUND_WIDTH||p.y-size[1]/2<PRODUCTION_OFFSET+PRODUCTION_GROUND_Y||p.y+size[1]/2>PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT)return {point:p,reason:'육지 안에 건물을 배치하세요.'};
  for(const u of this.units.filter(u=>u.alive&&u.team===0&&u.productionOnly&&u.def.building)){const [w,h]=this.footprint(u.type);if(Math.abs(u.x-p.x)<(w+size[0])/2&&Math.abs(u.y-p.y)<(h+size[1])/2)return {point:p,reason:'건물이 겹칩니다.'}}
  for(const node of this.nodes)if(node.team===0&&node!==gasNode&&node.amount>0&&Math.abs(node.x-p.x)<size[0]/2+node.r&&Math.abs(node.y-p.y)<size[1]/2+node.r)return {point:p,reason:'가스 지점과 겹칩니다.'};
  if(spec?.psi&&!this.units.some(u=>u.alive&&u.team===0&&u.type===156&&this.ready(u)&&this.inPsi(p,u)))return {point:p,reason:'파일런의 전력 범위 안에 배치하세요.'};
  return {point:p,reason:'',gasNode};
 }
 build(worker,type,point){
  type=Number(type);const result=this.placement(this.builder,type,point);
  if(result.reason)return this.fail(result.reason);
  const def=this.data.units[type],cost=this.buildingCost(type);if(!def||!this.affordable(cost))return this.fail(this.costReason(cost));
  this.money-=cost[0];this.gas-=cost[1];
  const u=this.create(type,0,result.point.x,result.point.y);u.completed=false;u.hp=Math.max(1,def.hp*.1);u.shield=def.shield*.1;u.productionOnly=true;
  u.parent='lane-builder';u.construction={time:0,total:this.constructionSeconds(type),builder:this.builder.id,started:true,cost:[...cost],original:null};
  u.gasNode=result.gasNode?.id;if(result.gasNode)result.gasNode.occupiedBy=u.id;this.closeMenu();this.emit('change');return true;
 }
 morphReason(unit,type){const spec=BUILDINGS[type];if(!this.ready(unit)||spec?.morph!==unit.type||unit.team!==0)return '변태할 수 없습니다.';if(unit.queue.length)return '연구를 먼저 완료하세요.';const missing=this.prerequisites(spec.requires);return missing.length?'필요: '+missing.join(', '):this.costReason(this.buildingCost(type))}
 morph(unit,type){type=Number(type);const reason=this.morphReason(unit,type);if(reason)return this.fail(reason);const cost=this.buildingCost(type);this.money-=cost[0];unit.construction={time:0,total:this.constructionSeconds(type),builder:null,started:true,cost,original:{type:unit.type,hp:unit.hp,shield:unit.shield},nextType:type};unit.completed=false;this.closeMenu();this.emit('change');return true}
 addonOptions(unit){return Object.keys(BUILDINGS).map(Number).filter(id=>BUILDINGS[id].addon===unit?.type)}
 addonReason(parent,type){
  const spec=BUILDINGS[type];if(!this.ready(parent)||parent.team!==0||!spec||spec.addon!==parent.type)return '부속 건물을 만들 수 없습니다.';
  if(parent.queue?.length)return '생산 또는 연구가 진행 중입니다.';
  if(this.allies.some(u=>u.parent===parent.id))return '이미 부속 건물이 있습니다.';
  const missing=this.prerequisites(spec.requires);if(missing.length)return '필요: '+missing.join(', ');
  const parentSize=this.footprint(parent.type),size=this.footprint(type),p={x:parent.x+parentSize[0]/2+size[0]/2,y:parent.y};
  if(p.x-size[0]/2<PRODUCTION_GROUND_X||p.x+size[0]/2>PRODUCTION_GROUND_X+PRODUCTION_GROUND_WIDTH||p.y-size[1]/2<PRODUCTION_OFFSET+PRODUCTION_GROUND_Y||p.y+size[1]/2>PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT)return '육지 안에 부속 건물을 붙일 공간이 없습니다.';
  for(const u of this.units.filter(u=>u.alive&&u.team===0&&u.productionOnly&&u.def.building&&u!==parent)){const other=this.footprint(u.type);if(Math.abs(u.x-p.x)<(other[0]+size[0])/2&&Math.abs(u.y-p.y)<(other[1]+size[1])/2)return '부속 건물이 겹칩니다.'}
  return this.costReason(this.buildingCost(type));
 }
 addon(parent,type){
  type=Number(type);const reason=this.addonReason(parent,type);if(reason)return this.fail(reason);
  const cost=this.buildingCost(type),def=this.data.units[type],parentSize=this.footprint(parent.type),size=this.footprint(type);
  this.money-=cost[0];this.gas-=cost[1];const u=this.create(type,0,parent.x+parentSize[0]/2+size[0]/2,parent.y);u.parent=parent.id;u.productionOnly=true;u.completed=false;u.hp=Math.max(1,def.hp*.1);
  u.construction={time:0,total:this.constructionSeconds(type),builder:null,started:true,cost:[...cost],original:null};this.closeMenu();this.emit('change');return true;
 }
 cancel(unit,index=0){if(unit?.team===0&&unit.construction)this.releaseGasSlot(unit);return super.cancel(unit,index)}
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
 spawnUnit(type,team,index,total,origin,spacing=32){
  const def=this.data.units[type];if(!def)return null;
  const columns=Math.min(8,Math.max(1,Math.floor(448/spacing)),total),row=Math.floor(index/columns),rowCount=Math.min(columns,total-row*columns),direction=team?1:-1;
  const spread=(index%columns-(rowCount-1)/2)*spacing;
  const u=this.create(type,team,640+spread,clamp(origin.y+direction*120-direction*row*spacing,24,2024));
  u.order='attackmove';u.laneArmy=true;u.laneOffset=spread;const objective=this.laneObjective(team);this.setGoal(u,this.formationGoal(u,objective),'attackmove');u.laneObjectiveId=objective.id;
  if(team===0)this.produced++;return u;
 }
 spawnWave(team){
  const lineup=[];for(const [type,count]of this.activeWave(team))for(let i=0;i<count;i++)lineup.push(type);
  const origin={x:640,y:team?this.core.y:this.main.y},spacing=Math.max(32,...lineup.map(type=>(this.data.units[type]?.radius||10)*2.4));
  lineup.forEach((type,index)=>this.spawnUnit(type,team,index,lineup.length,origin,spacing));
 }
 botBuild(plan){
  const def=this.data.units[plan.type],cost=this.buildingCost(plan.type);if(!def||this.botMoney<cost[0]||this.botGas<cost[1])return false;
  this.botMoney-=cost[0];this.botGas-=cost[1];
  const x=PRODUCTION_GROUND_X+plan.x/1280*PRODUCTION_GROUND_WIDTH,y=PRODUCTION_GROUND_Y+(1-plan.y/PRODUCTION_HEIGHT)*PRODUCTION_GROUND_HEIGHT,u=this.create(plan.type,1,1280-x,PRODUCTION_OFFSET+y);u.completed=false;u.hp=Math.max(1,def.hp*.1);u.parent='bot-builder';u.productionOnly=true;
  u.construction={time:0,total:this.constructionSeconds(plan.type),builder:null,started:true,cost:[...cost],original:null};return true;
 }
 botBuildGas(){
  if(this.units.some(u=>u.alive&&u.team===1&&u.gasNode&&u.construction))return false;
  const node=this.nodes.find(n=>n.team===1&&n.kind==='gas'&&!n.occupiedBy);if(!node)return false;
  const type=GAS_BUILDING[this.race],def=this.data.units[type],cost=this.buildingCost(type);if(!def||this.botMoney<cost[0])return false;
  this.botMoney-=cost[0];this.botGas-=cost[1];
  const u=this.create(type,1,node.x,node.y);u.productionOnly=true;u.completed=false;u.hp=Math.max(1,def.hp*.1);u.gasNode=node.id;u.parent='bot-builder';node.occupiedBy=u.id;
  u.construction={time:0,total:this.constructionSeconds(type),builder:null,started:true,cost:[...cost],original:null};return true;
 }
 botStep(dt){
  this.botBuildGas();
  const plan=this.aiPlans[this.aiStep];if(!plan||this.time<plan.at)return;
  if(this.botBuild(plan))this.aiStep++;
 }
 tickBotConstruction(u,dt){
  const c=u.construction;if(!c)return false;
  u.animTime+=dt;c.time=Math.min(c.total,c.time+dt);
  const def=this.data.units[u.type];u.hp=Math.min(def.hp,u.hp+def.hp*.9*dt/c.total);
  if(c.time>=c.total){u.completed=true;u.construction=null;u.action='idle';this.emit('change');
  }
  return true;
 }
 tickUnit(u,dt){
  if(u.hidden){u.animTime+=dt;return}
  if(u.productionOnly){if(u.team===1&&u.construction)this.tickBotConstruction(u,dt);else if(u.team===0&&u.construction)this.tickEconomy(u,dt);else if(!u.def.building&&!u.hidden)u.animTime+=dt;return}
  if(u.team===1&&u.construction){this.tickBotConstruction(u,dt);return}
  if(!u.def.building&&u.laneArmy){
   const objective=this.laneObjective(u.team);if(objective?.id!==u.laneObjectiveId){u.laneObjectiveId=objective.id;this.setGoal(u,this.formationGoal(u,objective),'attackmove')}
  }
  if(u.team===0&&!u.def.building&&!u.loaded)this.autoCast(u);
  super.tickUnit(u,dt);
 }
 weapon(u,target){
  if(target.productionOnly||u.productionOnly||u.garrison)return null;
  if(u.laneArmy&&!target.def.building&&Math.abs(target.x-640)>240&&dist(u,target)>96)return null;
  if(u.isFortification&&this.race==='terran'){
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
  this.fireBunkers(dt);this.tickIncome(dt);
  this.waveClock-=dt;
  while(this.waveClock<=0){this.spawnWave(0);this.spawnWave(1);this.waveClock+=WAVE_SECONDS;this.emit('wave')}
  this.botStep(dt);
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
  if(!u.alive)return;const wasMain=u===this.main,wasCore=u===this.core;this.releaseGasSlot(u);
  if(u.garrison?.length){for(let i=0;i<u.garrison.length;i++){const type=u.garrison[i],crew=this.create(type,u.team,u.x+(i-1.5)*18,u.y),objective=this.laneObjective(u.team);crew.order='attackmove';crew.laneArmy=true;this.setGoal(crew,{x:objective.x,y:objective.y},'attackmove');crew.laneObjectiveId=objective.id}u.garrison=[]}
  super.die(u,team);this.refreshSupply();this.emit('change');
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
