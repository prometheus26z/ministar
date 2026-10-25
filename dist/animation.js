const TRACKS=Object.freeze({
 walk:['walk','move','fly'],
 attack:['attack','groundAttack'],
 airAttack:['airAttack','attack','groundAttack'],
 death:['death','dead'],
 burrow:['burrow','idle'],
 unburrow:['unburrow','burrow','idle'],
 idle:['idle','stand','built']
});
export function trackFor(g,action){
 const tracks=g?.tracks||{},candidates=TRACKS[action]||[action];
 return candidates.map(key=>tracks[key]).find(Boolean)||tracks.idle||tracks.built||null;
}
function frameTicks(track){
 const declared=Number(track?.ticks);
 if(Number.isFinite(declared)&&declared>0)return declared;
 return (track?.frames||[]).reduce((sum,item)=>sum+(Number.isFinite(Number(item?.[1]))&&Number(item[1])>0?Number(item[1]):0),0);
}
export function transitionSeconds(g,action,fallback=.45){
 const track=trackFor(g,action);if(!track)return fallback;
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
export function layeredActionSeconds(graphics,id,action,fallback=0){
 const visiting=new Set();
 const visit=(image,depth=0)=>{
  if(depth>8||visiting.has(image))return 0;
  const g=graphics?.[image];if(!g)return 0;
  const track=trackFor(g,action);if(!track)return 0;
  visiting.add(image);
  let seconds=frameTicks(track)/24;
  for(const overlay of track.overlays||[])seconds=Math.max(seconds,visit(overlay,depth+1));
  visiting.delete(image);return seconds;
 };
 const seconds=visit(id);return seconds>0?seconds:fallback;
}
export function pose(g,action,time,direction){
 const track=trackFor(g,action);
 const frames=Array.isArray(g?.frames)?g.frames:[];if(!frames.length)return{frame:0,flip:false};
 let frame=0;
 if(track){
  const ticks=Math.max(1,Number(track.ticks)||1),elapsed=Math.max(0,Number(time)||0)*24;
  let tick=track.loop?elapsed%ticks:Math.min(elapsed,Math.max(0,ticks-.001));
  for(const item of track.frames||[]){
   const index=Number(item?.[0]),duration=Number(item?.[1]);if(!Number.isFinite(index)||!Number.isFinite(duration)||duration<=0)continue;
   frame=index;if(tick<duration)break;tick-=duration;
  }
 }
 const facing=((Math.floor(Number(direction)||0)%32)+32)%32,flip=!!g?.turns&&facing>16;
 if(g?.turns)frame+=facing>16?32-facing:facing;
 return{frame:Math.max(0,Math.min(frames.length-1,frame)),flip};
}
export function teamImage(g,team){
 const images=g?.images||{};
 return images[team===1?'red':'blue']||images.blue||images.red||Object.values(images)[0]||null;
}
