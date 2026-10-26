export const MOVEMENT_EPSILON=1e-4;

export function segmentAabbEntry(from,to,box){
 const dx=to.x-from.x,dy=to.y-from.y;let lo=0,hi=1;
 for(const [p,q]of [[-dx,from.x-box.left],[dx,box.right-from.x],[-dy,from.y-box.top],[dy,box.bottom-from.y]]){
  if(Math.abs(p)<MOVEMENT_EPSILON){if(q<0)return null;continue}
  const t=q/p;if(p<0){if(t>hi)return null;if(t>lo)lo=t}else{if(t<lo)return null;if(t<hi)hi=t}
 }
 return hi>=lo&&hi>=0&&lo<=1?Math.max(0,lo):null;
}

export function sweptCircleEntry(from,to,center,radius){
 const dx=to.x-from.x,dy=to.y-from.y,mx=from.x-center.x,my=from.y-center.y;
 const c=mx*mx+my*my-radius*radius,a=dx*dx+dy*dy;
 if(a<MOVEMENT_EPSILON)return null;
 const b=2*(mx*dx+my*dy);
 if(c< -MOVEMENT_EPSILON){
  // Existing overlaps are never resolved by moving the other unit. Permit
  // only this unit's own motion away from the blocker.
  return mx*dx+my*dy>=-MOVEMENT_EPSILON?null:0;
 }
 if(c<=MOVEMENT_EPSILON)return b< -MOVEMENT_EPSILON?0:null;
 const discriminant=b*b-4*a*c;if(discriminant<0)return null;
 const t=(-b-Math.sqrt(discriminant))/(2*a);
 return t>=-MOVEMENT_EPSILON&&t<=1+MOVEMENT_EPSILON?Math.max(0,t):null;
}

export function octileDistance(dx,dy){
 const x=Math.abs(dx),y=Math.abs(dy),small=Math.min(x,y),large=Math.max(x,y);
 return large+(Math.SQRT2-1)*small;
}
