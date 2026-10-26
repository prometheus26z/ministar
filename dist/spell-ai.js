import {SPELL_RULES,broodlingsTargetValid,feedbackTargetValid,mindTargetValid,pointInSpellArea,spellAreaContains,spellAffectedTargetValid,spellEdgeInRange} from './spell-rules.js?v=0.16.20';

const value=u=>Math.max(25,(u.def.cost?.[0]||0)+1.5*(u.def.cost?.[1]||0));
const valid=u=>u?.alive&&!u.loaded&&!u.hidden&&!u.productionOnly&&!u.buffs?.stasis;
const areaContains=(battle,key,unit,area)=>area.halfWidth!==undefined&&area.halfHeight!==undefined?
 Math.abs(unit.x-area.x)<=area.halfWidth+unit.r&&Math.abs(unit.y-area.y)<=area.halfHeight+unit.r:
 ['storm','plague'].includes(key)?spellAreaContains(battle,key,unit,area):pointInSpellArea(unit,area,area.r);

function points(battle,caster,units,radius,range){
 const out=new Map();
 for(const a of units){
  out.set(`${Math.round(a.x/16)},${Math.round(a.y/16)}`,{x:a.x,y:a.y});
  for(const b of units)if(a.id<b.id&&Math.hypot(a.x-b.x,a.y-b.y)<=radius*2){
   const p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};out.set(`${Math.round(p.x/16)},${Math.round(p.y/16)}`,p);
  }
 }
 return [...out.values()].filter(p=>Math.hypot(p.x-caster.x,p.y-caster.y)<=range).slice(0,128);
}

function cluster(battle,caster,key,point,radius){
 let score=0,count=0;
 for(const u of battle.nearby(point,radius+96)){
  if(u===caster||!valid(u)||!areaContains(battle,key,u,{x:point.x,y:point.y,r:radius}))continue;
  if(key==='swarm'){
   if(u.def.air||u.def.building)continue;
   if(u.team===caster.team){
    const threat=battle.nearbyAny(u,battle.spatialRange(200,true),e=>valid(e)&&e.team!==caster.team&&battle.unitThreatens(e,u)&&battle.weapon(e,u)?.range>40);
    if(threat&&!battle.areas.some(a=>a.kind==='swarm'&&areaContains(battle,'swarm',u,a))){score+=value(u);count++}
   }else score-=value(u)*1.25;
   continue;
  }
  if(['maelstrom','stasis'].includes(key)&&(u.def.building||u.buffs.stasis>0||key==='stasis'&&u.burrowed))continue;
  if(key==='maelstrom'&&(!u.def.organic||u.buffs.maelstrom>0))continue;
  if(key==='ensnare'&&(u.def.building||u.burrowed||u.buffs.ensnare>0))continue;
  if(key==='plague'&&(u.buffs.plague>0||!spellAffectedTargetValid('plague',u,caster)))continue;
  if(key==='emp'&&!(u.shield>0||u.energy>0))continue;
  if(key==='storm'&&(!spellAffectedTargetValid('storm',u,caster)||battle.areas.some(a=>a.kind==='storm'&&areaContains(battle,'storm',u,a))))continue;
  if(key==='web'&&(u.def.air||u.def.groundWeapon===null||!u.def.groundWeapon))continue;
  if(u.team===caster.team)score-=value(u)*.85;
  else{score+=key==='emp'?Math.min(u.shield||0,200)+(u.energy||0):value(u);count++}
 }
 return{score,count};
}

const bestCluster=(battle,caster,ability,units,{radius,minCount=2,minScore=120}={})=>
 points(battle,caster,units,radius,SPELL_RULES[ability].range)
  .map(point=>({key:ability,point,...cluster(battle,caster,ability,point,radius)}))
  .filter(candidate=>candidate.count>=minCount&&candidate.score>=minScore)
  .sort((a,b)=>b.score-a.score||a.point.y-b.point.y||a.point.x-b.point.x)[0];

