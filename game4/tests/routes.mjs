import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:4173';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
async function select(page,id){await page.locator('#route-picker').evaluate(el=>el.open=true);await page.locator(`[data-route="${id}"]`).click();}
async function connect(page,from,to){await page.locator('#wire-cancel').click();await page.locator('#port-list').evaluate(el=>el.open=true);await page.locator(`[data-port="out:${from}"]`).click();await page.locator(`[data-port="in:${to}"]`).click();assert.match(await page.locator('#wire-preview').innerText(),/待验证/);await page.locator('#ruin-test').click();assert.match(await page.locator(`[data-part="${from}"]`).textContent(),/输出端/);if(from!==to)assert.match(await page.locator(`[data-part="${to}"]`).textContent(),/输入端/);await page.waitForFunction(()=>!document.querySelector('#wire-preview').textContent.includes('正在'));}
try{
for(const viewport of [{width:1440,height:900},{width:375,height:667},{width:844,height:390}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#start-btn').click();
 await select(page,'nature');await page.locator('#scan-btn').click();assert.match(await page.locator('#route-feedback').innerText(),/混在一起/);
 await page.locator('#route-nature-controls [data-distance="near"]').click();for(let i=0;i<4;i++)await page.locator('[data-distance="turn"]').click();await page.locator('#scan-btn').click();assert.match(await page.locator('#discovery-log').textContent(),/独立/);
 await select(page,'ruins');await page.locator('#scan-btn').click();assert.match(await page.locator('#route-feedback').innerText(),/先选择/);
 await page.locator('[data-node="star"]').click();await page.locator('#scan-btn').click();assert.match(await page.locator('#route-feedback').innerText(),/太远/);
 await page.locator('#route-nodes [data-distance="near"]').click();for(const id of ['star','ring','core']){await page.locator(`[data-node="${id}"]`).click();await page.locator('#scan-btn').click();}
 assert.equal(await page.locator('#mission-progress').getAttribute('value'),'1');
 // Exercise the starfield marker handlers even when a narrow HUD hides a marker.
 await page.waitForFunction(()=>document.querySelector('[data-part="star"]').textContent.includes('输出端'));
 const markerClick=async id=>{await page.locator(`[data-part="${id}"]`).dispatchEvent('click');await page.waitForTimeout(80);};
 await markerClick('star');assert.match(await page.locator('#wire-preview').innerText(),/集光器.*输出/);
 await markerClick('star');assert.equal(await page.locator('#wire-preview').innerText(),'先选择输出端');assert(await page.locator('#ruin-test').isDisabled());
 await markerClick('ring');await markerClick('core');assert(await page.locator('#ruin-test').isEnabled());
 await markerClick('core');assert.match(await page.locator('#wire-preview').innerText(),/请选择输入端/);assert(await page.locator('#ruin-test').isDisabled());
 await markerClick('core');await markerClick('ring');assert.equal(await page.locator('#wire-preview').innerText(),'先选择输出端');

 for(let i=0;i<3;i++)await connect(page,'core','star');assert(await page.locator('#help-offer').isVisible());await page.locator('#help-decline').click();await connect(page,'core','star');assert(await page.locator('#help-offer').isHidden());
 await connect(page,'star','ring');assert.match(await page.locator('#ruin-selection').innerText(),/已修复 1\/2/);
 await page.reload();await page.locator('#start-btn').click();assert(await page.locator('#recap-dialog').isVisible());assert.match(await page.locator('#recap-text').innerText(),/修复了 1\/2/);await page.locator('#recap-skip').click();assert.match(await page.locator('#ruin-selection').innerText(),/已修复 1\/2/);
 await connect(page,'ring','core');assert.equal(await page.locator('#mission-progress').getAttribute('value'),'2');
 await page.locator('#ship-locate').click();await page.locator('#ship-scan').click();assert.match(await page.locator('#route-feedback').innerText(),/太远/);
 for(let i=0;i<3;i++)await page.locator('#ship-controls [data-distance="near"]').click();
 await page.locator('#ship-scan').click();assert(await page.locator('#ship-recover').isVisible());
 await page.reload();await page.locator('#start-btn').click();await page.locator('#recap-skip').click();assert(await page.locator('#ship-recover').isVisible());
 await page.locator('#ship-recover').click();assert.equal(await page.locator('#mission-progress').getAttribute('value'),'3');assert.match(await page.locator('#mission-task').innerText(),/调查完成/);
 await page.locator('#share-open').click();await page.locator('#share-type').selectOption('journal');assert.match(await page.locator('#share-preview').innerText(),/某某玩家/);assert(!((await page.locator('#share-preview').innerText()).includes('失联飞船')));
 await page.locator('#share-name').fill('星海旅人');await page.locator('#share-spoilers').check();assert.match(await page.locator('#share-preview').innerText(),/星海旅人/);assert.match(await page.locator('#share-preview').innerText(),/失联飞船/);
 const logDownload=page.waitForEvent('download');await page.locator('#share-download').click();assert.equal((await logDownload).suggestedFilename(),'个人航行日志.txt');
 await page.locator('#share-type').selectOption('card');await page.locator('#share-spoilers').uncheck();const imageDownload=page.waitForEvent('download');await page.locator('#share-download').click();const download=await imageDownload;assert.equal(download.suggestedFilename(),'探索纪念卡.png');await download.saveAs(`test-results/souvenir-${viewport.width}.png`);
 await page.screenshot({path:`test-results/share-${viewport.width}.png`});await page.locator('#share-close').click();
 await select(page,'nature');for(let i=0;i<2;i++)await page.locator('#route-nature-controls [data-distance="near"]').click();await page.locator('#scan-btn').click();assert.equal(await page.locator('#mission-progress').getAttribute('value'),'3');
 await page.locator('#route-restart').click();await select(page,'ruins');assert.equal(await page.locator('#mission-progress').getAttribute('value'),'3');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/routes-${viewport.width}.png`});assert.deepEqual(errors,[]);await page.close();
}
console.log('PASS: observation, endpoint hypotheses, pulse validation, hints opt-out, independent saves, recap, ship, signed/private exports, responsive controls.');
}finally{await browser.close();}
