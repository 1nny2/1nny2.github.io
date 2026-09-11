'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../progress');
const report=(id,extra={})=>({id,type:'assault',mode:'ranked',kills:2,deaths:1,seconds:90,stats:{skillUses:3,shots:10,hits:5},...extra});
test('mastery sums completed matches, grants each mission once and deduplicates reloads',()=>{
  const a=P.record({},report('a'));assert.equal(a.xp,0);
  const b=P.record(a.progress,report('b'));assert.equal(b.xp,30);assert.equal(b.progress.tanks.assault.skills,6);
  const duplicate=P.record(b.progress,report('b'));assert.equal(duplicate.recorded,false);assert.equal(duplicate.xp,0);assert.equal(duplicate.progress.history.length,2);
  const c=P.record(b.progress,report('c'));assert.equal(c.xp,0);assert.equal(c.progress.tanks.assault.skills,9);
});
test('practice, tutorial and invalid reports cannot grant progress',()=>{
  for(const mode of ['practice','tutorial','other']){const r=P.record({},report(mode,{mode,won:true,stats:{skillUses:100}}));assert.equal(r.recorded,false);assert.equal(r.xp,0);}
  assert.equal(P.record({},report('bad',{type:'__proto__'})).recorded,false);
});
test('defense, shield and cover missions are distinct and recent history is bounded',()=>{
  let r=P.record({},report('guard',{type:'guard',stats:{blocks:8}}));assert.equal(r.xp,45);
  r=P.record(r.progress,report('engineer',{type:'engineer',stats:{coverBlocks:8}}));assert.equal(r.xp,45);
  r=P.record(r.progress,report('defense',{mode:'coop',won:true}));assert.equal(r.xp,60);
  for(let i=0;i<10;i++)r=P.record(r.progress,report('history'+i));assert.equal(r.progress.history.length,8);assert.equal(r.progress.history[0].id,'history9');
});
