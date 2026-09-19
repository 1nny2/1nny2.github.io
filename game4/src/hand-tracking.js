// 模型与 WASM 不参与首屏加载；关闭、失败或切到后台时立即释放摄像头。
const assetRoot = new URL('./assets/hands/', document.baseURI);
let scriptPromise;

function loadHandsScript() {
  if (window.Hands) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('手势组件加载超时')), 20000);
    function finish(error) {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); scriptPromise = null; reject(error); }
      else resolve();
    }
    script.src = new URL('hands.js', assetRoot).href;
    script.onload = () => finish(window.Hands ? null : new Error('手势组件不可用'));
    script.onerror = () => finish(new Error('手势组件加载失败'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function createHandTracking({ video, preview, lightweight, onResults, onState }) {
  let current = null;

  function closeDetector(session) {
    if (session.hands && !session.busy && !session.closed) {
      session.closed = true;
      Promise.resolve(session.hands.close()).catch(console.warn);
    }
  }

  function stop(message = '手势已关闭，可继续触摸或鼠标操作') {
    const session = current;
    current = null;
    if (session) {
      session.cancelled = true;
      clearTimeout(session.timeout);
      cancelAnimationFrame(session.frame);
      session.stream?.getTracks().forEach(track => track.stop());
      closeDetector(session);
    }
    video.pause();
    video.srcObject = null;
    preview.hidden = true;
    onState('off', message);
  }

  function fail(session, error) {
    if (current !== session) return;
    console.warn('Hand tracking:', error);
    const message = error.name === 'NotAllowedError' ? '未获摄像头权限，仍可使用触摸和按钮'
      : error.name === 'NotFoundError' ? '未找到摄像头，仍可使用触摸和按钮'
      : error.name === 'NotReadableError' ? '摄像头被占用，仍可使用触摸和按钮'
      : `${error.message || '手势启动失败'}，可重试或继续触摸操作`;
    stop(message);
  }

  async function toggle() {
    if (current) { stop(); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      onState('off', '摄像头需要 HTTPS 或 localhost；触摸和按钮可直接游玩');
      return;
    }
    const session = { cancelled: false, busy: false, lastFrame: 0, lastVideoTime: -1 };
    current = session;
    onState('loading', '正在申请摄像头权限…');
    session.timeout = setTimeout(() => fail(session, new Error('手势启动超时')), 45000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: lightweight ? 480 : 640 }, height: { ideal: lightweight ? 360 : 480 }, frameRate: { ideal: 24, max: 30 } },
      });
      if (session.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      video.srcObject = stream;
      await video.play();
      if (session.cancelled) return;
      onState('loading', '正在准备手势模型，星云可继续游玩…');
      await loadHandsScript();
      if (session.cancelled) return;
      session.hands = new window.Hands({ locateFile: file => new URL(file, assetRoot).href });
      session.hands.setOptions({ maxNumHands: 2, modelComplexity: lightweight ? 0 : 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
      session.hands.onResults(results => { if (current === session) onResults(results); });
      session.busy = true;
      try { await session.hands.initialize(); }
      finally { session.busy = false; if (session.cancelled) closeDetector(session); }
      if (session.cancelled) return;
      clearTimeout(session.timeout);
      preview.width = 200;
      preview.height = 150;
      preview.hidden = false;
      onState('on', '手势已开启：伸手操作，双手移出画面即可停止旋转和缩放');
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (current === session) stop('摄像头连接已断开，可重新开启');
      });

      async function frame(now) {
        if (session.cancelled) return;
        if (!document.hidden && video.readyState >= 2 && video.currentTime !== session.lastVideoTime && now - session.lastFrame >= (lightweight ? 100 : 66)) {
          session.busy = true;
          session.lastFrame = now;
          session.lastVideoTime = video.currentTime;
          try { await session.hands.send({ image: video }); }
          catch (error) { fail(session, error); }
          finally { session.busy = false; if (session.cancelled) closeDetector(session); }
        }
        if (!session.cancelled) session.frame = requestAnimationFrame(frame);
      }
      session.frame = requestAnimationFrame(frame);
    } catch (error) { fail(session, error); }
  }
  return { toggle, stop };
}
