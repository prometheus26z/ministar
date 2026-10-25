const TRACKS=Object.freeze({
 walk:['walk','move','fly'],
 attack:['attack','groundAttack'],
 airAttack:['airAttack','attack','groundAttack'],
 death:['death','dead'],
 burrow:['burrow','idle'],
 unburrow:['unburrow','burrow','idle'],
 idle:['idle','stand','built']
});
export function pose(g,action,time,direction){
 const tracks=g?.tracks||{},candidates=TRACKS[action]||[action],track=candidates.map(key=>tracks[key]).find(Boolean)||tracks.idle||tracks.built;
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
