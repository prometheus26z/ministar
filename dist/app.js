import {constructionVisual,healthBarPixels,waveDescription} from './presentation.js?v=0.16.0';
import {enhanceSelects,closeDropdown} from './ui.js?v=0.16.0';
import {SPELLS,VERSION,dist,clamp} from './core.js?v=0.16.1';
import {Battle,BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH,WAVE_SECONDS,PRODUCTION_OFFSET,PRODUCTION_HEIGHT,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y} from './autobattle.js?v=0.16.1';
import {DESERT_STRIKE,GAS_BUILDING,INCOME_SECONDS} from './lane-rules.js?v=0.16.0';
import {researchAt} from './tech.js?v=0.16.0';
import {pose,teamImage} from './animation.js?v=0.16.1';
const $=id=>document.getElementById(id),canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false}),mini=$('minimap'),mc=mini.getContext('2d');
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem('ministar.'+k))??f}catch{return f}},save=(k,v)=>{try{localStorage.setItem('ministar.'+k,JSON.stringify(v))}catch{}};
const labels={terran:'테란',zerg:'저그',protoss:'프로토스'},icon=n=>'assets/icons/'+String(n).padStart(3,'0')+'.png';
let settings=read('settings',{bgm:.22,sfx:.55,voice:.7,panel:'normal',zoom:.6,quality:'auto'}),race=read('race','terran'),data,battle,terrain,W=innerWidth,H=innerHeight,DPR=1,last=0,hudTime=0,viewMode='field',productionTeam=0,productionSeat=0,desertField,desertProduction,ctrl=false,box=false,map=false,historyMenu=false,modalKind='',pausedBefore=false,toastTimer,camera={x:640,y:1700,zoom:.6},pointers=new Map(),gesture=null,pinch=null,lastTap={time:0,type:null},lastGroup={time:0,id:null},cache=new Map(),pending=new Map(),audioContext=null,audioBuffers=new Map(),audioChannels=null,musicSource=null,musicGeneration=0,musicTrackIndex=0,musicTrackRace='',audioLifecycle=0,voiceSources=new Set(),transientSounds=new Set(),voiceGeneration=0,lastVoice=0,sfxActive=0,backgroundPauseRequired=false,pausedBeforeBackground=false;
document.body.dataset.panel=settings.panel;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function loadImage(url){if(cache.has(url))return Promise.resolve(cache.get(url));if(pending.has(url))return pending.get(url);const promise=new Promise(resolve=>{const im=new Image();im.onload=()=>{cache.set(url,im);pending.delete(url);resolve(im)};im.onerror=()=>{pending.delete(url);resolve(null)};im.src=url});pending.set(url,promise);return promise}
function getImage(url){if(!url)return null;if(cache.has(url))return cache.get(url);loadImage(url);return null}
const audioPaused=()=>document.hidden||backgroundPauseRequired||!battle||battle.phase!=='battle'||battle.paused;
function clearMediaSession(){try{const media=navigator.mediaSession;if(media){media.metadata=null;media.playbackState='none';for(const action of ['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack'])media.setActionHandler(action,null)}}catch{}}
function getAudioContext(){if(audioContext)return audioContext;const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return null;audioContext=new Context();audioChannels={};for(const [name,key]of Object.entries({music:'bgm',effects:'sfx',voice:'voice'})){const gain=audioContext.createGain();gain.gain.value=settings[key]*(name==='effects'?.4:1);gain.connect(audioContext.destination);audioChannels[name]=gain}clearMediaSession();return audioContext}
function setAudioVolume(key,value){settings[key]=value;save('settings',settings);if(audioChannels){const name={bgm:'music',sfx:'effects',voice:'voice'}[key];if(name)audioChannels[name].gain.value=value*(key==='sfx'?.4:1)}if(key==='bgm'){if(value<=0)stopMusic();else syncAudioPause()}}
function decodeAudio(url){if(audioBuffers.has(url))return audioBuffers.get(url);const promise=(async()=>{const context=getAudioContext();if(!context)throw Error('Web Audio is unavailable');const response=await fetch(url);if(!response.ok)throw Error('Audio request failed');return context.decodeAudioData(await response.arrayBuffer())})().catch(error=>{audioBuffers.delete(url);throw error});audioBuffers.set(url,promise);return promise}
function forgetSound(record){if(!record||record.ended)return;record.ended=true;transientSounds.delete(record);voiceSources.delete(record);record.gain.disconnect();record.source.disconnect();record.onFinish?.()}
function playSample(url,channel,trim=1,token=null,onFinish=null){if(audioPaused())return Promise.resolve(null);const context=getAudioContext(),lifecycle=audioLifecycle;if(!context)return Promise.resolve(null);return decodeAudio(url).then(buffer=>{if(audioPaused()||lifecycle!==audioLifecycle||context.state!=='running'||token&&token.value!==voiceGeneration)return null;const source=context.createBufferSource(),gain=context.createGain(),record={source,gain,onFinish,ended:false};source.buffer=buffer;gain.gain.value=trim;source.connect(gain);gain.connect(audioChannels[channel]);source.onended=()=>forgetSound(record);if(channel==='voice')voiceSources.add(record);if(channel==='effects')transientSounds.add(record);source.start();return record}).catch(()=>null)}
function music(){if(settings.bgm<=0||audioPaused()||musicSource)return;const context=getAudioContext();if(!context||context.state!=='running')return;if(musicTrackRace!==race){musicTrackRace=race;musicTrackIndex=0}const trackIndex=musicTrackIndex,generation=++musicGeneration,url=`assets/audio/${race}-${trackIndex+1}.ogg`;decodeAudio(url).then(buffer=>{if(generation!==musicGeneration||audioPaused()||context.state!=='running'||musicSource)return;const source=context.createBufferSource(),gain=context.createGain(),now=context.currentTime,duration=buffer.duration,fade=Math.min(2,duration/8);source.buffer=buffer;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+fade);gain.gain.setValueAtTime(1,now+Math.max(fade,duration-fade));gain.gain.linearRampToValueAtTime(0,now+duration);source.connect(gain);gain.connect(audioChannels.music);source.onended=()=>{source.disconnect();gain.disconnect();if(musicSource===source)musicSource=null;if(generation===musicGeneration&&!audioPaused()){musicTrackIndex=(trackIndex+1)%2;music()}};musicSource=source;source.start()}).catch(()=>{})}
function stopMusic(reset=false){musicGeneration++;if(musicSource){const source=musicSource;musicSource=null;source.onended=null;try{source.stop()}catch{}source.disconnect()}if(reset){musicTrackIndex=0;musicTrackRace=''}}
function stopTransientSounds(){for(const record of [...transientSounds,...voiceSources]){try{record.source.stop()}catch{}forgetSound(record)}sfxActive=0}
function syncAudioPause(){clearMediaSession();if(audioPaused()){audioLifecycle++;stopMusic();stopTransientSounds();audioContext?.suspend().catch(()=>{});return}const context=getAudioContext();if(!context)return;const lifecycle=++audioLifecycle;context.resume().then(()=>{if(lifecycle!==audioLifecycle||audioPaused()){if(audioPaused())context.suspend().catch(()=>{});return}music()}).catch(()=>{})}
function unitVoice(u,kind){if(!u||performance.now()-lastVoice<400||audioPaused())return;const sounds=(u.def.voice[kind]||[]).filter(x=>data.audio[x]);if(!sounds.length)return;lastVoice=performance.now();for(const record of [...voiceSources]){try{record.source.stop()}catch{}forgetSound(record)}const token={value:++voiceGeneration};playSample(data.audio[sounds[Math.floor(Math.random()*sounds.length)]],'voice',1,token)}
function effectSound(id){if(!data.audio[id]||sfxActive>=12||!settings.sfx||audioPaused())return;sfxActive++;playSample(data.audio[id],'effects',1,null,()=>{sfxActive=Math.max(0,sfxActive-1)}).then(record=>{if(!record)sfxActive=Math.max(0,sfxActive-1)})}
const panelHeight=()=>$('panel').hidden?0:$('panel').getBoundingClientRect().height;
const cy=()=>63+(H-panelHeight()-63)/2;
const toWorld=(x,y)=>({x:camera.x+(x-W/2)/camera.zoom,y:camera.y+(y-cy())/camera.zoom});
const toScreen=(x,y)=>({x:W/2+(x-camera.x)*camera.zoom,y:cy()+(y-camera.y)*camera.zoom});
function limitCamera(){if(!battle)return;const hw=W/2/camera.zoom,hh=(H-panelHeight()-63)/2/camera.zoom,offset=viewMode==='production'?PRODUCTION_OFFSET:0;camera.x=clamp(camera.x,Math.min(640,hw),Math.max(640,1280-hw));camera.y=clamp(camera.y,offset+Math.min(1024,hh),offset+Math.max(1024,2048-hh))}
function resize(){W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio||1,settings.quality==='low'?1.2:2);canvas.width=W*DPR;canvas.height=H*DPR;limitCamera()}addEventListener('resize',resize);resize();
function focus(units=battle.selected){if(!units.length)return;camera.x=units.reduce((n,u)=>n+u.x,0)/units.length;camera.y=units.reduce((n,u)=>n+u.y,0)/units.length;limitCamera()}
function zoom(z,x=W/2,y=cy()){const p=toWorld(x,y);camera.zoom=clamp(z,.25,2.8);const q=toWorld(x,y);camera.x+=p.x-q.x;camera.y+=p.y-q.y;limitCamera();settings.zoom=camera.zoom;save('settings',settings)}
function setViewMode(mode){if(!battle||battle.phase!=='battle')return;if(battle.menuOpen)battle.closeMenu();viewMode=mode;$('productionSide').hidden=mode!=='production';$('productionSeat').hidden=mode!=='production'||battle.teamSize===1;refreshProductionSeat();document.body.dataset.space=mode;const button=$('spaceToggle');button.textContent=mode==='production'?'전장':'생산';button.setAttribute('aria-label',mode==='production'?'전장으로 돌아가기':'생산 공간으로 이동');map=false;$('mapWrap').hidden=true;$('map').setAttribute('aria-pressed','false');$('map').disabled=mode!=='field';battle.select([],false);camera={x:640,y:(mode==='production'?PRODUCTION_OFFSET:0)+(mode==='production'?PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT/2:1700),zoom:mode==='production'?clamp(W/1280,.25,.62):.6};limitCamera();selectionUI()}
function newBattle(){stopMusic(true);stopTransientSounds();if(battle?.menuOpen)battle.closeMenu();battle=new Battle(data,{race,difficulty:$('difficulty').value,teamSize:Number($('teamSize').value)});battle.on(event);viewMode='field';productionTeam=0;productionSeat=0;$('productionSide').textContent='적 생산';document.body.dataset.space='field';backgroundPauseRequired=false;pausedBeforeBackground=false;$('backgroundPause').hidden=true;ctrl=box=map=false;camera={x:640,y:1700,zoom:.6};phaseUI();selectionUI();groupsUI();}
function event(e){if(e.type==='phase')phaseUI();if(e.type==='change'){hudUI();selectionUI();if(battle.menuOpen&&!battle.targeting)menuUI()}if(e.type==='production'){productionUI()}if(e.type==='selection')selectionUI();if(e.type==='groups')groupsUI();if(e.type==='menu')menuUI();if(e.type==='notice')toast(e.text);if(e.type==='voice')unitVoice(e.unit,e.kind);if(e.type==='sfx')effectSound(e.id);if(e.type==='result'){const records=read('records',[]);records.unshift({...e.result,race,date:new Date().toISOString()});save('records',records.slice(0,40));resultModal(e.result)}}
function phaseUI(){
 closeDropdown();const title=battle.phase==='title';$('title').hidden=!title;
 for(const id of ['hud','mission','panel','camera'])$(id).hidden=title;$('spaceToggle').hidden=battle.phase!=='battle';$('productionSide').hidden=battle.phase!=='battle'||viewMode!=='production';$('productionSeat').hidden=battle.phase!=='battle'||viewMode!=='production'||battle.teamSize===1;
 $('objective').textContent='적 메인 기지를 먼저 함락하십시오';
 if(battle.phase==='battle'){$('productionSide').textContent='적 생산 · '+({terran:'테란',zerg:'저그',protoss:'프로토스'}[battle.enemyRace]);viewMode='field';document.body.dataset.space='field';camera.x=640;camera.y=1700;camera.zoom=.6;$('backgroundPause').hidden=!backgroundPauseRequired;syncAudioPause();toast('상대: '+({terran:'테란',zerg:'저그',protoss:'프로토스'}[battle.enemyRace]))}
 if(title){map=false;$('mapWrap').hidden=true}if(battle.phase==='result'){stopMusic();stopTransientSounds();audioContext?.suspend().catch(()=>{})}
 selectionUI();menuUI();hudUI();resize()
}
function hudUI(){
 if(!battle)return;
 const units=battle.selected;
 if(battle.laneMode){
  const count=Math.ceil(battle.nextWave),seconds=Math.max(0,count);
  $('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  $('phase').textContent=battle.paused?'PAUSED':'NEXT WAVE';
  $('objective').textContent=`적 메인 ${Math.max(0,Math.ceil(battle.core?.hp||0)).toLocaleString()} HP · 아군 메인 ${Math.max(0,Math.ceil(battle.main?.hp||0)).toLocaleString()} HP`;
  $('money').textContent=Math.floor(battle.money).toLocaleString();$('gas').textContent=Math.floor(battle.gas).toLocaleString();$('gas').parentElement.hidden=!!battle.laneMode;if(battle.laneMode)$('incomeStatus').textContent=battle.incomePauseLeft>0?`수입 중단 ${Math.ceil(battle.incomePauseLeft)}초`:`시설 ${battle.completedGasCount(0)}/5 · +${battle.incomeAmount()} / ${INCOME_SECONDS.toFixed(2)}초`;
  $('supply').textContent=Number(battle.supply.toFixed(1))+'/'+battle.maxSupply;$('slow').hidden=true;
  $('commandButton').disabled=battle.phase!=='battle'||viewMode!=='production'||productionTeam===1||productionSeat!==0;
  const producer=units.length===1?units[0]:null;
  $('productionButton').disabled=battle.phase!=='battle';
  $('researchButton').disabled=viewMode!=='production'||!producer||!producer.productionOnly||!producer.def.building||!battle.researchOptions(producer).length;
  return;
 }
 const seconds=Math.floor(battle.time);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('phase').textContent=battle.paused?'PAUSED':'BATTLE';
 $('money').textContent=Math.floor(battle.money).toLocaleString();$('gas').textContent=Math.floor(battle.gas).toLocaleString();$('gas').parentElement.hidden=!!battle.laneMode;if(battle.laneMode)$('incomeStatus').textContent=battle.incomePauseLeft>0?`수입 중단 ${Math.ceil(battle.incomePauseLeft)}초`:`시설 ${battle.completedGasCount(0)}/5 · +${battle.incomeAmount()} / ${INCOME_SECONDS.toFixed(2)}초`;$('supply').textContent=Number(battle.supply.toFixed(1))+'/'+battle.maxSupply;$('slow').hidden=true;
 $('commandButton').disabled=!battle.selected.length||battle.phase!=='battle';
}
function clearVitals(){for(const id of ['hp','shields','energy','groundAttack','airAttack','armor'])$(id).textContent=''}
function meter(id,label,current,max){const el=$(id),ratio=max>0?clamp(current/max,0,1):0;el.innerHTML=`${label} ${Math.ceil(current)}/${Math.ceil(max)}<i style="width:${Math.round(ratio*100)}%"></i>`}
function attackValue(u,air){
 const target={def:{air}},weapon=battle.weapon(u,target);if(!weapon)return null;if(u.hallucination)return '0';
 const hits=air?u.def.airHits||1:u.def.groundHits||1,mult=(u.type===125||u.type===72)?4:1;
 return `${Math.round(weapon.damage*(weapon.factor||1)*mult)}${hits>1?`×${hits}`:''}`;
}
function showVitals(units){
 clearVitals();document.body.dataset.inspect=units.length?'yes':'no';if(!units.length)return;
 const hp=units.reduce((n,u)=>n+Math.max(0,u.hp),0),maxHp=units.reduce((n,u)=>n+(u.maxHp||u.def.hp),0);
 meter('hp','HP',hp,maxHp);
 const shieldUnits=units.filter(u=>u.def.shield>0);if(shieldUnits.length)meter('shields','실드',shieldUnits.reduce((n,u)=>n+u.shield,0),shieldUnits.reduce((n,u)=>n+u.def.shield,0));
 const energyUnits=units.filter(u=>u.def.energy>0);if(energyUnits.length)meter('energy','마나',energyUnits.reduce((n,u)=>n+u.energy,0),energyUnits.reduce((n,u)=>n+u.def.energy,0));
 const weaponSummary=(air)=>{const rows=new Map();for(const u of units){let value;if(u.garrison?.length){const crew=new Map();for(const id of u.garrison){const d=data.units[id];if(!d)continue;const wid=air?d.airWeapon:d.groundWeapon,w=data.weapons[wid];if(!w?.damage||!(air?w.air:w.ground))continue;const hits=air?d.airHits||1:d.groundHits||1,key=`${d.name} ${Math.round(w.damage*(w.factor||1))}${hits>1?`×${hits}`:''}`;crew.set(key,(crew.get(key)||0)+1)}value=[...crew].map(([name,count])=>`${name}${count>1?` ×${count}`:''}`).join(' · ')}
   else value=attackValue(u,air);if(!value)continue;const key=units.length===1?value:`${data.units[u.type]?.name||u.def.name} ${value}`;rows.set(key,(rows.get(key)||0)+1)}
  return [...rows].map(([name,count])=>count>1?`${name}×${count}`:name).join(' / ')||'—'};
 $('groundAttack').textContent=`지상 ${weaponSummary(false)}`;$('airAttack').textContent=`공중 ${weaponSummary(true)}`;
 const armor=units.length===1?String(units[0].def.armor):`${Math.min(...units.map(u=>u.def.armor))}–${Math.max(...units.map(u=>u.def.armor))}`;$('armor').textContent=`방어 ${armor}`;
}
function refreshVitals(){if(!battle)return;const selected=battle.selected,unit=battle.laneMode?(selected[0]||battle.inspectedUnit):null;showVitals(battle.laneMode?(unit?[unit]:[]):selected)}
function selectionUI(){
 if(!battle)return;const units=battle.selected;
 if(battle.laneMode){
  const unit=units[0]||battle.inspectedUnit,entries=unit?.productionOnly?battle.commanderWave(unit.commanderId,unit.id):new Map(),lineup=[...entries].map(([type,count])=>`${data.units[type].name} ${count}기`).join(' · ');$('unitName').textContent=unit?unit.def.name:'';document.querySelector('.unit-info').style.setProperty('--unit-icon',`url("${icon(unit?.type??BASE[race])}")`);
  showVitals(unit?[unit]:[]);
  $('order').textContent=unit?.garrison?.length?'수비 병력':unit?.construction?'건설 중':unit?.productionOnly&&lineup?`매 ${Math.round(WAVE_SECONDS)}초 자동 출격 · ${lineup}`:unit?.productionOnly&&unit?.def.building?'완성되면 해당 건물의 병력이 자동 출격합니다.':unit?.def.building?'전장 방어 시설':'';
  $('chips').replaceChildren();hudUI();productionUI();return;
 }
 $('unitName').textContent=units.length===1?units[0].def.name:units.length?units.length+'기 선택됨' :'';showVitals(units);
 if(!units.length){$('order').textContent=box?'범위 선택 모드 활성화':''}
 const portrait=$('portrait'),url=units.length===1?units[0].def.portrait:null;portrait.hidden=!url;if(url&&portrait.getAttribute('src')!==url){portrait.src=url;portrait.play().catch(()=>{})}if(!url)portrait.pause();
 const types=new Map();for(const u of units)types.set(u.type,(types.get(u.type)||0)+1);$('chips').replaceChildren();for(const [type,n] of types){const b=document.createElement('button');b.innerHTML=`<img src="${icon(type)}" alt="">${n}`;b.title=data.units[type].name;b.onclick=()=>battle.select(units.filter(u=>u.type===type).map(u=>u.id));$('chips').append(b)}hudUI();productionUI()
}
function groupsUI(){if(!battle||battle.laneMode)return;$('ctrl').setAttribute('aria-pressed',ctrl);for(let i=0;i<10;i++){const b=$('group'+i),g=battle.groups[i];b.classList.toggle('occupied',!!g.length);b.classList.toggle('selected',!!g.length&&g.length===battle.selection.length&&g.every(id=>battle.selection.includes(id)));b.setAttribute('aria-label',(i===9?0:i+1)+'번 부대 '+g.length+'기')}}
$('ctrl').onclick=()=>{ctrl=!ctrl;groupsUI()};
function openMenu(mode='build'){if(mode==='build'&&(viewMode!=='production'||productionTeam===1||productionSeat!==0)){toast('생산 공간에서 건물을 배치하세요.');return}if(mode==='research'&&viewMode!=='production'){toast('생산 공간에서 확인하세요.');return}if(battle.menuOpen){if(battle.menuMode!==mode){battle.menuMode=mode;menuUI()}else battle.closeMenu();return}if(battle.openMenu(mode)){history.pushState({command:true},'');historyMenu=true}}
function actionCard(name,id,cost,reason,click,detail=''){
 const button=document.createElement('button');button.className='command-card';button.innerHTML=`<img src="${icon(id)}" alt=""><b>${name}</b>${cost?`<small>◆ ${cost[0]}${battle.laneMode?' 미네랄':' · ● '+cost[1]}</small>`:''}${detail?`<small class="command-output">${detail}</small>`:''}${reason?`<small class="command-reason">${reason}</small>`:''}`;button.disabled=!!reason;button.title=reason||name;button.onclick=click;$('commandGrid').append(button);return button;
}
function gasInvestmentDetail(){
 const step=Math.min(5,battle.units.filter(u=>u.alive&&u.team===0&&u.gasNode).length+1),rates=DESERT_STRIKE.income,delay=!battle.gasDelayApplied[0].has(step)?Math.round(DESERT_STRIKE.gasPenaltyCycles[step]*DESERT_STRIKE.hyperCycleSeconds):0;
 return `수입 +${rates[step]}${delay?' · 중단 '+delay+'초':''}`;
}
function menuUI(){
 if(!battle)return;if(!battle.menuOpen&&historyMenu){historyMenu=false;history.back()}
 $('commands').hidden=!battle.menuOpen||!!battle.targeting;$('target').hidden=!battle.targeting;$('slow').hidden=true;
 if(battle.targeting){const key=battle.targeting,type=key.startsWith('build:')?Number(key.split(':')[1]):null;$('targetText').textContent=type?data.units[type].name:'';$('confirmBuild').hidden=!type;$('confirmBuild').disabled=true;return}
 if(!battle.menuOpen)return;$('commandGrid').replaceChildren();
 const mode=battle.menuMode||'build',unit=battle.selected[0]||battle.inspectedUnit;
 $('commandTitle').textContent=mode==='build'?'건물 건설':mode==='produce'?'출격 현황':'기술 연구';
 if(mode==='build'){
  $('commandHint').textContent='';
  for(const type of battle.buildingOptions(battle.builder)){const d=data.units[type];actionCard(d.name+' 건설',type,battle.buildingCost(type),battle.buildReason(battle.builder,type),()=>{placementPoint=null;battle.chooseCommand('build:'+type)},(type===GAS_BUILDING[race]?gasInvestmentDetail():waveDescription(type,battle.waveUnitsForBuilding(type),data)))}
  if(unit?.team===0&&unit.productionOnly&&unit.def.building){for(const type of battle.morphOptions(unit)){const d=data.units[type];actionCard(d.name+' 변태',type,battle.buildingCost(type),battle.morphReason(unit,type),()=>{battle.morph(unit,type);battle.closeMenu()},waveDescription(type,battle.waveUnitsForBuilding(type),data))}
   for(const type of battle.addonOptions(unit)){const d=data.units[type];actionCard(d.name+' 부착',type,battle.buildingCost(type),battle.addonReason(unit,type),()=>{battle.addon(unit,type);battle.closeMenu()},waveDescription(type,battle.waveUnitsForBuilding(type),data))}}
  if(!$('commandGrid').children.length)$('commandHint').textContent='현재 지을 수 있는 건물이 없습니다. 선행 테크와 자원을 확인하세요.';
 }else if(mode==='produce'){
  const team=viewMode==='production'?productionTeam:0,owner=viewMode==='production'?viewCommanderId():0,scoped=unit?.commanderId===owner&&unit.productionOnly&&unit.def.building?unit:null,counts=battle.commanderWave(owner,scoped?.id??null);
  $('commandHint').textContent='';
  for(const [type,count]of counts){const card=document.createElement('div');card.className='wave-card';card.innerHTML=`<img src="${icon(type)}" alt=""><b>${data.units[type].name}</b><span>${count}기 · 매 ${Math.round(WAVE_SECONDS)}초</span>`;$('commandGrid').append(card)}
  if(!counts.size&&scoped){const empty=document.createElement('p');empty.className='wave-empty';empty.textContent='이 건물은 현재 출격 유닛을 생성하지 않습니다.';$('commandGrid').append(empty)}
 }else{
  if(!unit||!unit.productionOnly||!unit.def.building){$('commandHint').textContent='생산 공간에서 연구할 건물을 선택하세요.';return}
  $('commandHint').textContent='';
  for(const key of battle.researchOptions(unit)){const spec=RESEARCH[key];actionCard(spec.name,spec.icon,spec.cost,battle.researchReason(unit,key),()=>battle.research(unit,key),Math.ceil(spec.time)+'초')};
  if(!$('commandGrid').children.length)$('commandHint').textContent='원본 맵의 기술 연구 설정을 사용합니다.';
 }
}
function productionUI(){
 if(!battle)return;const unit=battle.selected.length===1?battle.selected[0]:battle.inspectedUnit,box=$('productionQueue');box.replaceChildren();
 if(battle.laneMode){
  if(unit?.construction){const task=unit.construction,progress=Math.min(100,Math.floor(task.time/task.total*100)),bar=document.createElement('div');bar.className='production-progress';bar.innerHTML=`<span>건설 ${progress}% · ${Math.max(0,Math.ceil(task.total-task.time))}초</span><i style="width:${progress}%"></i>`;box.append(bar)}
  $('commandButton').textContent='건물 건설';$('productionButton').textContent='출격 현황';$('researchButton').textContent='연구';
  if(battle.menuOpen&&!battle.targeting&&performance.now()-lastMenuRefresh>700){lastMenuRefresh=performance.now();menuUI()}
  return;
 }
 if(!unit)return;const task=unit.construction||unit.egg||unit.queue[0];if(task){const progress=Math.min(100,Math.floor(task.time/task.total*100)),label=unit.construction?(task.started?'건설 / 변태':'일꾼 이동 중'):task.kind==='research'?RESEARCH[task.key].name:data.units[task.type].name;const bar=document.createElement('div');bar.className='production-progress';bar.innerHTML=`<span>${label} ${progress}% · ${Math.max(0,Math.ceil(task.total-task.time))}초</span><i style="width:${progress}%"></i>`;box.append(bar)}if(unit.queue.length){const queue=document.createElement('div');queue.className='production-slots';for(const [index,task]of unit.queue.entries()){const b=document.createElement('button');b.textContent=(index+1)+'. '+(task.kind==='research'?RESEARCH[task.key].name:data.units[task.type].name);b.title='터치하면 생산 취소';b.onclick=()=>battle.cancel(unit,index);queue.append(b)}box.append(queue)}
 $('order').textContent=unit.construction?'건설 중':unit.egg?'변태 중':unit.type===35?'애벌레 · 생산 명령으로 변태':!battle.powered(unit)?'전력 공급 중단':unit.order==='gather'?(unit.cargo?'자원 운반 중':'자원 채취 중'):unit.order==='construct'?'건설 작업 중':$('order').textContent;
 $('commandButton').firstChild.textContent=unit.def.building||unit.type===35?'생산 / 명령 ':unit.type===WORKER[unit.def.race]?'건설 / 명령 ':'명령 ';
 if(battle.menuOpen&&!battle.targeting&&performance.now()-lastMenuRefresh>700){lastMenuRefresh=performance.now();menuUI()}
}
let lastMenuRefresh=0,placementPoint=null;
function refreshPlacementUI(){if(!battle?.targeting?.startsWith('build:')||!placementPoint)return;const type=Number(battle.targeting.split(':')[1]),result=battle.placement(battle.builder,type,placementPoint);$('confirmBuild').disabled=!!result.reason;if(result.reason)$('targetText').textContent=result.reason;else $('targetText').textContent=data.units[type].name}
function confirmBuild(){if(!battle?.targeting?.startsWith('build:')||!placementPoint)return;const type=Number(battle.targeting.split(':')[1]),result=battle.placement(battle.builder,type,placementPoint);if(result.reason){toast(result.reason);refreshPlacementUI();return}battle.execute(battle.targeting,placementPoint);placementPoint=null}
function viewCommanderId(){return battle.commanderIdFor(productionTeam,productionSeat)}
function inProductionView(entity){return entity.commanderId===viewCommanderId()}
function refreshProductionSeat(){
 const names={terran:'테란',zerg:'저그',protoss:'프로토스'},commander=battle.commanders.find(c=>c.id===viewCommanderId());
 $('productionSide').textContent=productionTeam?'아군 생산':'적 생산'+(battle.teamSize===1?' · '+names[battle.enemyRace]:'');
 $('productionSeat').textContent=(productionTeam?'적 AI '+(productionSeat+1):productionSeat?'아군 AI '+productionSeat:'내 생산')+' · '+(names[commander?.race]||'');
}
function switchProduction(){battle.closeMenu();battle.select([],false);refreshProductionSeat();selectionUI()}
$('productionSide').onclick=()=>{productionTeam=1-productionTeam;productionSeat=0;switchProduction()};
$('productionSeat').onclick=()=>{productionSeat=(productionSeat+1)%battle.teamSize;switchProduction()};
$('confirmBuild').onclick=confirmBuild;$('spaceToggle').onclick=()=>setViewMode(viewMode==='field'?'production':'field');$('commandButton').onclick=()=>openMenu('build');$('productionButton').onclick=()=>openMenu('produce');$('researchButton').onclick=()=>openMenu('research');$('baseView').onclick=()=>setViewMode('field');$('frontView').onclick=()=>{setViewMode('field');camera.y=1024;camera.zoom=.5;limitCamera()};$('closeCommands').onclick=()=>{placementPoint=null;battle.closeMenu()};$('cancel').onclick=()=>{placementPoint=null;battle.closeMenu()};addEventListener('popstate',()=>{historyMenu=false;if(battle?.menuOpen)battle.closeMenu();else if(!$('modal').hidden)closeModal()});
$('box').onclick=()=>{box=!box;$('box').setAttribute('aria-pressed',box);toast(box?'지면을 드래그해 범위 선택':'길게 누른 뒤 드래그해 범위 선택')};$('map').onclick=()=>{map=!map;$('map').setAttribute('aria-pressed',map);$('mapWrap').hidden=!map};$('panelMode').onclick=()=>{const modes=['min','normal','expanded'];settings.panel=modes[(modes.indexOf(settings.panel)+1)%3];document.body.dataset.panel=settings.panel;save('settings',settings);resize()};$('selectAll').onclick=()=>battle.select(battle.allies.filter(u=>!u.loaded).map(u=>u.id));$('home').onclick=()=>{$('baseView').click()};$('plus').onclick=()=>zoom(camera.zoom*1.2);$('minus').onclick=()=>zoom(camera.zoom/1.2);
const visible=u=>{const p=toScreen(u.x,u.y);return p.x>-40&&p.x<W+40&&p.y>40&&p.y<H-panelHeight()+40};
function hit(p,own=false){return battle.units.filter(u=>u.alive&&!u.hidden&&!u.loaded&&!!u.productionOnly===(viewMode==='production')&&(viewMode!=='production'||inProductionView(u))&&(!own||u.team===0)&&(u.team===0||battle.canSee(0,u))&&(u.def.building?Math.abs(u.x-p.x)<battle.footprint(u.type)[0]/2&&Math.abs(u.y-p.y)<battle.footprint(u.type)[1]/2:dist(u,p)<Math.max(u.r,15/camera.zoom))).sort((a,b)=>dist(a,p)-dist(b,p))[0]||null}
function nodeHit(p){return battle.nodes.find(n=>n.amount>0&&dist(p,n)<n.r+12&&(battle.fog[Math.floor(n.y/32)*40+Math.floor(n.x/32)]))||null}
function tap(p){const wp=toWorld(p.x,p.y),u=hit(wp);if(battle.targeting){if(viewMode!=='production')return;placementPoint=wp;refreshPlacementUI();return}if(battle.menuOpen){battle.closeMenu();return}if(u)battle.inspect(u)}
const position=e=>({x:e.clientX,y:e.clientY});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(!battle||!['prep','battle'].includes(battle.phase)||!$('modal').hidden)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=position(e);pointers.set(e.pointerId,p);if(pointers.size===2){clearTimeout(gesture?.timer);const [a,b]=[...pointers.values()];pinch={distance:dist(a,b),zoom:camera.zoom,world:toWorld((a.x+b.x)/2,(a.y+b.y)/2)};gesture=null;return}if(pointers.size>2)return;const wp=toWorld(p.x,p.y);gesture={pointer:e.pointerId,kind:'pending',start:p,current:p,world:wp,unit:hit(wp,true),camera:{...camera}}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();const p=position(e);if(battle.targeting?.startsWith('build:')){placementPoint=toWorld(p.x,p.y);refreshPlacementUI()}pointers.set(e.pointerId,p);if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()],x=(a.x+b.x)/2,y=(a.y+b.y)/2;camera.zoom=clamp(pinch.zoom*dist(a,b)/Math.max(1,pinch.distance),.25,2.8);camera.x=pinch.world.x-(x-W/2)/camera.zoom;camera.y=pinch.world.y-(y-cy())/camera.zoom;limitCamera();return}if(!gesture||gesture.pointer!==e.pointerId)return;gesture.current=p;if(gesture.kind==='pending'&&dist(p,gesture.start)>8){clearTimeout(gesture.timer);gesture.kind='pan'}if(gesture.kind==='pan'){camera.x=gesture.camera.x-(p.x-gesture.start.x)/camera.zoom;camera.y=gesture.camera.y-(p.y-gesture.start.y)/camera.zoom;limitCamera()}});
function pointerEnd(e,cancel=false){if(!pointers.has(e.pointerId))return;const p=position(e);pointers.delete(e.pointerId);if(pinch){if(!pointers.size){pinch=null;gesture=null;settings.zoom=camera.zoom;save('settings',settings)}return}if(!gesture)return;clearTimeout(gesture.timer);if(!cancel){if(gesture.kind==='pending')tap(p)}gesture=null}
canvas.addEventListener('pointerup',e=>pointerEnd(e));canvas.addEventListener('pointercancel',e=>{pointerEnd(e,true);pointers.clear();pinch=null});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(camera.zoom*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY)},{passive:false});
let miniDrag=false;const miniMove=e=>{const r=mini.getBoundingClientRect();camera.x=(e.clientX-r.left)/r.width*1280;camera.y=(e.clientY-r.top)/r.height*2048;limitCamera()};mini.onpointerdown=e=>{miniDrag=true;mini.setPointerCapture(e.pointerId);miniMove(e)};mini.onpointermove=e=>{if(miniDrag)miniMove(e)};mini.onpointerup=mini.onpointercancel=()=>miniDrag=false;
function sprite(id,team,x,y,action='idle',time=0,direction=0,alpha=1,stack=new Set(),frameOverride=null){const g=data.graphics[id];if(!g||stack.has(id)||stack.size>8)return false;stack.add(id);const image=getImage(teamImage(g,team));let drawn=false;if(image){const p=frameOverride===null?pose(g,action,time,direction):{frame:frameOverride,flip:false},f=g.frames[p.frame];if(f&&f[4]&&f[5]){ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);if(p.flip)ctx.scale(-1,1);ctx.drawImage(image,f[0],f[1],f[4],f[5],(f[2]-g.canvas[0]/2)*.5,(f[3]-g.canvas[1]/2)*.5,f[4]*.5,f[5]*.5);ctx.restore();drawn=true}}const track=g.tracks?.[action]||g.tracks?.idle||g.tracks?.built,shadows=new Set(g.shadows||[]);for(const overlay of track?.overlays||[])if(!shadows.has(overlay))sprite(overlay,team,x,y,action,time,direction,alpha,stack);stack.delete(id);return drawn}
function drawHealthBar(u){
 const g=data.graphics[u.def.image],nominal=g?.healthBarSize||u.def.healthBarSize||u.def.footprint?.[0]||u.r*2;const pixels=healthBarPixels(nominal);
 const width=pixels/camera.zoom,x=u.x-width/2,y=u.y+u.r+5/camera.zoom,hp=Math.floor(100*clamp(u.hp/(u.maxHp||u.def.hp),0,1)),shieldMax=u.def.shield||0,shield=shieldMax?Math.max(0,Math.floor(100*u.shield/shieldMax)):0,hasShield=shieldMax>0;
 const hpRows=hasShield?[18,0,0,1,1,2,18]:[18,0,1,2,18],bgRows=hasShield?[18,15,15,16,16,17,18]:[18,15,16,17,18],band=hp>=66?(hasShield?[18,0,0,1,1,2,18]:[18,0,1,2,18]):hp>=33?(hasShield?[18,3,3,4,4,5,18]:[18,3,4,5,18]):(hasShield?[18,6,6,7,7,8,18]:[18,6,7,8,18]),fillWidth=percent=>{let n=Math.floor(pixels*percent/100);if(n<3)n=3;else if(n%3){if(n%3>1)n+=3-n%3;else n-=n%3}return Math.min(pixels,n)};
 const colors={0:'#8fdb83',1:'#62bd49',2:'#37932a',3:'#f4d56e',4:'#dbac48',5:'#b7832d',6:'#ed8070',7:'#d94b36',8:'#a92a20',10:'#659fce',11:'#3373ac',15:'#343733',16:'#252f37',17:'#151b1d',18:'#080b0a'},hpFill=fillWidth(hp),shieldFill=fillWidth(shield),rowHeight=1/camera.zoom;
 for(let row=0;row<hpRows.length;row++){const yy=y+row*rowHeight;ctx.fillStyle=colors[band[row]];ctx.fillRect(x,yy,hpFill/camera.zoom,rowHeight);ctx.fillStyle=colors[bgRows[row]];ctx.fillRect(x+hpFill/camera.zoom,yy,(pixels-hpFill)/camera.zoom,rowHeight)}
 if(hasShield){const shieldRows=[18,10,11,18],shieldBg=[18,16,17,18];for(let row=0;row<shieldRows.length;row++){const yy=y+row*rowHeight;ctx.fillStyle=colors[shieldRows[row]];ctx.fillRect(x,yy,shieldFill/camera.zoom,rowHeight);ctx.fillStyle=colors[shieldBg[row]];ctx.fillRect(x+shieldFill/camera.zoom,yy,(pixels-shieldFill)/camera.zoom,rowHeight)}}
 ctx.fillStyle=colors[18];for(let px=0;px<pixels;px+=3)ctx.fillRect(x+px/camera.zoom,y,1/camera.zoom,hpRows.length/camera.zoom);
}
const warpCanvases=new WeakMap();
function drawConstruction(u,alpha){
 const visual=constructionVisual(u,data);if(!visual)return false;
 if(!visual.warp){sprite(visual.image,u.team,u.x,u.y,'idle',u.construction.time,0,alpha,new Set(),visual.frame);return true}
 const g=data.graphics[u.def.image],image=getImage(g?.images[u.team===1?'red':'blue']),f=g?.frames[0];
 if(!image||!f)return true;
 let layer=warpCanvases.get(u);if(!layer){layer=document.createElement('canvas');layer.width=f[4];layer.height=f[5];warpCanvases.set(u,layer)}
 const c=layer.getContext('2d');c.clearRect(0,0,layer.width,layer.height);c.globalCompositeOperation='source-over';
 c.drawImage(image,f[0],f[1],f[4],f[5],0,0,f[4],f[5]);
 c.globalCompositeOperation='source-atop';c.fillStyle='#579cff';c.fillRect(0,0,layer.width,layer.height);
 const texture=data.graphics[210],textureImage=getImage(texture.images.blue),tf=texture.frames[Math.floor(u.construction.time*24)%texture.frames.length];
 if(textureImage)c.drawImage(textureImage,tf[0],tf[1],tf[4],tf[5],0,0,layer.width,layer.height);
 // The original warp texture stays opaque; the completed body resolves from the base upwards.
 if(visual.progress>.65){c.save();c.beginPath();const h=layer.height*(visual.progress-.65)/.35;c.rect(0,layer.height-h,layer.width,h);c.clip();c.drawImage(image,f[0],f[1],f[4],f[5],0,0,f[4],f[5]);c.restore()}
 c.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(layer,u.x+(f[2]-g.canvas[0]/2)*.5,u.y+(f[3]-g.canvas[1]/2)*.5,f[4]*.5,f[5]*.5);ctx.restore();
 if(visual.progress<.65)sprite(208,u.team,u.x,u.y,'idle',u.construction.time,0,alpha);
 return true;
}
function unit(u){
 if(!u.alive&&u.def.building||!!u.productionOnly!==(viewMode==='production')||viewMode==='production'&&!inProductionView(u)||u.hidden||u.loaded||u.refunded||u.team===1&&!battle.canSee(0,u)||!u.alive&&battle.time-u.deathTime>(u.deathDuration||1.8)||!visible(u)&&!u.def.building)return;
 const selected=battle.isHighlighted(u),alpha=!u.alive?1:u.cloaked?.42:u.burrowed&&u.type!==103?.3:1;
 if(selected&&u.alive){ctx.strokeStyle=u.team===0?'#79f880':'#f16e67';ctx.lineWidth=1.3/camera.zoom;ctx.beginPath();ctx.ellipse(u.x,u.y+u.r*.55,u.r+5,(u.r+5)*.48,0,0,Math.PI*2);ctx.stroke()}
 const g=data.graphics[u.def.image];if(g&&u.alive)for(const sh of g.shadows||[])sprite(sh,0,u.x+2,u.y+3,'idle',u.animTime,u.direction,.35);
 if(!drawConstruction(u,alpha))sprite(u.egg?(u.type===43?11:u.type===38?914:21):u.def.image,u.team,u.x,u.y,u.type===124?'idle':u.action,u.animTime,u.direction,alpha);
 const sub=u.def.subunit!==null?data.units[u.def.subunit]:null;if(sub&&u.alive)sprite(sub.image,u.team,u.x,u.y,u.action,u.animTime,u.direction,alpha);
 if(u.type===124&&u.alive&&!u.construction)sprite(297,u.team,u.x,u.y,u.action,u.animTime,u.action==='idle'?Math.floor(u.animTime*16)%32:u.direction,alpha);
 if(u.alive&&u.def.building&&u.def.race==='terran'&&!u.construction)drawBuildingFire(u);
 if(selected&&u.alive)drawHealthBar(u);
 if(u.matrix>0||u.buffs.stasis>0||u.buffs.lockdown>0){ctx.strokeStyle=u.matrix>0?'#c3e9a388':u.buffs.stasis>0?'#b7deea':'#e9ca64';ctx.lineWidth=1.5;ctx.strokeRect(u.x-u.r-3,u.y-u.r-3,u.r*2+6,u.r*2+6)}
}
let battlefieldTexture=null,productionTexture=null;
function terrainTile(c,n,x,y,size=32){c.drawImage(terrain,n%16*64,Math.floor(n/16)*64,64,64,x,y,size,size)}
function terrainChoice(x,y,tiles){const gx=x/32,gy=y/32,salt=(Math.imul(gx+17,73856093)^Math.imul(gy+29,19349663))>>>0;return tiles[salt%tiles.length]}
function drawRelief(){if(desertField){ctx.drawImage(desertField,0,0,1280,2048);return}
 if(!battlefieldTexture){
  const c=document.createElement('canvas');c.width=1280;c.height=2048;const g=c.getContext('2d');
  const dirt=[3,4,5,6,7,9,10,16,17,18,19,20],grass=[106,107,108,109,110,111,112,117,118,119,120,121,122,123,124,125],water=[50,51,52,53,54,55,56,57,58,59],ramp=[25,26,27,28,29,30,31],rock=[142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159];
  for(let y=0;y<2048;y+=32)for(let x=0;x<1280;x+=32){
   const bank=y>=640&&y<1408&&(x<320||x>=960),upperRamp=y>=544&&y<736,lowerRamp=y>=1312&&y<1504,rampT=upperRamp?(y-544)/192:lowerRamp?(1504-y)/192:0,rampWidth=384+Math.max(0,Math.min(1,rampT))*256,onRamp=(upperRamp||lowerRamp)&&Math.abs(x+16-640)<rampWidth/2;
   const n=bank?terrainChoice(x,y,water):onRamp?terrainChoice(x,y,ramp):y<640||y>=1408?terrainChoice(x,y,grass):terrainChoice(x,y,dirt);
   terrainTile(g,n,x,y);
  }
  // Rock shelves mark the two high-ground lips; the central 640-pixel ramps stay open.
  for(const y of [608,1376])for(let x=0;x<1280;x+=32)if(x<320||x>=960)terrainTile(g,terrainChoice(x,y,rock),x,y);
  // Stone-lined banks keep the two water channels legible along the low ground.
  for(let y=640;y<1408;y+=32){const n=terrainChoice(320,y,[69,70,71]);terrainTile(g,n,288,y);terrainTile(g,n,320,y);terrainTile(g,n,928,y);terrainTile(g,n,960,y)}
  battlefieldTexture=c;
 }
 ctx.drawImage(battlefieldTexture,0,0);
}
function drawProductionBoard(){
 ctx.fillStyle='#1c100a';ctx.fillRect(0,PRODUCTION_OFFSET,1280,PRODUCTION_HEIGHT);
 ctx.save();if(productionTeam){ctx.translate(1280,0);ctx.scale(-1,1)}
 if(desertProduction)ctx.drawImage(desertProduction,PRODUCTION_GROUND_X,PRODUCTION_OFFSET+PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT);
 ctx.restore();ctx.strokeStyle='#c49b61';ctx.lineWidth=2;ctx.strokeRect(productionTeam?1280-PRODUCTION_GROUND_X-PRODUCTION_GROUND_WIDTH:PRODUCTION_GROUND_X,PRODUCTION_OFFSET+PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT);
 for(const node of battle.nodes.filter(n=>inProductionView(n))){
  ctx.strokeStyle=node.occupiedBy?'#8b9564':'#c6ae79';ctx.fillStyle='#35220c88';ctx.lineWidth=2;ctx.fillRect(node.x-64,node.y-32,128,64);ctx.strokeRect(node.x-64,node.y-32,128,64);
 }
}
function minimap(){const sx=mini.width/1280,sy=mini.height/2048;mc.fillStyle='#162b20';mc.fillRect(0,0,160,220);mc.fillStyle='#2b6487';for(const r of battle.map.water)mc.fillRect(r.x*sx,r.y*sy,r.w*sx,r.h*sy);for(const r of battle.map.rocks){mc.fillStyle='#857b5155';mc.fillRect(r.x*sx,r.y*sy,r.w*sx,r.h*sy)}for(let y=0;y<64;y++)for(let x=0;x<40;x++)if(!battle.fog[y*40+x]){mc.fillStyle=battle.explored[y*40+x]?'#030c1066':'#02080cdd';mc.fillRect(x*32*sx,y*32*sy,32*sx+.5,32*sy+.5)}for(const node of battle.nodes){if(node.team===1)continue;mc.fillStyle=node.kind==='gas'?'#63a047':'#4da3db';mc.fillRect(node.x*sx-1,node.y*sy-1,3,3)}for(const u of battle.units)if(u.alive&&!u.loaded&&!u.productionOnly&&(u.team===0||battle.canSee(0,u))){mc.fillStyle=u.team?'#e78a6e':battle.selection.includes(u.id)?'#e7e5af':'#87d17d';const s=u.def.building?5:2;mc.fillRect(u.x*sx-s/2,u.y*sy-s/2,s,s)}if(battle.core?.alive){mc.fillStyle='#e3c789';mc.fillRect(battle.core.x*sx-2,battle.core.y*sy-2,4,4)}const a=toWorld(0,63),b=toWorld(W,H-panelHeight());mc.strokeStyle='#c7d4bd';mc.strokeRect(a.x*sx,a.y*sy,(b.x-a.x)*sx,(b.y-a.y)*sy)}
function drawEconomy(){
 if(battle.phase==='title')return;
 const sources=battle.units.filter(u=>u.alive&&battle.ready(u)&&!!u.productionOnly===(viewMode==='production')&&(viewMode!=='production'||inProductionView(u))&&BUILDINGS[u.type]?.creepSource);
 if(sources.length){
  ctx.save();ctx.beginPath();
  for(const u of sources){const radius=[131,132,133].includes(u.type)?250:150;
   for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,r=radius*(.91+.055*Math.sin(i*2.7+u.id)+.035*Math.cos(i*4.1));const x=u.x+Math.cos(a)*r,y=u.y+Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();
  }
  ctx.clip();
  const cells=new Set();
  for(const u of sources){const r=[131,132,133].includes(u.type)?270:170;
   for(let y=Math.floor((u.y-r)/32);y<=Math.ceil((u.y+r)/32);y++)for(let x=Math.floor((u.x-r)/32);x<=Math.ceil((u.x+r)/32);x++){const k=x+','+y;if(cells.has(k))continue;cells.add(k);const salt=(((x/32)*73856093)^((y/32)*19349663))>>>0;terrainTile(ctx,129+salt%7,x*32,y*32)}
  }
  ctx.restore();
 }
 for(const node of battle.nodes){if(node.amount<=0||viewMode==='production'&&!inProductionView(node))continue;if(!sprite(node.kind==='gas'?344:347,0,node.x,node.y,'idle',0)){
  ctx.fillStyle=node.kind==='gas'?'#608d46':'#337fbd';ctx.beginPath();ctx.ellipse(node.x,node.y,node.r,node.r*.6,0,0,Math.PI*2);ctx.fill();
 }}
 const selected=battle.selected[0];if(selected?.rally){ctx.strokeStyle='#cfe68d';ctx.beginPath();ctx.moveTo(selected.rally.x,selected.rally.y);ctx.lineTo(selected.rally.x,selected.rally.y-25);ctx.lineTo(selected.rally.x+15,selected.rally.y-19);ctx.lineTo(selected.rally.x,selected.rally.y-13);ctx.stroke()}
 if(battle.targeting?.startsWith('build:')&&placementPoint){
  const type=Number(battle.targeting.split(':')[1]),worker=battle.builder||battle.selected.find(u=>u.type===WORKER[u.def.race]);if(!worker)return;const result=battle.placement(worker,type,placementPoint),p=result.point,[w,h]=battle.footprint(type);
  if(BUILDINGS[type].psi)for(const pylon of battle.allies.filter(u=>u.type===156&&battle.ready(u))){ctx.fillStyle='#6d82e51b';ctx.strokeStyle='#7f9aff66';ctx.beginPath();ctx.ellipse(pylon.x,pylon.y,224,160,0,0,Math.PI*2);ctx.fill();ctx.stroke()}
  ctx.fillStyle=result.reason?'#e84a4a44':'#67e35d44';ctx.strokeStyle=result.reason?'#f36a68':'#8cf784';ctx.lineWidth=2/camera.zoom;ctx.fillRect(p.x-w/2,p.y-h/2,w,h);ctx.strokeRect(p.x-w/2,p.y-h/2,w,h);sprite(data.units[type].image,0,p.x,p.y,'idle',0,0,.45);
 }
}
function drawWrecks(){
 for(const wreck of battle.wrecks||[])if(!!wreck.productionOnly===(viewMode==='production')&&(viewMode!=='production'||inProductionView(wreck)))sprite(wreck.image,wreck.team,wreck.x,wreck.y,'idle',0,0,1,new Set(),wreck.variant);
}
function drawBuildingFire(u){
 const ratio=u.hp/Math.max(1,u.maxHp||u.def.hp);if(ratio>=2/3)return;
 const stage=ratio<=1/3?2:1,[fw,fh]=u.def.footprint||[64,64],count=stage===2?5:2,t=battle.time;
 for(let i=0;i<count;i++){
  const along=(i+.5)/count,phase=t*8+u.id*1.7+i*2.4,wave=Math.sin(phase),x=u.x+(along-.5)*fw*.74+wave*3,y=u.y-fh*.22-Math.abs(Math.cos(phase*1.15))*fh*.1;
  const size=(stage===2?11:7)+Math.abs(Math.sin(phase))*(stage===2?10:5),height=size*(1.1+Math.abs(Math.cos(phase))*.7);
  ctx.save();ctx.globalAlpha=stage===2?.82:.57;ctx.shadowColor='#ff5318';ctx.shadowBlur=size*.8;
  const flame=ctx.createLinearGradient(x,y-height,x,y);flame.addColorStop(0,'#fff0a0');flame.addColorStop(.25,'#ffb83e');flame.addColorStop(1,'#e74716');ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(x-size*.4,y);ctx.quadraticCurveTo(x-size*.5,y-height*.36,x+wave*size*.25,y-height);ctx.quadraticCurveTo(x+size*.85,y-height*.4,x+size*.38,y);ctx.closePath();ctx.fill();ctx.restore();
 }
}
function drawBattleEffects(){
 for(const f of battle.effects){
  if(!!f.productionOnly!==(viewMode==='production')||f.productionOnly&&!inProductionView(f))continue;
  const death=f.kind==='building-death',g=data.graphics[f.image],time=death?(f.duration-f.left)/f.duration*(g?.tracks?.idle?.ticks||24)/24:(f.duration-f.left)*1.1;
  sprite(f.image,f.team||0,f.x,f.y,'idle',time,f.direction||0,death?1:Math.min(1,f.left*8));
 }
}
function render(now){const realDt=last?Math.min(.15,(now-last)/1000):1/60;last=now;const dt=document.hidden||backgroundPauseRequired?0:realDt;battle.update(dt);hudTime+=realDt;if(hudTime>.15){hudTime=0;hudUI();refreshVitals();productionUI();if(map)minimap()}ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#10191c';ctx.fillRect(0,0,W,H);limitCamera();ctx.save();ctx.translate(W/2,cy());ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);if(viewMode==='production'){drawProductionBoard();drawEconomy();drawWrecks();for(const u of battle.units.filter(u=>u.productionOnly&&inProductionView(u)))unit(u);drawBattleEffects();ctx.restore();requestAnimationFrame(render);return}const a=toWorld(0,0),b=toWorld(W,H),x0=Math.max(0,Math.floor(a.x/32)),x1=Math.min(40,Math.ceil(b.x/32)),y0=Math.max(0,Math.floor(a.y/32)),y1=Math.min(64,Math.ceil(b.y/32));drawRelief();drawEconomy();drawWrecks();for(const area of battle.areas){ctx.save();ctx.globalAlpha=Math.min(.3,area.left*.6);ctx.fillStyle={storm:'#89b8f7',swarm:'#ccad50',web:'#dce6e9',plague:'#ae3840',ensnare:'#94c45f',stasis:'#bce0ed'}[area.kind]||'#9bbed2';ctx.beginPath();ctx.arc(area.x,area.y,area.r,0,Math.PI*2);ctx.fill();ctx.restore();if(area.kind==='storm')sprite(525,0,area.x,area.y,'idle',area.duration-area.left)}for(const u of [...battle.units].sort((a,b)=>Number(a.def.air)-Number(b.def.air)||a.y-b.y))unit(u);for(const p of battle.projectiles){const dir=(Math.round(Math.atan2(p.endX-p.x,p.y-p.endY)*16/Math.PI)+32)%32;if(!sprite(p.image,p.team,p.x,p.y,'idle',p.elapsed,dir)){ctx.fillStyle=p.spell?'#ffe39b':'#b1d9e6';ctx.beginPath();ctx.arc(p.x,p.y,p.spell?4:2,0,Math.PI*2);ctx.fill()}}drawBattleEffects();if(battle.phase!=='title'&&!battle.laneMode)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!battle.fog[y*40+x]){ctx.fillStyle=battle.explored[y*40+x]?'#030c10a9':'#030a10e8';ctx.fillRect(x*32,y*32,32.5,32.5)}if(battle.core?.alive){ctx.save();ctx.translate(battle.core.x,battle.core.y-85);ctx.rotate(Math.PI/4);ctx.fillStyle='#e2c587';ctx.fillRect(-5,-5,10,10);ctx.restore()}if(gesture?.kind==='box'){const s=gesture.world,e=toWorld(gesture.current.x,gesture.current.y);ctx.fillStyle='#83e7921c';ctx.strokeStyle='#9ef69a';ctx.lineWidth=1/camera.zoom;ctx.fillRect(s.x,s.y,e.x-s.x,e.y-s.y);ctx.strokeRect(s.x,s.y,e.x-s.x,e.y-s.y)}ctx.restore();if(battle.paused&&battle.phase==='battle'&&$('modal').hidden){ctx.fillStyle='#07151aa9';ctx.fillRect(0,0,W,H);ctx.fillStyle='#deddbb';ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillText('일시 정지',W/2,cy())}requestAnimationFrame(render)}
function modal(kind,html){closeDropdown();if(battle?.menuOpen)battle.closeMenu();pausedBefore=battle?.paused||false;if(battle?.phase==='battle')battle.paused=true;syncAudioPause();modalKind=kind;$('modalContent').innerHTML=html;enhanceSelects($('modalContent'));$('modal').hidden=false}
function closeModal(){closeDropdown();if(modalKind==='result')return;$('modal').hidden=true;if(battle?.phase==='battle')battle.paused=pausedBefore;modalKind='';syncAudioPause()}$('closeModal').onclick=closeModal;
function help(){modal('help',`<div class="eyebrow">FIELD MANUAL</div><h2>자동 전선 작전</h2><ul><li><b>건물 건설</b>: 하단 버튼을 누르고 테크 조건에 맞는 건물을 선택한 뒤 아군 생산 구역에 배치합니다.</li><li><b>출격 현황</b>: 완성된 건물에 따라 다음 웨이브에 나갈 병력을 확인합니다. 건물은 고정 병력을 자동으로 보냅니다.</li><li><b>기술</b>: 원본 맵에서 연구 완료된 기술은 시작부터 사용하며, 유닛이 전투 중 자동으로 사용합니다.</li><li><b>전장 보기</b>: 넓은 중앙 언덕 입구를 지나 전초기지를 먼저 공격하고, 전초기지가 무너지면 상대 본진으로 진격합니다.</li><li><b>고지 전투</b>: 언덕 아래 지상 원거리 공격은 위쪽 적에게 빗나갈 수 있습니다. 근접·공중 공격은 고지 회피 판정을 받지 않습니다.</li><li><b>카메라</b>: 지도 스와이프로 이동하고 두 손가락으로 확대·축소합니다. 하단 버튼으로 본진과 전선을 빠르게 볼 수 있습니다.</li><li><b>자원</b>: 미네랄 300으로 시작하고 약 1.34초마다 수입을 받습니다. 가스 시설 0~5개 수입은 10·12·15·18·22·26입니다. 가스 시설은 테란·프로토스 600, 저그 500 미네랄이며, 두 번째부터 투자 단계에 따라 수입이 잠시 중단됩니다. 출격과 자원 수입은 독립적으로 진행됩니다.</li></ul><p>전투와 출격은 자동으로 진행됩니다. 생산 공간에서 건물을 배치하고 테크를 올리세요. 앱을 백그라운드로 보내면 전투가 멈추며, 돌아와서 전장 재개를 눌러 이어갑니다.</p><button class="primary" id="helpDone">확인</button>`);$('helpDone').onclick=closeModal}$('help').onclick=help;
function settingsModal(){modal('settings',`<div class="eyebrow">COMMAND CENTER</div><h2>설정</h2>${[['배경음악','bgm'],['효과음','sfx'],['유닛 음성','voice']].map(([label,key])=>`<label>${label}<input id="vol-${key}" type="range" min="0" max="1" step=".01" value="${settings[key]}"></label>`).join('')}<label>렌더링<select id="quality"><option value="auto" ${settings.quality==='auto'?'selected':''}>자동 · 선명하게</option><option value="low" ${settings.quality==='low'?'selected':''}>절전 · 낮은 해상도</option></select></label><div class="row"><button id="pause">${pausedBefore?'전투 재개':'일시 정지 유지'}</button><button id="manual">조작 방법</button><button id="leave">작전 나가기</button></div><p>미니스타 ${VERSION} · 리마스터 ${data.sourceBuild}<br>설정과 전투 기록은 기기에 저장됩니다.</p>`);for(const key of ['bgm','sfx','voice'])$('vol-'+key).oninput=e=>{settings[key]=Number(e.target.value);save('settings',settings);setAudioVolume(key,settings[key])};$('quality').onchange=e=>{settings.quality=e.target.value;save('settings',settings);resize()};$('pause').onclick=()=>{pausedBefore=!pausedBefore;closeModal()};$('manual').onclick=()=>{const p=pausedBefore;help();pausedBefore=p};$('leave').onclick=()=>{modalKind='';$('modal').hidden=true;stopMusic();stopTransientSounds();audioContext?.suspend().catch(()=>{});newBattle()}}$('settings').onclick=settingsModal;
function resultModal(r){modal('result',`<div class="eyebrow">OPERATION COMPLETE</div><h2 style="font-size:32px;color:${r.win?'#e4d28b':'#de987f'}">${r.win?'승리':'패배'}</h2><p>${r.reason}</p><div class="stats">${[['전투 시간',Math.floor(r.time/60)+':'+String(Math.floor(r.time%60)).padStart(2,'0')],['생산한 병력',r.produced+'기'],['생존 병력',r.survivors+'기'],['적 처치',r.kills+'기'],['아군 손실',r.losses+'기'],['총 피해량',Math.round(r.damage).toLocaleString()]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><button id="retry" class="primary">다시 출전하기</button><button id="toTitle" class="secondary">종족 선택으로</button>`);$('retry').onclick=()=>{modalKind='';$('modal').hidden=true;newBattle();battle.begin()};$('toTitle').onclick=()=>{modalKind='';$('modal').hidden=true;newBattle()}}
$('records').onclick=()=>{const records=read('records',[]);modal('records',`<div class="eyebrow">BATTLE LOG</div><h2>전투 기록</h2>${records.length?records.slice(0,20).map(r=>`<div class="log"><span>${r.win?'승리':'패배'} · ${labels[r.race]}<br><small>${new Date(r.date).toLocaleDateString('ko-KR')} · ${Math.floor(r.time/60)}분 ${Math.floor(r.time%60)}초</small></span><b>${r.kills} 처치</b></div>`).join(''):'<p>첫 작전에 출전해 기록을 남겨보세요.</p>'}`)};
function raceUI(){document.body.dataset.race=race;for(const el of document.querySelectorAll('[data-race]')){el.classList.toggle('active',el.dataset.race===race);el.setAttribute('aria-pressed',el.dataset.race===race)}$('raceBriefing').textContent={terran:'테란 원정대의 지휘권이 이양되었습니다.',zerg:'군단이 당신의 명령을 기다립니다.',protoss:'기사단이 당신의 지휘를 기다립니다.'}[race];$('gasIcon').src=iconResource({terran:1,zerg:2,protoss:3}[race]);$('supplyIcon').src=iconResource({terran:4,zerg:5,protoss:6}[race])}const iconResource=n=>'assets/icons/resource_'+String(n).padStart(3,'0')+'.png';for(const el of document.querySelectorAll('[data-race]'))el.onclick=()=>{race=el.dataset.race;save('race',race);raceUI()};$('deploy').onclick=()=>{newBattle();battle.begin()};
addEventListener('keydown',e=>{if(!battle)return;if(e.key==='Escape'){e.preventDefault();if(battle.menuOpen)battle.closeMenu();else if(!$('modal').hidden)closeModal();return}if(!$('modal').hidden||['title','result'].includes(battle.phase))return;if(e.key===' '){e.preventDefault();battle.paused=!battle.paused;syncAudioPause();toast(battle.paused?'일시 정지':'전투 재개')}});
function pauseForBackground(){if(battle?.phase==='battle'){pausedBeforeBackground=battle.paused;backgroundPauseRequired=true;battle.paused=true;hudUI();$('backgroundPause').hidden=true}last=0;syncAudioPause()}
function resumeFromBackground(){if(!backgroundPauseRequired)return;backgroundPauseRequired=false;$('backgroundPause').hidden=true;if(battle?.phase==='battle')battle.paused=pausedBeforeBackground;last=0;syncAudioPause();hudUI()}
$('resumeBattle').onclick=resumeFromBackground;
document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)pauseForBackground();else if(backgroundPauseRequired)$('backgroundPause').hidden=false;else syncAudioPause()});
addEventListener('pagehide',pauseForBackground);
addEventListener('pageshow',()=>{last=0;if(backgroundPauseRequired)$('backgroundPause').hidden=false});
// Remove only MiniStar's retired offline storage; keep settings and battle records.
async function retireOfflineStorage(){
 try{
  const scope=new URL('./',location.href).href;let retired=false;
  if('serviceWorker'in navigator){for(const registration of await navigator.serviceWorker.getRegistrations())if(registration.scope===scope)retired=(await registration.unregister())||retired}
  if('caches'in window)await Promise.all((await caches.keys()).filter(key=>key.startsWith('ministar-')).map(key=>caches.delete(key)));
  if(retired&&navigator.serviceWorker.controller){location.reload();return false}
 }catch(error){console.warn('Legacy game cache cleanup:',error)}
 return true;
}
async function boot(){try{if(!await retireOfflineStorage())return;enhanceSelects();data=await fetch('assets/data.json').then(r=>{if(!r.ok)throw Error('전투 데이터를 읽을 수 없습니다.');return r.json()});clearMediaSession();const extra=await fetch('rts-data.json?v=0.16.0').then(r=>{if(!r.ok)throw Error('생산 데이터를 읽을 수 없습니다.');return r.json()});Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);const constructionGraphics=await fetch('construction-data.json?v=0.16.0').then(r=>{if(!r.ok)throw Error('건설 그래픽을 읽을 수 없습니다.');return r.json()});Object.assign(data.graphics,constructionGraphics);const turretGraphics=await fetch('turret-data.json?v=0.16.0').then(r=>{if(!r.ok)throw Error('포탑 그래픽을 읽을 수 없습니다.');return r.json()});Object.assign(data.graphics,turretGraphics);const destructionGraphics=await fetch('destruction-data.json?v=0.16.0').then(r=>{if(!r.ok)throw Error('건물 파괴 그래픽을 읽을 수 없습니다.');return r.json()});Object.assign(data.graphics,destructionGraphics);await Promise.all([...Object.values(destructionGraphics),data.graphics[215]].map(g=>loadImage(g.images.blue)));await Promise.all(Object.values(turretGraphics).flatMap(g=>Object.values(g.images)).map(loadImage));await Promise.all(Object.values(constructionGraphics).map(g=>loadImage(g.images.blue)));for(const [key,spec]of Object.entries(extra.research))Object.assign(RESEARCH[key],spec);[desertField,desertProduction]=await Promise.all([loadImage('ds-assets/battlefield.webp?v=0.16.1'),loadImage('ds-assets/production.webp')]);terrain=await loadImage('assets/terrain.webp');if(!terrain)throw Error('지형 이미지를 읽을 수 없습니다.');newBattle();raceUI();$('boot').hidden=true;requestAnimationFrame(render)}catch(e){$('bootText').textContent=e.message+' · start.sh로 서버를 실행한 뒤 접속하세요.';console.error(e)}}boot();

