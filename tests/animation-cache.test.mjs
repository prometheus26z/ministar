import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMATION_CACHE_METRICS,pose,trackFor,transitionSeconds,steadyStartSeconds,timelineCacheSize} from '../dist/animation.js';

const graphic=()=>({
 sourceImage:921,turns:false,frames:Array.from({length:32},(_,i)=>[i,0,0,0,32,32]),
 tracks:{
  idle:{loop:true,loopStart:1,frames:[[0,3],[1,5,{randomWait:[4,9]}],[2,7]]},
  walk:{loop:true,loopStart:0,frames:[[3,4],[4,4]]},
  death:{loop:false,ended:true,transitionSignal:4,frames:[[5,3],[6,5]]},
  attack:{loop:false,frames:[[10,4],[11,5]],rangeVariants:{threshold:100,near:{loop:false,frames:[[8,2],[9,3]]}}}
 }
});

test('randomWait uses identical seeded frames on a hit and after LRU eviction',()=>{
 const g=graphic(),track=g.tracks.idle,first=pose(g,'idle',.3,0,{seed:5});
 assert.deepEqual(pose(g,'idle',.3,0,{seed:5}),first);
 assert.equal(timelineCacheSize(g,track),1);
 const before=ANIMATION_CACHE_METRICS.misses;
 for(let seed=6;seed<450;seed++)pose(g,'idle',.3,0,{seed});
 assert.equal(timelineCacheSize(g,track),256);
 assert.ok(ANIMATION_CACHE_METRICS.maxSeedEntries<=256);
 assert.deepEqual(pose(g,'idle',.3,0,{seed:5}),first,'eviction must recompute the same source frames');
 assert.ok(ANIMATION_CACHE_METRICS.misses>before);
 assert.deepEqual(pose(g,'idle',.3,0,{seed:5+2**32}),first,'source randomWait hashes seed|0');
});

test('ordinary tracks share one timeline across all seeds and preserve intro handling',()=>{
 const g=graphic(),track=g.tracks.walk,before=ANIMATION_CACHE_METRICS.hits;
 for(let seed=-200;seed<=200;seed++)assert.deepEqual(pose(g,'walk',.15,0,{seed}),{frame:3,flip:false});
 assert.equal(timelineCacheSize(g,track),1);assert.ok(ANIMATION_CACHE_METRICS.hits>before);
 assert.equal(steadyStartSeconds(g,'idle',{seed:41}),3/24);
 assert.equal(pose(g,'idle',0,0,{seed:41,skipSpawnIntro:true}).frame,pose(g,'idle',3/24,0,{seed:41}).frame);
});

test('selected near/far and override tracks remain separate; dynamic pose fields stay live',()=>{
 const g=graphic(),near=trackFor(g,'attack',{targetDistance:50}),far=trackFor(g,'attack',{targetDistance:150});
 assert.notStrictEqual(near,far);
 assert.equal(pose(g,'attack',0,0,{targetDistance:50}).frame,8);
 assert.equal(pose(g,'attack',0,0,{targetDistance:150}).frame,10);
 assert.equal(timelineCacheSize(g,near),1);assert.equal(timelineCacheSize(g,far),1);
 assert.equal(pose(g,'death',.4,0).hidden,true);
 assert.equal(transitionSeconds(g,'death'),8/24);
 assert.equal(pose(g,'attack',0,0,{trackOverride:'walk'}).frame,3);
 const inherited={...g,tracks:{idle:{loop:false,followParent:true,frames:[[null,3,{inheritFrame:true}]]}}};
 assert.deepEqual(pose(inherited,'idle',0,0,{parentFrame:12,inheritedFrame:7}),{frame:12,flip:false});
});
