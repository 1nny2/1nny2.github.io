'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine');
function arena(options={}){const s=E.create({mode:'duel',countdown:0,...options});s.map=Array.from({length:13},()=>Array(13).fill(0));s.players.forEach(p=>p.invulnerable=0);return s;}
function tick(s,seconds,inputs=[],fps=60){for(let i=0;i<Math.round(seconds*fps);i++)E.step(s,inputs,1/fps);}
function hit(s,target,dir=2){const p=s.players[target];s.bullets.push({id:++s.entityId,x:p.x-E.DIR[dir][0]*21,y:p.y-E.DIR[dir][1]*21,dir,owner:1-target,team:1-target,life:1});E.step(s);}

test('movement and bullet speed are independent of rendering FPS',()=>{
  const result=[30,60,144].map(fps=>{const s=arena();tick(s,1,[{dir:1}],fps);return s.players[0].x;});
  for(const x of result)assert.ok(Math.abs(x-204)<.001,`expected 204, got ${x}`);
});
test('both players can damage the opponent; friendly projectiles never damage self',()=>{
  for(const target of [0,1]){const s=arena();const hp=s.players[target].hp;hit(s,target);assert.equal(s.players[target].hp,hp-1);}
  const s=arena(),p=s.players[0];s.bullets.push({id:10,x:p.x,y:p.y-21,dir:2,owner:0,team:0,life:1});E.step(s);assert.equal(p.hp,p.maxHp);
});
test('spawn invulnerability and frontal shield block damage; rear remains vulnerable',()=>{
  const s=arena({types:['guard','assault']}),p=s.players[0];p.invulnerable=1;hit(s,0);assert.equal(p.hp,4);
  p.invulnerable=0;p.shield=2;p.dir=0;hit(s,0,2);assert.equal(p.hp,4);
  hit(s,0,0);assert.equal(p.hp,3);
});
test('three confirmed kills decide the match and finished matches cannot change',()=>{
  const s=arena();s.players[0].kills=2;s.players[1].hp=1;hit(s,1);
  assert.equal(s.phase,'finished');assert.equal(s.winner,0);assert.equal(s.players[0].kills,3);
  const before=JSON.stringify(s);tick(s,1,[{fire:true},{fire:true}]);assert.equal(JSON.stringify(s),before);
});
test('time limit compares kills, then remaining HP, then draws',()=>{
  for(const [ak,bk,ah,bh,winner] of [[2,1,1,3,0],[1,1,1,2,1],[0,0,3,3,-1]]){
    const s=arena();s.time=179.99;s.players[0].kills=ak;s.players[1].kills=bk;s.players[0].hp=ah;s.players[1].hp=bh;E.step(s);assert.equal(s.winner,winner);assert.equal(s.phase,'finished');assert.equal(s.time,180);
  }
});
test('dead tank respawns safely with protection',()=>{
  const s=arena(),p=s.players[1];p.hp=1;hit(s,1);assert.equal(p.hp,0);tick(s,1.7);assert.equal(p.hp,p.maxHp);assert.ok(p.invulnerable>1);assert.equal(p.x,552);
});
test('dash cannot cross solid terrain; skill is edge triggered',()=>{
  const s=arena(),p=s.players[0];s.map[1][2]=2;tick(s,1,[{dir:1,skill:true}]);assert.ok(p.x<=79);assert.ok(p.skillCD>5);assert.equal(s.events.filter(e=>e.type==='skill').length,1);
});
test('engineer creates destructible temporary cover; invalid placement has no cooldown',()=>{
  const s=arena({types:['engineer','assault']}),p=s.players[0];p.dir=1;E.step(s,[{skill:true}]);assert.equal(s.cover.length,1);assert.ok(p.skillCD>7);
  tick(s,5.1);assert.equal(s.cover.length,0);
  const invalid=arena({types:['engineer','assault']});invalid.players[0].dir=1;invalid.map[1][2]=2;E.step(invalid,[{skill:true}]);assert.equal(invalid.cover.length,0);assert.equal(invalid.players[0].skillCD,0);
});
test('brick can be destroyed, steel cannot, and water permits bullets',()=>{
  for(const [tile,expected] of [[1,0],[2,2],[4,4]]){const s=arena();s.map[2][2]=tile;s.bullets.push({id:3,x:120,y:91,dir:2,team:0,owner:0,life:1});tick(s,.1);assert.equal(s.map[2][2],expected);assert.equal(s.bullets.length,tile===4?1:0);}
});
test('friendly fire does not hurt the base; three enemy hits cause defeat',()=>{
  const s=E.create({mode:'single'});s.spawnTimer=9999;
  const shot=team=>{s.bullets.push({id:++s.entityId,x:312,y:550,dir:2,team,owner:team===0?0:99,life:1});E.step(s);};
  shot(0);assert.equal(s.baseHp,3);for(let i=0;i<3;i++)shot(1);assert.equal(s.baseHp,0);assert.equal(s.winner,-1);
});
test('all maps are rotationally symmetric, spawns safe and connected',()=>{
  for(let index=0;index<3;index++){
    const m=E.mapFor(index);for(let r=0;r<13;r++)for(let c=0;c<13;c++)assert.equal(m[r][c],m[12-r][12-c]);
    assert.equal(m[1][1],0);assert.equal(m[11][11],0);
    const seen=new Set(['1,1']),queue=[[1,1]];for(let i=0;i<queue.length;i++){const [r,c]=queue[i];for(const [dc,dr]of E.DIR){const nr=r+dr,nc=c+dc,key=`${nr},${nc}`;if(nr>=0&&nr<13&&nc>=0&&nc<13&&[0,3].includes(m[nr][nc])&&!seen.has(key)){seen.add(key);queue.push([nr,nc]);}}}assert.ok(seen.has('11,11'));
  }
});
test('five completed defense waves win and earlier waves change map',()=>{
  const s=E.create({mode:'single'});s.spawnLeft=0;s.nextWave=1.99;E.step(s);assert.equal(s.wave,2);assert.equal(s.mapIndex,1);
  s.wave=5;s.spawnLeft=0;s.enemies=[];s.nextWave=1.99;E.step(s);assert.equal(s.phase,'finished');assert.equal(s.winner,0);
});
test('bad input is sanitized before simulation',()=>{
  assert.deepEqual(E.input({dir:NaN,fire:'true',skill:1}),{dir:-1,fire:false,skill:false});assert.deepEqual(E.input({dir:9,fire:true,skill:true}),{dir:-1,fire:true,skill:true});
  assert.equal(E.create({types:['__proto__']}).players[0].type,'assault');
});

