import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildResourceManifest} from '../tools/build-resource-manifest.mjs';
import {createResourceStore,ResourceIntegrityError,ResourceVersionError} from '../dist/resource-cache.js';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mime='image/webp';
function entry(bytes,kind='image'){return{sha256:hash(bytes),bytes:bytes.byteLength,mime,kind}}
function manifest(entries,appVersion='0.16.13'){const value={schema:1,appVersion,entries};return{...value,buildId:hash(Buffer.from(JSON.stringify(value)))}}
function memoryStorage({quota=false}={}){
 const stores=new Map();
 return{stores,async open(name){if(!stores.has(name)){const values=new Map();stores.set(name,{async match(key){const value=values.get(new URL(key.url||key).href);return value?.clone()},async put(key,response){if(quota)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});values.set(new URL(key.url||key).href,response.clone())},async delete(key){return values.delete(new URL(key.url||key).href)},async keys(){return[...values.keys()].map(url=>new Request(url))}})}return stores.get(name)},async delete(name){return stores.delete(name)}};
}
function harness({entries,files,appVersion='0.16.13',cacheStorage=memoryStorage(),baseURL='https://example.test/ministar/',respond}={}){
 let currentManifest=manifest(entries,appVersion);const counts=new Map();
 const fetchImpl=async(input,options={})=>{
  const url=new URL(input.url||input),relative=decodeURIComponent(url.pathname.slice(new URL(baseURL).pathname.length));
  if(relative==='resource-manifest.json')return new Response(JSON.stringify(currentManifest),{headers:{'Content-Type':'application/json'}});
  counts.set(relative,(counts.get(relative)||0)+1);
  if(respond)return respond(relative,files.get(relative),url,options,counts.get(relative));
  const bytes=files.get(relative);return bytes?new Response(bytes,{headers:{'Content-Type':mime}}):new Response('missing',{status:404});
 };
 const makeStore=(version=appVersion)=>createResourceStore({baseURL,appVersion:version,fetchImpl,cacheStorage,storageManager:null,cryptoImpl:crypto.webcrypto});
 return{makeStore,counts,files,setManifest(value){currentManifest=value},storage:cacheStorage};
}

