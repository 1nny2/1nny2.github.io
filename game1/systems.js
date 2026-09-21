'use strict';

// Persistent preferences contain no gameplay state. Old score/medal keys are retained.
const Preferences = {
  key: 'neon_strike_preferences_v2',
  defaults: { ship: 'interceptor', difficulty: 'normal', autoFire: true, music: false, sound: true, shake: true, effects: true, classicSkin: false },
  value: {},
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (_) {}
    this.value = { ...this.defaults };
    for (const key of Object.keys(this.defaults)) {
      if (typeof saved[key] === typeof this.defaults[key]) this.value[key] = saved[key];
    }
    if (!['interceptor', 'bulwark', 'spectre', 'aurora', 'titan', 'nova'].includes(this.value.ship)) this.value.ship = 'interceptor';
    if (!['easy', 'normal', 'hard'].includes(this.value.difficulty)) this.value.difficulty = 'normal';
    if (!Object.prototype.hasOwnProperty.call(saved, 'shake') && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.value.shake = false;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.value)); } catch (_) {} },
};
Preferences.load();

const SHIPS = {
  interceptor: { name: '游隼', code: 'FALCON / MK.01', role: '均衡突击', desc: '脉冲主炮 · 灵活走位 · 适合初次出击', weapon: 0, hp: 100, shield: 50, speed: 330, color: '#adf77b', stats: [72, 64, 82] },
  bulwark: { name: '磐石', code: 'BASTION / MK.02', role: '重装压制', desc: '广域散射 · 80 点护盾 · 用防御换取火力', weapon: 1, hp: 130, shield: 80, speed: 265, color: '#ffc178', stats: [82, 95, 48] },
  spectre: { name: '幽灵', code: 'SPECTRE / MK.03', role: '高速游击', desc: '追踪导弹 · 高速机动 · 装甲较薄', weapon: 3, hp: 75, shield: 35, speed: 390, color: '#a8a0ff', stats: [86, 40, 98] },
  aurora: { name: '极光', code: 'AURORA / MK.04', role: '能量增幅', desc: '激光主炮 · 护盾自愈 · 擦弹收益提升', weapon: 2, hp: 110, shield: 105, speed: 350, color: '#71f6dc', stats: [91, 78, 88], cost: 900, unlock: '累计击落 80 架敌机' },
  titan: { name: '泰坦', code: 'TITAN / MK.05', role: '堡垒舰', desc: '穿透脉冲 · 超厚装甲 · 速度换取生存', weapon: 0, hp: 185, shield: 145, speed: 225, color: '#ffb36b', stats: [96, 100, 35], cost: 1800, unlock: '击破 2 个旗舰' },
  nova: { name: '新星', code: 'NOVA / MK.06', role: '终焉机体', desc: '导弹蜂群 · 全属性强化 · 仅授予王牌飞行员', weapon: 3, hp: 150, shield: 120, speed: 420, color: '#ff76d8', stats: [100, 88, 100], cost: 3200, unlock: '解锁“Boss杀手”勋章' },
};
const DIFFICULTIES = {
  easy: { name: '休闲', hp: 0.78, speed: 0.8, damage: 0.65, score: 0.75 },
  normal: { name: '标准', hp: 1, speed: 1, damage: 1, score: 1 },
  hard: { name: '王牌', hp: 1.2, speed: 1.15, damage: 1.25, score: 1.5 },
};
const SECTORS = [
  { name: '边境巡航', code: 'OUTER RIM', duration: 45, color: '#79dacb' },
  { name: '赤色轨道', code: 'RED ORBIT', duration: 55, color: '#ee9484' },
  { name: '深空核心', code: 'VOID CORE', duration: 65, color: '#a49afa' },
];
const WEAPON_NAMES = ['脉冲炮', '散射枪', '激光束', '追踪导弹'];
const MODE_NAMES = { single: '远征行动', endless: '无尽深空', coop: '双人协作', pk: '竞速对决' };
let selectedMode = 'single';
const pointer = { id: null, x: 0, y: 0 };
const floaters = [];
const DAILY_CHALLENGES = [
  { id: 'kills', title: '清场演习', goal: 35, reward: 180, text: '单局击落 35 架敌机' },
  { id: 'grazes', title: '贴身航线', goal: 12, reward: 220, text: '单局完成 12 次擦弹' },
  { id: 'combo', title: '火力不断', goal: 16, reward: 240, text: '单局最高连击达到 16' },
  { id: 'win', title: '航区清零', goal: 1, reward: 300, text: '完成一次远征或无尽出击' },
];
const WEEKLY_CHALLENGES = [
  { title: '周常 · 远征者', goal: 3, reward: 650, text: '完成 3 次远征或无尽出击', key: 'runs' },
  { title: '周常 · 王牌训练', goal: 2, reward: 800, text: '在王牌难度完成 2 次出击', key: 'hardRuns' },
  { title: '周常 · 弹幕舞者', goal: 45, reward: 720, text: '累计完成 45 次擦弹', key: 'grazes' },
];
function getDailyChallenge() {
  const day = Math.floor(Date.now() / 86400000);
  return DAILY_CHALLENGES[day % DAILY_CHALLENGES.length];
}
function getWeeklyChallenge() { return WEEKLY_CHALLENGES[Math.floor(Date.now() / 604800000) % WEEKLY_CHALLENGES.length]; }
function dateKey() { return new Date().toISOString().slice(0, 10); }
function weekKey() { return Math.floor(Date.now() / 604800000).toString(); }
const $ = id => document.getElementById(id);
const formatNumber = value => Math.floor(value || 0).toLocaleString('en-US');
const formatTime = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;

