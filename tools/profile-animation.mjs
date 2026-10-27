// CPU-only pose cost; not canvas time or phone FPS.
// node tools/profile-animation.mjs [/path/to/version] [graphics per frame]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=path.resolve(process.argv[2]||'.'),count=Number(process.argv[3]||600);
const {pose,ANIMATION_CACHE_METRICS}=await import(pathToFileURL(path.join(root,'dist/animation.js')));
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const data=read('dist/assets/data.json'),extra=read('dist/rts-data.json');
Object.assign(data.graphics,extra.graphics,read('dist/original-animation-data.json'));
const graphics=Object.values(data.graphics).filter(g=>g?.frames?.length&&g.tracks?.idle?.frames?.length);
const subjects=Array.from({length:count},(_,i)=>({g:graphics[i%graphics.length],seed:i%31,direction:i%32}));
const times=[];let totalFrames=0;
for(let iteration=0;iteration<150;iteration++){
 const started=performance.now();
 for(const [index,{g,seed,direction}]of subjects.entries())totalFrames+=pose(g,index%4===0?'attack':index%3===0?'walk':'idle',iteration/24,direction,{seed,targetDistance:index%2?80:400}).frame;
 if(iteration>=30)times.push(performance.now()-started);
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({root,graphics:graphics.length,subjects:count,warmupFrames:30,measuredFrames:120,medianMs:times[59],p95Ms:times[113],p99Ms:times[118],checksum:totalFrames,metrics:ANIMATION_CACHE_METRICS||null}));
