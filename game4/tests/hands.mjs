import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://localhost:4173';
// 浏览器内建假摄像头，不访问用户真实摄像头。
for (const [name, options] of [['mobile', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
    if (process.env.TEST_DEVICE && process.env.TEST_DEVICE !== name) continue;
    // 每个场景使用独立浏览器，避免 Edge 关闭上一上下文后丢失假摄像头。
    const browser = await chromium.launch({
      channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true,
      args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
    try {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(base);
    await page.locator('#start-btn').click();
    await page.locator('#camera-btn').click();
    try {
      await page.waitForFunction(() => document.querySelector('#camera-btn').textContent === '关闭手势', null, { timeout: 45000 });
    } catch (error) {
      console.log(await page.locator('#gesture-status').innerText(), requests, errors);
      throw error;
    }
    await page.waitForFunction(() => document.querySelector('#gesture-status').textContent.includes('手势操作已暂停'), null, { timeout: 15000 });
    assert(await page.locator('#webcam-preview').isVisible());
    assert(requests.some(url => url.endsWith('.wasm')));
    assert(requests.some(url => url.includes(name === 'mobile' ? 'hand_landmark_lite' : 'hand_landmark_full')));
    assert(!requests.some(url => !url.startsWith(base)));
    await page.evaluate(() => { window.savedStream = document.querySelector('video').srcObject; });
    await page.locator('#camera-btn').click();
    assert(await page.evaluate(() => savedStream.getTracks().every(track => track.readyState === 'ended')));
    assert(await page.locator('#webcam-preview').isHidden());
    assert.deepEqual(errors, []);
    console.log(`PASS: ${name} local MediaPipe initialization, frame inference and camera cleanup.`);
    await context.close();
    } finally { await browser.close(); }
}
