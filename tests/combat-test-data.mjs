import fs from 'node:fs';
import {Battle as LaneBattle} from '../dist/autobattle.js';

export function combatData(){
 const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url)));
 const extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
 Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
 Object.assign(data.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));
 return data;
}

export function laneBattle(options={}){
 const battle=new LaneBattle(combatData(),{race:'terran',enemyRace:'terran',random:()=>0,...options});
 battle.begin();battle.botStep=()=>{};battle.waveClock=1e9;battle.map.rocks=[];battle.canSee=()=>true;
 return battle;
}

export function emptyLaneBattle(options={}){
 const battle=laneBattle(options);battle.units=[];battle.nextId=1;return battle;
}
