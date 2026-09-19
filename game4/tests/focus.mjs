import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try {
 for(const viewport of [{width:1440,height:900},{width:375,height:667},{width:844,height:390}]){
  for(const route of ['nature','ruins']){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({route})=>localStorage.setItem('nebula-routes-v1',JSON.stringify({selected:route,natureVersion:2,ruinsVersion:3,states:{[route]:{samples:route==='nature'?['far']:[],inspected:['star','ring','core'],links:route==='ruins'?['star:ring','ring:core']:[],complete:route==='ruins',shipStage:0,view:{distance:180,azimuth:.8,polar:Math.PI/2}}}})),{route});
   await page.goto('http://localhost:4173');await page.locator('#start-btn').click();await page.locator('#recap-skip').click();
   const marker=page.locator(route==='nature'?'#echo-marker':'.story-marker');
   for(const distance of [180,90]){
    if(distance===90) for(let i=0;i<4;i++)await page.locator(route==='nature'?'#route-nature-controls [data-distance="near"]':'#ship-controls [data-distance="near"]').click();
    await page.waitForTimeout(1300);
    assert(await marker.isVisible(),`${route} ${viewport.width} ${distance} marker hidden`);
    const box=await marker.boundingBox();const hud=await page.locator('#ui-layer').boundingBox();
    assert(box.x>0 && box.y>0 && box.x+box.width<viewport.width && box.y+box.height<viewport.height,JSON.stringify({route,viewport,distance,box}));
    assert(box.x>=hud.x+hud.width || box.y>=hud.y+hud.height, 'Target label overlaps task panel');
    await page.screenshot({path:`test-results/focus-${route}-${viewport.width}-${distance}.png`});
   }
   const canvas=page.locator('canvas').first();await canvas.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(250);assert(await marker.isVisible());assert.deepEqual(errors,[]);await page.close();
  }
 }
 console.log('PASS: ship and companion remain visible outside HUD at 180/90 on desktop, portrait, landscape, restored saves and rotation.');
} finally {await browser.close();}
