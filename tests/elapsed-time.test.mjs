import test from 'node:test';
import assert from 'node:assert/strict';
import {formatElapsedTime} from '../dist/presentation.js';

test('elapsed game time formats accumulated whole seconds without a minute limit',()=>{
 for(const [value,formatted]of [
  [0,'00:00'],[59.999,'00:59'],[60,'01:00'],[3599.999,'59:59'],
  [3600,'60:00'],[6000,'100:00'],[90061,'1501:01'],
 ])assert.equal(formatElapsedTime(value),formatted,String(value));
});

test('elapsed game time safely formats invalid and negative input as zero',()=>{
 for(const value of [-1,NaN,Infinity,-Infinity,undefined])assert.equal(formatElapsedTime(value),'00:00');
});
