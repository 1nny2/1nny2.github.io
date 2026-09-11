'use strict';
// NNY出品 · 浩源 · 浪尖儿社区. No third-party server dependencies.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Engine=require('./engine');
const ROOT=__dirname;
function createServer(options={}) {
  const rooms=new Map(),profiles=new Map(),rates=new Map();
  const dataFile=options.dataFile===false?null:(options.dataFile||path.join(ROOT,'data','profiles.json'));
  const corsOrigins=String(options.corsOrigin||process.env.CORS_ORIGIN||'').split(',').map(v=>v.trim()).filter(Boolean);
  let queued=null,dirty=false;
  if(dataFile&&fs.existsSync(dataFile))for(const p of JSON.parse(fs.readFileSync(dataFile,'utf8'))){p.room=null;profiles.set(p.token,p);}
  const nameOf=v=>String(v||'新晋车长').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,12)||'新晋车长';
  const publicProfile=p=>({id:p.id,name:p.name,rating:p.rating,wins:p.wins,losses:p.losses,matches:p.matches,xp:p.xp});
  function save(){if(!dirty||!dataFile)return;fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.writeFileSync(dataFile+'.tmp',JSON.stringify([...profiles.values()]));fs.renameSync(dataFile+'.tmp',dataFile);dirty=false;}
  function error(message,status=400){const e=new Error(message);e.status=status;throw e;}
  function requireRoom(p){const r=rooms.get(p.room);if(!r||!r.members.some(m=>m.token===p.token))error('你已离开房间，请重新加入',404);return r;}
  const member=(r,p)=>r.members.find(m=>m.token===p.token);
  function newRoom(p,b={},ranked=false){
    const id=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();if(rooms.has(id))return newRoom(p,b,ranked);
    const r={id,members:[],status:'waiting',mapIndex:Number.isInteger(b.mapIndex)?Math.max(0,Math.min(2,b.mapIndex)):0,ranked,created:Date.now(),updated:Date.now(),matchId:0,state:null,settled:false};
    rooms.set(id,r);addMember(r,p,b);return r;
  }
  function addMember(r,p,b={}){
    r.members.push({token:p.token,name:p.name,type:Engine.TYPES[b.type]?b.type:'assault',ready:false,loaded:false,rematch:false,input:Engine.input(),inputTime:0,lastSeen:Date.now(),seq:-1,skillSeq:0,fireSeq:0,skillPending:false,firePending:false});p.room=r.id;
  }
  function settle(r){
    if(r.settled||!r.state||r.state.phase!=='finished')return;
    r.settled=true;r.status='finished';r.updated=Date.now();
    const winner=r.state.winner,ps=r.members.map(m=>profiles.get(m.token)),ratings=ps.map(p=>p.rating);r.rewards=[];
    ps.forEach((p,i)=>{
      let delta=0,xp=0;
      if(r.ranked&&r.ratedStarted){const outcome=winner===-1?.5:winner===i?1:0;delta=Math.round(24*(outcome-1/(1+10**((ratings[1-i]-ratings[i])/400))));p.rating=Math.max(0,p.rating+delta);p.matches++;if(winner===i)p.wins++;else if(winner!==-1)p.losses++;xp=winner===i?60:30;p.xp+=xp;dirty=true;}
      r.rewards.push({delta,xp});
    });
  }
  function begin(r){
    r.matchId++;r.status='loading';r.loadingAt=Date.now();r.ratedStarted=false;r.settled=false;r.updated=Date.now();r.rewards=[];
    r.state=Engine.create({mode:'duel',countdown:options.countdownSeconds===0?0:3,mapIndex:r.mapIndex,types:r.members.map(m=>m.type),names:r.members.map(m=>m.name),seed:crypto.randomInt(1,2147483647)});
    r.members.forEach(m=>{m.input=Engine.input();m.inputTime=0;m.ready=false;m.loaded=false;m.rematch=false;m.lastSeen=Date.now();m.skillPending=false;m.firePending=false;});
  }
  function leave(p){
    if(queued===p.token)queued=null;
    const r=rooms.get(p.room);p.room=null;if(!r)return;
    const idx=r.members.findIndex(m=>m.token===p.token);if(idx<0)return;
    if(['loading','countdown','playing'].includes(r.status)){Engine.finish(r.state,r.ratedStarted?1-idx:-1,r.ratedStarted?'对手离开了对局':'开局前有人离开 · 本局不计分');settle(r);}
    if(r.status==='waiting'){r.members.splice(idx,1);if(!r.members.length)rooms.delete(r.id);}
    else{r.members[idx].departed=true;r.members[idx].input=Engine.input();}
  }
  function view(r,p){const m=member(r,p);return {id:r.id,revision:r.revision=(r.revision||0)+1,inputSeq:m.seq,skillSeq:m.skillSeq,fireSeq:m.fireSeq,status:r.status,mapIndex:r.mapIndex,ranked:r.ranked,ratedStarted:!!r.ratedStarted,waitSeconds:Math.floor((Date.now()-r.created)/1000),matchId:r.matchId,you:r.members.findIndex(m=>m.token===p.token),members:r.members.map(m=>({name:m.name,type:m.type,ready:m.ready,loaded:m.loaded,rematch:m.rematch,departed:!!m.departed})),state:r.state,rewards:r.rewards||[]};}
  function reply(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)error('请求过大',413);}try{return raw?JSON.parse(raw):{};}catch{error('请求格式错误');}}
  const staticFiles={'/':'index.html','/index.html':'index.html','/tank.html':'index.html','/style.css':'style.css','/client.js':'client.js','/engine.js':'engine.js','/progress.js':'progress.js','/api-config.js':'api-config.js'};
  function inviteUrls(){
    if(process.env.PUBLIC_URL){try{const u=new URL(process.env.PUBLIC_URL);if(['https:','http:'].includes(u.protocol))return [u.origin];}catch{}}
    const port=server.address()?.port||8000;
    return [...new Set(Object.values(require('node:os').networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal).map(n=>`http://${n.address}:${port}`))];
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
    try{
      const route=new URL(req.url,'http://localhost').pathname;
      if(!route.startsWith('/api/')){
        if(req.method!=='GET'&&req.method!=='HEAD')error('请求方式不支持',405);
        const file=staticFiles[route];if(!file)error('页面不存在',404);
        const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript'}[path.extname(file)];
        res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'});if(req.method==='HEAD')res.end();else fs.createReadStream(path.join(ROOT,file)).pipe(res);return;
      }
      const ip=req.socket.remoteAddress,now=Date.now();let rate=rates.get(ip);if(!rate||now-rate.start>10000){rate={start:now,count:0};rates.set(ip,rate);}if(++rate.count>1200)error('操作太频繁，请稍后重试',429);
      if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{error('请求来源无效',403);}const sameOrigin=origin.host===req.headers.host;const allowed=sameOrigin||corsOrigins.includes(origin.origin);if(!allowed)error('请从已授权的游戏页面发起操作',403);if(!sameOrigin){res.setHeader('Access-Control-Allow-Origin',origin.origin);res.setHeader('Vary','Origin');}}
      if(req.method==='OPTIONS'){
        res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age','600');
        res.writeHead(204);res.end();return;
      }
      if(route==='/api/health'&&req.method==='GET'){reply(res,200,{ok:true,version:'2.1.0',players:profiles.size,rooms:rooms.size,inviteUrls:inviteUrls()});return;}
      if(route==='/api/leaderboard'&&req.method==='GET'){reply(res,200,{ok:true,players:[...profiles.values()].filter(p=>p.matches>0).sort((a,b)=>b.rating-a.rating||b.wins-a.wins).slice(0,30).map(publicProfile)});return;}
      if(req.method!=='POST')error('请求方式不支持',405);
      const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))error('请求格式错误');
      if(route==='/api/session'){
        let p=typeof b.token==='string'?profiles.get(b.token):null;
        if(!p){p={token:crypto.randomBytes(24).toString('hex'),id:crypto.randomBytes(8).toString('hex'),name:nameOf(b.name),rating:1000,wins:0,losses:0,matches:0,xp:0,room:null};profiles.set(p.token,p);dirty=true;}else if(b.name){p.name=nameOf(b.name);dirty=true;}
        reply(res,200,{ok:true,token:p.token,profile:publicProfile(p)});return;
      }
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const p=profiles.get(token);if(!p)error('会话已失效，请刷新页面',401);
      if(route==='/api/room/create'){leave(p);const r=newRoom(p,b);reply(res,200,{ok:true,room:view(r,p)});return;}
      if(route==='/api/room/join'){
        const r=rooms.get(String(b.id||'').trim().toUpperCase());if(!r)error('房间不存在，请检查邀请码',404);
        if(p.room===r.id&&member(r,p)&&!member(r,p).departed){reply(res,200,{ok:true,room:view(r,p)});return;}
        if(r.status!=='waiting'||r.members.length>=2)error('房间已满或对局已经开始');leave(p);addMember(r,p,b);r.updated=Date.now();reply(res,200,{ok:true,room:view(r,p)});return;
      }
      if(route==='/api/match'){
        leave(p);const other=profiles.get(queued),qr=other&&rooms.get(other.room);
        if(other&&other!==p&&qr&&qr.status==='waiting'&&qr.members.length===1){addMember(qr,p,b);queued=null;begin(qr);reply(res,200,{ok:true,room:view(qr,p)});return;}
        const r=newRoom(p,b,true);queued=p.token;reply(res,200,{ok:true,room:view(r,p)});return;
      }
      if(route==='/api/leave'){const previous=rooms.get(p.room);leave(p);reply(res,200,{ok:true,...(previous?.status==='finished'?{room:view(previous,p)}:{})});return;}
      if(route==='/api/profile'){reply(res,200,{ok:true,profile:publicProfile(p)});return;}
      const r=requireRoom(p),m=member(r,p);m.lastSeen=now;r.updated=now;if(m.departed)error('你已退出此房间',404);
      if(route==='/api/room/loaded'){
        if(b.matchId!==r.matchId)error('对局已更新，请重新同步',409);
        m.loaded=true;
        if(r.status==='loading'&&r.members.every(m=>m.loaded))r.status='countdown';
      }else if(route==='/api/room/ready'){
        if(r.status!=='waiting')error('对局已开始');m.ready=b.ready===true;if(Engine.TYPES[b.type])m.type=b.type;if(r.members.length===2&&r.members.every(m=>m.ready))begin(r);
      }else if(route==='/api/room/rematch'){
        if(r.status!=='finished')error('请等待本局结束');if(r.members.some(m=>m.departed))error('对手已离开，请重新开房');m.rematch=true;if(r.members.every(m=>m.rematch)){r.mapIndex=(r.mapIndex+1)%3;r.ranked=false;begin(r);}
      }else if(route==='/api/input'){
        if(r.status==='playing'&&Number.isSafeInteger(b.seq)&&b.seq>m.seq){m.seq=b.seq;m.input=Engine.input(b);m.inputTime=now;if(Number.isSafeInteger(b.skillSeq)&&b.skillSeq>m.skillSeq){m.skillSeq=b.skillSeq;m.skillPending=true;}if(Number.isSafeInteger(b.fireSeq)&&b.fireSeq>m.fireSeq){m.fireSeq=b.fireSeq;m.firePending=true;}}
      }else if(route!=='/api/room/status')error('接口不存在',404);
      reply(res,200,{ok:true,room:view(r,p)});
    }catch(e){if(!res.headersSent)reply(res,e.status||500,{ok:false,message:e.status?e.message:'服务暂时不可用，请重试'});else res.end();if(!e.status)console.error(e);}
  });
  let last=performance.now(),acc=0;
  const timer=setInterval(()=>{
    const now=performance.now();acc=Math.min(acc+(now-last)/1000,.25);last=now;
    while(acc>=Engine.STEP){
      const wall=Date.now();for(const r of rooms.values()){
        if(!['loading','countdown','playing'].includes(r.status))continue;
        const absent=r.members.findIndex(m=>wall-m.lastSeen>12000);if(absent>=0){Engine.finish(r.state,r.ratedStarted?1-absent:-1,r.ratedStarted?'对手掉线超过 12 秒':'载入超时 · 本局不计分');settle(r);continue;}
        if(r.status==='loading'){
          if(wall-r.loadingAt>20000){Engine.finish(r.state,-1,'载入超过 20 秒 · 本局取消，不计分');settle(r);}
          continue;
        }
        if(r.status==='countdown'){
          Engine.step(r.state);
          if(r.state.phase==='playing'){r.status='playing';r.ratedStarted=true;}
          continue;
        }
        const commands=r.members.map(m=>{const cmd=wall-m.inputTime<400?{...m.input}:Engine.input();cmd.skill=m.skillPending;cmd.fire=cmd.fire||m.firePending;m.skillPending=false;m.firePending=false;return cmd;});Engine.step(r.state,commands);settle(r);
      }acc-=Engine.STEP;
    }
  },8);timer.unref();
  const maintenance=setInterval(()=>{
    const now=Date.now();for(const r of rooms.values()){
      if(r.status==='waiting')for(const m of [...r.members])if(now-m.lastSeen>15000)leave(profiles.get(m.token));
      if(now-r.updated>15*60*1000&&r.status!=='playing')rooms.delete(r.id);
    }
    for(const [ip,rate] of rates)if(now-rate.start>20000)rates.delete(ip);
    try{save();}catch(e){console.error('保存玩家进度失败:',e.message);}
  },3000);maintenance.unref();
  server.on('close',()=>{clearInterval(timer);clearInterval(maintenance);save();});
  return {server,rooms,profiles,save};
}
if(require.main===module){
  const app=createServer(),port=Number(process.env.PORT)||8000,host=process.env.HOST||'0.0.0.0';
  app.server.listen(port,host,()=>{
    console.log(`NNY出品 · 浩源 · 浪尖儿社区\n本机访问: http://localhost:${port}\n同 Wi-Fi 联机: 使用本机局域网 IP:${port}`);
    for(const list of Object.values(require('node:os').networkInterfaces()))for(const n of list)if(n.family==='IPv4'&&!n.internal)console.log(`  http://${n.address}:${port}`);
  });
  app.server.on('error',e=>{console.error(`启动失败: ${e.message}`);process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.save();app.server.close(()=>process.exit(0));});
}
module.exports={createServer};
