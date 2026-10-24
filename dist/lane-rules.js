import {DESERT_STRIKE} from './desert-strike-data.js?v=0.11.0';
export {DESERT_STRIKE};
export const WAVE_SECONDS=DESERT_STRIKE.waveGameSeconds/1.5;
export const INCOME_SECONDS=DESERT_STRIKE.incomeCycles*DESERT_STRIKE.hyperCycleSeconds;
export const PRODUCTION_OFFSET=2304;
export const PRODUCTION_HEIGHT=2048;
export const PRODUCTION_GROUND_WIDTH=Math.round(1280*.8);
export const PRODUCTION_GROUND_HEIGHT=Math.round(PRODUCTION_HEIGHT*.6);
export const PRODUCTION_GROUND_X=Math.round((1280-PRODUCTION_GROUND_WIDTH)/2);
export const PRODUCTION_GROUND_Y=Math.ceil((PRODUCTION_HEIGHT-PRODUCTION_GROUND_HEIGHT)/2/32)*32;
export const GAS_SLOT_Y=Math.ceil(PRODUCTION_GROUND_Y/32)*32+32;
export const GAS_SLOT_X=Object.freeze([256,448,640,832,1024]);
export const GAS_BUILDING=Object.freeze({terran:110,zerg:149,protoss:157});

export const BUILDING_COSTS=Object.freeze(DESERT_STRIKE.costs);
export const BUILDING_WAVES=Object.freeze(Object.fromEntries(Object.entries(DESERT_STRIKE.waves).map(([type,groups])=>[type,Object.freeze(groups.map(([unit,count])=>Object.freeze({unit,count})))])));
export const TECH_IDS=Object.freeze({stim:0,lockdown:1,emp:2,mine:3,siege:5,irradiate:7,yamato:8,cloak:9,ghostCloak:10,burrow:11,broodlings:13,plague:15,consume:16,ensnare:17,storm:19,hallucinate:20,recall:21,stasis:22,restore:24,web:25,mind:27,flare:30,maelstrom:31,lurker:32});
export function constructionSeconds(data,type){return Math.max(.2,(Number(data?.units?.[type]?.buildTime)||40)*.05)}
export function buildingCost(race,type){const cost=BUILDING_COSTS[type];if(!cost)throw Error('Missing Desert Strike building cost: '+type);return [...cost]}
