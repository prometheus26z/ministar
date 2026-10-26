import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {healthBarLayout,healthBarPixels,healthBarFillWidth} from '../dist/presentation.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/data.json',import.meta.url))),extra=JSON.parse(fs.readFileSync(new URL('../dist/rts-data.json',import.meta.url)));
Object.assign(data.units,extra.units);Object.assign(data.graphics,extra.graphics,JSON.parse(fs.readFileSync(new URL('../dist/original-animation-data.json',import.meta.url))));
for(const type of [173,174,142,111])test(`building ${type}: health bar follows sprite width and bottom at all camera zooms`,()=>{
 const def=data.units[type],g=data.graphics[def.image],u={x:640,y:1000,r:def.radius,def},f=g.frames[0],bodyWidth=f[4]*.5,left=(f[2]-g.canvas[0]/2)*.5,bottom=(f[3]-g.canvas[1]/2+f[5])*.5;
 for(const zoom of [.25,.4,.6,1,1.4]){const bar=healthBarLayout(u,g,zoom);assert.ok(Math.abs(bar.width-bodyWidth*.85)<=.5);assert.ok(Math.abs(bar.pixels-bar.width*zoom)<1e-8);assert.ok(Math.abs(bar.x+bar.width/2-(u.x+left+bodyWidth/2))<1e-8);assert.ok(Math.abs(bar.y-u.y-bottom-5)<1e-8)}
 assert.ok(healthBarLayout(u,g,1.4).pixels>healthBarLayout(u,g,.25).pixels,'building bars scale in world space');
});
for(const type of [0,37,66,39])test(`unit ${type}: health bar retains a stable world width at every zoom`,()=>{
 const def=data.units[type],g=data.graphics[def.image],u={x:640,y:1000,r:def.radius,def},expected=healthBarPixels(g?.healthBarSize||def.healthBarSize||def.footprint?.[0]||def.radius*2);
 const bars=[.25,.4,.6,1,1.4].map(zoom=>healthBarLayout(u,g,zoom));assert.ok(bars.every(bar=>Math.abs(bar.width-expected)<1e-8));assert.deepEqual(bars.map(bar=>bar.pixels),bars.map((_,i)=>expected*[.25,.4,.6,1,1.4][i]));assert.equal(bars[0].y-u.y-def.radius-5,0);
});
test('health bar source widths retain the original clamp and segment rounding',()=>{assert.equal(healthBarPixels(81),Math.round(79*.85));assert.equal(healthBarPixels(9),Math.round(19*.85))});
test('health and shield fills stay empty at zero and show a segment for any positive value',()=>{assert.equal(healthBarFillWidth(0,24),0);assert.equal(healthBarFillWidth(1,24),3);assert.equal(healthBarFillWidth(100,24),24)});