function awardScore(p, amount) {
  const value = Math.round(amount * DIFFICULTIES[Game.difficulty].score);
  if (Game.mode === 'pk' && p) p.score += value;
  else Game.score += value;
  return value;
}
function floatingText(x, y, text, color = '#adf77b') {
  if (floaters.length >= 32) floaters.shift();
  floaters.push({ x, y, text, color, life: 0.85 });
}
function recordCombo(p, enemy) {
  p.combo = p.comboTime > 0 ? p.combo + 1 : 1;
  p.comboTime = 4;
  p.maxCombo = Math.max(p.maxCombo, p.combo);
  const multiplier = Math.min(4, 1 + Math.floor(p.combo / 8) * 0.5);
  const points = awardScore(p, enemy.score * multiplier);
  floatingText(enemy.x, enemy.y, `+${points}${multiplier > 1 ? ' ×' + multiplier : ''}`);
}
function processLevels(p) {
  while (p.exp >= p.expToNext) {
    p.exp -= p.expToNext;
    p.level++;
    // Make upgrades a deliberate mid-run milestone instead of a constant stream.
    // The curve grows faster after the opening levels so late-stage builds stay readable.
    p.expToNext = Math.floor(40 + (p.level - 1) * 24 + Math.pow(p.level, 1.45) * 4);
    p.pendingUpgrades++;
    if (!Game.upgradeQueue.includes(p)) Game.upgradeQueue.push(p);
    Audio.levelup();
  }
}

function configurePlayer(p) {
  const ship = SHIPS[Game.ship] || SHIPS.interceptor;
  Object.assign(p, { hp: ship.hp, maxHp: ship.hp, shield: ship.shield, maxShield: ship.shield, speed: ship.speed, slowSpeed: ship.speed * 0.4,
    currentWeapon: ship.weapon, ownedWeapons: new Set([ship.weapon]), color: p.id === 'p1' ? ship.color : '#90baff',
    combo: 0, comboTime: 0, maxCombo: 0, grazes: 0, damageTaken: 0, droneLevel: 0, droneTimer: 0, magnet: 110, rerolls: 2, modules: [],
    chainLevel: 0, invincible: 1.5, slow: false, shipId: Game.ship });
  return p;
}

