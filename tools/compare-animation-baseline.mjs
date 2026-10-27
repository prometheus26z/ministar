// Read-only pose oracle across the original and optimized animation modules.
// node tools/compare-animation-baseline.mjs /path/to/baseline
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const roots=[path.resolve(process.argv[2]||'/tmp/ministar-before-50817d6'),path.resolve('.')];
const versions=await Promise.all(roots.map(async root=>{
 const api=await import(pathToFileURL(path.join(root,'dist/animation.js')));
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
 const data=read('dist/assets/data.json'),extra=read('dist/rts-data.json');
 Object.assign(data.graphics,extra.graphics,read('dist/original-animation-data.json'));
 return{api,graphics:data.graphics};
}));
let poses=0,durations=0;
for(const [id,g]of Object.entries(versions[0].graphics)){
 const updated=versions[1].graphics[id];if(!updated||!g?.frames?.length)continue;
 for(const action of ['idle','walk','attack','airAttack','death','burrow','unburrow','cast']){
  for(const seed of [0,1,17,713]){
   const x=versions[0].api.transitionSeconds(g,action,.45,seed),y=versions[1].api.transitionSeconds(updated,action,.45,seed);
   assert.equal(y,x,`transition ${id}/${action}/${seed}`);durations++;
   for(const time of [0,.04167,.25,1.25,9])for(const direction of [0,7,16,23,31]){
    const context={seed,targetDistance:direction<16?80:400,parentFrame:6,inheritedFrame:2,skipSpawnIntro:direction===31};
    const before=versions[0].api.pose(g,action,time,direction,context),after=versions[1].api.pose(updated,action,time,direction,context);
    assert.deepEqual(after,before,`pose ${id}/${action}/${seed}/${time}/${direction}`);poses++;
   }
  }
 }
}
console.log(JSON.stringify({equal:true,poses,durations,graphicCount:Object.keys(versions[0].graphics).length}));
