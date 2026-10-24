import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import crypto from 'node:crypto';
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
