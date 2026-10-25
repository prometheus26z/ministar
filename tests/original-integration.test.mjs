import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {Battle} from '../dist/autobattle.js';
import {Battle as EconomyBattle} from '../dist/economy.js';
import {gasSlots,productionTileAllowed,PRODUCTION_OFFSET,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,BUILDING_WAVES,DESERT_STRIKE,WAVE_SECONDS,INCOME_SECONDS} from '../dist/lane-rules.js';
import {BUILDINGS} from '../dist/tech.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
const fresh=(race='terran',enemyRace=race)=>{const b=new Battle(data,{race,enemyRace});b.begin();return b};
const complete=(b,type,team=0)=>{const u=b.create(type,team,640,PRODUCTION_OFFSET+1100);u.productionOnly=true;return u};
const drainDeployments=b=>{let guard=0;while(b.pendingDeployments.some(queue=>queue.length)){b.deploymentBudget=[8,8];assert.ok(b.drainPendingDeployments().length,'rear zone has deployable space');if(++guard>100)throw Error('deployment queue did not drain')}};
function producerWithClearAddon(b,type,addon){
 for(let y=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+96;y<=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT-96;y+=32)for(let x=PRODUCTION_GROUND_X+96;x<=PRODUCTION_GROUND_X+PRODUCTION_GROUND_WIDTH-96;x+=32){
  const site=b.placementForTeam(0,type,{x,y});if(site.reason)continue;
  const parent=complete(b,type);parent.x=site.point.x;parent.y=site.point.y;
  if(!b.placementForTeam(0,addon,b.addonPoint(parent,addon),parent).reason)return parent;
  b.units.splice(b.units.indexOf(parent),1);
 }
 throw new Error(`No source-production placement found for add-on ${addon}`);
}

test('PUNI blocks Machine Shop in every lane construction path without changing payment or ownership state',()=>{
 const b=fresh('terran');b.money=10000;
 const factory=complete(b,113);factory.x=400;factory.y=PRODUCTION_OFFSET+800;
 const point=b.addonPoint(factory,120),valid=b.placementForTeam(0,120,point,factory);
 assert.equal(valid.reason,'','the blocked add-on test uses otherwise valid geometry');
 assert.deepEqual(b.addonOptions(factory),[]);
 assert.equal(b.addonReason(factory,'120'),'원본 맵에서 건설할 수 없는 건물입니다.');
 const before={money:b.money,units:b.units.length,spending:b.spendingHistory.length,parentChildren:b.units.filter(u=>u.parent===factory.id).length};
 assert.equal(b.addon(factory,120),false);
 assert.equal(b.build(b.builder,'120',{x:700,y:PRODUCTION_OFFSET+800}),false);
 assert.equal(b.execute('build:120',{x:700,y:PRODUCTION_OFFSET+800}),false);
 assert.equal(b.startConstruction(0,120,valid,factory),false);
 assert.equal(b.morph(factory,120),false);
 assert.deepEqual({money:b.money,units:b.units.length,spending:b.spendingHistory.length,parentChildren:b.units.filter(u=>u.parent===factory.id).length},before);
 assert.equal(b.addonOptions(complete(b,116)).includes(117),true);

 const vanilla=new EconomyBattle(data,{race:'terran',enemyRace:'terran'}),vanillaFactory=vanilla.create(113,0,400,400);
 assert.ok(vanilla.addonOptions(vanillaFactory).includes(120),'the shared Brood War graph retains the Machine Shop');
});

test('AI cannot plan or buy Machine Shops for any lane commander in 1v1, 2v2 or 3v3',()=>{
 for(const teamSize of [1,2,3]){
  const b=new Battle(data,{race:'terran',enemyRace:'terran',teamSize});b.begin();b.money=10000;b.botMoney=10000;
  const ais=[b.ai,...b.commanders.map(commander=>commander.ai).filter(Boolean)];
  assert.ok(ais.length>=teamSize);
  for(const ai of ais){
   const commanderId=ai.commanderId,team=ai.team;
   const before={money:team?b.botMoney:b.money,units:b.units.filter(u=>u.commanderId===commanderId).length,spending:b.spendingHistory.length};
   assert.equal(ai.build('120'),false,`teamSize=${teamSize}, commander=${commanderId}`);
   assert.equal(ai.nextRequirement(120),null,`teamSize=${teamSize}, commander=${commanderId}`);
   assert.deepEqual({money:team?b.botMoney:b.money,units:b.units.filter(u=>u.commanderId===commanderId).length,spending:b.spendingHistory.length},before);
  }
 }
});

