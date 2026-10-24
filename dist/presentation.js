export function healthBarPixels(nominal){
 let original=Math.max(19,Math.min(81,Math.floor(nominal)));
 original-=((original-1)%3);
 return Math.round(Math.max(19,original)*.85);
}

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
 return{image:208,warp:true,progress};
}