function shipUnlocked(id) {
  const save = Storage.load();
  // The three starter hulls are immediately selectable. Premium hulls use the saved unlock list.
  return ['interceptor', 'bulwark', 'spectre'].includes(id) || (save.unlockedShips || []).includes(id);
}
function getShipUnlockState(id) {
  const ship = SHIPS[id];
  if (!ship || !ship.cost) return { unlocked: true, purchasable: false, reason: '' };
  const save = Storage.load();
  const medal = id === 'nova' && AchievementSystem?.has('bossKiller');
  const progress = id === 'aurora' ? (save.totalKills || 0) >= 80 : id === 'titan' ? (save.endlessMaxStage || 0) >= 2 : medal;
  return { unlocked: shipUnlocked(id), purchasable: progress && (save.credits || 0) >= ship.cost, progress, reason: ship.unlock };
}
function awardCredits(amount, reason = '') {
  if (!amount) return;
  const save = Storage.load();
  save.credits = Math.max(0, (save.credits || 0) + Math.round(amount));
  Storage.save(save);
  if (Game.state === 'playing' && reason) floatingText(CFG.W / 2, 120, `+${Math.round(amount)} CREDITS`, '#ffd36e');
  updateHangar();
}
function purchaseShip(id) {
  const ship = SHIPS[id], save = Storage.load();
  if (!ship || shipUnlocked(id)) return true;
  const state = getShipUnlockState(id);
  if (!state.progress) { showToast(`解锁条件：${ship.unlock}`); return false; }
  if ((save.credits || 0) < ship.cost) { showToast(`还需要 ${ship.cost - (save.credits || 0)} 金币`); return false; }
  save.credits -= ship.cost;
  save.unlockedShips = [...new Set([...(save.unlockedShips || []), id])];
  Storage.save(save); Preferences.value.ship = id; Preferences.save();
  showToast(`已购买 · ${ship.name} · ${ship.cost} 金币`, true); updateHangar(); return true;
}

function updateBuild(p, dt) {
  p.comboTime = Math.max(0, p.comboTime - dt);
  if (!p.comboTime) p.combo = 0;
  // Each hull has one light passive that changes the feel of the run.
  if (p.shipId === 'bulwark' && p.shield > 0) p.damageTaken = Math.max(0, p.damageTaken - dt * 0.8);
  if (p.shipId === 'aurora' && p.comboTime > 0) p.shield = Math.min(p.maxShield, p.shield + dt * 1.4);
  if (p.shipId === 'titan' && p.hp < p.maxHp * 0.35) p.lowHull = true;
  if (p.shipId === 'spectre') p.magnet = Math.max(p.magnet, 145);
  if (p.shipId === 'nova' && p.combo >= 8) p.fireRateMult = Math.max(p.fireRateMult, 1.18);
  p.droneTimer -= dt;
  if (p.droneLevel && p.droneTimer <= 0) {
    p.droneTimer = p.droneLevel >= 3 ? 0.3 : 0.65;
    for (const side of [-1, 1]) {
      spawnBullet(p.x + side * 32, p.y, 0, -650, (9 + p.droneLevel * 5) * p.damageMult, '#a8a0ff', 3, p.id);
    }
    if (p.droneLevel >= 3) spawnMissile(p.x, p.y, 16 * p.damageMult, p.id);
  }
}

