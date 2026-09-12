'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} }
};
let toastTimer;
function announce(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2300);
}
function closeDialog(dialog) { if (dialog.open) dialog.close(); }
function openDialog(dialog) {
  if (typeof dialog.showModal !== 'function') { announce('请使用新版浏览器查看弹窗，页面正文仍可正常浏览。'); return; }
  if (!dialog.open) dialog.showModal();
}
function initPreferences() {
  const root = document.documentElement;
  const theme = $('#themeToggle');
  const motion = $('#motionToggle');
  const setTheme = value => {
    root.dataset.theme = value;
    theme.textContent = value === 'dark' ? '☼' : '☾';
    theme.setAttribute('aria-label', value === 'dark' ? '切换浅色模式' : '切换深色模式');
  };
  setTheme(storage.get('nny-theme') || 'dark');
  theme.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    storage.set('nny-theme', next); setTheme(next);
  });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const setMotion = enabled => {
    root.classList.toggle('motion-off', !enabled);
    motion.setAttribute('aria-pressed', String(!enabled));
    motion.setAttribute('aria-label', enabled ? '减少页面动效' : '恢复页面动效');
    motion.textContent = enabled ? 'Ⅱ' : '▷';
  };
  setMotion(storage.get('nny-motion') === 'off' ? false : !reduced.matches);
  motion.addEventListener('click', () => {
    const enabled = root.classList.contains('motion-off');
    storage.set('nny-motion', enabled ? 'on' : 'off'); setMotion(enabled);
  });
  let inView = true;
  const pause = () => root.classList.toggle('scene-paused', document.hidden || !inView);
  document.addEventListener('visibilitychange', pause);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; pause(); });
    observer.observe($('#heroVisual'));
  }
}
function initIntro() {
  const dialog = $('#entryDialog');
  let timer;
  const finish = () => { clearTimeout(timer); closeDialog(dialog); };
  const show = () => { openDialog(dialog); timer = setTimeout(finish, 1100); };
  $('#skipIntro').addEventListener('click', finish);
  dialog.addEventListener('close', () => clearTimeout(timer));
  $('#replayIntro').addEventListener('click', show);
  let seen = false;
  try { seen = sessionStorage.getItem('nny-intro-v2') === '1'; sessionStorage.setItem('nny-intro-v2', '1'); } catch { seen = true; }
  if (!seen && !document.documentElement.classList.contains('motion-off')) show();
}
function initNavigation() {
  const links = $$('.nav-links a');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach(link => {
          if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
    $$('.section[id]').forEach(section => observer.observe(section));
  }
  const revealHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    if (target.matches('.project-card')) $('details', target).open = true;
    const parent = target.closest('details');
    if (parent) parent.open = true;
  };
  window.addEventListener('hashchange', revealHash);
  revealHash();
  $$('[data-open-project]').forEach(link => link.addEventListener('click', () => {
    const target = document.getElementById(link.dataset.openProject);
    if (target) $('details', target).open = true;
  }));
}
function initQuickView() {
  const dialog = $('#quickDialog');
  $$('[data-quick]').forEach(button => button.addEventListener('click', () => openDialog(dialog)));
  $$('.quick-projects a', dialog).forEach(link => link.addEventListener('click', () => closeDialog(dialog)));
}
function initCopy() {
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const text = button.dataset.copy;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('fallback');
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('textarea');
      input.value = text; input.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(input); input.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch {}
      input.remove(); button.focus({ preventScroll: true });
      if (!copied) { announce('请长按或选中联系方式复制'); return; }
    }
    announce('已复制到剪贴板');
  }));
}
function initImageFallbacks() {
  $$('img[data-fallback]').forEach(img => {
    let triedOriginal = false;
    const fail = () => {
      if (!triedOriginal) {
        triedOriginal = true;
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = img.dataset.fallback;
        return;
      }
      if (img.closest('.gallery-button')) {
        const text = document.createElement('span');
        text.className = 'image-error';
        text.textContent = '图片暂时无法加载 · 点击重试原图';
        img.replaceWith(text);
      } else {
        img.alt = '倪';
      }
    };
    img.addEventListener('error', fail);
    // A cached missing file can fail before this deferred script starts.
    if (img.complete && img.naturalWidth === 0) fail();
  });
}
function initLightbox() {
  const dialog = $('#imageDialog');
  const image = $('#lightboxImage');
  const caption = $('#imageCaption');
  let group = [], current = 0, requestId = 0;
  function show(index) {
    current = (index + group.length) % group.length;
    const button = group[current];
    const thumb = $('img', button);
    const token = ++requestId;
    const title = button.dataset.title;
    image.alt = title;
    if (thumb && thumb.complete && thumb.naturalWidth > 0) image.src = thumb.currentSrc || thumb.src;
    else image.removeAttribute('src');
    caption.textContent = `${current + 1} / ${group.length} · ${title} · 正在加载原图…`;
    dialog.setAttribute('aria-busy', 'true');
    const full = new Image();
    full.decoding = 'async'; full.fetchPriority = 'high';
    full.onload = () => {
      if (token !== requestId || !dialog.open) return;
      image.src = full.src;
      caption.textContent = `${current + 1} / ${group.length} · ${title}`;
      dialog.removeAttribute('aria-busy');
    };
    full.onerror = () => {
      if (token !== requestId || !dialog.open) return;
      caption.textContent = `${current + 1} / ${group.length} · ${title} · 原图暂时不可用`;
      dialog.removeAttribute('aria-busy');
    };
    full.src = button.dataset.full;
  }
  $$('[data-full]').forEach(button => button.addEventListener('click', () => {
    group = $$('[data-full]').filter(item => item.dataset.group === button.dataset.group);
    openDialog(dialog); show(group.indexOf(button));
  }));
  $('#imagePrev').addEventListener('click', () => show(current - 1));
  $('#imageNext').addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
  });
  dialog.addEventListener('close', () => { requestId++; image.removeAttribute('src'); dialog.removeAttribute('aria-busy'); });
}
function initPrinting() {
  let closed = [];
  const expand = () => {
    if (closed.length) return;
    closed = $$('details:not([open])');
    closed.forEach(item => { item.open = true; });
  };
  window.addEventListener('beforeprint', expand);
  window.addEventListener('afterprint', () => { closed.forEach(item => { item.open = false; }); closed = []; });
  $('#printBtn').addEventListener('click', async () => {
    closeDialog($('#quickDialog'));
    expand();
    // Printing is the one case where every archive image is needed immediately.
    const pending = $$('.gallery img').map(img => {
      img.loading = 'eager';
      return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    });
    await Promise.race([Promise.all(pending), new Promise(resolve => setTimeout(resolve, 2500))]);
    window.print();
  });
}
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
}));
for (const init of [initPreferences, initNavigation, initQuickView, initCopy, initImageFallbacks, initLightbox, initPrinting, initIntro]) {
  try { init(); } catch (error) { console.warn('页面交互初始化失败：', init.name, error.message); }
}
