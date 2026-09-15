// Classic worker: MediaPipe's WASM loader uses importScripts internally.
let detector;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const { createHandDetector } = await import("./vision-runtime.js");
      detector = await createHandDetector(text => self.postMessage({ type: "progress", text }));
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error.message || error) });
    }
    return;
  }
  if (data.type === "frame") {
    try {
      const result = detector.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: "result", landmarks: result.landmarks, timestamp: data.timestamp });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error.message || error) });
    } finally {
      data.bitmap.close();
    }
  }
};
