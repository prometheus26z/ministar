import {DESERT_STRIKE} from './desert-strike-data.js?v=0.16.17';
export {DESERT_STRIKE};
export const WAVE_SECONDS=DESERT_STRIKE.waveGameSeconds/1.5;
export const INCOME_SECONDS=DESERT_STRIKE.incomeCycles*DESERT_STRIKE.hyperCycleSeconds;
export const PRODUCTION_OFFSET=2304;
export const PRODUCTION_HEIGHT=2048;
export const PRODUCTION_GROUND_WIDTH=DESERT_STRIKE.map.productionRegion.tileWidth*32;
export const PRODUCTION_GROUND_HEIGHT=DESERT_STRIKE.map.productionRegion.tileHeight*32;
export const PRODUCTION_GROUND_X=96;
export const PRODUCTION_GROUND_Y=736;
export const GAS_SLOT_Y=Math.ceil(PRODUCTION_GROUND_Y/32)*32+32;
export const GAS_SLOT_X=Object.freeze(DESERT_STRIKE.map.gasSlots.map(([x])=>PRODUCTION_GROUND_X+x));
export function gasSlots(team=0){return DESERT_STRIKE.map.gasSlots.map(([x,y],slot)=>({slot,x:team?1280-PRODUCTION_GROUND_X-x:PRODUCTION_GROUND_X+x,y:PRODUCTION_OFFSET+PRODUCTION_GROUND_Y+y}))}
export function productionTileAllowed(x,y,team=0){
 const region=DESERT_STRIKE.map.productionRegion,localX=(team?1280-x:x)-PRODUCTION_GROUND_X,localY=y-PRODUCTION_OFFSET-PRODUCTION_GROUND_Y;
 const tx=Math.floor(localX/32),ty=Math.floor(localY/32);
 return tx>=0&&ty>=0&&tx<region.tileWidth&&ty<region.tileHeight&&!!region.buildable[ty*region.tileWidth+tx];
}
export const GAS_BUILDING=Object.freeze({terran:110,zerg:149,protoss:157});
export const SOURCE_PLAYER_BY_COMMANDER=Object.freeze({0:0,1:1,2:2,3:4,4:5,5:6});
export function isLaneBuildingAvailable(type,commanderId=0){
 const player=SOURCE_PLAYER_BY_COMMANDER[commanderId],catalog=DESERT_STRIKE.buildingCatalog?.[Number(type)]?.availableByPlayer;
 return Number.isInteger(player)&&Array.isArray(catalog)&&catalog.length===12&&catalog[player]===true;
}

export const BUILDING_COSTS=Object.freeze(DESERT_STRIKE.costs);
export const BUILDING_WAVES=Object.freeze(Object.fromEntries(Object.entries(DESERT_STRIKE.waves).map(([type,groups])=>[type,Object.freeze(groups.map(([unit,count])=>Object.freeze({unit,count})))])));
export function spawningPoolYield(completedPools,team){const count=BUILDING_WAVES[142][0].count,threshold=DESERT_STRIKE.poolBonusThreshold[team];return count+(completedPools+1>=threshold?DESERT_STRIKE.poolBonusCount-count:0)}
export const TECH_IDS=Object.freeze({stim:0,lockdown:1,emp:2,mine:3,siege:5,irradiate:7,yamato:8,cloak:9,ghostCloak:10,burrow:11,broodlings:13,plague:15,consume:16,ensnare:17,storm:19,hallucinate:20,recall:21,stasis:22,restore:24,web:25,mind:27,flare:30,maelstrom:31,lurker:32});
export function constructionSeconds(data,type){return Math.max(.2,(Number(data?.units?.[type]?.buildTime)||40)*.05)}
export function buildingCost(race,type){const cost=BUILDING_COSTS[type];if(!cost)throw Error('Missing Desert Strike building cost: '+type);return [...cost]}