export function chooseAutomatedSpell(battle,caster,abilities){
 if(!abilities.length||caster.energy<25)return null;
 const range=384;
 const enemies=battle.nearby(caster,battle.spatialRange(range,true))
  .filter(u=>valid(u)&&u.team!==caster.team&&battle.canSee(caster.team,u)&&Math.hypot(u.x-caster.x,u.y-caster.y)<=range)
  .sort((a,b)=>Math.hypot(a.x-caster.x,a.y-caster.y)-Math.hypot(b.x-caster.x,b.y-caster.y)||a.id-b.id).slice(0,32);
 const allies=battle.nearby(caster,battle.spatialRange(320,true))
  .filter(u=>valid(u)&&u.team===caster.team&&u!==caster&&!u.def.building).slice(0,32);
 const opts=[];
 const target=(key,list,filter,score)=>{
  if(!abilities.includes(key)||caster.energy<(SPELL_RULES[key]?.cost??100))return;
  const pick=list.filter(filter).map(unit=>({unit,score:score(unit)})).filter(x=>x.score>0)
   .sort((a,b)=>b.score-a.score||a.unit.id-b.unit.id).find(x=>spellEdgeInRange(battle,caster,x.unit,key));
  if(pick)opts.push({key,target:pick.unit,score:pick.score});
 };
 const area=(key,options)=>{
  if(!abilities.includes(key)||caster.energy<(SPELL_RULES[key]?.cost??100))return;
  const pick=bestCluster(battle,caster,key,enemies,options);if(pick)opts.push(pick);
 };

 target('feedback',enemies,u=>feedbackTargetValid(u)&&u.energy>=50,
  u=>Math.min(u.energy,u.hp+u.shield+u.matrix)+u.energy*.5);
 target('broodlings',enemies,broodlingsTargetValid,u=>value(u)+(u.type===5||u.type===30?300:0));
 area('maelstrom',{radius:48,minCount:2,minScore:150});
 area('ensnare',{radius:64,minCount:3,minScore:140});
 target('irradiate',enemies,u=>!u.def.building&&u.def.organic&&u.hp>=60&&!u.buffs.irradiate,
  u=>value(u)+battle.nearby(u,48).filter(a=>valid(a)&&a.team!==caster.team&&a.def.organic).length*30);
 area('emp',{radius:64,minCount:1,minScore:80});
 target('matrix',allies,u=>!u.matrix&&(u.hp/u.maxHp<.8&&battle.nearbyAny(u,180,a=>valid(a)&&a.team!==caster.team&&battle.unitThreatens(a,u))||u.target&&u.target.team!==caster.team||u.aggroUntil>battle.time||battle.nearbyAny(u,180,a=>valid(a)&&a.team!==caster.team&&battle.unitThreatens(a,u))),
  u=>value(u)*(u.hp/u.maxHp<.65?2:1)+battle.nearby(u,180).filter(a=>valid(a)&&a.team!==caster.team&&battle.unitThreatens(a,u)).length*60);
 area('storm',{radius:48,minCount:2,minScore:140});
 area('plague',{radius:64,minCount:2,minScore:160});
 area('stasis',{radius:48,minCount:2,minScore:180});
 area('web',{radius:60,minCount:2,minScore:100});
 target('lockdown',enemies,u=>u.def.mechanical&&!u.def.building&&!u.buffs.lockdown&&value(u)>=125,value);
 target('yamato',enemies,u=>u.hp+u.shield+u.matrix>=150,u=>value(u)+Math.min(u.hp+u.shield,260)*.2);
 target('mind',enemies,u=>mindTargetValid(caster,u)&&value(u)>=300,value);
 target('parasite',enemies,u=>!u.def.building&&u.parasite!==caster.team&&value(u)>=200,value);
 target('restore',allies,u=>u.buffs.ensnare>0||u.buffs.irradiate>0||u.buffs.plague>0||u.buffs.lockdown>0||u.buffs.maelstrom>0||u.buffs.blind>0||u.parasite!==null&&u.parasite!==undefined,value);
 target('flare',enemies,u=>!u.def.building&&!u.buffs.blind&&value(u)>=150,value);
 target('hallucinate',allies,u=>!u.hallucination&&!u.def.building&&value(u)>=200,value);
 target('consume',allies,u=>caster.energy<=125&&u.type===37&&u.commanderId===caster.commanderId,value);
 if(abilities.includes('swarm')&&caster.energy>=100){
  const threatened=allies.filter(u=>!u.def.air&&battle.nearbyAny(u,battle.spatialRange(200,true),e=>valid(e)&&e.team!==caster.team&&battle.unitThreatens(e,u)&&battle.weapon(e,u)?.range>40));
  const pick=bestCluster(battle,caster,'swarm',threatened,{radius:80,minCount:2,minScore:100});if(pick)opts.push({...pick,score:pick.score+200});
 }
 const priority={consume:0,feedback:1,matrix:1,storm:1,plague:1,stasis:1,web:1,lockdown:1,yamato:1,restore:1,broodlings:2,maelstrom:2,emp:2,mind:2,flare:2,irradiate:3,hallucinate:3,ensnare:4,parasite:5,swarm:0};
 return opts.sort((a,b)=>(priority[a.key]??5)-(priority[b.key]??5)||b.score-a.score||a.key.localeCompare(b.key))[0]||null;
}