test('AI site reserves the real add-on footprint and leaves Factory free of Machine Shop reservations',()=>{
 const b=fresh('terran'),ai=b.ai,calls=[],original=b.placementForTeam.bind(b);
 b.placementForTeam=(team,type,point,parent)=>{calls.push(Number(type));return original(team,type,point,parent)};
 for(const [building,realAddon]of [[106,107],[114,115],[116,117]]){calls.length=0;assert.ok(ai.site(building));assert.ok(calls.includes(realAddon),`building ${building} reserves real add-on ${realAddon}`);assert.equal(calls.includes(120),false)}
 calls.length=0;assert.ok(ai.site(113));assert.deepEqual([...new Set(calls)],[113],'Factory placement reserves no add-on footprint');
});

test('an allowed Covert Ops add-on produces three Siege Tanks while Factory keeps its own Goliaths',()=>{
 const b=fresh('terran');b.money=10000;
 const facility=producerWithClearAddon(b,116,117);
 const made=b.addon(facility,117);assert.equal(made,true,b.lastError);const covert=b.units.find(u=>u.type===117&&u.parent===facility.id);
 assert.ok(covert);assert.equal(b.waveProducers(0).includes(covert),false);assert.equal(b.activeWave(0).get(5),undefined);
 b.tickBotConstruction(covert,covert.construction.total);
 assert.equal(b.activeWave(0).get(5),3);
 const factory=complete(b,113);factory.x=800;factory.y=PRODUCTION_OFFSET+800;
 assert.equal(b.activeWave(0).get(3),3);assert.equal(b.activeWave(0).get(5),3);
});

test('all 328 source triggers have complete audited conditions/actions and exact source hash',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../resources/original-desertstrike.json',import.meta.url))),raw=zlib.gunzipSync(fs.readFileSync(new URL('../resources/desertstrike/scenario.chk.gz',import.meta.url)));
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),original.source.chkSha256);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../resources/desertstrike/original.scx',import.meta.url))).digest('hex'),original.source.sha256);
 assert.deepEqual(original.originalTriggers.map(t=>t.id),Array.from({length:328},(_,i)=>i+1));
 for(const t of original.originalTriggers){assert.ok(['적용','변환 적용','제외','버그 수정'].includes(t.portStatus));assert.ok(t.mappedRule);assert.ok(t.conditions.length);assert.ok(t.actions.length)}
 assert.equal(original.map.gasSlots.length,30);assert.equal(original.map.productionRegion.exclusiveInOriginal,false);
});

test('production crop uses original buildable mask and L-shaped geyser centers with fixed mirror transform',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../resources/original-desertstrike.json',import.meta.url)));
 for(const race of ['terran','zerg','protoss']){const b=fresh(race);for(const team of [0,1]){
  const slots=b.nodes.filter(n=>n.team===team);assert.deepEqual(slots.map(n=>({slot:n.slot,x:n.x,y:n.y})),gasSlots(team));
  const normalized=slots.map(n=>[team?1280-PRODUCTION_GROUND_X-n.x:n.x-PRODUCTION_GROUND_X,n.y-PRODUCTION_OFFSET-PRODUCTION_GROUND_Y]);assert.deepEqual(normalized,[[64,32],[192,32],[320,32],[64,96],[64,160]]);
 }}
 const mask=DESERT_STRIKE.map.productionRegion.buildable;
 for(let y=0;y<19;y++)for(let x=0;x<33;x++)assert.equal(productionTileAllowed(PRODUCTION_GROUND_X+x*32+16,PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+y*32+16),!!original.map.buildable[y*96+x]);
 assert.equal(mask.reduce((n,v)=>n+v,0),606);
});

test('source temples stay source-derived while mobile objectives use the symmetric adapted layout',()=>{
 const outposts=DESERT_STRIKE.map.objectives.outposts;
 assert.deepEqual(outposts[0],{x:1856/3,y:1632,owner:3,source:{x:624,y:1008}});
 assert.deepEqual(outposts[1],{x:1856/3,y:416,owner:7,source:{x:2448,y:1008}});
 const layout=DESERT_STRIKE.map.mobileLayout;
 assert.deepEqual(layout.mains,{'0':{x:640,y:1760},'1':{x:640,y:288}});
 assert.deepEqual(layout.outposts,{'0':{x:640,y:1280},'1':{x:640,y:768}});
 assert.equal(layout.mains[0].y-layout.outposts[0].y,480);assert.equal(layout.outposts[1].y-layout.mains[1].y,480);
 const b=fresh();
 assert.deepEqual({x:b.main.x,y:b.main.y},layout.mains[0]);assert.deepEqual({x:b.core.x,y:b.core.y},layout.mains[1]);
 assert.deepEqual({x:b.playerOutpost.x,y:b.playerOutpost.y},layout.outposts[0]);
 assert.deepEqual({x:b.enemyOutpost.x,y:b.enemyOutpost.y},layout.outposts[1]);
 assert.deepEqual(b.laneObjective(0),{id:'outpost-1',...layout.outposts[1]});
 assert.deepEqual(b.laneObjective(1),{id:'outpost-0',...layout.outposts[0]});
});

