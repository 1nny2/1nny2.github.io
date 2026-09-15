import { createHandDetector } from "./vision-runtime.js";

export class GestureTracker {
  constructor({ onResult, onError, onProgress, mobile = false }) {
    Object.assign(this, { onResult, onError, onProgress, mobile });
    this.interval = mobile ? 50 : 33;
    this.generation = 0;
    this.lastTimestamp = 0;
  }

  init() {
    if (!this.initializing) {
      this.initializing = this.initialize().catch(error => {
        this.initializing = null;
        throw error;
      });
    }
    return this.initializing;
  }

  async initialize() {
    if (typeof Worker !== "undefined" && typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
      try {
        await new Promise((resolve, reject) => {
          const worker = this.worker = new Worker(new URL("./hand-worker.js", import.meta.url));
          const timeout = setTimeout(() => reject(new Error("手势后台引擎启动超时")), 25000);
          const fail = error => { clearTimeout(timeout); reject(error); };
          worker.onerror = event => fail(new Error(event.message || "后台识别不可用"));
          worker.onmessage = ({ data }) => {
            if (data.type === "progress") this.onProgress(data.text);
            if (data.type === "error") fail(new Error(data.message));
            if (data.type === "ready") { clearTimeout(timeout); resolve(); }
          };
          worker.postMessage({ type: "init" });
        });
        this.worker.onmessage = ({ data }) => {
          if (data.type === "result") this.complete(data);
          if (data.type === "error") this.fail(new Error(data.message));
        };
        this.worker.onerror = event => this.fail(new Error(event.message || "手势后台识别中断"));
        this.backend = "worker";
        return;
      } catch (error) {
        this.worker?.terminate();
        this.worker = null;
        console.info("Worker tracking unavailable; using compatibility mode", error);
      }
    }
    this.onProgress("正在启用浏览器兼容模式…");
    // Older iOS browsers may not support worker canvas. Limit synchronous
    // inference to 10–15 Hz; rendering still runs on its own animation loop.
    this.detector = await createHandDetector(this.onProgress);
    this.interval = this.mobile ? 100 : 66;
    this.backend = "main";
  }

  start(video) {
    this.stop();
    this.video = video;
    this.active = true;
    this.lastVideoTime = -1;
    this.lastSent = -Infinity;
    this.schedule();
  }

  schedule() {
    if (!this.active) return;
    if (this.video.requestVideoFrameCallback) {
      this.videoCallback = this.video.requestVideoFrameCallback(() => this.tick());
    } else {
      this.animationCallback = requestAnimationFrame(() => this.tick());
    }
  }

  tick() {
    this.schedule();
    const now = performance.now();
    if (!this.active || document.hidden || this.busy || this.video.readyState < 2 ||
        now - this.lastSent < this.interval || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    this.lastSent = now;
    // Monotonic across camera restarts, required by MediaPipe VIDEO mode.
    const timestamp = this.lastTimestamp = Math.max(now, this.lastTimestamp + 1);
    this.busy = true;
    this.inFlightGeneration = this.generation;
    this.sentAt = now;
    if (this.worker) {
      const generation = this.generation;
      // Keep only one transferable frame in flight; never build a stale queue.
      createImageBitmap(this.video, { resizeWidth: 480, resizeHeight: Math.max(1,
        Math.round(480 * this.video.videoHeight / this.video.videoWidth)) }).then(bitmap => {
        if (!this.active || generation !== this.generation) {
          bitmap.close();
          this.busy = false;
          return;
        }
        this.watchdog = setTimeout(() => this.fail(new Error("手势识别响应超时，请重试")), 8000);
        try { this.worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]); }
        catch (error) { bitmap.close(); throw error; }
      }).catch(error => this.fail(error));
    } else {
      try {
        this.complete({ landmarks: this.detector.detectForVideo(this.video, timestamp).landmarks, timestamp });
      } catch (error) { this.fail(error); }
    }
  }

  complete(result) {
    clearTimeout(this.watchdog);
    this.busy = false;
    // Reduce sampling on slower devices instead of blocking or queuing frames.
    const duration = performance.now() - this.sentAt;
    const floor = this.backend === "worker" ? (this.mobile ? 50 : 33) : (this.mobile ? 100 : 66);
    this.interval = Math.min(150, Math.max(floor, this.interval * 0.8 + duration * 1.15 * 0.2));
    if (this.active && this.inFlightGeneration === this.generation) this.onResult(result, performance.now());
  }

  stop() {
    this.active = false;
    this.generation++;
    if (this.videoCallback != null) this.video?.cancelVideoFrameCallback(this.videoCallback);
    if (this.animationCallback != null) cancelAnimationFrame(this.animationCallback);
    this.videoCallback = this.animationCallback = null;
    // An outstanding inference retains busy until its result is discarded.
  }

  fail(error) {
    const wasActive = this.active;
    this.stop();
    clearTimeout(this.watchdog);
    this.worker?.terminate();
    this.worker = null;
    this.detector?.close();
    this.detector = null;
    this.busy = false;
    this.initializing = null;
    if (wasActive) this.onError(error);
  }
}
