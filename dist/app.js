import {enhanceSelects,closeDropdown} from './ui.js?v=0.5.0';
import {SPELLS,VERSION,dist,clamp} from './core.js?v=0.5.0';
import {Battle,BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH,WAVE_SECONDS,PRODUCTION_OFFSET} from './autobattle.js?v=0.5.0';
import {researchAt} from './tech.js?v=0.5.0';
const $=id=>document.getElementById(id),canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false}),mini=$('minimap'),mc=mini.getContext('2d');
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem('ministar.'+k))??f}catch{return f}},save=(k,v)=>{try{localStorage.setItem('ministar.'+k,JSON.stringify(v))}catch{}};
const labels={terran:'테란',zerg:'저그',protoss:'프로토스'},icon=n=>'assets/icons/'+String(n).padStart(3,'0')+'.png';
let settings=read('settings',{bgm:.22,sfx:.55,voice:.7,panel:'normal',zoom:.6,quality:'auto'}),race=read('race','terran'),data,battle,terrain,W=innerWidth,H=innerHeight,DPR=1,last=0,hudTime=0,viewMode='field',ctrl=false,box=false,map=false,historyMenu=false,modalKind='',pausedBefore=false,toastTimer,camera={x:640,y:1700,zoom:.6},pointers=new Map(),gesture=null,pinch=null,lastTap={time:0,type:null},lastGroup={time:0,id:null},markers=[],beams=[],cache=new Map(),pending=new Map(),audioContext=null,audioBuffers=new Map(),audioChannels=null,musicSource=null,musicGeneration=0,voiceSources=new Set(),transientSounds=new Set(),voiceGeneration=0,lastVoice=0,sfxActive=0,backgroundPauseRequired=false,pausedBeforeBackground=false;
document.body.dataset.panel=settings.panel;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function loadImage(url){if(cache.has(url))return Promise.resolve(cache.get(url));if(pending.has(url))return pending.get(url);const promise=new Promise(resolve=>{const im=new Image();im.onload=()=>{cache.set(url,im);pending.delete(url);resolve(im)};im.onerror=()=>{pending.delete(url);resolve(null)};im.src=url});pending.set(url,promise);return promise}
function getImage(url){if(!url)return null;if(cache.has(url))return cache.get(url);loadImage(url);return null}
const audioPaused=()=>document.hidden||backgroundPauseRequired||!battle||battle.phase!=='battle'||battle.paused;
function clearMediaSession(){try{const media=navigator.mediaSession;if(media){media.metadata=null;media.playbackState='none';for(const action of ['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack'])media.setActionHandler(action,null)}}catch{}}
function getAudioContext(){if(audioContext)return audioContext;const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return null;audioContext=new Context();audioChannels={};for(const [name,key]of Object.entries({music:'bgm',effects:'sfx',voice:'voice'})){const gain=audioContext.createGain();gain.gain.value=settings[key]*(name==='effects'?.4:1);gain.connect(audioContext.destination);audioChannels[name]=gain}clearMediaSession();return audioContext}
function setAudioVolume(key,value){settings[key]=value;save('settings',settings);if(audioChannels){const name={bgm:'music',sfx:'effects',voice:'voice'}[key];if(name)audioChannels[name].gain.value=value*(key==='sfx'?.4:1)}}
function decodeAudio(url){if(audioBuffers.has(url))return audioBuffers.get(url);const promise=(async()=>{const context=getAudioContext();if(!context)throw Error('Web Audio is unavailable');const response=await fetch(url);if(!response.ok)throw Error('Audio request failed');return context.decodeAudioData(await response.arrayBuffer())})().catch(error=>{audioBuffers.delete(url);throw error});audioBuffers.set(url,promise);return promise}
function forgetSound(record){if(!record||record.ended)return;record.ended=true;transientSounds.delete(record);voiceSources.delete(record);record.gain.disconnect();record.source.disconnect();record.onFinish?.()}
function playSample(url,channel,trim=1,token=null,onFinish=null){const context=getAudioContext();if(!context)return Promise.resolve(null);if(context.state==='suspended')context.resume().catch(()=>{});return decodeAudio(url).then(buffer=>{if(audioPaused()||token&&token.value!==voiceGeneration)return null;const source=context.createBufferSource(),gain=context.createGain(),record={source,gain,onFinish,ended:false};source.buffer=buffer;gain.gain.value=trim;source.connect(gain);gain.connect(audioChannels[channel]);source.onended=()=>forgetSound(record);if(channel==='voice')voiceSources.add(record);if(channel==='effects')transientSounds.add(record);source.start();return record}).catch(()=>null)}
function music(){if(settings.bgm<=0||audioPaused()||musicSource)return;const context=getAudioContext();if(!context)return;context.resume().catch(()=>{});const generation=++musicGeneration;decodeAudio('assets/audio/'+race+'.ogg').then(buffer=>{if(generation!==musicGeneration||audioPaused()||musicSource)return;const source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(audioChannels.music);source.start();musicSource=source}).catch(()=>{})}
function stopMusic(){musicGeneration++;if(musicSource){try{musicSource.stop()}catch{}musicSource.disconnect();musicSource=null}}
function stopTransientSounds(){for(const record of [...transientSounds,...voiceSources]){try{record.source.stop()}catch{}forgetSound(record)}sfxActive=0}
function syncAudioPause(){clearMediaSession();if(audioPaused()){stopTransientSounds();audioContext?.suspend().catch(()=>{});return}const context=getAudioContext();context?.resume().catch(()=>{});music()}
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
function setViewMode(mode){if(!battle||battle.phase!=='battle')return;if(battle.menuOpen)battle.closeMenu();viewMode=mode;document.body.dataset.space=mode;const button=$('spaceToggle');button.textContent=mode==='production'?'전장':'생산';button.setAttribute('aria-label',mode==='production'?'전장으로 돌아가기':'생산 공간으로 이동');map=false;$('mapWrap').hidden=true;$('map').setAttribute('aria-pressed','false');$('map').disabled=mode!=='field';battle.select([],false);camera={x:640,y:(mode==='production'?PRODUCTION_OFFSET:0)+(mode==='production'?600:1700),zoom:mode==='production'?clamp(W/1280,.25,.62):.6};limitCamera();selectionUI()}
function newBattle(){stopMusic();stopTransientSounds();if(battle?.menuOpen)battle.closeMenu();battle=new Battle(data,{race,difficulty:$('difficulty').value});battle.on(event);viewMode='field';document.body.dataset.space='field';backgroundPauseRequired=false;pausedBeforeBackground=false;$('backgroundPause').hidden=true;ctrl=box=map=false;markers=[];beams=[];camera={x:640,y:1700,zoom:.6};phaseUI();selectionUI();groupsUI();}
function event(e){if(e.type==='phase')phaseUI();if(e.type==='change'){hudUI();selectionUI();if(battle.menuOpen&&!battle.targeting)menuUI()}if(e.type==='production'){productionUI()}if(e.type==='selection')selectionUI();if(e.type==='groups')groupsUI();if(e.type==='menu')menuUI();if(e.type==='notice')toast(e.text);if(e.type==='voice')unitVoice(e.unit,e.kind);if(e.type==='sfx')effectSound(e.id);if(e.type==='beam')beams.push({...e,left:.13});if(e.type==='command'&&e.point&&e.applied)markers.push({...e.point,left:.8,attack:e.command==='attack'});if(e.type==='result'){const records=read('records',[]);records.unshift({...e.result,race,date:new Date().toISOString()});save('records',records.slice(0,40));resultModal(e.result)}}
function phaseUI(){
 closeDropdown();const title=battle.phase==='title';$('title').hidden=!title;
 for(const id of ['hud','mission','panel','camera'])$(id).hidden=title;$('spaceToggle').hidden=battle.phase!=='battle';
 $('objective').textContent='적 메인 기지를 먼저 함락하십시오';
 if(battle.phase==='battle'){viewMode='field';document.body.dataset.space='field';camera.x=640;camera.y=1700;camera.zoom=.6;$('backgroundPause').hidden=!backgroundPauseRequired;syncAudioPause();toast('생산 공간에서 건물을 짓고 출격 병력을 구성하세요. 전투는 자동으로 진행됩니다.')}
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
  $('money').textContent=Math.floor(battle.money).toLocaleString();$('gas').textContent=Math.floor(battle.gas).toLocaleString();
  $('supply').textContent=Number(battle.supply.toFixed(1))+'/'+battle.maxSupply;$('slow').hidden=true;
  $('commandButton').disabled=battle.phase!=='battle'||viewMode!=='production';
  const producer=units.length===1?units[0]:null;
  $('productionButton').disabled=viewMode!=='production'||battle.phase!=='battle';
  $('researchButton').disabled=viewMode!=='production'||!producer||!producer.productionOnly||!producer.def.building||!Object.keys(RESEARCH).some(key=>researchAt(producer.type,key));
  if(producer){$('hp').textContent='HP '+Math.ceil(producer.hp)+'/'+Math.ceil(producer.maxHp||producer.def.hp);$('shields').textContent=producer.def.shield?'S '+Math.ceil(producer.shield):'';$('energy').textContent=''}else for(const id of ['hp','shields','energy'])$(id).textContent='';
  return;
 }
 const seconds=Math.floor(battle.time);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('phase').textContent=battle.paused?'PAUSED':'BATTLE';
 $('money').textContent=Math.floor(battle.money).toLocaleString();$('gas').textContent=Math.floor(battle.gas).toLocaleString();$('supply').textContent=Number(battle.supply.toFixed(1))+'/'+battle.maxSupply;$('slow').hidden=true;
 $('commandButton').disabled=!battle.selected.length||battle.phase!=='battle';
}
function selectionUI(){
 if(!battle)return;const units=battle.selected;
 if(battle.laneMode){
  const unit=units[0],entries=unit?.productionOnly?battle.activeWave(0,unit.id):new Map(),lineup=[...entries].map(([type,count])=>`${data.units[type].name} ${count}기`).join(' · ');$('unitName').textContent=viewMode==='production'&&unit?unit.def.name:'자동 전선';
  $('order').textContent=viewMode==='field'?'생산 공간에서 건물을 짓고 출격 병력을 구성하세요.':unit?.garrison?'수비 병력 · 마린 3기 · 파이어뱃 1기':unit?.construction?'건설 중':unit?.productionOnly&&lineup?`매 ${WAVE_SECONDS}초 자동 출격 · ${lineup}`:unit?.productionOnly&&unit?.def.building?'완성되면 해당 건물의 병력이 자동 출격합니다.':unit?.def.building?'전장 방어 시설':'완성된 생산 건물이 없습니다.';
  $('chips').replaceChildren();hudUI();productionUI();return;
 }
 $('unitName').textContent=units.length===1?units[0].def.name:units.length?units.length+'기 선택됨' :'전장 유닛을 선택하세요';
 if(!units.length){for(const id of ['hp','shields','energy'])$(id).textContent='';$('order').textContent=box?'범위 선택 모드 활성화':'길게 누르고 드래그하면 범위 선택'}
 const portrait=$('portrait'),url=units.length===1?units[0].def.portrait:null;portrait.hidden=!url;if(url&&portrait.getAttribute('src')!==url){portrait.src=url;portrait.play().catch(()=>{})}if(!url)portrait.pause();
 const types=new Map();for(const u of units)types.set(u.type,(types.get(u.type)||0)+1);$('chips').replaceChildren();for(const [type,n] of types){const b=document.createElement('button');b.innerHTML=`<img src="${icon(type)}" alt="">${n}`;b.title=data.units[type].name;b.onclick=()=>battle.select(units.filter(u=>u.type===type).map(u=>u.id));$('chips').append(b)}hudUI();productionUI()
}
function groupsUI(){if(!battle||battle.laneMode)return;$('ctrl').setAttribute('aria-pressed',ctrl);for(let i=0;i<10;i++){const b=$('group'+i),g=battle.groups[i];b.classList.toggle('occupied',!!g.length);b.classList.toggle('selected',!!g.length&&g.length===battle.selection.length&&g.every(id=>battle.selection.includes(id)));b.setAttribute('aria-label',(i===9?0:i+1)+'번 부대 '+g.length+'기')}}
$('ctrl').onclick=()=>{ctrl=!ctrl;groupsUI()};
function openMenu(mode='build'){if(mode==='build'&&viewMode!=='production'){toast('생산 공간에서 건물을 배치하세요.');return}if((mode==='produce'||mode==='research')&&viewMode!=='production'){toast('생산 공간에서 확인하세요.');return}if(battle.menuOpen){if(battle.menuMode!==mode){battle.menuMode=mode;menuUI()}else battle.closeMenu();return}if(battle.openMenu(mode)){history.pushState({command:true},'');historyMenu=true}}
function actionCard(name,id,cost,reason,click,detail=''){
 const button=document.createElement('button');button.className='command-card';button.innerHTML=`<img src="${icon(id)}" alt=""><b>${name}</b>${cost?`<small>◆ ${cost[0]} · ● ${cost[1]}</small>`:''}<small>${reason||detail}</small>`;button.disabled=!!reason;button.title=reason||name;button.onclick=click;$('commandGrid').append(button);return button;
}
function menuUI(){
 if(!battle)return;if(!battle.menuOpen&&historyMenu){historyMenu=false;history.back()}
 $('commands').hidden=!battle.menuOpen||!!battle.targeting;$('target').hidden=!battle.targeting;$('slow').hidden=true;
 if(battle.targeting){const key=battle.targeting,type=key.startsWith('build:')?Number(key.split(':')[1]):null;$('targetText').textContent=type?data.units[type].name+' · 아군 생산 구역의 빈 곳을 터치해 건설':'위치를 터치하세요';return}
 if(!battle.menuOpen)return;$('commandGrid').replaceChildren();
 const mode=battle.menuMode||'build',unit=battle.selected[0];
 $('commandTitle').textContent=mode==='build'?'건물 건설':mode==='produce'?'출격 현황':'기술 연구';
 if(mode==='build'){
  $('commandHint').textContent='생산 공간 어디든 건설할 수 있습니다. 매 25초마다 미네랄 +200, 가스 +0을 받고 완성된 가스 건물마다 미네랄 +100, 가스 +50을 더 받습니다.';
  for(const type of battle.buildingOptions(battle.builder)){const d=data.units[type];actionCard(d.name+' 건설',type,battle.buildingCost(type),battle.buildReason(battle.builder,type),()=>{battle.chooseCommand('build:'+type);placementPoint={x:640,y:PRODUCTION_OFFSET+1024}},Math.ceil(battle.constructionSeconds(type))+'초')}
  if(unit?.team===0&&unit.productionOnly&&unit.def.building){for(const type of battle.morphOptions(unit)){const d=data.units[type];actionCard(d.name+' 변태',type,battle.buildingCost(type),battle.morphReason(unit,type),()=>{battle.morph(unit,type);battle.closeMenu()},Math.ceil(battle.constructionSeconds(type))+'초')}
   for(const type of battle.addonOptions(unit)){const d=data.units[type];actionCard(d.name+' 부착',type,battle.buildingCost(type),battle.addonReason(unit,type),()=>{battle.addon(unit,type);battle.closeMenu()},Math.ceil(battle.constructionSeconds(type))+'초')}}
  if(!$('commandGrid').children.length)$('commandHint').textContent='현재 지을 수 있는 건물이 없습니다. 선행 테크와 자원을 확인하세요.';
 }else if(mode==='produce'){
  const scoped=unit?.team===0&&unit.productionOnly&&unit.def.building?unit:null,counts=battle.activeWave(0,scoped?.id??null);
  $('commandHint').textContent=scoped?'선택한 건물에서 다음 출격부터 나갈 유닛입니다. 출격 편성은 건물 종류에 따라 자동으로 결정됩니다.':'완성된 생산 건물에서 다음 출격부터 나갈 전체 병력입니다. 편성은 건물 종류에 따라 자동으로 결정됩니다.';
  for(const [type,count]of counts){const card=document.createElement('div');card.className='wave-card';card.innerHTML=`<img src="${icon(type)}" alt=""><b>${data.units[type].name}</b><span>${count}기 · 매 ${WAVE_SECONDS}초</span>`;$('commandGrid').append(card)}
  if(!counts.size){const empty=document.createElement('p');empty.className='wave-empty';empty.textContent=scoped?'이 건물은 현재 출격 유닛을 생성하지 않습니다.':'완성된 출격 생산 건물이 없습니다.';$('commandGrid').append(empty)}
 }else{
  if(!unit||!unit.productionOnly||!unit.def.building){$('commandHint').textContent='생산 공간에서 연구할 건물을 선택하세요.';return}
  $('commandHint').textContent='연구가 끝나면 해당 유닛이 기술을 자동으로 사용합니다.';
  for(const [key,spec]of Object.entries(RESEARCH))if(researchAt(unit.type,key))actionCard(spec.name,spec.icon,spec.cost,battle.researchReason(unit,key),()=>battle.research(unit,key),Math.ceil(spec.time)+'초');
  if(!$('commandGrid').children.length)$('commandHint').textContent='이 건물에는 연구 가능한 기술이 없습니다.';
 }
}
function productionUI(){
 if(!battle)return;const unit=battle.selected.length===1?battle.selected[0]:null,box=$('productionQueue');box.replaceChildren();
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
$('spaceToggle').onclick=()=>setViewMode(viewMode==='field'?'production':'field');$('commandButton').onclick=()=>openMenu('build');$('productionButton').onclick=()=>openMenu('produce');$('researchButton').onclick=()=>openMenu('research');$('baseView').onclick=()=>setViewMode('field');$('frontView').onclick=()=>{setViewMode('field');camera.y=1024;camera.zoom=.5;limitCamera()};$('closeCommands').onclick=()=>battle.closeMenu();$('cancel').onclick=()=>battle.closeMenu();addEventListener('popstate',()=>{historyMenu=false;if(battle?.menuOpen)battle.closeMenu();else if(!$('modal').hidden)closeModal()});
$('box').onclick=()=>{box=!box;$('box').setAttribute('aria-pressed',box);toast(box?'지면을 드래그해 범위 선택':'길게 누른 뒤 드래그해 범위 선택')};$('map').onclick=()=>{map=!map;$('map').setAttribute('aria-pressed',map);$('mapWrap').hidden=!map};$('panelMode').onclick=()=>{const modes=['min','normal','expanded'];settings.panel=modes[(modes.indexOf(settings.panel)+1)%3];document.body.dataset.panel=settings.panel;save('settings',settings);resize()};$('selectAll').onclick=()=>battle.select(battle.allies.filter(u=>!u.loaded).map(u=>u.id));$('home').onclick=()=>{$('baseView').click()};$('plus').onclick=()=>zoom(camera.zoom*1.2);$('minus').onclick=()=>zoom(camera.zoom/1.2);
const visible=u=>{const p=toScreen(u.x,u.y);return p.x>-40&&p.x<W+40&&p.y>40&&p.y<H-panelHeight()+40};
function hit(p,own=false){return battle.units.filter(u=>u.alive&&!u.hidden&&!u.loaded&&!!u.productionOnly===(viewMode==='production')&&(viewMode!=='production'||u.team===0)&&(!own||u.team===0)&&(u.team===0||battle.canSee(0,u))&&(u.def.building?Math.abs(u.x-p.x)<battle.footprint(u.type)[0]/2&&Math.abs(u.y-p.y)<battle.footprint(u.type)[1]/2:dist(u,p)<Math.max(u.r,15/camera.zoom))).sort((a,b)=>dist(a,p)-dist(b,p))[0]||null}
function nodeHit(p){return battle.nodes.find(n=>n.amount>0&&dist(p,n)<n.r+12&&(battle.fog[Math.floor(n.y/32)*40+Math.floor(n.x/32)]))||null}
function tap(p){const wp=toWorld(p.x,p.y),u=hit(wp);if(battle.targeting){if(viewMode!=='production'){toast('건물은 생산 공간에서만 건설할 수 있습니다.');return}const ok=battle.execute(battle.targeting,wp,u);if(!ok)toast('아군 생산 구역 안의 빈 곳을 선택하세요.');return}if(battle.menuOpen){battle.closeMenu();return}if(u?.team===0&&u.def.building)battle.select([u.id],false);else if(u)toast((u.team===0?'아군 ':'적군 ')+u.def.name+' · HP '+Math.ceil(u.hp))}
const position=e=>({x:e.clientX,y:e.clientY});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(!battle||!['prep','battle'].includes(battle.phase)||!$('modal').hidden)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=position(e);pointers.set(e.pointerId,p);if(pointers.size===2){clearTimeout(gesture?.timer);const [a,b]=[...pointers.values()];pinch={distance:dist(a,b),zoom:camera.zoom,world:toWorld((a.x+b.x)/2,(a.y+b.y)/2)};gesture=null;return}if(pointers.size>2)return;const wp=toWorld(p.x,p.y);gesture={pointer:e.pointerId,kind:'pending',start:p,current:p,world:wp,unit:hit(wp,true),camera:{...camera}}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();const p=position(e);if(battle.targeting?.startsWith('build:'))placementPoint=toWorld(p.x,p.y);pointers.set(e.pointerId,p);if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()],x=(a.x+b.x)/2,y=(a.y+b.y)/2;camera.zoom=clamp(pinch.zoom*dist(a,b)/Math.max(1,pinch.distance),.25,2.8);camera.x=pinch.world.x-(x-W/2)/camera.zoom;camera.y=pinch.world.y-(y-cy())/camera.zoom;limitCamera();return}if(!gesture||gesture.pointer!==e.pointerId)return;gesture.current=p;if(gesture.kind==='pending'&&dist(p,gesture.start)>8){clearTimeout(gesture.timer);gesture.kind='pan'}if(gesture.kind==='pan'){camera.x=gesture.camera.x-(p.x-gesture.start.x)/camera.zoom;camera.y=gesture.camera.y-(p.y-gesture.start.y)/camera.zoom;limitCamera()}});
function pointerEnd(e,cancel=false){if(!pointers.has(e.pointerId))return;const p=position(e);pointers.delete(e.pointerId);if(pinch){if(!pointers.size){pinch=null;gesture=null;settings.zoom=camera.zoom;save('settings',settings)}return}if(!gesture)return;clearTimeout(gesture.timer);if(!cancel){if(gesture.kind==='pending')tap(p)}gesture=null}
canvas.addEventListener('pointerup',e=>pointerEnd(e));canvas.addEventListener('pointercancel',e=>{pointerEnd(e,true);pointers.clear();pinch=null});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(camera.zoom*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY)},{passive:false});
let miniDrag=false;const miniMove=e=>{const r=mini.getBoundingClientRect();camera.x=(e.clientX-r.left)/r.width*1280;camera.y=(e.clientY-r.top)/r.height*2048;limitCamera()};mini.onpointerdown=e=>{miniDrag=true;mini.setPointerCapture(e.pointerId);miniMove(e)};mini.onpointermove=e=>{if(miniDrag)miniMove(e)};mini.onpointerup=mini.onpointercancel=()=>miniDrag=false;
function pose(g,action,time,direction){const t=g.tracks[action]||g.tracks.idle||g.tracks.built;let f=0;if(t){let tick=t.loop?time*24%Math.max(1,t.ticks):Math.min(time*24,t.ticks-.001);for(const [n,d] of t.frames){f=n;if(tick<d)break;tick-=d}}const flip=g.turns&&direction>16;if(g.turns)f+=direction>16?32-direction:direction;return {frame:Math.min(g.frames.length-1,f),flip}}
function sprite(id,team,x,y,action='idle',time=0,direction=0,alpha=1){const g=data.graphics[id];if(!g)return false;const image=getImage(g.images[team===1?'red':'blue']);if(!image)return false;const p=pose(g,action,time,direction),f=g.frames[p.frame];if(!f||!f[4]||!f[5])return false;ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);if(p.flip)ctx.scale(-1,1);ctx.drawImage(image,f[0],f[1],f[4],f[5],(f[2]-g.canvas[0]/2)*.5,(f[3]-g.canvas[1]/2)*.5,f[4]*.5,f[5]*.5);ctx.restore();return true}
function unit(u){if(!!u.productionOnly!==(viewMode==='production')||viewMode==='production'&&u.team!==0||u.hidden||u.loaded||u.refunded||u.team===1&&!battle.canSee(0,u)||!u.alive&&battle.time-u.deathTime>1.8||!visible(u)&&!u.def.building)return;const selected=battle.selection.includes(u.id),alpha=!u.alive?Math.max(0,1-(battle.time-u.deathTime)/1.8):u.cloaked?.42:u.burrowed&&u.type!==103?.3:1;if(selected&&u.alive){ctx.strokeStyle='#79f880';ctx.lineWidth=1.3/camera.zoom;ctx.beginPath();ctx.ellipse(u.x,u.y+u.r*.55,u.r+5,(u.r+5)*.48,0,0,Math.PI*2);ctx.stroke();if(u.goal){ctx.strokeStyle='#8ece9844';ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(u.goal.x,u.goal.y);ctx.stroke();ctx.setLineDash([])}}const g=data.graphics[u.def.image];if(g&&u.alive)for(const sh of g.shadows||[])sprite(sh,0,u.x+2,u.y+3,'idle',u.animTime,u.direction,.35);sprite(u.egg?(u.type===43?11:u.type===38?914:21):u.def.image,u.team,u.x,u.y,u.construction?'built':u.action,u.animTime,u.direction,u.construction?alpha*.7:alpha);const sub=u.def.subunit!==null?data.units[u.def.subunit]:null;if(sub&&u.alive)sprite(sub.image,u.team,u.x,u.y,u.action,u.animTime,u.direction,alpha);if(u.alive&&(selected||u.team===1||u.hp<u.def.hp||u.construction)){const w=Math.max(22,Math.min(60,u.r*2+4)),h=3/camera.zoom,y=u.y-u.r-10/camera.zoom;ctx.fillStyle='#071114';ctx.fillRect(u.x-w/2-1,y-1,w+2,h+2);ctx.fillStyle=u.hp/u.def.hp>.55?'#74cb6c':u.hp/u.def.hp>.25?'#e6c565':'#e78066';ctx.fillRect(u.x-w/2,y,w*clamp(u.hp/(u.maxHp||u.def.hp),0,1),h);if(u.def.shield){ctx.fillStyle='#5b9fd3';ctx.fillRect(u.x-w/2,y-4/camera.zoom,w*u.shield/u.def.shield,2/camera.zoom)}if(u.def.energy&&selected){ctx.fillStyle='#b183d2';ctx.fillRect(u.x-w/2,y+5/camera.zoom,w*u.energy/u.def.energy,2/camera.zoom)}}if(u.matrix>0||u.buffs.stasis>0||u.buffs.lockdown>0){ctx.strokeStyle=u.matrix>0?'#c3e9a388':u.buffs.stasis>0?'#b7deea':'#e9ca64';ctx.lineWidth=1.5;ctx.strokeRect(u.x-u.r-3,u.y-u.r-3,u.r*2+6,u.r*2+6)}}
function tile(x,y){return ((x*17+y*31)>>>0)%32}
let battlefieldTexture=null;
function terrainTile(c,n,x,y,size=32){c.drawImage(terrain,n%16*64,Math.floor(n/16)*64,64,64,x,y,size,size)}
function drawRelief(){
 if(!battlefieldTexture){
  const c=document.createElement('canvas');c.width=1280;c.height=2048;const g=c.getContext('2d');
  for(let y=0;y<2048;y+=32)for(let x=0;x<1280;x+=32){
   const salt=(((x/32)*73856093)^((y/32)*19349663))>>>0,high=y<640||y>=1408;
   const shore=320;
   const water=y>=640&&y<1408&&(x<shore||x>1280-shore);
   const ramp=y>=640&&y<800||y>=1248&&y<1408;
   let n=water?50+salt%9:high?112+salt%16:ramp?32+salt%16:1+salt%31;
   if(high&&Math.abs(x-640)<170+Math.sin(y*.012)*40)n=32+salt%16;
   terrainTile(g,n,x,y);
  }
  // Cliff tiles meet the collision boundary and leave a broad 640-pixel entrance.
  for(const base of [640,1376])for(let y=0;y<32;y+=32)for(let x=0;x<1280;x+=32){
   if(x>=320&&x<960)continue;
   terrainTile(g,80+(Math.floor(x/32)%16)+(y?16:0),x,base+y);
  }
  // Original shoreline tiles follow the two impassable water banks.
  for(let y=640;y<1408;y+=32){const edge=320;
   terrainTile(g,64+(Math.floor(y/32)%16),edge-16,y);
   terrainTile(g,64+(Math.floor(y/32)%16),1280-edge-16,y);
  }
  battlefieldTexture=c;
 }
 ctx.drawImage(battlefieldTexture,0,0);
}
function drawProductionBoard(){ctx.save();ctx.translate(0,PRODUCTION_OFFSET);
 for(let y=0;y<PRODUCTION_HEIGHT;y+=32)for(let x=0;x<1280;x+=32){const salt=(((x/32)*73856093)^((y/32)*19349663))>>>0;terrainTile(ctx,1+salt%31,x,y)}
 ctx.strokeStyle='#82966e88';ctx.lineWidth=2;ctx.strokeRect(16,16,1248,2016);
 ctx.fillStyle='#111a16bb';ctx.strokeStyle='#b2c28a99';ctx.lineWidth=2;
 for(const [i,node]of battle.nodes.filter(n=>n.team===0&&n.kind==='gas').entries()){ctx.beginPath();ctx.arc(node.x,node.y,58,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#e1e0bb';ctx.font=`bold ${12/camera.zoom}px system-ui`;ctx.textAlign='center';ctx.fillText(`가스 ${i+1}`,node.x,node.y+49);ctx.fillStyle='#111a16bb'}
 ctx.restore()}
function minimap(){const sx=mini.width/1280,sy=mini.height/2048;mc.fillStyle='#162b20';mc.fillRect(0,0,160,220);mc.fillStyle='#857b5155';for(const r of battle.map.rocks)mc.fillRect(r.x*sx,r.y*sy,r.w*sx,r.h*sy);for(let y=0;y<64;y++)for(let x=0;x<40;x++)if(!battle.fog[y*40+x]){mc.fillStyle=battle.explored[y*40+x]?'#030c1066':'#02080cdd';mc.fillRect(x*32*sx,y*32*sy,32*sx+.5,32*sy+.5)}for(const node of battle.nodes){if(node.team===1)continue;mc.fillStyle=node.kind==='gas'?'#63a047':'#4da3db';mc.fillRect(node.x*sx-1,node.y*sy-1,3,3)}for(const u of battle.units)if(u.alive&&!u.loaded&&!u.productionOnly&&(u.team===0||battle.canSee(0,u))){mc.fillStyle=u.team?'#e78a6e':battle.selection.includes(u.id)?'#e7e5af':'#87d17d';const s=u.def.building?5:2;mc.fillRect(u.x*sx-s/2,u.y*sy-s/2,s,s)}if(battle.core?.alive){mc.fillStyle='#e3c789';mc.fillRect(battle.core.x*sx-2,battle.core.y*sy-2,4,4)}const a=toWorld(0,63),b=toWorld(W,H-panelHeight());mc.strokeStyle='#c7d4bd';mc.strokeRect(a.x*sx,a.y*sy,(b.x-a.x)*sx,(b.y-a.y)*sy)}
function drawEconomy(){
 if(battle.phase==='title')return;
 const sources=battle.units.filter(u=>u.alive&&battle.ready(u)&&!!u.productionOnly===(viewMode==='production')&&(viewMode!=='production'||u.team===0)&&BUILDINGS[u.type]?.creepSource);
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
 for(const node of battle.nodes){if(node.amount<=0||viewMode==='production'&&node.team!==0)continue;if(!sprite(node.kind==='gas'?344:347,0,node.x,node.y,'idle',0)){
  ctx.fillStyle=node.kind==='gas'?'#608d46':'#337fbd';ctx.beginPath();ctx.ellipse(node.x,node.y,node.r,node.r*.6,0,0,Math.PI*2);ctx.fill();
 }}
 const selected=battle.selected[0];if(selected?.rally){ctx.strokeStyle='#cfe68d';ctx.beginPath();ctx.moveTo(selected.rally.x,selected.rally.y);ctx.lineTo(selected.rally.x,selected.rally.y-25);ctx.lineTo(selected.rally.x+15,selected.rally.y-19);ctx.lineTo(selected.rally.x,selected.rally.y-13);ctx.stroke()}
 if(battle.targeting?.startsWith('build:')&&placementPoint){
  const type=Number(battle.targeting.split(':')[1]),worker=battle.builder||battle.selected.find(u=>u.type===WORKER[u.def.race]);if(!worker)return;const result=battle.placement(worker,type,placementPoint),p=result.point,[w,h]=battle.footprint(type);
  if(BUILDINGS[type].psi)for(const pylon of battle.allies.filter(u=>u.type===156&&battle.ready(u))){ctx.fillStyle='#6d82e51b';ctx.strokeStyle='#7f9aff66';ctx.beginPath();ctx.ellipse(pylon.x,pylon.y,224,160,0,0,Math.PI*2);ctx.fill();ctx.stroke()}
  ctx.fillStyle=result.reason?'#e84a4a44':'#67e35d44';ctx.strokeStyle=result.reason?'#f36a68':'#8cf784';ctx.lineWidth=2/camera.zoom;ctx.fillRect(p.x-w/2,p.y-h/2,w,h);ctx.strokeRect(p.x-w/2,p.y-h/2,w,h);sprite(data.units[type].image,0,p.x,p.y,'idle',0,0,.45);
  ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillStyle=result.reason?'#ffc6bc':'#bff5ac';ctx.fillText(result.reason||'터치하여 건설',p.x,p.y-h/2-10);
 }
}
function render(now){const realDt=last?Math.min(.15,(now-last)/1000):1/60;last=now;const dt=document.hidden||backgroundPauseRequired?0:realDt;battle.update(dt);hudTime+=realDt;if(hudTime>.15){hudTime=0;hudUI();productionUI();if(map)minimap()}ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#10191c';ctx.fillRect(0,0,W,H);limitCamera();ctx.save();ctx.translate(W/2,cy());ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);if(viewMode==='production'){drawProductionBoard();drawEconomy();for(const u of battle.units.filter(u=>u.productionOnly&&u.team===0))unit(u);ctx.restore();requestAnimationFrame(render);return}const a=toWorld(0,0),b=toWorld(W,H),x0=Math.max(0,Math.floor(a.x/32)),x1=Math.min(40,Math.ceil(b.x/32)),y0=Math.max(0,Math.floor(a.y/32)),y1=Math.min(64,Math.ceil(b.y/32));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const n=tile(x,y);ctx.drawImage(terrain,n%16*64,Math.floor(n/16)*64,64,64,x*32,y*32,32,32)}drawRelief();drawEconomy();for(const area of battle.areas){ctx.save();ctx.globalAlpha=Math.min(.3,area.left*.6);ctx.fillStyle={storm:'#89b8f7',swarm:'#ccad50',web:'#dce6e9',plague:'#ae3840',ensnare:'#94c45f',stasis:'#bce0ed'}[area.kind]||'#9bbed2';ctx.beginPath();ctx.arc(area.x,area.y,area.r,0,Math.PI*2);ctx.fill();ctx.restore();if(area.kind==='storm')sprite(525,0,area.x,area.y,'idle',area.duration-area.left)}for(const u of [...battle.units].sort((a,b)=>Number(a.def.air)-Number(b.def.air)||a.y-b.y))unit(u);for(const p of battle.projectiles){const dir=(Math.round(Math.atan2(p.endX-p.x,p.y-p.endY)*16/Math.PI)+32)%32;if(!sprite(p.image,p.team,p.x,p.y,'idle',p.elapsed,dir)){ctx.fillStyle=p.spell?'#ffe39b':'#b1d9e6';ctx.beginPath();ctx.arc(p.x,p.y,p.spell?4:2,0,Math.PI*2);ctx.fill()}}for(const f of battle.effects)sprite(f.image,0,f.x,f.y,'idle',(f.duration-f.left)*1.1,0,Math.min(1,f.left*4));for(const beam of beams){beam.left-=realDt;ctx.strokeStyle=beam.team?'#f8c28d88':'#dfef9a88';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(beam.from.x,beam.from.y);ctx.lineTo(beam.to.x,beam.to.y);ctx.stroke()}beams=beams.filter(x=>x.left>0);if(battle.phase!=='title'&&!battle.laneMode)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!battle.fog[y*40+x]){ctx.fillStyle=battle.explored[y*40+x]?'#030c10a9':'#030a10e8';ctx.fillRect(x*32,y*32,32.5,32.5)}if(battle.core?.alive){ctx.save();ctx.translate(battle.core.x,battle.core.y-85);ctx.rotate(Math.PI/4);ctx.fillStyle='#e2c587';ctx.fillRect(-5,-5,10,10);ctx.restore()}for(const m of markers){m.left-=realDt;ctx.globalAlpha=Math.min(1,m.left*2);ctx.strokeStyle=m.attack?'#e99b76':'#9cdd91';ctx.lineWidth=1.8/camera.zoom;ctx.beginPath();ctx.arc(m.x,m.y,8+(1-m.left)*15,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}markers=markers.filter(m=>m.left>0);if(gesture?.kind==='box'){const s=gesture.world,e=toWorld(gesture.current.x,gesture.current.y);ctx.fillStyle='#83e7921c';ctx.strokeStyle='#9ef69a';ctx.lineWidth=1/camera.zoom;ctx.fillRect(s.x,s.y,e.x-s.x,e.y-s.y);ctx.strokeRect(s.x,s.y,e.x-s.x,e.y-s.y)}ctx.restore();if(battle.paused&&battle.phase==='battle'&&$('modal').hidden){ctx.fillStyle='#07151aa9';ctx.fillRect(0,0,W,H);ctx.fillStyle='#deddbb';ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillText('일시 정지',W/2,cy())}requestAnimationFrame(render)}
function modal(kind,html){closeDropdown();if(battle?.menuOpen)battle.closeMenu();pausedBefore=battle?.paused||false;if(battle?.phase==='battle')battle.paused=true;syncAudioPause();modalKind=kind;$('modalContent').innerHTML=html;enhanceSelects($('modalContent'));$('modal').hidden=false}
function closeModal(){closeDropdown();if(modalKind==='result')return;$('modal').hidden=true;if(battle?.phase==='battle')battle.paused=pausedBefore;modalKind='';syncAudioPause()}$('closeModal').onclick=closeModal;
function help(){modal('help',`<div class="eyebrow">FIELD MANUAL</div><h2>자동 전선 작전</h2><ul><li><b>건물 건설</b>: 하단 버튼을 누르고 테크 조건에 맞는 건물을 선택한 뒤 아군 생산 구역에 배치합니다.</li><li><b>출격 현황</b>: 완성된 건물에 따라 다음 웨이브에 나갈 병력을 확인합니다. 건물은 고정 병력을 자동으로 보냅니다.</li><li><b>기술 연구</b>: 연구 가능한 건물을 선택하고 기술을 연구하세요. 유닛은 전투 중 기술을 자동으로 사용합니다.</li><li><b>전장 보기</b>: 넓은 중앙 언덕 입구를 지나 전초기지를 먼저 공격하고, 전초기지가 무너지면 상대 본진으로 진격합니다.</li><li><b>카메라</b>: 지도 스와이프로 이동하고 두 손가락으로 확대·축소합니다. 하단 버튼으로 본진과 전선을 빠르게 볼 수 있습니다.</li><li><b>자원</b>: 매 25초마다 미네랄 200을 받고, 완성된 가스 건물 하나마다 미네랄 100과 가스 50을 더 받습니다. 생산 공간 상단의 빈 슬롯에 가스 건물을 지으세요.</li></ul><p>전투와 출격은 자동으로 진행됩니다. 생산 공간에서 건물을 배치하고 테크를 올리세요. 앱을 백그라운드로 보내면 전투가 멈추며, 돌아와서 전장 재개를 눌러 이어갑니다.</p><button class="primary" id="helpDone">확인</button>`);$('helpDone').onclick=closeModal}$('help').onclick=help;
function settingsModal(){modal('settings',`<div class="eyebrow">COMMAND CENTER</div><h2>설정</h2>${[['배경음악','bgm'],['효과음','sfx'],['유닛 음성','voice']].map(([label,key])=>`<label>${label}<input id="vol-${key}" type="range" min="0" max="1" step=".01" value="${settings[key]}"></label>`).join('')}<label>렌더링<select id="quality"><option value="auto" ${settings.quality==='auto'?'selected':''}>자동 · 선명하게</option><option value="low" ${settings.quality==='low'?'selected':''}>절전 · 낮은 해상도</option></select></label><div class="row"><button id="pause">${pausedBefore?'전투 재개':'일시 정지 유지'}</button><button id="manual">조작 방법</button><button id="leave">작전 나가기</button></div><p>미니스타 ${VERSION} · 리마스터 ${data.sourceBuild}<br>설정과 전투 기록은 기기에 저장됩니다.</p>`);for(const key of ['bgm','sfx','voice'])$('vol-'+key).oninput=e=>{settings[key]=Number(e.target.value);save('settings',settings);setAudioVolume(key,settings[key])};$('quality').onchange=e=>{settings.quality=e.target.value;save('settings',settings);resize()};$('pause').onclick=()=>{pausedBefore=!pausedBefore;closeModal()};$('manual').onclick=()=>{const p=pausedBefore;help();pausedBefore=p};$('leave').onclick=()=>{modalKind='';$('modal').hidden=true;stopMusic();stopTransientSounds();audioContext?.suspend().catch(()=>{});newBattle()}}$('settings').onclick=settingsModal;
function resultModal(r){modal('result',`<div class="eyebrow">OPERATION COMPLETE</div><h2 style="font-size:32px;color:${r.win?'#e4d28b':'#de987f'}">${r.win?'승리':'패배'}</h2><p>${r.reason}</p><div class="stats">${[['전투 시간',Math.floor(r.time/60)+':'+String(Math.floor(r.time%60)).padStart(2,'0')],['생산한 병력',r.produced+'기'],['생존 병력',r.survivors+'기'],['적 처치',r.kills+'기'],['아군 손실',r.losses+'기'],['총 피해량',Math.round(r.damage).toLocaleString()]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><button id="retry" class="primary">다시 출전하기</button><button id="toTitle" class="secondary">종족 선택으로</button>`);$('retry').onclick=()=>{modalKind='';$('modal').hidden=true;newBattle();battle.begin()};$('toTitle').onclick=()=>{modalKind='';$('modal').hidden=true;newBattle()}}
$('records').onclick=()=>{const records=read('records',[]);modal('records',`<div class="eyebrow">BATTLE LOG</div><h2>전투 기록</h2>${records.length?records.slice(0,20).map(r=>`<div class="log"><span>${r.win?'승리':'패배'} · ${labels[r.race]}<br><small>${new Date(r.date).toLocaleDateString('ko-KR')} · ${Math.floor(r.time/60)}분 ${Math.floor(r.time%60)}초</small></span><b>${r.kills} 처치</b></div>`).join(''):'<p>첫 작전에 출전해 기록을 남겨보세요.</p>'}`)};
function raceUI(){for(const el of document.querySelectorAll('[data-race]')){el.classList.toggle('active',el.dataset.race===race);el.setAttribute('aria-pressed',el.dataset.race===race)}$('raceBriefing').textContent={terran:'테란 원정대의 지휘권이 이양되었습니다.',zerg:'군단이 당신의 명령을 기다립니다.',protoss:'기사단이 당신의 지휘를 기다립니다.'}[race];$('gasIcon').src=iconResource({terran:1,zerg:2,protoss:3}[race]);$('supplyIcon').src=iconResource({terran:4,zerg:5,protoss:6}[race])}const iconResource=n=>'assets/icons/resource_'+String(n).padStart(3,'0')+'.png';for(const el of document.querySelectorAll('[data-race]'))el.onclick=()=>{race=el.dataset.race;save('race',race);raceUI()};$('deploy').onclick=()=>{newBattle();battle.begin()};
addEventListener('keydown',e=>{if(!battle)return;if(e.key==='Escape'){e.preventDefault();if(battle.menuOpen)battle.closeMenu();else if(!$('modal').hidden)closeModal();return}if(!$('modal').hidden||['title','result'].includes(battle.phase))return;if(e.key===' '){e.preventDefault();battle.paused=!battle.paused;syncAudioPause();toast(battle.paused?'일시 정지':'전투 재개')}});
function pauseForBackground(){if(battle?.phase==='battle'){pausedBeforeBackground=battle.paused;backgroundPauseRequired=true;battle.paused=true;hudUI();$('backgroundPause').hidden=true}last=0;stopTransientSounds();audioContext?.suspend().catch(()=>{})}
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
async function boot(){try{if(!await retireOfflineStorage())return;enhanceSelects();data=await fetch('assets/data.json').then(r=>{if(!r.ok)throw Error('전투 데이터를 읽을 수 없습니다.');return r.json()});clearMediaSession();const extra=await fetch('rts-data.json?v=0.5.0').then(r=>{if(!r.ok)throw Error('생산 데이터를 읽을 수 없습니다.');return r.json()});Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);for(const [key,spec]of Object.entries(extra.research))Object.assign(RESEARCH[key],spec);terrain=await loadImage('assets/terrain.webp');if(!terrain)throw Error('지형 이미지를 읽을 수 없습니다.');newBattle();raceUI();$('boot').hidden=true;requestAnimationFrame(render)}catch(e){$('bootText').textContent=e.message+' · start.sh로 서버를 실행한 뒤 접속하세요.';console.error(e)}}boot();

