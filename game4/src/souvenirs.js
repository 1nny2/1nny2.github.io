export function createSouvenirs({capture,getData}) {
  const $=id=>document.getElementById(id), dialog=$('share-dialog'), canvas=$('share-canvas'), ctx=canvas.getContext('2d');
  let data, snapshot=null, generatedText='', generation=0;
  const name=()=> $('share-name').value.trim() || '某某玩家';
  function wrap(text,x,y,width,lineHeight){
    let line='';
    for(const ch of text){if(ctx.measureText(line+ch).width>width){ctx.fillText(line,x,y);y+=lineHeight;line='';}line+=ch;}
    ctx.fillText(line,x,y);return y+lineHeight;
  }
  function render(){
    if(!data)return;generation++;$('share-status').textContent='预览仅在本机生成，尚未分享。';
    const spoilers=$('share-spoilers').checked, type=$('share-type').value;
    const lines=data.journal.map(entry=>`${entry.time}  ${spoilers?entry.text:entry.public}`);
    generatedText=`个人航行日志\n路线：${data.route}\n署名：${name()}\n状态：${data.complete?'完成本次探索':'探索进行中'}\n${spoilers?'包含剧情细节':'关键剧情已隐藏'}\n\n${lines.length?lines.join('\n'):'旅程刚刚开始，新的发现还在前方。'}`;
    $('share-preview').textContent=generatedText;$('share-preview').hidden=type!=='journal';canvas.hidden=type!=='card';
    const gradient=ctx.createLinearGradient(0,0,1000,1000);gradient.addColorStop(0,'#07162c');gradient.addColorStop(1,'#153d4d');ctx.fillStyle=gradient;ctx.fillRect(0,0,1000,1000);
    // Discovered objects are the souvenir; the checkbox controls story text only.
    if(snapshot){ctx.drawImage(snapshot,0,0,1000,520);}
    else {
      for(let i=0;i<180;i++){ctx.fillStyle=`rgba(179,223,255,${.2+(i%7)/10})`;ctx.beginPath();ctx.arc((i*137.5)%1000,(i*73.3)%490,i%4===0?2:1,0,Math.PI*2);ctx.fill();}
      for(let i=8;i>0;i--){ctx.strokeStyle=`rgba(93,213,232,${.04+i*.015})`;ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(500,265,80+i*20,35+i*11,-.35,0,Math.PI*2);ctx.stroke();}
    }
    ctx.fillStyle='#adedef';ctx.font='24px sans-serif';ctx.fillText('NEBULA / 我的探索纪念',65,590);
    ctx.fillStyle='#f0f8ff';ctx.font='bold 54px sans-serif';ctx.fillText(data.route,65,665);
    ctx.font='28px sans-serif';let y=wrap(spoilers?(data.discoveries.at(-1)||'探索的第一步已经开始。'):data.imageUnlocked?(data.route==='观测星海'?'穿过星云的辉光，我发现了冰蓝伴星。':'循着重燃的灯塔光束，我找到了失联飞船。'):'旅程刚刚开始，新的发现还在前方。',65,730,860,42);
    ctx.fillStyle='#acd0dc';ctx.font='24px sans-serif';ctx.fillText(data.complete?'本次调查完成':'旅程进行中',65,Math.max(y+10,820));
    ctx.fillStyle='#f0f8ff';ctx.font='28px sans-serif';wrap(`探索者：${name()}`,65,900,860,38);
  }
  async function file(){
    const revision=generation;
    if($('share-type').value==='journal')return new File([generatedText], '个人航行日志.txt',{type:'text/plain;charset=utf-8'});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('图片生成失败，请重试。');
    if(revision!==generation)throw new Error('预览已更新，请再次保存或分享。');
    return new File([blob],'探索纪念卡.png',{type:'image/png'});
  }
  $('share-download').onclick=async()=>{
    try{const result=await file(),url=URL.createObjectURL(result),a=document.createElement('a');a.href=url;a.download=result.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('share-status').textContent='已请求保存到本机，没有自动发布。';}
    catch(e){$('share-status').textContent=e.message;}
  };
  $('share-native').onclick=async()=>{
    try{const result=await file();if(!navigator.canShare?.({files:[result]})||!navigator.share){$('share-status').textContent='当前浏览器不支持系统分享，请先保存到本机，再自行发送。';return;}
      await navigator.share({files:[result],title:'我的星海探索'});$('share-status').textContent='已交给系统分享界面处理。';
    }catch(e){$('share-status').textContent=e.name==='AbortError'?'已取消分享。':'分享未完成，可以保存到本机后自行发送。';}
  };
  for(const id of ['share-name','share-type','share-spoilers'])$(id).addEventListener('input',render);
  $('share-close').onclick=()=>dialog.close();
  return {open(){
    data=getData();snapshot=null;$('share-spoilers').checked=false;render();dialog.showModal();
    if(!data.imageUnlocked)return;
    $('share-download').disabled=$('share-native').disabled=true;
    const unlock=()=>{$('share-download').disabled=$('share-native').disabled=false;};
    try{const src=capture();const img=new Image();img.onload=()=>{snapshot=img;unlock();if(dialog.open)render();};img.onerror=()=>{unlock();$('share-status').textContent='目标画面生成失败，请关闭后重试。';};img.src=src;}catch{unlock();$('share-status').textContent='目标画面生成失败，请关闭后重试。';}
  }};
}
