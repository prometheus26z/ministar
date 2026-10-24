export const WAVE_SECONDS=25;
export const PRODUCTION_OFFSET=2304;
export const PRODUCTION_HEIGHT=2048;
export const GAS_SLOT_Y=256;
export const GAS_SLOT_X=Object.freeze([128,384,640,896,1152]);
export const GAS_BUILDING=Object.freeze({terran:110,zerg:149,protoss:157});

// A completed building always contributes this fixed unit group to the next wave.
// Support, supply, research, defense and addon structures do not create units.
export const BUILDING_WAVES=Object.freeze({
 111:Object.freeze({unit:0,count:2}),
 113:Object.freeze({unit:2,count:1}),
 114:Object.freeze({unit:8,count:1}),
 142:Object.freeze({unit:37,count:3}),
 135:Object.freeze({unit:38,count:1}),
 136:Object.freeze({unit:46,count:1}),
 137:Object.freeze({unit:44,count:1}),
 138:Object.freeze({unit:45,count:1}),
 140:Object.freeze({unit:39,count:1}),
 141:Object.freeze({unit:43,count:1}),
 160:Object.freeze({unit:65,count:1}),
 155:Object.freeze({unit:69,count:1}),
 165:Object.freeze({unit:67,count:1}),
 167:Object.freeze({unit:70,count:1})
});

export function constructionSeconds(data,type){
 const nativeSeconds=Number(data?.units?.[type]?.buildTime)||40;
 return Math.max(.2,nativeSeconds*.05);
}

export function buildingCost(race,type,data){
 if(Number(type)===GAS_BUILDING[race])return[500,0];
 const cost=data?.units?.[type]?.cost||[0,0];
 return[cost[0],cost[1]];
}
