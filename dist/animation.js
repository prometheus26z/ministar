const TRACKS=Object.freeze({
 walk:['walk','move','fly'],
 attack:['attack','groundAttack'],
 airAttack:['airAttack','attack','groundAttack'],
 death:['death','dead'],
 burrow:['burrow','idle'],
 unburrow:['unburrow','burrow','idle'],
 idle:['idle','stand','built']
});
export function trackFor(g,action,context={}){
 const tracks=g?.tracks||{},candidates=TRACKS[action]||[action];
 const track=(context.trackOverride&&tracks[context.trackOverride])||candidates.map(key=>tracks[key]).find(Boolean)||tracks.idle||tracks.built||null;
 return track?.rangeVariants&&context.targetDistance<=track.rangeVariants.threshold?track.rangeVariants.near:track;
}
function frameTicks(track){
 if((track?.frames||[]).some(f=>f[2]?.randomWait))return track.frames.reduce((n,f)=>n+(f[2]?.randomWait?.[1]??f[1]),0);
 const declared=Number(track?.ticks);
 if(Number.isFinite(declared)&&declared>0)return declared;
 return (track?.frames||[]).reduce((sum,item)=>sum+(Number.isFinite(Number(item?.[1]))&&Number(item[1])>0?Number(item[1]):0),0);
}
export function transitionSeconds(g,action,fallback=.45,seed=0){
 const track=trackFor(g,action);if(!track)return fallback;
 if(Number.isFinite(track.transitionTicks))return Math.max(1,track.transitionTicks)/24;
 const seededTicks=timedFrames(g,track,seed).reduce((sum,item)=>sum+item.duration,0);
 if(track.transitionSignal===4)return Math.max(1,seededTicks)/24;
 const durations=(track.frames||[]).map(item=>Number(item?.[1])).filter(n=>Number.isFinite(n)&&n>0);
 let ticks=frameTicks(track);
 // Some Remastered loop tracks append a long final hold after the playable
 // transform frames. Do not mistake that idle hold for transition time.
 if(track.loop&&durations.length>1){
  const active=durations.slice(0,-1).sort((a,b)=>a-b),median=active[Math.floor(active.length/2)]||1,last=durations.at(-1);
  if(last>=Math.max(8,median*8))ticks=durations.slice(0,-1).reduce((sum,n)=>sum+n,0);
 }
 return Math.max(1,ticks)/24;
}
export function steadyStartSeconds(g,action='idle',context={}){
 const track=trackFor(g,action,context);if(!track?.loop)return 0;
 const timeline=timedFrames(g,track,context.seed),start=Math.max(0,Math.min(timeline.length,track.loopStart||0));
 return timeline.slice(0,start).reduce((sum,item)=>sum+item.duration,0)/24;
}
export function layeredActionSeconds(graphics,id,action,fallback=0){
 const visiting=new Set();
 const visit=(image,depth=0,clipAction=action)=>{
  if(depth>8||visiting.has(image))return 0;
  const g=graphics?.[image];if(!g)return 0;
  const track=trackFor(g,clipAction);if(!track)return 0;
  visiting.add(image);
  let seconds=frameTicks(track)/24;
  const events=track.overlayEvents||(track.overlays||[]).map(image=>({image,tick:0}));
  for(const event of events)seconds=Math.max(seconds,(event.tick||0)/24+visit(event.image,depth+1,'idle'));
  visiting.delete(image);return seconds;
 };
 const seconds=visit(id);return seconds>0?seconds:fallback;
}
function timedFrames(g,track,seed=0){
 return(track?.frames||[]).map((item,index)=>{
  let duration=Number(item[1]);const range=item[2]?.randomWait;
  if(range){const hash=((Math.imul((seed|0)^g.sourceImage,1103515245)+Math.imul(index+1,12345))>>>0);duration=range[0]+hash%(range[1]-range[0]+1)}
  const inheritFrame=!!item[2]?.inheritFrame;
  return{frame:item[0]===null?null:Number(item[0]),inheritFrame,duration,hidden:!!item[2]?.hidden};
 }).filter(f=>(Number.isFinite(f.frame)||f.inheritFrame)&&Number.isFinite(f.duration)&&f.duration>0);
}
export function pose(g,action,time,direction,context={}){
 const track=trackFor(g,action,context),frames=Array.isArray(g?.frames)?g.frames:[];
 if(!frames.length)return{frame:0,flip:false};
 const timeline=timedFrames(g,track,context.seed),total=timeline.reduce((n,f)=>n+f.duration,0),elapsed=Math.max(0,Number(time)||0)*24;
 let tick=elapsed,frame=Number.isInteger(context.inheritedFrame)?context.inheritedFrame:0,hidden=!!track?.ended&&elapsed>=total;
 if(track?.loop&&total>0){const start=Math.max(0,Math.min(timeline.length-1,track.loopStart||0)),intro=timeline.slice(0,start).reduce((n,f)=>n+f.duration,0),cycle=total-intro;if(context.skipSpawnIntro&&action==='idle')tick=Math.max(tick,intro);if(tick>=intro&&cycle>0)tick=intro+(tick-intro)%cycle}
 else tick=Math.min(tick,Math.max(0,total-.001));
 for(const item of timeline){if(!item.inheritFrame&&Number.isFinite(item.frame))frame=item.frame;if(tick<item.duration){hidden||=item.hidden;break}tick-=item.duration}
 let facing=Number.isInteger(track?.fixedDirection)?track.fixedDirection:direction;
 facing=((Math.floor(Number(facing)||0)%32)+32)%32;const flip=!!g?.turns&&facing>16;
 if(g?.turns)frame+=facing>16?32-facing:facing;
 if(track?.followParent&&Number.isInteger(context.parentFrame))frame=context.parentFrame;
 const result={frame:Math.max(0,Math.min(frames.length-1,frame)),flip};if(hidden)result.hidden=true;return result;
}
export function teamImage(g,team){
 const images=g?.images||{};
 return images[team===1?'red':'blue']||images.blue||images.red||Object.values(images)[0]||null;
}