test('generated manifest is deterministic, content addressed, and excludes native video',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ministar-resource-manifest-'));
 try{
  for(const file of ['assets/data.json','rts-data.json','construction-data.json','turret-data.json','destruction-data.json','original-animation-data.json']){
   const destination=path.join(root,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
   fs.writeFileSync(destination,JSON.stringify(file==='assets/data.json'?{graphics:{1:{images:{blue:'assets/sprites/a.webp'}}},units:{1:{portrait:'assets/portraits/1.webm'}}}:{}));
  }
  fs.mkdirSync(path.join(root,'assets/sprites'),{recursive:true});fs.mkdirSync(path.join(root,'assets/portraits'),{recursive:true});
  fs.writeFileSync(path.join(root,'assets/sprites/a.webp'),Buffer.from('image-a'));fs.writeFileSync(path.join(root,'assets/portraits/1.webm'),Buffer.from('video'));
  const first=buildResourceManifest(root,'0.16.13'),second=buildResourceManifest(root,'0.16.13');
  assert.deepEqual(first,second);assert.equal(first.entries['assets/sprites/a.webp'].sha256,hash(Buffer.from('image-a')));
  assert.equal(first.entries['assets/portraits/1.webm'],undefined);assert.equal(first.entries['assets/data.json'].kind,'metadata');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('same-scope reload reuses verified raw bytes with the browser memory cache disabled',async()=>{
 const bytes=Buffer.from('sprite-bytes'),files=new Map([['assets/a.webp',bytes]]),h=harness({entries:{'assets/a.webp':entry(bytes)},files});
 const first=h.makeStore();assert.equal((await first.init()).manifest,true);assert.equal(await (await first.response('assets/a.webp?v=0.16.13')).text(),'sprite-bytes');
 const second=h.makeStore();await second.init();assert.equal(await (await second.response('assets/a.webp')).text(),'sprite-bytes');
 assert.equal(h.counts.get('assets/a.webp'),1);assert.equal(second.stats().cacheHitBytes,bytes.length);
});

test('changed content fetches only its new hash and keeps unchanged assets reusable',async()=>{
 const oldA=Buffer.from('a-old'),newA=Buffer.from('a-new'),stable=Buffer.from('stable'),files=new Map([['assets/a.webp',oldA],['assets/b.webp',stable]]),h=harness({entries:{'assets/a.webp':entry(oldA),'assets/b.webp':entry(stable)},files});
 let store=h.makeStore();await store.init();await store.response('assets/a.webp');await store.response('assets/b.webp');
 files.set('assets/a.webp',newA);h.setManifest(manifest({'assets/a.webp':entry(newA),'assets/b.webp':entry(stable)}));store=h.makeStore();await store.init();
 assert.equal(await (await store.response('assets/b.webp')).text(),'stable');assert.equal(await (await store.response('assets/a.webp')).text(),'a-new');
 assert.equal(h.counts.get('assets/a.webp'),2);assert.equal(h.counts.get('assets/b.webp'),1);
});

test('application version changes reuse identical hashes within the same scope',async()=>{
 const bytes=Buffer.from('same resource'),files=new Map([['assets/a.webp',bytes]]),storage=memoryStorage(),h=harness({entries:{'assets/a.webp':entry(bytes)},files,cacheStorage:storage});
 let store=h.makeStore('0.16.13');await store.init();await store.response('assets/a.webp');
 h.setManifest(manifest({'assets/a.webp':entry(bytes)},'0.16.14'));store=h.makeStore('0.16.14');await store.init();assert.equal(await(await store.response('assets/a.webp')).text(),'same resource');
 assert.equal(h.counts.get('assets/a.webp'),1);
});

test('same filename in different directories uses different content identities',async()=>{
 const one=Buffer.from('directory-one'),two=Buffer.from('directory-two'),files=new Map([['assets/a.webp',one],['sprites/a.webp',two]]),h=harness({entries:{'assets/a.webp':entry(one),'sprites/a.webp':entry(two)},files});
 const store=h.makeStore();await store.init();assert.equal(await(await store.response('assets/a.webp')).text(),'directory-one');assert.equal(await(await store.response('sprites/a.webp')).text(),'directory-two');
 assert.equal(h.counts.get('assets/a.webp'),1);assert.equal(h.counts.get('sprites/a.webp'),1);
});

test('different application base paths keep independent resource caches',async()=>{
 const shared=memoryStorage(),one=Buffer.from('one scope'),two=Buffer.from('other scope');
 const a=harness({entries:{'assets/a.webp':entry(one)},files:new Map([['assets/a.webp',one]]),cacheStorage:shared,baseURL:'https://example.test/ministar/'});
 const b=harness({entries:{'assets/a.webp':entry(two)},files:new Map([['assets/a.webp',two]]),cacheStorage:shared,baseURL:'https://example.test/ministar-test/'});
 const storeA=a.makeStore(),storeB=b.makeStore();await storeA.init();await storeB.init();
 assert.equal(await(await storeA.response('assets/a.webp')).text(),'one scope');assert.equal(await(await storeB.response('assets/a.webp')).text(),'other scope');
 assert.notEqual(storeA.cacheName,storeB.cacheName);assert.equal(shared.stores.size,2);
});

test('ten simultaneous consumers share one verified network request and independent response bodies',async()=>{
 const bytes=Buffer.from('shared-body'),files=new Map([['assets/a.webp',bytes]]),h=harness({entries:{'assets/a.webp':entry(bytes)},files,respond:async(relative,body)=>{await new Promise(resolve=>setTimeout(resolve,10));return new Response(body,{headers:{'Content-Type':mime}})}});
 const store=h.makeStore();await store.init();const responses=await Promise.all(Array.from({length:10},()=>store.response('assets/a.webp')));
 assert.deepEqual(await Promise.all(responses.map(response=>response.text())),Array(10).fill('shared-body'));assert.equal(h.counts.get('assets/a.webp'),1);
});

test('hash mismatch, HTML fallback, and partial responses are rejected and never stored',async t=>{
 for(const [name,respond]of [
  ['hash mismatch',async(_path)=>new Response('wrong body',{headers:{'Content-Type':mime}})],
  ['HTML fallback',async()=>new Response('<html>missing</html>',{headers:{'Content-Type':'text/html'}})],
  ['partial response',async(_path,body)=>new Response(body,{status:206,headers:{'Content-Type':mime,'Content-Range':'bytes 0-2/9'}})]
 ])await t.test(name,async()=>{
  const expected=Buffer.from('expected'),files=new Map([['assets/a.webp',expected]]),h=harness({entries:{'assets/a.webp':entry(expected)},files,respond});
  const store=h.makeStore();await store.init();await assert.rejects(store.response('assets/a.webp'),ResourceIntegrityError);assert.equal(h.counts.get('assets/a.webp'),2);
  assert.equal((await(await h.storage.open(store.cacheName)).keys()).length,0);
 });
});

test('manifest version mismatch stops before resource fetch',async()=>{
 const bytes=Buffer.from('ok'),h=harness({entries:{'assets/a.webp':entry(bytes)},files:new Map([['assets/a.webp',bytes]]),appVersion:'0.16.14'});
 const store=h.makeStore('0.16.13');await assert.rejects(store.init(),ResourceVersionError);assert.equal(h.counts.size,0);
});

test('missing Cache Storage keeps verified online loading available',async()=>{
 const bytes=Buffer.from('online'),h=harness({entries:{'assets/a.webp':entry(bytes)},files:new Map([['assets/a.webp',bytes]]),cacheStorage:null});
 const store=h.makeStore();assert.equal((await store.init()).cache,false);assert.equal(await(await store.response('assets/a.webp')).text(),'online');assert.equal(store.stats().cacheAvailable,false);
});

test('quota failures do not reject the already verified resource',async()=>{
 const bytes=Buffer.from('online'),h=harness({entries:{'assets/a.webp':entry(bytes)},files:new Map([['assets/a.webp',bytes]]),cacheStorage:memoryStorage({quota:true})});
 const store=h.makeStore();await store.init();assert.equal(await(await store.response('assets/a.webp')).text(),'online');assert.equal(store.stats().writesDisabled,true);
});
