import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import crypto from 'node:crypto';
import {deriveBuildingCatalog,SOURCE_PLAYER_BY_COMMANDER} from './desert-strike-source.mjs';
import {execFileSync} from 'node:child_process';
// Regenerate the background from upright source artwork on every clean build.
execFileSync('python3',[path.resolve(import.meta.dirname,'battlefield_terrain.py')],{stdio:'inherit'});
const root=path.resolve(import.meta.dirname,'..'),meta=JSON.parse(fs.readFileSync(path.join(root,'resources/manifest.json'))),packed=Buffer.concat(meta.parts.map(p=>Buffer.from(fs.readFileSync(path.join(root,'resources',p),'utf8'),'base64')));
if(crypto.createHash('sha256').update(packed).digest('hex')!==meta.sha256)throw Error('Asset bundle checksum mismatch');
const raw=zlib.gunzipSync(packed);if(raw.subarray(0,8).toString()!=='MSTAR001')throw Error('Invalid asset bundle');let offset=8,count=0;
while(offset<raw.length){const nl=raw.readUInt16LE(offset),size=raw.readUInt32LE(offset+2);offset+=6;const name=raw.subarray(offset,offset+nl).toString('utf8');offset+=nl;const dest=path.resolve(root,'dist/assets',name);if(!dest.startsWith(path.join(root,'dist/assets')+path.sep)||offset+size>raw.length)throw Error('Invalid asset path/length');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,raw.subarray(offset,offset+size));offset+=size;count++;}
if(count!==meta.files)throw Error('Asset count mismatch');console.log(`Restored ${count} original asset files with verified SHA-256.`);
// Add two race-matched music cues cut from each original race suite.
for(const race of ['terran','zerg','protoss']){
 for(const index of [1,2]){
  const name=`${race}-${index}.ogg`,source=path.join(root,'resources/music',name),dest=path.join(root,'dist/assets/audio',name);
  if(!fs.existsSync(source))throw Error(`Missing race music cue: ${source}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
 }
}
console.log('Restored 6 race-specific music cues.');
// Additional original building/larva/resource sprites for base construction.
{
 const extra=JSON.parse(fs.readFileSync(path.join(root,'resources/rts-manifest.json'))),bundle=Buffer.concat(extra.parts.map(p=>Buffer.from(fs.readFileSync(path.join(root,'resources',p),'utf8'),'base64')));
 if(crypto.createHash('sha256').update(bundle).digest('hex')!==extra.sha256)throw Error('RTS asset checksum mismatch');
 const bytes=zlib.gunzipSync(bundle);if(bytes.subarray(0,8).toString()!=='MSTAR001')throw Error('Invalid RTS asset bundle');let offset=8,count=0;
 while(offset<bytes.length){const length=bytes.readUInt16LE(offset),size=bytes.readUInt32LE(offset+2);offset+=6;const name=bytes.subarray(offset,offset+length).toString('utf8');offset+=length;const dest=path.resolve(root,'dist',name);if(!dest.startsWith(path.join(root,'dist/rts-assets')+path.sep)||offset+size>bytes.length)throw Error('Invalid RTS asset path');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes.subarray(offset,offset+size));offset+=size;count++}
 if(count!==extra.files)throw Error('RTS asset count mismatch');console.log(`Restored ${count} RTS sprite sheets with verified SHA-256.`);
}

// One checked original-map snapshot supplies both browser and simulation rules.
{
 const rules=JSON.parse(fs.readFileSync(path.join(root,'resources/desert-strike-v1.json'),'utf8'));
 const audit=JSON.parse(fs.readFileSync(path.join(root,'resources/original-desertstrike.json'),'utf8'));
 const scx=fs.readFileSync(path.join(root,'resources/desertstrike/original.scx'));
 const chk=zlib.gunzipSync(fs.readFileSync(path.join(root,'resources/desertstrike/scenario.chk.gz')));
 for(const [bytes,expected]of [[scx,audit.source.sha256],[chk,audit.source.chkSha256]])if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Original Desert Strike source checksum mismatch');
 if(audit.originalTriggers.length!==328||audit.originalTriggers.some((t,i)=>t.id!==i+1||!t.portStatus||!t.mappedRule))throw Error('Incomplete original trigger audit');
 if(Object.values(rules.costs).some(cost=>cost[1]!==0))throw Error('Original building costs must be minerals-only');
 const buildingSource=deriveBuildingCatalog(chk,rules);
 const humanPlayers=Object.values(SOURCE_PLAYER_BY_COMMANDER),blocked=Object.keys(buildingSource.buildingCatalog).map(Number).filter(id=>!humanPlayers.every(player=>buildingSource.buildingCatalog[id].availableByPlayer[player]));
 if(JSON.stringify(blocked)!=='[120]')throw Error(`Unexpected PUNI building catalog; expected only disabled ID 120, got ${JSON.stringify(blocked)}`);
 if(rules.map.gasSlots.length!==5||rules.map.productionRegion.buildable.length!==rules.map.productionRegion.tileWidth*rules.map.productionRegion.tileHeight)throw Error('Invalid source production geometry');
 const layout=rules.map.mobileLayout;if(!layout||layout.objectiveDetectionRange!==320)throw Error('Invalid mobile objective detection layout');
 for(const team of [0,1]){
  const main=layout.mains?.[team],outpost=layout.outposts?.[team],zone=layout.deploymentZones?.[team],mirror=1-team;
  if(!main||!outpost||!zone||main.x!==640||outpost.x!==640||Math.abs(Math.abs(main.y-outpost.y)-480)>1||main.y+layout.mains[mirror].y!==2048||outpost.y+layout.outposts[mirror].y!==2048)throw Error(`Invalid mobile objectives for team ${team}`);
  if(zone.left!==32||zone.right!==1248||zone.top<0||zone.bottom>2048||zone.top>=zone.bottom)throw Error(`Invalid rear deployment zone for team ${team}`);
 }
 const field=audit.map.locations.find(location=>location.name==='Playing field');
 if(!field||field.left!==0||field.top!==0)throw Error('Invalid original battlefield crop');
 const targetWidth=1280,targetHeight=2048,sourceWidth=field.right-field.left,sourceHeight=field.bottom-field.top;
 const rotatedWidth=sourceHeight,rotatedHeight=sourceWidth,targetAspect=targetWidth/targetHeight;
 let left=0,top=0,cropWidth=rotatedWidth,cropHeight=rotatedHeight;
 if(rotatedWidth/rotatedHeight>targetAspect){cropWidth=Math.round(rotatedHeight*targetAspect);left=Math.floor((rotatedWidth-cropWidth)/2)}
 else{cropHeight=Math.round(rotatedWidth/targetAspect);top=Math.floor((rotatedHeight-cropHeight)/2)}
 const scaleX=targetWidth/cropWidth,scaleY=targetHeight/cropHeight;
 if(Math.abs(scaleX-scaleY)>1e-12)throw Error('Original battlefield fit would distort terrain');
 // Preserve gameplay placement independently of the upright mobile scenery.
 const pointOnBattlefield=(x,y)=>({x:(y-field.top-left)*scaleX,y:(sourceWidth-(x-field.left)-top)*scaleY});
 const templeUnits=audit.map.units.filter(unit=>unit.unitId===174&&[3,7].includes(unit.owner));
 if(templeUnits.length!==2||new Set(templeUnits.map(unit=>unit.owner)).size!==2)throw Error('Original map must contain one temple for each team');
 const outposts={};
 for(const [team,owner]of [[0,3],[1,7]]){
  const unit=templeUnits.find(candidate=>candidate.owner===owner);
  if(!unit)throw Error(`Missing source temple for owner ${owner}`);
  outposts[team]={...pointOnBattlefield(unit.x,unit.y),owner,source:{x:unit.x,y:unit.y}};
 }
 rules.map.objectives={...(rules.map.objectives||{}),outposts};
 fs.writeFileSync(path.join(root,'dist/desert-strike-data.js'),'// Extracted from original map sections; see resources/desert-strike-v1.json.\nexport const DESERT_STRIKE='+JSON.stringify({...rules,...buildingSource})+';\n');
 console.log('Restored original Desert Strike economy and production data.');
}


// Original overlay/corpse sprites and full source-script visual timelines.
const {restoreOriginalAnimations}=await import('./restore-original-animations.mjs');
restoreOriginalAnimations(root);
