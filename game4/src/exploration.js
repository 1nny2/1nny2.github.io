import { createRoutes } from './routes.js';
// Only complete, explicit commands invoke a small local allowlist; model prose never executes.
export function parseCommand(text) {
  const value = text.trim().replace(/[。！!，,？?\s]/g, '');
  const commands = { '扫描': 'scan', '扫描星云': 'scan', '下一站': 'next', '前往下一站': 'next', '靠近': 'near', '靠近一点': 'near', '远离': 'far', '远离一点': 'far', '复位': 'reset', '重置视角': 'reset', '发射流星': 'comet', '切换主题': 'theme' };
  return commands[value] || null;
}

export function createExploration({ getScene, act, travel, capture }) {
  const $ = id => document.getElementById(id);
  let history = [], pending = null, recognition = null, listening = false;
  const panel = $('guide-panel'), log = $('guide-log'), status = $('guide-status');
  let journey;
  function context() { return { ...getScene(), ...journey.context() }; }
  function message(role, text) {
    const el = document.createElement('p'); el.className = 'guide-message ' + role;
    el.textContent = (role === 'user' ? '你：' : '星航：') + text; log.append(el);
    while (log.children.length > 30) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight; return el;
  }
  function speak(text) {
    if (!$('guide-voice').checked || !window.speechSynthesis || document.hidden) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN';
    utterance.onerror = () => { status.textContent = '语音播报不可用，请阅读文字。'; };
    speechSynthesis.speak(utterance);
  }
  function command(name) {
    if (name === 'scan') return journey.scan();
    if (name === 'next') return journey.next();
    act(name);
    return '已执行：' + ({ near: '靠近', far: '远离', reset: '复位', comet: '发射流星', theme: '切换主题' }[name] || name);
  }
  let voiceTimer;
  function cancelListening() {
    const session = recognition; recognition = null; listening = false;
    clearTimeout(voiceTimer);
    $('guide-mic').textContent = '点击说话'; $('guide-mic').setAttribute('aria-pressed', 'false');
    try { session?.abort(); } catch { /* Browser may already have ended this session. */ }
  }
  function stop() { pending?.abort(); cancelListening(); window.speechSynthesis?.cancel(); }
  function closeGuide() { panel.hidden = true; $('guide-toggle').setAttribute('aria-expanded', 'false'); stop(); $('guide-toggle').focus(); }
  async function ask(text) {
    text = text.trim(); if (!text || pending) return;
    window.speechSynthesis?.cancel(); message('user', text);
    const action = parseCommand(text);
    if (action) { const answer = command(action); message('assistant', answer); speak(answer); return; }
    const controller = new AbortController(); pending = controller;
    $('guide-send').disabled = true; $('guide-stop').hidden = false;
    status.textContent = '正在连接向导…';
    const el = message('assistant', ''); let answer = '', completed = false;
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: history.slice(-8), scene: context() }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('连接失败，请稍后重试。');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        let pos;
        while ((pos = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, pos); buffer = buffer.slice(pos + 1); if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'mode') status.textContent = event.mode === 'local' ? '本地向导 · 未配置 AI 服务' : 'AI 向导 · 正在回答';
          if (event.type === 'delta') { answer += event.text; el.textContent = '星航：' + answer; log.scrollTop = log.scrollHeight; }
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'done') completed = true;
        }
        if (done) break;
      }
      if (!completed) throw new Error('回答连接中断，请重试。');
      history.push({ role: 'user', content: text }, { role: 'assistant', content: answer }); history = history.slice(-8);
      status.textContent += ' · 回答完成'; speak(answer);
    } catch (error) {
      const reason = error.name === 'AbortError' ? '回答已停止或超时。' : error.message;
      el.textContent = '星航：' + answer + (answer ? '\n' : '') + reason; status.textContent = reason;
    } finally { clearTimeout(timeout); pending = null; $('guide-send').disabled = false; $('guide-stop').hidden = true; }
  }
  $('guide-form').addEventListener('submit', event => { event.preventDefault(); const input = $('guide-input'); if (!pending && input.value.trim()) { const value = input.value; input.value = ''; ask(value); } });
  $('guide-stop').onclick = stop;
  $('scan-btn').onclick = () => { const text = command('scan'); message('assistant', text); speak(text); };
  $('next-btn').onclick = () => { stop(); const text = command('next'); message('assistant', text); speak(text); };
  $('guide-toggle').onclick = () => { panel.hidden = !panel.hidden; $('guide-toggle').setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) $('guide-input').focus(); else stop(); };
  $('guide-close').onclick = closeGuide;
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeGuide(); } });
  $('guide-voice').disabled = !window.speechSynthesis;
  $('guide-voice').onchange = () => { if (!$('guide-voice').checked) window.speechSynthesis?.cancel(); };
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  $('guide-mic').disabled = !Recognition || !window.isSecureContext;
  $('voice-hint').textContent = Recognition && window.isSecureContext ? '识别后自动发送；停止聆听返回游戏。语音使用浏览器在线服务，内置浏览器失败时请在 Edge / Chrome 打开此地址并允许麦克风。' : '当前浏览器不支持语音输入或需要 HTTPS / localhost；请在 Edge / Chrome 打开此地址，或使用文字。';
  if (Recognition && window.isSecureContext) {
    $('guide-mic').onclick = () => {
      if (listening) { status.textContent = '已停止聆听。'; closeGuide(); return; }
      if (pending) { status.textContent = '请先停止当前回答，再点击说话。'; return; }
      window.speechSynthesis?.cancel();
      let session;
      try { session = new Recognition(); } catch { status.textContent = '此浏览器无法启动语音服务，请在 Edge / Chrome 打开游戏。'; return; }
      recognition = session; listening = true;
      session.lang = 'zh-CN'; session.continuous = false; session.interimResults = true;
      $('guide-mic').textContent = '停止聆听'; $('guide-mic').setAttribute('aria-pressed', 'true');
      status.textContent = '正在启动麦克风，请允许语音权限…';
      const current = () => recognition === session;
      const timeout = (ms, text) => { clearTimeout(voiceTimer); voiceTimer = setTimeout(() => { if (current()) { cancelListening(); status.textContent = text; } }, ms); };
      timeout(12000, '语音服务未响应。请在 Edge / Chrome 中打开游戏并允许麦克风，或使用文字。');
      session.onstart = () => { if (!current()) return; status.textContent = '正在聆听，请说话…'; timeout(30000, '聆听超时，请再次点击说话。'); };
      session.onend = () => { if (!current()) return; cancelListening(); status.textContent = '聆听结束，未收到完整识别结果。可重试，或编辑输入框中的文字后发送。'; };
      session.onerror = event => {
        if (!current()) return;
        const errors = {
          'not-allowed': '麦克风权限被拒绝，请在浏览器网站权限中允许麦克风后重试。',
          'service-not-allowed': '当前浏览器未开放语音识别服务，请在 Edge / Chrome 打开游戏。',
          'network': '无法连接浏览器语音识别服务。请检查网络，或在 Edge / Chrome 打开游戏。',
          'audio-capture': '未检测到可用麦克风，请检查系统输入设备和麦克风权限。',
          'no-speech': '没有听到语音，请靠近麦克风并重试。',
          'language-not-supported': '当前语音服务不支持中文，请更换浏览器或使用文字。',
        };
        cancelListening(); status.textContent = errors[event.error] || '语音识别已中断，可重试或使用文字。';
      };
      session.onresult = event => {
        if (!current()) return;
        let draft = '', final = '';
        for (let i = event.resultIndex || 0; i < event.results.length; i++) {
          const result = event.results[i]; draft += result[0].transcript;
          if (result.isFinal) final += result[0].transcript;
        }
        $('guide-input').value = draft;
        if (final.trim()) { cancelListening(); $('guide-input').value = ''; status.textContent = '已识别：' + final; ask(final); }
        else status.textContent = '听到：' + draft;
      };
      try { session.start(); } catch { cancelListening(); status.textContent = '麦克风启动失败，请检查权限或在 Edge / Chrome 打开游戏。'; }
    };
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }); window.addEventListener('pagehide', stop);
  journey = createRoutes({ getScene, act, travel, capture, narrate: text => { message('assistant', text); speak(text); }, onChange: () => { stop(); history = []; } });
  message('assistant', '我是星航。你可以观测星海的自然规律，或追寻遗迹的失落回响。两条路线可随时切换，发现分别保存。');
  return { port: (kind,id) => journey.port(kind,id), inspect: id => journey.inspect(id), start() { $('mission-panel').hidden = $('guide-toggle').hidden = false; journey.start(); }, context };
}