function updateExtraEffects(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].life -= dt;
    floaters[i].y -= 32 * dt;
    if (floaters[i].life <= 0) floaters.splice(i, 1);
  }
}
function renderTactical() {
  ctx.save();
  // Intent is shown before a new boss pattern opens fire.
  if (boss.active && boss.state === 'fight' && boss.telegraph > 0) {
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = '#ffba79'; ctx.fillStyle = '#ffba79'; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.arc(boss.x, boss.y, 95 + boss.telegraph * 16, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
    ctx.fillText(['环形扩散 · 寻找间隙', '锁定射击 · 持续横移', '螺旋弹幕 · 低速穿行', '弹墙推进 · 寻找安全通道', '双重螺旋 · 保持距离'][boss.patternIndex], boss.x, boss.y + 105);
  }
  if (boss.wallWarning > 0) {
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#adf77b';
    ctx.fillRect(boss.gapCenter - boss.gapWidth / 2, boss.y + 40, boss.gapWidth, CFG.H);
    ctx.globalAlpha = 0.85; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('SAFE', boss.gapCenter, boss.y + 70);
  }
  for (const p of players) {
    if (!p.alive) continue;
    if (p.droneLevel) {
      for (const side of [-1, 1]) {
        const x = p.x + side * 32, y = p.y + Math.sin(Game.elapsed * 4) * 3;
        ctx.globalAlpha = 1; ctx.strokeStyle = '#a8a0ff'; ctx.fillStyle = '#25254b';
        ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x - 7, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // Visible white core is the actual bullet hitbox, never the decorative wings.
    ctx.globalAlpha = p.slow ? 1 : 0.65; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.hitRadius, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#101522'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color;
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}

function advanceCampaign() {
  Game.cleared++;
  awardScore(null, 1000 * boss.stage);
  if (Game.cleared >= 3) { Game.victory(); return; }
  Game.sector++;
  boss.stage = Game.sector + 1;
  wave.sectorElapsed = 0; wave.timer = -3; wave.bossTriggered = false;
  wave.phase = 'calm'; wave.formation = 0;
  enemyBullets.length = 0;
  for (const p of players) {
    if (!p.alive && Game.mode === 'coop') { p.alive = true; p.hp = p.maxHp * 0.5; }
    if (p.alive) {
      p.hp = Math.min(p.maxHp, p.hp + 30); p.shield = p.maxShield; p.invincible = 3;
      p.pendingUpgrades++; if (!Game.upgradeQueue.includes(p)) Game.upgradeQueue.push(p);
    }
  }
  BGM.start('calm');
  showToast(`航区 ${Game.sector + 1} · ${SECTORS[Game.sector].name} · 整备完成`, true);
}

function recordRun(win) {
  const save = Storage.load();
  const totalKills = players.reduce((sum, p) => sum + p.kills, 0);
  const maxCombo = Math.max(0, ...players.map(p => p.maxCombo));
  const grazes = players.reduce((sum, p) => sum + p.grazes, 0);
  const score = Game.mode === 'pk' ? Math.max(...players.map(p => p.score)) : Game.score;
  const key = `${Game.mode}:${Game.difficulty}`;
  const previous = save.records?.[key] || 0;
  save.records = { ...save.records, [key]: Math.max(previous, score) };
  save.lastRun = { mode: Game.mode, score, win, kills: totalKills, combo: maxCombo, grazes, seconds: Math.round(Game.elapsed), ship: Game.ship, difficulty: Game.difficulty };
  save.runs = (save.runs || 0) + 1;
  save.credits = Math.max(0, (save.credits || 0) + Math.round(score / 100) + (win ? 80 : 20));
  const challenge = getDailyChallenge();
  const metric = challenge.id === 'kills' ? totalKills : challenge.id === 'grazes' ? grazes : challenge.id === 'combo' ? maxCombo : win ? 1 : 0;
  save.daily = save.daily || {};
  if (save.daily.date !== new Date().toISOString().slice(0, 10)) save.daily = { date: new Date().toISOString().slice(0, 10), claimed: false, value: 0 };
  save.daily.value = Math.max(save.daily.value || 0, metric);
  if (!save.daily.claimed && metric >= challenge.goal) { save.daily.claimed = true; save.credits += challenge.reward; }
  const weekly = getWeeklyChallenge();
  if (!save.weekly || save.weekly.key !== weekKey()) save.weekly = { key: weekKey(), value: 0, claimed: false };
  const weeklyMetric = weekly.key === 'runs' ? 1 : weekly.key === 'hardRuns' ? (Game.difficulty === 'hard' ? 1 : 0) : grazes;
  save.weekly.value += weeklyMetric;
  if (!save.weekly.claimed && save.weekly.value >= weekly.goal) { save.weekly.claimed = true; save.credits += weekly.reward; }
  Storage.save(save);
  const stats = $('resultStats');
  const rank = win ? (maxCombo >= 24 ? 'S' : 'A') : (totalKills >= 45 ? 'B' : 'C');
  const report = document.createElement('div'); report.className = 'run-report';
  report.innerHTML = `<span class="rank">${rank}</span><span>${MODE_NAMES[Game.mode]} / ${DIFFICULTIES[Game.difficulty].name}<br>飞行 ${formatTime(Game.elapsed)} · 最高连击 ${maxCombo} · 擦弹 ${grazes}<br>${score > previous ? '✦ 刷新此模式纪录' : '此模式最佳 ' + formatNumber(previous)}</span>`;
  stats.appendChild(report);
  const tip = document.createElement('p'); tip.className = 'debrief-tip';
  tip.textContent = win ? '航线已清空。试试另一架战机，构筑不同的火力。' : '飞行建议：按住 Shift 精细闪避；K 清除弹幕，别把炸弹留到最后。';
  stats.appendChild(tip);
  syncShell();
}

function syncShell() {
  const active = !['menu', 'gameover'].includes(Game.state);
  document.body.dataset.state = Game.state;
  $('combatTools').hidden = !active;
  $('touchControls').hidden = !active;
  $('bossBarWrap').classList.toggle('active', active && boss.active);
  if (!active) { pointer.id = null; Input.keys.clear(); Input.pressed.clear(); }
}
function returnToHangar() {
  BGM.stop(); Game.state = 'menu'; Game.runId++;
  boss.active = false; bossCG.active = false;
  for (const id of ['pauseMenu', 'gameOverScreen', 'upgradePanel', 'medalGallery', 'hud']) $(id).classList.add('hidden');
  $('endlessInfo').classList.remove('active'); $('mainMenu').classList.remove('hidden');
  syncShell(); updateHangar();
}
function updateHangar() {
  const save = Storage.load();
  if (!shipUnlocked(Preferences.value.ship)) Preferences.value.ship = 'interceptor';
  const ship = SHIPS[Preferences.value.ship];
  $('hangarRecord').textContent = formatNumber(save.highScore);
  $('hangarKills').textContent = formatNumber(save.totalKills);
  $('hangarMedals').textContent = Object.keys(AchievementSystem.unlocked).length.toString().padStart(2, '0');
  $('hangarCredits').textContent = formatNumber(save.credits || 0);
  $('navCredits').textContent = formatNumber(save.credits || 0);
  const challenge = getDailyChallenge();
  const daily = save.daily && save.daily.date === dateKey() ? save.daily : { value: 0, claimed: false };
  const dailyEl = $('dailyChallenge');
  if (dailyEl) dailyEl.innerHTML = `<strong>${challenge.title} · +${challenge.reward} C</strong><span>${challenge.text}</span><em>${daily.claimed ? '已完成' : `进度 ${Math.min(challenge.goal, daily.value || 0)} / ${challenge.goal}`}</em>`;
  $('lastRun').textContent = save.lastRun ? `上次出击 · ${MODE_NAMES[save.lastRun.mode] || '飞行任务'} / ${formatNumber(save.lastRun.score)} 分` : '首次飞行已就绪。你的故事，从这里开始。';
  $('shipName').textContent = ship.name; $('shipCode').textContent = ship.code;
  $('shipRole').textContent = ship.role; $('shipDesc').textContent = ship.desc;
  document.documentElement.style.setProperty('--ship-color', ship.color);
  document.querySelectorAll('[data-ship]').forEach(el => {
    const id = el.dataset.ship, state = getShipUnlockState(id), data = SHIPS[id];
    el.setAttribute('aria-pressed', id === Preferences.value.ship);
    el.classList.toggle('locked', !state.unlocked);
    el.disabled = false;
    const status = el.querySelector('small');
    if (status) status.textContent = state.unlocked ? String(Object.keys(SHIPS).indexOf(id) + 1).padStart(2, '0') : `${data.cost} C`;
    el.title = state.unlocked ? `${data.name} · 已拥有` : `${data.unlock} · ${data.cost} 金币`;
  });
  document.querySelectorAll('[data-difficulty]').forEach(el => el.setAttribute('aria-pressed', el.dataset.difficulty === Preferences.value.difficulty));
  document.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-pressed', el.dataset.mode === selectedMode));
  ship.stats.forEach((v, i) => { $('shipStat' + i).style.width = v + '%'; });
  $('launchMode').textContent = MODE_NAMES[selectedMode];
  $('launchDetail').textContent = `${ship.name} / ${DIFFICULTIES[Preferences.value.difficulty].name} / ${selectedMode === 'single' || selectedMode === 'coop' ? '3 个航区' : selectedMode === 'pk' ? '90 秒竞分' : '无限进化'}`;
  const two = selectedMode === 'coop' || selectedMode === 'pk';
  const mobile = window.innerWidth < 700;
  $('btnLaunch').disabled = two && mobile;
  $('launchHint').textContent = two ? (mobile ? '双人模式需要桌面键盘，请扩大窗口后出击' : '本地双人 · P1 使用 WASD，P2 使用方向键') : 'WASD / 方向键移动 · 自动开火 · 触屏拖动也能玩';
  const checkpoint = save.endlessCheckpoint;
  const canResume = selectedMode === 'endless' && checkpoint && checkpoint.stage > 1;
  $('btnResumeEndless').hidden = !canResume;
  if (canResume) $('btnResumeEndless').textContent = `继续无尽 · STAGE ${checkpoint.stage} ↗`;
  for (const el of document.querySelectorAll('[data-pref]')) el.checked = Preferences.value[el.dataset.pref];
}

function openProgressPanel(kind) {
  const save = Storage.load();
  const today = dateKey();
  const challenge = getDailyChallenge();
  const weekly = getWeeklyChallenge();
  const daily = save.daily && save.daily.date === today ? save.daily : { value: 0, claimed: false };
  const week = save.weekly && save.weekly.key === weekKey() ? save.weekly : { value: 0, claimed: false };
  const checkin = save.checkin && save.checkin.date === today;
  let title = '每日挑战', body = `<div class="progress-card"><span class="progress-kicker">TODAY / 每日任务</span><h3>${challenge.title}</h3><p>${challenge.text}</p><strong>${Math.min(challenge.goal, daily.value || 0)} / ${challenge.goal}</strong><div class="progress-track"><i style="width:${Math.min(100, (daily.value || 0) / challenge.goal * 100)}%"></i></div><em>${daily.claimed ? '奖励已领取' : '完成奖励 +' + challenge.reward + ' C'}</em></div>`;
  if (kind === 'checkin') { title = '每日签到'; body = `<div class="progress-card checkin-card"><span class="progress-kicker">DAILY CHECK-IN / 连续出勤</span><h3>${checkin ? '今日已签到' : '今天来过，领取补给'}</h3><p>每日签到获得 60 金币，连续签到会额外增加奖励。</p><button id="btnClaimCheckin" class="launch-button" ${checkin ? 'disabled' : ''}>${checkin ? '今日补给已领取' : '领取 60 金币 ↗'}</button><em>${checkin ? '明日再来领取' : '签到奖励立即到账'}</em></div>`; }
  if (kind === 'weekly') { title = '周挑战'; body = `<div class="progress-card weekly-card"><span class="progress-kicker">WEEKLY OPS / 本周行动</span><h3>${weekly.title}</h3><p>${weekly.text}</p><strong>${Math.min(weekly.goal, week.value || 0)} / ${weekly.goal}</strong><div class="progress-track"><i style="width:${Math.min(100, (week.value || 0) / weekly.goal * 100)}%"></i></div><em>${week.claimed ? '奖励已领取' : '完成奖励 +' + weekly.reward + ' C'}</em></div>`; }
  $('progressTitle').textContent = title; $('progressBody').innerHTML = body; if (!$('progressPanel').open) $('progressPanel').showModal();
  $('btnClaimCheckin')?.addEventListener('click', () => { const fresh = Storage.load(); fresh.checkin = { date: today }; fresh.credits = (fresh.credits || 0) + 60; Storage.save(fresh); showToast('签到成功 · +60 金币', true); openProgressPanel('checkin'); updateHangar(); });
}

function fitArena(forNewRun = false) {
  const mobile = window.innerWidth < 700;
  if (forNewRun || Game.state === 'menu') {
    CFG.W = mobile ? 480 : 960;
    CFG.H = mobile ? 800 : 720;
    canvas.width = CFG.W; canvas.height = CFG.H;
    initStars();
  }
  const maxH = window.innerHeight - (mobile ? 116 : 40);
  const scale = Math.max(0.1, Math.min((window.innerWidth - (mobile ? 0 : 48)) / CFG.W, maxH / CFG.H));
  $('arena').style.width = Math.floor(CFG.W * scale) + 'px';
  $('arena').style.height = Math.floor(CFG.H * scale) + 'px';
}

function initFlightDeck() {
  document.querySelectorAll('[data-mode]').forEach(el => el.onclick = () => { selectedMode = el.dataset.mode; updateHangar(); });
  document.querySelectorAll('[data-ship]').forEach(el => el.onclick = () => {
    const id = el.dataset.ship;
    if (!shipUnlocked(id) && !purchaseShip(id)) return;
    Preferences.value.ship = id; Preferences.save(); updateHangar();
  });
  document.querySelectorAll('[data-difficulty]').forEach(el => el.onclick = () => { Preferences.value.difficulty = el.dataset.difficulty; Preferences.save(); updateHangar(); });
  document.querySelectorAll('[data-pref]').forEach(el => el.onchange = () => {
    const key = el.dataset.pref; Preferences.value[key] = el.checked; Preferences.save();
    Audio.muted = !Preferences.value.sound;
    BGM.enabled = Preferences.value.music;
    if (!BGM.enabled) BGM.stop(); else if (Game.state === 'playing') BGM.start(wave.phase);
  });
  $('btnLaunch').onclick = () => Game.start(selectedMode);
  $('btnResumeEndless').onclick = () => Game.resumeEndless();
  $('btnSettings').onclick = () => { $('settingsPanel').showModal(); };
  $('btnDaily').onclick = () => openProgressPanel('daily');
  $('btnCheckin').onclick = () => openProgressPanel('checkin');
  $('btnWeekly').onclick = () => openProgressPanel('weekly');
  $('btnProgressClose').onclick = () => $('progressPanel').close();
  $('btnSettingsClose').onclick = () => $('settingsPanel').close();
  $('btnPauseSettings').onclick = $('btnSettings').onclick;
  $('btnCombatPause').onclick = () => Game.togglePause();
  $('btnHelpClose').onclick = () => $('helpPanel').close();
  $('btnHow').onclick = () => $('helpPanel').showModal();
  $('btnQuit').onclick = $('btnMenu').onclick = returnToHangar;
  $('btnReroll').onclick = () => {
    const p = Game.upgradeQueue[0];
    if (Game.state !== 'upgrading' || !p || p.rerolls <= 0) return;
    p.rerolls--; showUpgradePanel();
  };
  // Pointer capture allows a finger to leave the arena without a stuck drag.
  canvas.addEventListener('pointerdown', event => {
    if (Game.state !== 'playing' || event.button > 0) return;
    event.preventDefault(); pointer.id = event.pointerId; pointer.x = event.clientX; pointer.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer.id || Game.state !== 'playing') return;
    const p = players[0], rect = canvas.getBoundingClientRect();
    if (p?.alive && !bossCG.active) {
      p.x = clamp(p.x + (event.clientX - pointer.x) * CFG.W / rect.width, 20, CFG.W - 20);
      p.y = clamp(p.y + (event.clientY - pointer.y) * CFG.H / rect.height, 30, CFG.H - 20);
    }
    pointer.x = event.clientX; pointer.y = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { pointer.id = null; });
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('pointerdown', event => {
      event.preventDefault(); if (Game.state !== 'playing') return;
      Input.pressed.add(el.dataset.action);
    });
  });
  function loseFocus() {
    Input.keys.clear(); Input.pressed.clear(); pointer.id = null;
    if (Game.state === 'playing') Game.togglePause();
  }
  window.addEventListener('blur', loseFocus);
  document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });
  window.addEventListener('resize', () => { fitArena(); if (Game.state === 'menu') updateHangar(); });
  Audio.muted = !Preferences.value.sound; BGM.enabled = Preferences.value.music;
  fitArena(); updateHangar(); syncShell();
}
