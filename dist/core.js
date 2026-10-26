import {UnitGrid} from './spatial.js?v=0.16.16';
import {layeredActionSeconds} from './animation.js?v=0.16.16';
import {SPELL_RULES,broodlingsTargetValid,feedbackTargetValid,mindTargetValid,pointInSpellArea,spellEdgeInRange} from './spell-rules.js?v=0.16.16';
import {resolveUnitDefinition,resolveWeapon,acquisitionRange,attackHitCount,cooldownFrames,movementSpeed,healthDamageAfterArmor,shieldDamageAfterArmor,unitBoundsGap,inNoExpandRect as unitInNoExpandRect} from './combat-rules.js?v=0.16.16';
import {octileDistance,segmentAabbEntry,sweptCircleEntry,MOVEMENT_EPSILON} from './movement.js?v=0.16.16';
export const VERSION='0.16.16';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Brood War's 8-bit uphill roll misses on 0..119: 120 of 256 outcomes.
export const HIGH_GROUND_MISS_CHANCE=120/256;
export const MAX_DEATH_VISUAL_SECONDS=12;
const SPELL_IMPACT_IMAGES=Object.freeze({ensnare:383,plague:387,stasis:364,maelstrom:998,matrix:[377,378,379]});
class PathHeap{
 constructor(){this.items=[]}
 less(a,b){return (a.f-b.f||a.h-b.h||a.node-b.node)<0}
 push(value){const a=this.items;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(!this.less(a[i],a[p]))break;[a[i],a[p]]=[a[p],a[i]];i=p}}
 pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&this.less(a[c+1],a[c]))c++;if(!this.less(a[c],a[i]))break;[a[i],a[c]]=[a[c],a[i]];i=c}}return first}
 get length(){return this.items.length}
}
export const SPELLS={stim:['스팀팩',231,0,'instant'],siege:['시즈 / 탱크 모드',259,0,'instant'],cloak:['은폐 / 해제',253,25,'instant'],burrow:['잠복 / 해제',237,0,'instant'],repair:['수리',232,0,'ally'],load:['탑승',236,0,'ally'],unload:['모두 내리기',239,0,'instant'],mine:['스파이더 마인',234,0,'point'],storm:['사이오닉 스톰',244,75,'point'],lockdown:['락다운',250,100,'enemy'],mind:['마인드 컨트롤',319,150,'enemy'],matrix:['디펜시브 매트릭스',247,100,'ally'],irradiate:['이레디에이트',248,75,'enemy'],emp:['EMP',246,100,'point'],yamato:['야마토 포',249,150,'enemy'],restore:['리스토레이션',321,50,'ally'],flare:['옵티컬 플레어',322,75,'enemy'],broodlings:['브루들링',241,150,'enemy'],parasite:['패러사이트',240,75,'enemy'],ensnare:['인스네어',242,75,'point'],swarm:['다크 스웜',243,100,'point'],plague:['플레이그',245,150,'point'],consume:['컨슘',251,0,'ally'],feedback:['피드백',320,50,'enemy'],maelstrom:['메일스트롬',318,100,'point'],hallucinate:['할루시네이션',238,100,'ally'],recall:['리콜',253,150,'point'],stasis:['스테이시스 필드',252,100,'point'],web:['디스럽션 웹',317,125,'point']};
export class Battlefield{
 constructor(){this.w=1280;this.h=2048;this.cell=32;this.elevation=false;this.water=[];this.rocks=[{x:200,y:1056,w:288,h:192},{x:768,y:1088,w:288,h:192},{x:480,y:640,w:288,h:128},{x:96,y:384,w:192,h:128},{x:1024,y:384,w:160,h:128}];}
 heightAt(x,y){if(!this.elevation)return 0;if(y<576||y>=1472)return 2;if(y<640||y>=1408)return 1;return 0}
 blocked(x,y,r=0){return x<r||y<r||x>1280-r||y>2048-r||this.water.some(a=>x+r>a.x&&x-r<a.x+a.w&&y+r>a.y&&y-r<a.y+a.h)||this.rocks.some(a=>x+r>a.x&&x-r<a.x+a.w&&y+r>a.y&&y-r<a.y+a.h)}
 path(a,b,air=false,clearance=20,blocked=this.blocked.bind(this)){
  b={x:clamp(b.x,clearance,1280-clearance),y:clamp(b.y,clearance,2048-clearance)};if(air)return[b];
  const cell=p=>({x:clamp(Math.floor(p.x/32),0,39),y:clamp(Math.floor(p.y/32),0,63)}),s=cell(a),g=cell(b),key=p=>p.y*40+p.x,start=key(s),goal=key(g),open=new PathHeap(),cost=new Map([[start,0]]),prev=new Map(),closed=new Set(),heuristic=(x,y)=>octileDistance(g.x-x,g.y-y),startH=heuristic(s.x,s.y);
  open.push({node:start,f:startH,h:startH});let best=start,bh=startH;
  const center=(x,y)=>({x:x*32+16,y:y*32+16});
  const clear=(from,to)=>{if(blocked(to.x,to.y,clearance))return false;const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/8));for(let i=1;i<steps;i++){const f=i/steps;if(blocked(from.x+(to.x-from.x)*f,from.y+(to.y-from.y)*f,clearance))return false}return true};
  while(open.length){const {node:n}=open.pop();if(closed.has(n))continue;closed.add(n);const x=n%40,y=Math.floor(n/40),h=heuristic(x,y);if(h<bh-1e-9||Math.abs(h-bh)<=1e-9&&cost.get(n)<cost.get(best)){bh=h;best=n}if(n===goal){best=n;break}
   for(const [dx,dy]of[[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>39||yy<0||yy>63)continue;const nn=yy*40+xx;if(closed.has(nn))continue;const from=center(x,y),to=center(xx,yy);if(!clear(from,to))continue;
    if(dx&&dy&&(!clear(from,center(x+dx,y))||!clear(from,center(x,y+dy))))continue;
    const next=cost.get(n)+(dx&&dy?Math.SQRT2:1);if(next>=(cost.get(nn)??Infinity)-1e-9)continue;cost.set(nn,next);prev.set(nn,n);const hh=heuristic(xx,yy);open.push({node:nn,f:next+hh,h:hh});
   }
  }
  const route=[];for(let n=best;n!==start&&prev.has(n);n=prev.get(n))route.unshift(center(n%40,Math.floor(n/40)));
  if(best===goal&&!blocked(b.x,b.y,clearance))route.push(b);if(!route.length)return route;
  const smooth=[];let anchor={x:a.x,y:a.y},index=0;while(index<route.length){let far=index;for(let j=index;j<route.length;j++)if(clear(anchor,route[j]))far=j;smooth.push(route[far]);anchor=route[far];index=far+1}return smooth;
 }
}
export class Battle{
 constructor(data,{race='terran',difficulty='normal'}={}){this.data=data;this.race=race;this.difficulty=difficulty;this.phase='title';this.money=1200;this.gas=600;this.maxSupply=30;this.prepLeft=60;this.timeLeft=300;this.time=0;this.paused=false;this.menuOpen=false;this.targeting=null;this.selection=[];this.groups=Array.from({length:10},()=>[]);this.units=[];this.projectiles=[];this.pendingProjectiles=[];this.projectileVisuals=[];this.nextProjectileVisualId=1;this.areas=[];this.effects=[];this.map=new Battlefield();this.fog=new Uint8Array(2560);this.explored=new Uint8Array(2560);this.nextId=1;this.listeners=[];this.produced=0;this.kills=0;this.losses=0;this.damageDone=0;this.visionTimer=0;this.result=null;}
 on(fn){this.listeners.push(fn);return()=>this.listeners=this.listeners.filter(x=>x!==fn)}emit(type,rest={}){for(const fn of this.listeners)fn({type,...rest})}
 get allies(){return this.units.filter(u=>u.team===0&&u.alive&&!u.refunded)}get selected(){return this.selection.map(id=>this.units.find(u=>u.id===id)).filter(u=>u?.alive&&!u.loaded)}get supply(){return this.allies.reduce((n,u)=>n+u.def.supply,0)}get battleTimeScale(){return this.phase==='battle'&&this.menuOpen?.5:1}get timeScale(){return this.battleTimeScale}
 create(type,team,x,y){const baseDef=this.data.units[type];if(!baseDef)return null;const u={id:this.nextId++,type:Number(type),baseDef,mapDefOverride:null,def:baseDef,sourceCombatPlayer:null,team,x,y,r:baseDef.radius||10,hp:baseDef.hp,maxHp:baseDef.hp,shield:baseDef.shield,energy:baseDef.energy?Math.min(200,baseDef.energy):0,alive:true,loaded:null,passengers:[],cooldown:0,action:'idle',animTime:0,visualTime:0,direction:0,order:'stop',goal:null,path:[],anchor:{x,y},buffs:{},cloaked:!!baseDef.cloak,acidSporeTimers:[],burrowed:false,lurkerState:type===103?'ground':null,lurkerTransition:0,lurkerTransitionCount:0,lurkerSpines:[],sieged:false,matrix:0,mines:3,aiClock:0,target:null,hangar:null,fighter:null};u.def=resolveUnitDefinition(this,u,baseDef);this.units.push(u);this.spatial?.add(u);return u;}
 // The index lives only during a simulation step. External edits and UI queries
 // use the authoritative array; every step rebuilds it before any unit acts.
 nearby(point,radius){return this.spatial?this.spatial.query(point,radius,this.units):this.units}
 staticBlocked(x,y,r,ignore=null){
  if(this.map.blocked(x,y,r))return true;
  return this.nearby({x,y},r+(this.spatial?.maxExtent||64)).some(u=>u!==ignore&&u.alive&&!u.hidden&&!u.loaded&&!u.productionOnly&&u.def.building&&(!u.construction||u.construction.started)&&Math.abs(x-u.x)<=(u.def.footprint?.[0]||64)/2+r&&Math.abs(y-u.y)<=(u.def.footprint?.[1]||64)/2+r);
 }
 clearGroundSegment(from,to,r,ignore=null){
  if(this.map.blocked(from.x,from.y,r)||this.map.blocked(to.x,to.y,r))return false;
  for(const box of [...this.map.water,...this.map.rocks])if(segmentAabbEntry(from,to,{left:box.x-r,top:box.y-r,right:box.x+box.w+r,bottom:box.y+box.h+r})!==null)return false;
  const length=dist(from,to),mid={x:(from.x+to.x)/2,y:(from.y+to.y)/2},extent=length/2+r+(this.spatial?.maxExtent||64);
  for(const u of this.nearby(mid,extent))if(u!==ignore&&u.alive&&!u.hidden&&!u.loaded&&!u.productionOnly&&u.def.building&&(!u.construction||u.construction.started)){
   const w=(u.def.footprint||[64,64])[0]/2+r,h=(u.def.footprint||[64,64])[1]/2+r;
   if(segmentAabbEntry(from,to,{left:u.x-w,top:u.y-h,right:u.x+w,bottom:u.y+h})!==null)return false;
  }
  return true;
 }
 path(a,b,air=false,clearance=20,ignore=null){return this.map.path(a,b,air,clearance,(x,y,r)=>this.staticBlocked(x,y,r,ignore))}
 movementLimit(u,from,to){
  const length=dist(from,to);if(length<MOVEMENT_EPSILON)return 0;let first=1;const clearance=u.r*.55;
  const boundary=(start,end,min,max)=>{const delta=end-start;if(end<min&&delta<0)return (min-start)/delta;if(end>max&&delta>0)return (max-start)/delta;return 1};
  for(const t of [boundary(from.x,to.x,clearance,1280-clearance),boundary(from.y,to.y,clearance,2048-clearance)])if(t>=0&&t<first)first=t;
  const boxes=[...this.map.water,...this.map.rocks],mid={x:(from.x+to.x)/2,y:(from.y+to.y)/2},radius=length/2+u.r+(this.spatial?.maxExtent||64);
  for(const other of this.nearby(mid,radius)){
   if(other===u||!other.alive||other.loaded||other.productionOnly||other.fighter)continue;
   if(other.def.building){if(other.construction&&!other.construction.started)continue;const [w,h]=other.def.footprint||[64,64];boxes.push({x:other.x-w/2,y:other.y-h/2,w,h});continue}
   if(other.def.air||u.def.air)continue;
   const t=sweptCircleEntry(from,to,other,u.r+other.r);if(t!==null&&t<first)first=t;
  }
  for(const box of boxes){const t=segmentAabbEntry(from,to,{left:box.x-clearance,top:box.y-clearance,right:box.x+box.w+clearance,bottom:box.y+box.h+clearance});if(t!==null&&t<first)first=t}
  return first>=1?length:Math.max(0,length*first-MOVEMENT_EPSILON);
 }
 moveSafely(u,goal,dt){
  const from={x:u.x,y:u.y},dx=goal.x-u.x,dy=goal.y-u.y,d=Math.hypot(dx,dy);if(d<MOVEMENT_EPSILON)return false;
  const travel=Math.min(d,movementSpeed(this,u)*dt);if(travel<=0)return false;
  const base=Math.atan2(dy,dx),side=u.avoidSideUntil>this.time?u.avoidSide:((u.id&1)?1:-1),offsets=[0,side*Math.PI/8,-side*Math.PI/8,side*Math.PI/4,-side*Math.PI/4,side*3*Math.PI/8,-side*3*Math.PI/8,side*Math.PI/2,-side*Math.PI/2,side*5*Math.PI/8,-side*5*Math.PI/8,side*3*Math.PI/4,-side*3*Math.PI/4,side*7*Math.PI/8,-side*7*Math.PI/8,Math.PI];
  let best=null,bestScore=Infinity;
  for(const offset of offsets){const angle=base+offset,to={x:from.x+Math.cos(angle)*travel,y:from.y+Math.sin(angle)*travel};const moved=this.movementLimit(u,from,to);if(moved<.01)continue;
   const ratio=moved/travel,p={x:from.x+(to.x-from.x)*ratio,y:from.y+(to.y-from.y)*ratio};
   const score=dist(p,goal)+Math.abs(offset)*2+(u.avoidSideUntil>this.time&&Math.sign(offset||side)!==side ? .5 : 0);
   if(score<bestScore){bestScore=score;best={point:p,offset,moved}}
  }
  if(!best)return false;
  u.x=best.point.x;u.y=best.point.y;this.spatial?.update(u);
  u.direction=(Math.round(Math.atan2(best.point.x-from.x,from.y-best.point.y)*16/Math.PI)+32)%32;u.action='walk';
  if(Math.abs(best.offset)>Math.PI/32){u.avoidSide=Math.sign(best.offset);u.avoidSideUntil=this.time+.5}else if(u.avoidSideUntil<=this.time){u.avoidSide=0;u.avoidSideUntil=0}
  return true;
 }
 nearbyAny(point,radius,predicate){return this.spatial?this.spatial.queryAny(point,radius,predicate,this.units):this.units.some(predicate)}
 findUnit(id){return this.spatial?this.spatial.byId.get(id):this.units.find(u=>u.id===id)}
 spatialRange(radius,extent=false){return radius+(this.spatial?(extent?this.spatial.maxExtent:this.spatial.maxRadius):0)}
 begin(){if(this.phase!=='title')return false;this.projectiles=[];this.pendingProjectiles=[];this.projectileVisuals=[];this.nextProjectileVisualId=1;this.phase='prep';this.setupEnemy();this.updateVision();this.emit('phase');return true}
 setupEnemy(){this.core=this.create(106,1,640,220);const factor=this.difficulty==='easy'?.65:this.difficulty==='hard'?1.3:1;this.core.hp=this.core.maxHp=this.core.def.hp*factor;for(const [t,x,y]of[[125,560,510],[124,760,480],[109,450,360],[109,850,360],[0,540,850],[0,700,850],[0,600,880],[0,740,920],[3,960,950],[5,320,720],[0,630,430],[0,690,420]]){const u=this.create(t,1,x,y);if(u.def.building)u.hp=u.maxHp=u.def.hp*factor;u.order='hold'}if(this.difficulty==='hard')for(let i=0;i<6;i++)this.create(i%2?3:0,1,500+i*45,570);}
 buy(type){type=Number(type);const d=this.data.units[type];if(this.phase!=='prep'||!d||!this.data.races[this.race].includes(type))return false;const q=d.qty||1;if(this.money<d.cost[0]||this.gas<d.cost[1]||this.supply+q*d.supply>30)return false;this.money-=d.cost[0];this.gas-=d.cost[1];const created=[];for(let i=0;i<q;i++){const n=this.allies.length,u=this.create(type,0,420+n%8*60,1810+Math.floor(n/8)*50);u.purchase={cost:d.cost.map(n=>n/q)};created.push(u)}this.produced+=q;this.select(created.map(u=>u.id),false);this.updateVision();this.emit('change');return true;}
 refund(ids=this.selection){if(this.phase!=='prep')return false;let count=0;for(const u of this.allies.filter(u=>ids.includes(u.id))){this.money+=u.purchase?.cost[0]||0;this.gas+=u.purchase?.cost[1]||0;u.refunded=true;u.alive=false;count++;this.produced--}if(count){this.select([]);this.pruneGroups();this.updateVision();this.emit('change')}return!!count}
 autoCompose(){if(this.phase!=='prep')return;for(const u of [...this.allies])this.refund([u.id]);const plan={terran:[5,3,34,34,0,0,0,0,0,0,0,0,0,0,0,0],zerg:[39,103,103,38,38,38,38,37,37],protoss:[66,66,67,65,65,65,65,65,65,65,65]}[this.race];for(const t of plan)this.buy(t);this.select(this.allies.map(u=>u.id),false)}
 select(ids,voice=true){this.selection=[...new Set(ids)].filter(id=>this.allies.some(u=>u.id===id&&!u.loaded));this.emit('selection');this.emit('groups');if(voice&&this.selected[0])this.emit('voice',{unit:this.selected[0],kind:'select'});return this.selected}
 assignGroup(i){if(i<0||i>9||!this.selection.length)return false;this.groups[i]=[...this.selection];this.emit('groups');return true}recallGroup(i){if(i<0||i>9)return;this.pruneGroups();this.select(this.groups[i]);}
 pruneGroups(){const alive=new Set(this.allies.map(u=>u.id));this.groups=this.groups.map(g=>g.filter(id=>alive.has(id)));this.selection=this.selection.filter(id=>alive.has(id));this.emit('groups');}
 start(){if(this.phase!=='prep')return false;this.phase='battle';this.closeMenu();this.emit('phase');if(!this.allies.length)this.finish(false,'투입된 병력이 없습니다.');return true}
 openMenu(){if(this.phase!=='battle'||!this.selected.length)return false;this.menuOpen=true;this.targeting=null;this.emit('menu');return true}closeMenu(){this.menuOpen=false;this.targeting=null;this.emit('menu');}
 chooseCommand(key){if(!this.menuOpen)return false;if(['move','attack','patrol'].includes(key)||SPELLS[key]&&SPELLS[key][3]!=='instant'){this.targeting=key;this.emit('menu');return true}return this.execute(key)}
 setGoal(u,point,order){u.goal={x:clamp(point.x,20,1260),y:clamp(point.y,20,2028)};u.path=this.path(u,u.goal,u.def.air,u.def.air?0:u.r*.55,u);u.order=order;u.target=null;u.combatMoving=false;u.attackPathTarget=null;u.attackPath=[];u.attackRetries=0;u.aiClock=0;}
 execute(command,point=null,target=null){if(this.phase!=='battle'||!this.menuOpen||!this.selected.length)return false;let applied=0;const list=[...this.selected];if(['move','attack','patrol'].includes(command)&&!point)return false;
 for(const [i,u]of list.entries()){
  if(['move','attack','patrol'].includes(command)){if(u.def.building||u.burrowed||u.sieged)continue;const p={x:point.x+(i%5-2)*u.r*2.3,y:point.y+(Math.floor(i/5)-Math.floor(list.length/10))*u.r*2.3};u.anchor={x:u.x,y:u.y};this.setGoal(u,p,command==='attack'?(target?.team!==undefined&&target.team!==u.team?'focus':'attackmove'):command);if(u.order==='focus')u.target=target;applied++}
  else if(['hold','stop'].includes(command)){u.order=command;u.goal=null;u.path=[];u.target=null;u.anchor={x:u.x,y:u.y};applied++}
  else if(u.def.abilities.includes(command)&&this.cast(u,command,point,target))applied++;
 }
 if(!applied)return false;this.emit('command',{command,point,applied});this.emit('voice',{unit:list[0],kind:'yes'});this.closeMenu();this.emit('change');return true;}
 cast(u,key,p,target){if(!u?.alive||u.hallucination||u.loaded||u.hidden||u.productionOnly||u.def.building||u.buffs.stasis>0||u.buffs.lockdown>0||u.buffs.maelstrom>0)return false;const s=SPELLS[key],rule=SPELL_RULES[key];if(!s)return false;if(u.energy<s[2]&&!(key==='cloak'&&u.cloaked))return false;if(s[3]==='enemy'&&(!target?.alive||target.team===u.team||target.loaded||target.hidden||target.productionOnly||!this.canSee(u.team,target)))return false;if(s[3]==='ally'&&(!target?.alive||target.team!==u.team||target.loaded||target.hidden||target.productionOnly))return false;if(s[3]==='point'&&(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false;if(target&&key!=='recall'&&!spellEdgeInRange(this,u,target,key))return false;if(p&&key!=='recall'&&dist(u,p)>(rule?.range??380))return false;
  if(key==='feedback'&&!feedbackTargetValid(target)||key==='broodlings'&&!broodlingsTargetValid(target)||key==='mind'&&!mindTargetValid(u,target))return false;
  if(key==='irradiate'&&(!target?.def.organic||target.def.building))return false;
  if(key==='matrix'&&(target.def.building||target.matrix>0))return false;
  if(key==='lockdown'&&(!target.def.mechanical||target.def.building))return false;
  if(key==='consume'&&(!target.def.organic||target.def.building||target.team!==u.team||target.commanderId!==u.commanderId||target===u))return false;
  if(key==='stim'){if(u.hp<=10)return false;u.hp-=10;u.buffs.stim=15}
  else if(key==='siege'){u.sieged=!u.sieged;u.goal=null;u.path=[];u.order='hold'}
  else if(key==='cloak'){u.cloaked=!u.cloaked;if(!u.cloaked)return true}
  else if(key==='burrow'){if(u.type===103){if(!this.beginLurkerTransition(u))return false}else{u.burrowed=!u.burrowed;u.action=u.burrowed?'burrow':'unburrow';u.animTime=0;u.goal=null;u.path=[];u.order='hold'}}
  else if(key==='load'){if(target===u||target.def.air||target.def.building||target.loaded||u.passengers.reduce((n,id)=>n+(this.units.find(a=>a.id===id)?.def.space||1),0)+(target.def.space||1)>u.def.capacity)return false;target.loaded=u.id;u.passengers.push(target.id);this.select(this.selection.filter(id=>id!==target.id),false)}
  else if(key==='unload'){for(const id of u.passengers){const a=this.units.find(a=>a.id===id);if(a){a.loaded=null;a.x=clamp(u.x+Math.random()*45-22,20,1260);a.y=clamp(u.y+Math.random()*45-22,20,2028)}}u.passengers=[]}
  else if(key==='repair'){if(!target.def.mechanical||target===u)return false;u.order='repair';u.target=target;this.setGoal(u,target,'repair');u.target=target}
  else if(key==='mine'){if(!u.mines)return false;u.mines--;const m=this.create(13,u.team,p.x,p.y);m.burrowed=true;m.order='hold'}
  else if(key==='matrix'){target.matrix=rule.shield;target.buffs.matrix=rule.duration}
  else if(key==='lockdown')target.buffs.lockdown=rule.duration
  else if(key==='mind'){if(target.hallucination)this.die(target);else{const passengers=(target.passengers||[]).map(id=>this.units.find(a=>a.id===id)).filter(Boolean);if(typeof this.transferOwnershipWithChildren==='function')this.transferOwnershipWithChildren(target,u.team,u.commanderId);else{target.team=u.team;target.commanderId=u.commanderId}target.target=null;target.goal=null;target.path=[];target.order='attackmove';target.laneArmy=!!u.laneArmy;if(target.laneArmy&&typeof this.laneObjective==='function'){this.setAdvanceGoal(target,this.laneObjective(u.team));target.laneObjectiveId=this.laneObjective(u.team).id}for(const a of passengers){a.team=u.team;a.commanderId=u.commanderId;a.target=null;a.goal=null;a.path=[];a.laneArmy=!!u.laneArmy}this.spatial?.update(target)}u.shield=0;this.pruneGroups()}
  else if(key==='irradiate'){target.buffs.irradiate=rule.duration;target.irradiateOwner=u.team;target.irradiatePulseElapsed=0;target.irradiatePulseCount=0}
  else if(key==='yamato'){const p={x:u.x,y:u.y,endX:target.x,endY:target.y,target,source:u,team:u.team,image:536,elapsed:0,speed:420,damage:260,spell:true,damageContext:{acidBonusEligible:true},type:3,splash:[]};p.visual=this.addProjectileVisual(p);p.visualId=p.visual.id;this.projectiles.push(p)}
  else if(key==='restore'){for(const effect of ['ensnare','irradiate','lockdown','maelstrom','plague','blind'])target.buffs[effect]=0;target.parasite=null;target.irradiateOwner=null;target.irradiatePulseElapsed=0;target.irradiatePulseCount=0;target.acidSporeTimers=[]}
  else if(key==='flare')target.buffs.blind=Infinity
  else if(key==='broodlings'){const x=target.x,y=target.y;this.die(target,u.team);for(let i=0;i<2;i++){const def=this.data.units[40],point=typeof this.deploymentPoint==='function'?this.deploymentPoint(def,u.team,{x:x+(i?10:-10),y:y+(i?10:-10)},20):{x:x+(i?10:-10),y:y+(i?10:-10)};if(point){const a=this.create(40,u.team,point.x,point.y);a.laneArmy=!!u.laneArmy;a.commanderId=u.commanderId;a.expiresAt=this.time+1800/24;if(a.laneArmy&&typeof this.laneObjective==='function'){this.setAdvanceGoal(a,this.laneObjective(u.team));a.laneObjectiveId=this.laneObjective(u.team).id}}}}
  else if(key==='consume'){if(!target.def.organic||target===u)return false;this.die(target);u.energy=Math.min(u.def.energy,u.energy+50)}
  else if(key==='feedback'){const damage=target.energy;target.energy=0;if(damage>0)this.hitUnit(target,damage,u.team,3,null,u,{acidBonusEligible:true})}
  else if(key==='hallucinate'){if(target.def.building)return false;for(let i=0;i<2;i++){const a=this.create(target.type,u.team,target.x+25*(i+1),target.y);a.hallucination=true;this.clearHangar?.(a);a.laneArmy=!!u.laneArmy;a.commanderId=u.commanderId;a.buffs.hallucination=SPELL_RULES.hallucinate.duration}}
  else if(key==='parasite')target.parasite=u.team;
  else if(key==='recall'){for(const a of this.allies.filter(a=>dist(a,p)<110&&!a.def.building&&!a.loaded)){a.x=u.x+Math.random()*80-40;a.y=u.y+Math.random()*80-40;a.goal=null;a.path=[]}}
  else if(key==='emp'){for(const a of this.nearby(p,rule.radius).filter(a=>a.alive&&a!==u&&!a.buffs.stasis&&pointInSpellArea(a,p,rule.radius))){a.shield=0;a.energy=0}}
  else if(['ensnare','maelstrom','stasis','plague'].includes(key)){const r=rule.radius,duration=rule.duration;for(const a of this.nearby(p,r).filter(a=>a.alive&&!a.loaded&&a!==u&&pointInSpellArea(a,p,r))){if(key==='ensnare'){if(!a.def.building&&!a.burrowed&&!a.buffs.stasis)a.buffs.ensnare=duration}else if(key==='maelstrom'){if(a.def.organic&&!a.def.building&&!a.buffs.stasis)a.buffs.maelstrom=duration}else if(key==='stasis'){if(!a.def.building&&!a.buffs.stasis)a.buffs.stasis=duration}else if(key==='plague'&&!a.def.building&&!a.buffs.stasis)a.buffs.plague=duration}}
  else{const duration=rule?.duration??12;this.areas.push({kind:key,image:key==='storm'?525:key==='swarm'?337:key==='web'?951:null,x:p.x,y:p.y,r:key==='storm'?rule.radius:rule?.radius||96,halfWidth:rule?.halfWidth,halfHeight:rule?.halfHeight,left:duration,duration,team:u.team,tick:key==='storm'?0:rule?.interval??0,hitIds:new Set()});}
  if(key==='recall'||key==='unload')for(const a of this.units)this.spatial?.update(a);
  u.energy=Math.max(0,u.energy-s[2]);if(!['burrow','siege','cloak'].includes(key)){u.action='cast';u.animTime=0}const spellPoint=p??(target?{x:target.x,y:target.y}:null);if(spellPoint){const imageSpec=SPELL_IMPACT_IMAGES[key],overlaySize=clamp(target?.def?.spellOverlaySize??((target?.def?.size||0)>=3?2:(target?.def?.size||0)===2?1:0),0,2),image=Array.isArray(imageSpec)?imageSpec[overlaySize]:imageSpec,track=image&&this.data.graphics?.[image]?.tracks?.idle,duration=Math.max(0.12,(track?.ticks||12)/24);if(Number.isInteger(image))this.effects.push({kind:'spell',spell:key,image,x:spellPoint.x,y:spellPoint.y,team:u.team,left:duration,duration})}this.emit('spell',{casterId:u.id,commanderId:u.commanderId,team:u.team,key,targetId:target?.id??null,point:spellPoint,energyAfter:u.energy});this.emit('change');return true;
 }
 detectedBy(team,u){
  for(const detector of this.nearby(u,(this.spatial?.maxSight||0)+u.r)){
   if(!detector.alive||detector.team!==team||!detector.def.detector||detector.loaded||detector.hidden||detector.productionOnly||detector.buffs?.stasis>0)continue;
   if(detector.construction&&!this.ready(detector))continue;
   if(detector.def.building&&typeof this.powered==='function'&&!this.powered(detector)&&!detector.isMain&&!detector.isOutpost)continue;
   if(!detector.def.air&&!u.def.air&&this.map.heightAt(detector.x,detector.y)<this.map.heightAt(u.x,u.y))continue;
   const range=detector.buffs?.blind>0?64:detector.def.sight||0;
   if(dist(detector,u)<range+u.r)return true;
  }
  return false;
 }
 // Burrowing locks movement immediately, but concealment starts after the last transition frame.
 isHiddenByBurrow(u){return !!u?.burrowed&&!(u.type===103&&u.lurkerState==='burrowing')}
 hasArbiterAura(u){if(!u?.alive||u.team===undefined||u.def?.building||[71,86,14].includes(u.type)||u.def?.powerup||u.hallucination||u.hidden||u.loaded||u.productionOnly||u.construction||u.egg)return false;return this.nearbyAny(u,this.spatialRange(160*Math.SQRT2,true),a=>{if(!a.alive||![71,86].includes(a.type)||a.team!==u.team||a===u||a.hallucination||a.hidden||a.loaded||a.productionOnly||a.buffs?.stasis>0||a.buffs?.lockdown>0||a.buffs?.maelstrom>0||a.construction||a.egg||!this.inNoExpandRect(u,a,160))return false;const weapon=resolveWeapon(this.data,this,a,true),range=weapon?.range??this.data.weapons?.[77]?.range??160;return this.edgeDistance(a,u)<=range});}
 isEffectivelyCloaked(u){return !!(u?.cloaked||this.hasArbiterAura(u))}
 canSee(team,u){if(u.team===team)return true;const friends=this.units.filter(a=>a.alive&&!a.loaded&&a.team===team),canObserve=a=>(a.def.air||u.def.air||this.map.heightAt(a.x,a.y)>=this.map.heightAt(u.x,u.y))&&dist(a,u)<(a.buffs.blind>0?64:a.def.sight)+u.r;if(!friends.some(canObserve)&&u.parasite!==team)return false;const burrowHidden=this.isHiddenByBurrow(u),revealed=!burrowHidden&&(u.buffs.ensnare>0||u.buffs.maelstrom>0||u.buffs.plague>0);if((this.isEffectivelyCloaked(u)||burrowHidden)&&!revealed&&!this.detectedBy(team,u))return false;return true;}
 updateVision(){this.fog.fill(0);for(const u of this.units.filter(u=>u.alive&&!u.loaded&&(u.team===0||u.parasite===0))){const r=u.buffs.blind>0?64:u.def.sight;for(let y=Math.max(0,Math.floor((u.y-r)/32));y<=Math.min(63,Math.floor((u.y+r)/32));y++)for(let x=Math.max(0,Math.floor((u.x-r)/32));x<=Math.min(39,Math.floor((u.x+r)/32));x++)if(Math.hypot(x*32+16-u.x,y*32+16-u.y)<r+24)this.explored[y*40+x]=this.fog[y*40+x]=1;}}
 weapon(u,target){return resolveWeapon(this.data,this,u,!!target?.def?.air);}
 addProjectileVisual(projectile){const id=this.nextProjectileVisualId++,direction=(Math.round(Math.atan2(projectile.endX-projectile.x,projectile.y-projectile.endY)*16/Math.PI)+32)%32,visual={id,shotId:id,kind:'projectile',weaponId:projectile.weapon?.id??null,impactImage:projectile.impactImage??null,image:projectile.image,team:projectile.team,sourceId:projectile.source?.id??null,targetId:projectile.target?.id??null,missed:!!projectile.missed,x:projectile.x,y:projectile.y,startX:projectile.x,startY:projectile.y,endX:projectile.endX,endY:projectile.endY,direction,age:0,flightElapsed:0,arrived:false,firstRendered:false,trail:[]};this.projectileVisuals.push(visual);if(this.projectileVisuals.length>512)this.projectileVisuals.splice(0,this.projectileVisuals.length-512);return visual;}
 addInstantVisual({kind='hitscan',image=null,impactImage=null,team=0,sourceId=null,targetId=null,weaponId=null,missed=false,startX,startY,endX,endY,direction=0,duration=.1,fallbackDuration=.1}){const id=this.nextProjectileVisualId++,visual={id,shotId:id,kind,image,impactImage,team,sourceId,targetId,weaponId,missed,x:startX,y:startY,startX,startY,endX,endY,direction,age:0,duration,fallbackDuration,firstRendered:false,trail:[]};this.projectileVisuals.push(visual);if(this.projectileVisuals.length>512)this.projectileVisuals.splice(0,this.projectileVisuals.length-512);return visual;}
 markProjectileVisualsRendered(){for(const visual of this.projectileVisuals)visual.firstRendered=true;}
 tickProjectileVisuals(dt){for(const visual of this.projectileVisuals)visual.age+=dt;this.projectileVisuals=this.projectileVisuals.filter(visual=>{if(!visual.firstRendered)return true;const life=visual.kind==='projectile'?Math.max(.12,visual.flightElapsed+.06):visual.kind==='contact'?visual.duration:visual.duration;return visual.age<life});}
 edgeDistance(a,b){if(b.def.building){const [w,h]=b.def.footprint||this.data.units[b.type]?.footprint||[64,64],dx=Math.max(0,Math.abs(a.x-b.x)-w/2),dy=Math.max(0,Math.abs(a.y-b.y)-h/2);return Math.max(0,Math.hypot(dx,dy)-(a.r||0))}return Math.max(0,dist(a,b)-(a.r||0)-(b.r||0))}
 canAttackTarget(u,t){return !!t&&t.alive&&!t.def?.invincible&&!t.hidden&&!t.productionOnly&&!t.loaded&&!t.fighter?.docked&&t.team!==u.team&&this.canSee(u.team,t)&&!!this.weapon(u,t)&&!t.buffs?.stasis}
 approachPath(u,t,edgeRange){
  const [w,h]=t.def.building?(t.def.footprint||this.data.units[t.type]?.footprint||[64,64]):[0,0],angles=[0,Math.PI/4,Math.PI/2,Math.PI*3/4,Math.PI,-Math.PI*3/4,-Math.PI/2,-Math.PI/4],direct=[],crowdAt=p=>this.nearby(p,this.spatialRange(u.r+10)).reduce((n,a)=>n+(a!==u&&a.alive&&!a.hidden&&!a.productionOnly&&!a.loaded&&!a.def.building&&a.def.air===u.def.air&&dist(a,p)<u.r+a.r+10?Math.max(0,u.r+a.r+10-dist(a,p))*2:0),0),points=[];
  for(const angle of angles){const dx=Math.cos(angle),dy=Math.sin(angle),boundary=t.def.building?Math.min(Math.abs(dx)>1e-4?w/2/Math.abs(dx):Infinity,Math.abs(dy)>1e-4?h/2/Math.abs(dy):Infinity):t.r,p={x:clamp(t.x+dx*(boundary+u.r+edgeRange),20,1260),y:clamp(t.y+dy*(boundary+u.r+edgeRange),20,2028)};if(!u.def.air&&this.staticBlocked(p.x,p.y,u.r*.55,u))continue;points.push(p);if(u.def.air||this.clearGroundSegment(u,p,u.r*.55,u))direct.push({path:[p],point:p,score:dist(u,p)+crowdAt(p)})}
  if(direct.length)return direct.sort((a,b)=>a.score-b.score)[0];const routed=[];for(const p of points){const path=this.path(u,p,u.def.air,u.def.air?0:u.r*.55,u);if(!path.length||dist(path[path.length-1],p)>36)continue;if(dist(path[path.length-1],p)>4){if(!u.def.air&&!this.clearGroundSegment(path[path.length-1],p,u.r*.55,u))continue;path.push(p)}let length=dist(u,path[0]);for(let i=1;i<path.length;i++)length+=dist(path[i-1],path[i]);routed.push({path,point:p,score:length+crowdAt(p)})}return routed.sort((a,b)=>a.score-b.score)[0]||null;
 }
 targetScore(u,t,w=this.weapon(u,t)){const edge=this.edgeDistance(u,t),gap=Math.max(0,edge-w.range),minGap=Math.max(0,(w.minRange||0)-edge),threat=this.unitThreatens(t,u)?1:0,passive=t.def.building&&!threat?1:0;return((gap>0||minGap>0)?240:0)+gap*2+minGap*3+dist(u,t)*.18-threat*90+passive*45}
 unitThreatens(attacker,target){if(!attacker?.alive||attacker.hidden||attacker.productionOnly||attacker.loaded||attacker.buffs.stasis>0||attacker.buffs.lockdown>0||attacker.buffs.maelstrom>0)return false;if(attacker.def.building&&typeof this.powered==='function'&&!this.powered(attacker))return false;if(attacker.garrison?.length)return attacker.garrison.some(id=>{const d=this.data.units[id],w=this.data.weapons[target.def.air?d?.airWeapon:d?.groundWeapon];return !!w?.damage&&(target.def.air?w.air:w.ground)});return !!this.weapon(attacker,target)}
 activelyAttacking(attacker,target){return !!attacker?.alive&&attacker.target===target&&['attack','airAttack'].includes(attacker.action)}
 betterTarget(u,current){
  const aggro=[this.findUnit(u.aggroTarget)].find(t=>this.canAttackTarget(u,t));
  if(u.order!=='focus'&&aggro&&u.aggroUntil>this.time){if(current===aggro)return aggro;if(this.activelyAttacking(current,u))return current;return aggro}
  const cw=this.weapon(u,current),base=this.targetScore(u,current,cw),scanRange=acquisitionRange(this,u),threats=this.nearby(u,this.spatialRange(scanRange+u.r)).filter(t=>t!==current&&this.canAttackTarget(u,t)&&dist(u,t)<=acquisitionRange(this,u,t.def.air)+u.r+t.r).map(t=>({t,w:this.weapon(u,t),edge:this.edgeDistance(u,t)})).filter(a=>a.edge<=a.w.range&&a.edge>=(a.w.minRange||0)).sort((a,b)=>this.targetScore(u,a.t,a.w)-this.targetScore(u,b.t,b.w));
  return threats.length&&base-this.targetScore(u,threats[0].t,threats[0].w)>80?threats[0].t:current;
 }
 acquireTarget(u){const scanRange=acquisitionRange(this,u),candidates=this.nearby(u,this.spatialRange(scanRange+u.r)).filter(t=>this.canAttackTarget(u,t)&&dist(u,t)<=acquisitionRange(this,u,t.def.air)+u.r+t.r);const unavailable=u.unreachableTargets||{};const source=[this.findUnit(u.aggroTarget)].find(t=>this.canAttackTarget(u,t));if(source&&u.aggroUntil>this.time&&(!unavailable[source.id]||unavailable[source.id]<=this.time)&&dist(u,source)<=acquisitionRange(this,u,source.def.air)+u.r+source.r){const w=this.weapon(u,source),edge=this.edgeDistance(u,source);if(u.order!=='hold'||edge<=w.range&&edge>=(w.minRange||0))if(edge<=w.range&&edge>=(w.minRange||0)||u.order!=='hold')return source;}
  const scored=candidates.filter(t=>!unavailable[t.id]||unavailable[t.id]<=this.time).map(t=>{const w=this.weapon(u,t),edge=this.edgeDistance(u,t),gap=Math.max(0,edge-w.range),minGap=Math.max(0,(w.minRange||0)-edge);return{t,w,edge,gap,minGap,score:this.targetScore(u,t,w)}}).sort((a,b)=>a.score-b.score);
  for(const c of scored){if(c.gap<=0&&c.minGap<=0)return c.t;if(u.order==='hold')continue;if(this.approachPath(u,c.t,Math.max(c.w.minRange||0,c.w.range-3)))return c.t;u.unreachableTargets||={};u.unreachableTargets[c.t.id]=this.time+1.5}
  return null;
 }
 moveCombat(u,p,dt){return !!p&&this.move(u,p,dt);
 }
 medicAssigned(m,t){return this.units.some(a=>a!==m&&a.type===34&&a.alive&&!a.hidden&&!a.productionOnly&&!a.loaded&&a.energy>=1&&!a.buffs.stasis&&!a.buffs.lockdown&&!a.buffs.maelstrom&&a.healTarget===t&&this.medicTargetValid(a,t))}
 medicTargetValid(m,t){return !!t&&t.alive&&!t.hidden&&!t.productionOnly&&!t.loaded&&t.team===m.team&&t!==m&&t.def.organic&&!t.def.building&&!t.def.air&&!t.hallucination&&!t.buffs.stasis&&!t.buffs.lockdown&&!t.buffs.maelstrom&&t.hp<t.maxHp}
 medicHeal(m,dt){if(m.type!==34)return false;const release=()=>{m.healTarget=null;m.healPath=[];if(m.goal)m.path=this.path(m,m.goal,m.def.air,m.def.air?0:m.r*.55,m)};if(m.order==='move'||m.energy<1){if(m.healTarget)release();return false}if((!this.medicTargetValid(m,m.healTarget)||this.medicAssigned(m,m.healTarget)||m.order==='hold'&&this.edgeDistance(m,m.healTarget)>30)&&m.healTarget)release();
  if(!m.healTarget){const candidates=this.nearby(m,160).filter(t=>this.medicTargetValid(m,t)&&dist(m,t)<=160&&(m.order!=='hold'||this.edgeDistance(m,t)<=30)&&!this.medicAssigned(m,t)&&!(m.healUnavailable?.[t.id]>this.time)).map(t=>({t,missing:t.maxHp-t.hp,score:dist(m,t)-(t.maxHp-t.hp)*.08})).sort((a,b)=>a.score-b.score);m.healTarget=candidates[0]?.t||null}
  const t=m.healTarget;if(!t)return false;
  if(this.edgeDistance(m,t)<=30){const amount=Math.min(18.75*dt,t.maxHp-t.hp,m.energy*2);if(amount>0){t.hp=Math.min(t.maxHp,t.hp+amount);m.energy=Math.max(0,m.energy-amount*.5);m.action='cast'}if(t.hp>=t.maxHp||m.energy<=0)release();return true}
  m.healPathClock=(m.healPathClock||0)-dt;if(!m.healPath?.length||m.healPathClock<=0||m.healPathTarget!==t.id||m.healPathPoint&&dist(m.healPathPoint,t)>20){const path=this.approachPath(m,t,27);m.healPath=path?.path||[];m.healPathTarget=t.id;m.healPathPoint={x:t.x,y:t.y};m.healPathClock=.55;if(!m.healPath.length){m.healUnavailable||={};m.healUnavailable[t.id]=this.time+1;release();return false}}
  const waypoint=m.healPath[0],before={x:m.x,y:m.y};this.moveCombat(m,waypoint,dt);if(dist(m,waypoint)<5)m.healPath.shift();if(dist(m,before)<.05){m.healStall=(m.healStall||0)+dt;if(m.healStall>.45){m.healPath=[];m.healPathClock=0;m.healStall=0}}else m.healStall=0;m.action='walk';return true;
 }
 hurt(u,damage,team,type=3,ignore=false,damageContext={}){
  if(!u?.alive||u.hidden||u.loaded||u.productionOnly||u.def?.invincible||u.buffs.stasis>0||!(damage>0))return 0;
  if(u.hallucination)damage*=2;
  if(damageContext.acidBonusEligible&&!u.hallucination)damage+=Math.min(9,u.acidSporeTimers?.length??0);
  const before=u.hp+u.shield;
  if(u.matrix){const absorbed=Math.min(u.matrix,damage);u.matrix-=absorbed;damage-=absorbed}
  let shieldAbsorbed=0;
  if(damage>0&&u.shield>=1){const shieldHit=shieldDamageAfterArmor(u,damage,ignore||type===4);shieldAbsorbed=Math.min(u.shield,shieldHit);u.shield=Math.max(0,u.shield-shieldAbsorbed);damage=Math.max(0,shieldHit-shieldAbsorbed)}
  if(damage>0)u.hp=Math.max(0,u.hp-healthDamageAfterArmor(u,damage,type,ignore,{minimum:shieldAbsorbed>0?0:.5}));
  const dealt=Math.max(0,before-Math.max(0,u.hp)-u.shield);if(team===0)this.damageDone+=dealt;if(u.hp<=0)this.die(u,team);return dealt;
 }
 die(u,team=-1){
  if(!u.alive)return;
  const graphics=this.data.graphics[u.def.image],deathTrack=graphics?.tracks?.death||graphics?.tracks?.dead,death=deathTrack?.sounds||[];
  if(death.length)this.emit('sfx',{id:death[Math.floor(Math.random()*death.length)]});
  const trackSeconds=layeredActionSeconds(this.data.graphics,u.def.image,'death',1.8);
  u.deathDuration=Math.max(.2,Math.min(MAX_DEATH_VISUAL_SECONDS,trackSeconds));
  this.onUnitDeath?.(u,team);u.alive=false;u.hp=0;u.deathTime=this.time;u.action='death';u.animTime=0;
  if(u.team===0)this.losses++;else if(team===0&&!u.def.building)this.kills++;
  for(const id of u.passengers||[]){const a=this.units.find(a=>a.id===id);if(a)this.die(a,team)}
  this.pruneGroups();this.emit('selection');
 }
 uphillMiss(attacker,target,weapon){return !attacker.def.air&&!target.def.air&&weapon.range>=40&&this.map.heightAt(target.x,target.y)>this.map.heightAt(attacker.x,attacker.y)&&Math.random()<HIGH_GROUND_MISS_CHANCE;}
 missPoint(attacker,target){const angle=Math.random()*Math.PI*2,distance=24+Math.random()*24;return{x:target.x+Math.cos(angle)*distance,y:target.y+Math.sin(angle)*distance}}
 inNoExpandRect(point,unit,radius){const rect={left:point.x-radius,top:point.y-radius,right:point.x+radius,bottom:point.y+radius};return unitInNoExpandRect(point,unit,rect,this.data)}
 splashHits(point,weapon,primaryTarget=null,attacker=null){
  const [inner=0,medium=0,outer=0]=weapon.splash||[];if(!outer||!['Radial_Splash','Enemy_Splash','Air_Splash'].includes(weapon.explosionType))return[];
  const airOnly=weapon.explosionType==='Air_Splash',eligible=u=>u.alive&&!u.loaded&&!u.hidden&&!u.productionOnly&&!u.def.invincible&&!u.buffs?.stasis&&u!==attacker&&(airOnly?u.def.air:weapon.air&&u.def.air||weapon.ground&&!u.def.air);
  const candidates=this.nearby(point,this.spatialRange(outer,true)).filter(eligible).map(unit=>({unit,gap:unitBoundsGap(point,unit,this.data)})).filter(v=>v.gap<=outer);
  if(airOnly){
   const fullCandidates=candidates.filter(v=>v.unit.team!==attacker?.team);
   let full=fullCandidates.find(v=>v.unit===primaryTarget&&v.gap<=inner);
   if(!full&&fullCandidates.length){const random=this.random||Math.random;full=fullCandidates[Math.floor(random()*fullCandidates.length)]}
   const hits=[];if(full)hits.push({target:full.unit,factor:1,channel:'air-full'});
   for(const {unit,gap}of candidates){if(unit===primaryTarget||unit.team===attacker?.team||unit.type===73)continue;const factor=gap<=medium?.5:gap<=outer?.25:0;if(factor)hits.push({target:unit,factor,channel:'air-splash'})}
   return hits;
  }
  return candidates.filter(v=>v.unit!==primaryTarget||primaryTarget?.alive===false).map(({unit,gap})=>{
   if(unit.team===attacker?.team&&weapon.explosionType==='Enemy_Splash')return null;
   if(unit.burrowed&&gap>inner)return null;
   const factor=gap<=inner?1:gap<=medium?.5:gap<=outer?.25:0;
   return factor?{target:unit,factor,channel:'ground-splash'}:null;
  }).filter(Boolean);
 }
 applySplashHits(hits,weapon,damage,team,attacker){for(const {target,factor}of hits)this.hitUnit(target,damage*factor,team,weapon.type,null,attacker,{acidBonusEligible:true})}
 addAcidSpores(point,team,attacker){
  for(const unit of this.nearby(point,this.spatialRange(64*Math.SQRT2,true))){
   if(!unit.alive||unit.team===team||!unit.def.air||unit.def.building||unit.hidden||unit.loaded||unit.productionOnly||unit.def.invincible||!this.canSee(team,unit)||!this.inNoExpandRect(point,unit,64))continue;
   const timers=unit.acidSporeTimers||(unit.acidSporeTimers=[]),duration=50;
   if(timers.length<9)timers.push(duration);else{let shortest=0;for(let i=1;i<timers.length;i++)if(timers[i]<timers[shortest])shortest=i;timers[shortest]=duration}
  }
 }
 weaponImpact(target,weapon,damage,team,type,point,missed=false,attacker=null){
  const airSplash=weapon.explosionType==='Air_Splash',validDirect=!missed&&target?.alive;
  if(validDirect&&!airSplash)this.hitUnit(target,damage,team,type,point,attacker,{acidBonusEligible:true});
  if(weapon.explosionType==='Corrosive_Acid'){
   if(validDirect&&!attacker?.hallucination)this.addAcidSpores(point,team,attacker);
   return;
  }
  this.applySplashHits(this.splashHits(point,weapon,missed?null:target,attacker),weapon,damage,team,attacker);
 }
 hitUnit(u,damage,team,type,point=null,attacker=null,damageContext={}){const hp=u.hp,shield=u.shield,matrix=u.matrix;this.hurt(u,damage,team,type,false,damageContext);const hpLoss=hp-Math.max(0,u.hp),shieldLoss=shield-u.shield,matrixLoss=matrix-u.matrix;if(hpLoss>0||shieldLoss>0||matrixLoss>0){const source=attacker?.id?this.units.find(a=>a.id===attacker.id):null;if(source?.alive)this.onUnitDamaged(u,source)}}
 nextMutaliskTarget(projectile,point){
  const previous=new Set(projectile.previousTargetIds||[]),candidates=this.nearby(point,this.spatialRange(96*Math.SQRT2,true)).filter(unit=>!previous.has(unit.id)&&this.canAttackTarget(projectile.source,unit)&&this.inNoExpandRect(point,unit,96)).sort((a,b)=>a.id-b.id);
  return candidates[0]||null;
 }
 queueMutaliskBounce(projectile,target,point){
  if(projectile.missed||projectile.bounceIndex>=2||!projectile.source?.alive)return;
  const previous=[...(projectile.previousTargetIds||[]),projectile.target?.id].filter(Number.isInteger),next=this.nextMutaliskTarget({...projectile,previousTargetIds:previous},point);if(!next)return;
  const index=projectile.bounceIndex+1,damage=Math.floor(projectile.baseDamage*256/(index===1?3:9))/256,p={x:point.x,y:point.y,endX:next.x,endY:next.y,target:next,source:projectile.source,team:projectile.team,image:projectile.image,elapsed:0,speed:projectile.speed,damage,type:projectile.type,weapon:projectile.weapon,missed:false,bounceIndex:index,baseDamage:projectile.baseDamage,previousTargetIds:previous};
  p.visual=this.addProjectileVisual(p);p.visualId=p.visual.id;this.pendingProjectiles.push(p);
 }
 onUnitDamaged(victim,source){
  if(!this.unitThreatens(source,victim))return;
  const setAggro=u=>{
   if(!this.unitThreatens(u,source)||!this.canAttackTarget(u,source))return;
   u.aggroTarget=source.id;u.aggroUntil=this.time+4;
   const newW=this.weapon(u,source);if(!newW)return;
   const old=this.canAttackTarget(u,u.target)?u.target:null,oldW=old&&this.weapon(u,old),newEdge=this.edgeDistance(u,source),newInRange=newEdge<=newW.range&&newEdge>=(newW.minRange||0),oldInRange=old&&this.edgeDistance(u,old)<=oldW.range&&this.edgeDistance(u,old)>=(oldW.minRange||0);
   if(u.order==='move'||u.order==='focus'&&old||u.order==='hold'&&!newInRange||dist(u,source)>acquisitionRange(this,u,source.def.air)+u.r+source.r)return;
   const oldIsAttackingUnit=this.activelyAttacking(old,u);
   if(!old||!oldIsAttackingUnit||newInRange&&!oldInRange)u.target=source;
  };
  setAggro(victim);
  for(const ally of this.nearby(victim,96)){if(ally===victim||!ally.alive||ally.loaded||ally.team!==victim.team||[7,41,64,67].includes(ally.type)||ally.burrowed||dist(ally,victim)>96||!this.unitThreatens(ally,source))continue;setAggro(ally)}
 }
 fireLurkerSpines(u,target,weapon,damage){
  const angle=Math.atan2(target.y-u.y,target.x-u.x),speed=Math.max(1,weapon.speed||450),distance=weapon.range+20,endTick=Math.max(2,Math.ceil(distance/speed*24/2)*2);
  u.lurkerSpines||=[];u.lurkerSpines.push({source:u,team:u.team,weapon,damage,origin:{x:u.x,y:u.y},angle,distance,speed,elapsed:0,nextTick:2,endTick,hitIds:new Set()});
 }
 resolveLurkerSpine(wave,x,y){
  const radius=wave.weapon.splash?.[0]||20;
  for(const target of this.nearby({x,y},this.spatialRange(radius,true))){
   if(!target.alive||target.team===wave.team||target.def.air||target.loaded||target.hidden||target.productionOnly||target.buffs?.stasis>0||wave.hitIds.has(target.id))continue;
   let gap;if(target.def.building){const [w,h]=target.def.footprint||[64,64];gap=Math.hypot(Math.max(0,Math.abs(x-target.x)-w/2),Math.max(0,Math.abs(y-target.y)-h/2))}else gap=Math.max(0,dist({x,y},target)-target.r);
   if(gap<=radius){wave.hitIds.add(target.id);this.hitUnit(target,wave.damage,wave.team,wave.weapon.type,{x,y},wave.source,{acidBonusEligible:true})}
  }
 }
 tickLurkerSpines(dt){
  for(const unit of this.units)for(const wave of unit.lurkerSpines||[]){
   wave.elapsed+=dt;
   while(wave.nextTick<=wave.endTick&&wave.nextTick/24<=wave.elapsed+1e-9){
    const travel=Math.min(wave.distance,wave.speed*wave.nextTick/24),x=wave.origin.x+Math.cos(wave.angle)*travel,y=wave.origin.y+Math.sin(wave.angle)*travel;
    this.effects.push({kind:'lurker-spine',image:961,team:wave.team,x,y,left:11/24,duration:11/24});this.resolveLurkerSpine(wave,x,y);wave.nextTick+=2;
   }
  }
  for(const unit of this.units)unit.lurkerSpines=(unit.lurkerSpines||[]).filter(w=>w.nextTick<=w.endTick);
 }
 attack(u,t,w){
  if(!u?.alive||!t?.alive||w?.controlOnly)return false;
  const targetAir=!!t.def.air,hits=attackHitCount(u,w,targetAir),frames=cooldownFrames(this,u,w);
  u.cooldown=frames/24;u.action=targetAir?'airAttack':'attack';u.animTime=0;u.direction=(Math.round(Math.atan2(t.x-u.x,u.y-t.y)*16/Math.PI)+32)%32;
  const sounds=this.data.graphics[u.def.image]?.tracks?.[u.action]?.sounds||[];if(sounds.length)this.emit('sfx',{id:sounds[Math.floor(Math.random()*sounds.length)]});
  const damage=u.hallucination?0:w.damage;
  if(u.type===103&&w.id===109)this.fireLurkerSpines(u,t,w,damage);
  else for(let hit=0;hit<hits;hit++){
   const missed=this.uphillMiss(u,t,w),impact=missed?this.missPoint(u,t):{x:t.x,y:t.y};
   if(w.behavior===2||w.range<40){this.weaponImpact(t,w,damage,u.team,w.type,impact,missed,u);if(u.type===38&&w.id===38){const direction=(Math.round(Math.atan2(impact.x-u.x,u.y-impact.y)*16/Math.PI)+32)%32;this.addInstantVisual({kind:'hitscan',team:u.team,sourceId:u.id,targetId:t.id,weaponId:w.id,impactImage:504,missed,startX:u.x,startY:u.y,endX:impact.x,endY:impact.y,direction,duration:.1,fallbackDuration:.1});const impactTrack=this.data.graphics[504]?.tracks?.idle,duration=(impactTrack?.ticks||10)/24;this.addInstantVisual({kind:'contact',image:504,impactImage:504,team:u.team,sourceId:u.id,targetId:t.id,weaponId:w.id,missed,startX:impact.x,startY:impact.y,endX:impact.x,endY:impact.y,direction,duration,fallbackDuration:.1})}}
   else{const p={x:u.x,y:u.y,endX:impact.x,endY:impact.y,target:t,source:u,team:u.team,image:w.image,elapsed:0,speed:Math.max(180,w.speed||400),damage,type:w.type,splash:w.splash,weapon:w,missed};if([48,49].includes(w.sourceWeaponId)&&!missed){p.bounceIndex=0;p.baseDamage=damage;p.previousTargetIds=[]}p.visual=this.addProjectileVisual(p);p.visualId=p.visual.id;this.projectiles.push(p)}
  }
  if([13,47,85].includes(u.type))this.die(u);return true;
 }
 move(u,p,dt){if(u.def.building||u.burrowed||u.type===103&&u.lurkerState!=='ground'||u.sieged||u.buffs.lockdown>0||u.buffs.stasis>0||u.buffs.maelstrom>0)return false;if(u.def.air){const d=dist(u,p);if(d<MOVEMENT_EPSILON)return false;const n=Math.min(d,movementSpeed(this,u)*dt);u.direction=(Math.round(Math.atan2(p.x-u.x,u.y-p.y)*16/Math.PI)+32)%32;u.x+=(p.x-u.x)/d*n;u.y+=(p.y-u.y)/d*n;this.spatial?.update(u);u.action='walk';return true}return this.moveSafely(u,p,dt);}
 beginLurkerTransition(u){
  if(u.type!==103||!['ground','burrowed'].includes(u.lurkerState)||u.lurkerTransition>0)return false;
  const entering=u.lurkerState==='ground';u.lurkerTransitionCount=(u.lurkerTransitionCount||0)+1;u.lurkerAnimSeed=(Math.imul(u.id|0,1103515245)+Math.imul(u.lurkerTransitionCount,12345))|0;
  u.lurkerState=entering?'burrowing':'unburrowing';u.burrowed=true;u.action=entering?'burrow':'unburrow';u.animTime=0;u.goal=null;u.path=[];u.target=null;u.order='hold';u.combatMoving=false;
  const duration=typeof this.animationDuration==='function'?this.animationDuration(u,u.action):.45;u.lurkerTransition=Math.max(1/24,duration);if(entering)u.lurkerBurrowPoseTime=u.lurkerTransition;return true;
 }
 updateLurkerTransition(u,dt){
  if(!['burrowing','unburrowing'].includes(u.lurkerState))return false;
  u.lurkerTransition=Math.max(0,(u.lurkerTransition||0)-dt);if(u.lurkerTransition>0)return true;
  if(u.lurkerState==='burrowing'){u.lurkerState='burrowed';u.burrowed=true;u.action='burrow';u.animTime=u.lurkerBurrowPoseTime||0}
  else{u.lurkerState='ground';u.burrowed=false;u.action='idle';u.animTime=0;if(u.laneArmy&&u.lurkerResumeOrder==='attackmove'){const objective=this.laneObjective(u.team);u.laneObjectiveId=objective.id;this.setAdvanceGoal(u,objective)}}
  return true;
 }
 beforeUnitActions(){return true}
 tickIrradiate(u,dt,oldIrradiate,owner){
  const elapsed=Math.min(dt,oldIrradiate);if(elapsed>0){u.irradiatePulseElapsed=(u.irradiatePulseElapsed||0)+elapsed;while(u.irradiatePulseElapsed+1e-9>=1/3&&(u.irradiatePulseCount||0)<75){u.irradiatePulseElapsed-=1/3;u.irradiatePulseCount=(u.irradiatePulseCount||0)+1;const targets=u.burrowed?[u]:this.nearby(u,this.spatialRange(32,true)).filter(a=>a.alive&&!a.def.building&&a.def.organic&&(a===u||!a.burrowed)&&this.edgeDistance(u,a)<=32),damage=Math.floor(SPELL_RULES.irradiate.damage*256/75)/256;for(const t of targets)this.hurt(t,damage,owner??u.team,3,true,{acidBonusEligible:true})}}
  if(u.buffs.irradiate===0){u.irradiatePulseElapsed=0;u.irradiatePulseCount=0;u.irradiateOwner=null}
 }
 tickUnit(u,dt){
  if(!u.alive){u.animTime+=dt;u.visualTime=(u.visualTime||0)+dt;return}
  if(u.acidSporeTimers?.length){u.acidSporeTimers=u.acidSporeTimers.map(left=>left-dt).filter(left=>left>1e-9)}
  const oldIrradiate=u.buffs.irradiate||0,irradiateOwner=u.irradiateOwner;
  if(u.loaded){u.buffs.irradiate=Math.max(0,oldIrradiate-dt);this.tickIrradiate(u,dt,oldIrradiate,irradiateOwner);const transport=this.units.find(a=>a.id===u.loaded);if(transport){u.x=transport.x;u.y=transport.y}return}
  const oldPlague=u.buffs.plague||0;for(const k in u.buffs)if(u.buffs[k]!==Infinity)u.buffs[k]=Math.max(0,u.buffs[k]-dt);if(oldPlague>0&&u.buffs.plague===0)u.plagueOwner=null;if(u.buffs.matrix===0)u.matrix=0;
  if(u.buffs.hallucination===0&&u.hallucination){this.die(u);return}
  this.tickIrradiate(u,dt,oldIrradiate,irradiateOwner);
  const plagueDt=Math.min(dt,oldPlague);if(plagueDt>0&&u.hp>1)u.hp=Math.max(1,u.hp-(SPELL_RULES.plague.damage/SPELL_RULES.plague.duration)*plagueDt);
  if(u.cloaked&&!u.def.cloak){u.energy-=.9*dt;if(u.energy<=0)u.cloaked=false}else u.energy=Math.min(u.def.energy,u.energy+.5625*dt);
  if(u.shield<u.def.shield)u.shield=Math.min(u.def.shield,u.shield+.65*dt);
  if(u.def.race==='zerg')u.hp=Math.min(u.maxHp,u.hp+.015*dt);
  u.cooldown=Math.max(0,u.cooldown-dt);
  if(u.buffs.lockdown>0||u.buffs.stasis>0||u.buffs.maelstrom>0)return;
  u.animTime+=dt;u.visualTime=(u.visualTime||0)+dt;
  if(u.type===103&&this.updateLurkerTransition(u,dt))return;
  if(!this.beforeUnitActions(u,dt))return;
  if(this.medicHeal(u,dt))return;
  if(u.order==='repair'&&u.target?.alive){const t=u.target;if(this.edgeDistance(u,t)<=20&&this.money>0){const amount=Math.min(12*dt,t.maxHp-t.hp,this.money*4);t.hp+=amount;this.money-=amount/4}else this.move(u,t,dt);return;}
  const mayAttack=u.order!=='move';let target=null;
  if(mayAttack){const w=u.target&&this.weapon(u,u.target),edge=u.target&&this.edgeDistance(u,u.target),holdValid=u.order!=='hold'||w&&edge<=w.range&&edge>=(w.minRange||0);if(this.canAttackTarget(u,u.target)&&holdValid&&(u.order==='focus'||dist(u,u.target)<=u.def.sight+u.r+u.target.r)){target=u.target;u.targetReviewClock=(u.targetReviewClock||0)-dt;if(u.order!=='focus'&&u.targetReviewClock<=0){target=this.betterTarget(u,target);u.targetReviewClock=.45}}else{u.target=null;target=this.acquireTarget(u)}if(target&&target!==u.target){u.target=target;u.attackPathTarget=null;u.attackPath=[];u.attackStall=0}}
  if(target&&mayAttack){const w=this.weapon(u,target),edge=this.edgeDistance(u,target),inRange=edge<=w.range&&edge>=(w.minRange||0),inWeb=this.areas.some(a=>a.kind==='web'&&!u.def.air&&Math.abs(u.x-a.x)<=a.halfWidth+u.r&&Math.abs(u.y-a.y)<=a.halfHeight+u.r),inSwarm=!target.def.air&&this.areas.some(a=>a.kind==='swarm'&&Math.abs(target.x-a.x)<=a.halfWidth+target.r&&Math.abs(target.y-a.y)<=a.halfHeight+target.r);
  if(inRange){u.combatMoving=true;u.attackPath=[];u.attackPathTarget=target.id;u.attackStall=0;u.attackRetries=0;if(u.cooldown===0&&!inWeb&&!(inSwarm&&w.range>40&&!(u.type===103&&w.id===109)))this.attack(u,target,w);return}
   if(u.order!=='hold'){
    u.combatMoving=true;u.aiClock-=dt;
    if(u.attackPathTarget!==target.id||!u.attackPath?.length&&u.aiClock<=0||u.attackTargetPoint&&dist(u.attackTargetPoint,target)>20){const approach=this.approachPath(u,target,Math.max(w.minRange||0,w.range-3));u.attackTargetPoint={x:target.x,y:target.y};u.attackPathTarget=target.id;u.attackPath=approach?.path||[];u.aiClock=.55;if(!approach){u.unreachableTargets||={};u.unreachableTargets[target.id]=this.time+1.25;u.target=null;u.attackPathTarget=null}}
    if(u.target===target&&u.attackPath?.length){const p=u.attackPath[0],before={x:u.x,y:u.y};this.moveCombat(u,p,dt);if(dist(u,p)<5)u.attackPath.shift();if(dist(u,before)<.05){u.attackStall=(u.attackStall||0)+dt;if(u.attackStall>.4){u.attackPath=[];u.aiClock=0;u.attackRetries=(u.attackRetries||0)+1;u.attackStall=0;if(u.attackRetries>=3){u.unreachableTargets||={};u.unreachableTargets[target.id]=this.time+1.5;u.target=null;u.attackPathTarget=null;u.attackRetries=0}}}else u.attackStall=0;return}
    if(u.target===target)return;
   }
  }
  if(!u.target&&u.combatMoving){u.combatMoving=false;if(u.goal)u.path=this.path(u,u.goal,u.def.air,u.def.air?0:u.r*.55,u)}
  if(u.goal){if(u.path.length){const p=u.path[0];this.move(u,p,dt);if(dist(u,p)<5)u.path.shift()}else if(u.order==='patrol'){const goal=u.goal;this.setGoal(u,u.anchor,'patrol');u.anchor=goal}else{u.goal=null;if(u.order!=='hold')u.order='stop';u.action='idle'}}else if(u.animTime>.5)u.action=u.burrowed?'burrow':'idle';
 }
 update(realDt){if(this.paused||!Number.isFinite(realDt)||realDt<=0)return;if(this.phase==='prep'){this.prepLeft=Math.max(0,this.prepLeft-realDt);if(!this.prepLeft)this.start();return}if(this.phase!=='battle')return;let left=realDt*this.battleTimeScale;while(left>0&&this.phase==='battle'){const dt=Math.min(left,1/30);left-=dt;this.step(dt)}}
 step(dt){this.spatial=new UnitGrid(this.units);try{this.simulateStep(dt)}finally{this.spatial=null}}
 simulateStep(dt){this.time+=dt;this.timeLeft=Math.max(0,(this.timeLimit??300)-this.time);for(const u of [...this.units]){this.tickUnit(u,dt);this.spatial?.update(u)};this.hangarAccumulator=(this.hangarAccumulator||0)+dt;while(this.hangarAccumulator>=1/24){this.hangarAccumulator-=1/24;this.tickHangarFrame?.(1/24)}this.tickLurkerSpines(dt);

  for(const p of this.projectiles){p.elapsed+=dt;if(p.target?.alive&&!p.missed){p.endX=p.target.x;p.endY=p.target.y}const d=Math.hypot(p.endX-p.x,p.endY-p.y),n=p.speed*dt;if(p.visual){p.visual.endX=p.endX;p.visual.endY=p.endY;p.visual.flightElapsed=p.elapsed;if(p.visual.trail.length===0||Math.hypot(p.x-p.visual.trail.at(-1).x,p.y-p.visual.trail.at(-1).y)>=2){p.visual.trail.push({x:p.x,y:p.y});if(p.visual.trail.length>3)p.visual.trail.shift()}}if(d<=n){p.done=true;if(p.spell){if(p.target?.alive)this.hitUnit(p.target,p.damage,p.team,p.type,null,p.source,p.damageContext||{})}else if(p.weapon){this.weaponImpact(p.target,p.weapon,p.damage,p.team,p.type,{x:p.endX,y:p.endY},p.missed,p.source);if(p.bounceIndex!==undefined)this.queueMutaliskBounce(p,p.target,{x:p.endX,y:p.endY})}if(p.visual){p.visual.arrived=true;p.visual.x=p.endX;p.visual.y=p.endY;p.visual.endX=p.endX;p.visual.endY=p.endY;p.visual.flightElapsed=p.elapsed}}else{p.x+=(p.endX-p.x)/d*n;p.y+=(p.endY-p.y)/d*n;if(p.visual){p.visual.x=p.x;p.visual.y=p.y;p.visual.direction=(Math.round(Math.atan2(p.endX-p.x,p.y-p.endY)*16/Math.PI)+32)%32}}}this.projectiles=this.projectiles.filter(p=>!p.done).concat(this.pendingProjectiles);this.pendingProjectiles=[];
  const stormHits=new Set();for(const a of this.areas){a.left-=dt;if(a.kind==='storm'){a.tick-=dt;if(a.tick<=0&&(a.pulses||0)<8){a.pulses=(a.pulses||0)+1;for(const u of this.nearby(a,a.r).filter(u=>u.alive&&!u.loaded&&!stormHits.has(u.id)&&dist(u,a)<a.r)){stormHits.add(u.id);this.hurt(u,SPELL_RULES.storm.damage,a.team,3,true,{acidBonusEligible:true})}a.tick+=SPELL_RULES.storm.interval}}}this.areas=this.areas.filter(a=>a.left>0);this.effects=this.effects.filter(f=>(f.left-=dt)>0);this.tickProjectileVisuals(dt);this.visionTimer-=dt;if(this.visionTimer<=0){this.visionTimer=.15;this.updateVision()}if(!this.core?.alive)this.finish(true,'적 핵심 건물을 파괴했습니다.');else if(!this.allies.length)this.finish(false,'아군 병력이 전멸했습니다.');else if(this.timeLeft<=0)this.finish(false,'전투 제한시간이 종료되었습니다.');}
 finish(win,reason){if(this.phase!=='battle')return;this.phase='result';this.paused=false;this.closeMenu();this.result={win,reason,time:this.time,produced:this.produced,survivors:this.allies.length,kills:this.kills,losses:this.losses,damage:this.damageDone};this.emit('phase');this.emit('result',{result:this.result});}
}

