// Brood War placement helpers use build tiles, not sprite bounds or screen scale.
export const PSI_FIELD_ROWS=Object.freeze([8,8,7,6,3]);

export function inPsionicMatrixRange(point,pylon){
 const dx=Math.trunc(point.x)-Math.trunc(pylon.x),dy=Math.trunc(point.y)-Math.trunc(pylon.y);
 let ax=Math.abs(dx),ay=Math.abs(dy);
 if(ax>=256||ay>=160)return false;
 if(dx<0)ax--;
 if(dy<0)ay--;
 const row=Math.floor(ay/32),column=Math.floor(ax/32);
 return row<PSI_FIELD_ROWS.length&&column<PSI_FIELD_ROWS[row];
}

export function footprintTiles(point,size,tileSize=32){
 const [width,height]=size||[tileSize,tileSize],left=Math.floor((point.x-width/2)/tileSize),top=Math.floor((point.y-height/2)/tileSize),cols=Math.max(1,Math.round(width/tileSize)),rows=Math.max(1,Math.round(height/tileSize)),tiles=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)tiles.push({x:left+x,y:top+y});
 return tiles;
}

export function psiFieldTiles(pylon,tileSize=32){
 const tiles=[],minX=Math.floor((pylon.x-256-16)/tileSize),maxX=Math.ceil((pylon.x+256-16)/tileSize),minY=Math.floor((pylon.y-160-16)/tileSize),maxY=Math.ceil((pylon.y+160-16)/tileSize);
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const center={x:x*tileSize+tileSize/2,y:y*tileSize+tileSize/2};
  if(inPsionicMatrixRange(center,pylon))tiles.push({x,y});
 }
 return tiles;
}

export function overlapsFootprints(a,aSize,b,bSize){
 return Math.abs(a.x-b.x)<(aSize[0]+bSize[0])/2&&Math.abs(a.y-b.y)<(aSize[1]+bSize[1])/2;
}