test('gas capacity, slot reservation, destruction reuse and simultaneous completion counters',()=>{
 const b=fresh();b.money=10000;
 for(const node of b.nodes.filter(n=>n.team===0))assert.ok(b.build(b.builder,110,node),b.lastError);
 assert.match(b.teamBuildReason(0,110),/최대 5/);assert.equal(b.units.filter(u=>u.gasNode&&u.team===0).length,5);
 for(const u of b.units.filter(u=>u.gasNode))b.tickBotConstruction(u,100);
 b.tickIncome(0);assert.equal(b.incomeAmount(),26);assert.ok(Math.abs(b.incomePauseLeft-655*.084)<1e-8,'exact-count one-shot triggers do not charge skipped levels');
 const u=b.units.find(u=>u.gasNode),node=b.nodes.find(n=>n.id===u.gasNode);b.die(u,1);assert.equal(node.occupiedBy,null);assert.ok(b.build(b.builder,110,node));
});

test('shared construction checks prerequisites, geometry and payment for player and AI',()=>{
 for(const race of ['terran','zerg','protoss']){const b=fresh(race);const type={terran:111,zerg:142,protoss:160}[race];b.botMoney=10000;
  const before=b.botMoney;assert.ok(b.ai.build(type));const u=b.units.find(u=>u.team===1&&u.type===type&&u.construction);assert.equal(b.botMoney,before-b.buildingCost(type)[0]);assert.equal(b.activeWave(1).size,0);
  b.tickBotConstruction(u,u.construction.total);assert.ok(b.activeWave(1).size>0);b.die(u,0);assert.equal(b.activeWave(1).size,0);
  assert.equal(b.ai.build({terran:118,zerg:140,protoss:169}[race]),false,'cannot skip prerequisites');
  for(const team of [0,1]){const main=team?b.core:b.main,post=team?b.enemyOutpost:b.playerOutpost;assert.equal(main.type,173);assert.equal(post.type,174);assert.ok(main.maxHp>post.maxHp);const prior=b.units.filter(u=>u.laneArmy&&u.team===team).length;b.die(post,1-team);assert.ok(b.units.filter(u=>u.laneArmy&&u.team===team).length>prior);const after=b.units.length;b.die(post,1-team);assert.equal(b.units.length,after)}
 }
});

test('tribunal and active-arbiter limits are separate and symmetric; deployed Lurkers begin on the ground',()=>{
 const b=fresh('protoss');for(const team of [0,1]){complete(b,167,team);complete(b,165,team);complete(b,170,team);complete(b,170,team);assert.match(b.teamBuildReason(team,170),/한도/);for(let i=0;i<4;i++){b.spawnWave(team);drainDeployments(b)}assert.equal(b.units.filter(u=>u.alive&&u.team===team&&u.type===71).length,3)}
 const spawning=fresh('protoss');spawning.deploymentBudget=[8,8];const m=spawning.spawnUnit(0,0,0,1,spawning.main);assert.equal(m.shield,0);const lurker=spawning.spawnUnit(103,0,0,1,spawning.main);assert.equal(lurker.burrowed,false);assert.equal(lurker.lurkerState,'ground');assert.equal(lurker.action,'idle');assert.equal(lurker.order,'attackmove');assert.ok(lurker.y>spawning.main.y);
});

