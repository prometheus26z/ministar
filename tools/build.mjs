import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),meta=JSON.parse(fs.readFileSync(path.join(root,'resources/manifest.json'))),packed=Buffer.concat(meta.parts.map(p=>Buffer.from(fs.readFileSync(path.join(root,'resources',p),'utf8'),'base64')));
if(crypto.createHash('sha256').update(packed).digest('hex')!==meta.sha256)throw Error('Asset bundle checksum mismatch');
const raw=zlib.gunzipSync(packed);if(raw.subarray(0,8).toString()!=='MSTAR001')throw Error('Invalid asset bundle');let offset=8,count=0;
while(offset<raw.length){const nl=raw.readUInt16LE(offset),size=raw.readUInt32LE(offset+2);offset+=6;const name=raw.subarray(offset,offset+nl).toString('utf8');offset+=nl;const dest=path.resolve(root,'dist/assets',name);if(!dest.startsWith(path.join(root,'dist/assets')+path.sep)||offset+size>raw.length)throw Error('Invalid asset path/length');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,raw.subarray(offset,offset+size));offset+=size;count++;}
if(count!==meta.files)throw Error('Asset count mismatch');console.log(`Restored ${count} original asset files with verified SHA-256.`);
// A different service worker on every deployed commit prevents stale cache-first builds.
if(process.env.GITHUB_SHA){const swPath=path.join(root,'dist/sw.js'),stamp=process.env.GITHUB_SHA.slice(0,12);fs.writeFileSync(swPath,fs.readFileSync(swPath,'utf8').replace(/^const CACHE='[^']+';/,`const CACHE='ministar-pages-${stamp}';`));}
