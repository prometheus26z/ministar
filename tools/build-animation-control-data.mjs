import fs from 'node:fs';
import path from 'node:path';

export function buildAnimationControlData(root=path.resolve(import.meta.dirname,'..')){
 const source=JSON.parse(fs.readFileSync(path.join(root,'resources/broodwar-engine-control-source.json'),'utf8'));
 const base=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/data.json'),'utf8'));
 const extraPath=path.join(root,'dist/rts-data.json'),extra=fs.existsSync(extraPath)?JSON.parse(fs.readFileSync(extraPath,'utf8')):{graphics:{},units:{}};
 const animationPath=path.join(root,'dist/original-animation-data.json'),original=JSON.parse(fs.readFileSync(animationPath,'utf8'));
 const graphics={...base.graphics,...extra.graphics,...original};let additions=0;
 for(const [image,scriptId] of Object.entries(source.imageScriptIds)){
  const graphic=graphics[image];if(!graphic?.frames?.length)continue;
  const tracks={...(original[image]?.tracks||graphic.tracks||{})};let changed=false;
  for(const [slot,name] of [[5,'attackRepeat'],[6,'airAttackRepeat']]){
   const far=source.visualPrograms?.[`${scriptId}:${slot}:far`],near=source.visualPrograms?.[`${scriptId}:${slot}:near`];
   if(!far)continue;
   for(const track of [far,near].filter(Boolean))for(const [frame] of track.frames||[])if(frame!==null&&frame>=graphic.frames.length)throw Error(`Animation control frame ${frame} exceeds image ${image} atlas (${graphic.frames.length})`);
   tracks[name]=far;tracks[`${name}Near`]=near||far;changed=true;
  }
  if(changed){original[image]={...graphic,...original[image],tracks};additions++;}
 }
 fs.writeFileSync(animationPath,JSON.stringify(original));
 return {images:additions,bytes:fs.statSync(animationPath).size};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const result=buildAnimationControlData();console.log(`Added source repeat-animation tracks to ${result.images} unit images (${result.bytes} bytes).`);
}
