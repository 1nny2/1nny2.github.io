import assert from 'node:assert/strict';
import { wristSteering } from '../src/wrist.js';
import { echoReading } from '../src/echo.js';
const palm=(x,y,scale=1)=>Array.from({length:21},(_,i)=>i===9?{x:.5+x*scale,y:.7-y*scale}:{x:.5,y:.7});
assert.equal(wristSteering(palm(0,.2)),0);
assert(wristSteering(palm(.09,.2))<0);
assert(wristSteering(palm(-.09,.2))>0);
assert(Math.abs(wristSteering(palm(.09,.2))-wristSteering(palm(.09,.2,.5)))<1e-10);
assert.equal(wristSteering(palm(0,-.2)),0);
assert(echoReading({distance:270,azimuth:.8}).ready);
assert.match(echoReading({distance:400}).guidance,/过远/);
assert.match(echoReading({distance:180}).guidance,/过近/);
assert.match(echoReading({distance:270,azimuth:0}).guidance,/角度偏离/);
assert.match(echoReading({distance:270,azimuth:.8,polar:.6}).guidance,/俯仰偏离/);
console.log('PASS: wrist direction, dead zone, scale invariance, and observation guidance.');

