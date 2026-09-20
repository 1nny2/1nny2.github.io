
'use strict';
/* ============================================================
 *  NEON STRIKE · 飞机大战
 *  单文件实现，基于 Canvas 2D
 *  系统增强版：动态难度 + BGM + Boss CG + 视觉特效 + 双人 + 成就
 * ============================================================ */

// ============ 图片资源系统 ============
const Assets = {
  images: {},
  urls: { player: './player.png' },
  loaded: false,
  load(cb) {
    const keys = Object.keys(this.urls);
    let loaded = 0;
    for (const key of keys) {
      const img = new Image();
      // 不设置 crossOrigin：API 不返回 CORS 头会导致 ERR_FAILED；
      // 游戏无需回读 canvas 像素，普通加载即可
      img.onload = () => {
        loaded++;
        if (loaded === keys.length) { this.loaded = true; if (cb) cb(); }
      };
      img.onerror = () => {
        // 加载失败也计数，避免阻塞游戏启动（fallback 几何渲染兜底）
        loaded++;
        if (loaded === keys.length) { this.loaded = true; if (cb) cb(); }
      };
      img.src = this.urls[key];
      this.images[key] = img;
    }
  },
  get(key) { return this.images[key]; },
  isReady() {
    return this.loaded && Object.values(this.images).every(img => img && img.complete && img.naturalWidth > 0);
  }
};

// ============ 全局配置 ============
const CFG = {
  W: 960, H: 720,
  FIXED_DT: 1000 / 60,
  MAX_PARTICLES: 600,
  MAX_BULLETS: 800,
};

const COLORS = {
  bg: '#05060f',
  player: '#00f0ff',
  player2: '#ff44ff',
  playerCore: '#ffffff',
  enemy: '#ff3366',
  enemy2: '#ff6b9d',
  elite: '#ff8800',
  boss: '#ffaa00',
  bullet: '#ffee00',
  enemyBullet: '#ff3366',
  power: '#7c3aed',
  shield: '#00f0ff',
};

// ============ 工具函数 ============
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ============ 输入系统（多方案支持） ============
const CONTROLS = {
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    shoot: ['Space'],
    bomb: ['KeyX'],
    weaponSwitch: ['KeyQ'],
    skill1: ['KeyJ'], skill2: ['KeyK'], skill3: ['KeyL'],
    slow: ['ShiftLeft'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    shoot: ['Enter'],
    bomb: ['Numpad0', 'Digit0'],
    weaponSwitch: ['Period', 'NumpadDecimal'],
    skill1: ['Numpad1', 'Digit1'], skill2: ['Numpad2', 'Digit2'], skill3: ['Numpad3', 'Digit3'],
    slow: ['ShiftRight'],
  },
};

const Input = {
  keys: new Set(),
  pressed: new Set(),
  init() {
    addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['playing','paused','upgrading'].includes(Game.state) && !document.querySelector('dialog[open]') && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
  },
  down(...codes) { return codes.some(c => this.keys.has(c)); },
  justPressed(...codes) { return codes.some(c => this.pressed.has(c)); },
  clearPressed() { this.pressed.clear(); },
  getControls(scheme) {
    const c = CONTROLS[scheme];
    return {
      up: this.down(...c.up),
      down: this.down(...c.down),
      left: this.down(...c.left),
      right: this.down(...c.right),
      shoot: this.down(...c.shoot),
      bomb: c.bomb.some(code => this.justPressed(code)),
      weaponSwitch: c.weaponSwitch.some(code => this.justPressed(code)),
      skill1: c.skill1.some(code => this.justPressed(code)),
      skill2: c.skill2.some(code => this.justPressed(code)),
      skill3: c.skill3.some(code => this.justPressed(code)),
      slow: this.down(...c.slow),
    };
  },
};

// ============ 音频系统（Web Audio 合成） ============
const Audio = {
  ctx: null, muted: false, bgmGain: null, sfxGain: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.25;
      this.sfxGain.connect(this.ctx.destination);
      BGM.init(this.ctx);
    } catch(e) { console.warn('Audio init failed', e); }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  beep(freq, dur, type = 'square', vol = 0.3, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur);
  },
  shoot() { this.beep(880, 0.05, 'square', 0.06, -400); },
  enemyShoot() { this.beep(220, 0.08, 'sawtooth', 0.04, -50); },
  explosion() {
    this.beep(80, 0.3, 'sawtooth', 0.22, -40);
    this.beep(120, 0.15, 'square', 0.12, -60);
  },
  hit() { this.beep(150, 0.1, 'square', 0.15, -80); },
  upgrade() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.12, 'triangle', 0.18), i * 80));
  },
  achievement() {
    [659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.beep(f, 0.15, 'triangle', 0.2), i * 100));
  },
  bossWarn() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.beep(440, 0.15, 'sawtooth', 0.25), i * 300);
  },
  bomb() { this.beep(60, 0.6, 'sawtooth', 0.3, 100); },
  levelup() { [440, 554, 659].forEach((f,i) => setTimeout(() => this.beep(f, 0.1, 'triangle', 0.15), i*60)); },
  powerup() { this.beep(880, 0.1, 'triangle', 0.12, 200); },
};

// ============ BGM 系统（程序化多阶段音乐） ============
const BGM = {
  ctx: null,
  masterGain: null,
  playing: false,
  enabled: false,
  phase: 'calm',
  schedulerId: null,
  nextNoteTime: 0,
  noteIndex: 0,

  init(audioCtx) {
    this.ctx = audioCtx;
    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 0.12;
    this.masterGain.connect(audioCtx.destination);
  },

  start(phase) {
    if (!this.ctx || !this.enabled) return;
    this.stop();
    this.phase = phase;
    this.playing = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.noteIndex = 0;
    this.schedule();
  },

  stop() {
    this.playing = false;
    if (this.schedulerId) { clearTimeout(this.schedulerId); this.schedulerId = null; }
  },

  setPhase(phase) {
    if (this.phase === phase || !this.playing) {
      this.phase = phase;
      return;
    }
    this.phase = phase;
    this.noteIndex = 0;
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stop();
    } else if (Game.state === 'playing') {
      this.start(this.phase);
    }
    return this.enabled;
  },

  getPattern() {
    switch (this.phase) {
      case 'calm':
        return { tempo: 0.55, melody: [220, 261.63, 293.66, 349.23, 293.66, 261.63], bass: [110, 130.81], type: 'sine', vol: 0.08 };
      case 'normal':
        return { tempo: 0.32, melody: [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66], bass: [130.81, 164.81], type: 'triangle', vol: 0.09 };
      case 'tense':
        return { tempo: 0.16, melody: [440, 466.16, 523.25, 466.16, 392, 415.30, 466.16, 523.25], bass: [110, 116.54], type: 'sawtooth', vol: 0.07 };
      case 'boss':
        return { tempo: 0.2, melody: [55, 65.41, 82.41, 65.41, 55, 73.42, 61.74, 82.41], bass: [41.2, 41.2], type: 'square', vol: 0.1 };
      default:
        return { tempo: 0.55, melody: [220], bass: [110], type: 'sine', vol: 0.08 };
    }
  },

  schedule() {
    if (!this.playing || !this.enabled || !this.ctx) return;
    const lookahead = 0.25;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.playNote(this.nextNoteTime);
      const p = this.getPattern();
      this.nextNoteTime += p.tempo;
      this.noteIndex++;
    }
    this.schedulerId = setTimeout(() => this.schedule(), 30);
  },

  playNote(time) {
    const p = this.getPattern();
    const melodyNote = p.melody[this.noteIndex % p.melody.length];
    const bassNote = p.bass[this.noteIndex % p.bass.length];
    this.playTone(melodyNote, time, p.tempo * 0.85, p.type, p.vol);
    this.playTone(bassNote, time, p.tempo * 0.95, 'sine', p.vol * 0.6);
    if (this.phase === 'boss' && this.noteIndex % 4 === 0) {
      this.playTone(880, time, 0.08, 'square', 0.05);
    }
    if (this.phase === 'tense' && this.noteIndex % 2 === 0) {
      this.playTone(1200, time, 0.05, 'sawtooth', 0.03);
    }
  },

  playTone(freq, time, dur, type, vol) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(time); osc.stop(time + dur);
  },
};

// ============ 粒子系统 ============
const particles = [];
function spawnParticle(x, y, vx, vy, life, size, color, alpha = 1) {
  if (particles.length >= (Preferences.value.effects ? CFG.MAX_PARTICLES : 120)) return;
  particles.push({ x, y, vx, vy, life, maxLife: life, size, color, alpha });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function renderParticles(ctx) {
  ctx.save();
  for (const p of particles) {
    const a = (p.life / p.maxLife) * p.alpha;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = Preferences.value.effects ? 5 : 0; ctx.shadowColor = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  }
  ctx.restore();
}
function explode(x, y, color, count = 20, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = rand(50, 250) * power;
    spawnParticle(x, y, Math.cos(a)*s, Math.sin(a)*s, rand(0.4, 0.9), rand(2, 5), color);
  }
  spawnParticle(x, y, 0, 0, 0.15, 40 * power, '#ffffff', 0.8);
}
// 火花粒子（击中特效）
function spawnSparks(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = rand(150, 350);
    spawnParticle(x, y, Math.cos(a)*s, Math.sin(a)*s, rand(0.15, 0.35), rand(1, 2.5), color);
  }
}
// 金色粒子爆发（成就解锁）
function spawnGoldBurst(x, y, count = 30) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = rand(100, 320);
    spawnParticle(x, y, Math.cos(a)*s, Math.sin(a)*s, rand(0.5, 1.2), rand(3, 6), '#fbbf24');
  }
}

