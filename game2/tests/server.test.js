'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server'),E=require('../engine');
async function setup(t,options={}){
  const app=createServer({dataFile:false,countdownSeconds:0,...options});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function api(route,b={},token='',extra={}){const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},body:JSON.stringify(b)});return {status:response.status,...await response.json()};}
  const a=await api('session',{name:'Alpha'}),b=await api('session',{name:'Bravo'}),outsider=await api('session',{name:'Outside'});
  async function duel(ranked=false){
    const created=await api(ranked?'match':'room/create',{type:'assault',mapIndex:1},a.token);
    if(ranked)await api('match',{type:'guard'},b.token);
    else{await api('room/join',{id:created.room.id,type:'guard'},b.token);await api('room/ready',{ready:true},a.token);await api('room/ready',{ready:true},b.token);}
    const r=app.rooms.get(created.room.id);
    await load(r);
    return r;
  }
  async function load(r){
    await api('room/loaded',{matchId:r.matchId},a.token);
    await api('room/loaded',{matchId:r.matchId},b.token);
    const deadline=Date.now()+4000;
    while(r.status==='countdown'&&Date.now()<deadline)await delay(20);
    assert.equal(r.status,'playing');
  }
  return {app,base,api,a,b,outsider,duel,load};
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('default and legacy URLs work while code, backups and saved credentials are private',async t=>{
  const {base}=await setup(t);for(const route of ['/','/index.html','/tank.html']){const r=await fetch(base+route);assert.equal(r.status,200);assert.match(await r.text(),/NNY出品/);}
  for(const route of ['/server.js','/backups/index.original.html','/data/profiles.json','/../server.js'])assert.equal((await fetch(base+route)).status,404);
});
test('room setup requires membership, two distinct players and both ready',async t=>{
  const {api,a,b,outsider}=await setup(t);const r=await api('room/create',{},a.token);
  assert.equal((await api('room/ready',{ready:true},outsider.token)).status,404);
  assert.equal((await api('room/ready',{ready:true},a.token)).room.status,'waiting');
  assert.equal((await api('room/join',{id:r.room.id},a.token)).room.members.length,1);
  await api('room/join',{id:r.room.id},b.token);assert.equal((await api('room/join',{id:r.room.id},outsider.token)).status,400);
  const started=await api('room/ready',{ready:true},b.token);assert.equal(started.room.status,'loading');assert.equal(started.room.state.players.length,2);
  assert.ok(!JSON.stringify(started.room).includes(a.token));assert.ok(!JSON.stringify(started.room).includes(b.token));
});
test('server ignores forged coordinates, health, score, and rejects stale input sequences',async t=>{
  const {api,a,duel}=await setup(t);const r=await duel();const p=r.state.players[0];
  await api('input',{seq:50,skillSeq:5,dir:1,fire:false,x:90000,hp:9000,kills:99},a.token);
  assert.equal(p.hp,3);assert.equal(p.kills,0);assert.ok(p.x<100);
  await api('input',{seq:49,dir:3},a.token);assert.equal(r.members[0].input.dir,1);
  const response=await api('room/status',{},a.token);assert.equal(response.room.inputSeq,50);assert.equal(response.room.skillSeq,5);
});
test('held movement expires if player stops sending input',async t=>{
  const {api,a,duel}=await setup(t);const r=await duel();r.state.map=Array.from({length:13},()=>Array(13).fill(0));
  await api('input',{seq:1,dir:1},a.token);await delay(500);const x=r.state.players[0].x;await delay(100);assert.equal(r.state.players[0].x,x);assert.ok(x>72);
});
test('a tap between polls fires exactly once and retransmission is idempotent',async t=>{
  const {api,a,duel}=await setup(t);const r=await duel();
  await api('input',{seq:1,fire:false,fireSeq:1,skillSeq:1},a.token);await delay(50);
  assert.equal(r.state.events.filter(e=>e.type==='fire'&&e.team===0).length,1);
  assert.equal(r.state.events.filter(e=>e.type==='skill').length,1);
  await api('input',{seq:2,fire:false,fireSeq:1,skillSeq:1},a.token);await delay(50);
  assert.equal(r.state.events.filter(e=>e.type==='fire'&&e.team===0).length,1);
  assert.equal(r.state.events.filter(e=>e.type==='skill').length,1);
});
test('server timeout and disconnect decisions are visible identically to both clients',async t=>{
  const {api,a,b,duel,load}=await setup(t);const r=await duel();r.state.time=179.99;r.state.players[0].kills=1;
  await delay(50);const ar=await api('room/status',{},a.token),br=await api('room/status',{},b.token);
  assert.equal(ar.room.state.winner,0);assert.equal(br.room.state.winner,0);assert.equal(ar.room.status,'finished');
  await api('room/rematch',{},a.token);await api('room/rematch',{},b.token);await load(r);r.members[0].lastSeen=Date.now()-13000;await delay(50);
  assert.equal((await api('room/status',{},b.token)).room.state.winner,1);assert.match(r.state.reason,/掉线/);
});
test('leave produces the same result for both players and settlement happens once',async t=>{
  const {api,a,b,duel}=await setup(t);const r=await duel(true);await api('leave',{},a.token);
  const status=await api('room/status',{},b.token);assert.equal(status.room.status,'finished');assert.equal(status.room.state.winner,1);
  assert.equal((await api('profile',{},b.token)).profile.wins,1);await delay(70);assert.equal((await api('profile',{},b.token)).profile.wins,1);
  assert.equal((await api('room/rematch',{},b.token)).status,400);assert.equal(r.rewards[1].delta,12);
});
test('rematch waits for both players, rotates map and no longer counts toward ranked rating',async t=>{
  const {api,a,b,app,duel,load}=await setup(t);const r=await duel(true);E.finish(r.state,0,'test completion');
  // Settlement runs on the next server tick, exactly as after an engine kill.
  await delay(50);const before=app.profiles.get(a.token).rating;
  assert.equal((await api('room/rematch',{},a.token)).room.status,'finished');
  const next=await api('room/rematch',{},b.token);assert.equal(next.room.status,'loading');assert.equal(next.room.matchId,2);assert.equal(next.room.mapIndex,2);assert.equal(next.room.ranked,false);
  await load(r);E.finish(r.state,0,'second completion');await delay(50);assert.equal(app.profiles.get(a.token).rating,before);
});
test('casual matches never pollute leaderboard and strangers cannot reuse a token through an ID',async t=>{
  const {api,a,b,base,duel}=await setup(t);await duel();await api('leave',{},a.token);assert.equal((await api('profile',{},b.token)).profile.matches,0);
  assert.equal((await (await fetch(base+'/api/leaderboard')).json()).players.length,0);
  assert.equal((await api('profile',{},a.profile.id)).status,401);
  assert.equal((await api('room/create',{},b.token,{Origin:'https://unrelated.example'})).status,403);
});
test('profile persistence survives restart, without exposing the bearer token',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nny-test-')),file=path.join(dir,'profiles.json');
  const {app,a}=await setup(t,{dataFile:file});app.profiles.get(a.token).xp=123;app.save();
  const second=createServer({dataFile:file});t.after(()=>{second.server.emit('close');fs.rmSync(file,{force:true});fs.rmdirSync(dir);});
  assert.equal(second.profiles.get(a.token).xp,123);
});

