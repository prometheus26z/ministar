import {DESERT_STRIKE} from './desert-strike-data.js?v=0.16.24';

export function formatElapsedTime(value){
 const seconds=Number.isFinite(value)?Math.max(0,Math.floor(value+1e-9)):0;
 return`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}

export function healthBarPixels(nominal){
 let original=Math.max(19,Math.min(81,Math.floor(nominal)));
 original-=((original-1)%3);
 return Math.round(Math.max(19,original)*.85);
}

const bodyBounds=new WeakMap();
function buildingBodyBounds(graphic,unit){
 if(graphic&&bodyBounds.has(graphic))return bodyBounds.get(graphic);
 const indices=(graphic?.tracks?.idle?.frames||[]).map(frame=>frame[0]).filter(Number.isInteger),frames=[...new Set(indices.length?indices:[0])].map(i=>graphic?.frames?.[i]).filter(f=>f?.[4]>0&&f?.[5]>0);
 let bounds;
 if(frames.length){
  // Match sprite(): frame offsets and dimensions are rendered at half scale.
  const left=Math.min(...frames.map(f=>(f[2]-graphic.canvas[0]/2)*.5)),right=Math.max(...frames.map(f=>(f[2]-graphic.canvas[0]/2+f[4])*.5));
  bounds={width:right-left,center:(left+right)/2,bottom:Math.max(...frames.map(f=>(f[3]-graphic.canvas[1]/2+f[5])*.5))};
 }else bounds={width:unit.def.footprint?.[0]||unit.r*2,center:0,bottom:unit.r};
 if(graphic)bodyBounds.set(graphic,bounds);return bounds;
}
export function healthBarLayout(unit,graphic,zoom){
 let width,center=0,bottom=unit.r;
 if(unit.def.building){const bounds=buildingBodyBounds(graphic,unit);width=bounds.width*.85;center=bounds.center;bottom=bounds.bottom}
 else width=healthBarPixels(graphic?.healthBarSize||unit.def.healthBarSize||unit.def.footprint?.[0]||unit.r*2);
 return{pixels:width*zoom,width,x:unit.x+center-width/2,y:unit.y+bottom+5};
}

export function healthBarFillWidth(percent,width){
 if(percent<=0||width<=0)return 0;
 let filled=Math.floor(width*Math.min(100,percent)/100);
 if(filled<3)filled=Math.min(width,3);
 else if(filled%3){if(filled%3>1)filled+=3-filled%3;else filled-=filled%3}
 return Math.min(width,filled);
}

export function formatSupply(used,cap){return `${Math.ceil(Math.max(0,used))}/${Math.ceil(Math.max(0,cap))}`}

export function constructionVisual(unit,data){
 const task=unit.construction;
 if(!unit.alive||!unit.def.building||!task?.started)return null;
 const progress=Math.max(0,Math.min(1,task.time/task.total));
 if(unit.def.race==='terran'){
  const [width,height]=unit.def.footprint||[96,64],generic=width>=128?325:width>=96?327:329;
  const own=data.graphics[unit.def.image];
  if(progress>=.75&&own?.frames.length>1)return{image:unit.def.image,frame:1+Math.min(own.frames.length===5?3:0,Math.floor((progress-.75)*16)),progress};
  return{image:generic,frame:Math.min(2,Math.floor(progress/.25)),progress};
 }
 if(unit.def.race==='zerg'){
  const stage=Math.min(2,Math.floor(progress*3)),start=[1,12,21][stage];
  return{image:102,frame:start+Math.floor(task.time*12)%7,progress};
 }
  const buildFrames=Math.max(1,Number(data.units[unit.type]?.buildTime)||task.total),anchorFrames=4,textureFrames=20,flashFrames=48,frame=progress*(buildFrames+anchorFrames+textureFrames+flashFrames);
  if(frame<buildFrames)return{warp:true,phase:'anchor',anchorAction:'idle',anchorTime:frame/24,progress,sourceFrame:frame};
  if(frame<buildFrames+anchorFrames)return{warp:true,phase:'anchor',anchorAction:'anchorSpecial',anchorTime:(frame-buildFrames)/24,progress,sourceFrame:frame};
  if(frame<buildFrames+anchorFrames+textureFrames)return{warp:true,phase:'texture',textureFrame:Math.min(19,Math.floor(frame-buildFrames-anchorFrames)),progress,sourceFrame:frame};
  const flashFrame=Math.min(flashFrames-1,Math.floor(frame-buildFrames-anchorFrames-textureFrames));
  return{warp:true,phase:'flash',textureFrame:Math.max(0,19-flashFrame*20/flashFrames),flashFrame,flashProgress:Math.min(1,flashFrame/(flashFrames-1)),progress,sourceFrame:frame};
}

export function waveDescription(type,groups,data){
 const id=Number(type);
 if(!groups?.length)return DESERT_STRIKE.buildingRoles?.[id]||'출격 없음';
 return groups.map(({unit,count})=>`${data.units[unit].name} ${count}기`).join(' · ');
}

export function buildingDestruction(unit){
 const [w,h]=unit.def.footprint||[64,64],large=w*h>=8192;
 const race=unit.def.race;
 return{explosion:race==='zerg'?60:race==='protoss'?215:334,rubble:race==='zerg'?(large?111:110):race==='protoss'?(large?217:216):(large?336:335)};
}
