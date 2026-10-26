export function commandSlots(layout,race,page,availableTypes){
 const ids=layout?.[race]?.[page];
 if(!Array.isArray(ids)||ids.length!==9)throw new Error(`Invalid ${race} ${page} command layout`);
 const available=new Set(availableTypes||[]);
 return ids.map(id=>id==='cancel'?'cancel':Number.isInteger(id)&&available.has(id)?id:null);
}

export function creepNeighborMask(field,x,y,neighborOrder){
 let mask=0;
 for(let index=0;index<neighborOrder.length;index++){
  const [dx,dy]=neighborOrder[index];
  if(field.hasTile(x+dx,y+dy))mask|=1<<index;
 }
 return mask;
}

export function creepEdgeFrameIndex(field,x,y,edgeMap){
 if(field.hasTile(x,y))return null;
 return edgeMap.frames[creepNeighborMask(field,x,y,edgeMap.neighborOrder)]??null;
}

export function minimapTransform(width,height,bounds,margin=2){
 if(!(width>0&&height>0&&bounds?.width>0&&bounds?.height>0))throw new RangeError('Minimap dimensions and world bounds must be positive');
 const scale=Math.min(Math.max(0,width-2*margin)/bounds.width,Math.max(0,height-2*margin)/bounds.height);
 const drawnWidth=bounds.width*scale,drawnHeight=bounds.height*scale;
 return{bounds,scale,drawnWidth,drawnHeight,offsetX:(width-drawnWidth)/2,offsetY:(height-drawnHeight)/2};
}

export function minimapWorldPoint(x,y,width,height,bounds,margin=2){
 const layout=minimapTransform(width,height,bounds,margin);
 if(x<layout.offsetX||y<layout.offsetY||x>layout.offsetX+layout.drawnWidth||y>layout.offsetY+layout.drawnHeight)return null;
 return{x:bounds.x+(x-layout.offsetX)/layout.scale,y:bounds.y+(y-layout.offsetY)/layout.scale};
}
