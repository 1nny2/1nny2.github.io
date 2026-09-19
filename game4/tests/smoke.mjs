import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const results = [];
const errors = [];

async function verifyLayout(page, label) {
  const issues = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push('horizontal overflow');
    const selectors = ['#camera-btn', '#audio-ctrl', '#action-bar', '#ui-layer'];
    const visible = selectors.map(selector => [selector, document.querySelector(selector)]).filter(([, el]) => !el.hidden && (!el.closest('details') || el.closest('details').open));
    for (const [selector, el] of visible) {
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) issues.push(selector + ' outside viewport');
    }
    for (const el of document.querySelectorAll('#action-bar button, #camera-btn, #mute-btn')) {
      if (!el.closest('[hidden]') && (!el.closest('details') || el.closest('details').open) && el.getBoundingClientRect().height < 44) issues.push('small touch target');
    }
    if (!document.querySelector('#audio-ctrl').hidden && document.querySelector('#mute-btn').getBoundingClientRect().height > 48) issues.push('audio text wraps');
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i][1].getBoundingClientRect(), b = visible[j][1].getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) issues.push(`${visible[i][0]} overlaps ${visible[j][0]}`);
      }
    }
    return issues;
  });
  assert.deepEqual(issues, [], label);
}

try {
  for (const [label, options] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }],
    ['phone', { ...devices['iPhone 13'] }],
    ['small-phone', { ...devices['iPhone SE'] }],
    ['narrow-desktop', { viewport: { width: 840, height: 720 } }],
    ['tablet', { ...devices['iPad Mini'] }],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const requests = [];
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('request', request => requests.push(request.url()));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(base)) return route.abort();
      return route.continue();
    });
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#start-btn').disabled);
    assert.match(await page.locator('#loading-hint').innerText(), /已就绪/);
    assert(!requests.some(url => /hands|bloom-|https:\/\//.test(url)), 'initial load only needs local renderer');
    const timing = await page.evaluate(() => ({
      readyMs: Math.round(performance.getEntriesByName('nebula-ready')[0].startTime),
      resources: performance.getEntriesByType('resource').map(r => ({ name: new URL(r.name).pathname, bytes: r.transferSize })),
      canvas: { width: document.querySelector('#canvas-container canvas').width, height: document.querySelector('#canvas-container canvas').height },
    }));
    await page.locator('#start-btn').click();
    await page.locator('#effects-drawer').waitFor({ state: 'visible' });
    await verifyLayout(page, label);
    await page.screenshot({ path: `test-results/${label}.png` });
    await page.locator('#effects-drawer > summary').click();
    const firstTheme = await page.locator('#theme-tag').innerText();
    await page.locator('[data-action="theme"]').click();
    assert.notEqual(await page.locator('#theme-tag').innerText(), firstTheme);
    for (const action of ['comet', 'spark', 'ring', 'warp', 'collapse', 'supernova', 'reset']) {
      await page.locator(`[data-action="${action}"]`).click();
    }
    await page.locator('#effects-drawer > summary').click();
    const { width, height } = page.viewportSize();
    await page.mouse.move(width * 0.75, height * 0.45);
    await page.mouse.down();
    await page.mouse.move(width * 0.85, height * 0.5, { steps: 5 });
    await page.mouse.up();
    assert.match(await page.locator('#gesture-status').innerText(), /旋转/);
    if (options.hasTouch) {
      const cdp = await context.newCDPSession(page);
      const points = distance => [{ x: width * 0.85, y: height * 0.4 - distance, id: 1 }, { x: width * 0.85, y: height * 0.4 + distance, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(65) });
      assert.match(await page.locator('#gesture-status').innerText(), /缩放/);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => visualViewport.scale), 1, 'pinch should zoom scene, not page');
      await page.setViewportSize({ width: height, height: width });
      await verifyLayout(page, label + '-landscape');
      await page.screenshot({ path: `test-results/${label}-landscape.png` });
      assert(!requests.some(url => url.includes('bloom-')), 'mobile skips postprocessing');
    } else if (label === 'desktop') {
      await page.mouse.wheel(0, 100);
      await page.waitForFunction(() => document.querySelector('#gesture-status').textContent.includes('滚轮'));
      await page.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('bloom-')));
    }
    assert(!requests.some(url => url.includes('/hands/')), 'no model requests without explicit opt-in');
    // 拒绝权限后仍能操作；无需真实摄像头。
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
    });
    await page.locator('#camera-btn').click();
    await page.waitForFunction(() => document.querySelector('#gesture-status').textContent.includes('未获摄像头权限'));
    assert.equal(await page.locator('#camera-btn').getAttribute('aria-pressed'), 'false');
    assert(await page.locator('#webcam-preview').isHidden());
    results.push({ label, ...timing });
    await context.close();
  }

  // 用合成媒体流验证模型加载失败与取消时的资源释放。
  {
    const context = await browser.newContext(devices['iPhone 13']);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`camera: ${error.message}`));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        canvas.getContext('2d').fillRect(0, 0, 16, 16);
        window.testStream = canvas.captureStream(10);
        return window.testStream;
      };
    });
    await page.route('**/hands/hands.js', route => route.abort());
    await page.goto(base);
    await page.locator('#start-btn').click();
    await page.locator('#camera-btn').click();
    await page.waitForFunction(() => document.querySelector('#gesture-status').textContent.includes('手势组件加载失败'));
    assert(await page.evaluate(() => testStream.getTracks().every(track => track.readyState === 'ended')));
    await page.locator('#effects-drawer > summary').click();
    await page.locator('[data-action="comet"]').click();
    assert.match(await page.locator('#gesture-status').innerText(), /已触发/);
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolvePermission = resolve; });
    });
    await page.locator('#camera-btn').click();
    assert.equal(await page.locator('#camera-btn').innerText(), '取消手势加载');
    await page.locator('#camera-btn').click();
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      window.lateStream = canvas.captureStream();
      window.resolvePermission(window.lateStream);
    });
    await page.waitForFunction(() => lateStream.getTracks().every(track => track.readyState === 'ended'));
    assert(await page.locator('#webcam-preview').isHidden());
    await context.close();
  }

  // WebGL 初始化失败必须有可点击的重试入口。
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') || type === 'experimental-webgl' ? null : original.call(this, type, ...args);
    };
  });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#start-btn').textContent === '重新加载');
  assert.match(await page.locator('#loading-hint').innerText(), /启动失败/);
  await context.close();
  assert.deepEqual(errors, [], 'no uncaught runtime errors');
  await writeFile('test-results/metrics.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log('PASS: local startup, desktop/mobile controls, pinch, orientation, permission failure, WebGL fallback.');
} finally { await browser.close(); }
