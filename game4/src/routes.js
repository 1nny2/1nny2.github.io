import { echoReading } from './echo.js';
import { createSouvenirs } from './souvenirs.js';
export const routes = {
  nature: { name: '观测星海', theme: 0, description: '追踪核心旁的微弱回声。', tasks: ['目标：分离两道回声。先把视距调到 245–295，再绕核心找角度；清晰度达到 82% 后扫描。', '已发现独立回声源。靠近到视距 180 以内，再扫描确认。', '你发现了被核心辉光掩盖的冰蓝伴星。'], findings: ['分离出核心旁的独立回声源。', '近距离确认：回声来自冰蓝伴星。'] },
  ruins: { name: '追寻回响', theme: 2, description: '调查仍在耗能的熄灭灯塔。', tasks: ['第 1 步：靠近到视距 260 以内，依次选择集光器、中继环、核心，每选一个就点击扫描当前部件。', '第 2 步：集光器输出 → 中继环输入，发送测试脉冲；成功后再连接中继环输出 → 核心输入并测试。', '灯塔照出了失联飞船。点击「定位飞船」，靠近到视距 180 以内扫描船体，再回收航行记录，完成最后的探索。'], findings: ['集光器持续输出能量，但通往中继环的光线忽明忽暗。', '中继环的输入接口残留着与集光器相同的光纹；输出接口朝向灯塔。', '灯塔入口偶尔闪过一道微光，内部的光束却始终没有亮起。'] },
};
const ids = ['star','ring','core'], names = { star:'集光器', ring:'中继环', core:'灯塔核心' };
const blank = () => ({ samples: [], inspected: [], links: [], complete: false, shipStage: 0, target: null, journal: [], failures: 0, offered: false, last: '', view: null });
export function createRoutes({ getScene, act, travel, onChange, narrate, capture }) {
  const $ = id => document.getElementById(id);
  let started = false;
  let selected = null, states = { nature: blank(), ruins: blank() }, notice = '', hintLevel = 0;
  let draft = { from: null, to: null }, pulse = null, timer = null, resumed = false, offer = false;
  const validView = v => v && Number.isFinite(v.distance) && v.distance >= 90 && v.distance <= 2200 && Number.isFinite(v.azimuth) && Math.abs(v.azimuth) < 10000 && Number.isFinite(v.polar) && v.polar >= 0 && v.polar <= Math.PI;
  try {
    const saved = JSON.parse(localStorage.getItem('nebula-routes-v1'));
    for (const id of Object.keys(states)) {
      const s = saved?.states?.[id]; if (!s) continue;
      const state = blank();
      state.samples = [...new Set((Array.isArray(s.samples) ? s.samples : []).filter(x => ['near','far'].includes(x)))];
      state.inspected = [...new Set((Array.isArray(s.inspected) ? s.inspected : []).filter(x => ids.includes(x)))];
      state.links = (Array.isArray(s.links) ? s.links : []).filter((x,i) => x === ['star:ring','ring:core'][i]).slice(0,2);
      // Preserve repairs made in the preceding version of the circuit puzzle.
      if (!s.links && Array.isArray(s.sequence)) state.links = s.sequence.length >= 3 ? ['star:ring','ring:core'] : s.sequence.length >= 2 ? ['star:ring'] : [];
      state.complete = id === 'nature' ? s.complete === true && state.samples.includes('near') : state.links.length === 2;
      state.shipStage = state.complete && [1,2].includes(s.shipStage) ? s.shipStage : 0;
      state.journal = (Array.isArray(s.journal) ? s.journal : []).filter(x => x && typeof x.text === 'string' && typeof x.public === 'string').slice(-80).map(x => ({text:x.text.slice(0,500),public:x.public.slice(0,200),time:String(x.time || '').slice(0,40)}));
      state.failures = Number.isInteger(s.failures) ? Math.max(0, Math.min(s.failures,10000)) : 0;
      state.offered = s.offered === true;
      state.last = typeof s.last === 'string' ? s.last.slice(0,400) : '';
      state.view = validView(s.view) ? s.view : null;
      states[id] = state;
    }
    if (saved?.natureVersion !== 2) states.nature = blank();
    if (saved?.ruinsVersion !== 2 && saved?.ruinsVersion !== 3) states.ruins = blank();
    if (Object.hasOwn(routes, saved?.selected || '')) { selected = saved.selected; resumed = true; }
  } catch { /* Unavailable storage is handled by save. */ }
  function save() {
    try { localStorage.setItem('nebula-routes-v1', JSON.stringify({ selected, states, natureVersion:2, ruinsVersion:3 })); }
    catch { $('save-status').textContent = '本机保存不可用，当前仍可游玩；关闭页面会丢失本次进度。'; }
  }
  function viewSave() { if (started && selected) { const {distance, azimuth, polar} = getScene(); states[selected].view = {distance,azimuth,polar}; save(); } }
  function record(text, safe) { const s = states[selected]; s.last = text; s.journal.push({text,public:safe,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}); s.journal = s.journal.slice(-80); }
  function context() {
    if (!selected) return {route:'未选择路线',stage:1,scanned:false,discoveries:[],objective:'选择探索路线。'};
    const r = routes[selected], s = states[selected], phase = s.complete ? 2 : (selected === 'nature' ? s.samples.length > 0 : s.inspected.length === 3) ? 1 : 0;
    const discoveries = selected === 'nature' ? s.samples.map(x => r.findings[x === 'far' ? 0 : 1]) : [...s.inspected.map(id => r.findings[ids.indexOf(id)]), ...(s.shipStage===2?['飞船记录：船员乘救生舱撤离，失效的导航系统导致飞船漂流。']:[])];
    return { route:r.name,stage:phase+1,scanned:s.complete,discoveries,objective:selected==='ruins' && s.complete && s.shipStage===2 ? '航行记录已回收：船员已乘救生舱撤离，飞船因导航失效而漂流。本次调查完成。' : selected==='ruins' && s.complete && s.shipStage===1 ? '飞船扫描完成：发现航行记录器。点击「回收航行记录」完成调查。' : r.tasks[phase],shipStage:s.shipStage,ruinTarget:s.target,inspected:[...s.inspected],links:[...s.links],wiring:selected === 'ruins' && s.inspected.length === 3 && !s.complete,draft:{...draft},pulse:pulse ? {...pulse} : null,lastObservation:s.last };
  }
  function render() {
    const c=context(),s=states[selected];
    $('mission-title').textContent=selected ? routes[selected].name : '两道异常信号';
    $('mission-task').textContent=c.objective;
    $('mission-progress').value=!selected ? 0 : s.complete ? (selected==='ruins' && s.shipStage<2 ? 2 : 3) : c.stage-1;
    $('ship-controls').hidden=selected !== 'ruins' || !s.complete;
    $('ship-scan').hidden=s?.shipStage!==0;
    $('ship-recover').hidden=s?.shipStage!==1;
    $('ship-locate').hidden=s?.shipStage===2;
    $('ship-controls').querySelector('[data-distance]').hidden=s?.shipStage===2;
    $('ship-status').textContent=s?.shipStage===2?'已回收航行记录，本次调查完成。':s?.shipStage===1?'船体扫描完成，发现可读取的记录器。点击回收航行记录。':'先定位飞船，再靠近到视距 180 以内，点击扫描飞船。';
    $('scan-btn').hidden=selected === 'ruins' && s.inspected.length === 3;
    $('scan-btn').disabled=!selected || s.complete;
    $('scan-btn').textContent=selected === 'nature' ? '扫描回声' : '扫描当前部件';
    $('next-btn').hidden=true;
    $('route-nature-controls').hidden=selected !== 'nature' || s.complete;
    $('route-theory').hidden=true;
    $('route-nodes').hidden=selected !== 'ruins' || s.complete;
    $('ruin-inspect-controls').hidden=selected === 'ruins' && s.inspected.length === 3;
    $('ruin-wiring').hidden=selected !== 'ruins' || s.inspected.length !== 3;
    $('ruin-selection').textContent=selected === 'ruins' ? `${names[s.target] || '请选择部件'} · 已检查 ${s.inspected.length}/3 · 已修复 ${s.links.length}/2` : '';
    $('wire-preview').textContent=pulse?.pending ? `${names[pulse.from]} · 输出 → ${names[pulse.to]} · 输入：脉冲正在传输…` : draft.from ? `${names[draft.from]} · 输出 → ${draft.to ? names[draft.to]+' · 输入（待验证）' : '请选择输入端'}` : '先选择输出端';
    $('ruin-test').disabled=!draft.from || !draft.to || !!pulse?.pending;
    $('wire-cancel').disabled=!!pulse?.pending;
    for(const button of document.querySelectorAll('[data-port]')) {
      const [kind,id]=button.dataset.port.split(':');button.disabled=!!pulse?.pending;
      button.setAttribute('aria-pressed',String(draft[kind === 'out' ? 'from' : 'to'] === id));
    }
    $('route-restart').hidden=!selected || !s.complete;
    $('share-open').hidden=!selected;
    $('discovery-log').textContent=c.discoveries.join('\n');
    $('route-feedback').textContent=notice;
    $('route-feedback').hidden=notice===c.objective;
    $('help-offer').hidden=!offer;
    for(const button of document.querySelectorAll('[data-route]')) {
      const id=button.dataset.route;button.setAttribute('aria-pressed',String(selected===id));
      button.querySelector('small').textContent=states[id].complete ? (id==='ruins' && states[id].shipStage<2 ? '灯塔已修复 · 待探索飞船' : '已完成 · 可再次探索') : routes[id].description;
    }
  }
  function cancelTest() { clearTimeout(timer);timer=null;pulse=null;draft={from:null,to:null}; }
  function select(id) {
    if(!Object.hasOwn(routes,id))return;viewSave();onChange();cancelTest();selected=id;hintLevel=0;offer=false;
    notice=states[id].complete ? context().objective : id==='nature' ? '留意核心旁的蓝色微光，改变位置观察它。' : '可以用鼠标点击部件，也可以用下方按钮定位。靠近后扫描，观察接口的变化。';
    travel(routes[id].theme,states[id].view);$('route-picker').open=false;save();render();
  }
  function fail(text) {
    notice=text;const s=states[selected];s.failures++;
    record(text,'一次尝试未成功，我根据反馈重新调查。');
    if(s.failures>=3&&!s.offered){s.offered=true;offer=true;}
    save();render();
  }
  function finish() {
    const s=states[selected];s.complete=true;notice=routes[selected].tasks[2];record(notice,'完成本路线的调查，发现了新的线索。');
    act('ring');act('reward');save();render();
  }
  function scan() {
    if(!selected)return '先选择一条探索路线。';
    const s=states[selected];if(s.complete)return context().objective;
    if(selected==='nature'){
      const reading=echoReading(getScene());
      if(!s.samples.length){
        if(!reading.ready){fail(reading.alignment<.8?'回声仍混在一起。试着绕核心观察。':'角度已经接近，调整距离让回声更清楚。');return notice;}
        s.samples.push('far');notice='回声锁定！靠近到视距 180 以内，再次扫描。';record(notice,'我换位观察，锁定了一道独立信号。');act('ring');
      }else if(reading.distance>180){fail('继续靠近到视距 180 以内，再扫描确认。');return notice;}
      else{s.samples.push('near');finish();return notice;}
    }else{
      if(!s.target){notice='先选择一个部件，观察它的接口。';render();return notice;}
      if(getScene().distance>260){notice='太远，接口看不清。点击靠近检查，再扫描。';render();return notice;}
      notice=routes.ruins.findings[ids.indexOf(s.target)];
      if(!s.inspected.includes(s.target)){s.inspected.push(s.target);record(notice,'检查了一个部件，记录下它的异常现象。');}
      if(s.inspected.length===3)notice+=' 证据已齐：点选输出端和输入端，再发送测试脉冲验证猜想。';
      act('spark');
    }
    save();render();return notice;
  }
  function inspect(id){if(selected!=='ruins'||!ids.includes(id)||states.ruins.complete)return;states.ruins.target=id;notice=states.ruins.inspected.includes(id)?routes.ruins.findings[ids.indexOf(id)]:'已选中部件，靠近后扫描查看现象。';render();}
  function port(kind,id){
    if(selected!=='ruins'||states.ruins.inspected.length!==3||states.ruins.complete||pulse?.pending||!ids.includes(id))return;
    if(kind==='out'&&draft.from===id){
      cancelTest();notice='已取消输出端，退回上一步：请重新选择输出端。';render();return;
    }
    if(kind==='in'&&draft.to===id){
      draft.to=null;pulse=null;notice='已取消输入端，保留输出端：请重新选择输入端。';render();return;
    }
    if(kind==='out'){draft={from:id,to:null};pulse=null;}
    else if(kind==='in'&&draft.from){draft.to=id;pulse=null;}
    else{notice='先点击一个输出端，再选择输入端。';render();return;}
    notice='连接线只是你的猜想，发送测试脉冲后才能确认。';render();
  }
  function test(){
    if(selected!=='ruins'||!draft.from||!draft.to||pulse?.pending)return;
    const s=states.ruins, from=draft.from,to=draft.to,key=`${from}:${to}`;
    const success=key==='star:ring'||key==='ring:core'&&s.links.includes('star:ring');
    pulse={from,to,success,start:performance.now(),pending:true};render();
    timer=setTimeout(()=>{
      timer=null;if(selected!=='ruins')return;
      pulse.pending=false;
      if(success){
        if(!s.links.includes(key)){s.links.push(key);record(`${names[from]}到${names[to]}的测试脉冲顺利通过。`,'一次连接通过测试，新的线路亮起。');}
        notice='第一段线路已亮起。下一步：点击中继环输出，再点击核心输入，发送测试脉冲。';act('ring');
        if(s.links.length===2)finish();else{save();render();}
      }else{
        fail(key==='ring:core' ? '能量在中继环入口消散了。这里还没有获得稳定供能，再看看来时的线路。' : '能量返回了输出端，当前连接没有把它送入预期的部件。检查一下接口方向。');
      }
      narrate(notice + (offer ? ' 这段线路有些难缠，需要我陪你梳理一下刚才的现象吗？' : ''));
    },1800);
  }
  function hint(){
    if(!selected)return;
    let tips;
    if(selected==='nature')tips=states.nature.samples.length?['回声源已锁定，不必继续找角度。','靠近到视距 180 以内再扫描。']:['留意核心旁的蓝色微光。','靠近一点，沿同一方向绕核心观察。','复位后靠近一次，点击绕核心观察四次，再扫描。'];
    else tips=states.ruins.inspected.length<3?['观察部件的亮暗变化，别急着连接。','靠近到 260 以内，分别选择三个部件进行扫描。']:['观察光从哪里来，又在哪里停下。','对照集光器和中继环的接口光纹。','先连接集光器输出与中继环输入并测试，再连接中继环输出与核心输入并测试。'];
    notice=tips[Math.min(hintLevel++,tips.length-1)];render();narrate(notice);
  }
  for(const b of document.querySelectorAll('[data-route]'))b.onclick=()=>select(b.dataset.route);
  for(const b of document.querySelectorAll('[data-distance]'))b.onclick=()=>act(b.dataset.distance);
  for(const b of document.querySelectorAll('[data-node]'))b.onclick=()=>inspect(b.dataset.node);
  for(const b of document.querySelectorAll('[data-port]'))b.onclick=()=>port(...b.dataset.port.split(':'));
  $('ship-locate').onclick=()=>{act('ship');notice='已将飞船置于观察中心。点击靠近飞船，视距 180 以内可扫描。';render();};
  $('ship-scan').onclick=()=>{
    if(selected!=='ruins'||!states.ruins.complete||states.ruins.shipStage!==0)return;
    if(getScene().distance>180){notice='飞船太远：点击靠近飞船，视距 180 以内再扫描。';render();return;}
    states.ruins.shipStage=1;notice='船体没有生命信号，但救生舱已经离舰。发现航行记录器，请点击回收航行记录。';record(notice,'扫描了新的目标，发现一份记录。');act('spark');save();render();
  };
  $('ship-recover').onclick=()=>{
    if(selected!=='ruins'||states.ruins.shipStage!==1)return;
    states.ruins.shipStage=2;notice='航行记录：导航阵列损坏，船员已乘救生舱安全撤离。灯塔重新点亮，为后续搜救标定了飞船位置。本次调查完成。';record(notice,'回收了航行记录，完成最后的调查。');act('reward');save();render();
  };
  $('ruin-test').onclick=test;
  $('wire-cancel').onclick=()=>{cancelTest();notice='连接已取消，可以重新选择。';render();};
  $('route-hint').onclick=$('ruin-hint').onclick=hint;
  $('help-accept').onclick=()=>{offer=false;hint();};
  $('help-decline').onclick=()=>{offer=false;render();};
  $('route-restart').onclick=()=>{onChange();cancelTest();states[selected]=blank();hintLevel=0;offer=false;notice='本路线已重新开始，另一条路线的进度已保留。';travel(routes[selected].theme);save();render();};
  const souvenirs=createSouvenirs({capture,getData:()=>({imageUnlocked:selected==='nature'?states.nature.samples.length>0:selected==='ruins'&&states.ruins.complete,route:selected?routes[selected].name:'星海漫游',complete:!!states[selected]?.complete && (selected!=='ruins'||states.ruins.shipStage===2),discoveries:context().discoveries,journal:states[selected]?.journal||[]})});
  $('share-open').onclick=()=>{onChange();if(pulse?.pending){cancelTest();notice='测试已暂停，请重新发送脉冲。';render();}souvenirs.open();};
  let lastSave=0;
  const instrument=setInterval(()=>{
    if(document.hidden || !started)return;
    if(selected==='nature'){
      const r=echoReading(getScene());$('observation-help').textContent=states.nature.samples.length?'回声已锁定，不必再找角度。靠近到视距 180 以内扫描确认。':`距离匹配 ${Math.round(r.focus*100)}% · 角度匹配 ${Math.round(r.alignment*100)}%。${r.guidance}。`; $('route-instrument').textContent=states.nature.samples.length ? `距伴星 ${Math.round(r.distance)} · 回声已锁定 · ${r.distance<=180?'距离合适，可以扫描确认':'继续靠近到 180 以内'}` : `视距 ${Math.round(r.distance)} · 清晰度 ${Math.round(r.clarity*100)}% · ${r.ready?'可以扫描':'调整距离和观察角度'}`;
      $('route-signal').style.width=`${states.nature.samples.length?100:Math.round(r.clarity*100)}%`;
    }
    if(selected==='ruins' && states.ruins.complete && states.ruins.shipStage===0) $('ship-status').textContent=`当前视距 ${Math.round(getScene().distance)} / 目标 ≤180。${getScene().distance>180?'定位后点击靠近飞船，再扫描。':'距离合适，可以扫描飞船。'}`;
    if(performance.now()-lastSave>3000){viewSave();lastSave=performance.now();}
  },200);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){viewSave();if(pulse?.pending){cancelTest();notice='测试已暂停，请重新发送脉冲。';render();}}});
  window.addEventListener('pagehide',()=>{viewSave();clearTimeout(timer);clearInterval(instrument);});
  $('recap-continue').onclick=$('recap-skip').onclick=()=>{$('recap-dialog').close();};
  render();
  return {context,scan,inspect,port,next:()=> '请完成眼前的调查，或通过切换路线入口选择另一条路线。',start(){
    started = true;
    if(selected){travel(routes[selected].theme,states[selected].view);$('route-picker').open=false;notice=context().objective;render();}
    if(resumed){const s=states[selected];$('recap-text').textContent=`上次你在「${routes[selected].name}」${s.complete?(selected==='ruins' && s.shipStage<2?'修复了灯塔，等待探索飞船':'完成了调查'):selected==='ruins'?`检查了 ${s.inspected.length}/3 个部件，修复了 ${s.links.length}/2 段线路`:'追踪一道微弱回声'}。${s.last||context().objective}`;$('recap-dialog').showModal();}
  }};
}