test('special buildings consume once, heal in pulses, replace finite enemy snapshot, and require Archives',()=>{
 const b=fresh();const marine=b.create(0,0,600,900);marine.hp=1;const heal=complete(b,115);b.tickSpecials(.01);assert.equal(heal.alive,false);b.tickSpecials(13*.084);assert.equal(marine.hp,marine.maxHp);assert.ok(b.specialStates[0].heal);b.tickSpecials(45*13*.084);assert.equal(b.specialStates[0].heal,undefined);
 const z=fresh('zerg');for(let i=0;i<10;i++)z.create(0,1,400+i*25,900);const nydus=complete(z,134);z.tickSpecials(.01);assert.equal(nydus.alive,false);assert.equal(z.units.filter(u=>u.alive&&u.type===40).length,10);const count=z.units.length;z.tickSpecials(.01);assert.equal(z.units.length,count);assert.ok(z.units.filter(u=>u.type===40).every(u=>u.expiresAt));
 const p=fresh('protoss');p.money=9999;assert.match(p.teamBuildReason(0,172),/필요/);complete(p,160);complete(p,165);assert.equal(p.teamBuildReason(0,172),'');for(let i=0;i<6;i++)p.create(0,1,400+i*30,900);const battery=complete(p,172);p.tickSpecials(.01);assert.equal(battery.alive,false);assert.equal(p.units.filter(u=>u.alive&&u.type===0&&u.team===0).length,3);
});

// Economic/construction simulation isolates investment from battle outcome.
// Units are really deployed each wave, then retired between observations.
export function simulate(race,enemyRace=race){
 const b=fresh(race,enemyRace),history=[];let next=WAVE_SECONDS;
 for(let time=0;time<30*WAVE_SECONDS+.25;time+=.25){
  b.time=time;b.tickIncome(.25);for(const u of [...b.units])if(u.construction)b.tickBotConstruction(u,.25);b.tickSpecials(.25);b.botStep(.25);
  if(time+.25>=next){b.ai.observe();const snapshot=b.ai.snapshot();snapshot.wave=history.length+1;const before=b.units.filter(u=>u.alive&&u.team===1&&u.laneArmy).length;b.spawnWave(1);drainDeployments(b);const deployed=b.units.filter(u=>u.alive&&u.team===1&&u.laneArmy).length-before;assert.equal(deployed,snapshot.units);snapshot.deployed=deployed;history.push(snapshot);b.waveHistory.push(snapshot);b.units=b.units.filter(u=>!u.laneArmy);next+=WAVE_SECONDS}
 }
 assert.equal(history.length,30);return {b,history};
}
test('all nine race pairings grow through 5/10/20/30 real paid construction/deployment snapshots',()=>{
 const results=[];
 for(const race of ['terran','zerg','protoss'])for(const enemyRace of ['terran','zerg','protoss']){
  const {b,history}=simulate(race,enemyRace),last=history.at(-1);
  assert.equal(b.botMoney,300+b.incomeTotal[1]-last.spent);assert.ok(b.botMoney>=0);assert.ok(last.gas<=5);assert.ok(last.production>history[4].production);assert.ok(last.units>history[4].units);assert.ok(last.value>history[4].value);assert.ok(Object.keys(last.composition).length>=4);assert.ok(last.air>0);assert.ok(last.production>=8);assert.ok(last.spent>6000);
  assert.ok(b.units.filter(u=>u.productionOnly&&u.team===1).every(u=>u.def.race===enemyRace));
  results.push({player:race,enemy:enemyRace,snapshots:history.filter(h=>[5,10,20,30].includes(h.wave))});
 }
 fs.writeFileSync(new URL('../docs/desertstrike-ai-simulation.json',import.meta.url),JSON.stringify({scope:'economy/construction and actual deployment; armies retired between waves, not a combat win-rate measurement',results},null,2)+'\n');
});

test('AI observes deployed air and shifts candidate score without reading future builds',()=>{
 const b=fresh('terran');b.create(8,0,640,900).laneArmy=true;b.ai.observe();assert.equal(b.ai.observed.air,1);const score=b.ai.score(113);b.ai.observed.air=0;assert.ok(score>b.ai.score(113));
});

test('paid defensive structures deploy only on completion and share destruction with their producer',()=>{
 for(const [race,type]of [['terran',124],['zerg',146],['protoss',162]]){
  const b=fresh(race);assert.equal(b.units.filter(u=>u.isFortification).length,0);
  const u=complete(b,type);u.completed=false;u.construction={time:0,total:2,started:true};
  b.tickBotConstruction(u,1);assert.equal(u.deployedDefenseId,undefined);
  b.tickBotConstruction(u,1);const defense=b.units.find(t=>t.id===u.deployedDefenseId);assert.ok(defense);assert.equal(b.powered(defense),true);
  if(type===124){const ground=b.create(0,1,defense.x,defense.y-70),air=b.create(8,1,defense.x,defense.y-70);assert.equal(b.weapon(defense,ground),null);assert.ok(b.weapon(defense,air))}
  b.die(u,1);assert.equal(defense.alive,false);
 }
});
