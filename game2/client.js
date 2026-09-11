/* NNY出品 · 浩源 · 浪尖儿大学生社区 / 浪尖儿社区 */
(() => {
  'use strict';
  const E=TankEngine,P=TankProgress,$=id=>document.getElementById(id),API_BASE=String(globalThis.NNY_API_BASE||'').replace(/\/$/,''),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const store={get(k,fallback){try{return JSON.parse(localStorage.getItem('nny.'+k))??fallback;}catch{return fallback;}},set(k,v){try{localStorage.setItem('nny.'+k,JSON.stringify(v));}catch{}}};
  let selected=store.get('tank','assault');if(!E.TYPES[selected])selected='assault';
  let mapIndex=0,token=store.get('token',''),profile=null,onlineAvailable=false,room=null,state=null,online=false,paused=false,inviteUrls=[];
  let seq=0,skillSeq=0,fireSeq=0,pollBusy=false,pollEpoch=0,modalMode='',renderedRoom='',finishedKey='',localRun=0,lastEvent=0,networkAt=0;
  let training=store.get('training',{xp:0,best:0}),muted=store.get('muted',false),audioCtx=null;
  let preview=E.create({mode:'duel',mapIndex,types:[selected,'guard']}),particles=[],shake=0,lastFrame=0,acc=0;
  const keys=new Set(),touch={dir:-1,fire:false,skill:false},downOrder=[],localFire=[false,false],localSkill=[false,false],tapDir=[-1,-1];
  let mastery=P.normalize(store.get('mastery',{})),queuePractice=false,tutorial=null,loadPending='',floaters=[],feed=[],runId='';
  const ownId=()=>online?room.you:0;
  const canControl=()=>state?.phase==='playing'&&(!online||room?.status==='playing')&&!paused&&!$('modal').open&&!document.hidden;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3300);}
  function sound(kind){
    if(muted)return;
    try{
      if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended')audioCtx.resume();
      if(audioCtx.state!=='running')return;
      const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime;
      const config={fire:[140,65,.065,.018],hit:[220,70,.1,.04],shield:[850,430,.09,.025],explosion:[85,24,.22,.065],skill:[430,750,.12,.035],finish:[500,850,.25,.04],brick:[160,50,.07,.022]};
      const [from,to,duration,volume]=config[kind]||config.hit;o.type=kind==='skill'?'sine':'triangle';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+duration);
    }catch{}
  }
  function audioUnlock(){if(!muted){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume();}catch{}}}
  function syncSound(){ $('soundBtn').textContent=muted?'∅':'♪';$('soundBtn').setAttribute('aria-label',muted?'开启音效':'关闭音效');$('battleSound').textContent=muted?'∅':'♪';$('battleSound').setAttribute('aria-label',muted?'开启战斗音效':'关闭战斗音效');}
  $('soundBtn').onclick=()=>{muted=!muted;store.set('muted',muted);syncSound();audioUnlock();};syncSound();
  $('battleSound').onclick=()=>$('soundBtn').click();
  async function api(path,data={},method='POST'){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const res=await fetch(API_BASE+'/api/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify(data)}:{}),signal:controller.signal});
      const r=await res.json();if(!res.ok||!r.ok)throw new Error(r.message||'操作失败');return r;
    }catch(e){if(e.name==='AbortError')throw new Error('连接超时，正在等待服务器');if(e instanceof TypeError||e instanceof SyntaxError)throw new Error('联机服务未连接，请运行 node server.js');throw e;}finally{clearTimeout(timeout);}
  }
  async function session(name){const r=await api('session',{token,name:name||store.get('name','新晋车长')});token=r.token;profile=r.profile;store.set('token',token);store.set('name',profile.name);onlineAvailable=true;$('connection').classList.remove('offline');$('connection').innerHTML='<i></i>联机服务已连接';$('profileBtn').textContent=profile.name.slice(0,1);drawCards();return r;}
  function modal(title,kicker,html,mode='generic'){
    clearInputs();if(state&&!online&&state.phase==='playing')pause(true);
    modalMode=mode;$('modalKicker').textContent=kicker;$('modalBody').innerHTML=`<h2>${esc(title)}</h2>${html}`;
    if(!$('modal').open)$('modal').showModal();
  }
  function closeModal(){if(modalMode==='tutorialOffer')store.set('tutorialSeen',true);if(modalMode==='tutorialDone'){goHome();return;}if(modalMode==='lobby'){leaveRoom();return;}if(modalMode==='result'&&state?.phase==='finished'){goHome();return;}$('modal').close();modalMode='';}
  $('closeModal').onclick=closeModal;$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
  async function guarded(button,fn){if(button.disabled)return;button.disabled=true;try{audioUnlock();await fn();}catch(e){toast(e.message);}finally{button.disabled=button.dataset.waiting==='true';}}
  async function ensureSession(){if(!onlineAvailable)await session();}
  function chosenData(){return {type:selected,mapIndex};}
  function drawCards(){
    const xp=training.xp+(profile?.xp||0);
    $('tankCards').innerHTML=Object.entries(E.TYPES).map(([id,t],i)=>`<button class="tank-card ${selected===id?'selected':''}" data-tank="${id}" aria-pressed="${selected===id}"><div class="tank-card-head"><span>0${i+1} / ${t.role.toUpperCase()}</span><span class="chosen">${selected===id?'● 已装备':xp>=t.unlock?'已收藏':'试玩 · '+t.unlock+' 熟练度收藏'}</span></div><canvas width="120" height="120" aria-hidden="true"></canvas><h3>${t.name}<small>${t.role}型</small></h3><span class="skill-tag">${t.skill} ↗</span><p>${t.desc}</p><div class="tank-specs"><span>生命 <b>${t.hp}</b></span><span>移速 <b>${(t.speed/48).toFixed(2)} 格/s</b></span><span>射击 <b>${t.reload.toFixed(2)}s</b></span><span>技能 <b>${t.cooldown}s</b></span></div></button>`).join('');
    document.querySelectorAll('[data-tank]').forEach(button=>{
      const id=button.dataset.tank,c=button.querySelector('canvas').getContext('2d');c.scale(1.7,1.7);drawTank(c,{x:35,y:37,dir:0,type:id,team:0,hp:3,maxHp:3,invulnerable:0},0,false);
      button.onclick=()=>{selected=id;store.set('tank',selected);preview=E.create({mode:'duel',mapIndex,types:[selected,'guard']});drawCards();};
    });
    $('growthHint').textContent=`熟练度 ${xp} · ${Object.values(E.TYPES).filter(t=>xp>=t.unlock).length}/3 战车已收藏 · 排位全部可用`;
  }
  $('mapSelect').onchange=()=>{mapIndex=Number($('mapSelect').value);preview=E.create({mode:'duel',mapIndex,types:[selected,'guard']});$('previewMapName').textContent=E.MAP_NAMES[mapIndex]+' / 0'+(mapIndex+1);};
  function showFriends(){
    modal('叫上你的搭档','FRIEND MATCH',`<p>发一个邀请链接，和朋友来场 1v1。好友对战不计入排位积分；双方准备后自动开始。</p><label>你的呼号</label><input id="friendName" maxlength="12" value="${esc(profile?.name||store.get('name','新晋车长'))}" autocomplete="nickname"><div class="modal-actions"><button id="createRoom" class="primary">创建好友房 ＋</button></div><div class="separator"></div><label for="roomInput">已有邀请码？</label><div class="input-row"><input id="roomInput" maxlength="6" placeholder="6 位邀请码" autocapitalize="characters" autocomplete="off"><button id="joinRoom" class="secondary">加入 →</button></div><p class="tiny">同一 Wi-Fi 下使用电脑的局域网地址。跨网络对战需要将服务部署到公网。</p>`,'friends');
    $('createRoom').onclick=()=>guarded($('createRoom'),async()=>{await session($('friendName').value);receiveRoom((await api('room/create',chosenData())).room);});
    $('joinRoom').onclick=()=>guarded($('joinRoom'),async()=>{const id=$('roomInput').value.trim();if(!/^[a-f0-9]{6}$/i.test(id))throw new Error('请输入正确的 6 位邀请码');await session($('friendName').value);receiveRoom((await api('room/join',{...chosenData(),id})).room);});
    $('roomInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinRoom').click();});
  }
  $('friendsBtn').onclick=showFriends;
  $('quickBtn').onclick=()=>guarded($('quickBtn'),async()=>{await ensureSession();receiveRoom((await api('match',chosenData())).room);});
  function showLobby(){
    const key=JSON.stringify([room.id,room.members,room.ranked]);if(key===renderedRoom&&modalMode==='lobby')return;renderedRoom=key;
    const me=room.members[room.you];
    modal(room.ranked?'正在寻找对手':'好友作战室',room.ranked?'RANKED / 1V1':'ROOM / '+room.id,
      `<p>${room.ranked?'<span class="waiting-dots">●</span> 等待另一位车长进入快速排位。匹配到后自动开战。':'双方点击准备，立即出击。'}</p>${room.ranked?'':`<div class="room-code">${room.id}</div>`}<div>${[0,1].map(i=>{const m=room.members[i];return `<div class="member-row"><span>${m?esc(m.name):'等待另一位车长…'} ${i===room.you?'<small>你</small>':''}</span><small class="${m?.ready?'ready':''}">${m?E.TYPES[m.type].name+' · '+(m.ready?'已准备':'未准备'):'空位'}</small></div>`;}).join('')}</div><p class="tiny">${E.MAP_NAMES[room.mapIndex]} · 3 分钟 · 率先击毁 3 次</p><div class="modal-actions">${room.ranked?'<button id="queuePracticeBtn" class="primary">边练边等 →</button>':`<button id="readyRoom" class="primary">${me.ready?'取消准备':'准备出击 →'}</button><button id="copyRoom" class="secondary">复制邀请链接</button>`}</div><button id="leaveLobby" class="text-btn">${room.ranked?'取消匹配':'离开房间'}</button>`,'lobby');
    if($('queuePracticeBtn'))$('queuePracticeBtn').onclick=()=>startPractice({queued:true});
    if($('readyRoom'))$('readyRoom').onclick=()=>guarded($('readyRoom'),async()=>receiveRoom((await api('room/ready',{ready:!room.members[room.you].ready,type:selected})).room));
    if($('copyRoom'))$('copyRoom').onclick=()=>{
      const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
      const url=new URL(local&&inviteUrls.length?inviteUrls[0]:location.href);url.searchParams.set('room',room.id);
      navigator.clipboard?.writeText(url.href).then(()=>toast('邀请链接已复制')).catch(()=>showInvite(url.href));
      if(!navigator.clipboard)showInvite(url.href);
    };
    $('leaveLobby').onclick=leaveRoom;
  }
  function showInvite(url){modal('分享这个邀请','INVITE',`<p>复制链接发送给同一 Wi-Fi 的朋友。跨网络访问需部署公网服务；多网卡电脑请选用朋友能够访问的地址。</p><input id="inviteUrl" readonly value="${esc(url)}"><div class="modal-actions"><button id="backLobby" class="secondary">返回房间</button></div>`,'invite');$('inviteUrl').select();$('backLobby').onclick=showLobby;}
  function receiveRoom(r){
    if(room?.id===r.id&&r.revision<room.revision)return;
    const changed=!room||room.id!==r.id||room.matchId!==r.matchId;
    const previous=room?.status;
    room=r;networkAt=performance.now();
    if(r.status==='waiting'){online=false;if(!queuePractice&&modalMode!=='invite')showLobby();return;}
    queuePractice=false;tutorial=null;
    online=true;
    if(changed){lastEvent=r.status==='playing'||r.status==='finished'?r.state.eventId:0;particles=[];floaters=[];feed=[];finishedKey='';seq=Math.max(seq,r.inputSeq||0);skillSeq=Math.max(skillSeq,r.skillSeq||0);fireSeq=Math.max(fireSeq,r.fireSeq||0);clearInputs();}
    if(previous!==r.status)clearInputs();
    state=r.state;
    if(changed||$('battle').hidden)enterBattle();
    processEvents();
    if(r.status==='loading'&&!r.members[r.you].loaded)acknowledgeLoaded();
    if(r.status==='finished')showResult();
  }
  async function acknowledgeLoaded(){
    const key=room.id+':'+room.matchId,epoch=pollEpoch,id=room.id,matchId=room.matchId;
    if(loadPending===key)return;loadPending=key;
    try{
      // Wait until the first authoritative board has been painted on this client.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(epoch!==pollEpoch||room?.id!==id||room.matchId!==matchId)return;
      const r=await api('room/loaded',{matchId});
      if(epoch===pollEpoch&&room?.id===id&&room.matchId===matchId)receiveRoom(r.room);
    }catch{/* Status polling retries the acknowledgement while still loading. */}
    finally{if(loadPending===key)loadPending='';}
  }
  async function leaveRoom(){const hadRoom=!!room;pollEpoch++;room=null;online=false;renderedRoom='';$('modal').close();modalMode='';if(hadRoom)try{const r=await api('leave');if(r.room?.ratedStarted)recordMatch(r.room.state,r.room);profile=(await api('profile')).profile;}catch(e){toast(e.message);}goHome(false);}
  async function poll(){
    if(!room||pollBusy)return;pollBusy=true;const epoch=pollEpoch,roomId=room.id,started=performance.now();
    try{
      const playing=room.status==='playing';const cmd=getInput(0);
      if(playing)tapDir[0]=-1;
      const r=await api(playing?'input':'room/status',playing?{...cmd,seq:++seq,skillSeq,fireSeq}:{});
      if(epoch!==pollEpoch||!room||room.id!==roomId)return;
      $('latency').textContent=`${Math.round(performance.now()-started)} ms · 联机`;
      receiveRoom(r.room);
    }catch(e){if(epoch===pollEpoch&&room){$('latency').textContent='连接中断 · 正在重试';if(performance.now()-networkAt>6000){$('arenaNotice').textContent='连接中断，正在重试；掉线 12 秒将判负';$('arenaNotice').hidden=false;}}}
    finally{pollBusy=false;}
  }
  setInterval(poll,50);
  function enterBattle(){
    $('home').hidden=true;$('battle').hidden=false;document.body.classList.add('in-game');$('modal').close();modalMode='';paused=false;$('pauseOverlay').hidden=true;acc=0;
    $('battleMode').textContent=online?`${room.ranked?'快速排位':'好友对战'} · ${E.MAP_NAMES[state.mapIndex]}`:state.mode==='practice'?(tutorial?'新手训练 · 三步上手':'自由练习 · 不计分'):state.mode==='coop'?'同机合作 · 保护基地':'单人守卫 · 保护基地';
    $('pauseBtn').hidden=online;$('controlHint').innerHTML=state.mode==='coop'?'<kbd>P1</kbd> WASD / J / E　<kbd>P2</kbd> 方向键 / Enter / Shift':'<kbd>WASD / ↑↓←→</kbd> 移动 <kbd>空格</kbd> 射击 <kbd>E</kbd> 技能';
    $('gameCanvas').focus({preventScroll:true});window.scrollTo(0,0);audioUnlock();
  }
  function startLocal(mode){pollEpoch++;room=null;online=false;queuePractice=false;tutorial=null;localRun++;runId=crypto.randomUUID?.()||Date.now()+':'+localRun;lastEvent=0;finishedKey='';particles=[];floaters=[];feed=[];clearInputs();state=E.create({mode,mapIndex,types:[selected,'guard'],names:[profile?.name||'P1 车长','P2 车长'],seed:Math.floor(Math.random()*2147483647)});enterBattle();}
  function startPractice(options={}){
    if(!options.queued){pollEpoch++;room=null;}
    online=false;queuePractice=!!options.queued;tutorial=options.tutorial?{step:0}:null;
    if(tutorial)store.set('tutorialSeen',true);
    lastEvent=0;finishedKey='';particles=[];floaters=[];feed=[];clearInputs();
    state=E.create({mode:'practice',mapIndex,types:[selected],names:[profile?.name||'新晋车长']});
    state.players[0].x=72;state.players[0].y=72;state.players[0].dir=1;
    enterBattle();
  }
  $('cancelQueue').onclick=()=>guarded($('cancelQueue'),async()=>{
    // Suspend polling before leaving so an in-flight match cannot restore the room.
    pollEpoch++;const previousRoom=room;room=null;
    try{await api('leave');queuePractice=false;toast('已取消匹配，可继续自由练习');}
    catch(e){room=previousRoom;throw e;}
  });
  $('skipTutorial').onclick=()=>{tutorial=null;goHome();};
  function updateTutorial(){
    if(!tutorial)return;
    const stats=state.players[0].stats,done=[stats.distance>=48,stats.shots>=1,stats.skillUses>=1];
    while(tutorial.step<3&&done[tutorial.step])tutorial.step++;
    if(tutorial.step===3){
      tutorial=null;
      modal('准备出击！','TRAINING COMPLETE','<p>你已掌握移动、射击和技能。接下来守住基地，练习绕墙和抢占路口。</p><div class="modal-actions"><button id="tutorialSolo" class="primary">开始单人守卫</button><button id="tutorialHome" class="secondary">返回大厅</button></div>','tutorialDone');
      $('tutorialSolo').onclick=()=>startLocal('single');$('tutorialHome').onclick=()=>goHome();
    }
  }
  function offerTutorial(){
    if(store.get('tutorialSeen',false)||state||room||$('modal').open)return;
    modal('先花半分钟热热手。','WELCOME, COMMANDER','<p>在安全训练场完成移动、射击、技能三个动作，熟悉四方向坦克。练习不影响积分。</p><div class="modal-actions"><button id="beginTutorial" class="primary">开始三步教学 →</button><button id="skipIntro" class="secondary">直接进入大厅</button></div>','tutorialOffer');
    $('beginTutorial').onclick=()=>startPractice({tutorial:true});$('skipIntro').onclick=()=>{store.set('tutorialSeen',true);closeModal();};
  }
  $('singleBtn').onclick=()=>startLocal('single');$('coopBtn').onclick=()=>{if(matchMedia('(pointer:coarse)').matches)toast('同机合作需要连接键盘，触屏控制 P1');startLocal('coop');};
  function goHome(leave=true){
    if(leave&&room){leaveRoom();return;}clearInputs();queuePractice=false;tutorial=null;$('home').hidden=false;$('battle').hidden=true;document.body.classList.remove('in-game');$('modal').close();modalMode='';state=null;online=false;paused=false;finishedKey='';drawCards();
  }
  function requestExit(){if(!state||state.phase==='finished'){goHome();return;}
    if(state.mode==='practice'){goHome();return;}
    if(!online)pause(true);
    modal('结束这次出击？','LEAVE BATTLE',`<p>${online?(room.ratedStarted?'现在退出将判本局失败。':'正式开局前退出，本局取消且不计分。'):'本次尚未结束的守卫进度不会保存。'}</p><div class="modal-actions"><button id="stayBtn" class="primary">继续战斗</button><button id="confirmExit" class="secondary">退出对局</button></div>`,'exit');
    $('stayBtn').onclick=()=>{$('modal').close();modalMode='';if(!online)pause(false);};$('confirmExit').onclick=()=>goHome();
  }
  $('exitBattle').onclick=requestExit;$('homeNav').onclick=()=>{if(state)requestExit();else goHome();};
  function pause(value){if(online||!state||state.phase!=='playing')return;paused=value;$('pauseOverlay').hidden=!value;clearInputs();acc=0;}
  $('pauseBtn').onclick=()=>pause(!paused);$('resumeBtn').onclick=()=>pause(false);
  $('fullscreenBtn').onclick=()=>{const task=document.fullscreenElement?document.exitFullscreen():$('battle').requestFullscreen?.();task?.catch(()=>toast('当前浏览器不支持全屏，请使用横屏模式'));};
  function recordMatch(s,match=null){
    if(match&&!match.ratedStarted)return {progress:mastery,xp:0,awards:[],recorded:false};
    const id=match?match.you:0,me=s.players[id];
    const result=P.record(mastery,{id:match?location.origin+':'+match.id+':'+match.matchId:runId,type:me.type,mode:match?(match.ranked?'ranked':'friend'):s.mode,map:E.MAP_NAMES[s.mapIndex],at:Date.now(),won:s.winner===id,draw:!!match&&s.winner===-1,kills:me.kills,deaths:me.deaths,seconds:s.time,stats:me.stats});
    mastery=result.progress;training.xp+=result.xp;store.set('mastery',mastery);store.set('training',training);return result;
  }
  function showResult(){
    if(state.mode==='practice')return;
    const key=online?room.id+':'+room.matchId:'local:'+localRun;if(finishedKey===key)return;finishedKey=key;clearInputs();
    const me=state.players[online?room.you:0],won=online?state.winner===room.you:state.winner===0,draw=online&&state.winner===-1;
    const progress=recordMatch(state,online?room:null);
    let reward;
    if(!online){const earned=progress.recorded?Math.min(120,me.kills*5+(won?40:10)):0;training.xp+=earned;training.best=Math.max(training.best,state.score);store.set('training',training);reward=`本地熟练度 +${earned} · 不计入排位`;}
    else{const r=room.rewards[room.you]||{delta:0,xp:0};reward=room.ranked?`排位积分 ${r.delta>=0?'+':''}${r.delta} · 熟练度 +${r.xp}`:'好友切磋 · 不计入排位';api('profile').then(r=>{profile=r.profile;drawCards();}).catch(()=>{});}
    if(online&&!room.ratedStarted)reward='未正式开局 · 不计积分与熟练度';
    if(progress.awards.length)reward+=' · 达成 '+progress.awards.map(m=>m.title).join('、')+'，本地熟练度 +'+progress.xp;
    modal(online&&!room.ratedStarted?'本局已取消':draw?'旗鼓相当':won?'漂亮的胜利。':'下一局，打回来。','MISSION REPORT',`<div class="result-mark">${won?'↗':draw?'＝':'↻'}</div><p>${esc(state.reason)}</p><div class="result-stats"><div><b>${me.kills}</b><span>击毁坦克</span></div><div><b>${me.deaths}</b><span>被击毁</span></div><div><b>${online?Math.ceil(state.time)+'s':state.score}</b><span>${online?'作战时长':'守卫得分'}</span></div></div><p>${esc(reward)}</p><div class="modal-actions"><button id="retryBtn" class="primary">${online?'邀请再战 ↻':'再次出击 ↻'}</button><button id="resultHome" class="secondary">返回大厅</button></div>${online?'<p class="tiny">再战为好友切磋，不计排位；双方同意后换图开始。</p>':''}`,'result');
    $('retryBtn').onclick=()=>guarded($('retryBtn'),async()=>{if(online){const r=await api('room/rematch');receiveRoom(r.room);if(r.room.status==='finished'){$('retryBtn').textContent='等待对手同意…';$('retryBtn').dataset.waiting='true';$('retryBtn').disabled=true;}}else startLocal(state.mode);});
    $('resultHome').onclick=()=>goHome();
  }
  $('profileBtn').onclick=()=>{
    const xp=training.xp+(profile?.xp||0),next=xp<120?120:260;
    modal('你的车长档案','COMMANDER PROFILE',`<label for="profileName">车长呼号</label><input id="profileName" maxlength="12" value="${esc(profile?.name||store.get('name','新晋车长'))}"><div class="result-stats"><div><b>${profile?.rating||1000}</b><span>排位积分</span></div><div><b>${profile?.wins||0}</b><span>排位胜场</span></div><div><b>${xp}</b><span>收藏熟练度</span></div></div><p>${xp>=260?'三种战车均已收藏。继续磨练你的打法！':`${next-xp} 熟练度后收藏${xp<120?'「磐石」':'「筑垒」'}。`}</p><div class="progress-track"><div style="width:${Math.min(100,xp/next*100)}%"></div></div><p class="tiny">本地守卫最佳得分：${training.best}。游客档案保存在此浏览器；清除浏览器数据会失去访问凭据。排位记录保存在当前游戏服务器。</p><div class="modal-actions"><button id="saveProfile" class="primary">保存呼号</button></div>`);
    $('saveProfile').onclick=()=>guarded($('saveProfile'),async()=>{const name=$('profileName').value.trim()||'新晋车长';store.set('name',name);if(onlineAvailable)await session(name);$('modal').close();toast('呼号已保存');});
    $('modalBody').insertAdjacentHTML('beforeend',`<div class="separator"></div><h3>专精任务</h3><p>完成正式对局后累计，奖励仅用于收藏；训练场不计入。</p>${P.MISSIONS.map(m=>{const n=P.missionProgress(mastery,m),done=mastery.completed.includes(m.id);return `<div class="mastery-row"><b>${m.title} <small>${done?'已完成':n+' / '+m.target}</small></b><p>${m.description} · +${m.reward} 熟练度</p><progress value="${n}" max="${m.target}" aria-label="${m.title}"></progress></div>`;}).join('')}<h3>最近战绩</h3><p class="tiny">此浏览器保存最近 8 场。专精和战绩不会同步到其他设备。</p>${mastery.history.length?mastery.history.map(h=>`<div class="history-row"><b>${h.draw?'平局':h.won?'胜利':'失利'} · ${E.TYPES[h.type].name}</b><small>${esc({single:'单人守卫',coop:'同机合作',ranked:'快速排位',friend:'好友切磋'}[h.mode]||h.mode)} · ${esc(h.map)}</small><span>击毁 ${h.kills} / 被击毁 ${h.deaths} · ${h.seconds}s</span></div>`).join(''):'<p>完成一场对局后，这里会留下你的战绩。</p>'}`);
  };
  $('rankNav').onclick=()=>guarded($('rankNav'),async()=>{
    const r=await api('leaderboard',{},'GET');
    modal('战场荣誉榜','SERVER LEADERBOARD',`<p>当前服务器的排位积分榜。只有快速排位计分，单人守卫和好友房不计分。</p>${r.players.length?'<div class="rank-row"><small>#</small><span>车长</span><span>积分</span><small>胜场</small></div>'+r.players.map((p,i)=>`<div class="rank-row"><small>${String(i+1).padStart(2,'0')}</small><span>${esc(p.name)}</span><b>${p.rating}</b><small>${p.wins}</small></div>`).join(''):'<div class="separator"></div><p>还没有已完成的排位对局。第一位上榜车长，会是你吗？</p>'}`);
  });
  $('helpNav').onclick=()=>{modal('先熟悉，再出击。','FIELD MANUAL',`<div class="help-row"><b>四方向操作</b><br>WASD 或方向键移动，炮口跟随移动方向。空格按住连射，E 施放技能。P / Esc 暂停本地游戏，M 开关音效。手机使用方向盘、射击和技能按钮。</div><div class="help-row"><b>1v1 对决</b><br>3 分钟内先击毁对手 3 次获胜。超时先比较击毁数，再比较剩余血量百分比，仍相同则平局。双方载入后同步倒计时 3 秒，倒计时不占作战时长。出生保护 1.5 秒。</div><div class="help-row"><b>读懂战场</b><br>砖墙可破坏；钢墙与水域阻挡移动；炮弹可穿过水域。草丛仅作掩饰，不提供隐身。基地有 3 点耐久，友方炮弹不会伤害基地。</div><div class="help-row"><b>三种战车</b><br>疾风：冲刺抢位。磐石：正面护盾，注意敌人方向。筑垒：前方放置可击毁的临时掩体。每种坦克有独立冷却。</div><div class="help-row"><b>同机合作</b><br>P1：WASD / J 射击 / E 技能。P2：方向键 / Enter 射击 / 右 Shift 技能。两人共用复活机会，一起守住基地。</div><div class="help-row"><b>收藏与公平</b><br>守卫与排位积累熟练度，120 收藏磐石，260 收藏筑垒。收藏不增加数值，所有坦克均可试玩，排位全部开放。</div><div class="modal-actions"><button id="replayTutorial" class="primary">实战教学 →</button><button id="freePractice" class="secondary">自由练习</button></div>`);$('replayTutorial').disabled=!!room;$('freePractice').disabled=!!room;$('replayTutorial').onclick=()=>startPractice({tutorial:true});$('freePractice').onclick=()=>startPractice();};
  function getInput(player=0){
    if(!canControl())return E.input();
    const coop=state?.mode==='coop';let dirs=player===1?['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']:['KeyW','KeyD','KeyS','KeyA'];
    let dir=-1;
    for(let i=downOrder.length-1;i>=0;i--){const code=downOrder[i];let idx=dirs.indexOf(code);if(idx<0&&!coop&&player===0)idx=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].indexOf(code);if(idx>=0&&keys.has(code)){dir=idx;break;}}
    if(player===0&&touch.dir>=0)dir=touch.dir;
    if(dir<0)dir=tapDir[player];
    return {dir,fire:(!online&&localFire[player])||(player===1?(keys.has('Enter')||keys.has('Slash')):(keys.has(coop?'KeyJ':'Space')||keys.has('KeyJ')||touch.fire)),skill:(!online&&localSkill[player])||(player===1?keys.has('ShiftRight'):(keys.has('KeyE')||touch.skill))};
  }
  function clearInputs(){keys.clear();downOrder.length=0;touch.dir=-1;touch.fire=false;touch.skill=false;localFire.fill(false);localSkill.fill(false);tapDir.fill(-1);document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));}
  addEventListener('keydown',e=>{
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.code==='KeyM'&&!e.repeat){$('soundBtn').click();return;}
    if(!state||state.phase!=='playing'||(online&&room?.status!=='playing')||$('modal').open)return;
    if(['Space','ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Enter','Slash','KeyE','KeyP','Escape','ShiftRight'].includes(e.code))e.preventDefault();
    if((e.code==='KeyP'||e.code==='Escape')&&!e.repeat){if(online)toast('联机对战持续进行，不能单方暂停');else pause(!paused);return;}
    if(!canControl())return;
    if(!keys.has(e.code)){
      downOrder.push(e.code);
      const wasd=['KeyW','KeyD','KeyS','KeyA'].indexOf(e.code),arrow=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].indexOf(e.code);
      if(wasd>=0)tapDir[0]=wasd;
      if(arrow>=0)tapDir[state.mode==='coop'?1:0]=arrow;
      if(e.code==='KeyE'){skillSeq++;localSkill[0]=true;}
      if(e.code==='ShiftRight')localSkill[1]=true;
      if(e.code==='KeyJ'||(state.mode!=='coop'&&e.code==='Space')){fireSeq++;localFire[0]=true;}
      if(e.code==='Enter'||e.code==='Slash')localFire[1]=true;
    }keys.add(e.code);
  });
  addEventListener('keyup',e=>{keys.delete(e.code);const i=downOrder.indexOf(e.code);if(i>=0)downOrder.splice(i,1);});
  addEventListener('blur',()=>{clearInputs();if(!online)pause(true);});
  document.addEventListener('visibilitychange',()=>{clearInputs();if(!online&&document.hidden)pause(true);});
  function hold(button,start,end){button.addEventListener('pointerdown',e=>{e.preventDefault();if(!canControl())return;button.setPointerCapture(e.pointerId);button.classList.add('held');audioUnlock();start();});const release=e=>{button.classList.remove('held');end();};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);button.addEventListener('contextmenu',e=>e.preventDefault());}
  document.querySelectorAll('[data-dir]').forEach(button=>{const d=Number(button.dataset.dir);hold(button,()=>{touch.dir=d;tapDir[0]=d;},()=>{if(touch.dir===d)touch.dir=-1;});});
  hold($('touchFire'),()=>{touch.fire=true;fireSeq++;localFire[0]=true;},()=>touch.fire=false);hold($('touchSkill'),()=>{touch.skill=true;skillSeq++;localSkill[0]=true;},()=>touch.skill=false);
  function drawTank(c,t,time,details=true){
    if(t.hp<=0)return;c.save();c.translate(t.x,t.y);
    if(t.invulnerable>0&&Math.floor(time*12)%2===0)c.globalAlpha=.55;
    const color=t.enemy?'#c98171':t.team===0?'#e4ad68':'#81c3bd',dark=t.enemy?'#663f36':t.team===0?'#766343':'#466e64';
    c.fillStyle='#0b100a60';c.fillRect(-18,-13,40,37);
    c.rotate(t.dir*Math.PI/2);c.fillStyle='#141c16';c.fillRect(-19,-19,10,38);c.fillRect(9,-19,10,38);
    c.fillStyle=dark;for(let y=-17;y<18;y+=7){c.fillRect(-18,y,8,4);c.fillRect(10,y,8,4);}
    c.fillStyle=dark;c.fillRect(-11,-17,22,34);c.fillStyle=color;c.fillRect(-10,-17,20,29);
    c.fillStyle='#ffffff27';c.fillRect(-8,-15,3,23);c.fillStyle=dark;c.fillRect(-9,8,18,6);
    if(t.type==='guard'){c.fillStyle=dark;c.fillRect(-14,-17,28,7);c.fillStyle=color;c.fillRect(-14,-19,28,4);}
    if(t.type==='engineer'){c.fillStyle='#e1dab2';c.fillRect(-15,-10,5,19);c.fillRect(10,-10,5,19);}
    c.fillStyle=dark;c.fillRect(-8,-7,16,17);c.fillStyle=color;c.fillRect(-7,-8,14,14);c.fillStyle='#f5ead355';c.fillRect(-5,-7,10,2);
    c.fillStyle=dark;c.fillRect(-4,-29,8,25);c.fillStyle=color;c.fillRect(-3,-29,6,23);c.fillStyle='#252d21';c.fillRect(-3,-30,6,3);
    if(t.shield>0){c.strokeStyle='#afdccf';c.lineWidth=4;c.beginPath();c.arc(0,0,27,Math.PI*1.15,Math.PI*1.85);c.stroke();}
    if(t.dash>0){c.fillStyle='#ffdb7a';c.fillRect(-9,20,5,12);c.fillRect(4,20,5,12);}
    if(t.hitFlash>0){c.fillStyle='#fff9';c.fillRect(-13,-18,26,34);}
    if(t.blockFlash>0){c.strokeStyle='#c6ffef';c.lineWidth=6;c.beginPath();c.arc(0,0,29,Math.PI*1.1,Math.PI*1.9);c.stroke();}
    c.restore();
    if(details&&!t.enemy){c.fillStyle='#0e180dde';c.fillRect(t.x-21,t.y+26,42,5);c.fillStyle=color;c.fillRect(t.x-20,t.y+27,40*(t.hp/t.maxHp),3);c.fillStyle='#dfe7d2';c.font='bold 11px sans-serif';c.textAlign='center';c.fillText(state&&t.id===ownId()?(state.mode==='coop'?'P1 · 你':'▼ 你'):'P'+(t.id+1),t.x,Math.max(12,t.y-38));}
  }
  function renderMap(c,s,time){
    c.fillStyle='#263322';c.fillRect(0,0,624,624);
    for(let r=0;r<13;r++)for(let col=0;col<13;col++){
      const x=col*48,y=r*48,t=s.map[r][col];
      c.fillStyle=(r+col)%2===0?'#2b3826':'#2a3625';c.fillRect(x,y,48,48);c.strokeStyle='#bec8a408';c.strokeRect(x+.5,y+.5,47,47);
      // Small dust marks establish scale without visual noise.
      c.fillStyle='#a3b58d19';c.fillRect(x+((col*17+r*13)%36)+5,y+((col*7+r*11)%36)+5,2,2);
      if(t===1){
        c.fillStyle='#121d1360';c.fillRect(x+5,y+7,42,42);c.fillStyle='#967953';c.fillRect(x+2,y+2,43,42);c.fillStyle='#b59b6b';c.fillRect(x+2,y+2,43,3);c.fillStyle='#5c4d37';c.fillRect(x+2,y+15,43,3);c.fillRect(x+2,y+30,43,3);c.fillRect(x+22,y+2,3,13);c.fillRect(x+12,y+18,3,12);c.fillRect(x+33,y+18,3,12);c.fillRect(x+22,y+33,3,11);
      }else if(t===2){c.fillStyle='#121d1360';c.fillRect(x+5,y+7,42,42);c.fillStyle='#727c68';c.fillRect(x+2,y+2,43,42);c.fillStyle='#9aa087';c.fillRect(x+2,y+2,43,3);c.strokeStyle='#4c5948';c.lineWidth=2;c.strokeRect(x+8,y+8,31,29);c.fillStyle='#3b4839';for(const [dx,dy]of[[6,6],[37,6],[6,36],[37,36]])c.fillRect(x+dx,y+dy,3,3);
      }else if(t===3){c.fillStyle='#425b34';for(let i=0;i<8;i++){const dx=(i*17)%40,dy=(i*11)%40;c.fillRect(x+dx,y+dy,8,5);c.fillStyle=i%2?'#405631':'#50633a';}}
      else if(t===4){c.fillStyle='#355953';c.fillRect(x,y,48,48);c.fillStyle='#77a09544';for(let i=0;i<3;i++)c.fillRect(x+((time*6+i*13)%30),y+10+i*13,12,2);}
      else if(t===5){c.fillStyle='#bba36b';c.fillRect(x+6,y+9,36,33);c.fillStyle='#e2c386';c.fillRect(x+10,y+5,28,31);c.fillStyle='#303d28';c.font='bold 18px sans-serif';c.textAlign='center';c.fillText('N',x+24,y+27);c.fillStyle='#eece84';for(let i=0;i<s.baseHp;i++)c.fillRect(x+10+i*11,y+39,8,4);}
    }
    for(const cover of s.cover||[]){c.fillStyle='#bdb99b';c.fillRect(cover.x-21,cover.y-20,42,40);c.fillStyle='#676e54';for(let i=-18;i<20;i+=10)c.fillRect(cover.x+i,cover.y-16,4,31);}
    c.strokeStyle='#607352';c.lineWidth=2;c.strokeRect(1,1,622,622);
  }
  function render(c,s,time,fx=false){
    c.save();if(fx&&shake>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches)c.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
    renderMap(c,s,time);
    if(fx){const me=s.players[ownId()];if(me?.type==='engineer'&&me.hp>0){const p=E.coverPlacement(s,me);c.fillStyle=p.ok?'#a7e7aa35':'#ee766435';c.strokeStyle=p.ok?'#b3e7a5':'#f5917d';c.lineWidth=2;c.setLineDash([6,4]);c.fillRect(p.x-22,p.y-22,44,44);c.strokeRect(p.x-22,p.y-22,44,44);c.setLineDash([]);}}
    for(const t of [...s.players,...s.enemies])drawTank(c,t,time);
    for(const b of s.bullets){c.fillStyle=b.team===0?'#ffe3a0':'#c3f3e6';c.beginPath();c.arc(b.x,b.y,3.5,0,Math.PI*2);c.fill();}
    if(fx)for(const p of particles){c.globalAlpha=Math.max(0,p.life/p.max);c.fillStyle=p.color;c.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}c.globalAlpha=1;
    if(fx)for(const f of floaters){c.globalAlpha=Math.min(1,f.life*2);c.font='bold 15px sans-serif';c.textAlign='center';c.lineWidth=4;c.strokeStyle='#142016';c.strokeText(f.text,f.x,f.y);c.fillStyle=f.color;c.fillText(f.text,f.x,f.y);}c.globalAlpha=1;c.restore();
  }
  function processEvents(){
    for(const ev of state.events){if(ev.id<=lastEvent)continue;lastEvent=ev.id;
      if(['fire','hit','shield','explosion','skill','finish','brick'].includes(ev.type))sound(ev.type);
      const labels={hit:'命中 −1',shield:'正面格挡',protected:'保护中',cover_hit:'掩体拦截'};
      if(labels[ev.type])floaters.push({x:Math.max(45,Math.min(579,ev.x)),y:Math.max(35,ev.y-30),text:labels[ev.type],color:ev.type==='hit'?'#ffe0ac':'#bceee1',life:.8});
      if(ev.type==='skill_blocked'&&ev.target===ownId())toast(ev.reason+' · 未消耗冷却');
      if(ev.type==='explosion'){
        const attacker=state.players.find(p=>p.id===ev.owner)?.name||'敌方坦克';
        feed.push({text:attacker+' 击毁 '+ev.name,until:performance.now()+3500});feed=feed.slice(-3);
      }
      if(['hit','explosion','brick','shield','spark','skill'].includes(ev.type)){
        const count=ev.type==='explosion'?22:7,color=ev.type==='brick'?'#b59863':ev.type==='skill'?'#b5d1b3':ev.team===1?'#85cfc3':'#f4c483';
        for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,speed=30+Math.random()*140,life=.3+Math.random()*.35;particles.push({x:ev.x,y:ev.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life,max:life,color,size:2+Math.random()*4});}if(ev.type==='explosion')shake=7;
      }
    }
  }
  function hud(){
    const [a,b]=state.players,me=state.players[online?room.you:0];
    $('p1Name').textContent=a.name+(ownId()===0?' · 你':'');$('p1Hp').textContent=a.hp>0?`生命 ${a.hp} / ${a.maxHp} · ${Math.round(a.hp/a.maxHp*100)}%`:`${Math.max(0,a.respawn).toFixed(1)} 秒后复活`;$('p1Kills').textContent=a.kills;
    $('p2Name').textContent=b?b.name+(ownId()===1?' · 你':''):(state.mode==='practice'?'自由练习':'基地守卫');$('p2Hp').textContent=b?(b.hp>0?`生命 ${b.hp} / ${b.maxHp} · ${Math.round(b.hp/b.maxHp*100)}%`:`${Math.max(0,b.respawn).toFixed(1)} 秒后复活`):state.mode==='practice'?'无对手 · 不计奖励':`基地耐久 ${state.baseHp} / 3`;$('p2Kills').textContent=b?b.kills:state.score;
    $('p1Name').closest('.player-score').classList.toggle('is-you',ownId()===0);$('p2Name').closest('.player-score').classList.toggle('is-you',ownId()===1);
    const secs=Math.ceil(state.remaining);$('timer').textContent=state.mode==='duel'?`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`:`${state.wave} / 5`;
    $('ruleLabel').textContent=state.mode==='duel'?'先击毁 3 次':`复活机会 ${state.lives} · 剩余敌人 ${state.enemies.length+state.spawnLeft}`;
    if(state.mode==='practice'){$('timer').textContent='练习';$('ruleLabel').textContent='不限时 · 不计分';}
    const cd=me.skillCD>0?me.skillCD.toFixed(1)+'s':'就绪';$('skillInfo').textContent=E.TYPES[me.type].skill+' · '+cd;$('touchCooldown').textContent=cd;
    if(me.type==='engineer'&&me.hp>0){const p=E.coverPlacement(state,me);$('skillInfo').textContent+=' · '+(p.ok?'前方可放置':p.reason);}
    if(!online)$('latency').textContent='本地作战';
    const prestart=online&&['loading','countdown'].includes(room.status);
    $('countdownOverlay').hidden=!prestart;
    if(prestart){$('countdownLabel').textContent=room.status==='loading'?'等待双方载入战场':'准备出击';$('countdownNumber').textContent=room.status==='loading'?'同步中':Math.max(1,Math.ceil(state.countdown));}
    $('queueStrip').hidden=!queuePractice;
    if(queuePractice)$('queueText').textContent=`正在匹配 · 已等待 ${room?.waitSeconds||0} 秒 · 配对后自动进入战场`;
    $('tutorialPanel').hidden=!tutorial;
    if(tutorial)$('tutorialText').textContent=[`1 / 3 · 移动一格：方向键 / WASD / 触屏方向盘`,`2 / 3 · 发射炮弹：空格 / 射击按钮`,`3 / 3 · 施放技能：E / 技能按钮${me.type==='engineer'?'，找绿色预览位置':''}`][tutorial.step];
    feed=feed.filter(f=>f.until>performance.now());const feedText=feed.map(f=>f.text).join('\n');if($('killFeed').textContent!==feedText)$('killFeed').textContent=feedText;
    const notice=prestart?'':online&&performance.now()-networkAt>1800?'连接不稳定，正在同步…':me.hp<=0?'战车受损 · 等待重新出击':state.time<3&&!tutorial?'四向移动 · 按住射击 · E / 技能键施放技能':state.nextWave>0?'本波清空，准备转移至下一战场':'';
    $('arenaNotice').textContent=notice;$('arenaNotice').hidden=!notice;
  }
  const gameCtx=$('gameCanvas').getContext('2d'),previewCtx=$('previewCanvas').getContext('2d');let lastHud=0;
  function frame(now){
    const dt=Math.min((now-(lastFrame||now))/1000,.1);lastFrame=now;
    if(state&&!$('battle').hidden){
      if(!online&&!paused&&state.phase==='playing'){acc+=dt;while(acc>=E.STEP){E.step(state,[getInput(0),getInput(1)]);localFire.fill(false);localSkill.fill(false);tapDir.fill(-1);acc-=E.STEP;}processEvents();updateTutorial();if(state.phase==='finished')showResult();}
      if(!paused){for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}particles=particles.filter(p=>p.life>0).slice(-250);for(const f of floaters){f.life-=dt;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)f.y-=dt*22;}floaters=floaters.filter(f=>f.life>0).slice(-20);shake=Math.max(0,shake-dt*25);}
      render(gameCtx,state,now/1000,true);if(now-lastHud>80){hud();lastHud=now;}
    }else render(previewCtx,preview,now/1000);
    requestAnimationFrame(frame);
  }
  drawCards();requestAnimationFrame(frame);
  session().then(async()=>{
    api('health',{},'GET').then(r=>inviteUrls=r.inviteUrls||[]).catch(()=>{});
    const invite=new URL(location.href).searchParams.get('room');
    if(invite){showFriends();$('roomInput').value=invite.toUpperCase();toast('邀请码已填入，点击加入即可进入好友房');}
    else{try{const r=await api('room/status');receiveRoom(r.room);}catch{}offerTutorial();}
  }).catch(()=>{$('connection').classList.add('offline');$('connection').innerHTML='<i></i>单人模式可用';offerTutorial();});
})();


