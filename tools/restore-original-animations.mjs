import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import {fileURLToPath}from'node:url';
export function restoreOriginalAnimations(root){
 const meta=JSON.parse(fs.readFileSync(path.join(root,'resources/original-animations-manifest.json'))),packed=Buffer.concat(meta.parts.map(name=>Buffer.from(fs.readFileSync(path.join(root,'resources',name),'utf8'),'base64')));
 if(crypto.createHash('sha256').update(packed).digest('hex')!==meta.sha256)throw Error('Original animation bundle checksum mismatch');
 const bytes=zlib.gunzipSync(packed);if(bytes.subarray(0,8).toString()!=='MSTAR001')throw Error('Invalid original animation bundle');let offset=8,count=0;
 while(offset<bytes.length){const nl=bytes.readUInt16LE(offset),size=bytes.readUInt32LE(offset+2);offset+=6;const name=bytes.subarray(offset,offset+nl).toString('utf8');offset+=nl;
  const dest=path.resolve(root,'dist',name),allowed=dest===path.join(root,'dist/original-animation-data.json')||dest.startsWith(path.join(root,'dist/original-animation-assets')+path.sep);
  if(!allowed||offset+size>bytes.length)throw Error('Invalid original animation asset path/length');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes.subarray(offset,offset+size));offset+=size;count++;
 }
 if(count!==meta.files)throw Error('Original animation file count mismatch');const data=fs.readFileSync(path.join(root,'dist/original-animation-data.json'));
 if(crypto.createHash('sha256').update(data).digest('hex')!==meta.dataSha256)throw Error('Original animation metadata checksum mismatch');
 console.log(`Restored ${count} verified original animation files.`);return count;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))restoreOriginalAnimations(path.resolve(import.meta.dirname,'..'));
