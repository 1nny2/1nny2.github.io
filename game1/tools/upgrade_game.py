from pathlib import Path
import re

p = Path('game.js')
s = p.read_text(encoding='utf-8')
def replace(old, new, count=None):
    global s
    assert old in s, old[:120]
    s = s.replace(old, new, -1 if count is None else count)
def section(start, end, text):
    global s
    a, b = s.index(start), s.index(end, s.index(start))
    s = s[:a] + text + '\n\n' + s[b:]

# No remote image-generation endpoints at runtime; offline geometry is the default.
s = re.sub(r"  urls: \{[\s\S]*?\n  \},", "  urls: { player: './player.png' },", s, count=1)
replace('MAX_PARTICLES: 1200', 'MAX_PARTICLES: 600')
replace("if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.code)) e.preventDefault();", "if (['playing','paused','upgrading'].includes(Game.state) && !document.querySelector('dialog[open]') && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.code)) e.preventDefault();")
replace('  init() {\n    try {\n      this.ctx', '  init() {\n    if (this.ctx) return;\n    try {\n      this.ctx')
replace('  enabled: true,', '  enabled: false,')
replace('if (particles.length >= CFG.MAX_PARTICLES) particles.shift();', 'if (particles.length >= (Preferences.value.effects ? CFG.MAX_PARTICLES : 120)) return;')
replace('    ctx.shadowBlur = 8; ctx.shadowColor = p.color;', '    ctx.shadowBlur = Preferences.value.effects ? 5 : 0; ctx.shadowColor = p.color;')
replace('    radius: 14,\n    hp:', '    radius: 14, hitRadius: 5,\n    hp:')
replace("  spawnBullet(x, y, vx, vy, dmg, color, radius, 'enemy');", "  const difficulty = DIFFICULTIES[Game.difficulty];\n  spawnBullet(x, y, vx * difficulty.speed, vy * difficulty.speed, dmg * difficulty.damage, color, radius, 'enemy');")
replace('life: 3, owner });', 'life: owner === \'enemy\' ? 7 : 3, owner, grazed: 0 });', 1)
replace('  base.maxHp = base.hp;', "  base.hp *= DIFFICULTIES[Game.difficulty].hp * (1 + Game.sector * 0.15);\n  base.maxHp = base.hp;")
replace('const hp = Math.round(1500 * Math.pow(1.55, stage - 1));', 'const hp = Math.round(1800 * Math.pow(1.45, Math.min(stage - 1, 24)) * DIFFICULTIES[Game.difficulty].hp * (Game.mode === \'coop\' ? 1.65 : 1));')
replace('const moveMult = 1 + (stage - 1) * 0.15;', 'const moveMult = 1 + Math.min(stage - 1, 12) * 0.12;')
replace('const bulletMult = 1 + (stage - 1) * 0.12;', 'const bulletMult = Math.min(2.1, 1 + (stage - 1) * 0.10);')
replace('const densityBonus = stage - 1;', 'const densityBonus = Math.min(12, stage - 1);')
replace('  bossCG.active = true;', "  enemyBullets.length = 0; bullets.length = 0; missiles.length = 0;\n  for (const p of players) p.invincible = Math.max(p.invincible, 2);\n  bossCG.active = true;", 1)
replace("  boss.state = 'fight';", "  boss.state = 'fight'; boss.telegraph = 1.2; boss.wallWarning = 0; boss.gapCenter = CFG.W / 2;", 1)
replace('      const anyDamage = players.some(p => p.alive && p.damageTakenThisBoss);', '      const anyDamage = players.some(p => p.damageTakenThisBoss);')
replace('        Game.victory();', '        advanceCampaign();', 1)
replace('    boss.patternSwitchTimer = 3;', '    boss.patternSwitchTimer = 3; boss.telegraph = 1; boss.wallWarning = 0;', 1)
replace('    boss.patternTimer = 0;\n  }\n\n  // 执行弹幕', '    boss.patternTimer = 0; boss.telegraph = 0.8; boss.wallWarning = 0;\n  }\n\n  if (boss.telegraph > 0) { boss.telegraph -= dt; return; }\n  // 执行弹幕')
replace("  } else if (idx === 2) {\n    const arms", "  } else if (idx === 2) {\n    if (b.patternTimer > 0) return;\n    const arms")
replace("  } else if (idx === 4) {\n", "  } else if (idx === 4) {\n    if (b.patternTimer > 0) return;\n")
section("  } else if (idx === 3) {", "  } else if (idx === 4) {", """  } else if (idx === 3) {
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
""")
replace("    boss.state = 'dying'; boss.deathTimer = 0; boss.deathStage = -1;", "    boss.state = 'dying'; boss.deathTimer = 0; boss.deathStage = -1;\n    boss.wallWarning = 0; enemyBullets.length = 0;\n    for (const p of players) p.invincible = Math.max(p.invincible, 4);")
replace('  const lvl = p.weaponLevel;', '  const lvl = 1 + (p.weaponLevel - 1) * 0.35;\n  const tier = p.weaponLevel;')
s = s.replace('if (lvl >=', 'if (tier >=')
replace('const pellets = 3 + lvl + p.scatterBonus;', 'const pellets = 3 + tier + p.scatterBonus;')
replace('  e.hp -= dmg;', '  if (e.hp <= 0) return;\n  if (killer) AchievementSystem.recordHit();\n  e.hp -= dmg;', 1)
replace("      if (Game.mode === 'pk') killer.score += e.score;\n      else Game.score += e.score;", '      recordCombo(killer, e);')
replace('      Game.score += e.score;', '      awardScore(null, e.score);')
section('      while (killer.exp >= killer.expToNext)', '    const idx = enemies.indexOf(e);', '      processLevels(killer);\n    }')
replace('    if (idx >= 0) enemies.splice(idx, 1);', "    if (idx >= 0) enemies.splice(idx, 1);\n    if (killer?.chainLevel && !e.chainHit) {\n      const targets = enemies.filter(other => dist2(other, e) < 125 ** 2).slice(0, 3);\n      for (const other of targets) { other.chainHit = true; damageEnemy(other, 18 * killer.chainLevel, killer); }\n    }")
# Snapshot iteration where damage can remove several enemies (including chain reactions).
replace('  for (let i = enemies.length - 1; i >= 0; i--) {\n    const e = enemies[i];', '  for (const e of [...enemies]) {\n    if (e.hp <= 0) continue;')
replace('      enemies.splice(i, 1); continue;', '      const index = enemies.indexOf(e); if (index >= 0) enemies.splice(index, 1); continue;')
replace('  const slow = controls.slow;', '  updateBuild(p, dt);\n  const slow = controls.slow; p.slow = slow;')
replace('    for (const e of enemies) damageEnemy(e, 30, p);', '    for (const e of [...enemies]) damageEnemy(e, 30, p);')
replace('    for (const e of enemies) damageEnemy(e, 80, p);', '    for (const e of [...enemies]) damageEnemy(e, 80, p);')
replace('      Game.score += 5;', '      awardScore(p, 5);')
replace('      Game.score += 10;', '      awardScore(p, 10);')
replace('    const dy = (controls.up?-1:0) + (controls.down?1:0);', '    let dy = (controls.up?-1:0) + (controls.down?1:0);\n    if (!dx && !dy) dy = -1;')
replace('  p.shieldRegen = 0;', '  p.damageTaken += dmg; p.combo = 0; p.comboTime = 0;\n  p.invincible = 0.65;\n  p.shieldRegen = 0;', 1)
replace('    p.hp -= dmg;', '    p.hp = Math.max(0, p.hp - dmg);')
replace('  }\n}\n\nfunction checkPlayerDeath()', "  }\n  if (p.hp <= 0 && p.alive) {\n    p.alive = false; explode(p.x, p.y, p.color, 35, 1.4); Audio.explosion(); checkPlayerDeath();\n  }\n}\n\nfunction checkPlayerDeath()", 1)
replace('  if (boss.state !== \'fight\') return;\n  boss.hp', "  if (boss.state !== 'fight' || boss.telegraph > 0) return;\n  if (killer) AchievementSystem.recordHit();\n  boss.hp")
# Bullet collision uses the core. Graze each bullet at most once per pilot.
replace('(p.radius + b.radius - 2) ** 2', '(p.hitRadius + b.radius) ** 2')
replace("      if (dist2(b, p) < (p.hitRadius + b.radius) ** 2) {\n        damagePlayer(p, b.dmg, 'enemy');", "      const distance = dist2(b, p);\n      const mask = p.id === 'p1' ? 1 : 2;\n      if (!(b.grazed & mask) && p.invincible <= 0 && distance > (p.hitRadius + b.radius) ** 2 && distance < (p.hitRadius + b.radius + 20) ** 2) {\n        b.grazed |= mask; p.grazes++; awardScore(p, 8);\n        p.shield = Math.min(p.maxShield, p.shield + 1);\n        for (let k = 0; k < 3; k++) p.skillCD[k] = Math.max(0, p.skillCD[k] - 0.12);\n        if (p.grazes % 5 === 0) floatingText(p.x, p.y - 26, 'GRAZE +' + p.grazes, '#a8a0ff');\n      }\n      if (distance < (p.hitRadius + b.radius) ** 2) {\n        damagePlayer(p, b.dmg, 'enemy');")
replace('    p.y += p.vy * dt; p.t += dt;', "    const target = getNearestPlayer(p.x, p.y);\n    if (target && dist2(p, target) < target.magnet ** 2) {\n      const dx = target.x - p.x, dy = target.y - p.y, length = Math.hypot(dx, dy) || 1;\n      const step = Math.min(length, 390 * dt);\n      p.x += dx / length * step; p.y += dy / length * step;\n    } else p.y += p.vy * dt;\n    p.t += dt;")
section('      while (p.exp >= p.expToNext)', '      break;\n    case \'weaponUp\':', '      processLevels(p);')
replace('  const defeatedStage = boss.stage;', "  const defeatedStage = boss.stage;\n  Game.cleared++; awardScore(null, 1000 * defeatedStage);\n  for (const p of players) if (p.alive) {\n    p.hp = Math.min(p.maxHp, p.hp + 25); p.shield = p.maxShield;\n    p.pendingUpgrades++; if (!Game.upgradeQueue.includes(p)) Game.upgradeQueue.push(p);\n  }")
section('function updateWave(dt) {', 'function onPhaseChange', """function updateWave(dt) {
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
""")
section('function spawnWave() {', '// ============ 渲染', """function spawnWave() {
  const pattern = wave.formation++ % 6;
  const strong = wave.phase === 'tense';
  if (pattern === 0 || pattern === 3) {
    const count = CFG.W < 600 ? 4 : 6;
    for (let i = 0; i < count; i++) {
      spawnEnemy('scout', CFG.W * (i + 1) / (count + 1), -28 - Math.abs(i - (count - 1) / 2) * 25);
    }
  } else if (pattern === 1 || pattern === 4) {
    const center = pattern === 1 ? CFG.W * 0.3 : CFG.W * 0.7;
    for (let i = 0; i < 3; i++) spawnEnemy(wave.phase === 'calm' ? 'scout' : 'fighter', center, -28 - i * 70);
  } else if (pattern === 2) {
    spawnEnemy(strong ? 'elite' : 'gunner', CFG.W / 2, -30);
    if (Game.sector > 0) { spawnEnemy('fighter', CFG.W * 0.2, -50); spawnEnemy('fighter', CFG.W * 0.8, -50); }
  } else {
    const count = strong ? 3 : 2;
    for (let i = 0; i < count; i++) spawnEnemy(strong ? 'kamikaze' : 'fighter', CFG.W * (i + 1) / (count + 1), -40 - i * 40);
  }
}
""")
replace('  if (Game.shake > 0.1) {', '  if (Preferences.value.shake && Game.shake > 0.1) {')
replace('  renderStars(ctx);', '  renderStars(ctx);', 1)
replace('  // 全屏白闪\n', '  renderTactical();\n\n  // 全屏白闪\n')
replace('if (Game.flash > 0.01)', 'if (Preferences.value.shake && Game.flash > 0.01)')
replace('if (Game.powerupFlashAlpha > 0.01)', 'if (Preferences.value.effects && Game.powerupFlashAlpha > 0.01)')
replace("  const img = Assets.get('player');", "  const img = Preferences.value.classicSkin ? Assets.get('player') : null;")
replace('    ctx.moveTo(0, -18);', '    ctx.moveTo(0, -27);')
replace('    ctx.lineTo(-16, 8);', '    ctx.lineTo(-23, 13);')
replace('    ctx.lineTo(16, 8);', '    ctx.lineTo(23, 13);')
replace("  { name: '散射增强', desc: '散射武器弹丸 +2', icon: '✦',", "  { name: '散射增强', desc: '散射武器弹丸 +2', icon: '✦', eligible: p => p.ownedWeapons.has(1) && p.scatterBonus < 6,")
replace("  { name: '火力全开',", "  { name: '僚机阵列', desc: '增加自动射击僚机火力，3 级进化为导弹蜂群', icon: '◈', eligible: p => p.droneLevel < 3, apply: p => { p.droneLevel++; return true; } },\n  { name: '电弧传导', desc: '击杀向附近最多 3 架敌机传导 18 点伤害，可叠 3 层', icon: 'ϟ', eligible: p => p.chainLevel < 3, apply: p => { p.chainLevel++; return true; } },\n  { name: '引力捕获', desc: '拾取半径 +70，护盾立即恢复 20', icon: '◎', eligible: p => p.magnet < 300, apply: p => { p.magnet += 70; p.shield = Math.min(p.maxShield, p.shield + 20); return true; } },\n  { name: '火力全开',")
section('function showUpgradePanel() {', '// ============ Toast', """function showUpgradePanel() {
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
""")
replace("  document.getElementById('hiScore').textContent = Storage.load().highScore;", "  document.getElementById('hiScore').textContent = formatNumber(Storage.load().highScore);\n  $('expFill').style.width = (p1.exp / p1.expToNext * 100) + '%';\n  $('levelVal').textContent = 'LV.' + p1.level;\n  $('weaponLabel').textContent = WEAPON_NAMES[p1.currentWeapon] + ' / Lv.' + p1.weaponLevel;\n  $('comboVal').textContent = p1.combo + ' 连击';\n  $('comboFill').style.width = (p1.comboTime / 4 * 100) + '%';\n  $('grazeVal').textContent = p1.grazes;\n  $('missionTime').textContent = formatTime(Game.elapsed);\n  const sector = SECTORS[Game.sector];\n  $('sectorLabel').textContent = Game.mode === 'endless' ? '深空 / BOSS ' + boss.stage : Game.mode === 'pk' ? '90 秒竞分 · 同场射击' : '0' + (Game.sector + 1) + ' / ' + sector.name;\n  const duration = Game.mode === 'endless' ? 30 : sector.duration;\n  $('missionProgress').style.width = (boss.active || bossCG.active ? 100 : Math.min(100, wave.sectorElapsed / duration * 100)) + '%';\n  $('missionObjective').textContent = boss.active ? '击破旗舰 · 阶段 ' + (boss.phase + 1) + '/3' : bossCG.active ? '旗舰即将接敌' : Game.mode === 'pk' ? '击落敌机得分，得分相同则平局' : '距旗舰接敌 ' + Math.max(0, Math.ceil(duration - wave.sectorElapsed)) + 's';\n  $('hpValue').textContent = Math.ceil(p1.hp) + ' / ' + p1.maxHp;", 1)
section('const Storage = {', '// ============ 成就系统', """const Storage = {
  KEY: 'neon_strike_save', cache: null,
  load() {
    if (this.cache) return { ...this.cache };
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (_) {}
    if (typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    this.cache = { ...raw };
    for (const key of ['highScore', 'totalKills', 'endlessMaxStage', 'runs']) {
      this.cache[key] = Number.isFinite(raw[key]) && raw[key] >= 0 ? raw[key] : 0;
    }
    return { ...this.cache };
  },
  save(data) {
    this.cache = { ...data };
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (_) {}
  },
};
""")
replace('const t = wave.totalElapsed;', 'const t = Game.elapsed;')
replace('if (wave.totalElapsed >= 60)', 'if (Game.elapsed >= 60)')
replace("const Game = {\n", "const Game = {\n  runId: 0, elapsed: 0, sector: 0, cleared: 0, difficulty: 'normal', ship: 'interceptor',\n")
replace('    this.mode = mode;', "    this.runId++; this.mode = mode;\n    this.elapsed = 0; this.sector = 0; this.cleared = 0; this.lastTime = 0; this.accumulator = 0;\n    this.difficulty = Preferences.value.difficulty; this.ship = Preferences.value.ship;\n    Input.keys.clear(); Input.pressed.clear(); floaters.length = 0;\n    fitArena(true);\n    Audio.init();\n    const solo = mode === 'single' || mode === 'endless';", 1)
replace("players.push(createPlayer('p1', CFG.W * 0.35, CFG.H - 100));", "players.push(configurePlayer(createPlayer('p1', CFG.W * (solo ? 0.5 : 0.35), CFG.H - 100)));")
replace("if (mode !== 'single')", "if (!solo)", 1)
replace("players.push(createPlayer('p2', CFG.W * 0.65, CFG.H - 100));", "players.push(configurePlayer(createPlayer('p2', CFG.W * 0.65, CFG.H - 100)));")
replace('timer: 0, totalElapsed: 0, spawnInterval: 1.2,', 'timer: 0, totalElapsed: 0, sectorElapsed: 0, formation: 0, spawnInterval: 1.2,')
replace('    showToast(toastMsg);', '    showToast(toastMsg); syncShell(); updateHUD();')
replace('  togglePause() {\n', '  togglePause() {\n    pointer.id = null; Input.keys.clear(); Input.pressed.clear();\n')
replace("      BGM.start(wave.phase);\n    }\n  },", "      BGM.start(wave.phase);\n    }\n    syncShell();\n  },", 1)
replace("    document.getElementById('endlessInfo').classList.remove('active');\n  },\n\n  gameOverPk", "    document.getElementById('endlessInfo').classList.remove('active');\n    recordRun(win);\n  },\n\n  gameOverPk")
replace("    document.getElementById('bossBarWrap').classList.remove('active');\n  },\n\n  victory()", "    document.getElementById('bossBarWrap').classList.remove('active');\n    recordRun(winnerIdx >= 0);\n  },\n\n  victory()")
section('  victory() {', '  update(dt) {', '  victory() { this.gameOver(true); },')
replace('  update(dt) {\n', "  update(dt) {\n    if (this.state === 'upgrading') {\n      for (let i = 0; i < 3; i++) if (Input.justPressed('Digit' + (i + 1), 'Numpad' + (i + 1))) {\n        $('upgradeCards').children[i]?.click(); break;\n      }\n      return;\n    }\n")
replace("      const enabled = BGM.toggle();", "      const enabled = BGM.toggle(); Preferences.value.music = enabled; Preferences.save();")
replace('    // 慢动作恢复\n', '    if (Input.justPressed(\'Escape\', \'KeyP\')) { this.togglePause(); return; }\n    this.elapsed += dt;\n    // 慢动作恢复\n')
replace('    updateWave(scaledDt);\n', '    updateExtraEffects(scaledDt);\n    updateWave(scaledDt);\n    if (bossCG.active) return;\n')
replace('      const controls = Input.getControls(scheme);\n      updatePlayer', "      const controls = Input.getControls(scheme);\n      if (i === 0 && players.length === 1) {\n        controls.up ||= Input.down('ArrowUp'); controls.down ||= Input.down('ArrowDown');\n        controls.left ||= Input.down('ArrowLeft'); controls.right ||= Input.down('ArrowRight');\n      }\n      if (Preferences.value.autoFire || pointer.id !== null) controls.shoot = true;\n      updatePlayer")
replace('    updateEnemies(scaledDt);\n    updateBullets', "    updateEnemies(scaledDt);\n    if (this.state !== 'playing') return;\n    updateBullets")
replace('    updateBullets(scaledDt);\n    updateMissiles', "    updateBullets(scaledDt);\n    if (this.state !== 'playing') return;\n    updateMissiles")
replace('    updateBoss(scaledDt);\n', "    updateBoss(scaledDt);\n    if (this.state !== 'playing') return;\n")
replace('const winner = players[0].score >= (players[1]?.score || 0) ? 0 : 1;', 'const winner = players[0].score === players[1].score ? -1 : players[0].score > players[1].score ? 0 : 1;')
replace('    updateHUD();\n  }\n  requestAnimationFrame', '    if (!Game.lastHUD || now - Game.lastHUD >= 80) { updateHUD(); Game.lastHUD = now; }\n  }\n  requestAnimationFrame')
replace('Audio.init();\ninitStars();', 'initStars();')
# Old button handlers are retained only for menus that still use those IDs; mode selection is now explicit.
s = re.sub(r"document.getElementById\('btn(?:Single|Coop|Pk|Endless)'\).onclick = [^\n]+\n", '', s)
section("document.getElementById('btnHow').onclick", "document.getElementById('btnMedal').onclick", '')
replace('requestAnimationFrame(loop);\n', 'requestAnimationFrame(loop);\n', 1)
pos = s.rfind('requestAnimationFrame(loop);')
s = s[:pos] + 'initFlightDeck();\n' + s[pos:]
p.write_text(s, encoding='utf-8')
