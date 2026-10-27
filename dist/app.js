import {constructionVisual,healthBarLayout,healthBarFillWidth,waveDescription,formatSupply,formatElapsedTime} from './presentation.js?v=0.16.25';
import {selectionPanelModel,inspectionEnergyMaximum,selectionStatItems} from './selection-panel.js?v=0.16.25';
import {enhanceSelects,closeDropdown} from './ui.js?v=0.16.25';
import {SPELLS,VERSION,dist,clamp} from './core.js?v=0.16.25';
import {Battle,BASE,WORKER,BUILDINGS,PRODUCTION,RESEARCH,PRODUCTION_OFFSET,PRODUCTION_HEIGHT,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT,PRODUCTION_GROUND_X,PRODUCTION_GROUND_Y} from './autobattle.js?v=0.16.25';
import {DESERT_STRIKE,GAS_BUILDING,INCOME_SECONDS,spawningPoolYield} from './lane-rules.js?v=0.16.25';
import {researchAt} from './tech.js?v=0.16.25';
import {pose,teamImage,trackFor,transitionSeconds,steadyStartSeconds} from './animation.js?v=0.16.25';
import {DEFAULT_FIELD_ZOOM,DEFAULT_FRONT_ZOOM,defaultProductionZoom} from './camera.js?v=0.16.25';
import {psiFieldTiles} from './build-placement.js?v=0.16.25';
import {resolveWeapon,attackHitCount} from './combat-rules.js?v=0.16.25';
import {createResourceStore,ResourceVersionError} from './resource-cache.js?v=0.16.25';
import {createResourcePlanner} from './resource-planner.js?v=0.16.25';
import {commandSlots,creepEdgeFrameIndex,minimapTransform,minimapWorldPoint} from './console-panel.js?v=0.16.25';
import {CREEP_EDGE_MAP,CREEP_EDGE_FRAMES,BUILD_COMMAND_LAYOUT,BUILD_COMMAND_ICONS} from './original-ui-data.js?v=0.16.25';
const $=id=>document.getElementById(id),canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false}),mini=$('minimap'),consoleMini=$('consoleMinimap');
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem('ministar.'+k))??f}catch{return f}},save=(k,v)=>{try{localStorage.setItem('ministar.'+k,JSON.stringify(v))}catch{}};
const labels={terran:'테란',zerg:'저그',protoss:'프로토스'},icon=n=>'assets/icons/'+String(n).padStart(3,'0')+'.png';
const productionTeam=0;
const DEFAULT_SETTINGS={bgm:.22,sfx:.55,voice:.7,panel:'normal',zoom:DEFAULT_FIELD_ZOOM,quality:'auto'};
let settings={...DEFAULT_SETTINGS,...read('settings',{})},race=read('race','terran'),data,spellVisualData,battle,terrain,W=innerWidth,H=innerHeight,DPR=1,last=0,hudTime=0,viewMode='field',productionSeat=0,desertField,desertProduction,ctrl=false,box=false,map=false,modalKind='',pausedBefore=false,toastTimer,camera={x:640,y:1700,zoom:DEFAULT_FIELD_ZOOM},pointers=new Map(),gesture=null,pinch=null,lastTap={time:0,type:null},lastGroup={time:0,id:null},cache=new Map(),pending=new Map(),failedImages=new Map(),audioContext=null,audioBuffers=new Map(),audioChannels=null,musicSource=null,musicGeneration=0,musicTrackIndex=0,musicTrackRace='',audioLifecycle=0,voiceSources=new Set(),transientSounds=new Set(),voiceGeneration=0,lastVoice=0,sfxActive=0,backgroundPauseRequired=false,pausedBeforeBackground=false;
let commandPage='basic',commandPanelSignature='',minimapClock=0,activeCommandTooltip=null,creepAtlasPending=false;
document.body.dataset.panel=settings.panel;
const STARTUP_MARK_PREFIX='ministar:';let firstSceneReady=false,uiEnhanced=false,bootInProgress=false;
const resourceStore=createResourceStore({baseURL:new URL('./',document.baseURI),appVersion:VERSION}),resourcePlanner=createResourcePlanner({store:resourceStore});
const decodedImageMeta=new WeakMap(),IMAGE_DECODED_BUDGET=64*1024*1024;let decodedImageBytes=0,imageUseSequence=0;
const audioBufferMeta=new Map(),AUDIO_DECODED_BUDGET=24*1024*1024;let decodedAudioBytes=0,audioUseSequence=0,musicTrackUrl=null;
function startupMark(name){try{performance.mark(STARTUP_MARK_PREFIX+name)}catch{}}
function startupMeasure(name,start,end){try{performance.measure(STARTUP_MARK_PREFIX+name,STARTUP_MARK_PREFIX+start,STARTUP_MARK_PREFIX+end);const entry=performance.getEntriesByName(STARTUP_MARK_PREFIX+name).at(-1);if(entry)console.info(`${name}: ${Math.round(entry.duration)} ms`)}catch{}}
function markFirstSceneReady(){if(firstSceneReady)return;firstSceneReady=true;startupMark('first-scene-ready');startupMeasure('boot-to-first-scene','boot-start','first-scene-ready');startupMeasure('title-to-first-scene','title-ready','first-scene-ready')}
startupMark('boot-start');
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
const IMAGE_LOAD_TIMEOUT=2800,IMAGE_RETRY_DELAY=180,IMAGE_FAILURE_COOLDOWN=30000;
function trimDecodedImages(keep){const now=performance.now();while(decodedImageBytes>IMAGE_DECODED_BUDGET){let oldest=null,oldestAt=Infinity;for(const [url,image]of cache){const meta=decodedImageMeta.get(image);if(image===keep||!meta||now-meta.lastUsed<2000||meta.lastUsed>=oldestAt)continue;oldest={url,image,meta};oldestAt=meta.lastUsed}if(!oldest)break;cache.delete(oldest.url);decodedImageBytes=Math.max(0,decodedImageBytes-oldest.meta.bytes);if(oldest.meta.objectURL)URL.revokeObjectURL(oldest.meta.objectURL)}}
function rememberDecodedImage(url,image,objectURL){const old=cache.get(url);if(old){const meta=decodedImageMeta.get(old);if(meta){decodedImageBytes=Math.max(0,decodedImageBytes-meta.bytes);if(meta.objectURL)URL.revokeObjectURL(meta.objectURL)}}const bytes=Math.max(0,image.naturalWidth*image.naturalHeight*4);cache.set(url,image);decodedImageMeta.set(image,{bytes,objectURL,lastUsed:performance.now(),sequence:++imageUseSequence});decodedImageBytes+=bytes;trimDecodedImages(image)}
function touchDecodedImage(image){const meta=decodedImageMeta.get(image);if(meta){meta.lastUsed=performance.now();meta.sequence=++imageUseSequence}}
function loadImage(url){if(cache.has(url)){const image=cache.get(url);touchDecodedImage(image);return Promise.resolve(image)}if(failedImages.get(url)?.retryAt>Date.now())return Promise.resolve(null);if(pending.has(url))return pending.get(url);const promise=(async()=>{for(let attempt=0;attempt<2;attempt++){let image=null,objectURL=null,cancelled=false;const controller=new AbortController();let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{cancelled=true;controller.abort();if(image)image.src='';reject(new Error('Image request timed out'))},IMAGE_LOAD_TIMEOUT)}),work=(async()=>{const response=await resourceStore.response(url,{signal:controller.signal});if(!response.ok)throw Error('Image request failed');const blob=await response.blob();if(cancelled)return null;objectURL=URL.createObjectURL(blob);image=new Image();image.__ministarSource=url;image.src=objectURL;if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Image decode failed'))});if(cancelled||!image.naturalWidth)throw Error('Image decode failed');return image})();try{const loaded=await Promise.race([work,timeout]);clearTimeout(timer);if(loaded){rememberDecodedImage(url,loaded,objectURL);failedImages.delete(url);return loaded}}catch{clearTimeout(timer);controller.abort();if(objectURL)URL.revokeObjectURL(objectURL);if(attempt===0){try{await resourceStore.invalidate(url)}catch{}await new Promise(resolve=>setTimeout(resolve,IMAGE_RETRY_DELAY))}}}failedImages.set(url,{attempts:2,retryAt:Date.now()+IMAGE_FAILURE_COOLDOWN});return null})().finally(()=>pending.delete(url));pending.set(url,promise);return promise}
function getImage(url){if(!url||failedImages.get(url)?.retryAt>Date.now())return null;if(cache.has(url)){const image=cache.get(url);touchDecodedImage(image);return image}void loadImage(url);return null}
async function warmImageUrls(urls,concurrency=6){const resources=[...new Set([...urls].filter(Boolean))];let next=0;await Promise.all(Array.from({length:Math.min(concurrency,resources.length)},async()=>{while(next<resources.length){const url=resources[next++];await loadImage(url)}}))}
function graphicUrls(graphic){if(!graphic)return[];return[...new Set([0,1].map(team=>teamImage(graphic,team)).filter(Boolean))]}
function criticalSceneImageUrls(){const urls=new Set();for(const id of new Set([...Object.values(BASE),156,160,173,174,344,347])){const unit=data.units[id],graphic=data.graphics[unit?.image];for(const url of graphicUrls(graphic))urls.add(url)}return urls}
function dependencyImageUrls(imageIds){const urls=new Set(),visited=new Set(),queue=[...imageIds].filter(Number.isInteger).map(id=>({id,depth:0}));while(queue.length&&visited.size<2048){const {id,depth}=queue.shift();if(depth>8||visited.has(id))continue;visited.add(id);const graphic=data.graphics[id];if(!graphic)continue;for(const url of graphicUrls(graphic))urls.add(url);for(const track of Object.values(graphic.tracks||{})){const events=track?.overlayEvents||(track?.overlays||[]).map(image=>({image}));for(const event of events)if(Number.isInteger(event?.image))queue.push({id:event.image,depth:depth+1})}for(const overlay of graphic.persistentOverlays||[])if(Number.isInteger(overlay?.image))queue.push({id:overlay.image,depth:depth+1});for(const shadow of graphic.shadowLayers||[])if(Number.isInteger(shadow.image))queue.push({id:shadow.image,depth:depth+1})}return urls}
function selectedRaceImageUrls(selectedRace,constructionGraphics,turretGraphics,destructionGraphics){const types=new Set(data.races[selectedRace]||[]),images=[...types].map(type=>data.units[type]?.image).filter(Number.isInteger),urls=dependencyImageUrls(images);for(const graphics of [constructionGraphics,turretGraphics,destructionGraphics])for(const [type,graphic]of Object.entries(graphics))if(types.has(Number(type)))for(const url of graphicUrls(graphic))urls.add(url);for(const id of Object.values(BASE))for(const url of graphicUrls(data.graphics[data.units[id]?.image]))urls.add(url);return urls}
function optionalImageUrls(constructionGraphics,turretGraphics,destructionGraphics){
 const optional=new Set(['ds-assets/production.webp?v=0.16.25']);for(const graphics of [constructionGraphics,turretGraphics,destructionGraphics])for(const graphic of Object.values(graphics))for(const url of graphicUrls(graphic))optional.add(url);
 for(const url of graphicUrls(data.graphics[215]))optional.add(url);
 for(const id of [210,211])for(const url of graphicUrls(data.graphics[id]))optional.add(url);
 const images=new Set([523,504,524,503,536,337,364,383,387,951,998]);for(const value of Object.values(spellVisualData?.images||{}))for(const id of Array.isArray(value)?value:[value])if(Number.isInteger(id))images.add(id);for(const weapon of Object.values(data.weapons||{}))if(weapon?.damage&&Number.isInteger(weapon.image))images.add(weapon.image);
 const visited=new Set(),queue=[...images].map(id=>({id,depth:0}));
 while(queue.length&&visited.size<2048){const {id,depth}=queue.shift();if(depth>8||visited.has(id))continue;visited.add(id);const graphic=data.graphics[id];if(!graphic)continue;
  for(const url of graphicUrls(graphic))optional.add(url);
  for(const track of Object.values(graphic.tracks||{})){const events=track?.overlayEvents||(track?.overlays||[]).map(image=>({image}));for(const event of events)if(Number.isInteger(event?.image))queue.push({id:event.image,depth:depth+1})}
  for(const overlay of graphic.persistentOverlays||[])if(Number.isInteger(overlay?.image))queue.push({id:overlay.image,depth:depth+1});
 }
 return optional;
}
let warmupGraphics=null;
function scheduleOptionalWarmup(){if(!data||!warmupGraphics||battle?.phase!=='title')return;const [constructionGraphics,turretGraphics,destructionGraphics]=warmupGraphics,priority=[...selectedRaceImageUrls(race,constructionGraphics,turretGraphics,destructionGraphics)],optional=[...optionalImageUrls(constructionGraphics,turretGraphics,destructionGraphics)];startupMark('optional-assets-start');void resourcePlanner.schedule([...priority,...optional],{budgetBytes:8*1024*1024}).then(result=>{if(!result.stale)startupMark('optional-assets-ready')}).catch(error=>console.warn('Optional resource warmup:',error))}
const audioPaused=()=>document.hidden||backgroundPauseRequired||!battle||battle.phase!=='battle'||battle.paused;
function clearMediaSession(){try{const media=navigator.mediaSession;if(media){media.metadata=null;media.playbackState='none';for(const action of ['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack'])media.setActionHandler(action,null)}}catch{}}
function getAudioContext(){if(audioContext)return audioContext;const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return null;audioContext=new Context();audioChannels={};for(const [name,key]of Object.entries({music:'bgm',effects:'sfx',voice:'voice'})){const gain=audioContext.createGain();gain.gain.value=settings[key]*(name==='effects'?.4:1);gain.connect(audioContext.destination);audioChannels[name]=gain}clearMediaSession();return audioContext}
function setAudioVolume(key,value){settings[key]=value;save('settings',settings);if(audioChannels){const name={bgm:'music',sfx:'effects',voice:'voice'}[key];if(name)audioChannels[name].gain.value=value*(key==='sfx'?.4:1)}if(key==='bgm'){if(value<=0)stopMusic();else syncAudioPause()}}
function trimDecodedAudio(keep=null){while(decodedAudioBytes>AUDIO_DECODED_BUDGET){let oldest=null;for(const [url,meta]of audioBufferMeta)if(url!==keep&&!meta.pins&&(!oldest||meta.lastUsed<oldest[1].lastUsed))oldest=[url,meta];if(!oldest)break;audioBuffers.delete(oldest[0]);audioBufferMeta.delete(oldest[0]);decodedAudioBytes=Math.max(0,decodedAudioBytes-oldest[1].bytes)}}
function pinAudio(url){const meta=audioBufferMeta.get(url);if(meta){meta.pins++;meta.lastUsed=++audioUseSequence}}
function unpinAudio(url){if(!url)return;const meta=audioBufferMeta.get(url);if(meta){meta.pins=Math.max(0,meta.pins-1);meta.lastUsed=++audioUseSequence;trimDecodedAudio()}}
function decodeAudio(url){if(audioBuffers.has(url)){const meta=audioBufferMeta.get(url);if(meta)meta.lastUsed=++audioUseSequence;return audioBuffers.get(url)}const promise=(async()=>{const context=getAudioContext();if(!context)throw Error('Web Audio is unavailable');for(let attempt=0;attempt<2;attempt++){try{const response=await resourceStore.response(url);if(!response.ok)throw Error('Audio request failed');const buffer=await context.decodeAudioData(await response.arrayBuffer()),bytes=buffer.length*buffer.numberOfChannels*4;audioBufferMeta.set(url,{bytes,lastUsed:++audioUseSequence,pins:0});decodedAudioBytes+=bytes;trimDecodedAudio(url);return buffer}catch(error){if(attempt===0){try{await resourceStore.invalidate(url)}catch{}continue}throw error}}})().catch(error=>{audioBuffers.delete(url);throw error});audioBuffers.set(url,promise);return promise}
function forgetSound(record){if(!record||record.ended)return;record.ended=true;transientSounds.delete(record);voiceSources.delete(record);record.gain.disconnect();record.source.disconnect();unpinAudio(record.audioUrl);record.onFinish?.()}
function playSample(url,channel,trim=1,token=null,onFinish=null){if(audioPaused())return Promise.resolve(null);const context=getAudioContext(),lifecycle=audioLifecycle;if(!context)return Promise.resolve(null);return decodeAudio(url).then(buffer=>{if(audioPaused()||lifecycle!==audioLifecycle||context.state!=='running'||token&&token.value!==voiceGeneration)return null;const source=context.createBufferSource(),gain=context.createGain(),record={source,gain,onFinish,ended:false,audioUrl:url};source.buffer=buffer;gain.gain.value=trim;source.connect(gain);gain.connect(audioChannels[channel]);source.onended=()=>forgetSound(record);if(channel==='voice')voiceSources.add(record);if(channel==='effects')transientSounds.add(record);source.start();pinAudio(url);return record}).catch(()=>null)}
function music(){if(settings.bgm<=0||audioPaused()||musicSource)return;const context=getAudioContext();if(!context||context.state!=='running')return;if(musicTrackRace!==race){musicTrackRace=race;musicTrackIndex=0}const trackIndex=musicTrackIndex,generation=++musicGeneration,url=`assets/audio/${race}-${trackIndex+1}.ogg`;decodeAudio(url).then(buffer=>{if(generation!==musicGeneration||audioPaused()||context.state!=='running'||musicSource)return;const source=context.createBufferSource(),gain=context.createGain(),now=context.currentTime,duration=buffer.duration,fade=Math.min(2,duration/8);source.buffer=buffer;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+fade);gain.gain.setValueAtTime(1,now+Math.max(fade,duration-fade));gain.gain.linearRampToValueAtTime(0,now+duration);source.connect(gain);gain.connect(audioChannels.music);source.onended=()=>{source.disconnect();gain.disconnect();if(musicSource===source){musicSource=null;unpinAudio(musicTrackUrl);musicTrackUrl=null}if(generation===musicGeneration&&!audioPaused()){musicTrackIndex=(trackIndex+1)%2;music()}};musicSource=source;musicTrackUrl=url;pinAudio(url);source.start()}).catch(()=>{})}
function stopMusic(reset=false){musicGeneration++;if(musicSource){const source=musicSource;musicSource=null;source.onended=null;try{source.stop()}catch{}source.disconnect();unpinAudio(musicTrackUrl);musicTrackUrl=null}if(reset){musicTrackIndex=0;musicTrackRace=''}}
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
function zoom(z,x=W/2,y=cy()){const p=toWorld(x,y);camera.zoom=clamp(z,.25,2.8);const q=toWorld(x,y);camera.x+=p.x-q.x;camera.y+=p.y-q.y;limitCamera();settings.zoom=camera.zoom;save('settings',settings);drawMinimaps()}
function setViewMode(mode){if(!battle||battle.phase!=='battle')return;closeStatTooltip();closeCommandTooltip();if(battle.menuOpen||battle.targeting)battle.closeMenu();placementPoint=null;commandPage='basic';commandPanelSignature='';viewMode=mode;$('productionSeat').hidden=mode!=='production'||battle.teamSize===1;refreshProductionSeat();document.body.dataset.space=mode;const button=$('spaceToggle');button.textContent=mode==='production'?'전장':'생산';button.setAttribute('aria-label',mode==='production'?'전장으로 돌아가기':'생산 공간으로 이동');map=false;$('mapWrap').hidden=true;$('map').setAttribute('aria-pressed','false');$('map').disabled=mode!=='field';battle.select([],false);camera={x:640,y:(mode==='production'?PRODUCTION_OFFSET:0)+(mode==='production'?PRODUCTION_GROUND_Y+PRODUCTION_GROUND_HEIGHT/2:1700),zoom:mode==='production'?defaultProductionZoom(W):DEFAULT_FIELD_ZOOM};limitCamera();selectionUI();drawMinimaps()}
function newBattle(){resourcePlanner.cancel();stopMusic(true);stopTransientSounds();closeCommandTooltip();if(battle?.menuOpen||battle?.targeting)battle.closeMenu();placementPoint=null;commandPage='basic';commandPanelSignature='';battle=new Battle(data,{race,difficulty:$('difficulty').value,teamSize:Number($('teamSize').value)});battle.on(event);viewMode='field';productionSeat=0;document.body.dataset.space='field';backgroundPauseRequired=false;pausedBeforeBackground=false;$('backgroundPause').hidden=true;ctrl=box=map=false;camera={x:640,y:1700,zoom:DEFAULT_FIELD_ZOOM};phaseUI();selectionUI();groupsUI();queueMicrotask(scheduleOptionalWarmup)}
// Coalesce simulation notifications before touching the DOM. A large volley
// can kill dozens of units in one frame; refresh the selection panel once.
let uiPending=false,uiSelection=false,uiGroups=false,uiProduction=false,uiMenu=false;
function flushUI(){
 uiPending=false;const selection=uiSelection,groups=uiGroups,production=uiProduction,menu=uiMenu;
 uiSelection=uiGroups=uiProduction=uiMenu=false;
 if(selection)selectionUI();else if(production)productionUI();
 if(groups)groupsUI();if(menu)menuUI();
}
function event(e){
 if(['change','selection','groups','production'].includes(e.type)){
  uiSelection||=e.type==='change'||e.type==='selection';uiGroups||=e.type==='groups';uiProduction||=e.type==='production';uiMenu||=e.type==='change';
  if(!uiPending){uiPending=true;queueMicrotask(flushUI)}return;
 }
 if(e.type==='phase')phaseUI();if(e.type==='menu')menuUI();if(e.type==='notice')toast(e.text);if(e.type==='voice')unitVoice(e.unit,e.kind);if(e.type==='sfx')effectSound(e.id);if(e.type==='result'){const records=read('records',[]);records.unshift({...e.result,race,date:new Date().toISOString()});save('records',records.slice(0,40));resultModal(e.result)}
}
function phaseUI(){
 closeDropdown();closeStatTooltip();closeCommandTooltip();const title=battle.phase==='title';$('title').hidden=!title;
 for(const id of ['hud','mission','panel','camera'])$(id).hidden=title;$('spaceToggle').hidden=battle.phase!=='battle';$('productionSeat').hidden=battle.phase!=='battle'||viewMode!=='production'||battle.teamSize===1;
 $('objective').textContent='적 메인 기지를 먼저 함락하십시오';
 if(battle.phase==='battle'){viewMode='field';commandPage='basic';commandPanelSignature='';placementPoint=null;document.body.dataset.space='field';camera.x=640;camera.y=1700;camera.zoom=DEFAULT_FIELD_ZOOM;$('backgroundPause').hidden=!backgroundPauseRequired;syncAudioPause();toast('상대: '+({terran:'테란',zerg:'저그',protoss:'프로토스'}[battle.enemyRace]))}
 if(title){map=false;commandPage='basic';commandPanelSignature='';$('mapWrap').hidden=true}if(battle.phase==='result'){stopMusic();stopTransientSounds();audioContext?.suspend().catch(()=>{})}
 selectionUI();menuUI();hudUI();resize()
}
function hudUI(){
 if(!battle)return;
 const elapsedClock=$('elapsedClock'),elapsedText=formatElapsedTime(battle.time);if(elapsedClock.textContent!==elapsedText)elapsedClock.textContent=elapsedText;
 const units=battle.selected;
 if(battle.laneMode){
  const count=Math.ceil(battle.nextWave),seconds=Math.max(0,count);
  $('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  $('phase').textContent=battle.paused?'PAUSED':'NEXT WAVE';
  $('objective').textContent=`적 메인 ${Math.max(0,Math.ceil(battle.core?.hp||0)).toLocaleString()} HP · 아군 메인 ${Math.max(0,Math.ceil(battle.main?.hp||0)).toLocaleString()} HP`;
  $('money').textContent=Math.floor(battle.money).toLocaleString();$('gas').textContent=Math.floor(battle.gas).toLocaleString();$('gas').parentElement.hidden=!!battle.laneMode;if(battle.laneMode)$('incomeStatus').textContent=battle.incomePauseLeft>0?`수입 중단 ${Math.ceil(battle.incomePauseLeft)}초`:`시설 ${battle.completedGasCount(0)}/5 · +${battle.incomeAmount()} / ${INCOME_SECONDS.toFixed(2)}초`;
  $('supply').textContent=formatSupply(battle.supply,battle.maxSupply);$('slow').hidden=true;
  return;
 }
 const seconds=Math.floor(battle.time);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('phase').textContent=battle.paused?'PAUSED':'BATTLE';
 $('money').textContent=Math.floor(battle.money).toLocaleString();$('gas').textContent=Math.floor(battle.gas).toLocaleString();$('gas').parentElement.hidden=!!battle.laneMode;if(battle.laneMode)$('incomeStatus').textContent=battle.incomePauseLeft>0?`수입 중단 ${Math.ceil(battle.incomePauseLeft)}초`:`시설 ${battle.completedGasCount(0)}/5 · +${battle.incomeAmount()} / ${INCOME_SECONDS.toFixed(2)}초`;$('supply').textContent=formatSupply(battle.supply,battle.maxSupply);$('slow').hidden=true;
}
const wireframeLayers=[0,1,2,3].map(layer=>`assets/selection-ui/wirefram-layer-${layer}.webp`),wireframeCache=new Map(),pendingWireframes=new Set();
function paintWireframe(unit,model){
 const canvas=$('wireframe'),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);if(!unit||!model)return;const fallback=getImage(icon(unit.type));if(fallback)context.drawImage(fallback,16,16,96,96);
 const ratio=unit.hp/Math.max(1,unit.maxHp||unit.def.hp),band=ratio>2/3?'green':ratio>1/3?'yellow':'red',key=`${unit.type}:${band}`,cached=wireframeCache.get(key);
 if(cached){context.drawImage(cached,0,0);wireframeCache.delete(key);wireframeCache.set(key,cached);return}
 if(pendingWireframes.has(key))return;pendingWireframes.add(key);
 Promise.all(wireframeLayers.map(loadImage)).then(images=>{
  if(images.some(image=>!image)||lastInspection?.id!==unit.id)return;
  const tint=band==='green'?[77,245,88]:band==='yellow'?[255,213,81]:[240,82,73],result=document.createElement('canvas');result.width=result.height=128;const output=result.getContext('2d');
  for(const [layer,image]of images.entries()){
   const part=document.createElement('canvas');part.width=part.height=128;const px=part.getContext('2d'),sx=(unit.type%16)*128,sy=Math.floor(unit.type/16)*128;
   px.drawImage(image,sx,sy,128,128,0,0,128,128);const pixels=px.getImageData(0,0,128,128),values=pixels.data;
   for(let i=0;i<values.length;i+=4){values[i]=Math.round(values[i]*tint[0]/255);values[i+1]=Math.round(values[i+1]*tint[1]/255);values[i+2]=Math.round(values[i+2]*tint[2]/255)}
   px.putImageData(pixels,0,0);output.drawImage(part,0,0);void layer;
  }
  wireframeCache.set(key,result);while(wireframeCache.size>32)wireframeCache.delete(wireframeCache.keys().next().value);
  if(lastInspection?.id===unit.id&&Math.floor((unit.hp/Math.max(1,unit.maxHp||unit.def.hp))*3)===Math.floor((ratio)*3))context.drawImage(result,0,0);
 }).catch(()=>{}).finally(()=>pendingWireframes.delete(key));
}
function updatePortrait(unit){
 const portrait=$('portrait'),url=unit?.def?.portrait;
 portrait.hidden=!url;if(url){portrait.muted=true;portrait.loop=true;portrait.playsInline=true;const changed=portrait.getAttribute('src')!==url;if(changed){portrait.pause();portrait.src=url}if(changed||portrait.paused)portrait.play().catch(()=>{})}
 else{portrait.pause();portrait.removeAttribute('src');portrait.load()}
}
let lastInspection=null,activeStatTooltip=null;
function positionStatTooltip(button){
 const tooltip=$('statTooltip');if(!button||tooltip.hidden)return;
 const bounds=button.getBoundingClientRect(),viewport=window.visualViewport,margin=6,leftEdge=viewport?.offsetLeft||0,topEdge=viewport?.offsetTop||0,rightEdge=leftEdge+(viewport?.width||innerWidth),bottomEdge=topEdge+(viewport?.height||innerHeight);
 tooltip.style.left=Math.max(leftEdge+margin,Math.min(bounds.left+(bounds.width-tooltip.offsetWidth)/2,rightEdge-tooltip.offsetWidth-margin))+'px';
 tooltip.style.top=Math.max(topEdge+margin,Math.min(bounds.top-tooltip.offsetHeight-5,bottomEdge-tooltip.offsetHeight-margin))+'px';
}
function closeStatTooltip(){
 if(!activeStatTooltip)return;
 for(const button of $('statIcons').querySelectorAll('button.stat-icon'))if(button.dataset.statKey===activeStatTooltip.key)button.removeAttribute('aria-describedby');
 activeStatTooltip=null;$('statTooltip').hidden=true;$('statTooltip').replaceChildren();
}
function renderStatTooltip(item){const tooltip=$('statTooltip'),title=document.createElement('span'),value=document.createElement('span');title.className='stat-tooltip-title';value.className='stat-tooltip-value';title.textContent=item.title||item.kind;value.textContent=item.valueText;tooltip.replaceChildren(title,value);tooltip.setAttribute('aria-label',`${title.textContent} ${value.textContent}`)}
function toggleStatTooltip(button,item){
 if(activeStatTooltip?.unitId===lastInspection?.id&&activeStatTooltip.key===item.key){closeStatTooltip();return}
 closeStatTooltip();const tooltip=$('statTooltip');activeStatTooltip={unitId:lastInspection.id,key:item.key,title:item.title,valueText:item.valueText};renderStatTooltip(item);tooltip.hidden=false;button.setAttribute('aria-describedby','statTooltip');positionStatTooltip(button);
}
function renderStatIcons(items,unitId){
 const icons=$('statIcons'),signature=unitId===null?'':unitId+':'+items.map(item=>item.key+':'+item.icon).join('|');
 if(icons.dataset.signature!==signature){
  if(activeStatTooltip)closeStatTooltip();icons.replaceChildren();icons.dataset.signature=signature;
  for(const item of items){const button=document.createElement('button');button.type='button';button.className='stat-icon';button.dataset.statKey=item.key;button.setAttribute('aria-label',item.accessibleLabel);const image=document.createElement('img');image.src=icon(item.icon);image.alt='';button.append(image);if(item.level){const level=document.createElement('b');level.textContent=item.level;level.setAttribute('aria-hidden','true');button.append(level)}icons.append(button)}
 }
 for(const item of items){const button=[...icons.children].find(node=>node.dataset.statKey===item.key);if(!button)continue;button.setAttribute('aria-label',item.accessibleLabel);const badge=button.querySelector('b');if(item.level){if(badge)badge.textContent=item.level;else{const level=document.createElement('b');level.textContent=item.level;level.setAttribute('aria-hidden','true');button.append(level)}}else badge?.remove();if(activeStatTooltip?.key===item.key&&activeStatTooltip.unitId===unitId){if(activeStatTooltip.valueText!==item.valueText||activeStatTooltip.title!==item.title){activeStatTooltip.title=item.title;activeStatTooltip.valueText=item.valueText;renderStatTooltip(item);positionStatTooltip(button)}button.setAttribute('aria-describedby','statTooltip')}}
}
const statIcons=$('statIcons');
statIcons.addEventListener('click',event=>{const button=event.target.closest('button.stat-icon');if(!button||!lastInspection)return;const item=selectionStatItems(lastInspection).find(value=>value.key===button.dataset.statKey);if(item)toggleStatTooltip(button,item)});
document.addEventListener('pointerdown',event=>{if(activeCommandTooltip){if(event.target.closest?.('#commandGrid .command-slot'))return;closeCommandTooltip()}if(!activeStatTooltip)return;if(event.target.closest?.('#statIcons .stat-icon'))return;closeStatTooltip()},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(activeStatTooltip||activeCommandTooltip)){event.preventDefault();closeStatTooltip();closeCommandTooltip()}},true);
const repositionStatTooltip=()=>{if(activeCommandTooltip){if(activeCommandTooltip.isConnected)positionStatTooltip(activeCommandTooltip);else closeCommandTooltip()}if(!activeStatTooltip)return;const button=[...$('statIcons').children].find(node=>node.dataset.statKey===activeStatTooltip.key);positionStatTooltip(button)};
addEventListener('resize',repositionStatTooltip);window.visualViewport?.addEventListener('resize',repositionStatTooltip);
function showVitals(units){
 const unit=units.length===1?units[0]:null,model=selectionPanelModel(battle,unit,data);lastInspection=model;document.body.dataset.inspect=units.length?'yes':'no';
 if(activeStatTooltip&&(!model||activeStatTooltip.unitId!==model.id))closeStatTooltip();
 renderStatIcons(selectionStatItems(model),model?.id??null);
 $('shields').textContent=model?.shield?`실드 ${model.shield.current}/${model.shield.max}`:'';
 $('hp').textContent=model?`HP ${model.hp.current}/${model.hp.max}`:'';
 $('energy').textContent=model?.energy?`마나 ${model.energy.current}/${model.energy.max}`:'';
 $('killCount').textContent=model?.killCount!==null&&model?.killCount!==undefined?`처치 ${model.killCount}`:'';$('killCount').hidden=model?.killCount===null||model?.killCount===undefined;
 $('unitStatus').textContent=[...(model?.status||[]),model?.lifespan!==null&&model?.lifespan!==undefined?`수명 ${model.lifespan}초`:'' ].filter(Boolean).join(' · ');
 paintWireframe(unit,model);updatePortrait(unit);
}
function updateLaneHangarStatus(unit){
 const el=$('order'),acid=unit?.acidSporeTimers?.length?`애시드 스포어 ${unit.acidSporeTimers.length}`:'',snapshot=unit?.type===72||unit?.type===83?battle.hangarSnapshot(unit):null;
 const status=snapshot?.kind==='carrier'?`인터셉터 ${snapshot.total}/${snapshot.capacity} · 비행 ${snapshot.active}`:snapshot?.kind==='reaver'?`스캐럽 ${snapshot.inside}/${snapshot.capacity} · 비행 ${snapshot.active}/1`:'';
 el.textContent=[el.dataset.baseOrder||'',status,acid].filter(Boolean).join(' · ');
}
function refreshVitals(){if(!battle)return;const selected=battle.selected,unit=battle.laneMode?(selected[0]||battle.inspectedUnit):null;showVitals(battle.laneMode?(unit?[unit]:[]):selected);if(battle.laneMode)updateLaneHangarStatus(unit)}
function selectionUI(){
 if(!battle)return;const units=battle.selected;
 if(battle.laneMode){
  const unit=units[0]||battle.inspectedUnit,entries=unit?.productionOnly?battle.commanderWave(unit.commanderId,unit.id):new Map(),lineup=[...entries].map(([type,count])=>`${data.units[type].name} ${count}기`).join(' · ');$('unitName').textContent=unit?unit.def.name:'';document.querySelector('.unit-info').style.setProperty('--unit-icon',`url("${icon(unit?.type??BASE[race])}")`);
  showVitals(unit?[unit]:[]);
  const role=unit?.def.building?waveDescription(unit.type,battle.waveUnitsForBuilding(unit.type),data):'';
  $('order').dataset.baseOrder=unit?.garrison?.length?'수비 병력':unit?.construction?`건설 중 · ${role}`:unit?.productionOnly&&lineup?lineup:unit?.productionOnly&&unit?.def.building?role:unit?.def.building?'전장 방어 시설':'';updateLaneHangarStatus(unit);
  $('chips').replaceChildren();hudUI();productionUI();return;
 }
 $('unitName').textContent=units.length===1?units[0].def.name:units.length?units.length+'기 선택됨' :'';showVitals(units);
 if(!units.length){$('order').textContent=box?'범위 선택 모드 활성화':''}
 const types=new Map();for(const u of units)types.set(u.type,(types.get(u.type)||0)+1);$('chips').replaceChildren();for(const [type,n] of types){const b=document.createElement('button');b.innerHTML=`<img src="${icon(type)}" alt="">${n}`;b.title=data.units[type].name;b.onclick=()=>battle.select(units.filter(u=>u.type===type).map(u=>u.id));$('chips').append(b)}hudUI();productionUI()
}
function groupsUI(){if(!battle||battle.laneMode)return;$('ctrl').setAttribute('aria-pressed',ctrl);for(let i=0;i<10;i++){const b=$('group'+i),g=battle.groups[i];b.classList.toggle('occupied',!!g.length);b.classList.toggle('selected',!!g.length&&g.length===battle.selection.length&&g.every(id=>battle.selection.includes(id)));b.setAttribute('aria-label',(i===9?0:i+1)+'번 부대 '+g.length+'기')}}
$('ctrl').onclick=()=>{ctrl=!ctrl;groupsUI()};
function closeCommandTooltip(){
 if(!activeCommandTooltip)return;
 activeCommandTooltip.removeAttribute('aria-describedby');activeCommandTooltip=null;
 if(!activeStatTooltip){$('statTooltip').hidden=true;$('statTooltip').textContent=''}
}
function showCommandTooltip(button,message){
 closeStatTooltip();closeCommandTooltip();const tooltip=$('statTooltip');activeCommandTooltip=button;
 tooltip.textContent=message;tooltip.hidden=false;button.setAttribute('aria-describedby','statTooltip');
 positionStatTooltip(button);
}
function gasInvestmentDetail(){
 const step=Math.min(5,battle.units.filter(x=>x.alive&&x.team===0&&x.gasNode).length+1),rates=DESERT_STRIKE.income,delay=!battle.gasDelayApplied[0].has(step)?Math.round(DESERT_STRIKE.gasPenaltyCycles[step]*DESERT_STRIKE.hyperCycleSeconds):0;
 return '수입 +'+rates[step]+(delay?' · 중단 '+delay+'초':'');
}
function openCommandPage(page){if(commandPage===page)return;closeCommandTooltip();commandPage=page;commandPanelSignature='';renderCommandPanel(true)}
function emptyCommandSlot(){
 const button=document.createElement('button');button.type='button';button.className='command-slot command-slot-empty';button.disabled=true;button.tabIndex=-1;button.setAttribute('aria-hidden','true');$('commandGrid').append(button);
}
function actionCommandSlot({name,id,cost=null,reason='',detail='',click=null,kind='action'}){
 const button=document.createElement('button');button.type='button';button.className='command-slot'+(kind==='building'?' building-card':'')+(reason?' unavailable':'');
 const label=document.createElement('span');label.className='command-name';label.textContent=name;
 if(cost){const price=document.createElement('span');price.className='command-cost';const resource=document.createElement('img');resource.src=iconResource(0);resource.alt='';const amount=document.createElement('span');amount.textContent=String(cost[0]);price.append(resource,amount);button.append(price)}
 const coords=BUILD_COMMAND_ICONS.buildings[id]||(id==='cancel'?BUILD_COMMAND_ICONS.menu.cancel:BUILD_COMMAND_ICONS.menu[race]?.[id]);
 if(coords){const art=document.createElement('span');art.className='command-art';art.setAttribute('aria-hidden','true');art.style.backgroundPosition=`-${coords[0]}px -${coords[1]}px`;button.append(art)}
 else{const image=document.createElement('img');image.className='command-building-icon';image.src=icon(id);image.alt='';button.append(image)}
 button.append(label);
 const costText=cost?'미네랄 '+cost[0]+' · ':'',aria=name+(cost?', 미네랄 '+cost[0]:'')+(reason?', '+reason:'');
 button.title=(detail?detail+' · ':'')+costText+name+(reason?' · '+reason:'');button.setAttribute('aria-label',aria);button.setAttribute('aria-disabled',String(!!reason));
 if(reason)button.onclick=()=>showCommandTooltip(button,costText+name+' · '+reason);else button.onclick=click||(()=>{});
 $('commandGrid').append(button);return button;
}
function addBuildingCommand(type){
 const def=data.units[type],cost=battle.buildingCost(type),reason=battle.buildReason(battle.builder,type),team=productionTeam;
 const completed=battle.waveProducers(team).filter(unit=>unit.type===142).length;
 const detail=type===142?'저글링 '+spawningPoolYield(completed,team)+'기':(type===GAS_BUILDING[race]?gasInvestmentDetail():waveDescription(type,battle.waveUnitsForBuilding(type),data));
 actionCommandSlot({name:def.name,id:type,cost,reason,detail,kind:'building',click:()=>startBuildTarget(type)});
}
function selectedBuildingCommands(unit){
 const actions=[];
 for(const type of battle.morphOptions(unit)){const def=data.units[type];actions.push({name:def.name,id:type,cost:battle.buildingCost(type),reason:battle.morphReason(unit,type),detail:waveDescription(type,battle.waveUnitsForBuilding(type),data),click:()=>battle.morph(unit,type),kind:'building'})}
 for(const type of battle.addonOptions(unit)){const def=data.units[type];actions.push({name:def.name,id:type,cost:battle.buildingCost(type),reason:battle.addonReason(unit,type),detail:waveDescription(type,battle.waveUnitsForBuilding(type),data),click:()=>battle.addon(unit,type),kind:'building'})}
 for(const key of battle.researchOptions(unit)){const spec=RESEARCH[key];actions.push({name:spec.name,id:spec.icon,cost:spec.cost,reason:battle.researchReason(unit,key),detail:Math.ceil(spec.time)+'초',click:()=>battle.research(unit,key)})}
 if(unit.construction||unit.egg)actions.push({name:unit.egg?'변태 취소':'건설 취소',id:unit.type,detail:'현재 작업 취소',click:()=>battle.cancel(unit)});
 for(const [index,task]of (unit.queue||[]).entries())actions.push({name:(index+1)+'번 취소',id:task.type||unit.type,detail:task.kind==='research'?RESEARCH[task.key]?.name||'연구':'대기열 취소',click:()=>battle.cancel(unit,index)});
 return actions;
}
function renderCommandPanel(force=false){
 if(!battle||!data)return;
 const grid=$('commandGrid'),unit=battle.selected[0]||battle.inspectedUnit;
 const ownProduction=battle.phase==='battle'&&viewMode==='production'&&productionSeat===0;
 const ownBuilding=ownProduction&&unit?.alive&&unit.productionOnly&&unit.team===0&&unit.commanderId===viewCommanderId()&&unit.def.building;
 const selectedActions=ownBuilding?selectedBuildingCommands(unit):[];
 const hasSelectedTab=!!ownBuilding&&(selectedActions.length>0);
 if(commandPage.startsWith('selected')&&!hasSelectedTab)commandPage='basic';
 else if(commandPage.startsWith('selected:')&&Number(commandPage.split(':')[1])*7>=selectedActions.length)commandPage='selected';
 const productionState=battle.units.filter(item=>item.alive&&item.productionOnly&&item.commanderId===0&&item.def.building).map(item=>item.id+','+item.type+','+Number(item.completed)+','+(item.construction?.nextType||'')).sort().join(';');
 const unitState=unit?[unit.id,unit.type,Number(unit.alive),Number(unit.completed),unit.construction?.nextType||'',unit.egg?.type||'',(unit.queue||[]).length].join(','):'';
 const signature=[battle.phase,viewMode,productionSeat,race,commandPage,battle.targeting||'',Math.floor(battle.money),Math.floor(battle.gas),productionState,unitState].join('|');
 if(!force&&signature===commandPanelSignature)return;
 commandPanelSignature=signature;closeCommandTooltip();grid.replaceChildren();
 if(ownProduction){
  if(commandPage==='worker'){
   for(let i=0;i<5;i++)emptyCommandSlot();
   if(hasSelectedTab)actionCommandSlot({name:'선택 건물 명령',id:unit.type,click:()=>openCommandPage('selected')});else emptyCommandSlot();
   actionCommandSlot({name:'기본 건설 명령',id:'basic',click:()=>openCommandPage('basic')});
   actionCommandSlot({name:'고급 건설 명령',id:'advanced',click:()=>openCommandPage('advanced')});
   emptyCommandSlot();
  }else if(commandPage.startsWith('selected')){
   const page=Number(commandPage.split(':')[1]||0),remaining=selectedActions.slice(page*7),hasMore=remaining.length>8;
   for(const action of remaining.slice(0,hasMore?7:8))actionCommandSlot(action);
   if(hasMore){while(grid.children.length<7)emptyCommandSlot();actionCommandSlot({name:'다음 명령',id:'advanced',click:()=>openCommandPage('selected:'+(page+1))})}
   while(grid.children.length<8)emptyCommandSlot();
   actionCommandSlot({name:'건설 메뉴로 돌아가기',id:'cancel',click:()=>openCommandPage('worker')});
  }else{
   const available=battle.buildingOptions(battle.builder),slots=commandSlots(BUILD_COMMAND_LAYOUT,race,commandPage,available);
   for(const type of slots){
    if(type===null)emptyCommandSlot();
    else if(type==='cancel')actionCommandSlot({name:'건설 명령 취소',id:'cancel',click:()=>{commandPage='worker';commandPanelSignature='';if(battle.targeting)battle.closeMenu();else renderCommandPanel(true)}});
    else addBuildingCommand(type);
   }
  }
 }else{
  for(let i=0;i<9;i++)emptyCommandSlot();
 }
}
function startBuildTarget(type){
 if(!battle||viewMode!=='production'||productionSeat!==0)return false;
 const reason=battle.buildReason(battle.builder,type);if(reason){toast(reason);return false}
 closeStatTooltip();closeCommandTooltip();placementPoint=null;battle.menuOpen=false;battle.targeting='build:'+type;battle.emit('menu');return true;
}
function menuUI(){
 if(!battle)return;const key=battle.targeting,type=key?.startsWith('build:')?Number(key.split(':')[1]):null;
 $('target').hidden=!key;$('slow').hidden=true;
 $('targetCost').hidden=!type;
 if(type)$('targetCostAmount').textContent=battle.buildingCost(type)[0].toLocaleString();
 if(key){$('targetText').textContent=type?data.units[type].name+' · 지도에서 위치를 선택하세요':key==='irradiate'?'이레디에이트 대상을 선택하세요':'';$('confirmBuild').hidden=!type;$('confirmBuild').disabled=!type||!placementPoint}
 else placementPoint=null;
 commandPanelSignature='';renderCommandPanel(true);
}
function productionUI(){
 if(!battle)return;const unit=battle.selected.length===1?battle.selected[0]:battle.inspectedUnit,box=$('productionQueue');box.replaceChildren();
 if(battle.laneMode){
  if(unit?.construction){const task=unit.construction,progress=Math.min(100,Math.floor(task.time/task.total*100)),bar=document.createElement('div');bar.className='production-progress';bar.innerHTML=`<span>건설 ${progress}% · ${Math.max(0,Math.ceil(task.total-task.time))}초</span><i style="width:${progress}%"></i>`;box.append(bar)}
  renderCommandPanel();
  return;
 }
 if(!unit){renderCommandPanel();return}const acid=unit.acidSporeTimers?.length?` · 애시드 스포어 ${unit.acidSporeTimers.length}중첩`:'';const task=unit.construction||unit.egg||unit.queue[0];if(task){const progress=Math.min(100,Math.floor(task.time/task.total*100)),label=unit.construction?(task.started?'건설 / 변태':'일꾼 이동 중'):task.kind==='research'?RESEARCH[task.key].name:data.units[task.type].name;const bar=document.createElement('div');bar.className='production-progress';bar.innerHTML=`<span>${label} ${progress}% · ${Math.max(0,Math.ceil(task.total-task.time))}초</span><i style="width:${progress}%"></i>`;box.append(bar)}if(unit.queue.length){const queue=document.createElement('div');queue.className='production-slots';for(const [index,task]of unit.queue.entries()){const b=document.createElement('button');b.textContent=(index+1)+'. '+(task.kind==='research'?RESEARCH[task.key].name:data.units[task.type].name);b.title='터치하면 생산 취소';b.onclick=()=>battle.cancel(unit,index);queue.append(b)}box.append(queue)}
 $('order').textContent=(unit.construction?'건설 중':unit.egg?'변태 중':unit.type===35?'애벌레 · 생산 명령으로 변태':!battle.powered(unit)?'전력 공급 중단':unit.order==='gather'?(unit.cargo?'자원 운반 중':'자원 채취 중'):unit.order==='construct'?'건설 작업 중':$('order').textContent)+acid;
 renderCommandPanel();
}
let placementPoint=null;
function refreshPlacementUI(){if(!battle?.targeting?.startsWith('build:')||!placementPoint)return;const type=Number(battle.targeting.split(':')[1]),result=battle.placement(battle.builder,type,placementPoint);$('confirmBuild').disabled=!!result.reason;$('targetText').textContent=result.reason||data.units[type].name+' · 배치를 확인하세요'}
function confirmBuild(){if(!battle?.targeting?.startsWith('build:')||!placementPoint)return;const type=Number(battle.targeting.split(':')[1]),result=battle.placement(battle.builder,type,placementPoint);if(result.reason){toast(result.reason);refreshPlacementUI();return}battle.execute(battle.targeting,placementPoint);placementPoint=null}
function viewCommanderId(){return battle.commanderIdFor(productionTeam,productionSeat)}
function inProductionView(entity){return entity.team===0&&entity.commanderId===viewCommanderId()}
function refreshProductionSeat(){
 const names={terran:'테란',zerg:'저그',protoss:'프로토스'},commander=battle.commanders.find(c=>c.id===viewCommanderId());
 $('productionSeat').textContent=(productionSeat?'아군 AI '+productionSeat:'내 생산')+' · '+(names[commander?.race]||'');
}
function switchProduction(){if(battle.menuOpen||battle.targeting)battle.closeMenu();placementPoint=null;commandPage='basic';commandPanelSignature='';battle.select([],false);refreshProductionSeat();selectionUI()}
$('productionSeat').onclick=()=>{productionSeat=(productionSeat+1)%battle.teamSize;switchProduction()};
$('confirmBuild').onclick=confirmBuild;$('spaceToggle').onclick=()=>setViewMode(viewMode==='field'?'production':'field');$('baseView').onclick=()=>setViewMode('field');$('frontView').onclick=()=>{setViewMode('field');camera.y=1024;camera.zoom=DEFAULT_FRONT_ZOOM;limitCamera();drawMinimaps()};$('cancel').onclick=()=>{placementPoint=null;if(battle.targeting)battle.closeMenu();else menuUI()};
$('box').onclick=()=>{box=!box;$('box').setAttribute('aria-pressed',box);toast(box?'지면을 드래그해 범위 선택':'길게 누른 뒤 드래그해 범위 선택')};$('map').onclick=()=>{map=!map;$('map').setAttribute('aria-pressed',map);$('mapWrap').hidden=!map;drawMinimaps()};$('selectAll').onclick=()=>battle.select(battle.allies.filter(u=>!u.loaded).map(u=>u.id));$('home').onclick=()=>{$('baseView').click()};$('plus').onclick=()=>zoom(camera.zoom*1.2);$('minus').onclick=()=>zoom(camera.zoom/1.2);
const visible=u=>{const p=toScreen(u.x,u.y);return p.x>-40&&p.x<W+40&&p.y>40&&p.y<H-panelHeight()+40};
function hit(p,own=false){return battle.units.filter(u=>u.alive&&!u.hidden&&!u.loaded&&!!u.productionOnly===(viewMode==='production')&&(viewMode!=='production'||inProductionView(u))&&(!own||u.team===0)&&(u.team===0||battle.canSee(0,u))&&(u.def.building?Math.abs(u.x-p.x)<battle.footprint(u.type)[0]/2&&Math.abs(u.y-p.y)<battle.footprint(u.type)[1]/2:dist(u,p)<Math.max(u.r,15/camera.zoom))).sort((a,b)=>dist(a,p)-dist(b,p))[0]||null}
function nodeHit(p){return battle.nodes.find(n=>n.amount>0&&dist(p,n)<n.r+12&&(battle.fog[Math.floor(n.y/32)*40+Math.floor(n.x/32)]))||null}
function tap(p){const wp=toWorld(p.x,p.y),u=hit(wp);if(battle.targeting){if(battle.targeting==='irradiate'&&u){battle.execute('irradiate',null,u);return}if(viewMode!=='production')return;placementPoint=wp;refreshPlacementUI();return}if(battle.menuOpen){battle.closeMenu();return}if(u)battle.inspect(u)}
const position=e=>({x:e.clientX,y:e.clientY});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(!battle||!['prep','battle'].includes(battle.phase)||!$('modal').hidden)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=position(e);pointers.set(e.pointerId,p);if(pointers.size===2){clearTimeout(gesture?.timer);const [a,b]=[...pointers.values()];pinch={distance:dist(a,b),zoom:camera.zoom,world:toWorld((a.x+b.x)/2,(a.y+b.y)/2)};gesture=null;return}if(pointers.size>2)return;const wp=toWorld(p.x,p.y);gesture={pointer:e.pointerId,kind:'pending',start:p,current:p,world:wp,unit:hit(wp,true),camera:{...camera}}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();const p=position(e);if(battle.targeting?.startsWith('build:')){placementPoint=toWorld(p.x,p.y);refreshPlacementUI()}pointers.set(e.pointerId,p);if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()],x=(a.x+b.x)/2,y=(a.y+b.y)/2;camera.zoom=clamp(pinch.zoom*dist(a,b)/Math.max(1,pinch.distance),.25,2.8);camera.x=pinch.world.x-(x-W/2)/camera.zoom;camera.y=pinch.world.y-(y-cy())/camera.zoom;limitCamera();return}if(!gesture||gesture.pointer!==e.pointerId)return;gesture.current=p;if(gesture.kind==='pending'&&dist(p,gesture.start)>8){clearTimeout(gesture.timer);gesture.kind='pan'}if(gesture.kind==='pan'){camera.x=gesture.camera.x-(p.x-gesture.start.x)/camera.zoom;camera.y=gesture.camera.y-(p.y-gesture.start.y)/camera.zoom;limitCamera()}});
function pointerEnd(e,cancel=false){if(!pointers.has(e.pointerId))return;const p=position(e);pointers.delete(e.pointerId);if(pinch){if(!pointers.size){pinch=null;gesture=null;settings.zoom=camera.zoom;save('settings',settings)}return}if(!gesture)return;clearTimeout(gesture.timer);if(!cancel){if(gesture.kind==='pending')tap(p)}gesture=null}
canvas.addEventListener('pointerup',e=>pointerEnd(e));canvas.addEventListener('pointercancel',e=>{pointerEnd(e,true);pointers.clear();pinch=null});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(camera.zoom*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY)},{passive:false});
const cloakFrameCache=new Map();let cloakFrameCacheBytes=0;
function cloakFrame(image,frame,level,hidden){
 if(level<=0)return null;const source=image.__ministarSource||'',key=`${source}:${frame[0]},${frame[1]},${frame[4]},${frame[5]}:${level}:${hidden?1:0}`,cached=cloakFrameCache.get(key);
 if(cached){cloakFrameCache.delete(key);cloakFrameCache.set(key,cached);return cached.canvas}
 const bytes=frame[4]*frame[5]*4;if(bytes>8*1024*1024)return null;
 const canvas=document.createElement('canvas');canvas.width=frame[4];canvas.height=frame[5];const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,frame[0],frame[1],frame[4],frame[5],0,0,frame[4],frame[5]);
 const pixels=c.getImageData(0,0,canvas.width,canvas.height),data=pixels.data,baseAlpha=hidden?0:.42;
 for(let i=0;i<data.length;i+=4){if(data[i+3]===0)continue;const strength=Math.floor((28*data[i]+77*data[i+1]+151*data[i+2]+4096)/8192);if(level===8||strength<=level)data[i+3]=Math.round(data[i+3]*baseAlpha)}
 c.putImageData(pixels,0,0);cloakFrameCache.set(key,{canvas,bytes});cloakFrameCacheBytes+=bytes;
 while(cloakFrameCache.size>64||cloakFrameCacheBytes>8*1024*1024){const first=cloakFrameCache.keys().next().value,entry=cloakFrameCache.get(first);cloakFrameCache.delete(first);cloakFrameCacheBytes-=entry.bytes}
 return canvas;
}
function sprite(id,team,x,y,action='idle',time=0,direction=0,alpha=1,stack=new Set(),frameOverride=null,visual={}){
 const g=data.graphics[id];if(!g||stack.has(id)||stack.size>8)return false;stack.add(id);
 const track=trackFor(g,action,visual),p=frameOverride===null?(visual.poseOverride||pose(g,action,time,direction,visual)):{frame:frameOverride,flip:false};
 const persistent=action==='death'?[]:(g.persistentOverlays||[]),persistentIds=new Set(persistent.map(e=>e.image)),shadows=new Set(g.shadows||[]);
 const events=(visual.suppressEvents?[]:track?.overlayEvents||(track?.overlays||[]).map(image=>({image,tick:0,x:0,y:0}))).filter(e=>!persistentIds.has(e.image)).map(e=>({...e,persistent:false}));
 events.push(...persistent.map(e=>({...e,persistent:true})));
 const drawChild=e=>{
  if(shadows.has(e.image)||data.graphics[e.image]?.drawFunction===10)return;
  const clock=e.persistent?(visual.lifetime??time):time,age=clock-(e.tick||0)/24;if(age<0)return;
  const childAction=e.persistent?action:'idle',child=data.graphics[e.image],childTime=e.persistent&&action!=='idle'&&child?.tracks?.[action]?time:age;
  sprite(e.image,team,x+(e.x||0),y+(e.y||0),childAction,childTime,direction,alpha,stack,null,{...visual,poseOverride:null,suppressEvents:false,lifetime:age,parentFrame:p.frame,seed:(visual.seed||0)^e.image});
 };
 for(const event of events)if(event.under)drawChild(event);
 const image=getImage(teamImage(g,team));let drawn=false;
 if(image&&!p.hidden&&g.canvas?.[0]>0&&g.canvas?.[1]>0){const f=g.frames[p.frame];if(f&&f[4]&&f[5]){ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);if(p.flip)ctx.scale(-1,1);const faded=Number.isInteger(visual.cloakLevel)?cloakFrame(image,f,visual.cloakLevel,!!visual.cloakHidden):null;if(faded)ctx.drawImage(faded,0,0,f[4],f[5],(f[2]-g.canvas[0]/2)*.5,(f[3]-g.canvas[1]/2)*.5,f[4]*.5,f[5]*.5);else ctx.drawImage(image,f[0],f[1],f[4],f[5],(f[2]-g.canvas[0]/2)*.5,(f[3]-g.canvas[1]/2)*.5,f[4]*.5,f[5]*.5);ctx.restore();drawn=true}}
 for(const event of events)if(!event.under)drawChild(event);
 stack.delete(id);return drawn;
}
function drawHealthBar(u){
 const g=data.graphics[u.def.image],{width,x,y}=healthBarLayout(u,g,camera.zoom);
 const hpRatio=clamp(u.hp/(u.maxHp||u.def.hp),0,1),hp=hpRatio>0?Math.max(1,Math.floor(100*hpRatio)):0,shieldMax=u.def.shield||0,shieldRatio=shieldMax?clamp(u.shield/shieldMax,0,1):0,shield=shieldRatio>0?Math.max(1,Math.floor(100*shieldRatio)):0,hasShield=shieldMax>0,energyMax=inspectionEnergyMaximum(battle,u),energy=energyMax>0?clamp((u.energy||0)/energyMax,0,1)*100:0;
 const hpRows=hasShield?[18,0,0,1,1,2,18]:[18,0,1,2,18],bgRows=hasShield?[18,15,15,16,16,17,18]:[18,15,16,17,18],band=hp>=66?(hasShield?[18,0,0,1,1,2,18]:[18,0,1,2,18]):hp>=33?(hasShield?[18,3,3,4,4,5,18]:[18,3,4,5,18]):(hasShield?[18,6,6,7,7,8,18]:[18,6,7,8,18]);
 const colors={0:'#8fdb83',1:'#62bd49',2:'#37932a',3:'#f4d56e',4:'#dbac48',5:'#b7832d',6:'#ed8070',7:'#d94b36',8:'#a92a20',10:'#659fce',11:'#3373ac',12:'#c3a0dc',13:'#795493',15:'#343733',16:'#252f37',17:'#151b1d',18:'#080b0a'};
 const rows=[];if(hasShield)rows.push({fill:shield,colors:[18,10,11,18],background:[18,16,17,18]});rows.push({fill:hp,colors:band,background:bgRows});if(energyMax>0)rows.push({fill:energy,colors:[18,12,12,18],background:[18,16,16,18]});
 let offset=0;for(const row of rows){const filled=healthBarFillWidth(row.fill,width);for(let index=0;index<row.colors.length;index++){const yy=y+offset+index;ctx.fillStyle=colors[row.colors[index]];ctx.fillRect(x,yy,filled,1);ctx.fillStyle=colors[row.background[index]];ctx.fillRect(x+filled,yy,Math.max(0,width-filled),1)}offset+=row.colors.length}
 ctx.fillStyle=colors[18];for(let px=0;px<width;px+=3)ctx.fillRect(x+px,y,Math.min(1,width-px),offset);
}
const warpCanvases=new WeakMap();
function drawConstruction(u,alpha){
 const visual=constructionVisual(u,data);if(!visual)return false;
 if(!visual.warp){sprite(visual.image,u.team,u.x,u.y,'idle',u.construction.time,0,alpha,new Set(),visual.frame);return true}
 if(visual.phase==='anchor'){
  if(!sprite(211,u.team,u.x,u.y,visual.anchorAction,visual.anchorTime,0,alpha)){
   const [w,h]=u.def.footprint||[64,64];ctx.save();ctx.strokeStyle=u.team?'#ff8178':'#8fc5ff';ctx.globalAlpha*=alpha;ctx.lineWidth=2/camera.zoom;ctx.strokeRect(u.x-w*.32,u.y-h*.42,w*.64,h*.84);ctx.restore();
  }
  return true;
 }
 const g=data.graphics[u.def.image],image=getImage(g?.images[u.team===1?'red':'blue']),f=g?.frames[0];
 if(!image||!f){const [w,h]=u.def.footprint||[64,64];ctx.save();ctx.strokeStyle=u.team?'#ff8178':'#8fc5ff';ctx.globalAlpha*=alpha;ctx.lineWidth=2/camera.zoom;ctx.strokeRect(u.x-w*.38,u.y-h*.38,w*.76,h*.76);ctx.restore();return true}
 let layer=warpCanvases.get(u);if(!layer||layer.width!==f[4]||layer.height!==f[5]){layer=document.createElement('canvas');layer.width=f[4];layer.height=f[5];warpCanvases.set(u,layer)}
 const c=layer.getContext('2d'),texture=data.graphics[210],textureImage=getImage(texture?.images?.blue),events=data.graphics[211]?.warpTextureTrack?.warpOverlayEvents||[],event=events[Math.max(0,Math.min(events.length-1,Math.floor(visual.textureFrame||0)))],textureFrame=event?.frame??Math.floor(visual.textureFrame||0),tf=texture?.frames?.[textureFrame];
 c.clearRect(0,0,layer.width,layer.height);c.globalCompositeOperation='source-over';c.filter=visual.phase==='flash'?`brightness(${.76+.24*(visual.flashProgress||0)}) saturate(1.12)`:'none';
 c.drawImage(image,f[0],f[1],f[4],f[5],0,0,f[4],f[5]);c.filter='none';
 c.globalCompositeOperation='source-atop';c.fillStyle=visual.phase==='texture'?'rgba(45,104,226,.58)':`rgba(80,154,255,${.22*(1-(visual.flashProgress||0))})`;c.fillRect(0,0,layer.width,layer.height);
 if(textureImage&&tf){c.globalAlpha=visual.phase==='texture'?.96:.55*(1-(visual.flashProgress||0));c.drawImage(textureImage,tf[0],tf[1],tf[4],tf[5],0,0,layer.width,layer.height);c.globalAlpha=1}
 c.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(layer,u.x+(f[2]-g.canvas[0]/2)*.5,u.y+(f[3]-g.canvas[1]/2)*.5,f[4]*.5,f[5]*.5);ctx.restore();
 return true;
}
function spellOverlayImage(name,size=0){const value=spellVisualData?.images?.[name];return Array.isArray(value)?value[clamp(size,0,value.length-1)]:value}
function unitEffectVisual(u,image,key){const started=u.statusVisuals?.[key]??battle.time,time=Math.max(0,battle.time-started);return{seed:u.id^image,lifetime:time,skipSpawnIntro:true,suppressEvents:true,cloakLevel:u.cloakLevel>0?u.cloakLevel:undefined,cloakHidden:u.team===1&&!battle.canSee(0,u)}}
function drawMedicHealSpark(u){const spark=u.healSpark,age=spark?battle.time-spark.startedAt:Infinity;if(age<0||age>.45)return;const alpha=1-age/.45,y=u.y-u.r-6-age*12;ctx.save();ctx.globalAlpha*=alpha;ctx.font='bold 10px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#b8ff91';ctx.shadowColor='#70ff72';ctx.shadowBlur=5;ctx.fillText('+',u.x,y);ctx.restore()}
function unit(u){
 const outsideSpace=!!u.productionOnly!==(viewMode==='production'),wrongCommander=viewMode==='production'&&!inProductionView(u),staleCorpse=!u.alive&&battle.time-u.deathTime>(u.deathDuration||1.8);
 if(!u.alive&&u.def.building||outsideSpace||wrongCommander||u.hidden||u.loaded||u.refunded||staleCorpse||!visible(u)&&!u.def.building)return;
 const normallyVisible=u.team===0||battle.canSee(0,u),cloakFade=!normallyVisible&&u.team===1&&u.cloakLevel<8&&u.cloakFadeTeams?.includes(0)&&battle.inVision(0,u),burrowFade=!normallyVisible&&u.team===1&&(u.type===103?u.lurkerState==='unburrowing':u.burrowState==='unburrowing')&&battle.inVision(0,u);
 if(!normallyVisible&&!cloakFade&&!burrowFade)return;
 const concealedBurrow=u.alive&&(u.type===103?u.lurkerState==='burrowed':u.burrowed&&u.burrowState!=='unburrowing'),selected=battle.isHighlighted(u),cloakLevel=u.alive&&u.cloakLevel>0?u.cloakLevel:0,alpha=!u.alive?1:1,overlaySize=spellVisualData?.unitOverlaySizes?.[u.type]??0,hasMatrix=u.alive&&u.matrix>0;
 if(selected&&u.alive){ctx.strokeStyle=u.team===0?'#79f880':'#f16e67';ctx.lineWidth=1.3/camera.zoom;ctx.beginPath();ctx.ellipse(u.x,u.y+u.r*.55,u.r+5,(u.r+5)*.48,0,0,Math.PI*2);ctx.stroke()}
 const g=data.graphics[u.def.image],drawAction=concealedBurrow?'burrow':u.type===124?'idle':u.action,drawTime=concealedBurrow?(u.burrowPoseTime||u.lurkerBurrowPoseTime||transitionSeconds(g,'burrow')):drawAction==='heal'?(u.healVisualTime||0):u.animTime,visual={seed:u.type===103&&u.lurkerAnimSeed!==undefined?u.lurkerAnimSeed:u.id,lifetime:u.visualTime??u.animTime,targetDistance:u.target?dist(u,u.target):Infinity,inheritedFrame:u.lastVisualFrame,skipSpawnIntro:!!u.skipSpawnIntro&&drawAction==='idle',suppressEvents:concealedBurrow,trackOverride:u.attackVisualTrack||null,cloakLevel:cloakLevel||undefined,cloakHidden:u.team===1&&!normallyVisible};
 const matrixBack=spellOverlayImage('matrixBack',overlaySize),matrixFront=spellOverlayImage('matrixFront',overlaySize);
 const bodyPose=g&&!u.construction&&!u.egg?pose(g,drawAction,drawTime,u.direction,visual):null;
 if(bodyPose&&u.alive&&!concealedBurrow)for(const layer of g.shadowLayers||[]){
  const shadow=data.graphics[layer.image],follows=layer.followParent??shadow?.tracks?.idle?.followParent;
  if(!shadow?.frames?.length||follows&&bodyPose.frame>=shadow.frames.length)continue;
  const shadowVisual={...visual,suppressEvents:true,poseOverride:follows?{frame:bodyPose.frame,flip:bodyPose.flip,hidden:bodyPose.hidden}:null};
  sprite(layer.image,0,u.x+(layer.x||0),u.y+(layer.y||0),'idle',u.animTime,u.direction,.35,new Set(),null,shadowVisual);
 }
 if(hasMatrix&&matrixBack){const effectVisual=unitEffectVisual(u,matrixBack,'matrix');sprite(matrixBack,u.team,u.x,u.y,'idle',effectVisual.lifetime,u.direction,alpha,new Set(),null,effectVisual)}
 if(!drawConstruction(u,alpha)){const p=bodyPose||pose(g,drawAction,drawTime,u.direction,visual);u.lastVisualFrame=p.frame;visual.poseOverride=p;sprite(u.egg?(u.type===43?11:u.type===38?914:21):u.def.image,u.team,u.x,u.y,drawAction,drawTime,u.direction,alpha,new Set(),null,visual)}
 const sub=u.def.subunit!==null?data.units[u.def.subunit]:null,turretImage=u.turretImage??sub?.image;if(Number.isInteger(turretImage)&&u.alive)sprite(turretImage,u.team,u.x,u.y,u.turretAction||u.action,u.turretAnimTime||u.animTime,u.turretDirection??u.direction,alpha,new Set(),null,{seed:u.id^turretImage,targetDistance:u.target?dist(u,u.target):Infinity,trackOverride:u.turretVisualTrack||null,cloakLevel:cloakLevel||undefined,cloakHidden:u.team===1&&!normallyVisible});
 if(u.type===124&&u.alive&&!u.construction&&!Number.isInteger(u.turretImage))sprite(297,u.team,u.x,u.y,u.action,u.animTime,u.action==='idle'?Math.floor(u.animTime*16)%32:u.direction,alpha,new Set(),null,visual);
 if(hasMatrix&&matrixFront){const effectVisual=unitEffectVisual(u,matrixFront,'matrix');sprite(matrixFront,u.team,u.x,u.y,'idle',effectVisual.lifetime,u.direction,alpha,new Set(),null,effectVisual)}
 if(u.alive){for(const [key,imageName]of [['lockdown','lockdown'],['stasis','stasisOverlay'],['ensnare','ensnareOverlay'],['irradiate','irradiate'],['plague','plagueOverlay'],['maelstrom','maelstromOverlay']])if(u.buffs[key]>0){const image=spellOverlayImage(imageName,overlaySize);if(image){const effectVisual=unitEffectVisual(u,image,key);sprite(image,u.team,u.x,u.y,'idle',effectVisual.lifetime,u.direction,alpha,new Set(),null,effectVisual)}}}
 if(u.alive&&u.def.building&&u.def.race==='terran'&&!u.construction)drawBuildingFire(u);
 if(u.alive&&u.healSpark)drawMedicHealSpark(u);
 if(selected&&u.alive)drawHealthBar(u);
}
let battlefieldTexture=null,productionTexture=null;
function terrainTile(c,n,x,y,size=32){c.drawImage(terrain,n%16*64,Math.floor(n/16)*64,64,64,x,y,size,size)}
const creepLayers=new Map();
const CREEP_EDGE_ATLAS='assets/original-terrain/desert-edge-hd.webp';
function invalidateCreepField(field){
 for(let y=field.minTileY;y<field.minTileY+field.height;y++)for(let x=field.minTileX;x<field.minTileX+field.width;x++)field.dirty.add(x+','+y);
}
function creepAtlas(){
 const image=getImage(CREEP_EDGE_ATLAS);if(image)return image;
 if(!creepAtlasPending){creepAtlasPending=true;void loadImage(CREEP_EDGE_ATLAS).then(loaded=>{creepAtlasPending=false;if(!loaded)return;for(const field of battle?.creepFields?.values?.()||[])invalidateCreepField(field)})}
 return null;
}
function drawCreepCell(layer,x,y){
 const tileSize=32,lx=x*tileSize-layer.originX,ly=y*tileSize-layer.originY;
 if(lx<0||ly<0||lx+tileSize>layer.canvas.width||ly+tileSize>layer.canvas.height)return;
 const c=layer.context;c.clearRect(lx,ly,tileSize,tileSize);
 if(layer.field.hasTile(x,y)){
  const salt=(Math.imul(x+17,73856093)^Math.imul(y+29,19349663))>>>0;terrainTile(c,129+salt%7,lx,ly,tileSize);return;
 }
 const frame=creepEdgeFrameIndex(layer.field,x,y,CREEP_EDGE_MAP);if(frame===null)return;
 const atlas=creepAtlas(),rect=CREEP_EDGE_FRAMES[frame];if(!atlas||!rect)return;
 c.drawImage(atlas,rect[0],rect[1],rect[2],rect[3],lx,ly,tileSize,tileSize);
}
function drawCreepField(field){
 let layer=creepLayers.get(field);
 if(!layer){const canvas=document.createElement('canvas');canvas.width=field.width*32;canvas.height=field.height*32;layer={field,canvas,context:canvas.getContext('2d'),originX:field.minTileX*32,originY:field.minTileY*32};creepLayers.set(field,layer)}
 for(const tile of field.takeDirty())drawCreepCell(layer,tile.x,tile.y);
 ctx.save();ctx.beginPath();ctx.rect(layer.originX,layer.originY,layer.canvas.width,layer.canvas.height);ctx.clip();ctx.drawImage(layer.canvas,layer.originX,layer.originY);ctx.restore();
}
const psiMaskCache=new Map(),PSI_RX=256,PSI_RY=160,PSI_FEATHER=8,PSI_WORLD_HEIGHT=PRODUCTION_OFFSET+PRODUCTION_HEIGHT;
function psiMaskFor(centers){
 const points=centers.filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)).map(point=>({x:Math.round(point.x*100)/100,y:Math.round(point.y*100)/100}));
 if(!points.length)return null;
 const key=points.map(point=>point.x+','+point.y).sort().join(';');if(psiMaskCache.has(key))return psiMaskCache.get(key);
 const left=Math.max(0,Math.floor(Math.min(...points.map(point=>point.x-PSI_RX-PSI_FEATHER)))),right=Math.min(1280,Math.ceil(Math.max(...points.map(point=>point.x+PSI_RX+PSI_FEATHER))));
 const top=Math.max(0,Math.floor(Math.min(...points.map(point=>point.y-PSI_RY-PSI_FEATHER)))),bottom=Math.min(PSI_WORLD_HEIGHT,Math.ceil(Math.max(...points.map(point=>point.y+PSI_RY+PSI_FEATHER))));
 if(right<=left||bottom<=top)return null;
 const canvas=document.createElement('canvas');canvas.width=right-left;canvas.height=bottom-top;const context=canvas.getContext('2d');
 context.globalCompositeOperation='lighter';
 for(const point of points){
  context.save();context.translate(point.x-left,point.y-top);context.scale(PSI_RX,PSI_RY);
  const gradient=context.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(1-PSI_FEATHER/PSI_RY,'rgba(255,255,255,1)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle=gradient;context.beginPath();context.arc(0,0,1,0,Math.PI*2);context.fill();context.restore();
 }
 context.globalCompositeOperation='source-in';context.fillStyle='#6584ff';context.fillRect(0,0,canvas.width,canvas.height);
 const mask={canvas,x:left,y:top};psiMaskCache.set(key,mask);while(psiMaskCache.size>8)psiMaskCache.delete(psiMaskCache.keys().next().value);return mask;
}
function drawPsiField(centers,alpha=.12){
 const mask=psiMaskFor(Array.isArray(centers)?centers:[centers]);if(!mask)return;
 ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(mask.canvas,mask.x,mask.y);ctx.restore();
}
function terrainChoice(x,y,tiles){const gx=x/32,gy=y/32,salt=(Math.imul(gx+17,73856093)^Math.imul(gy+29,19349663))>>>0;return tiles[salt%tiles.length]}
function drawRelief(){
 if(desertField){ctx.drawImage(desertField,0,0,1280,2048);return}
 if(!battlefieldTexture){const c=document.createElement('canvas');c.width=1280;c.height=2048;const g=c.getContext('2d');g.fillStyle='#9b5726';g.fillRect(0,0,c.width,c.height);battlefieldTexture=c}
 ctx.drawImage(battlefieldTexture,0,0);
}
function drawProductionBoard(){
 ctx.fillStyle='#1c100a';ctx.fillRect(0,PRODUCTION_OFFSET,1280,PRODUCTION_HEIGHT);
 if(!desertProduction)desertProduction=getImage('ds-assets/production.webp?v=0.16.25');
 ctx.save();if(productionTeam){ctx.translate(1280,0);ctx.scale(-1,1)}
 if(desertProduction)ctx.drawImage(desertProduction,PRODUCTION_GROUND_X,PRODUCTION_OFFSET+PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT);
 ctx.restore();ctx.strokeStyle='#c49b61';ctx.lineWidth=2;ctx.strokeRect(productionTeam?1280-PRODUCTION_GROUND_X-PRODUCTION_GROUND_WIDTH:PRODUCTION_GROUND_X,PRODUCTION_OFFSET+PRODUCTION_GROUND_Y,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT);
 for(const node of battle.nodes.filter(n=>inProductionView(n))){
  ctx.strokeStyle=node.occupiedBy?'#8b9564':'#c6ae79';ctx.fillStyle='#35220c88';ctx.lineWidth=2;ctx.fillRect(node.x-64,node.y-32,128,64);ctx.strokeRect(node.x-64,node.y-32,128,64);
 }
}
function minimapBounds(){
 return viewMode==='production'?{x:0,y:PRODUCTION_OFFSET,width:1280,height:PRODUCTION_HEIGHT}:{x:0,y:0,width:1280,height:2048};
}
function drawMinimapTo(target){
 if(!battle||!target)return;
 const context=target.getContext('2d'),width=target.width,height=target.height,bounds=minimapBounds(),layout=minimapTransform(width,height,bounds,target===consoleMini?0:3);
 context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,width,height);context.fillStyle='#010504';context.fillRect(0,0,width,height);
 context.save();context.beginPath();context.rect(layout.offsetX,layout.offsetY,layout.drawnWidth,layout.drawnHeight);context.clip();
 context.translate(layout.offsetX,layout.offsetY);context.scale(layout.scale,layout.scale);context.translate(-bounds.x,-bounds.y);
 context.fillStyle=viewMode==='production'?'#241a10':'#162b20';context.fillRect(bounds.x,bounds.y,bounds.width,bounds.height);
 if(viewMode==='field'){
  context.fillStyle='#2b6487';for(const region of battle.map.water)context.fillRect(region.x,region.y,region.w,region.h);
  context.fillStyle='#857b5155';for(const region of battle.map.rocks)context.fillRect(region.x,region.y,region.w,region.h);
  for(let y=0;y<64;y++)for(let x=0;x<40;x++)if(!battle.fog[y*40+x]){context.fillStyle=battle.explored[y*40+x]?'#030c1066':'#02080cdd';context.fillRect(x*32,y*32,32,32)}
  for(const node of battle.nodes){if(node.team!==0)continue;context.fillStyle=node.kind==='gas'?'#63a047':'#4da3db';context.fillRect(node.x-10,node.y-10,20,20)}
  for(const unit of battle.units)if(unit.alive&&!unit.loaded&&!unit.hidden&&!unit.productionOnly&&(unit.team===0||battle.canSee(0,unit))){context.fillStyle=unit.team?'#e78a6e':battle.selection.includes(unit.id)?'#e7e5af':'#87d17d';const size=unit.def.building?38:20;context.fillRect(unit.x-size/2,unit.y-size/2,size,size)}
  if(battle.core?.alive){context.fillStyle='#e3c789';context.fillRect(battle.core.x-20,battle.core.y-20,40,40)}
 }else{
  const groundX=productionTeam?1280-PRODUCTION_GROUND_X-PRODUCTION_GROUND_WIDTH:PRODUCTION_GROUND_X,groundY=PRODUCTION_OFFSET+PRODUCTION_GROUND_Y;
  context.fillStyle='#64492d';context.fillRect(groundX,groundY,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT);
  context.strokeStyle='#c49b61';context.lineWidth=20;context.strokeRect(groundX,groundY,PRODUCTION_GROUND_WIDTH,PRODUCTION_GROUND_HEIGHT);
  const owner=viewCommanderId();
  for(const node of battle.nodes)if(node.team===productionTeam&&node.commanderId===owner){context.fillStyle=node.kind==='gas'?'#63a047':'#4da3db';context.fillRect(node.x-18,node.y-18,36,36)}
  const field=battle.creepFields.get(owner);if(field){context.fillStyle='#815b9177';for(const key of field.tiles){const parts=key.split(',');context.fillRect(Number(parts[0])*32,Number(parts[1])*32,32,32)}}
  for(const unit of battle.units)if(unit.alive&&unit.productionOnly&&unit.commanderId===owner){context.fillStyle=battle.selection.includes(unit.id)?'#e7e5af':'#87d17d';const size=unit.def.building?42:20;context.fillRect(unit.x-size/2,unit.y-size/2,size,size)}
 }
 const top=toWorld(0,63),bottom=toWorld(W,H-panelHeight());context.strokeStyle='#e2eccf';context.lineWidth=1/layout.scale;context.strokeRect(top.x,top.y,bottom.x-top.x,bottom.y-top.y);
 context.restore();
}
function drawMinimaps(){if(!battle)return;drawMinimapTo(consoleMini);if(map&&!$('mapWrap').hidden)drawMinimapTo(mini)}
let miniDragCanvas=null;
function minimapPointFromEvent(target,event){
 const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return null;
 const x=(event.clientX-rect.left)*target.width/rect.width,y=(event.clientY-rect.top)*target.height/rect.height;
 return minimapWorldPoint(x,y,target.width,target.height,minimapBounds(),target===consoleMini?0:3);
}
function moveCameraFromMinimap(target,event){
 const point=minimapPointFromEvent(target,event);if(!point)return;
 camera.x=point.x;camera.y=point.y;limitCamera();drawMinimaps();
}
function bindMinimap(target){
 target.addEventListener('pointerdown',event=>{event.preventDefault();miniDragCanvas=target;target.setPointerCapture(event.pointerId);moveCameraFromMinimap(target,event)});
 target.addEventListener('pointermove',event=>{if(miniDragCanvas===target)moveCameraFromMinimap(target,event)});
 target.addEventListener('pointerup',()=>{if(miniDragCanvas===target)miniDragCanvas=null});
 target.addEventListener('pointercancel',()=>{if(miniDragCanvas===target)miniDragCanvas=null});
}
bindMinimap(mini);bindMinimap(consoleMini);
function drawEconomy(){
 if(battle.phase==='title')return;
 const creepField=battle.laneMode?(viewMode==='production'?battle.creepFields.get(viewCommanderId()):null):battle.creepFields.get(0);if(creepField)drawCreepField(creepField);
 for(const node of battle.nodes){if(node.amount<=0||viewMode==='production'&&!inProductionView(node))continue;if(!sprite(node.kind==='gas'?344:347,0,node.x,node.y,'idle',0)){
  ctx.fillStyle=node.kind==='gas'?'#608d46':'#337fbd';ctx.beginPath();ctx.ellipse(node.x,node.y,node.r,node.r*.6,0,0,Math.PI*2);ctx.fill();
 }}
 const selected=battle.selected[0],owner=viewMode==='production'?viewCommanderId():0,team=viewMode==='production'?productionTeam:0,pylons=battle.units.filter(u=>u.alive&&u.type===156&&battle.ready(u)&&(battle.laneMode?battle.ownsProduction(u,team)&&u.commanderId===owner:u.team===team));
 let targetType=null,targetResult=null;if(battle.targeting?.startsWith('build:')&&placementPoint){targetType=Number(battle.targeting.split(':')[1]);const worker=battle.builder||battle.selected.find(u=>u.type===WORKER[u.def.race]);if(worker)targetResult=battle.placement(worker,targetType,placementPoint)}
 if(targetType===156&&targetResult)drawPsiField([targetResult.point],.15);else if(targetType&&BUILDINGS[targetType]?.psi)drawPsiField(pylons,.11);else if(selected?.type===156&&pylons.includes(selected))drawPsiField([selected],.15);
 if(battle.targeting?.startsWith('build:')&&placementPoint){
  if(targetResult){const type=targetType,result=targetResult,p=result.point,[w,h]=battle.footprint(type);ctx.fillStyle=result.reason?'#e84a4a44':'#67e35d44';ctx.strokeStyle=result.reason?'#f36a68':'#8cf784';ctx.lineWidth=2/camera.zoom;ctx.fillRect(p.x-w/2,p.y-h/2,w,h);ctx.strokeRect(p.x-w/2,p.y-h/2,w,h);sprite(data.units[type].image,0,p.x,p.y,'idle',0,0,.45)}
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
const PROJECTILE_TONES={519:'#c9b5ff',527:'#ffe2a1',523:'#d9f5ff',524:'#d9f5ff',528:'#a9eaff',529:'#a9eaff',521:'#a9eaff',965:'#c5f4ff',509:'#d5ef8a',511:'#f0d76b',515:'#c6df77',962:'#c4ed79',532:'#ffe6a0',534:'#f8e7ad',535:'#d2f4ff',522:'#cff4ff',503:'#ffc85d',536:'#ffe9b8'};
function projectileAlpha(visual){
 if(!visual.firstRendered&&visual.kind==='projectile')return 1;
 if(visual.kind==='hitscan')return Math.max(0,Math.min(1,(visual.duration-(visual.visualAge||0))/.03));
 if(visual.kind==='projectile'&&!visual.arrived)return 1;
 const life=visual.kind==='projectile'?Math.max(.12,visual.flightElapsed+.06):visual.duration;
 return Math.max(0,Math.min(1,(life-(visual.kind==='projectile'?visual.age:(visual.visualAge||0)))/.06));
}
function drawProjectileTrail(visual,color,alpha,width=2,maxLength=18){
 const points=[...(visual.trail||[]),{x:visual.x,y:visual.y}];if(points.length<2)return;
 let left=maxLength,path=[points.at(-1)];
 for(let i=points.length-1;i>0&&left>0;i--){const from=points[i],to=points[i-1],length=Math.hypot(to.x-from.x,to.y-from.y);if(!length)continue;const take=Math.min(left,length);path.push({x:from.x+(to.x-from.x)*take/length,y:from.y+(to.y-from.y)*take/length});left-=take;if(take<length)break}
 if(path.length<2)return;path.reverse();ctx.save();ctx.globalAlpha*=alpha*.45;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const point of path.slice(1))ctx.lineTo(point.x,point.y);ctx.stroke();ctx.restore();
}
function drawProjectileFallback(visual,color,alpha){
 const angle=Math.atan2(visual.endY-visual.startY,visual.endX-visual.startX),directional=[528,529,521,965,509,511,515,962,532,534,535,522,503,536].includes(visual.image);
 if(directional)drawProjectileTrail(visual,color,alpha,1.5,18);
 ctx.save();ctx.globalAlpha*=alpha;ctx.translate(visual.x,visual.y);if(directional)ctx.rotate(angle);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=6;
 if(directional)ctx.fillRect(-4,-1,8,2);else{ctx.globalAlpha*=.45;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
function drawHydraSting(visual,alpha){
 const progress=Math.min(1,visual.age/visual.duration),hx=visual.startX+(visual.endX-visual.startX)*progress,hy=visual.startY+(visual.endY-visual.startY)*progress,dx=visual.endX-visual.startX,dy=visual.endY-visual.startY,length=Math.hypot(dx,dy)||1,travelled=length*progress,head=Math.min(6,travelled),tail=Math.min(10,Math.max(0,travelled-head)),ux=dx/length,uy=dy/length,hx0=hx-ux*head,hy0=hy-uy*head,tx=hx0-ux*tail,ty=hy0-uy*tail;
 ctx.save();ctx.globalAlpha*=alpha;ctx.lineCap='round';ctx.strokeStyle='#a8c958';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(hx0,hy0);ctx.stroke();ctx.strokeStyle='#d7f383';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(hx0,hy0);ctx.lineTo(hx,hy);ctx.stroke();ctx.fillStyle='#f2ffc1';ctx.beginPath();ctx.arc(hx,hy,1.3,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawHydraContactFallback(visual){const alpha=Math.max(0,1-visual.age/(visual.fallbackDuration||.1));if(!alpha)return;ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle='#d7f383';ctx.shadowColor='#d7f383';ctx.shadowBlur=7;ctx.beginPath();ctx.arc(visual.endX,visual.endY,3,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawProjectileVisuals(){
 const units=new Map(battle.units.map(unit=>[unit.id,unit]));
 for(const visual of battle.projectileVisuals){const source=units.get(visual.sourceId),target=units.get(visual.targetId);if(source&&(source.hidden||source.loaded||source.productionOnly)||source?.team===1&&!battle.canSee(0,source)||target&&(target.hidden||target.loaded||target.productionOnly||target.team===1&&!battle.canSee(0,target)))continue;const color=PROJECTILE_TONES[visual.image]||'#dcecff',alpha=projectileAlpha(visual);
  if(visual.kind==='hitscan'){if(visual.age<visual.duration)drawHydraSting(visual,alpha);else if(!visual.firstRendered)drawProjectileFallback({...visual,image:511,x:visual.endX,y:visual.endY},'#d7f383',.9);battle.markProjectileVisualRendered(visual);continue}
  if(visual.kind==='contact'){const elapsed=visual.visualAge||0,action=visual.image===504?'idle':'death';if(!sprite(visual.image,visual.team,visual.endX,visual.endY,action,elapsed,visual.direction,visual.firstRendered?alpha:1)){if(visual.image===504)drawHydraContactFallback({...visual,age:elapsed});else drawProjectileFallback({...visual,x:visual.endX,y:visual.endY},color,visual.firstRendered?alpha:1)}battle.markProjectileVisualRendered(visual);continue}
  drawProjectileTrail(visual,color,alpha);if(!sprite(visual.image,visual.team,visual.x,visual.y,'idle',visual.age,visual.direction,alpha))drawProjectileFallback(visual,color,alpha);battle.markProjectileVisualRendered(visual);
 }
}
function drawSpellFallback(effect,time=0,radius=16){const colors={ensnare:'#8ff6ad',plague:'#b0ef6a',stasis:'#bce6ff',maelstrom:'#e5b5ff',storm:'#b6f3ff',swarm:'#94da70',web:'#ddd7ff'};const color=colors[effect.spell||effect.kind]||'#d9edff',phase=(Math.max(0,time)*5)%1,r=Math.max(3,radius*(.45+.28*phase));ctx.save();ctx.globalAlpha*=Math.max(.35,1-phase*.45);ctx.translate(effect.x,effect.y);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.rotate(time*2.5);for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(0,0,r+3,i*Math.PI/2+phase,i*Math.PI/2+phase+Math.PI/3);ctx.stroke()}ctx.globalAlpha*=.65;ctx.beginPath();ctx.arc(0,0,Math.max(1.5,r*.18),0,Math.PI*2);ctx.fill();ctx.restore()}
function drawSpellArea(area){if(area.kind==='storm'&&area.ageFrames<5)return;const time=area.kind==='storm'?Math.max(0,area.ageFrames-5)/24:area.duration-area.left,visual=area.kind==='storm'?{trackOverride:'stormActive'}:{};const drawn=sprite(area.image??({storm:525,swarm:337,web:951}[area.kind]),area.team||0,area.x,area.y,'idle',time,0,Math.min(1,area.left*6),new Set(),null,visual);if(!drawn)drawSpellFallback(area,time,area.r||32)}
function drawBattleEffects(){
 for(const f of battle.effects){
  if(!!f.productionOnly!==(viewMode==='production')||f.productionOnly&&!inProductionView(f))continue;
  if(f.kind==='spell'){if(!Number.isInteger(f.image))continue;const time=f.visualAge||0,drawn=f.fallbackMode?false:sprite(f.image,f.team||0,f.x,f.y,'idle',time,f.direction||0,1,new Set(),null,{skipSpawnIntro:true});if(drawn)battle.markEffectRendered(f);else if(f.age>=.65){drawSpellFallback(f,time,18);f.fallbackMode=true;battle.markEffectRendered(f)}continue}
  const death=f.kind==='building-death',g=data.graphics[f.image],time=death?(f.duration-f.left)/f.duration*(g?.tracks?.idle?.ticks||24)/24:f.kind==='lurker-spine'?f.duration-f.left:(f.duration-f.left)*1.1;
  sprite(f.image,f.team||0,f.x,f.y,'idle',time,f.direction||0,death?1:Math.min(1,f.left*8));
 }
}
function renderFrame(now){const realDt=last?Math.max(0,(now-last)/1000):1/60;last=now;const dt=document.hidden||backgroundPauseRequired?0:realDt;battle.update(dt,{maxTicks:3,cpuBudgetMs:16});hudTime+=realDt;if(hudTime>.15){hudTime=0;hudUI();refreshVitals();productionUI()}minimapClock+=realDt;if(minimapClock>=.1){minimapClock=0;drawMinimaps()}ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#10191c';ctx.fillRect(0,0,W,H);limitCamera();ctx.save();ctx.translate(W/2,cy());ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);if(viewMode==='production'){drawProductionBoard();drawEconomy();drawWrecks();for(const u of battle.units.filter(u=>u.productionOnly&&inProductionView(u)))unit(u);battle.markProjectileVisualsRendered();drawBattleEffects();ctx.restore();requestAnimationFrame(render);return}const a=toWorld(0,0),b=toWorld(W,H),x0=Math.max(0,Math.floor(a.x/32)),x1=Math.min(40,Math.ceil(b.x/32)),y0=Math.max(0,Math.floor(a.y/32)),y1=Math.min(64,Math.ceil(b.y/32));drawRelief();drawEconomy();drawWrecks();const visibleUnits=battle.units.filter(u=>!u.hidden&&!u.loaded&&!u.productionOnly&&(u.def.building||visible(u))).sort((a,b)=>Number(a.def.air)-Number(b.def.air)||a.y-b.y);for(const u of visibleUnits.filter(u=>!u.def.air))unit(u);for(const area of battle.areas)drawSpellArea(area);for(const u of visibleUnits.filter(u=>u.def.air))unit(u);drawProjectileVisuals();drawBattleEffects();if(battle.phase!=='title'&&!battle.laneMode)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!battle.fog[y*40+x]){ctx.fillStyle=battle.explored[y*40+x]?'#030c10a9':'#030a10e8';ctx.fillRect(x*32,y*32,32.5,32.5)}if(battle.core?.alive){ctx.save();ctx.translate(battle.core.x,battle.core.y-85);ctx.rotate(Math.PI/4);ctx.fillStyle='#e2c587';ctx.fillRect(-5,-5,10,10);ctx.restore()}if(gesture?.kind==='box'){const s=gesture.world,e=toWorld(gesture.current.x,gesture.current.y);ctx.fillStyle='#83e7921c';ctx.strokeStyle='#9ef69a';ctx.lineWidth=1/camera.zoom;ctx.fillRect(s.x,s.y,e.x-s.x,e.y-s.y);ctx.strokeRect(s.x,s.y,e.x-s.x,e.y-s.y)}ctx.restore();if(battle.paused&&battle.phase==='battle'&&$('modal').hidden){ctx.fillStyle='#07151aa9';ctx.fillRect(0,0,W,H);ctx.fillStyle='#deddbb';ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillText('일시 정지',W/2,cy())}requestAnimationFrame(render)}
function render(now){const started=performance.now();renderFrame(now);resourcePlanner.recordFrameCost(performance.now()-started);markFirstSceneReady()}
function modal(kind,html){closeStatTooltip();closeDropdown();if(battle?.menuOpen)battle.closeMenu();pausedBefore=battle?.paused||false;if(battle?.phase==='battle')battle.paused=true;syncAudioPause();modalKind=kind;$('modalContent').innerHTML=html;enhanceSelects($('modalContent'));$('modal').hidden=false}
function closeModal(){closeDropdown();if(modalKind==='result')return;$('modal').hidden=true;if(battle?.phase==='battle')battle.paused=pausedBefore;modalKind='';syncAudioPause()}$('closeModal').onclick=closeModal;
function help(){modal('help',`<div class="eyebrow">FIELD MANUAL</div><h2>자동 전선 작전</h2><ul><li><b>건물 건설</b>: 생산 공간 하단의 기본·고급 탭에서 건물을 선택해 배치합니다. 선택한 건물의 부착·변태·연구 명령은 선택 건물 탭에 표시됩니다.</li><li><b>출격 정보</b>: 완성된 생산 건물을 선택하면 다음 웨이브 병력과 건설 진행 상황이 하단에 표시됩니다. 건물은 고정 병력을 자동으로 보냅니다.</li><li><b>기술</b>: 원본 맵에서 연구 완료된 기술은 시작부터 사용하며, 유닛이 전투 중 자동으로 사용합니다.</li><li><b>전장 보기</b>: 넓은 중앙 언덕 입구를 지나 전초기지를 먼저 공격하고, 전초기지가 무너지면 상대 본진으로 진격합니다.</li><li><b>고지 전투</b>: 언덕 아래 지상 원거리 공격은 위쪽 적에게 빗나갈 수 있습니다. 근접·공중 공격은 고지 회피 판정을 받지 않습니다.</li><li><b>카메라</b>: 하단 미니맵을 누르거나 끌어 이동하고 두 손가락으로 확대·축소합니다. 하단 버튼으로 본진과 전선을 빠르게 볼 수 있습니다.</li><li><b>자원</b>: 미네랄 300으로 시작하고 약 1.34초마다 수입을 받습니다. 가스 시설 0~5개 수입은 10·12·15·18·22·26입니다. 가스 시설은 테란·프로토스 600, 저그 500 미네랄이며, 두 번째부터 투자 단계에 따라 수입이 잠시 중단됩니다. 출격과 자원 수입은 독립적으로 진행됩니다.</li></ul><p>전투와 출격은 자동으로 진행됩니다. 생산 공간에서 건물을 배치하고 테크를 올리세요. 앱을 백그라운드로 보내면 전투가 멈추며, 돌아와서 전장 재개를 눌러 이어갑니다.</p><button class="primary" id="helpDone">확인</button>`);$('helpDone').onclick=closeModal}$('help').onclick=help;
function settingsModal(){modal('settings',`<div class="eyebrow">COMMAND CENTER</div><h2>설정</h2>${[['배경음악','bgm'],['효과음','sfx'],['유닛 음성','voice']].map(([label,key])=>`<label>${label}<input id="vol-${key}" type="range" min="0" max="1" step=".01" value="${settings[key]}"></label>`).join('')}<label>렌더링<select id="quality"><option value="auto" ${settings.quality==='auto'?'selected':''}>자동 · 선명하게</option><option value="low" ${settings.quality==='low'?'selected':''}>절전 · 낮은 해상도</option></select></label><div class="row"><button id="pause">${pausedBefore?'전투 재개':'일시 정지 유지'}</button><button id="manual">조작 방법</button><button id="leave">작전 나가기</button></div><p>미니스타 ${VERSION} · 리마스터 ${data.sourceBuild}<br>설정과 전투 기록은 기기에 저장됩니다.</p>`);for(const key of ['bgm','sfx','voice'])$('vol-'+key).oninput=e=>{settings[key]=Number(e.target.value);save('settings',settings);setAudioVolume(key,settings[key])};$('quality').onchange=e=>{settings.quality=e.target.value;save('settings',settings);resize()};$('pause').onclick=()=>{pausedBefore=!pausedBefore;closeModal()};$('manual').onclick=()=>{const p=pausedBefore;help();pausedBefore=p};$('leave').onclick=()=>{modalKind='';$('modal').hidden=true;stopMusic();stopTransientSounds();audioContext?.suspend().catch(()=>{});newBattle()}}$('settings').onclick=settingsModal;
function resultModal(r){modal('result',`<div class="eyebrow">OPERATION COMPLETE</div><h2 style="font-size:32px;color:${r.win?'#e4d28b':'#de987f'}">${r.win?'승리':'패배'}</h2><p>${r.reason}</p><div class="stats">${[['전투 시간',Math.floor(r.time/60)+':'+String(Math.floor(r.time%60)).padStart(2,'0')],['생산한 병력',r.produced+'기'],['생존 병력',r.survivors+'기'],['적 처치',r.kills+'기'],['아군 손실',r.losses+'기'],['총 피해량',Math.round(r.damage).toLocaleString()]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><button id="retry" class="primary">다시 출전하기</button><button id="toTitle" class="secondary">종족 선택으로</button>`);$('retry').onclick=()=>{modalKind='';$('modal').hidden=true;newBattle();battle.begin()};$('toTitle').onclick=()=>{modalKind='';$('modal').hidden=true;newBattle()}}
$('records').onclick=()=>{const records=read('records',[]);modal('records',`<div class="eyebrow">BATTLE LOG</div><h2>전투 기록</h2>${records.length?records.slice(0,20).map(r=>`<div class="log"><span>${r.win?'승리':'패배'} · ${labels[r.race]}<br><small>${new Date(r.date).toLocaleDateString('ko-KR')} · ${Math.floor(r.time/60)}분 ${Math.floor(r.time%60)}초</small></span><b>${r.kills} 처치</b></div>`).join(''):'<p>첫 작전에 출전해 기록을 남겨보세요.</p>'}`)};
function raceUI(){document.body.dataset.race=race;for(const el of document.querySelectorAll('[data-race]')){el.classList.toggle('active',el.dataset.race===race);el.setAttribute('aria-pressed',el.dataset.race===race)}$('raceBriefing').textContent={terran:'테란 원정대의 지휘권이 이양되었습니다.',zerg:'군단이 당신의 명령을 기다립니다.',protoss:'기사단이 당신의 지휘를 기다립니다.'}[race];$('gasIcon').src=iconResource({terran:1,zerg:2,protoss:3}[race]);$('supplyIcon').src=iconResource({terran:4,zerg:5,protoss:6}[race])}const iconResource=n=>'assets/icons/resource_'+String(n).padStart(3,'0')+'.png';for(const el of document.querySelectorAll('[data-race]'))el.onclick=()=>{race=el.dataset.race;commandPage='basic';commandPanelSignature='';closeCommandTooltip();save('race',race);raceUI();scheduleOptionalWarmup()};$('deploy').onclick=()=>{newBattle();battle.begin()};
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
  if('caches'in window)await Promise.all((await caches.keys()).filter(key=>key.startsWith('ministar-pages-')).map(key=>caches.delete(key)));
  if(retired&&navigator.serviceWorker.controller){location.reload();return false}
 }catch(error){console.warn('Legacy game cache cleanup:',error)}
 return true;
}
async function fetchJson(url,message){let response=await resourceStore.response(url);if(!response.ok)throw Error(message);try{return await response.json()}catch(error){await resourceStore.invalidate(url);response=await resourceStore.response(url);if(!response.ok)throw Error(message);try{return await response.json()}catch{throw error}}}
async function boot(){if(bootInProgress)return;bootInProgress=true;const retry=$('bootRetry');if(retry)retry.hidden=true;try{
 if(!await retireOfflineStorage())return;
 const cacheState=await resourceStore.init();if(!cacheState.manifest)console.warn('Resource manifest unavailable; continuing with online requests only');
 if(!uiEnhanced){enhanceSelects();uiEnhanced=true}
 const terrainPromise=loadImage('assets/terrain.webp'),fieldPromise=loadImage('ds-assets/battlefield.webp?v=0.16.25');
 const [base,extra,constructionGraphics,turretGraphics,destructionGraphics,originalAnimations,spellVisuals]=await Promise.all([
  fetchJson('assets/data.json','전투 데이터를 읽을 수 없습니다.'),
  fetchJson('rts-data.json?v=0.16.25','생산 데이터를 읽을 수 없습니다.'),
  fetchJson('construction-data.json?v=0.16.25','건설 그래픽을 읽을 수 없습니다.'),
  fetchJson('turret-data.json?v=0.16.25','포탑 그래픽을 읽을 수 없습니다.'),
  fetchJson('destruction-data.json?v=0.16.25','건물 파괴 그래픽을 읽을 수 없습니다.'),
  fetchJson('original-animation-data.json?v=0.16.25','원본 애니메이션을 읽을 수 없습니다.'),
  fetchJson('spell-visual-data.json?v=0.16.25','원본 주문 효과 데이터를 읽을 수 없습니다.')
 ]);
 data=base;spellVisualData=spellVisuals;for(const [id,size]of Object.entries(spellVisualData.unitOverlaySizes||{}))if(data.units[id])data.units[id].spellOverlaySize=size;warmupGraphics=[constructionGraphics,turretGraphics,destructionGraphics];clearMediaSession();Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,constructionGraphics,turretGraphics,destructionGraphics,originalAnimations);
 for(const [key,spec]of Object.entries(extra.research))Object.assign(RESEARCH[key],spec);
 startupMark('metadata-ready');startupMeasure('boot-to-metadata','boot-start','metadata-ready');
 const [,worldImages]=await Promise.all([warmImageUrls(criticalSceneImageUrls()),Promise.all([terrainPromise,fieldPromise])]);
 [terrain,desertField]=worldImages;if(!desertField)console.warn('Desert field texture unavailable; rendering flat sand field');if(!terrain)throw Error('지형 이미지를 읽을 수 없습니다.');
 newBattle();raceUI();$('boot').hidden=true;startupMark('title-ready');startupMeasure('boot-to-title','boot-start','title-ready');requestAnimationFrame(render);
 }catch(e){$('bootText').textContent=(e instanceof ResourceVersionError?e.message:e.message+' · start.sh로 서버를 실행한 뒤 다시 시도하세요.');if(retry)retry.hidden=false;console.error(e)}finally{bootInProgress=false}}
if($('bootRetry'))$('bootRetry').onclick=()=>{if(!$('boot').hidden){failedImages.clear();$('bootText').textContent='전장을 다시 준비하고 있습니다…';void boot()}};
void boot();

