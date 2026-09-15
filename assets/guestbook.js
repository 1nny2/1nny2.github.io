(() => {
  'use strict';
  const section = document.getElementById('guestbook');
  if (!section) return;
  const status = document.getElementById('guestbookStatus');
  const retry = document.getElementById('guestbookRetry');
  const host = document.getElementById('guestbookHost');
  const badge = document.getElementById('guestbookBadge');
  const config = window.NNY_GUESTBOOK || {};
  let busy = false;
  let mounted = false;
  let timer;
  let clientPromise;

  function setStatus(message, canRetry = false) {
    status.textContent = message;
    retry.hidden = !canRetry;
  }

  function loadClient() {
    if (window.twikoo) return Promise.resolve();
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => fail(), 15000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        clientPromise = null;
        reject(new Error('client unavailable'));
      }
      script.src = 'assets/vendor/twikoo-1.7.22.min.js';
      script.async = true;
      script.onload = () => {
        clearTimeout(timeout);
        if (window.twikoo) resolve();
        else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
    return clientPromise;
  }

  function syncTheme() {
    host.classList.toggle('tk-dark', document.documentElement.dataset.theme === 'dark');
  }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

  async function start() {
    if (busy) return;
    if (mounted) {
      // Twikoo persists the draft locally; avoid mounting a second Vue instance.
      window.location.reload();
      return;
    }
    busy = true;
    section.setAttribute('aria-busy', 'true');
    setStatus('正在连接留言区，请稍候…');
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(config.envId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'GET_CONFIG', envId: config.envId }),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('service unavailable');
      const result = await response.json();
      if (!result.config || (result.code && result.code !== 0)) throw new Error('invalid response');
      clearTimeout(deadline);
      await loadClient();
      host.hidden = false;
      const mount = document.createElement('div');
      mount.id = 'twikoo';
      host.replaceChildren(mount);
      mounted = true;
      timer = setTimeout(() => {
        busy = false;
        section.removeAttribute('aria-busy');
        setStatus('留言加载较慢或连接中断。可刷新重试，也可以通过下方邮箱联系我。', true);
      }, 15000);
      await window.twikoo.init({
        envId: config.envId,
        el: '#twikoo',
        path: config.path || '/guestbook',
        lang: 'zh-CN',
        placeholder: '你希望这里有哪些改进？欢迎分享具体体验、内容建议，或者打个招呼。',
        onCommentLoaded() {
          clearTimeout(timer);
          busy = false;
          badge.textContent = '试运行 · 审核后公开';
          section.removeAttribute('aria-busy');
          setStatus('欢迎留言。提交后由我审核，通过后对其他读者展示。');
        }
      });
    } catch {
      clearTimeout(timer);
      busy = false;
      section.removeAttribute('aria-busy');
      setStatus('暂时无法连接留言区。请稍后重试，或通过下方邮箱把建议发给我。', true);
    } finally {
      clearTimeout(deadline);
    }
  }

  retry.addEventListener('click', start);
  if (!config.enabled || !config.envId) {
    setStatus('留言区正在准备中，暂未开放提交。欢迎先通过邮件把想法告诉我。');
    return;
  }
  try {
    const endpoint = new URL(config.envId);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error();
  } catch {
    setStatus('留言区暂不可用，欢迎先通过邮件联系我。');
    return;
  }
  badge.textContent = '试运行 · 审核后公开';
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    }, { rootMargin: '240px' });
    observer.observe(section);
  } else {
    start();
  }
})();