// ============ 星空背景 ============
const stars = [];
function initStars() {
  stars.length = 0;
  for (let i = 0; i < 180; i++) {
    stars.push({
      x: Math.random() * CFG.W, y: Math.random() * CFG.H,
      speed: rand(20, 120), size: rand(0.5, 2.2), bright: rand(0.3, 1),
    });
  }
}
function updateStars(dt) {
  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > CFG.H) { s.y = -5; s.x = Math.random() * CFG.W; }
  }
}
function renderStars(ctx) {
  for (const s of stars) {
    ctx.globalAlpha = s.bright;
    ctx.fillStyle = s.size > 1.5 ? '#7dd3fc' : '#ffffff';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

// ============ 玩家系统（数组化，支持双人） ============
const players = [];
function createPlayer(id, x, y) {
  return {
    id, // 'p1' or 'p2'
    x, y, vx: 0, vy: 0,
    radius: 14, hitRadius: 5,
    hp: 100, maxHp: 100,
    shield: 50, maxShield: 50,
    shieldRegen: 0,
    speed: 320, slowSpeed: 140,
    weaponLevel: 1,
    currentWeapon: 0,
    ownedWeapons: new Set([0]),
    fireTimer: 0,
    invincible: 0,
    bombs: 2,
    bombsUsed: 0,
    exp: 0, level: 1, expToNext: 40,
    kills: 0, hits: 0,
    score: 0, // PK 模式用
    alive: true,
    pendingUpgrades: 0,
    skillCD: [0, 0, 0],
    skillMaxCD: [8, 25, 30],
    phaseDashTime: 0,
    overdriveTime: 0,
    damageMult: 1,
    fireRateMult: 1,
    scatterBonus: 0,
    skillsUsedThisGame: [false, false, false],
    color: id === 'p1' ? COLORS.player : COLORS.player2,
    damageTakenThisBoss: false,
  };
}

function getAlivePlayers() { return players.filter(p => p.alive); }
function getNearestPlayer(x, y) {
  let best = null, bd = Infinity;
  for (const p of players) {
    if (!p.alive) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ============ 子弹系统（对象池，带 owner 标识） ============
const bullets = [];
const enemyBullets = [];
function spawnBullet(x, y, vx, vy, dmg, color, radius, owner) {
  const arr = owner === 'enemy' ? enemyBullets : bullets;
  if (arr.length >= CFG.MAX_BULLETS) arr.shift();
  arr.push({ x, y, vx, vy, dmg, color, radius, life: owner === 'enemy' ? 7 : 3, owner, grazed: 0 });
}
function spawnEnemyBullet(x, y, vx, vy, dmg, color, radius) {
  const difficulty = DIFFICULTIES[Game.difficulty];
  spawnBullet(x, y, vx * difficulty.speed, vy * difficulty.speed, dmg * difficulty.damage, color, radius, 'enemy');
}
function getBulletOwnerPlayer(b) {
  if (b.owner === 'p1') return players[0];
  if (b.owner === 'p2') return players[1];
  return null;
}

// ============ 敌机系统 ============
const enemies = [];
function spawnEnemy(type, x, y) {
  const base = { x, y, vx: 0, vy: 80, type, fireTimer: rand(0.5, 2), t: 0, spawnX: x };
  switch (type) {
    case 'scout':   Object.assign(base, { hp: 28, radius: 14, vy: 145, score: 10, exp: 1, color: COLORS.enemy }); break;
    case 'fighter': Object.assign(base, { hp: 52, radius: 15, vy: 104, score: 20, exp: 2, color: COLORS.enemy, fireInterval: 1.25 }); break;
    case 'gunner':  Object.assign(base, { hp: 86, radius: 18, vy: 62, score: 35, exp: 3, color: COLORS.enemy2, fireInterval: 1.55 }); break;
    case 'kamikaze':Object.assign(base, { hp: 38, radius: 13, vy: 82, score: 25, exp: 2, color: COLORS.elite, track: true }); break;
    case 'elite':   Object.assign(base, { hp: 170, radius: 20, vy: 56, score: 80, exp: 7, color: COLORS.elite, fireInterval: 1.05, cruise: true }); break;
  }
  base.hp *= DIFFICULTIES[Game.difficulty].hp * (1 + Game.sector * 0.15);
  base.maxHp = base.hp;
  enemies.push(base);
  return base;
}

// ============ 道具系统 ============
const powerups = [];
function spawnPowerup(x, y) {
  const r = Math.random();
  let type;
  if (r < 0.65) type = 'exp';
  else if (r < 0.73) type = 'weaponUp';
  else if (r < 0.83) type = 'shield';
  else if (r < 0.88) type = 'bomb';
  else if (r < 0.94) type = 'heal';
  else type = 'weaponSwitch';
  powerups.push({ x, y, vy: 80, type, radius: 10, t: 0 });
}
const powerupInfo = {
  exp: { color: '#7dd3fc', icon: 'EXP' },
  weaponUp: { color: '#fbbf24', icon: 'UP' },
  shield: { color: '#00f0ff', icon: 'SHD' },
  bomb: { color: '#ff6b00', icon: 'BMB' },
  heal: { color: '#22c55e', icon: 'HP' },
  weaponSwitch: { color: '#c4b5fd', icon: 'WPN' },
};

// ============ Boss 系统 ============
const boss = {
  active: false, x: CFG.W / 2, y: -150, vx: 0, vy: 0,
  hp: 1500, maxHp: 1500, phase: 0,
  phaseThresholds: [0.66, 0.33],
  t: 0, patternIndex: 0, patternTimer: 0,
  patternSwitchTimer: 4,
  enterTime: 0, state: 'enter',
  deathTimer: 0, deathStage: -1,
  radius: 70,
  name: 'IRON WALL · 铁壁',
  lastDamager: null,
  stage: 1, // 无尽模式 BOSS 进化阶段
};

// 无尽模式 BOSS 阶段配置：每阶段返回名称、血量、移动速度倍率、阶段阈值、配色
function getBossStageConfig(stage) {
  // 名字池：每阶段更凶
  const namePool = [
    'IRON WALL · 铁壁',
    'CRIMSON FANG · 赤牙',
    'VOID REAPER · 虚空收割者',
    'STORM LORD · 风暴之主',
    'PHANTOM OVERLORD · 幻影霸主',
    'NEON DESTROYER · 霓虹毁灭者',
    'CHAOS SOVEREIGN · 混沌至尊',
    'OMEGA SINGULARITY · 终极奇点',
  ];
  // 第 1 阶段：基础 1500 HP，之后每阶段 ×1.55
  const hp = Math.round(3200 * Math.pow(1.45, Math.min(stage - 1, 24)) * DIFFICULTIES[Game.difficulty].hp * (Game.mode === 'coop' ? 1.65 : 1));
  // 移动速度倍率（横向巡航）
  const moveMult = 1 + Math.min(stage - 1, 12) * 0.12;
  // 弹速倍率
  const bulletMult = Math.min(2.1, 1 + (stage - 1) * 0.10);
  // 弹幕密度加成
  const densityBonus = Math.min(12, stage - 1);
  // 阶段血量阈值：高阶段 BOSS 提前进入 2/3 阶段（更早狂暴）
  const phaseThresholds = stage >= 4
    ? [0.75, 0.5]
    : stage >= 2
      ? [0.7, 0.4]
      : [0.66, 0.33];
  // 配色（每阶段渐变）
  const palette = ['#ffaa00', '#ff6b00', '#ff3366', '#ff44ff', '#c4b5fd', '#7c3aed', '#00f0ff', '#ffffff'];
  const name = namePool[Math.min(stage - 1, namePool.length - 1)];
  return { hp, moveMult, bulletMult, densityBonus, phaseThresholds, name, palette };
}

// ============ Boss CG 动画系统 ============
const bossCG = {
  active: false,
  phase: 'darken', // darken | warning | slide | flash | complete
  timer: 0,
  overlayOpacity: 0,
  warningAlpha: 0,
  bossY: -150,
};

function startBossCG() {
  enemyBullets.length = 0; bullets.length = 0; missiles.length = 0;
  for (const p of players) p.invincible = Math.max(p.invincible, 2);
  bossCG.active = true;
  bossCG.phase = 'darken';
  bossCG.timer = 0;
  bossCG.overlayOpacity = 0;
  bossCG.warningAlpha = 0;
  bossCG.bossY = -150;
  Game.shake = 0;
  // 切换 BGM 到 boss 阶段
  BGM.setPhase('boss');
  Audio.bossWarn();
}

function updateBossCG(dt) {
  if (!bossCG.active) return;
  bossCG.timer += dt;
  const t = bossCG.timer;

  if (bossCG.phase === 'darken') {
    // 0 ~ 1.2s: 屏幕变暗
    bossCG.overlayOpacity = Math.min(0.75, t / 1.2 * 0.75);
    if (t >= 1.2) {
      bossCG.phase = 'warning';
      bossCG.timer = 0;
    }
  } else if (bossCG.phase === 'warning') {
    // 1.2 ~ 2.8s: WARNING 闪烁
    bossCG.warningAlpha = 0.4 + Math.sin(t * 14) * 0.4 + 0.2;
    bossCG.overlayOpacity = 0.75;
    if (t >= 1.6) {
      bossCG.phase = 'slide';
      bossCG.timer = 0;
    }
  } else if (bossCG.phase === 'slide') {
    // 2.8 ~ 3.8s: Boss 剪影从顶部滑入
    const slideT = t / 1.0;
    bossCG.bossY = lerp(-150, 130, Math.min(1, slideT));
    bossCG.warningAlpha = Math.max(0, 0.6 - slideT * 0.6);
    if (t >= 1.0) {
      bossCG.phase = 'flash';
      bossCG.timer = 0;
    }
  } else if (bossCG.phase === 'flash') {
    // 3.8 ~ 4.0s: 闪光 + 震动
    bossCG.overlayOpacity = Math.max(0, 0.4 - t * 2);
    Game.flash = Math.max(Game.flash, Math.max(0, 0.9 - t * 4));
    Game.shake = Math.max(Game.shake, 20);
    if (t >= 0.4) {
      bossCG.phase = 'complete';
      bossCG.active = false;
      startBossFight();
    }
  }
}

function drawBossCG(ctx) {
  if (!bossCG.active) return;
  const t = bossCG.timer;

  // 暗色覆盖层
  if (bossCG.overlayOpacity > 0.01) {
    ctx.fillStyle = `rgba(0,0,0,${bossCG.overlayOpacity})`;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }

  // WARNING 文字
  if ((bossCG.phase === 'warning' || bossCG.phase === 'slide') && bossCG.warningAlpha > 0.01) {
    ctx.save();
    const flash = bossCG.warningAlpha;
    ctx.fillStyle = `rgba(255,51,102,${flash})`;
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff3366';
    ctx.fillText('⚠ WARNING ⚠', CFG.W / 2, CFG.H / 2 - 60);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = `rgba(255,170,0,${flash})`;
    ctx.shadowColor = '#ffaa00';
    ctx.fillText('BOSS 来袭', CFG.W / 2, CFG.H / 2);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`;
    ctx.fillText(getBossStageConfig(boss.stage).name, CFG.W / 2, CFG.H / 2 + 40);
    ctx.restore();
  }

  // Boss 剪影滑入
  if (bossCG.phase === 'slide') {
    const stageCfg = getBossStageConfig(boss.stage);
    const bossColor = stageCfg.palette[Math.min(boss.stage - 1, stageCfg.palette.length - 1)];
    ctx.save();
    ctx.translate(CFG.W / 2, bossCG.bossY);
    ctx.shadowBlur = 40;
    ctx.shadowColor = bossColor;
    ctx.fillStyle = bossColor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(-40, 30);
    ctx.lineTo(-70, 0);
    ctx.lineTo(-50, -20);
    ctx.lineTo(-20, -35);
    ctx.lineTo(20, -35);
    ctx.lineTo(50, -20);
    ctx.lineTo(70, 0);
    ctx.lineTo(40, 30);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 发光核心
    const pulse = 0.7 + Math.sin(t * 8) * 0.3;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#fff';
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = bossColor;
    ctx.fillRect(-30, -10, 60, 6);
    ctx.fillRect(-20, 10, 40, 4);
    ctx.restore();
  }
}

function startBossFight() {
  boss.active = true;
  boss.x = CFG.W / 2; boss.y = 130;
  const cfg = getBossStageConfig(boss.stage);
  boss.hp = boss.maxHp = cfg.hp;
  boss.phase = 0; boss.t = 0;
  boss.patternIndex = 0; boss.patternTimer = 0;
  boss.patternSwitchTimer = Math.max(2.5, 4 - (boss.stage - 1) * 0.3); // 高阶段切换更快
  boss.state = 'fight'; boss.telegraph = 1.2; boss.wallWarning = 0; boss.gapCenter = CFG.W / 2;
  boss.deathTimer = 0; boss.deathStage = -1;
  boss.lastDamager = null;
  boss.phaseThresholds = cfg.phaseThresholds;
  Game.shake = 12;
  Game.flash = 0.5;
  document.getElementById('bossBarWrap').classList.add('active');
  document.getElementById('bossName').textContent = cfg.name;
  if (Game.mode === 'endless') {
    document.getElementById('endlessInfo').classList.add('active');
    document.getElementById('endlessStage').textContent = 'STAGE ' + boss.stage;
    document.getElementById('endlessNext').textContent = '';
    showToast('⚠ STAGE ' + boss.stage + ' · ' + cfg.name + ' ⚠');
  } else {
    showToast('⚠ BOSS 战斗开始 ⚠');
  }
  // 重置无伤标记
  for (const p of players) p.damageTakenThisBoss = false;
}

function updateBoss(dt) {
  if (!boss.active) return;
  boss.t += dt;

  if (boss.state === 'dying') {
    boss.deathTimer += dt;
    const stage = Math.floor(boss.deathTimer / 0.7);
    if (stage > boss.deathStage && stage < 3) {
      boss.deathStage = stage;
      const colors = ['#ffaa00', '#ff6b00', '#ffffff'];
      explode(boss.x + rand(-60, 60), boss.y + rand(-40, 40), colors[stage], 35, 2);
      Game.shake = 28;
      Game.flash = 0.85;
      Audio.explosion();
    }
    // 慢动作效果
    if (boss.deathTimer < 2) {
      Game.timeScale = Math.max(0.3, Game.timeScale);
    }
    // 残骸碎片
    if (Math.random() < 0.4) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        spawnParticle(boss.x, boss.y, Math.cos(a)*rand(200,500), Math.sin(a)*rand(200,500), rand(1, 2), rand(4, 8), '#ffaa00');
      }
    }
    if (boss.deathTimer > 2.5) {
      boss.state = 'dead'; boss.active = false;
      Game.timeScale = 1;
      explode(boss.x, boss.y, '#ffaa00', 60, 2.5);
      explode(boss.x, boss.y, '#ffffff', 30, 1.5);
      Game.flash = 1;
      Game.shake = 30;
      Audio.explosion();
      document.getElementById('bossBarWrap').classList.remove('active');
      for (let i = 0; i < 8; i++) spawnPowerup(boss.x + rand(-60,60), boss.y + rand(-30,30));
      AchievementSystem.unlock('bossKiller');
      awardCredits(180 + boss.stage * 45, '旗舰击破');
      // 无伤通关检查
      const anyDamage = players.some(p => p.damageTakenThisBoss);
      if (!anyDamage) AchievementSystem.unlock('noDamageBoss');
      BGM.stop();
      if (Game.mode === 'endless') {
        // 无尽模式：进入下一阶段，准备刷新更强的 BOSS
        startEndlessIntermission();
      } else {
        advanceCampaign();
      }
    }
    return;
  }

  if (boss.state !== 'fight') return;

  // 移动：横向巡航（高阶段速度更快、振幅更大）
  const stageCfg = getBossStageConfig(boss.stage);
  const moveAmp = 120 * stageCfg.moveMult;
  const moveFreq = 0.6 + (boss.stage - 1) * 0.05;
  boss.vx = Math.sin(boss.t * moveFreq) * moveAmp;
  boss.x += boss.vx * dt;
  boss.x = clamp(boss.x, 100, CFG.W - 100);

  // 阶段切换
  const hpRatio = boss.hp / boss.maxHp;
  const newPhase = hpRatio > boss.phaseThresholds[0] ? 0 :
                   hpRatio > boss.phaseThresholds[1] ? 1 : 2;
  if (newPhase !== boss.phase) {
    boss.phase = newPhase;
    // Phase transitions are short damage windows: clear bullets, show a warning, then grant invulnerability.
    boss.phaseInvulnerable = 2.2;
    boss.patternIndex = 0; boss.patternTimer = 0;
    boss.patternSwitchTimer = 3; boss.telegraph = 1; boss.wallWarning = 0;
    Game.flash = 0.3; Game.shake = 12;
    for (const b of enemyBullets) {
      spawnParticle(b.x, b.y, rand(-50,50), rand(-50,50), 0.5, 4, b.color);
    }
    enemyBullets.length = 0;
    showToast(`BOSS 阶段 ${boss.phase + 1}`);
    Audio.bossWarn();
  }

  // 弹幕模式切换
  boss.patternSwitchTimer -= dt;
  if (boss.patternSwitchTimer <= 0) {
    // 阶段越高、模式越多。第 5+ 阶段解锁隐藏弹幕 4
    const stageHasHidden = boss.stage >= 5;
    const phasePatterns = stageHasHidden
      ? [[0, 1, 4], [0, 1, 2, 4], [0, 1, 2, 3, 4]]
      : [[0, 1], [0, 1, 2], [0, 1, 2, 3]];
    const arr = phasePatterns[boss.phase] || phasePatterns[phasePatterns.length - 1];
    boss.patternIndex = arr[randi(0, arr.length - 1)];
    // 高阶段模式切换更快
    boss.patternSwitchTimer = Math.max(2, rand(3, 5) - (boss.stage - 1) * 0.25);
    boss.patternTimer = 0; boss.telegraph = 0.8; boss.wallWarning = 0;
  }

  if (boss.phaseInvulnerable > 0) { boss.phaseInvulnerable -= dt; boss.telegraph = Math.max(boss.telegraph, 0.65); return; }
  if (boss.telegraph > 0) { boss.telegraph -= dt; return; }
  // 执行弹幕
  boss.patternTimer -= dt;
  runBossPattern(boss.patternIndex, dt);
}

function runBossPattern(idx, dt) {
  const b = boss;
  const target = getNearestPlayer(b.x, b.y);
  const cfg = getBossStageConfig(b.stage);
  // 第 5 阶段及以上：解锁隐藏模式 4（散射螺旋）
  const maxPatterns = b.stage >= 5 ? 5 : 4;
  if (idx === 0) {
    if (b.patternTimer <= 0) {
      const count = 18 + b.phase * 8 + cfg.densityBonus * 4;
      const speed = (140 + b.phase * 30) * cfg.bulletMult;
      const offset = Math.random() * TAU;
      for (let i = 0; i < count; i++) {
        const a = offset + (i / count) * TAU;
        spawnEnemyBullet(b.x, b.y, Math.cos(a)*speed, Math.sin(a)*speed, 12, COLORS.enemyBullet, 6);
      }
      b.patternTimer = Math.max(0.6, 1.4 - b.phase * 0.2 - (b.stage - 1) * 0.05);
      Audio.enemyShoot();
    }
  } else if (idx === 1) {
    if (b.patternTimer <= 0 && target) {
      const dx = target.x - b.x, dy = target.y - b.y;
      const speed = 260 * cfg.bulletMult;
      const lines = 3 + Math.floor((b.stage - 1) / 2);
      for (let i = -(lines - 1) / 2; i <= (lines - 1) / 2; i += 1) {
        const a = Math.atan2(dy, dx) + i * 0.18;
        spawnEnemyBullet(b.x, b.y + 30, Math.cos(a)*speed, Math.sin(a)*speed, 14, '#ff8800', 7);
      }
      b.patternTimer = Math.max(0.18, 0.35 - (b.stage - 1) * 0.02);
      Audio.enemyShoot();
    }
  } else if (idx === 2) {
    if (b.patternTimer > 0) return;
    const arms = 2 + b.phase + Math.floor(cfg.densityBonus / 2);
    const speed = 160 * cfg.bulletMult;
    for (let i = 0; i < arms; i++) {
      const a = b.t * 6 + (i / arms) * TAU;
      spawnEnemyBullet(b.x, b.y, Math.cos(a)*speed, Math.sin(a)*speed, 10, '#ff3366', 5);
    }
    b.patternTimer = 0.05;
  } else if (idx === 3) {
    if (b.wallWarning > 0) {
      b.wallWarning -= dt;
      if (b.wallWarning <= 0) {
        const speed = Math.min(330, 180 + (b.stage - 1) * 12) * cfg.bulletMult;
        for (let x = 12; x < CFG.W; x += 26) {
          if (Math.abs(x - b.gapCenter) < b.gapWidth / 2) continue;
          spawnEnemyBullet(x, b.y + 40, 0, speed, 14, '#ffaa00', 7);
        }
        b.patternTimer = 1.8;
        Audio.enemyShoot();
      }
    } else if (b.patternTimer <= 0) {
      b.gapCenter = clamp(target ? target.x + rand(-100, 100) : CFG.W / 2, 85, CFG.W - 85);
      b.gapWidth = Math.max(92, 135 - (b.stage - 1) * 5);
      b.wallWarning = 0.85;
    }


  } else if (idx === 4) {
    if (b.patternTimer > 0) return;
    // 隐藏模式：双螺旋散射（5+ 阶段解锁）
    const speed = 180 * cfg.bulletMult;
    const arms1 = 3 + cfg.densityBonus;
    const arms2 = 3 + cfg.densityBonus;
    for (let i = 0; i < arms1; i++) {
      const a = b.t * 5 + (i / arms1) * TAU;
      spawnEnemyBullet(b.x, b.y, Math.cos(a)*speed, Math.sin(a)*speed, 11, '#ff44ff', 5);
    }
    for (let i = 0; i < arms2; i++) {
      const a = -b.t * 5 + (i / arms2) * TAU + 0.3;
      spawnEnemyBullet(b.x, b.y, Math.cos(a)*speed, Math.sin(a)*speed, 11, '#c4b5fd', 5);
    }
    b.patternTimer = 0.06;
  }
  return maxPatterns;
}

function damageBoss(dmg, killer) {
  if (boss.state !== 'fight' || boss.telegraph > 0 || boss.phaseInvulnerable > 0) return;
  if (killer) AchievementSystem.recordHit();
  boss.hp = Math.max(0, boss.hp - dmg * 0.72);
  if (killer) boss.lastDamager = killer;
  if (boss.hp <= 0) {
    boss.state = 'dying'; boss.deathTimer = 0; boss.deathStage = -1;
    boss.wallWarning = 0; enemyBullets.length = 0;
    for (const p of players) p.invincible = Math.max(p.invincible, 4);
  }
}

// ============ 武器系统 ============
function playerFire(p, dt, controls) {
  p.fireTimer -= dt;
  if (p.fireTimer > 0) return;
  if (!controls.shoot) return;
  const w = p.currentWeapon;
  const lvl = 1 + (p.weaponLevel - 1) * 0.35;
  const tier = p.weaponLevel;
  const overdrive = p.overdriveTime > 0;
  const dmgMult = p.damageMult * (overdrive ? 2 : 1);
  const fireRate = p.fireRateMult * (overdrive ? 2 : 1);

  if (w === 0) {
    const interval = 0.16 / fireRate;
    p.fireTimer = interval;
    const dmg = 14 * lvl * dmgMult;
    spawnBullet(p.x, p.y - 20, 0, -700, dmg, p.color, 5, p.id);
    if (tier >= 3) {
      spawnBullet(p.x - 12, p.y - 15, 0, -700, dmg * 0.6, p.color, 4, p.id);
      spawnBullet(p.x + 12, p.y - 15, 0, -700, dmg * 0.6, p.color, 4, p.id);
    }
    if (tier >= 5) {
      spawnBullet(p.x - 20, p.y - 10, -80, -680, dmg * 0.5, p.color, 4, p.id);
      spawnBullet(p.x + 20, p.y - 10, 80, -680, dmg * 0.5, p.color, 4, p.id);
    }
    Audio.shoot();
  } else if (w === 1) {
    const interval = 0.32 / fireRate;
    p.fireTimer = interval;
    const dmg = 9 * lvl * dmgMult;
    const pellets = 3 + tier + p.scatterBonus;
    const spread = 0.6;
    for (let i = 0; i < pellets; i++) {
      const a = -Math.PI/2 + (i / (pellets - 1) - 0.5) * spread;
      spawnBullet(p.x, p.y - 15, Math.cos(a)*620, Math.sin(a)*620, dmg, '#ffcc00', 4, p.id);
    }
    Audio.shoot();
  } else if (w === 2) {
    const interval = 0.04 / fireRate;
    p.fireTimer = interval;
    const dmg = 5 * lvl * dmgMult;
    spawnBullet(p.x, p.y - 20, 0, -1000, dmg, '#ff44ff', 3, p.id);
    if (tier >= 3) {
      spawnBullet(p.x - 8, p.y - 18, 0, -1000, dmg * 0.7, '#ff44ff', 2, p.id);
      spawnBullet(p.x + 8, p.y - 18, 0, -1000, dmg * 0.7, '#ff44ff', 2, p.id);
    }
    if (Math.random() < 0.3) Audio.beep(1200, 0.03, 'sawtooth', 0.04);
  } else if (w === 3) {
    const interval = 0.5 / fireRate;
    p.fireTimer = interval;
    const dmg = 30 * lvl * dmgMult;
    spawnMissile(p.x - 15, p.y, dmg, p.id);
    if (tier >= 2) spawnMissile(p.x + 15, p.y, dmg, p.id);
    if (tier >= 4) { spawnMissile(p.x - 30, p.y + 5, dmg * 0.7, p.id); spawnMissile(p.x + 30, p.y + 5, dmg * 0.7, p.id); }
    Audio.beep(400, 0.1, 'triangle', 0.08, -200);
  }
}

const missiles = [];
function spawnMissile(x, y, dmg, owner) {
  missiles.push({ x, y, vx: rand(-50,50), vy: -100, dmg, life: 3, target: null, turnTimer: 0, owner });
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    if (!m.target || m.target.hp <= 0) {
      let best = null, bd = Infinity;
      for (const e of enemies) {
        const d = dist2(m, e); if (d < bd) { bd = d; best = e; }
      }
      if (boss.active && boss.state === 'fight') {
        const d = dist2(m, boss); if (d < bd) { bd = d; best = boss; }
      }
      m.target = best;
    }
    if (m.target) {
      const dx = m.target.x - m.x, dy = m.target.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      m.vx = lerp(m.vx, (dx / len) * 380, 0.08);
      m.vy = lerp(m.vy, (dy / len) * 380, 0.08);
    } else {
      m.vy = Math.max(m.vy - 200 * dt, -400);
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
    spawnParticle(m.x, m.y, 0, 0, 0.2, 3, '#ffaa00');
    let hit = false;
    const killer = m.owner === 'p1' ? players[0] : (m.owner === 'p2' ? players[1] : null);
    for (const e of enemies) {
      if (dist2(m, e) < (e.radius + 6) ** 2) {
        damageEnemy(e, m.dmg, killer); hit = true; break;
      }
    }
    if (!hit && boss.active && boss.state === 'fight' && dist2(m, boss) < (boss.radius + 6) ** 2) {
      damageBoss(m.dmg, killer); hit = true;
    }
    if (hit || m.life <= 0 || m.y < -20 || m.y > CFG.H + 20) {
      explode(m.x, m.y, '#ffaa00', 8, 0.5);
      missiles.splice(i, 1);
    }
  }
}

// ============ 敌机更新 ============
function updateEnemies(dt) {
  for (const e of [...enemies]) {
    if (e.hp <= 0) continue;
    e.t += dt;
    const target = getNearestPlayer(e.x, e.y);
    if (e.track && target) {
      const dx = target.x - e.x;
      e.vx = clamp(dx * 1.5, -120, 120);
    } else if (e.cruise) {
      e.x = e.spawnX + Math.sin(e.t * 1.2) * 150;
    } else if (e.type === 'fighter') {
      e.x = e.spawnX + Math.sin(e.t * 2.5) * 80;
    }
    e.x += e.vx * dt; e.y += e.vy * dt;

    if (e.fireInterval && target) {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.y > 0 && e.y < CFG.H - 100) {
        e.fireTimer = e.fireInterval;
        if (e.type === 'fighter') {
          const dx = target.x - e.x, dy = target.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          spawnEnemyBullet(e.x, e.y + 15, (dx/len)*300, (dy/len)*300, 10, COLORS.enemyBullet, 5);
        } else if (e.type === 'gunner') {
          for (let k = -1; k <= 1; k++) {
            const a = Math.PI/2 + k * 0.35;
            spawnEnemyBullet(e.x, e.y + 15, Math.cos(a)*270, Math.sin(a)*270, 10, COLORS.enemy2, 5);
          }
        } else if (e.type === 'elite') {
          const dx = target.x - e.x, dy = target.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          spawnEnemyBullet(e.x, e.y + 15, (dx/len)*255, (dy/len)*255, 14, COLORS.elite, 6);
          spawnEnemyBullet(e.x - 10, e.y, (dx/len)*255 - 45, (dy/len)*255, 12, COLORS.elite, 5);
          spawnEnemyBullet(e.x + 10, e.y, (dx/len)*255 + 45, (dy/len)*255, 12, COLORS.elite, 5);
        }
        Audio.enemyShoot();
      }
    }

    if (e.y > CFG.H + 30 || e.x < -50 || e.x > CFG.W + 50) {
      const index = enemies.indexOf(e); if (index >= 0) enemies.splice(index, 1); continue;
    }
    // 撞玩家
    for (const p of players) {
      if (!p.alive) continue;
      if (dist2(e, p) < (e.radius + p.radius - 4) ** 2 && p.invincible <= 0 && p.phaseDashTime <= 0) {
        damagePlayer(p, 20, 'enemy');
        damageEnemy(e, 999, p);
        break;
      }
    }
  }
}

function damageEnemy(e, dmg, killer) {
  if (e.hp <= 0) return;
  if (killer) AchievementSystem.recordHit();
  e.hp -= dmg;
  if (e.hp <= 0) {
    explode(e.x, e.y, e.color, 14, 0.8);
    // 击杀火花
    spawnSparks(e.x, e.y, '#ffffff', 8);
    spawnSparks(e.x, e.y, '#ffee00', 6);
    Audio.explosion();
    if (killer) {
      killer.kills++;
      killer.exp += e.exp;
      killer.hits++;
      awardCredits(Math.max(1, Math.ceil(e.score / 12)), '击落');
      recordCombo(killer, e);
      // 连杀记录
      AchievementSystem.recordKill();
    } else {
      awardScore(null, e.score);
    }
    Game.shake = Math.max(Game.shake, 3);
    if (Math.random() < 0.55) spawnPowerup(e.x, e.y);
    // 经验升级
    if (killer) {
      processLevels(killer);
    }

    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    if (killer?.chainLevel && !e.chainHit) {
      const targets = enemies.filter(other => dist2(other, e) < 125 ** 2).slice(0, 3);
      for (const other of targets) { other.chainHit = true; damageEnemy(other, 18 * killer.chainLevel, killer); }
    }
    // 成就检查
    AchievementSystem.checkAchievements();
  } else {
    // 击中火花特效
    spawnSparks(e.x, e.y, '#ffee00', 4);
    spawnParticle(e.x, e.y, rand(-30,30), rand(-30,30), 0.2, 3, '#ffffff');
    if (killer) killer.hits++;
  }
}

// ============ 玩家更新 ============
function updatePlayer(p, dt, controls) {
  if (!p.alive) return;

  updateBuild(p, dt);
  const slow = controls.slow; p.slow = slow;
  const sp = slow ? p.slowSpeed : p.speed;
  let mx = 0, my = 0;
  if (controls.left) mx -= 1;
  if (controls.right) mx += 1;
  if (controls.up) my -= 1;
  if (controls.down) my += 1;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
  }
  p.x = clamp(p.x + mx * sp * dt, 20, CFG.W - 20);
  p.y = clamp(p.y + my * sp * dt, 20, CFG.H - 20);

  // 引擎尾焰
  if (Math.random() < 0.8) {
    spawnParticle(p.x + rand(-4,4), p.y + 16, rand(-10,10), rand(80,160), 0.3, rand(2,4), p.color);
    if (p.overdriveTime > 0) spawnParticle(p.x, p.y + 16, 0, 200, 0.3, 4, '#ff44ff');
  }

  // 计时器
  if (p.invincible > 0) p.invincible -= dt;
  if (p.phaseDashTime > 0) p.phaseDashTime -= dt;
  if (p.overdriveTime > 0) p.overdriveTime -= dt;
  for (let i = 0; i < 3; i++) if (p.skillCD[i] > 0) p.skillCD[i] -= dt;

  // 护盾回复
  if (p.shield < p.maxShield) {
    p.shieldRegen += dt;
    if (p.shieldRegen > 3) {
      p.shield = Math.min(p.maxShield, p.shield + 15 * dt);
    }
  }

  // 射击
  playerFire(p, dt, controls);

  // 技能1：相位冲刺
  if (controls.skill1 && p.skillCD[0] <= 0) {
    p.skillCD[0] = p.skillMaxCD[0];
    p.phaseDashTime = 0.4;
    p.invincible = Math.max(p.invincible, 0.6);
    const dx = (controls.left?-1:0) + (controls.right?1:0);
    let dy = (controls.up?-1:0) + (controls.down?1:0);
    if (!dx && !dy) dy = -1;
    const len = Math.hypot(dx,dy) || 1;
    p.x = clamp(p.x + (dx/len) * 150, 20, CFG.W - 20);
    p.y = clamp(p.y + (dy/len) * 150, 20, CFG.H - 20);
    for (let i = 0; i < 20; i++) spawnParticle(p.x, p.y, rand(-200,200), rand(-200,200), 0.4, 3, '#7c3aed');
    Audio.beep(800, 0.15, 'sine', 0.15, -400);
    showToast((p.id === 'p1' ? 'P1' : 'P2') + ' 相位冲刺');
    p.skillsUsedThisGame[0] = true;
  }
  // 技能2：电磁脉冲
  if (controls.skill2 && p.skillCD[1] <= 0) {
    p.skillCD[1] = p.skillMaxCD[1];
    for (const b of enemyBullets) {
      spawnParticle(b.x, b.y, rand(-100,100), rand(-100,100), 0.5, 3, b.color);
      awardScore(p, 5);
    }
    enemyBullets.length = 0;
    for (const e of [...enemies]) damageEnemy(e, 30, p);
    if (boss.active && boss.state === 'fight') damageBoss(50, p);
    Game.flash = 0.4; Game.shake = 10;
    Audio.bomb();
    showToast((p.id === 'p1' ? 'P1' : 'P2') + ' 电磁脉冲 EMP');
    p.skillsUsedThisGame[1] = true;
  }
  // 技能3：过载射击
  if (controls.skill3 && p.skillCD[2] <= 0) {
    p.skillCD[2] = p.skillMaxCD[2];
    p.overdriveTime = 5;
    Audio.beep(440, 0.3, 'sawtooth', 0.2, 220);
    showToast((p.id === 'p1' ? 'P1' : 'P2') + ' 过载射击启动');
    p.skillsUsedThisGame[2] = true;
  }
  // 炸弹
  if (controls.bomb && p.bombs > 0) {
    p.bombs--;
    p.bombsUsed++;
    for (const b of enemyBullets) {
      spawnParticle(b.x, b.y, rand(-150,150), rand(-150,150), 0.6, 4, b.color);
      awardScore(p, 10);
    }
    enemyBullets.length = 0;
    for (const e of [...enemies]) damageEnemy(e, 80, p);
    if (boss.active && boss.state === 'fight') {
      showToast('Boss 免疫炸弹伤害');
    }
    Game.flash = 0.5; Game.shake = 15;
    Audio.bomb();
    explode(p.x, p.y - 100, '#ffaa00', 40, 1.5);
    showToast((p.id === 'p1' ? 'P1' : 'P2') + ' 炸弹释放');
  }
  // 切换武器
  if (controls.weaponSwitch) {
    const owned = [...p.ownedWeapons].sort();
    const curIdx = owned.indexOf(p.currentWeapon);
    p.currentWeapon = owned[(curIdx + 1) % owned.length];
    showToast((p.id === 'p1' ? 'P1' : 'P2') + ' 武器: ' + ['脉冲炮','散射枪','激光束','追踪导弹'][p.currentWeapon]);
    Audio.beep(660, 0.08, 'triangle', 0.08);
  }

  // 死亡
  if (p.hp <= 0 && p.alive) {
    p.alive = false;
    explode(p.x, p.y, p.color, 40, 1.5);
    explode(p.x, p.y, '#ffffff', 20, 1);
    Audio.explosion();
    Game.shake = 25;
    // 检查游戏结束条件
    checkPlayerDeath();
  }
}

function damagePlayer(p, dmg, source) {
  if (!p.alive || p.invincible > 0 || p.phaseDashTime > 0) return;
  if (p.shipId === 'titan' && p.hp < p.maxHp * 0.35) dmg *= 0.72;
  p.damageTaken += dmg; p.combo = 0; p.comboTime = 0;
  p.invincible = 0.65;
  p.shieldRegen = 0;
  p.damageTakenThisBoss = true;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    spawnParticle(p.x, p.y, 0, 0, 0.2, 30, COLORS.shield, 0.6);
  }
  if (dmg > 0) {
    p.hp = Math.max(0, p.hp - dmg);
    p.invincible = 1.2;
    Audio.hit();
    Game.shake = Math.max(Game.shake, 8);
    // 红色闪光
    Game.damageFlash = 0.3;
    // 红色粒子
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU;
      spawnParticle(p.x, p.y, Math.cos(a)*rand(80,200), Math.sin(a)*rand(80,200), rand(0.3,0.6), rand(2,4), '#ff3366');
    }
  }
  if (p.hp <= 0 && p.alive) {
    p.alive = false; explode(p.x, p.y, p.color, 35, 1.4); Audio.explosion(); checkPlayerDeath();
  }
}

function checkPlayerDeath() {
  if (Game.mode === 'single' || Game.mode === 'endless') {
    if (!players[0].alive) Game.gameOver(false);
  } else if (Game.mode === 'coop') {
    if (players.every(p => !p.alive)) Game.gameOver(false);
  } else if (Game.mode === 'pk') {
    const alive = players.filter(p => p.alive);
    if (alive.length <= 1) {
      const winnerIdx = alive.length === 1 ? players.indexOf(alive[0]) : -1;
      Game.gameOverPk(winnerIdx);
    }
  }
}

// ============ 子弹更新 ============
function updateBullets(dt) {
  // 玩家子弹
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.y < -20 || b.y > CFG.H + 20 || b.x < -20 || b.x > CFG.W + 20) {
      bullets.splice(i, 1); continue;
    }
    let consumed = false;
    const killer = getBulletOwnerPlayer(b);
    for (const e of enemies) {
      if (dist2(b, e) < (e.radius + b.radius) ** 2) {
        damageEnemy(e, b.dmg, killer);
        // 击中火花
        spawnSparks(b.x, b.y, '#ffffff', 4);
        consumed = true; break;
      }
    }
    if (!consumed && boss.active && boss.state === 'fight' && dist2(b, boss) < (boss.radius + b.radius) ** 2) {
      damageBoss(b.dmg, killer);
      spawnParticle(b.x, b.y, 0, 0, 0.15, 8, '#ffaa00');
      spawnSparks(b.x, b.y, '#ffaa00', 3);
      consumed = true;
    }
    // PK 模式：玩家子弹可伤害对方
    if (!consumed && Game.mode === 'pk') {
      for (const p of players) {
        if (!p.alive || p.id === b.owner) continue;
        if (dist2(b, p) < (p.hitRadius + b.radius) ** 2) {
          damagePlayer(p, b.dmg, b.owner);
          consumed = true; break;
        }
      }
    }
    if (consumed) bullets.splice(i, 1);
  }
  // 敌机子弹
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.y < -30 || b.y > CFG.H + 30 || b.x < -30 || b.x > CFG.W + 30) {
      enemyBullets.splice(i, 1); continue;
    }
    for (const p of players) {
      if (!p.alive) continue;
      const distance = dist2(b, p);
      const mask = p.id === 'p1' ? 1 : 2;
      if (!(b.grazed & mask) && p.invincible <= 0 && distance > (p.hitRadius + b.radius) ** 2 && distance < (p.hitRadius + b.radius + 20) ** 2) {
        b.grazed |= mask; p.grazes++; awardScore(p, 8);
        p.shield = Math.min(p.maxShield, p.shield + 1);
        for (let k = 0; k < 3; k++) p.skillCD[k] = Math.max(0, p.skillCD[k] - 0.12);
        if (p.grazes % 5 === 0) floatingText(p.x, p.y - 26, 'GRAZE +' + p.grazes, '#a8a0ff');
      }
      if (distance < (p.hitRadius + b.radius) ** 2) {
        damagePlayer(p, b.dmg, 'enemy');
        enemyBullets.splice(i, 1);
        break;
      }
    }
  }
}

// ============ 道具更新 ============
function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    const target = getNearestPlayer(p.x, p.y);
    if (target && dist2(p, target) < target.magnet ** 2) {
      const dx = target.x - p.x, dy = target.y - p.y, length = Math.hypot(dx, dy) || 1;
      const step = Math.min(length, 390 * dt);
      p.x += dx / length * step; p.y += dy / length * step;
    } else p.y += p.vy * dt;
    p.t += dt;
    if (p.y > CFG.H + 20) { powerups.splice(i, 1); continue; }
    for (const pl of players) {
      if (!pl.alive) continue;
      if (dist2(p, pl) < (p.radius + pl.radius + 5) ** 2) {
        applyPowerup(pl, p.type);
        powerups.splice(i, 1);
        Audio.powerup();
        break;
      }
    }
  }
}
function applyPowerup(p, type) {
  const info = powerupInfo[type];
  // 道具拾取汇聚特效
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * TAU;
    const d = rand(40, 80);
    const sx = p.x + Math.cos(angle) * d;
    const sy = p.y + Math.sin(angle) * d;
    spawnParticle(sx, sy, (p.x - sx) / 0.3, (p.y - sy) / 0.3, 0.3, rand(2, 4), info.color);
  }
  // 爆发
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * TAU;
    spawnParticle(p.x, p.y, Math.cos(a)*rand(80,150), Math.sin(a)*rand(80,150), 0.4, rand(2,4), info.color);
  }
  // 彩色闪光
  Game.powerupFlashColor = info.color;
  Game.powerupFlashAlpha = 0.25;

  switch (type) {
    case 'exp':
      // Experience drops should finish a bar without chaining several levels.
      p.exp += 3;
      processLevels(p);

      break;
    case 'weaponUp':
      if (p.weaponLevel < 5) { p.weaponLevel++; showToast((p.id==='p1'?'P1':'P2') + ' 武器升级 Lv.' + p.weaponLevel); }
      else { if (Game.mode==='pk') p.score += 200; else Game.score += 200; showToast('武器满级 +200 分'); }
      break;
    case 'shield':
      p.shield = p.maxShield; showToast((p.id==='p1'?'P1':'P2') + ' 护盾已充满'); break;
    case 'bomb':
      p.bombs = Math.min(5, p.bombs + 1); showToast((p.id==='p1'?'P1':'P2') + ' 炸弹 +1'); break;
    case 'heal':
      p.hp = Math.min(p.maxHp, p.hp + 30); showToast((p.id==='p1'?'P1':'P2') + ' 血量恢复 +30'); break;
    case 'weaponSwitch':
      const all = [0,1,2,3];
      const unowned = all.filter(w => !p.ownedWeapons.has(w));
      if (unowned.length) {
        const nw = unowned[randi(0, unowned.length - 1)];
        p.ownedWeapons.add(nw);
        p.currentWeapon = nw;
        showToast((p.id==='p1'?'P1':'P2') + ' 解锁武器: ' + ['脉冲炮','散射枪','激光束','追踪导弹'][nw]);
      } else {
        p.weaponLevel = Math.min(5, p.weaponLevel + 1);
        showToast((p.id==='p1'?'P1':'P2') + ' 武器强化 Lv.' + p.weaponLevel);
      }
      break;
  }
  AchievementSystem.checkAchievements();
}

// ============ 刷怪系统（分数驱动动态难度） ============
const wave = {
  timer: 0,
  totalElapsed: 0,
  spawnInterval: 1.2,
  phase: 'calm', // calm | normal | tense | boss
  bossTriggered: false,
  endlessIntermission: 0, // 无尽模式 BOSS 间隔倒计时
  endlessCleared: false,   // 无尽模式首阶段前是否已清场进入 BOSS
};

// 无尽模式：BOSS 死亡后的过渡阶段（发放奖励 + 倒计时 + 持续刷怪）
function startEndlessIntermission() {
  // 先记录刚刚击败的 BOSS 阶段（成就判定用）
  const defeatedStage = boss.stage;
  Game.cleared++; awardScore(null, 1000 * defeatedStage);
  for (const p of players) if (p.alive) {
    p.hp = Math.min(p.maxHp, p.hp + 25); p.shield = p.maxShield;
    p.pendingUpgrades++; if (!Game.upgradeQueue.includes(p)) Game.upgradeQueue.push(p);
  }
  boss.stage++; // 进入下一阶段
  wave.endlessIntermission = 6; // 6 秒缓冲期：刷怪 + 让玩家拾取道具
  wave.bossTriggered = false;   // 允许重新触发 BOSS
  wave.phase = 'tense';         // 继续刷精英敌机
  // 持续 BGM（恢复紧张阶段）
  BGM.start('tense');
  // HUD：显示下一阶段倒计时 + 即将到来的阶段号
  document.getElementById('endlessStage').textContent = 'STAGE ' + boss.stage;
  const next = document.getElementById('endlessNext');
  if (next) next.textContent = '下一阶段 6s';
  showToast('✦ STAGE ' + boss.stage + ' · ' + getBossStageConfig(boss.stage).name + ' 即将到来 ✦', true);
  // 成就：击败 3/5/8 阶段 BOSS
  if (defeatedStage >= 3) AchievementSystem.unlock('endlessStage3');
  if (defeatedStage >= 5) AchievementSystem.unlock('endlessStage5');
  if (defeatedStage >= 8) AchievementSystem.unlock('endlessStage8');
  // 持久化最高击败阶段
  const save = Storage.load();
  if (defeatedStage > (save.endlessMaxStage || 0)) {
    save.endlessMaxStage = defeatedStage;
    Storage.save(save);
  }
  save.endlessCheckpoint = { stage: boss.stage, score: Game.score, elapsed: Game.elapsed, difficulty: Game.difficulty, ship: Game.ship, savedAt: Date.now(), player: players[0] ? {
    hp: players[0].hp, shield: players[0].shield, level: players[0].level, exp: players[0].exp, expToNext: players[0].expToNext,
    weaponLevel: players[0].weaponLevel, currentWeapon: players[0].currentWeapon, ownedWeapons: [...players[0].ownedWeapons],
    damageMult: players[0].damageMult, fireRateMult: players[0].fireRateMult, scatterBonus: players[0].scatterBonus,
    droneLevel: players[0].droneLevel, chainLevel: players[0].chainLevel, magnet: players[0].magnet, bombs: players[0].bombs, rerolls: players[0].rerolls,
  } : null };
  Storage.save(save);
}

function updateWave(dt) {
  if (boss.active || bossCG.active) return;
  wave.totalElapsed += dt; wave.sectorElapsed += dt; wave.timer += dt;
  if (Game.mode === 'endless' && wave.endlessIntermission > 0) {
    wave.endlessIntermission -= dt;
    $('endlessNext').textContent = '整备 ' + Math.max(0, Math.ceil(wave.endlessIntermission)) + 's';
    if (wave.endlessIntermission <= 0) { wave.bossTriggered = true; enemies.length = 0; startBossCG(); }
    return;
  }
  const duration = Game.mode === 'endless' ? 30 : SECTORS[Game.sector].duration;
  const progress = wave.sectorElapsed / duration;
  const newPhase = progress < 0.3 ? 'calm' : progress < 0.7 ? 'normal' : 'tense';
  if (newPhase !== wave.phase) { const old = wave.phase; wave.phase = newPhase; onPhaseChange(old, newPhase); }
  if (Game.mode !== 'pk' && progress >= 1 && !wave.bossTriggered) {
    wave.bossTriggered = true; wave.phase = 'boss'; enemies.length = 0; startBossCG(); return;
  }
  wave.spawnInterval = ({ calm: 1.65, normal: 1.4, tense: 1.2 })[wave.phase];
  if (wave.timer >= wave.spawnInterval) { wave.timer = 0; spawnWave(); }
}


function onPhaseChange(oldPhase, newPhase) {
  if (newPhase === 'boss') return; // Boss CG 会处理
  BGM.setPhase(newPhase);
  const messages = { normal: '⚠ 警告：敌机增援', tense: '⚠ 警告：精英机出现' };
  if (messages[newPhase]) showToast(messages[newPhase]);
}

function spawnWave() {
  const pattern = wave.formation++ % 6;
  const strong = wave.phase === 'tense';
  if (pattern === 0 || pattern === 3) {
    const count = CFG.W < 600 ? 6 : 9;
    for (let i = 0; i < count; i++) {
      spawnEnemy('scout', CFG.W * (i + 1) / (count + 1), -28 - Math.abs(i - (count - 1) / 2) * 25);
    }
  } else if (pattern === 1 || pattern === 4) {
    const center = pattern === 1 ? CFG.W * 0.3 : CFG.W * 0.7;
    for (let i = 0; i < 4; i++) spawnEnemy(wave.phase === 'calm' ? 'scout' : 'fighter', center, -28 - i * 58);
  } else if (pattern === 2) {
    spawnEnemy(strong ? 'elite' : 'gunner', CFG.W / 2, -30);
    if (Game.sector > 0) { spawnEnemy('fighter', CFG.W * 0.2, -50); spawnEnemy('fighter', CFG.W * 0.8, -50); }
  } else {
    const count = strong ? 5 : 3;
    for (let i = 0; i < count; i++) spawnEnemy(strong ? 'kamikaze' : 'fighter', CFG.W * (i + 1) / (count + 1), -40 - i * 40);
  }
}


// ============ 渲染 ============
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function render() {
  let shakeX = 0, shakeY = 0;
  if (Preferences.value.shake && Game.shake > 0.1) {
    shakeX = rand(-Game.shake, Game.shake);
    shakeY = rand(-Game.shake, Game.shake);
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // 背景
  const bgImg = Assets.get('bg');
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, 0, CFG.W, CFG.H);
  } else {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-30, -30, CFG.W + 60, CFG.H + 60);
    ctx.strokeStyle = 'rgba(0,240,255,0.04)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    const off = (wave.totalElapsed * 30) % gridSize;
    for (let y = -off; y < CFG.H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.W, y); ctx.stroke();
    }
    for (let x = 0; x < CFG.W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CFG.H); ctx.stroke();
    }
  }
  renderStars(ctx);

  // 道具
  for (const p of powerups) {
    const info = powerupInfo[p.type];
    const pulse = 1 + Math.sin(p.t * 6) * 0.15;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.shadowBlur = 12; ctx.shadowColor = info.color;
    ctx.fillStyle = info.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI/2;
      const r = p.radius;
      if (i === 0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.icon, 0, 0);
    ctx.restore();
  }

  // 敌机
  for (const e of enemies) drawEnemy(e);

  // Boss
  if (boss.active && boss.state !== 'dead') drawBoss();

  // 玩家
  if (Game.state === 'playing' || Game.state === 'paused' || Game.state === 'upgrading') {
    for (const p of players) {
      if (p.alive) drawPlayer(p);
    }
  }

  // 子弹
  ctx.save();
  for (const b of bullets) {
    ctx.shadowBlur = 10; ctx.shadowColor = b.color;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - b.radius, b.y - b.radius * 2, b.radius * 2, b.radius * 4);
  }
  for (const b of enemyBullets) {
    ctx.shadowBlur = 8; ctx.shadowColor = b.color;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * 0.4, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // 导弹
  for (const m of missiles) {
    ctx.save();
    ctx.translate(m.x, m.y);
    const ang = Math.atan2(m.vy, m.vx) + Math.PI/2;
    ctx.rotate(ang);
    ctx.shadowBlur = 10; ctx.shadowColor = '#ffaa00';
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(-4, 6); ctx.lineTo(4, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 粒子
  renderParticles(ctx);

  renderTactical();

  // 全屏白闪
  if (Preferences.value.shake && Game.flash > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${Game.flash})`;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }
  // 红色受伤闪光
  if (Game.damageFlash > 0.01) {
    ctx.fillStyle = `rgba(255,0,0,${Game.damageFlash})`;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }
  // 道具拾取彩色闪光
  if (Preferences.value.effects && Game.powerupFlashAlpha > 0.01) {
    ctx.fillStyle = Game.powerupFlashColor;
    ctx.globalAlpha = Game.powerupFlashAlpha;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.globalAlpha = 1;
  }

  // Boss CG 动画
  drawBossCG(ctx);

  // 慢速模式提示圈
  if (Game.state === 'playing') {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive) continue;
      const scheme = i === 0 ? 'p1' : 'p2';
      const controls = Input.getControls(scheme);
      if (controls.slow) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 8, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  ctx.restore();
}

function drawPlayer(p) {
  const blink = p.invincible > 0 && Math.floor(p.invincible * 20) % 2 === 0;
  if (blink) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  // 过载光环
  if (p.overdriveTime > 0) {
    ctx.shadowBlur = 25; ctx.shadowColor = '#ff44ff';
    ctx.strokeStyle = `rgba(255,68,255,${0.5 + Math.sin(performance.now()/80)*0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, p.radius + 10, 0, TAU); ctx.stroke();
  }
  // 相位残影
  if (p.phaseDashTime > 0) {
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur = 20; ctx.shadowColor = '#7c3aed';
  }
  // 机身图片
  const img = Preferences.value.classicSkin ? Assets.get('player') : null;
  if (img && img.complete && img.naturalWidth > 0) {
    const size = 64;
    ctx.shadowBlur = 15; ctx.shadowColor = p.color;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, size/2, 0, TAU);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, -size/2, -size/2, size, size);
    ctx.restore();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12; ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, size/2, 0, TAU);
    ctx.stroke();
  } else {
    ctx.shadowBlur = 15; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-23, 13);
    ctx.lineTo(-8, 6);
    ctx.lineTo(-4, 14);
    ctx.lineTo(4, 14);
    ctx.lineTo(8, 6);
    ctx.lineTo(23, 13);
    ctx.lineTo(6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 8; ctx.shadowColor = '#fff';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -2, 3, 0, TAU); ctx.fill();
  }
  // 护盾
  if (p.shield > 0) {
    ctx.globalAlpha = 0.3 + (p.shield / p.maxShield) * 0.4;
    ctx.strokeStyle = COLORS.shield;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10; ctx.shadowColor = COLORS.shield;
    ctx.beginPath(); ctx.arc(0, 0, p.radius + 6, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.shadowBlur = 10; ctx.shadowColor = e.color;
  const hpRatio = e.hp / e.maxHp;
  const imgSizes = { scout: 32, fighter: 38, gunner: 48, kamikaze: 34, elite: 52 };
  const size = imgSizes[e.type] || 36;
  const img = Assets.get(e.type);
  const target = getNearestPlayer(e.x, e.y);
  if (img && img.complete && img.naturalWidth > 0) {
    if (e.type === 'kamikaze' && target) {
      ctx.rotate(Math.atan2(target.y - e.y, target.x - e.x) - Math.PI/2);
    }
    ctx.drawImage(img, -size/2, -size/2, size, size);
  } else {
    ctx.fillStyle = e.color;
    switch (e.type) {
      case 'scout':
        ctx.beginPath();
        ctx.moveTo(0, 12); ctx.lineTo(-10, -8); ctx.lineTo(10, -8); ctx.closePath();
        ctx.fill();
        break;
      case 'fighter':
        ctx.beginPath();
        ctx.moveTo(0, 14); ctx.lineTo(-14, 4); ctx.lineTo(-6, -10);
        ctx.lineTo(6, -10); ctx.lineTo(14, 4); ctx.closePath();
        ctx.fill();
        break;
      case 'gunner':
        ctx.fillRect(-16, -10, 32, 20);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-4, -4, 8, 8);
        break;
      case 'kamikaze':
        if (target) ctx.rotate(Math.atan2(target.y - e.y, target.x - e.x) - Math.PI/2);
        ctx.beginPath();
        ctx.moveTo(0, 14); ctx.lineTo(-8, -10); ctx.lineTo(8, -10); ctx.closePath();
        ctx.fill();
        if (Math.floor(performance.now() / 150) % 2 === 0) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(-2, -6, 4, 4);
        }
        break;
      case 'elite':
        ctx.beginPath();
        ctx.moveTo(0, 18); ctx.lineTo(-18, 6); ctx.lineTo(-12, -12);
        ctx.lineTo(12, -12); ctx.lineTo(18, 6); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
        break;
    }
  }
  if (hpRatio < 1) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-15, -e.radius - 8, 30, 3);
    ctx.fillStyle = '#ff3366';
    ctx.fillRect(-15, -e.radius - 8, 30 * hpRatio, 3);
  }
  ctx.restore();
}

function drawBoss() {
  const b = boss;
  const stageCfg = getBossStageConfig(b.stage);
  // BOSS 颜色随阶段变化
  const bossColor = stageCfg.palette[Math.min(b.stage - 1, stageCfg.palette.length - 1)];
  ctx.save();
  ctx.translate(b.x, b.y);
  const img = Assets.get('boss');
  if (img && img.complete && img.naturalWidth > 0) {
    const bossW = 180;
    const bossH = 140;
    ctx.shadowBlur = 25; ctx.shadowColor = bossColor;
    ctx.drawImage(img, -bossW/2, -bossH/2, bossW, bossH);
    // 高阶段叠加色调滤镜，让 BOSS 看起来更"凶"
    if (b.stage >= 2) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = Math.min(0.35, (b.stage - 1) * 0.08);
      ctx.fillStyle = bossColor;
      ctx.fillRect(-bossW/2, -bossH/2, bossW, bossH);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  } else {
    ctx.shadowBlur = 25; ctx.shadowColor = bossColor;
    ctx.fillStyle = bossColor;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(-40, 30);
    ctx.lineTo(-70, 0);
    ctx.lineTo(-50, -20);
    ctx.lineTo(-20, -35);
    ctx.lineTo(20, -35);
    ctx.lineTo(50, -20);
    ctx.lineTo(70, 0);
    ctx.lineTo(40, 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bossColor;
    ctx.fillRect(-30, -10, 60, 6);
    ctx.fillRect(-20, 10, 40, 4);
    const pulse = 0.7 + Math.sin(b.t * 4) * 0.3;
    ctx.shadowBlur = 20; ctx.shadowColor = '#fff';
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = bossColor;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0;
  for (let i = 0; i <= b.phase; i++) {
    ctx.fillStyle = '#ff3366';
    ctx.beginPath(); ctx.arc(-50 + i * 50, 55, 5, 0, TAU); ctx.fill();
  }
  // 阶段标识：STAGE 数字浮在 BOSS 下方
  if (Game.mode === 'endless') {
    ctx.shadowBlur = 8; ctx.shadowColor = bossColor;
    ctx.fillStyle = bossColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STAGE ' + b.stage, 0, 75);
  }
  ctx.restore();
}

// ============ 升级系统 ============
const upgradePool = [
  { name: '武器强化', desc: '当前武器等级 +1', icon: '⚡', apply: (p) => { if (p.weaponLevel < 5) { p.weaponLevel++; return true; } return false; } },
  { name: '僚机阵列', desc: '增加自动射击僚机火力，3 级进化为导弹蜂群', icon: '◈', eligible: p => p.droneLevel < 3, apply: p => { p.droneLevel++; return true; } },
  { name: '电弧传导', desc: '击杀向附近最多 3 架敌机传导 18 点伤害，可叠 3 层', icon: 'ϟ', eligible: p => p.chainLevel < 3, apply: p => { p.chainLevel++; return true; } },
  { name: '引力捕获', desc: '拾取半径 +70，护盾立即恢复 20', icon: '◎', eligible: p => p.magnet < 300, apply: p => { p.magnet += 70; p.shield = Math.min(p.maxShield, p.shield + 20); return true; } },
  { name: '火力全开', desc: '伤害 +25%', icon: '🔥', apply: (p) => { p.damageMult *= 1.25; return true; } },
  { name: '快速射击', desc: '射速 +20%', icon: '💨', apply: (p) => { p.fireRateMult *= 1.2; return true; } },
  { name: '护盾扩容', desc: '护盾上限 +30 并回满', icon: '🛡', apply: (p) => { p.maxShield += 30; p.shield = p.maxShield; return true; } },
  { name: '装甲强化', desc: '血量上限 +25 并回血', icon: '❤', apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); return true; } },
  { name: '引擎升级', desc: '移动速度 +15%', icon: '🚀', apply: (p) => { p.speed *= 1.15; p.slowSpeed *= 1.15; return true; } },
  { name: '冷却缩减', desc: '所有技能冷却 -20%', icon: '❄', apply: (p) => { for (let i = 0; i < 3; i++) p.skillMaxCD[i] *= 0.8; return true; } },
  { name: '散射增强', desc: '散射武器弹丸 +2', icon: '✦', eligible: p => p.ownedWeapons.has(1) && p.scatterBonus < 6, apply: (p) => { p.scatterBonus += 2; return true; } },
  { name: '炸弹补给', desc: '炸弹 +2', icon: '💣', apply: (p) => { p.bombs = Math.min(5, p.bombs + 2); return true; } },
  { name: '解锁激光', desc: '获得激光束武器（不会自动切换）', icon: '🔆', apply: (p) => { if (!p.ownedWeapons.has(2)) { p.ownedWeapons.add(2); return true; } return false; } },
  { name: '解锁导弹', desc: '获得追踪导弹武器（不会自动切换）', icon: '🎯', apply: (p) => { if (!p.ownedWeapons.has(3)) { p.ownedWeapons.add(3); return true; } return false; } },
  { name: '解锁散弹', desc: '获得散射枪武器（不会自动切换）', icon: '🌟', apply: (p) => { if (!p.ownedWeapons.has(1)) { p.ownedWeapons.add(1); return true; } return false; } },
];

function showUpgradePanel() {
  Game.upgradeQueue = Game.upgradeQueue.filter(p => p.alive && p.pendingUpgrades > 0);
  if (!Game.upgradeQueue.length) {
    $('upgradePanel').classList.add('hidden'); Game.state = 'playing'; syncShell(); return;
  }
  const p = Game.upgradeQueue[0];
  Game.state = 'upgrading'; pointer.id = null; Input.keys.clear(); Input.pressed.clear();
  $('upgradeTitle').textContent = `${p.id.toUpperCase()} · LEVEL ${p.level}`;
  $('upgradeSubtitle').textContent = '选择一项改装。战场已暂停，按 1 / 2 / 3 或点击确认。';
  $('buildSummary').textContent = `${WEAPON_NAMES[p.currentWeapon]} Lv.${p.weaponLevel} · 僚机 ${p.droneLevel}/3 · 电弧 ${p.chainLevel}/3 · 剩余选择 ${p.pendingUpgrades}`;
  $('btnReroll').textContent = `重掷选项 · 剩余 ${p.rerolls} 次`;
  $('btnReroll').disabled = p.rerolls <= 0;
  const pool = upgradePool.filter(u => {
    if (u.eligible && !u.eligible(p)) return false;
    if (u.name === '武器强化' && p.weaponLevel >= 5) return false;
    if (u.name === '炸弹补给' && p.bombs >= 5) return false;
    if (u.name === '引擎升级' && p.speed >= 520) return false;
    if (u.name === '快速射击' && p.fireRateMult >= 2.5) return false;
    if (u.name === '冷却缩减' && p.skillMaxCD[0] <= 2) return false;
    const weapon = { '解锁激光': 2, '解锁导弹': 3, '解锁散弹': 1 }[u.name];
    return weapon === undefined || !p.ownedWeapons.has(weapon);
  });
  const choices = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(randi(0, pool.length - 1), 1)[0]);
  $('upgradeCards').replaceChildren();
  const runId = Game.runId;
  choices.forEach((choice, index) => {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'upgrade-card';
    el.innerHTML = `<span class="upgrade-index">0${index + 1} / MODIFICATION</span><div class="upgrade-icon">${choice.icon}</div><div class="upgrade-name">${choice.name}</div><div class="upgrade-desc">${choice.desc}</div><span class="upgrade-select">安装改装 ↗</span>`;
    el.onclick = () => {
      if (Game.state !== 'upgrading' || Game.runId !== runId || Game.upgradeQueue[0] !== p || !el.isConnected) return;
      if (!choice.apply(p)) return;
      p.modules.push(choice.name); p.pendingUpgrades--;
      Input.keys.clear(); Input.pressed.clear(); Audio.upgrade();
      showToast(p.droneLevel === 3 && choice.name === '僚机阵列' ? '进化完成 · 导弹蜂群上线' : '已安装 · ' + choice.name, true);
      showUpgradePanel(); AchievementSystem.checkAchievements();
    };
    $('upgradeCards').appendChild(el);
  });
  $('upgradePanel').classList.remove('hidden'); syncShell();
  $('upgradeCards').querySelector('button')?.focus({ preventScroll: true });
}


// ============ Toast ============
let toastTimer = 0;
function showToast(msg, gold = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (gold ? ' gold' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2200);
}

// ============ HUD 更新 ============
function updateHUD() {
  const p1 = players[0];
  if (!p1) return;
  document.getElementById('hpBar1').style.width = (p1.hp / p1.maxHp * 100) + '%';
  document.getElementById('shieldBar1').style.width = (p1.shield / p1.maxShield * 100) + '%';
  document.getElementById('bombCount1').textContent = p1.bombs;
  for (let i = 0; i < 3; i++) {
    const cd = document.getElementById('cd' + (i+1) + 'p1');
    const slot = document.getElementById('skill' + (i+1) + 'p1');
    if (p1.skillCD[i] > 0) {
      cd.style.display = 'flex';
      cd.textContent = Math.ceil(p1.skillCD[i]);
      slot.classList.remove('ready');
    } else {
      cd.style.display = 'none';
      slot.classList.add('ready');
    }
  }
  // P2
  if (players.length > 1) {
    const p2 = players[1];
    document.getElementById('hpBar2').style.width = (p2.hp / p2.maxHp * 100) + '%';
    document.getElementById('shieldBar2').style.width = (p2.shield / p2.maxShield * 100) + '%';
    document.getElementById('bombCount2').textContent = p2.bombs;
    for (let i = 0; i < 3; i++) {
      const cd = document.getElementById('cd' + (i+1) + 'p2');
      const slot = document.getElementById('skill' + (i+1) + 'p2');
      if (p2.skillCD[i] > 0) {
        cd.style.display = 'flex';
        cd.textContent = Math.ceil(p2.skillCD[i]);
        slot.classList.remove('ready');
      } else {
        cd.style.display = 'none';
        slot.classList.add('ready');
      }
    }
  }
  // 分数
  if (Game.mode === 'pk') {
    document.getElementById('scoreVal').textContent = '';
    document.getElementById('p1ScoreVal').textContent = p1.score || 0;
    document.getElementById('p2ScoreVal').textContent = players[1] ? (players[1].score || 0) : 0;
    document.getElementById('pkTimerVal').textContent = Math.ceil(Game.pkTimer);
  } else {
    document.getElementById('scoreVal').textContent = Game.score;
  }
  document.getElementById('hiScore').textContent = formatNumber(Storage.load().highScore);
  $('expFill').style.width = (p1.exp / p1.expToNext * 100) + '%';
  $('levelVal').textContent = 'LV.' + p1.level;
  $('weaponLabel').textContent = WEAPON_NAMES[p1.currentWeapon] + ' / Lv.' + p1.weaponLevel;
  $('comboVal').textContent = p1.combo + ' 连击';
  $('comboFill').style.width = (p1.comboTime / 4 * 100) + '%';
  $('grazeVal').textContent = p1.grazes;
  $('missionTime').textContent = formatTime(Game.elapsed);
  const sector = SECTORS[Game.sector];
  $('sectorLabel').textContent = Game.mode === 'endless' ? '深空 / BOSS ' + boss.stage : Game.mode === 'pk' ? '90 秒竞分 · 同场射击' : '0' + (Game.sector + 1) + ' / ' + sector.name;
  const duration = Game.mode === 'endless' ? 30 : sector.duration;
  $('missionProgress').style.width = (boss.active || bossCG.active ? 100 : Math.min(100, wave.sectorElapsed / duration * 100)) + '%';
  $('missionObjective').textContent = boss.active ? '击破旗舰 · 阶段 ' + (boss.phase + 1) + '/3' : bossCG.active ? '旗舰即将接敌' : Game.mode === 'pk' ? '击落敌机得分，得分相同则平局' : '距旗舰接敌 ' + Math.max(0, Math.ceil(duration - wave.sectorElapsed)) + 's';
  $('hpValue').textContent = Math.ceil(p1.hp) + ' / ' + p1.maxHp;
  // Boss 血条
  if (boss.active) {
    document.getElementById('bossBar').style.width = (boss.hp / boss.maxHp * 100) + '%';
  }
}

// ============ 存储系统 ============
const Storage = {
  KEY: 'neon_strike_save', cache: null,
  load() {
    if (this.cache) return { ...this.cache };
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (_) {}
    if (typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    this.cache = { ...raw };
    for (const key of ['highScore', 'totalKills', 'endlessMaxStage', 'runs', 'credits']) {
      this.cache[key] = Number.isFinite(raw[key]) && raw[key] >= 0 ? raw[key] : 0;
    }
    if (!Array.isArray(this.cache.unlockedShips)) this.cache.unlockedShips = [];
    return { ...this.cache };
  },
  save(data) {
    this.cache = { ...data };
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (_) {}
  },
};


// ============ 成就系统 ============
const ACHIEVEMENTS = [
  { id: 'firstKill', name: '首杀', desc: '击败第一架敌机', icon: '🎯', cat: '得分' },
  { id: 'kills100', name: '百分杀手', desc: '单局击杀 100 架敌机', icon: '💯', cat: '得分' },
  { id: 'score1000', name: '千分得主', desc: '单局得分达到 1000', icon: '🏆', cat: '得分' },
  { id: 'score10000', name: '万分大师', desc: '单局得分达到 10000', icon: '👑', cat: '得分' },
  { id: 'noDamageBoss', name: '无伤通关', desc: '无伤击败 Boss', icon: '🛡️', cat: '战斗' },
  { id: 'combo10', name: '连杀达人', desc: '30 秒内击杀 10 架敌机', icon: '⚡', cat: '战斗' },
  { id: 'hits500', name: '神枪手', desc: '累计命中 500 次', icon: '🔫', cat: '战斗' },
  { id: 'weaponMaster', name: '武器大师', desc: '解锁全部 4 种武器', icon: '⚔️', cat: '探索' },
  { id: 'weaponMax', name: '满级战神', desc: '武器达到 5 级', icon: '⭐', cat: '探索' },
  { id: 'skillMaster', name: '技能大师', desc: '一局内使用全部 3 个技能', icon: '✨', cat: '探索' },
  { id: 'bombExpert', name: '炸弹专家', desc: '使用 5 次炸弹', icon: '💣', cat: '特殊' },
  { id: 'bossKiller', name: 'Boss杀手', desc: '击败 Boss', icon: '🎖️', cat: '特殊' },
  { id: 'coopPlayer', name: '双人合作', desc: '完成一局双人合作', icon: '🤝', cat: '特殊' },
  { id: 'pkKing', name: 'PK王者', desc: '赢得一场 PK 对战', icon: '🏅', cat: '特殊' },
  { id: 'survivor', name: '幸存者', desc: '存活 60 秒', icon: '⏰', cat: '特殊' },
  { id: 'endlessPlayer', name: '无尽挑战者', desc: '参与一局无尽模式', icon: '♾️', cat: '无尽' },
  { id: 'endlessStage3', name: '进化猎手', desc: '击败 3 阶段 BOSS', icon: '🌟', cat: '无尽' },
  { id: 'endlessStage5', name: '终结者', desc: '击败 5 阶段 BOSS', icon: '💥', cat: '无尽' },
  { id: 'endlessStage8', name: '宇宙之主', desc: '击败 8 阶段 BOSS', icon: '🌌', cat: '无尽' },
];

const AchievementSystem = {
  KEY: 'neon_strike_achievements',
  unlocked: {},
  persistentStats: { totalHits: 0 },
  currentGameHits: 0,
  killTimes: [],

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.unlocked = data.unlocked || {};
        this.persistentStats = data.persistentStats || { totalHits: 0 };
      }
    } catch(e) { this.unlocked = {}; }
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        unlocked: this.unlocked,
        persistentStats: this.persistentStats,
      }));
    } catch(e) {}
  },

  reset() {
    this.currentGameHits = 0;
    this.killTimes = [];
  },

  unlock(id) {
    if (this.unlocked[id]) return false;
    this.unlocked[id] = { date: new Date().toLocaleString('zh-CN') };
    this.save();
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) {
      showToast('🏆 成就解锁: ' + a.name, true);
      // 金色粒子爆发
      spawnGoldBurst(CFG.W / 2, 100, 30);
      Audio.achievement();
    }
    return true;
  },

  has(id) { return !!this.unlocked[id]; },

  recordHit() {
    this.currentGameHits++;
    const total = (this.persistentStats.totalHits || 0) + this.currentGameHits;
    if (total >= 500) this.unlock('hits500');
  },

  recordKill() {
    const t = Game.elapsed;
    this.killTimes.push(t);
    this.killTimes = this.killTimes.filter(x => t - x < 30);
    if (this.killTimes.length >= 10) this.unlock('combo10');
  },

  checkAchievements() {
    const alive = getAlivePlayers();
    const totalKills = players.reduce((s, p) => s + p.kills, 0);
    const totalScore = Game.mode === 'pk'
      ? Math.max(...players.map(p => p.score || 0))
      : Game.score;

    if (totalKills >= 1) this.unlock('firstKill');
    if (totalKills >= 100) this.unlock('kills100');
    if (totalScore >= 1000) this.unlock('score1000');
    if (totalScore >= 10000) this.unlock('score10000');

    for (const p of alive) {
      if (p.ownedWeapons.size >= 4) this.unlock('weaponMaster');
      if (p.weaponLevel >= 5) this.unlock('weaponMax');
      if (p.skillsUsedThisGame.every(v => v)) this.unlock('skillMaster');
      if (p.bombsUsed >= 5) this.unlock('bombExpert');
    }

    if (this.killTimes.length >= 10) this.unlock('combo10');
    if (Game.elapsed >= 60) this.unlock('survivor');
  },

  renderGallery() {
    const grid = document.getElementById('medalGrid');
    grid.innerHTML = '';
    let earned = 0;
    for (const a of ACHIEVEMENTS) {
      const isEarned = this.has(a.id);
      if (isEarned) earned++;
      const el = document.createElement('div');
      el.className = 'medal' + (isEarned ? ' earned' : '');
      const dateStr = isEarned ? this.unlocked[a.id].date : '';
      el.innerHTML = `
        <div class="medal-icon">${a.icon}</div>
        <div class="medal-name">${a.name}</div>
        <div class="medal-desc">${a.desc}</div>
        <div class="medal-cat">${a.cat}</div>
        ${isEarned ? `<div class="medal-date">${dateStr}</div>` : '<div class="medal-date" style="color:#64748b">未解锁</div>'}
      `;
      grid.appendChild(el);
    }
    document.getElementById('medalCount').textContent = `已获得 ${earned} / ${ACHIEVEMENTS.length}`;
  },
};

// ============ 游戏主控 ============
const Game = {
  runId: 0, elapsed: 0, sector: 0, cleared: 0, difficulty: 'normal', ship: 'interceptor',
  state: 'menu',
  mode: 'single',
  score: 0,
  shake: 0,
  flash: 0,
  damageFlash: 0,
  powerupFlashColor: '#fff',
  powerupFlashAlpha: 0,
  pendingUpgrades: 0,
  upgradeQueue: [],
  pkTimer: 0,
  timeScale: 1,
  lastTime: 0,
  accumulator: 0,

  start(mode, resume = false) {
    this.runId++; this.mode = mode;
    this.elapsed = 0; this.sector = 0; this.cleared = 0; this.lastTime = 0; this.accumulator = 0;
    this.difficulty = Preferences.value.difficulty; this.ship = Preferences.value.ship;
    const resumeCheckpoint = resume && mode === 'endless' ? Storage.load().endlessCheckpoint : null;
    if (resumeCheckpoint) {
      this.difficulty = resumeCheckpoint.difficulty || this.difficulty;
      this.ship = resumeCheckpoint.ship || this.ship;
    } else if (mode === 'endless' && !resume) {
      const freshSave = Storage.load(); delete freshSave.endlessCheckpoint; Storage.save(freshSave);
    }
    Input.keys.clear(); Input.pressed.clear(); floaters.length = 0;
    fitArena(true);
    Audio.init();
    const solo = mode === 'single' || mode === 'endless';
    // 创建玩家
    players.length = 0;
    players.push(configurePlayer(createPlayer('p1', CFG.W * (solo ? 0.5 : 0.35), CFG.H - 100)));
    if (!solo) {
      players.push(configurePlayer(createPlayer('p2', CFG.W * 0.65, CFG.H - 100)));
    }
    // 重置
    enemies.length = 0;
    bullets.length = 0;
    enemyBullets.length = 0;
    missiles.length = 0;
    powerups.length = 0;
    particles.length = 0;
    Object.assign(wave, { timer: 0, totalElapsed: 0, sectorElapsed: 0, formation: 0, spawnInterval: 1.2, phase: 'calm', bossTriggered: false, endlessIntermission: 0 });
    boss.active = false;
    bossCG.active = false;
    boss.stage = 1; // 无尽模式从 STAGE 1 开始
    if (resume && mode === 'endless') {
      const checkpoint = resumeCheckpoint;
      if (checkpoint && checkpoint.stage > 1) {
        boss.stage = checkpoint.stage;
        this.score = checkpoint.score || 0;
        this.elapsed = checkpoint.elapsed || 0;
        if (checkpoint.player) {
          const savedPlayer = checkpoint.player;
          Object.assign(players[0], savedPlayer);
          players[0].ownedWeapons = new Set(savedPlayer.ownedWeapons || [players[0].currentWeapon]);
          players[0].alive = true; players[0].invincible = 2;
        }
        wave.endlessIntermission = 0;
        wave.phase = 'tense';
        showToast(`存档已载入 · STAGE ${boss.stage}`, true);
      }
    }
    if (!resume || mode !== 'endless') this.score = 0;
    this.shake = 0; this.flash = 0;
    this.damageFlash = 0; this.powerupFlashAlpha = 0;
    this.pendingUpgrades = 0; this.upgradeQueue = [];
    this.timeScale = 1;
    this.pkTimer = 90;
    AchievementSystem.reset();
    this.state = 'playing';
    // UI
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('upgradePanel').classList.add('hidden');
    document.getElementById('medalGallery').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('bossBarWrap').classList.remove('active');
    // 无尽模式 HUD
    const endlessInfo = document.getElementById('endlessInfo');
    if (mode === 'endless') {
      endlessInfo.classList.add('active');
      document.getElementById('endlessStage').textContent = 'STAGE ' + boss.stage;
      document.getElementById('endlessNext').textContent = '';
    } else {
      endlessInfo.classList.remove('active');
    }
    // 双人 HUD
    const isTwoPlayer = mode !== 'single' && mode !== 'endless';
    document.getElementById('p2Panel').style.display = isTwoPlayer ? 'block' : 'none';
    document.getElementById('p2Bottom').style.display = isTwoPlayer ? 'block' : 'none';
    document.getElementById('pkScores').style.display = (mode === 'pk') ? 'block' : 'none';
    document.getElementById('pkTimerDisplay').style.display = (mode === 'pk') ? 'block' : 'none';
    Audio.resume();
    BGM.start('calm');
    const toastMsg = mode === 'single' ? '单人模式 · 任务开始'
      : mode === 'coop' ? '双人合作 · 任务开始'
      : mode === 'pk' ? '双人对战 · 开始！'
      : '无尽模式 · BOSS 持续进化 · 任务开始';
    showToast(toastMsg); syncShell(); updateHUD();
  },

  resumeEndless() { this.start('endless', true); },

  togglePause() {
    pointer.id = null; Input.keys.clear(); Input.pressed.clear();
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pauseMenu').classList.remove('hidden');
      BGM.stop();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pauseMenu').classList.add('hidden');
      BGM.start(wave.phase);
    }
    syncShell();
  },

  gameOver(win) {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    BGM.stop();
    const save = Storage.load();
    if (this.score > save.highScore) save.highScore = this.score;
    const totalKills = players.reduce((s, p) => s + p.kills, 0);
    save.totalKills += totalKills;
    // 无尽模式：保存最高击败 BOSS 阶段
    if (this.mode === 'endless') {
      // boss.stage 表示「下一个/当前」阶段；玩家击败了 boss.stage - 1 个 BOSS
      const defeated = Math.max(0, boss.stage - 1);
      if (defeated > (save.endlessMaxStage || 0)) {
        save.endlessMaxStage = defeated;
      }
    }
    Storage.save(save);
    // 成就
    AchievementSystem.persistentStats.totalHits += AchievementSystem.currentGameHits;
    if (this.mode === 'coop') AchievementSystem.unlock('coopPlayer');
    if (this.mode === 'endless') AchievementSystem.unlock('endlessPlayer');
    AchievementSystem.save();
    // 结算界面
    const screen = document.getElementById('gameOverScreen');
    screen.classList.remove('hidden', 'win', 'lose');
    screen.classList.add(win ? 'win' : 'lose');
    document.getElementById('resultTitle').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    const statsEl = document.getElementById('resultStats');
    const maxLevel = Math.max(...players.map(p => p.level));
    if (this.mode === 'endless') {
      statsEl.innerHTML = `
        <div>得分 <span class="v">${this.score}</span></div>
        <div>击败 BOSS 数 <span class="v">${Math.max(0, boss.stage - 1)}</span></div>
        <div>历史最高击败 <span class="v">${save.endlessMaxStage || 0} 阶</span></div>
        <div>击杀数 <span class="v">${totalKills}</span></div>
        <div>等级 <span class="v">${maxLevel}</span></div>
      `;
    } else {
      statsEl.innerHTML = `
        <div>得分 <span class="v">${this.score}</span></div>
        <div>最高分 <span class="v">${save.highScore}</span></div>
        <div>击杀数 <span class="v">${totalKills}</span></div>
        <div>等级 <span class="v">${maxLevel}</span></div>
      `;
    }
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('bossBarWrap').classList.remove('active');
    document.getElementById('endlessInfo').classList.remove('active');
    recordRun(win);
  },

  gameOverPk(winnerIdx) {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    BGM.stop();
    const p1Score = players[0].score || 0;
    const p2Score = players[1] ? (players[1].score || 0) : 0;
    const save = Storage.load();
    const maxScore = Math.max(p1Score, p2Score);
    if (maxScore > save.highScore) save.highScore = maxScore;
    const totalKills = players.reduce((s, p) => s + p.kills, 0);
    save.totalKills += totalKills;
    Storage.save(save);
    AchievementSystem.persistentStats.totalHits += AchievementSystem.currentGameHits;
    if (winnerIdx >= 0) AchievementSystem.unlock('pkKing');
    AchievementSystem.save();
    const screen = document.getElementById('gameOverScreen');
    screen.classList.remove('hidden', 'win', 'lose');
    screen.classList.add(winnerIdx >= 0 ? 'win' : 'lose');
    const winnerName = winnerIdx === 0 ? 'P1 胜利' : winnerIdx === 1 ? 'P2 胜利' : '平局';
    document.getElementById('resultTitle').textContent = winnerName;
    const statsEl = document.getElementById('resultStats');
    statsEl.innerHTML = `
      <div>P1 得分 <span class="v" style="color:#00f0ff">${p1Score}</span></div>
      <div>P2 得分 <span class="v" style="color:#ff44ff">${p2Score}</span></div>
      <div>最高分 <span class="v">${save.highScore}</span></div>
      <div>总击杀 <span class="v">${totalKills}</span></div>
    `;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('bossBarWrap').classList.remove('active');
    recordRun(winnerIdx >= 0);
  },

  victory() { this.gameOver(true); },

  update(dt) {
    if (this.state === 'upgrading') {
      for (let i = 0; i < 3; i++) if (Input.justPressed('Digit' + (i + 1), 'Numpad' + (i + 1))) {
        $('upgradeCards').children[i]?.click(); break;
      }
      return;
    }
    // BGM 切换
    if (Input.justPressed('KeyM') && this.state !== 'menu' && this.state !== 'gameover') {
      const enabled = BGM.toggle(); Preferences.value.music = enabled; Preferences.save();
      showToast(enabled ? 'BGM 开启' : 'BGM 关闭');
    }
    if (this.state !== 'playing') {
      if (this.state === 'paused' && Input.justPressed('Escape','KeyP')) this.togglePause();
      return;
    }
    if (Input.justPressed('Escape', 'KeyP')) { this.togglePause(); return; }
    this.elapsed += dt;
    // 慢动作恢复
    const scaledDt = dt * this.timeScale;
    if (this.timeScale < 1) {
      this.timeScale = Math.min(1, this.timeScale + dt * 0.5);
    }
    // Boss CG 优先
    if (bossCG.active) {
      updateBossCG(scaledDt);
      updateStars(scaledDt);
      updateParticles(scaledDt);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
      if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2);
      if (this.powerupFlashAlpha > 0) this.powerupFlashAlpha = Math.max(0, this.powerupFlashAlpha - dt * 2);
      if (Input.justPressed('Escape','KeyP')) this.togglePause();
      return;
    }
    updateExtraEffects(scaledDt);
    updateWave(scaledDt);
    if (bossCG.active) return;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive) continue;
      const scheme = i === 0 ? 'p1' : 'p2';
      const controls = Input.getControls(scheme);
      if (i === 0 && players.length === 1) {
        controls.up ||= Input.down('ArrowUp'); controls.down ||= Input.down('ArrowDown');
        controls.left ||= Input.down('ArrowLeft'); controls.right ||= Input.down('ArrowRight');
      }
      if (Preferences.value.autoFire || pointer.id !== null) controls.shoot = true;
      updatePlayer(p, scaledDt, controls);
    }
    updateEnemies(scaledDt);
    if (this.state !== 'playing') return;
    updateBullets(scaledDt);
    if (this.state !== 'playing') return;
    updateMissiles(scaledDt);
    updatePowerups(scaledDt);
    updateParticles(scaledDt);
    updateStars(scaledDt);
    updateBoss(scaledDt);
    if (this.state !== 'playing') return;
    // PK 计时
    if (this.mode === 'pk') {
      this.pkTimer -= scaledDt;
      if (this.pkTimer <= 0) {
        const winner = players[0].score === players[1].score ? -1 : players[0].score > players[1].score ? 0 : 1;
        this.gameOverPk(winner);
        return;
      }
    }
    // 衰减
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2);
    if (this.powerupFlashAlpha > 0) this.powerupFlashAlpha = Math.max(0, this.powerupFlashAlpha - dt * 2);
    // 升级触发
    if (this.upgradeQueue && this.upgradeQueue.length > 0 && this.state === 'playing') {
      showUpgradePanel();
    }
    // 暂停
    if (Input.justPressed('Escape','KeyP')) this.togglePause();
    // 成就检查
    AchievementSystem.checkAchievements();
  },
};

// ============ 主循环 ============
function loop(now) {
  if (!Game.lastTime) Game.lastTime = now;
  const frameTime = Math.min(now - Game.lastTime, 250);
  Game.lastTime = now;
  Game.accumulator += frameTime;
  while (Game.accumulator >= CFG.FIXED_DT) {
    Game.update(CFG.FIXED_DT / 1000);
    Input.clearPressed();
    Game.accumulator -= CFG.FIXED_DT;
  }
  render();
  if (Game.state === 'playing' || Game.state === 'paused' || Game.state === 'upgrading') {
    if (!Game.lastHUD || now - Game.lastHUD >= 80) { updateHUD(); Game.lastHUD = now; }
  }
  requestAnimationFrame(loop);
}

// ============ 初始化 ============
Input.init();
initStars();
AchievementSystem.load();
Assets.load(() => {
  showToast('资源加载完成');
});



document.getElementById('btnMedal').onclick = () => {
  AchievementSystem.renderGallery();
  document.getElementById('mainMenu').classList.add('hidden');
  document.getElementById('medalGallery').classList.remove('hidden');
};
document.getElementById('btnMedalBack').onclick = () => {
  document.getElementById('medalGallery').classList.add('hidden');
  document.getElementById('mainMenu').classList.remove('hidden');
};
document.getElementById('btnResume').onclick = () => Game.togglePause();
document.getElementById('btnQuit').onclick = () => {
  BGM.stop();
  Game.state = 'menu';
  document.getElementById('pauseMenu').classList.add('hidden');
  document.getElementById('mainMenu').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('endlessInfo').classList.remove('active');
};
document.getElementById('btnRetry').onclick = () => Game.start(Game.mode);
document.getElementById('btnMenu').onclick = () => {
  document.getElementById('gameOverScreen').classList.add('hidden');
  document.getElementById('mainMenu').classList.remove('hidden');
  Game.state = 'menu';
};

// 显示最高分
document.getElementById('hiScore').textContent = Storage.load().highScore;

initFlightDeck();
requestAnimationFrame(loop);
