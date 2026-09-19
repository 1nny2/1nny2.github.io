from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')
s = s.replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
s = s.replace('<title>NEON STRIKE · 霓虹突袭</title>', '<meta name="theme-color" content="#101418">\n<meta name="description" content="霓虹突袭：选定你的战机，组合局内改装，穿越三片航区。支持单人、双人合作、竞分与无尽模式。">\n<title>NEON STRIKE / 霓虹突袭 · 飞行机库</title>')
s = s.replace('<div id="wrap">', '<div id="wrap">\n<div id="arena">')
s = s.replace('<canvas id="game" width="960" height="720"></canvas>', '<canvas id="game" width="960" height="720" tabindex="0" aria-label="飞行战场，使用 WASD 或方向键移动，自动射击"></canvas>')
a, b = s.index('  <!-- 主菜单 -->'), s.index('  <!-- 暂停 -->')
s = s[:a] + '''  <!-- Flight deck: all artwork is local SVG/CSS. -->
  <main id="mainMenu" class="overlay hangar">
    <header class="deck-header">
      <a class="brand" href="./" aria-label="霓虹突袭机库"><span class="brand-mark">N<span>↗</span></span><span>NEON STRIKE<small>霓虹突袭 / FLIGHT OPERATIONS</small></span></a>
      <nav aria-label="机库工具"><span class="system-online"><i></i> 系统在线</span><button id="btnMedal" class="nav-button">勋章展馆 <span>↗</span></button><button id="btnHow" class="nav-button">飞行指南</button><button id="btnSettings" class="nav-button" aria-label="打开游戏设置">设置 ⚙</button></nav>
    </header>
    <div class="deck-content">
      <section class="deck-intro"><div><p class="eyebrow"><span class="tiny-square"></span> PILOT TERMINAL / 机库 01</p><h1>深空，等你出击<span>。</span></h1><p class="intro-desc">穿越弹幕，进化火力。让每一次出击，都有新的可能。</p></div><div class="pilot-status"><span class="pilot-avatar">P<span>01</span></span><span>欢迎归队，飞行员<small>ALL SYSTEMS READY</small></span></div></section>
      <div class="deck-grid">
        <section class="ship-panel">
          <div class="panel-heading"><span>01 / 选择战机</span><span class="tag">3 架可用</span></div>
          <div class="ship-display">
            <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="orbit-cross"></div>
            <span class="ship-coordinate">X: 024.81<br>Y: 009.63</span><span class="ship-caption">TACTICAL<br>INTERCEPTOR</span>
            <svg class="hero-ship" viewBox="0 0 400 420" role="img" aria-label="科幻战机三维风格示意">
              <defs><linearGradient id="armor" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d4e0db"/><stop offset=".45" stop-color="#687b77"/><stop offset="1" stop-color="#283834"/></linearGradient><linearGradient id="wing" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#657670"/><stop offset="1" stop-color="#1b2927"/></linearGradient><linearGradient id="cockpit" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d9ffac"/><stop offset="1" stop-color="#528065"/></linearGradient><linearGradient id="exhaust" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#dcffbb" stop-opacity=".9"/><stop offset="1" stop-color="#adf77b" stop-opacity="0"/></linearGradient></defs>
              <path d="M170 296 L182 398 L194 296 M208 296 L220 398 L232 296" fill="url(#exhaust)"/>
              <path d="M171 139 L125 190 L45 284 L61 303 L152 267 L173 306 L200 292 L227 306 L248 267 L339 303 L355 284 L275 190 L229 139Z" fill="url(#wing)" stroke="#82958b"/>
              <path d="M160 176 L137 218 L76 279 L144 251 L173 218 M240 176 L263 218 L324 279 L256 251 L227 218" fill="#99aaa0" opacity=".65"/>
              <path d="M139 194 L117 258 L126 304 L141 302 L158 226 M261 194 L283 258 L274 304 L259 302 L242 226" fill="#34443f" stroke="#7a8a81"/>
              <path d="M200 32 L225 117 L242 235 L224 315 L176 315 L158 235 L175 117Z" fill="url(#armor)" stroke="#bfcbc1" stroke-width="1.4"/>
              <path d="M200 32 L200 302 L176 315 L158 235 L175 117Z" fill="#a4b3aa" opacity=".16"/>
              <path d="M200 108 L215 160 L212 211 L188 211 L185 160Z" fill="#162b26" stroke="#b9cbba"/>
              <path d="M200 120 L208 158 L206 192 L194 192 L192 158Z" fill="url(#cockpit)"/>
              <path d="M162 236 L181 221 L181 281 L169 270 M238 236 L219 221 L219 281 L231 270" fill="#293e35"/>
              <path d="M185 249 L200 230 L215 249 L211 300 L189 300Z" fill="#61776b" stroke="#b4c3b6"/>
              <path d="M177 308 L192 308 M208 308 L223 308" stroke="#d8ffb8" stroke-width="6"/>
              <path d="M81 267 L133 246 M267 246 L319 267" stroke="currentColor" stroke-width="4"/>
              <path d="M200 51 L200 94 M170 243 L174 227 M230 243 L226 227" stroke="#e8f0e7" stroke-width="2"/>
              <path d="M117 229 L107 256 M283 229 L293 256" stroke="#091610" stroke-width="7"/>
            </svg>
            <span class="ship-ready"><i></i> FLIGHT READY</span>
          </div>
          <div class="ship-info"><p id="shipCode" class="eyebrow">FALCON / MK.01</p><div class="ship-name-row"><h2 id="shipName">游隼</h2><span id="shipRole" class="tag">均衡突击</span></div><p id="shipDesc">脉冲主炮 · 灵活走位 · 适合初次出击</p></div>
          <div class="ship-stats"><div><span>火力</span><div><i id="shipStat0"></i></div></div><div><span>防御</span><div><i id="shipStat1"></i></div></div><div><span>机动</span><div><i id="shipStat2"></i></div></div></div>
          <div class="ship-selector" aria-label="选择战机"><button data-ship="interceptor" aria-pressed="true"><span>⌁</span> 游隼 <small>01</small></button><button data-ship="bulwark" aria-pressed="false"><span>◇</span> 磐石 <small>02</small></button><button data-ship="spectre" aria-pressed="false"><span>⋈</span> 幽灵 <small>03</small></button></div>
        </section>
        <section class="mission-panel"><div class="panel-heading"><span>02 / 选择行动</span><span class="muted">MISSION SELECT</span></div>
          <div class="mode-list">
            <button class="mode-card" data-mode="single" aria-pressed="true"><span class="mode-art art-campaign"><span>↗</span></span><span class="mode-copy"><strong>远征行动 <em>推荐</em></strong><small>穿越 3 个航区，击破进化旗舰</small><span>单人 / 关卡推进 / 局内构筑</span></span><span class="radio-dot"></span></button>
            <button class="mode-card" data-mode="endless" aria-pressed="false"><span class="mode-art art-endless">∞</span><span class="mode-copy"><strong>无尽深空</strong><small>Boss 持续进化。你的极限在哪里？</small><span>单人 / 无限轮次 / 挑战纪录</span></span><span class="radio-dot"></span></button>
            <button class="mode-card" data-mode="coop" aria-pressed="false"><span class="mode-art art-coop">⌁⌁</span><span class="mode-copy"><strong>双人协作</strong><small>并肩突破，航区结束可救援队友</small><span>本地双人 / 共享战场 / 独立成长</span></span><span class="radio-dot"></span></button>
            <button class="mode-card" data-mode="pk" aria-pressed="false"><span class="mode-art art-pk">⤨</span><span class="mode-copy"><strong>竞速对决</strong><small>90 秒同场竞分，击落更多敌机</small><span>本地双人 / 友军伤害 / 高分获胜</span></span><span class="radio-dot"></span></button>
          </div>
          <div class="difficulty-row"><span>飞行难度</span><div class="segmented" aria-label="飞行难度"><button data-difficulty="easy" aria-pressed="false">休闲</button><button data-difficulty="normal" aria-pressed="true">标准</button><button data-difficulty="hard" aria-pressed="false">王牌 <small>×1.5</small></button></div></div>
          <div class="mission-note"><span>↳</span><p>每次升级，选择你的战斗方式。<small>僚机蜂群、电弧传导、引力捕获……组合属于你的火力。</small></p></div>
        </section>
        <aside class="intel-panel"><div class="panel-heading"><span>飞行档案</span><span class="muted">/ 03</span></div><div class="record-main"><span>生涯最高分</span><strong id="hangarRecord">0</strong><small>PERSONAL BEST</small></div><div class="record-pair"><div><strong id="hangarKills">0</strong><span>累计击落</span></div><div><strong id="hangarMedals">00</strong><span>已获勋章</span></div></div><div class="flight-tip"><span class="eyebrow">FLIGHT BRIEFING</span><div class="tip-orbit"><span>✧</span><i></i></div><h3>擦肩而过，也是反击。</h3><p>贴近弹幕安全掠过，获得额外分数、回复护盾并缩短技能冷却。</p><span class="tip-key">SHIFT <span>精细闪避</span></span></div><div class="local-save"><i></i> 进度自动保存于此浏览器</div></aside>
      </div>
      <section class="launch-bar"><div class="launch-summary"><span class="launch-icon">↗</span><div><strong id="launchMode">远征行动</strong><small id="launchDetail">游隼 / 标准 / 3 个航区</small></div></div><p id="launchHint">WASD / 方向键移动 · 自动开火 · 触屏拖动也能玩</p><button id="btnLaunch" class="launch-button">准备出击 <span>↗</span></button></section>
      <footer class="deck-footer"><span id="lastRun">首次飞行已就绪。你的故事，从这里开始。</span><span>NEON STRIKE <b>2.0</b> <i> / </i> BUILT FOR THE NEXT RUN</span></footer>
    </div>
  </main>
  <div id="combatTools" hidden><span id="weaponLabel">脉冲炮 / Lv.1</span><button id="btnCombatPause" aria-label="暂停游戏">Ⅱ <small>ESC</small></button></div>
  <div id="touchControls" hidden><button data-action="KeyJ">冲刺 <small>J</small></button><button data-action="KeyK">清屏 <small>K</small></button><button data-action="KeyL">过载 <small>L</small></button><button data-action="KeyX">炸弹 <small>X</small></button><button data-action="KeyQ">武器 <small>Q</small></button></div>

''' + s[b:]
s = s.replace('<div class="pause-title">PAUSED</div>', '<p class="eyebrow">FLIGHT ON HOLD</p><div class="pause-title">稍作休整</div><p class="pause-caption">深空可以等一会儿。</p>')
s = s.replace('<button class="btn secondary" id="btnQuit">', '<button class="btn secondary" id="btnPauseSettings">游戏设置</button>\n    <button class="btn secondary" id="btnQuit">')
s = s.replace('<div class="panel-title" id="upgradeTitle">LEVEL UP · 强化选择</div>', '<p class="eyebrow">SYSTEM UPGRADE / 战机改装</p><div class="panel-title" id="upgradeTitle">LEVEL UP · 强化选择</div><p id="upgradeSubtitle"></p>')
s = s.replace('<div class="upgrade-cards" id="upgradeCards"></div>', '<div class="upgrade-cards" id="upgradeCards"></div><p id="buildSummary"></p><button class="btn secondary" id="btnReroll">重掷选项 · 剩余 2 次</button>')
s = s.replace('<div class="player-tag p1-tag">P1 · 玩家一</div>', '<div class="player-tag p1-tag">P1 / HULL <span id="hpValue">100 / 100</span></div>')
s = s.replace('    <div class="hud-bot">', '''    <div class="mission-hud"><div><span id="sectorLabel">01 / 边境巡航</span><span id="missionTime">00:00</span></div><div class="thin-track"><i id="missionProgress"></i></div><small id="missionObjective">距旗舰接敌 45s</small></div>
    <div class="combo-hud"><strong id="comboVal">0 连击</strong><div class="thin-track"><i id="comboFill"></i></div><small>GRAZE / <span id="grazeVal">0</span></small></div>
    <div class="experience-hud"><span id="levelVal">LV.1</span><div class="thin-track"><i id="expFill"></i></div></div>
    <div class="hud-bot">''')
