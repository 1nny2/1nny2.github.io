/* NNY出品 · 浩源 · 浪尖儿社区 — shared deterministic game rules. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TankEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TILE = 48, SIZE = 624, STEP = 1 / 60;
  const DIR = [[0,-1],[1,0],[0,1],[-1,0]];
  const TYPES = Object.assign(Object.create(null), {
    assault: {name:'疾风', role:'突击', skill:'推进冲刺', desc:'向前快速推进，抢占路口。', speed:132, hp:3, reload:.42, cooldown:7, unlock:0},
    guard: {name:'磐石', role:'防御', skill:'正面护盾', desc:'抵挡来自正面的炮弹，持续 2 秒。', speed:108, hp:4, reload:.52, cooldown:9, unlock:120},
    engineer: {name:'筑垒', role:'工程', skill:'临时掩体', desc:'在前方架设掩体，持续 5 秒；可被击毁。', speed:120, hp:3, reload:.38, cooldown:8, unlock:260}
  });
  const MAP_NAMES = ['交错前线','钢铁回廊','河岸争夺'];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function mapFor(index=0, mode='duel') {
    const m = Array.from({length:13},()=>Array(13).fill(0));
    const put = (r,c,v) => {m[r][c]=v; m[12-r][12-c]=v;};
    if (index===0) {
      [[2,3],[2,4],[3,3],[4,1],[4,5],[5,5],[3,8],[5,9],[6,3]].forEach(([r,c])=>put(r,c,1));
      [[1,6],[4,7],[6,1]].forEach(([r,c])=>put(r,c,2));
      [[2,9],[3,9],[6,5],[6,6]].forEach(([r,c])=>put(r,c,3));
    } else if(index===1) {
      [[2,2],[2,3],[2,4],[4,4],[4,6],[4,8],[6,2]].forEach(([r,c])=>put(r,c,2));
      [[2,5],[3,6],[4,5],[5,8],[6,4]].forEach(([r,c])=>put(r,c,1));
      [[1,8],[2,8],[5,1]].forEach(([r,c])=>put(r,c,3));
    } else {
      [[3,3],[4,3],[5,3],[3,4],[3,5]].forEach(([r,c])=>put(r,c,4));
      [[2,7],[3,7],[4,7],[5,5],[6,1]].forEach(([r,c])=>put(r,c,1));
      [[2,9],[6,6]].forEach(([r,c])=>put(r,c,2));
      [[1,5],[2,5],[5,1]].forEach(([r,c])=>put(r,c,3));
    }
    // Both spawn zones and every route along the perimeter remain clear.
    for (const [r,c] of [[1,1],[1,2],[2,1],[11,11],[11,10],[10,11]]) m[r][c]=0;
    if(mode==='single'||mode==='coop') {
      m[11][6]=5;
      for(const [r,c] of [[10,5],[10,6],[10,7],[11,5],[11,7]])m[r][c]=1;
      for(const c of [2,6,10]) {m[0][c]=0; m[1][c]=0;}
      m[12][3]=0; m[12][9]=0;
    }
    return m;
  }
  function input(value={}) {
    return {dir:Number.isInteger(value.dir)&&value.dir>=0&&value.dir<4?value.dir:-1,
      fire:value.fire===true, skill:value.skill===true};
  }
  function tank(id, team, type, x,y,dir,name) {
    type = TYPES[type]?type:'assault';
    return {id,team,type,x,y,dir,name:name||TYPES[type].name,hp:TYPES[type].hp,maxHp:TYPES[type].hp,
      kills:0,deaths:0,fireCD:0,skillCD:0,shield:0,dash:0,invulnerable:1.5,respawn:0,hitFlash:0,blockFlash:0,
      moveDir:-1,turnDir:-1,turnTTL:0,skillHeld:false,aiTime:0,aiDir:dir,
      stats:{shots:0,hits:0,damageTaken:0,blocks:0,coverBlocks:0,skillUses:0,distance:0}};
  }
  function create(options={}) {
    const mode=['duel','single','coop','practice'].includes(options.mode)?options.mode:'single';
    const mapIndex=clamp(Math.trunc(options.mapIndex)||0,0,2);
    const state={mode,mapIndex,map:mapFor(mapIndex,mode),time:0,remaining:mode==='duel'?180:0,
      phase:mode==='duel'&&options.countdown!==0?'countdown':'playing',countdown:mode==='duel'&&options.countdown!==0?3:0,winner:null,reason:'',wave:1,score:0,lives:mode==='coop'?6:3,
      baseHp:3,spawnLeft:6,spawnTimer:1,nextWave:0,players:[],enemies:[],bullets:[],cover:[],events:[],eventId:0,
      entityId:2,seed:(options.seed||83193)>>>0};
    const count=['single','practice'].includes(mode)?1:2;
    for(let i=0;i<count;i++) {
      const pos=mode==='duel'?(i===0?[72,72,2]:[552,552,0]):[i===0?168:456,600,0];
      state.players.push(tank(i,mode==='duel'?i:0,options.types?.[i]||'assault',...pos,options.names?.[i]||`P${i+1}`));
    }
    return state;
  }
  function random(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;}
  function event(s,type,x,y,extra={}) {
    s.events.push({id:++s.eventId,type,x,y,...extra});
    if(s.events.length>60)s.events.shift();
  }
  function blocked(s,x,y,t,half=17) {
    if(x-half<0||y-half<0||x+half>SIZE||y+half>SIZE)return true;
    for(const dx of [-half,half])for(const dy of [-half,half]) {
      const tile=s.map[Math.floor((y+dy)/TILE)]?.[Math.floor((x+dx)/TILE)];
      if([1,2,4,5].includes(tile))return true;
    }
    if(s.cover.some(c=>Math.abs(c.x-x)<TILE/2+half&&Math.abs(c.y-y)<TILE/2+half))return true;
    return [...s.players,...s.enemies].some(p=>p!==t&&p.hp>0&&Math.abs(p.x-x)<half+16&&Math.abs(p.y-y)<half+16);
  }
  function advance(s,t,dir,distance,align=true,probe=0) {
    const d=DIR[dir];let x=t.x,y=t.y;
    if(align){
      const axis=d[0]?y:x,centre=Math.floor(axis/TILE)*TILE+TILE/2,offset=centre-axis;
      if(Math.abs(offset)<=12){
        const steps=Math.max(1,Math.ceil(Math.abs(offset)/2));let clear=true;
        for(let i=1;i<=steps;i++)if(blocked(s,x+(d[0]?0:offset*i/steps),y+(d[0]?offset*i/steps:0),t)){clear=false;break;}
        if(clear){if(d[0])y=centre;else x=centre;}
      }
    }
    for(let offset=3;offset<=probe;offset+=3)if(blocked(s,x+d[0]*offset,y+d[1]*offset,t))return false;
    const steps=Math.max(1,Math.ceil(distance/3));let moved=false;
    for(let i=0;i<steps;i++){
      const nx=x+d[0]*distance/steps,ny=y+d[1]*distance/steps;
      if(blocked(s,nx,ny,t))break;x=nx;y=ny;moved=true;
    }
    if(moved){t.stats.distance+=Math.hypot(x-t.x,y-t.y);t.x=x;t.y=y;t.dir=dir;}
    return moved;
  }
  function move(s,t,dir,dt) {
    if(!DIR[dir])return;
    const distance=(t.enemy?t.speed:TYPES[t.type].speed)*(t.dash>0?2.8:1)*dt;
    const turning=!t.enemy&&t.moveDir>=0&&(dir%2)!==(t.moveDir%2);
    if(advance(s,t,dir,distance,true,turning?24:0)){t.moveDir=dir;t.turnDir=-1;t.turnTTL=0;return;}
    if(turning){
      // Keep a requested turn for 220 ms while advancing toward the intersection.
      if(t.turnDir!==dir){t.turnDir=dir;t.turnTTL=.22;}
      t.turnTTL=Math.max(0,t.turnTTL-dt);
      if(t.turnTTL>0&&advance(s,t,t.moveDir,distance,false))return;
    }
    t.dir=dir;
  }
  function coverPlacement(s,t) {
    const d=DIR[t.dir],col=Math.floor(t.x/TILE)+d[0],row=Math.floor(t.y/TILE)+d[1];
    const point={x:col*TILE+24,y:row*TILE+24,row,col,ok:false,reason:''};
    if(row<0||row>12||col<0||col>12)point.reason='不能放在战场外';
    else if(![0,3].includes(s.map[row][col]))point.reason='地形阻挡，换个位置';
    else if(blocked(s,point.x,point.y,null,23))point.reason='位置被战车或掩体占用';
    else if(t.hp<=0)point.reason='等待战车复活';
    else if(t.skillCD>0)point.reason='技能冷却中';
    else point.ok=true;
    return point;
  }
  function activate(s,t) {
    if(t.skillCD>0||t.hp<=0)return;
    if(t.type==='assault')t.dash=.2;
    if(t.type==='guard')t.shield=2;
    if(t.type==='engineer') {
      const placement=coverPlacement(s,t);
      if(!placement.ok){event(s,'skill_blocked',t.x,t.y,{target:t.id,reason:placement.reason});return;}
      s.cover.push({x:placement.x,y:placement.y,life:5,hp:2,team:t.team,owner:t.id});
    }
    t.skillCD=TYPES[t.type].cooldown;
    t.stats.skillUses++;
    event(s,'skill',t.x,t.y,{typeName:t.type,target:t.id});
  }
  function fire(s,t) {
    if(t.fireCD>0||t.hp<=0)return;
    t.fireCD=t.enemy?.9:TYPES[t.type].reload;
    t.stats.shots++;
    const d=DIR[t.dir];
    s.bullets.push({id:++s.entityId,x:t.x+d[0]*23,y:t.y+d[1]*23,dir:t.dir,owner:t.id,team:t.team,life:3});
    event(s,'fire',t.x,t.y,{dir:t.dir,team:t.team,owner:t.id});
  }
  function respawn(s,t) {
    const positions=s.mode==='duel'?(t.id===0?[[72,72],[168,24],[24,168]]:[[552,552],[456,600],[600,456]]):[[t.id===0?168:456,600],[24,600],[600,600]];
    const pos=positions.find(([x,y])=>!blocked(s,x,y,t));
    if(!pos){t.respawn=.2;return;}
    [t.x,t.y]=pos;t.hp=t.maxHp;t.invulnerable=1.5;t.dir=s.mode==='duel'&&t.id===0?2:0;t.moveDir=-1;t.turnDir=-1;t.turnTTL=0;
  }
  function finish(s,winner,reason){if(s.phase==='finished')return;s.phase='finished';s.winner=winner;s.reason=reason;event(s,'finish',312,312);}
  function damage(s,t,b) {
    if(t.hp<=0)return;
    if(t.invulnerable>0){event(s,'protected',t.x,t.y,{target:t.id,owner:b.owner});return;}
    if(t.shield>0&&t.dir===(b.dir+2)%4){t.stats.blocks++;t.blockFlash=.2;event(s,'shield',t.x,t.y,{target:t.id,owner:b.owner});return;}
    const owner=s.players.find(p=>p.id===b.owner);
    if(owner)owner.stats.hits++;
    t.hp--;t.stats.damageTaken++;t.hitFlash=.12;event(s,'hit',t.x,t.y,{team:t.team,target:t.id,owner:b.owner});
    if(t.hp>0){t.invulnerable=.15;return;}
    t.deaths++;t.respawn=1.6;t.shield=0;t.dash=0;
    if(owner)owner.kills++;
    event(s,'explosion',t.x,t.y,{team:t.team,target:t.id,owner:b.owner,name:t.name,enemy:!!t.enemy});
    if(t.enemy){s.score+=100;return;}
    if(s.mode==='duel') {
      if(owner&&owner.kills>=3)finish(s,owner.id,'率先完成 3 次击毁');
    } else {s.lives--;if(s.lives<=0)finish(s,-1,'队伍的复活机会已用尽');}
  }
  function updateBullets(s,dt) {
    for(const b of s.bullets) {
      b.life-=dt;
      const steps=Math.ceil(300*dt/5),d=DIR[b.dir];
      for(let i=0;i<steps&&b.life>0;i++) {
        b.x+=d[0]*300*dt/steps;b.y+=d[1]*300*dt/steps;
        if(b.x<0||b.y<0||b.x>=SIZE||b.y>=SIZE){b.life=0;break;}
        const row=Math.floor(b.y/TILE),col=Math.floor(b.x/TILE),tile=s.map[row][col];
        if(tile===1||tile===2||tile===5) {
          b.life=0;
          if(tile===1){s.map[row][col]=0;event(s,'brick',b.x,b.y);}
          if(tile===5&&b.team!==0){s.baseHp--;event(s,'hit',b.x,b.y);if(s.baseHp<=0)finish(s,-1,'基地被摧毁');}
          break;
        }
        const c=s.cover.find(c=>Math.abs(c.x-b.x)<24&&Math.abs(c.y-b.y)<24);
        if(c){c.hp--;b.life=0;if(b.team!==c.team){const builder=s.players.find(p=>p.id===c.owner);if(builder)builder.stats.coverBlocks++;}event(s,'cover_hit',c.x,c.y,{owner:b.owner,builder:c.owner,hostile:b.team!==c.team});break;}
        const t=[...s.players,...s.enemies].find(t=>t.hp>0&&t.team!==b.team&&Math.abs(t.x-b.x)<19&&Math.abs(t.y-b.y)<19);
        if(t){b.life=0;damage(s,t,b);break;}
        const other=s.bullets.find(o=>o!==b&&o.life>0&&o.team!==b.team&&Math.hypot(o.x-b.x,o.y-b.y)<10);
        if(other){b.life=0;other.life=0;event(s,'spark',b.x,b.y);}
      }
    }
    s.bullets=s.bullets.filter(b=>b.life>0);
  }
  function updateWaves(s,dt) {
    s.spawnTimer-=dt;
    if(s.spawnLeft>0&&s.spawnTimer<=0&&s.enemies.length<5) {
      const cols=[2,6,10],offset=Math.floor(random(s)*3);
      const x=[0,1,2].map(i=>cols[(i+offset)%3]*TILE+24).find(x=>!blocked(s,x,24,null));
      if(x!==undefined){const e=tank(++s.entityId,1,'assault',x,24,2,'敌方坦克');e.enemy=true;e.speed=70+s.wave*7;e.maxHp=e.hp=s.wave>=3?2:1;s.enemies.push(e);s.spawnLeft--;s.spawnTimer=1.6;}
    }
    for(const e of s.enemies) {
      for(const key of ['fireCD','invulnerable','hitFlash','blockFlash'])e[key]=Math.max(0,e[key]-dt);
      e.aiTime-=dt;
      if(e.aiTime<=0){
        const target=random(s)<.55?{x:312,y:552}:s.players.find(p=>p.hp>0)||{x:312,y:552};
        const dx=target.x-e.x,dy=target.y-e.y;
        e.aiDir=random(s)<.65?(Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy>0?2:0)):Math.floor(random(s)*4);
        e.aiTime=.45+random(s)*.8;
      }
      const oldX=e.x,oldY=e.y;move(s,e,e.aiDir,dt);
      if(e.x===oldX&&e.y===oldY)e.aiTime=0;
      fire(s,e);
    }
    s.enemies=s.enemies.filter(e=>e.hp>0);
    if(s.spawnLeft===0&&s.enemies.length===0) {
      s.nextWave+=dt;
      if(s.nextWave>2){
        if(s.wave>=5){finish(s,0,'基地守卫成功 · 五波全部完成');return;}
        s.wave++;s.mapIndex=(s.mapIndex+1)%3;s.map=mapFor(s.mapIndex,s.mode);s.cover=[];s.bullets=[];
        for(const p of s.players){p.hp=0;respawn(s,p);}
        s.spawnLeft=4+s.wave*2;s.spawnTimer=1;s.nextWave=0;event(s,'wave',312,312);
      }
    }
  }
  function step(s,inputs=[],dt=STEP) {
    dt=clamp(Number(dt)||STEP,.001,.05);
    if(s.phase==='countdown'){
      s.countdown=Math.max(0,s.countdown-dt);
      if(s.countdown<1e-8){s.countdown=0;s.phase='playing';event(s,'start',312,312);}
      return;
    }
    if(s.phase!=='playing')return;
    s.time=s.mode==='duel'?Math.min(180,s.time+dt):s.time+dt;
    if(s.mode==='duel')s.remaining=Math.max(0,180-s.time);
    for(const t of s.players) {
      for(const key of ['fireCD','skillCD','shield','dash','invulnerable','hitFlash','blockFlash'])t[key]=Math.max(0,t[key]-dt);
      if(t.hp<=0){t.respawn-=dt;if(t.respawn<=0)respawn(s,t);continue;}
      const cmd=input(inputs[t.id]);
      if(cmd.skill&&!t.skillHeld)activate(s,t);t.skillHeld=cmd.skill;
      if(cmd.dir>=0)move(s,t,cmd.dir,dt);
      else {t.moveDir=-1;t.turnDir=-1;t.turnTTL=0;}
      if(cmd.fire)fire(s,t);
    }
    if(s.mode==='single'||s.mode==='coop')updateWaves(s,dt);
    s.cover.forEach(c=>c.life-=dt);s.cover=s.cover.filter(c=>c.life>0&&c.hp>0);
    updateBullets(s,dt);
    if(s.mode==='duel'&&s.remaining<=0&&s.phase==='playing'){
      const [a,b]=s.players;
      const healthOrder=a.hp*b.maxHp-b.hp*a.maxHp;
      finish(s,a.kills!==b.kills?(a.kills>b.kills?0:1):healthOrder!==0?(healthOrder>0?0:1):-1,'时间到 · 按击毁数、剩余血量百分比结算');
    }
  }
  return {TILE,SIZE,STEP,DIR,TYPES,MAP_NAMES,create,step,mapFor,input,blocked,coverPlacement,finish};
});
