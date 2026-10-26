import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function restoreOriginalUiAssets(root) {
 const resourceRoot=path.join(root,'resources'),manifest=JSON.parse(fs.readFileSync(path.join(resourceRoot,'original-console-assets-manifest.json'),'utf8'));
 if(manifest.format!=='MSTAR001+gzip+base64'||!Array.isArray(manifest.parts)||!manifest.parts.length)throw Error('Invalid original UI bundle manifest');
 const sourcePath=path.resolve(root,manifest.sourceManifest||'');
 if(!sourcePath.startsWith(resourceRoot+path.sep))throw Error('Original UI source manifest must remain inside resources');
 const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
 if(source.build!=='1.23.10.13515'||!Array.isArray(source.files)||source.files.length!==31)throw Error('Invalid original UI source manifest');
 for(const file of source.files)if(!/^[a-f0-9]{64}$/.test(file.sha256||'')||!Number.isSafeInteger(file.bytes)||file.bytes<=0)throw Error(`Invalid original UI source record: ${file.path}`);
 const parts=manifest.parts.map(name=>{
  if(typeof name!=='string'||name.includes('/')||name.includes('\\')||name==='.'||name==='..')throw Error('Unsafe original UI bundle part path');
  return fs.readFileSync(path.join(resourceRoot,name),'utf8');
 });
 const packed=Buffer.concat(parts.map(part=>Buffer.from(part,'base64')));
 if(sha256(packed)!==manifest.sha256)throw Error('Original UI bundle checksum mismatch');
 const raw=zlib.gunzipSync(packed);
 if(raw.length!==manifest.bytes)throw Error(`Original UI unpacked byte count mismatch (${raw.length})`);
 if(raw.subarray(0,8).toString()!=='MSTAR001')throw Error('Invalid original UI asset bundle');
 const targetRoot=path.resolve(root,'dist/assets'),seen=new Set();let offset=8,count=0,totalBytes=0;
 while(offset<raw.length){
  if(offset+6>raw.length)throw Error('Truncated original UI asset header');
  const nameLength=raw.readUInt16LE(offset),size=raw.readUInt32LE(offset+2);offset+=6;
  if(!nameLength||offset+nameLength>raw.length)throw Error('Invalid original UI asset path length');
  const name=raw.subarray(offset,offset+nameLength).toString('utf8');offset+=nameLength;
  if(!name.startsWith('assets/original-ui/')&&!name.startsWith('assets/original-terrain/'))throw Error(`Unexpected original UI asset path: ${name}`);
  if(name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(name))throw Error(`Unsafe or duplicate original UI asset path: ${name}`);
  const destination=path.resolve(root,'dist',name);
  if(!destination.startsWith(targetRoot+path.sep)||offset+size>raw.length)throw Error(`Invalid original UI asset length/path: ${name}`);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,raw.subarray(offset,offset+size));
  offset+=size;count++;totalBytes+=size;seen.add(name);
 }
 if(count!==manifest.files)throw Error(`Original UI asset bundle count mismatch (${count})`);
 console.log(`Restored ${count} original UI and terrain assets with verified SHA-256.`);
 return count;
}

export function buildOriginalUiData(root) {
 const source=path.join(root,'resources/original-ui'),edge=JSON.parse(fs.readFileSync(path.join(source,'creep-edge-map.json'),'utf8')),
  atlas=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/original-terrain/desert-edge-hd.json'),'utf8')),
  layout=JSON.parse(fs.readFileSync(path.join(source,'build-command-layout.json'),'utf8')),
  commandIcons=JSON.parse(fs.readFileSync(path.join(source,'command-icon-map.json'),'utf8'));
 if(!Array.isArray(edge.neighborOrder)||edge.neighborOrder.length!==8||!Array.isArray(edge.frames)||edge.frames.length!==256)throw Error('Invalid original creep edge LUT');
 if(atlas.frames?.length!==37||edge.frames.some(frame=>frame!==null&&(!Number.isInteger(frame)||frame<0||frame>=atlas.frames.length)))throw Error('Invalid original creep atlas references');
 const races=['terran','zerg','protoss'];
 if(races.some(race=>!layout[race]||layout[race].basic?.length!==9||layout[race].advanced?.length!==9))throw Error('Invalid 3x3 construction command layout');
 for(const [race,worker]of Object.entries({terran:7,zerg:41,protoss:64}))if(layout.workerByRace?.[race]!==worker)throw Error(`Invalid ${race} construction worker ID`);
 const iconSource=fs.readFileSync(path.join(source,'cmdicons.png'));
 if(sha256(iconSource)!==commandIcons.sha256||iconSource.readUInt32BE(16)!==commandIcons.atlasSize[0]||iconSource.readUInt32BE(20)!==commandIcons.atlasSize[1])throw Error('Original command icon atlas checksum/dimensions mismatch');
 const [width,height]=commandIcons.atlasSize,[iconWidth,iconHeight]=commandIcons.iconSize;
 const coordinates=[...Object.values(commandIcons.buildings),commandIcons.menu.cancel,...races.flatMap(race=>[commandIcons.menu[race].basic,commandIcons.menu[race].advanced])];
 if(coordinates.some(pair=>!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isInteger)||pair[0]<0||pair[1]<0||pair[0]+iconWidth>width||pair[1]+iconHeight>height))throw Error('Original command icon atlas coordinates are invalid');
 for(const race of races)for(const page of ['basic','advanced']){
  const slots=layout[race][page];
  if(slots[8]!=='cancel'||slots.slice(0,8).some(id=>id!==null&&!Number.isInteger(id)))throw Error(`Invalid ${race} ${page} cancel/slot layout`);
  for(const id of slots)if(Number.isInteger(id)&&!commandIcons.buildings[id])throw Error(`Missing command art for building ${id}`);
 }
 const iconTarget=path.join(root,'dist/assets/original-ui/cmdicons.png');
 fs.copyFileSync(path.join(source,'cmdicons.png'),iconTarget);
 const output='// Generated from resources/original-ui fixtures and original terrain atlas metadata.\n'+
  'export const CREEP_EDGE_MAP='+JSON.stringify(edge)+';\n'+
  'export const CREEP_EDGE_FRAMES='+JSON.stringify(atlas.frames)+';\n'+
  'export const BUILD_COMMAND_LAYOUT='+JSON.stringify(layout)+';\n'+
  'export const BUILD_COMMAND_ICONS='+JSON.stringify({buildings:commandIcons.buildings,menu:commandIcons.menu})+';\n';
 fs.writeFileSync(path.join(root,'dist/original-ui-data.js'),output);
 console.log('Generated validated original UI command layout and creep edge data.');
}