test('both loaded acknowledgements are required; countdown freezes and ignores prestart input',async t=>{
  const {api,a,b,app}=await setup(t,{countdownSeconds:3});
  const created=await api('match',{},a.token);await api('match',{},b.token);const r=app.rooms.get(created.room.id);
  assert.equal(r.status,'loading');
  assert.equal((await api('room/loaded',{matchId:r.matchId+1},a.token)).status,409);
  await api('room/loaded',{matchId:r.matchId},a.token);await delay(80);assert.equal(r.status,'loading');assert.equal(r.state.time,0);
  await api('room/loaded',{matchId:r.matchId},b.token);assert.equal(r.status,'countdown');
  await api('input',{seq:99,fire:true,fireSeq:99,skill:true,skillSeq:99,dir:1},a.token);
  await delay(200);assert.equal(r.state.time,0);assert.equal(r.state.players[0].x,72);assert.equal(r.state.bullets.length,0);assert.equal(r.ratedStarted,false);
  const deadline=Date.now()+4000;while(r.status==='countdown'&&Date.now()<deadline)await delay(25);
  assert.equal(r.status,'playing');assert.equal(r.ratedStarted,true);assert.equal(r.state.players[0].stats.shots,0);assert.equal(r.state.players[0].stats.skillUses,0);assert.ok(r.state.time<.1);
});
test('leaving before start cancels without rank, experience or a win',async t=>{
  const {api,a,b,app}=await setup(t);const created=await api('match',{},a.token);await api('match',{},b.token);
  const r=app.rooms.get(created.room.id);await api('leave',{},a.token);assert.equal(r.status,'finished');assert.equal(r.state.winner,-1);
  const profile=(await api('profile',{},b.token)).profile;assert.equal(profile.rating,1000);assert.equal(profile.matches,0);assert.equal(profile.xp,0);
});
test('absolute loading timeout cancels even if a broken client continues to poll',async t=>{
  const {api,a,b,app}=await setup(t);const created=await api('match',{},a.token);await api('match',{},b.token);
  const r=app.rooms.get(created.room.id);r.loadingAt=Date.now()-21000;await api('room/status',{},a.token);await delay(50);
  assert.equal(r.status,'finished');assert.equal(r.state.winner,-1);assert.match(r.state.reason,/20 秒/);assert.equal(r.rewards[0].xp,0);
});
