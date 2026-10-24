import {Battle as EconomyBattle,BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH} from './economy.js?v=0.3.0';
import {clamp,dist} from './core.js?v=0.3.0';
export {BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH};

export const WAVE_SECONDS=25;
const STARTER={terran:111,zerg:131,protoss:160};
const STARTER_UNIT={terran:0,zerg:37,protoss:65};
const TOWER={terran:124,zerg:146,protoss:162};
const GAS={terran:110,zerg:149,protoss:157};

export class Battle extends EconomyBattle{
 constructor(data,options={}){
  super(data,options);
  this.laneMode=true;
  this.phase='title';
  this.timeLimit=Infinity;
  this.waveClock=WAVE_SECONDS;
  this.incomeClock=0;
  this.botMoney=600;
  this.botGas=180;
  this.builder=null;
  this.menuMode='build';
  this.aiStep=0;
  this.aiPlans={
   terran:[{at:80,type:113,autoType:2,x:860,y:1620},{at:180,type:114,autoType:8,x:960,y:1540}],
   zerg:[{at:80,type:135,x:900,y:1620,afterType:38},{at:155,type:131,autoType:37,x:820,y:1600}],
   protoss:[{at:80,type:164,x:1000,y:1750,afterType:66},{at:180,type:167,autoType:60,x:960,y:1600}]
  }[this.race];
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
 select(ids,voice=true){return super.select(ids.filter(id=>{const u=this.units.find(a=>a.id===id);return u?.def.building&&!u.hidden}),voice)}
 openMenu(mode='build'){
  if(this.phase!=='battle')return false;
  this.menuMode=mode;this.menuOpen=true;this.targeting=null;this.emit('menu');return true;
 }
 begin(){
  if(this.phase!=='title')return false;
  this.phase='battle';this.paused=false;this.time=0;this.timeLeft=Infinity;
  this.units=[];this.projectiles=[];this.areas=[];this.effects=[];this.nodes=[];
  this.money=600;this.gas=180;this.botMoney=600;this.botGas=180;this.maxSupply=200;
  this.produced=0;this.kills=0;this.losses=0;this.damageDone=0;this.waveClock=WAVE_SECONDS;this.incomeClock=0;
  const player=this.installSide(0),enemy=this.installSide(1);
  this.main=player.main;this.core=enemy.main;this.builder=this.create(WORKER[this.race],0,640,1930);this.builder.hidden=true;
  this.builder.completed=true;this.builder.order='stop';this.enemyMain=enemy.main;
  this.addGasNode(0,320,1740);this.addGasNode(1,960,308);
  this.addRefinery(0,320,1740);this.addRefinery(1,960,308);
  this.installDefenses(0,player);this.installDefenses(1,enemy);
  this.installStarter(0,player);this.installStarter(1,enemy);
  player.producer.autoType=STARTER_UNIT[this.race];enemy.producer.autoType=STARTER_UNIT[this.race];
  this.refreshSupply();this.updateVision();this.select([player.producer.id],false);this.emit('phase');this.emit('change');return true;
 }
 installSide(team){
  const mainY=team?192:1856,outpostY=team?768:1280,baseType=BASE[this.race];
  const main=this.create(baseType,team,640,mainY);main.isMain=true;main.order='hold';
  const outpost=this.create(baseType,team,640,outpostY);outpost.isOutpost=true;outpost.order='hold';
  return {main,outpost,team};
 }
 installStarter(team,side){
  const y=team?1760:1760; // Player structures are mirrored below after the team check.
  const sy=team?288:y;
  if(this.race==='zerg'){
   const pool=this.create(142,team,team?380:900,team?448:1600);pool.order='hold';
   side.producer=side.main;
  }else if(this.race==='terran'){
   side.producer=this.create(111,team,team?380:900,team?448:1600);side.producer.order='hold';
  }else{
   const pylon=this.create(156,team,team?400:880,team?288:1760);pylon.order='hold';
   side.producer=this.create(160,team,team?440:840,team?368:1680);side.producer.order='hold';
  }
 }
 addGasNode(team,x,y){this.nodes.push({id:`geyser-${team}`,x,y,r:30,kind:'gas',amount:5000,miner:null})}
 addRefinery(team,x,y){
  const unit=this.create(GAS[this.race],team,x,y);unit.order='hold';unit.gasNode=`geyser-${team}`;unit.hp=unit.maxHp;unit.completed=true;
 }
 spawnLarva(){return null}
 productionOptions(unit){return super.productionOptions(unit).filter(type=>type!==WORKER[this.race])}
 installDefenses(team,side){
  const y=side.outpost.y,baseY=side.main.y,towerType=TOWER[this.race];
  for(const x of [520,760])this.makeTower(team,towerType,x,y);
  for(const x of [500,780])this.makeTower(team,towerType,x,baseY+(team?80:-80));
  if(this.race==='zerg'){
   const sideX=team?400:880;
   this.makeTower(team,144,sideX,y);
   this.makeTower(team,144,sideX,baseY+(team?80:-80));
  }
 }
 makeTower(team,type,x,y){
  const u=this.create(type,team,x,y);u.order='hold';u.isFortification=true;u.hp=u.maxHp=Math.max(u.maxHp,380);
  if(this.race==='terran')u.def={...u.def,groundWeapon:80,airWeapon:81,sight:400,armor:1};
  return u;
 }
 buildReason(worker,type){return super.buildReason(this.builder,type)}
 placement(worker,type,point){
  const result=super.placement(this.builder,type,point);
  if(result.reason)return result;
  if(result.point.y<1032)return {...result,reason:'우리 진영 안에 건설하세요.'};
  return result;
 }
 build(worker,type,point){
  type=Number(type);const result=this.placement(this.builder,type,point);
  if(result.reason)return this.fail(result.reason);
  const def=this.data.units[type];if(!def||!this.affordable(def.cost))return this.fail(this.costReason(def?.cost||[0,0]));
  this.money-=def.cost[0];this.gas-=def.cost[1];
  const u=this.create(type,0,result.point.x,result.point.y);u.completed=false;u.hp=Math.max(1,def.hp*.1);u.shield=def.shield*.1;
  u.parent='lane-builder';u.construction={time:0,total:Math.max(8,(def.buildTime||40)*.45),builder:this.builder.id,started:true,cost:[...def.cost],original:null};
  u.gasNode=result.gasNode?.id;this.closeMenu();this.emit('change');return true;
 }
 execute(command,point=null,target=null){
  if(command.startsWith('build:'))return this.build(this.builder,Number(command.split(':')[1]),point);
  return false;
 }
 trainReason(producer,type){return this.autoReason(producer,type)}
 train(){return this.fail('생산 건물에서 자동 출격 유닛을 지정하세요.')}
 autoReason(producer,type){
  type=Number(type);const spec=PRODUCTION[type],def=this.data.units[type];
  if(!producer?.alive||producer.team!==0||!this.ready(producer)||!spec||!def)return '생산할 수 없습니다.';
  if(!this.productionOptions(producer).includes(type))return '이 건물에서 생산할 수 없습니다.';
  if(spec.merge||spec.morph)return '이 유닛은 자동 출격 편성에 아직 포함할 수 없습니다.';
  const missing=this.prerequisites(spec.requires);if(missing.length)return '필요: '+missing.join(', ');
  if(spec.research&&!this.researched.has(spec.research))return '필요 연구: '+RESEARCH[spec.research].name;
  if(spec.addon&&!this.allies.some(u=>u.parent===producer.id&&u.type===spec.addon&&this.ready(u)))return '부착된 '+this.data.units[spec.addon].name+' 필요';
  return '';
 }
 setAutoProduction(producer,type){
  if(!producer?.alive||producer.team!==0||!this.ready(producer))return this.fail('완성된 생산 건물을 선택하세요.');
  if(type!==null){const reason=this.autoReason(producer,type);if(reason)return this.fail(reason)}
  producer.autoType=type===null?null:Number(type);this.emit('notice',{text:producer.autoType?this.data.units[producer.autoType].name+' 반복 출격 설정':'반복 출격 해제'});this.emit('change');return true;
 }
 researchReason(unit,key){return super.researchReason(unit,key)}
 research(unit,key){return super.research(unit,key)}
 spawnUnit(type,team,index,total,origin){
  const def=this.data.units[type];if(!def)return null;
  const spread=(index-(total-1)/2)*Math.max(22,(def.radius||10)*2.1),direction=team?1:-1;
  const u=this.create(type,team,clamp(640+spread,72,1208),clamp(origin.y+direction*120,24,2024));
  u.order='attackmove';this.setGoal(u,{x:640,y:team?1856:192},'attackmove');
  if(team===0)this.produced++;return u;
 }
 spawnWave(team){
  const producers=this.units.filter(u=>u.alive&&u.team===team&&u.def.building&&u.autoType&&this.ready(u));
  for(const p of producers){const type=Number(p.autoType),def=this.data.units[type];if(!def)continue;
   if(team===0&&this.autoReason(p,type))continue;
   const origin={x:p.x,y:p.y},qty=def.qty||1;
   if(this.armySupply(team)+def.supply*qty>this.supplyCap(team))continue;
   for(let i=0;i<qty;i++)this.spawnUnit(type,team,i,qty,origin);
  }
  if(team===1&&this.difficulty==='hard'){
   const p=producers.find(x=>x.autoType);if(p){const type=p.autoType,def=this.data.units[type];if(def)this.spawnUnit(type,1,0,1,{x:640,y:192})}
  }
 }
 botBuild(plan){
  const def=this.data.units[plan.type];if(!def||this.botMoney<def.cost[0]||this.botGas<def.cost[1])return false;
  this.botMoney-=def.cost[0];this.botGas-=def.cost[1];
  const u=this.create(plan.type,1,1280-plan.x,2048-plan.y);u.completed=false;u.hp=Math.max(1,def.hp*.1);u.parent='bot-builder';
  u.botAutoType=plan.autoType||null;u.botAfterType=plan.afterType||null;
  u.construction={time:0,total:Math.max(8,(def.buildTime||40)*.45),builder:null,started:true,cost:[...def.cost],original:null};return true;
 }
 botStep(dt){
  this.botSupplyClock=(this.botSupplyClock||0)+dt;
  if(this.botSupplyClock>=30&&this.armySupply(1)>=this.supplyCap(1)-4){
   const supplyBuilding={terran:109,zerg:42,protoss:156}[this.race];
   if(supplyBuilding===42){if(this.botMoney>=this.data.units[42].cost[0]){this.botMoney-=this.data.units[42].cost[0];const u=this.create(42,1,420,320);u.order='hold'}}
   else this.botBuild({type:supplyBuilding,x:760,y:400});
   this.botSupplyClock=0;
  }
  const plan=this.aiPlans[this.aiStep];if(!plan||this.time<plan.at)return;
  if(this.botBuild(plan))this.aiStep++;
 }
 tickBotConstruction(u,dt){
  const c=u.construction;if(!c)return false;
  c.time=Math.min(c.total,c.time+dt);
  const def=this.data.units[u.type];u.hp=Math.min(def.hp,u.hp+def.hp*.9*dt/c.total);
  if(c.time>=c.total){u.completed=true;u.construction=null;u.action='idle';if(u.botAutoType)u.autoType=u.botAutoType;
   if(u.botAfterType&&this.enemyMain){const producer=this.units.find(a=>a.team===1&&a.alive&&a.id===this.enemyMain.id);
    if(producer)producer.autoType=u.botAfterType}
   this.emit('change');
  }
  return true;
 }
 tickUnit(u,dt){
  if(u.hidden){u.animTime+=dt;return}
  if(u.team===1&&u.construction){this.tickBotConstruction(u,dt);return}
  if(u.team===0&&!u.def.building&&!u.loaded)this.autoCast(u);
  super.tickUnit(u,dt);
 }
 weapon(u,target){
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
  this.incomeClock+=dt;
  if(this.incomeClock>=1){const seconds=Math.floor(this.incomeClock);this.incomeClock-=seconds;this.money+=seconds*8;this.botMoney+=seconds*(this.difficulty==='easy'?6:this.difficulty==='hard'?10:8);
   const playerGas=this.allies.some(u=>u.gasNode&&this.ready(u)),enemyGas=this.units.some(u=>u.alive&&u.team===1&&u.gasNode&&this.ready(u));
   if(playerGas)this.gas+=seconds*3;if(enemyGas)this.botGas+=seconds*(this.difficulty==='easy'?2:this.difficulty==='hard'?4:3);
  }
  super.step(dt);if(this.phase!=='battle')return;
  this.waveClock-=dt;
  if(this.waveClock<=0){this.spawnWave(0);this.spawnWave(1);this.waveClock+=WAVE_SECONDS;this.emit('wave')}
  this.botStep(dt);
 }
 die(u,team){
  if(!u.alive)return;const wasMain=u===this.main,wasCore=u===this.core;
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
