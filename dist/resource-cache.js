const CACHE_PREFIX='ministar-resource-v1:';
const META={hash:'X-MiniStar-Sha256',bytes:'X-MiniStar-Bytes',mime:'X-MiniStar-Mime',used:'X-MiniStar-UsedAt'};
const MIB=1024*1024;

export class ResourceVersionError extends Error { constructor(){super('새 버전이 준비되었습니다. 다시 실행해 주세요.');this.name='ResourceVersionError'} }
export class ResourceIntegrityError extends Error { constructor(path){super(`Resource integrity check failed: ${path}`);this.name='ResourceIntegrityError';this.path=path} }

const normalizeBase=value=>{const url=new URL(value);if(!url.pathname.endsWith('/'))url.pathname+='/';return url};
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
const contentType=response=>(response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase();

export function createResourceStore({baseURL=globalThis.document?.baseURI||'http://localhost/',appVersion='',fetchImpl=globalThis.fetch?.bind(globalThis),cacheStorage=globalThis.caches,storageManager=globalThis.navigator?.storage,cryptoImpl=globalThis.crypto}={}){
 const base=normalizeBase(baseURL),scope=base.href,cacheName=CACHE_PREFIX+encodeURIComponent(scope),pending=new Map(),lastUsed=new Map();
 let manifest=null,cache=null,cacheAvailable=false,writesDisabled=false,budgetBytes=64*MIB,lastMaintenance=0,maintenancePromise=null;
 const counters={networkBytes:0,cacheHitBytes:0,misses:0,errors:0,storedBytes:0};

 function entryFor(input){
  if(!manifest)return null;
  let url;try{url=new URL(input,base)}catch{return null}
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
  for(const key of url.searchParams.keys())if(key!=='v')return null;
  const path=decodeURIComponent(url.pathname.slice(base.pathname.length));
  return manifest.entries[path]?{path,entry:manifest.entries[path]}:null;
 }
 function cacheKey(entry){
  const mime=encodeURIComponent(entry.mime);
  return new URL(`__resource-cache__/sha256/${mime}/${entry.sha256}`,base).href;
 }
 async function digest(bytes){
  if(!cryptoImpl?.subtle)throw new Error('SHA-256 is unavailable in this browser');
  return hex(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes)));
 }
 async function readBounded(response,expected,path){
  if(!response.body?.getReader){const bytes=await response.arrayBuffer();if(bytes.byteLength!==expected)throw new ResourceIntegrityError(path);return bytes}
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>expected){await reader.cancel();throw new ResourceIntegrityError(path)}chunks.push(value)}
  }catch(error){try{await reader.cancel()}catch{}throw error}
  if(total!==expected)throw new ResourceIntegrityError(path);
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes.buffer;
 }
 async function estimateBudget(){
  try{const estimate=await storageManager?.estimate?.();if(Number.isFinite(estimate?.quota)&&estimate.quota>0)budgetBytes=Math.min(128*MIB,estimate.quota*.1)}catch{}
 }
 async function keys(){try{return cache?await cache.keys():[]}catch{return[]}}
 async function prune(targetBytes=budgetBytes){
  if(!cache)return;
  const currentHashes=new Set(Object.values(manifest?.entries||{}).map(entry=>`${entry.sha256}:${entry.mime}`));
  const items=[];let total=0;
  for(const request of await keys()){
   const response=await cache.match(request);if(!response)continue;
   const size=Number(response.headers.get(META.bytes))||0,hash=response.headers.get(META.hash),mime=response.headers.get(META.mime),identity=`${hash}:${mime}`;
   total+=size;items.push({request,size,stale:!currentHashes.has(identity),used:lastUsed.get(request.url)||Number(response.headers.get(META.used))||0});
  }
  items.sort((a,b)=>Number(b.stale)-Number(a.stale)||a.used-b.used);
  for(const item of items){if(total<=targetBytes&&!item.stale)continue;try{await cache.delete(item.request);total-=item.size;lastUsed.delete(item.request.url)}catch{}}
 }
 async function maintain(force=false,targetBytes=budgetBytes){
  if(!cache)return;
  const now=Date.now();if(!force&&now-lastMaintenance<30000)return;
  if(maintenancePromise)return maintenancePromise;
  maintenancePromise=(async()=>{try{await prune(targetBytes);lastMaintenance=Date.now()}finally{maintenancePromise=null}})();
  return maintenancePromise;
 }
 async function openCache(){
  if(!cacheStorage?.open)return false;
  try{cache=await cacheStorage.open(cacheName);cacheAvailable=true;await estimateBudget();await maintain(true);return true}
  catch{cache=null;cacheAvailable=false;writesDisabled=true;return false}
 }
 async function init({manifestPath='resource-manifest.json'}={}){
  if(!cryptoImpl?.subtle){manifest=null;return{manifest:false,cache:false}}
  let response;
  try{response=await fetchImpl(new URL(manifestPath,base),{cache:'no-store',credentials:'same-origin'})}catch{manifest=null;return{manifest:false,cache:false}}
  if(!response?.ok){manifest=null;return{manifest:false,cache:false}}
  let next;try{next=await response.json()}catch{throw new ResourceVersionError()}
  if(next?.schema!==1||typeof next.appVersion!=='string'||!next.entries||typeof next.entries!=='object'||Array.isArray(next.entries)||!/^[a-f0-9]{64}$/.test(next.buildId||''))throw new ResourceVersionError();
  if(appVersion&&next.appVersion!==appVersion)throw new ResourceVersionError();
  for(const [path,entry]of Object.entries(next.entries)){
   if(typeof path!=='string'||path.startsWith('/')||path.includes('\\')||path.split('/').some(segment=>segment===''||segment==='.'||segment==='..')||!/^([a-f0-9]{64})$/.test(entry?.sha256||'')||!Number.isSafeInteger(entry?.bytes)||entry.bytes<0||!['application/json','image/png','image/webp','audio/ogg'].includes(entry?.mime)||!['metadata','image','audio'].includes(entry?.kind))throw new ResourceVersionError();
  }
  const canonical={schema:next.schema,appVersion:next.appVersion,entries:next.entries};
  if(await digest(new TextEncoder().encode(JSON.stringify(canonical)))!==next.buildId)throw new ResourceVersionError();
  manifest=next;
  const available=await openCache();
  return{manifest:true,cache:available,buildId:manifest.buildId};
 }
 function originalURL(input){
  const url=new URL(input,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw new TypeError('Resource URL must remain inside the application path');return url;
 }
 async function cached(entry,countHit=true){
  if(!cache)return null;
  const key=cacheKey(entry);let response;
  try{response=await cache.match(key)}catch{return null}
  if(!response)return null;
  const valid=response.headers.get(META.hash)===entry.sha256&&Number(response.headers.get(META.bytes))===entry.bytes&&response.headers.get(META.mime)===entry.mime&&response.status===200;
  if(!valid){try{await cache.delete(key)}catch{}return null}
  lastUsed.set(key,Date.now());if(!countHit)return true;counters.cacheHitBytes+=entry.bytes;
  return response.clone();
 }
 async function verifiedNetwork(path,entry,mode='default',signal){
  const url=new URL(path,base);url.searchParams.set('v',entry.sha256);
  const response=await fetchImpl(url,{cache:mode,credentials:'same-origin',signal});
  if(!response||response.status!==200||response.type==='opaque'||response.headers.has('content-range')||contentType(response)!==entry.mime)throw new ResourceIntegrityError(path);
  const bytes=await readBounded(response,entry.bytes,path),actual=await digest(bytes);
  if(actual!==entry.sha256)throw new ResourceIntegrityError(path);
  counters.networkBytes+=entry.bytes;
  const headers=new Headers({'Content-Type':entry.mime,[META.hash]:entry.sha256,[META.bytes]:String(entry.bytes),[META.mime]:entry.mime,[META.used]:String(Date.now())});
  const verified=new Response(bytes,{status:200,headers});
  await save(cacheKey(entry),verified.clone(),entry);
  return verified;
 }
 async function save(key,response,entry){
  if(!cache||writesDisabled||entry.bytes>budgetBytes)return;
  let body;try{body=await response.arrayBuffer()}catch{return}
  const copy=()=>new Response(body.slice(0),{status:200,headers:response.headers});
  try{await cache.put(key,copy());counters.storedBytes+=entry.bytes;lastUsed.set(key,Date.now())}
  catch(error){
   if(error?.name!=='QuotaExceededError'){writesDisabled=true;return}
   await maintain(true,Math.max(0,budgetBytes-entry.bytes));
   try{await cache.put(key,copy());counters.storedBytes+=entry.bytes;lastUsed.set(key,Date.now())}
   catch{writesDisabled=true}
  }
 }
 async function responseFor(input,{signal}={}){
  const resolved=entryFor(input);
  if(!resolved||!manifest){return fetchImpl(originalURL(input),{credentials:'same-origin',signal})}
  const {path,entry}=resolved;
  const hit=await cached(entry);if(hit)return hit;
  counters.misses++;
  const identity=`${entry.sha256}:${entry.mime}`;
  let request=pending.get(identity);
  if(!request){
   const controller=new AbortController();request={controller,consumers:0,settled:false,promise:null};
   request.promise=(async()=>{
    try{return await verifiedNetwork(path,entry,'default',controller.signal)}
    catch(first){
     if(first?.name==='AbortError')throw first;
     if(!(first instanceof ResourceIntegrityError))throw first;
     try{return await verifiedNetwork(path,entry,'reload',controller.signal)}catch(second){counters.errors++;throw second instanceof ResourceIntegrityError?second:first}
    }
   })().finally(()=>{request.settled=true;pending.delete(identity)});pending.set(identity,request);
  }
  if(signal?.aborted)throw new DOMException('The operation was aborted','AbortError');
  request.consumers++;
  return new Promise((resolve,reject)=>{
   let done=false;
   const release=()=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);request.consumers--;if(!request.settled&&request.consumers===0)request.controller.abort()};
   const abort=()=>{release();reject(new DOMException('The operation was aborted','AbortError'))};
   signal?.addEventListener('abort',abort,{once:true});
   request.promise.then(value=>{if(done)return;release();resolve(value.clone())},error=>{if(done)return;release();reject(error)});
  });
 }
 async function prefetch(inputs,{signal,budgetBytes=8*MIB}={}){
  if(!cacheAvailable||writesDisabled)return{downloadedBytes:0,skipped:inputs.length};
  let downloadedBytes=0,skipped=0;
  for(const input of inputs){
   if(signal?.aborted||globalThis.document?.hidden)break;
   const resolved=entryFor(input);if(!resolved){skipped++;continue}
   const {entry}=resolved;if(entry.kind==='metadata'||entry.bytes>budgetBytes-downloadedBytes){skipped++;continue}
   if(await cached(entry,false))continue;
   try{const response=await responseFor(input,{signal});if(response.ok)downloadedBytes+=entry.bytes}catch{if(!signal?.aborted)skipped++}
  }
  return{downloadedBytes,skipped};
 }
 async function invalidate(input){const resolved=entryFor(input);if(!resolved||!cache)return false;try{return await cache.delete(cacheKey(resolved.entry))}catch{return false}}
 async function clearOwnResources(){try{return cacheStorage?.delete?await cacheStorage.delete(cacheName):false}catch{return false}}
 function stats(){return{...counters,cacheAvailable,manifestBuildId:manifest?.buildId||null,budgetBytes,writesDisabled,pending:pending.size}}
 return{init,response:responseFor,prefetch,invalidate,clearOwnResources,stats,entry(input){const found=entryFor(input);return found?{...found.entry,path:found.path}:null},get cacheName(){return cacheName},get baseURL(){return scope}};
}
