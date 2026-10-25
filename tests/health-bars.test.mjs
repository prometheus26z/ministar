import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {healthBarLayout,healthBarPixels} from '../dist/presentation.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));
for(const type of [173,174,142,111])test(`building ${type}: health bar follows sprite width and bottom at all camera zooms`,()=>{
 const def=data.units[type],g=data.graphics[def.image],u={x:640,y:1000,r:def.radius,def},f=g.frames[0],bodyWidth=f[4]*.5,left=(f[2]-g.canvas[0]/2)*.5,bottom=(f[3]-g.canvas[1]/2+f[5])*.5;
 for(const zoom of [.25,.4,.6,1,1.4]){
  const bar=healthBarLayout(u,g,zoom);assert.ok(Math.abs(bar.width*zoom-bodyWidth*zoom*.85)<=.5);
  assert.ok(Math.abs(bar.x+bar.width/2-(u.x+left+bodyWidth/2))<1e-8);
  assert.ok(Math.abs((bar.y-u.y-bottom)*zoom-5)<1e-8);
 }
 assert.ok(healthBarLayout(u,g,1.4).pixels>healthBarLayout(u,g,.25).pixels,'building bars must not keep a fixed screen width');
});
test('mobile unit bars keep their existing readable screen pixel size',()=>{
 const def=data.units[0],u={x:100,y:200,r:def.radius,def},g=data.graphics[def.image];
 assert.equal(healthBarLayout(u,g,.25).pixels,healthBarLayout(u,g,1.4).pixels);assert.equal(healthBarPixels(81),Math.round(79*.85));
});
