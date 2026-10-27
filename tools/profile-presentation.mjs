// Isolate render-time cloak/detector lookup without an Android FPS claim.
// node tools/profile-presentation.mjs [/path/to/version] [count] [frames]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=path.resolve(process.argv[2]||'.'),count=Number(process.argv[3]||600),frames=Number(process.argv[4]||90);
const {Battle}=await import(pathToFileURL(path.join(root,'dist/autobattle.js')));
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const data=read('dist/assets/data.json'),extra=read('dist/rts-data.json');Object.assign(data.units,extra.units);
const battle=new Battle(data,{race:'terran',enemyRace:'terran',random:()=>.5});battle.begin();
for(let i=0;i<count;i++)battle.create(i%3===0?0:65,i%2,160+(i%20)*45,700+Math.floor(i/20)*15);
const targets=battle.units.filter(u=>u.team===1&&!u.def.building&&!u.productionOnly);
let visits=0;const originals=battle.units;
battle.units=new Proxy(originals,{get(target,key,receiver){
 if(key===Symbol.iterator)return function*(){for(const value of target){visits++;yield value}};
 return Reflect.get(target,key,receiver);
}});
battle.spatial=null;
const values=[],results=[];
for(let frame=0;frame<frames;frame++){
 const start=performance.now();let seen=0;
 const query=()=>{for(const u of targets)if(battle.canSee(0,u))seen++};
 if(battle.withPresentationQueries)battle.withPresentationQueries(query);else query();
 values.push(performance.now()-start);results.push(seen);
}
values.sort((a,b)=>a-b);
if(results.some(v=>v!==results[0]))throw Error('inconsistent visibility');
console.log(JSON.stringify({root,count,frames,visiblePerFrame:results[0],unitArrayVisits:visits,visitsPerFrame:visits/frames,medianMs:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)]}));
