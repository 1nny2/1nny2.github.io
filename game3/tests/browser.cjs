const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:8765';
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const instrumented = html.replace('    initThree();', `
    window.testGame = {
      start, backToMenu, endGame, resetGame,
      get tracker() { return tracker; },
      get state() { return { started, running, loading, hand: {...hand}, mouse: {...mouse}, sessionId, cameraStream: !!cameraStream, fruits: fruits.length }; },
      get backgroundFinite() { return scene.children.filter(o => o.isPoints).every(o => Array.from(o.geometry.attributes.position.array).every(Number.isFinite)); }
    };
    initThree();`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const results = [];
  async function setup(options = {}, init, patches = {}) {
    const context = await browser.newContext(options);
    // Edge's synthetic getUserMedia device ends immediately on this Windows
    // host. A live canvas stream exercises video playback and real inference
    // without depending on camera hardware or opening the user's camera.
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async constraints => {
        window.lastCameraConstraints = constraints;
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        const draw = () => {
          ctx.fillStyle = '#203040'; ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = '#406060'; ctx.fillRect((performance.now() / 10) % 600, 100, 40, 40);
        };
        draw();
        const stream = canvas.captureStream(30);
        const timer = setInterval(draw, 33);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        return stream;
      };
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if(url.origin !== new URL(baseURL).origin) return route.abort();
      if(url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: instrumented });
      if(patches[url.pathname]) return route.fulfill({ contentType: 'text/javascript', body: patches[url.pathname] });
      return route.continue();
    });
    if(init) await context.addInitScript(init);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('Page error:', e.message); });
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.testGame);
    return { page, context, errors };
  }
  try {
    const { page, context, errors } = await setup();
    assert(await page.evaluate(() => testGame.backgroundFinite), 'background vertices must be finite');
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(r => /vision_bundle|\.wasm|\.task/.test(r.name))), false, 'mouse boot must not load model');
    const mouseTime = await page.evaluate(() => {
      const t = performance.now(); document.getElementById('mouseBtn').click();
      return { ms: performance.now()-t, ...testGame.state, overlay: getComputedStyle(document.getElementById('overlay')).display };
    });
    assert(mouseTime.running && mouseTime.overlay === 'none');
    results.push({ test: 'Mouse starts without model or external network', ms: mouseTime.ms });
    await page.evaluate(() => testGame.backToMenu());
    const t = Date.now();
    await page.locator('#gestureBtn').click();
    await page.waitForFunction(() => testGame.state.running || document.getElementById('banner').textContent.length > 0, null, { timeout: 90000 });
    let state = await page.evaluate(() => ({ ...testGame.state, backend: testGame.tracker.backend, banner: document.getElementById('banner').textContent }));
    assert(state.running, state.banner);
    const modelMs = Date.now() - t;
    await page.waitForFunction(() => testGame.tracker.lastTimestamp > 0 && !testGame.tracker.busy, null, { timeout: 20000 });
    assert.equal(state.backend, 'worker', 'modern browsers should detect in worker');
    assert.deepEqual(errors, []);
    results.push({ test: 'Real MediaPipe loads and processes fake-camera frames in worker', modelMs, backend: state.backend });
    const modelCount = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /\.task/.test(r.name)).length);
    await page.evaluate(() => testGame.backToMenu());
    assert.equal(await page.evaluate(() => document.querySelector('#cam').srcObject), null);
    const warmStart = Date.now();
    await page.locator('#gestureBtn').click();
    await page.waitForFunction(() => testGame.state.running);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /\.task/.test(r.name)).length), modelCount);
    results.push({ test: 'Re-entry reuses initialized model', ms: Date.now() - warmStart });
    await page.evaluate(() => testGame.backToMenu());
    await context.close();

    const denied = await setup({}, () => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await denied.page.locator('#gestureBtn').click();
    await denied.page.waitForFunction(() => document.getElementById('banner').textContent.includes('相机权限被拒绝'));
    assert.equal(await denied.page.evaluate(() => testGame.state.cameraStream), false);
    await denied.page.locator('#mouseBtn').click();
    assert(await denied.page.evaluate(() => testGame.state.running));
    results.push({ test: 'Permission denial shows actionable message and mouse remains available' });
    await denied.context.close();

    const brokenModel = await setup({}, null, {
      '/vision-runtime.js': 'export async function createHandDetector() { throw new Error("MODEL_MISSING"); }',
    });
    await brokenModel.page.locator('#gestureBtn').click();
    await brokenModel.page.waitForFunction(() => document.getElementById('banner').textContent.includes('MODEL_MISSING'));
    assert.equal(await brokenModel.page.evaluate(() => testGame.state.cameraStream), false);
    assert.equal(await brokenModel.page.evaluate(() => document.getElementById('cam').srcObject), null);
    await brokenModel.page.locator('#mouseBtn').click();
    assert(await brokenModel.page.evaluate(() => testGame.state.running));
    assert.deepEqual(brokenModel.errors, []);
    results.push({ test: 'Model failure releases camera and allows immediate mouse fallback' });
    await brokenModel.context.close();

    const delayed = await setup({}, () => {
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...args) => new Promise((resolve, reject) => {
        setTimeout(() => get(...args).then(stream => { window.lateStream = stream; resolve(stream); }, reject), 1200);
      });
    });
    await delayed.page.locator('#gestureBtn').click();
    await delayed.page.locator('#cancelLoadBtn').click();
    await delayed.page.locator('#mouseBtn').click();
    await delayed.page.waitForFunction(() => window.lateStream && lateStream.getTracks().every(t => t.readyState === 'ended'));
    assert(await delayed.page.evaluate(() => testGame.state.running && !testGame.state.cameraStream && !testGame.state.hand.ready));
    results.push({ test: 'Cancel during permission request stops late camera stream without interrupting mouse mode' });
    await delayed.context.close();

    const mobile = await setup({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await mobile.page.locator('#mouseBtn').tap();
    await mobile.page.touchscreen.tap(150, 380);
    assert.equal(await mobile.page.evaluate(() => testGame.state.mouse.inside), false, 'touch release must stop cutting');
    await mobile.page.locator('#playMenuBtn').tap();
    await mobile.page.locator('#gestureBtn').tap();
    await mobile.page.waitForFunction(() => testGame.state.running, null, { timeout: 90000 });
    const mobileState = await mobile.page.evaluate(() => ({
      inline: document.querySelector('#cam').playsInline,
      muted: document.querySelector('#cam').muted,
      ratio: document.querySelector('#gl').width / innerWidth,
      overlayWidth: document.querySelector('#camOverlay').width,
      ready: testGame.state.hand.ready,
    }));
    assert(mobileState.inline && mobileState.muted && mobileState.ready && mobileState.overlayWidth > 0);
    assert(mobileState.ratio <= 1.26);
    await mobile.page.screenshot({ path: path.join(__dirname, 'mobile.png') });
    assert.deepEqual(mobile.errors, []);
    results.push({ test: 'Mobile emulation: camera startup, touch release, inline playback, low DPR', ...mobileState });
    await mobile.context.close();

    const cpuRuntime = fs.readFileSync(path.join(__dirname, '../vision-runtime.js'), 'utf8')
      .replace('  try {', '  try { throw new Error("Test GPU unavailable");');
    const fallback = await setup({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, () => {
      Object.defineProperty(window, 'Worker', { value: undefined });
    }, { '/vision-runtime.js': cpuRuntime });
    await fallback.page.locator('#gestureBtn').tap();
    await fallback.page.waitForFunction(() => testGame.state.running, null, { timeout: 90000 });
    await fallback.page.waitForFunction(() => testGame.tracker.lastTimestamp > 0 && !testGame.tracker.busy);
    assert.equal(await fallback.page.evaluate(() => testGame.tracker.backend), 'main');
    assert(await fallback.page.evaluate(() => testGame.tracker.interval >= 100));
    assert.deepEqual(fallback.errors, []);
    results.push({ test: 'No Worker + failed GPU: real CPU model detects in rate-limited compatibility mode' });
    await fallback.context.close();

    const slowWorker = fs.readFileSync(path.join(__dirname, '../hand-worker.js'), 'utf8')
      .replace('      const result = detector.detectForVideo', '      const until = performance.now() + 80; while(performance.now() < until) {}\n      const result = detector.detectForVideo');
    const slow = await setup({}, null, { '/hand-worker.js': slowWorker });
    await slow.page.locator('#gestureBtn').click();
    await slow.page.waitForFunction(() => testGame.state.running, null, { timeout: 90000 });
    const smooth = await slow.page.evaluate(() => new Promise(resolve => {
      const start = performance.now(); let frames = 0; let inferenceFrames = 0;
      const onResult = testGame.tracker.onResult;
      testGame.tracker.onResult = (...args) => { inferenceFrames++; onResult(...args); };
      const frame = () => {
        frames++;
        if(performance.now() - start >= 1200) resolve({ frames, inferenceFrames });
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }));
    assert(smooth.frames >= 40, JSON.stringify(smooth));
    assert(smooth.inferenceFrames > 0 && smooth.inferenceFrames < 16, JSON.stringify(smooth));
    assert.deepEqual(slow.errors, []);
    results.push({ test: '80 ms slow inference does not block animation or accumulate frames', ...smooth });
    await slow.context.close();

    const insecureContext = await browser.newContext();
    await insecureContext.route('http://fruitwarp.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const filename = path.join(__dirname, '..', pathname === '/' ? 'index.html' : pathname.slice(1));
      return route.fulfill({ contentType: pathname === '/' ? 'text/html' : 'text/javascript', body: fs.readFileSync(filename) });
    });
    const insecurePage = await insecureContext.newPage();
    await insecurePage.goto('http://fruitwarp.test/');
    await insecurePage.waitForFunction(() => document.getElementById('note').textContent.includes('192.168'));
    assert.equal(await insecurePage.evaluate(() => window.isSecureContext), false);
    await insecurePage.locator('#gestureBtn').click();
    await insecurePage.waitForFunction(() => document.getElementById('banner').textContent.includes('HTTPS'));
    await insecurePage.locator('#mouseBtn').click();
    assert.equal(await insecurePage.locator('#overlay').evaluate(el => getComputedStyle(el).display), 'none');
    results.push({ test: 'Insecure mobile/LAN HTTP gives HTTPS guidance and keeps touch mode usable' });
    await insecureContext.close();
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
