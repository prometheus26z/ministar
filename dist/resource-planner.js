const MIB=1024*1024;

export function createResourcePlanner({store,documentRef=globalThis.document,windowRef=globalThis.window}={}){
 let controller=null,generation=0,lastInput=0,downloaded=0;
 const frameCosts=[];
 const noteInput=()=>{lastInput=performance.now()};
 for(const event of ['pointerdown','keydown','touchstart','click'])windowRef?.addEventListener?.(event,noteInput,{passive:true,capture:true});

 function constrained(){
  const connection=windowRef?.navigator?.connection;
  return !!(connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType));
 }
 function slowFrame(){
  if(frameCosts.length<12)return false;
  const sorted=[...frameCosts].sort((a,b)=>a-b);
  return sorted[Math.floor((sorted.length-1)*.95)]>33.3;
 }
 function idle(signal){
  if(signal.aborted)return Promise.resolve(false);
  if(documentRef?.hidden)return new Promise(resolve=>{
   const done=()=>{documentRef.removeEventListener('visibilitychange',check);signal.removeEventListener('abort',abort);resolve(!signal.aborted)};
   const check=()=>{if(!documentRef.hidden)done()},abort=()=>done();
   documentRef.addEventListener('visibilitychange',check);signal.addEventListener('abort',abort,{once:true});
  });
  if('requestIdleCallback'in(windowRef||{}))return new Promise(resolve=>windowRef.requestIdleCallback(deadline=>resolve(!signal.aborted&&deadline.timeRemaining()>=4),{timeout:1200}));
  return new Promise(resolve=>setTimeout(()=>resolve(!signal.aborted),350));
 }
 async function pauseForSafeWindow(signal){
  while(!signal.aborted){
   if(documentRef?.hidden){if(!await idle(signal))continue;continue}
   if(performance.now()-lastInput>=200&&!slowFrame())return true;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  return false;
 }
 function schedule(paths,{budgetBytes=8*MIB}={}){
  controller?.abort();controller=new AbortController();const signal=controller.signal,token=++generation;
  const queue=[...new Set(paths.filter(Boolean))],startDownloaded=downloaded;
  if(constrained()||!queue.length)return Promise.resolve({downloadedBytes:0,skipped:queue.length,constrained:constrained()});
  return (async()=>{
   let skipped=0;
   for(const path of queue){
    if(signal.aborted||token!==generation)break;
    if(constrained()){skipped+=queue.length-queue.indexOf(path);break}
    const entry=store.entry(path);if(!entry||entry.kind==='metadata'||entry.bytes>budgetBytes-downloaded){skipped++;continue}
    if(!await pauseForSafeWindow(signal)||!await idle(signal)){if(signal.aborted)break;continue}
    if(documentRef?.hidden){continue}
    try{const result=await store.prefetch([path],{signal,budgetBytes:budgetBytes-downloaded});downloaded+=result.downloadedBytes;skipped+=result.skipped}catch{skipped++}
   }
   return{downloadedBytes:downloaded-startDownloaded,totalDownloadedBytes:downloaded,skipped,stale:token!==generation};
  })();
 }
 function recordFrameCost(milliseconds){if(!Number.isFinite(milliseconds)||milliseconds<0)return;frameCosts.push(milliseconds);if(frameCosts.length>90)frameCosts.shift()}
 function cancel(){generation++;controller?.abort();controller=null}
 return{schedule,cancel,recordFrameCost,get downloadedBytes(){return downloaded},get frameP95(){if(!frameCosts.length)return 0;const sorted=[...frameCosts].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*.95)]}};
}