# Close arena before wrapper, keep settings/help outside any hidden menu.
s = s.replace('</div>\n\n<script src="systems.js">', '''</div>
</div>
<dialog id="settingsPanel" class="settings-dialog"><div class="dialog-heading"><div><p class="eyebrow">FLIGHT PREFERENCES</p><h2>飞行设置</h2></div><button id="btnSettingsClose" class="close-button" aria-label="关闭设置">×</button></div><p class="dialog-note">设置自动保存。战机与难度在下次出击生效。</p><label>自动开火 <input type="checkbox" data-pref="autoFire"></label><label>背景音乐 <input type="checkbox" data-pref="music"></label><label>战斗音效 <input type="checkbox" data-pref="sound"></label><label>震屏与强闪光 <input type="checkbox" data-pref="shake"></label><label>丰富粒子效果 <input type="checkbox" data-pref="effects"></label><label>经典头像彩蛋 <input type="checkbox" data-pref="classicSkin"></label></dialog>
<dialog id="helpPanel" class="settings-dialog help-dialog"><div class="dialog-heading"><div><p class="eyebrow">PILOT HANDBOOK</p><h2>飞行指南</h2></div><button id="btnHelpClose" class="close-button" aria-label="关闭指南">×</button></div><p>默认自动开火。机身中心的白点是弹幕判定核心。连续 4 秒内击落敌机可延续连击，每 8 连击增加 0.5 倍得分，最高 4 倍。</p><div class="help-controls"><strong>P1 / 玩家一</strong><p><kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 慢速<br><kbd>J</kbd> 冲刺 · <kbd>K</kbd> 清弹 · <kbd>L</kbd> 过载<br><kbd>X</kbd> 炸弹 · <kbd>Q</kbd> 切换武器<br><kbd>Space</kbd> 手动开火</p><strong>P2 / 玩家二</strong><p><kbd>↑↓←→</kbd> 移动 · <kbd>右 Shift</kbd> 慢速<br><kbd>1 / 2 / 3</kbd> 技能 · <kbd>0</kbd> 炸弹<br><kbd>.</kbd> 切换武器 · <kbd>Enter</kbd> 手动开火</p></div><p>单人也支持方向键、鼠标或触屏相对拖动。<kbd>Esc / P</kbd> 暂停，<kbd>M</kbd> 切换音乐。手机底部提供技能按钮。</p><p>远征共 3 个航区；每个 Boss 战有攻击预警。无尽模式不断提升 Boss 强度。双人协作在航区结算救援队友；竞速对决 90 秒内争取高分，存活到最后也可获胜。</p><p>不同模式与难度分别记录最佳成绩。存档保存在当前浏览器，清除站点数据会清除记录。</p></dialog>
<script src="systems.js">''')
p.write_text(s, encoding='utf-8')
