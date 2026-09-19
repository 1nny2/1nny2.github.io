import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parseCommand } from '../src/exploration.js';
import { validate, guide } from '../scripts/guide.mjs';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

const base = process.env.TEST_URL || 'http://localhost:4173';
assert.equal(parseCommand('靠近！'), 'near');
assert.equal(parseCommand('不要靠近'), null);
assert.equal(parseCommand('为什么要扫描？'), null);
assert.throws(() => validate({ message: 'a', scene: { stage: 9 } }));
const body = { message: '我现在在哪里？', scene: { stage: 2, theme: '冰蓝深空', scanned: false, distance: 320, discoveries: [] } };
for (const path of ['/.env', '/scripts/guide.mjs', '/src/app.js', '/package.json', '/assets/%2eenv']) assert.notEqual((await fetch(base + path)).status, 200, path);
assert.equal((await fetch(base + '/api/guide', { method: 'POST', body: '{}' })).status, 400);
assert.equal((await fetch(base + '/api/guide', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: JSON.stringify(body) })).status, 403);
// Exercise production upstream parser with SSE events deliberately split across chunks.
const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-only-placeholder';
try {
  for (const failure of [false, true]) {
    globalThis.fetch = async (url, options) => {
      const data = JSON.parse(options.body); assert.equal(data.stream, true); assert.equal(data.store, false);
      assert.match(data.input.at(-1).content, /冰蓝深空/);
      const source = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '冰蓝星云' })}\n\ndata: ${JSON.stringify({ type: failure ? 'response.failed' : 'response.completed' })}\n\n`;
      return new Response(new ReadableStream({ start(c) { const bytes = new TextEncoder().encode(source); for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } }));
    };
    const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; req.headers = {};
    const res = new EventEmitter(); const events = []; res.writeHead = () => res; res.flushHeaders = () => {}; res.write = line => events.push(JSON.parse(line)); res.end = () => {};
    await guide(req, res);
    assert(events.some(e => e.text === '冰蓝星云'));
    assert(events.some(e => e.type === (failure ? 'error' : 'done')));
  }
} finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; }

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.SpeechRecognition = class { start() { this.onstart(); const result = [{ transcript: '靠近' }]; result.isFinal = true; this.onresult({ results: [result] }); this.onend(); } abort() { this.onend?.(); } stop() { this.onend?.(); } };
    });
    await page.goto(base); await page.locator('#start-btn').click();
    assert(await page.locator('#scan-btn').isDisabled());
    await page.locator('[data-route="ruins"]').click();
    await page.locator('#route-nodes [data-distance="near"]').click();
    for (const node of ['star', 'ring', 'core']) { await page.locator(`[data-node="${node}"]`).click(); await page.locator('#scan-btn').click(); }
    await page.locator('#guide-toggle').click();
    await page.locator('#guide-input').fill('我现在在哪里？'); await page.locator('#guide-send').click();
    await page.waitForFunction(() => document.querySelector('#guide-status').textContent.includes('回答完成'));
    assert.match(await page.locator('#guide-log').innerText(), /紫罗兰幻境/);
    await page.locator('#guide-mic').click(); assert.match(await page.locator('#guide-log').innerText(), /已执行：靠近/);
    await page.locator('#guide-close').click();
    await page.locator('#port-list').evaluate(el=>el.open=true);
    for (const [from,to] of [['star','ring'],['ring','core']]) { await page.locator(`[data-port="out:${from}"]`).click();await page.locator(`[data-port="in:${to}"]`).click();await page.locator('#ruin-test').click();await page.waitForFunction(()=>!document.querySelector('#wire-preview').textContent.includes('正在')); }
    await page.locator('#guide-toggle').click();
    assert.equal(await page.locator('#mission-progress').getAttribute('value'), '3');
    await page.locator('#guide-input').fill('再介绍一下'); await page.locator('#guide-send').click(); await page.locator('#guide-stop').click();
    await page.waitForFunction(() => !document.querySelector('#guide-send').disabled);
    assert.match(await page.locator('#guide-status').innerText(), /停止|超时/);
    const box = await page.locator('#guide-panel').boundingBox(); assert(box.x >= 0 && box.y >= 0 && box.y + box.height <= viewport.height);
    await page.screenshot({ path: `test-results/guide-${viewport.width}.png` });
    await page.locator('#guide-close').click(); await page.locator('#route-restart').click();
    assert.equal(await page.locator('#mission-progress').getAttribute('value'), '0');
    await page.route('**/api/guide', route => route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'error', message: 'AI 服务暂时不可用' }) + '\n' }));
    await page.locator('#guide-toggle').click(); await page.locator('#guide-input').fill('介绍星云'); await page.locator('#guide-send').click();
    await page.waitForFunction(() => document.querySelector('#guide-status').textContent.includes('暂时不可用'));
    assert(await page.locator('#guide-send').isEnabled());
    assert.deepEqual(errors, []); await page.close();
  }
} finally { await browser.close(); }
console.log('Exploration, scene context, streaming, cancellation, speech mock, command allowlist and server boundaries passed.');
