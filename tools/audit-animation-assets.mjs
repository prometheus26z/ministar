import fs from 'node:fs';
const root=new URL('../dist/',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name,root)));
const data=read('assets/data.json'),extra=read('rts-data.json');Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics);
for(const name of ['construction-data.json','turret-data.json','destruction-data.json'])Object.assign(data.graphics,read(name));
const missing=new Map();
function walk(id,owner,action,seen=new Set()){
 if(seen.has(id))return;seen.add(id);const g=data.graphics[id];
 if(!g){const refs=missing.get(id)||new Set();refs.add(`${owner}: ${action}`);missing.set(id,refs);return}
 const track=g.tracks?.[action]||g.tracks?.idle;
 for(const overlay of track?.overlays||[])if(!(g.shadows||[]).includes(overlay))walk(overlay,owner,action,seen);
 for(const path of Object.values(g.images||{}))if(!fs.existsSync(new URL(path,root)))throw Error(`Missing sprite file: ${path}`);
}
for(const unit of Object.values(data.units))for(const action of ['idle','walk','attack','airAttack','cast','death','burrow','unburrow'])if(data.graphics[unit.image]?.tracks?.[action])walk(unit.image,`${unit.id} ${unit.name}`,action);
for(const [id,refs]of missing)console.error(`Missing original graphic ${id}: ${[...refs].join('; ')}`);
console.log(`${missing.size} original overlay graphics missing. Procedural substitutes do not satisfy this audit.`);
process.exitCode=missing.size?1:0;