test('three-second countdown freezes time, movement, fire, skills and protection',()=>{
  const s=E.create({mode:'duel'}),p=s.players[0];
  tick(s,2.9,[{dir:1,fire:true,skill:true}]);
  assert.equal(s.phase,'countdown');assert.equal(s.time,0);assert.equal(s.remaining,180);assert.equal(p.x,72);assert.equal(p.stats.shots,0);assert.equal(p.skillCD,0);assert.equal(p.invulnerable,1.5);
  tick(s,.1,[{dir:1,fire:true,skill:true}]);assert.equal(s.phase,'playing');assert.equal(s.time,0);assert.equal(s.events.at(-1).type,'start');
  E.step(s);assert.ok(s.time>0);assert.equal(p.stats.shots,0);
});
test('timeout compares health percentage fairly across different max HP',()=>{
  for(const [ah,bh,winner] of [[3,4,-1],[2,2,0],[1,2,1]]){
    const s=arena({types:['assault','guard']});s.players[0].hp=ah;s.players[1].hp=bh;s.time=179.99;E.step(s);assert.equal(s.winner,winner);assert.match(s.reason,/百分比/);
  }
});
test('turn alignment and buffered corners work without crossing walls at multiple FPS',()=>{
  for(const fps of [30,60,144]){
    const s=arena(),p=s.players[0];s.map=Array.from({length:13},()=>Array(13).fill(2));
    for(let c=1;c<=5;c++)s.map[1][c]=0;for(let r=1;r<=5;r++)s.map[r][3]=0;
    p.x=146;p.y=72;p.moveDir=1;
    tick(s,.5,[{dir:2}],fps);assert.ok(p.y>100,`corner at ${fps}: ${p.x},${p.y}`);assert.equal(p.x,168);assert.equal(E.blocked(s,p.x,p.y,p),false);
    E.step(s,[]);assert.equal(p.moveDir,-1);assert.equal(p.turnTTL,0);
  }
  const s=arena(),p=s.players[0];p.x=80;p.y=72;E.step(s,[{dir:2}]);assert.equal(p.x,72);
});
test('cover preview matches placement and rejected skill does not consume cooldown',()=>{
  const s=arena({types:['engineer','assault']}),p=s.players[0];p.dir=1;
  const target=E.coverPlacement(s,p);assert.equal(target.ok,true);E.step(s,[{skill:true}]);assert.equal(s.cover[0].x,target.x);assert.equal(s.cover[0].owner,0);assert.equal(p.stats.skillUses,1);
  const invalid=arena({types:['engineer','assault']}),q=invalid.players[0];q.dir=1;invalid.map[1][2]=4;
  const check=E.coverPlacement(invalid,q);assert.equal(check.ok,false);E.step(invalid,[{skill:true}]);assert.equal(invalid.events.at(-1).reason,check.reason);assert.equal(q.skillCD,0);assert.equal(q.stats.skillUses,0);
});
test('combat statistics separate shield, damage and hostile cover impacts',()=>{
  const s=arena({types:['guard','assault']}),p=s.players[0];p.shield=2;p.dir=0;hit(s,0,2);assert.equal(p.stats.blocks,1);assert.equal(p.stats.damageTaken,0);assert.equal(s.players[1].stats.hits,0);
  hit(s,0,0);assert.equal(p.stats.damageTaken,1);assert.equal(s.players[1].stats.hits,1);
  const c=arena({types:['engineer','assault']});c.players[0].dir=1;E.step(c,[{skill:true}]);
  for(const team of [0,1]){c.bullets.push({id:++c.entityId,x:120,y:44,dir:2,team,owner:team,life:1});tick(c,.04);}
  assert.equal(c.players[0].stats.coverBlocks,1);
});
test('practice remains a single-player sandbox without enemy waves or a base',()=>{
  const s=E.create({mode:'practice'});tick(s,20,[{fire:true}]);assert.equal(s.players.length,1);assert.equal(s.enemies.length,0);assert.equal(s.phase,'playing');assert.ok(!s.map.flat().includes(5));assert.ok(s.players[0].stats.shots>0);
});
