// Keep JS, WASM and model versions in sync; no third-party requests at runtime.
export async function createHandDetector(onProgress = () => {}) {
  onProgress("正在加载手势引擎…");
  const { HandLandmarker, FilesetResolver } = await import("./assets/vision/vision_bundle.mjs");
  const files = await FilesetResolver.forVisionTasks(new URL("./assets/vision/wasm", import.meta.url).href);
  const options = {
    baseOptions: { modelAssetPath: new URL("./assets/vision/hand_landmarker.task", import.meta.url).href },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  onProgress("正在初始化手势模型，首次使用需要稍候…");
  try {
    return await HandLandmarker.createFromOptions(files, {
      ...options, baseOptions: { ...options.baseOptions, delegate: "GPU" },
    });
  } catch (error) {
    console.info("GPU tracking unavailable; using CPU", error);
    onProgress("正在启用兼容识别模式…");
    return HandLandmarker.createFromOptions(files, {
      ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}
