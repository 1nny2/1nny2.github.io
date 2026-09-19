# Fruitwarp Ninja

静态网页游戏，支持鼠标、触屏及前置摄像头手势。无需构建。

## 启动与手机访问

电脑本地预览：在本目录运行 `python -m http.server 8765 --bind 127.0.0.1`，打开 `http://127.0.0.1:8765/`。若端口已被占用，可改用其他端口。不要直接双击 HTML：浏览器会限制 `file://` 页面的模块与模型加载。

**手机手势模式必须使用浏览器信任的 HTTPS 地址。** 将以下文件及目录一起部署到支持 HTTPS 的静态网站，然后在手机 Safari、Chrome 或 Edge 中打开并允许相机。仅上传 `index.html` 不够。

```text
index.html
gesture-tracker.js
vision-runtime.js
hand-worker.js
assets/
```

手机访问电脑的 `http://192.168.x.x:端口` 不属于安全上下文，浏览器会禁止相机。这不是网页 JavaScript 能绕过的限制。`localhost` 例外仅限正在使用的设备自身；手机的 localhost 不指向电脑。应用内浏览器若不支持相机，请在系统浏览器中打开。

若使用 iframe 嵌入，需要 HTTPS 父页面和子页面，并通过 `allow="camera"` 及站点的 Permissions-Policy 允许相机。

服务器应将 `.js` / `.mjs` 作为 JavaScript、`.wasm` 作为 `application/wasm` 提供，并允许加载同源 Worker。不要把不存在的静态资源重写成 HTML。部署可开启 Brotli / gzip、为 assets 设置合理缓存；更新依赖时须同步更新 JS、WASM 和模型并清理旧缓存。

## 性能与兼容处理

- Three.js 为本地固定版本；进入鼠标模式不加载 MediaPipe 或模型。
- 手势模型按需加载，相机和模型并行初始化；准备期间不计分，提供状态和取消按钮；同一页面再次进入时复用已初始化模型。
- 支持的浏览器使用 Worker 后台推理，只处理新的摄像头帧，最多一帧在途。桌面约 30 次/秒、手机约 20 次/秒，慢设备自动降频。
- GPU 初始化失败后使用 CPU；缺少 Worker / OffscreenCanvas 时使用主线程兼容路径，手机推理上限约 10 次/秒。兼容路径仍可能在低性能设备上出现短暂停顿。
- 手的位置在每个渲染帧平滑更新；手机降低画布分辨率、粒子数量和叠加特效。
- 权限拒绝、加载失败、取消和相机断开均提供退出路径并清理视频流；取消后才返回的权限请求也会关闭其视频流。
- 视频使用 muted + playsinline，优先请求 640×480 前置相机，约束不兼容时重试宽松请求。

## 依赖

运行时不访问第三方 CDN 或 Google 模型地址。

- Three.js `0.170.0`，MIT，见 `assets/THREE-LICENSE.txt`。
- MediaPipe Tasks Vision `0.10.21`，Apache-2.0，见 `assets/vision/LICENSE.txt`。包含 SIMD / 非 SIMD WASM，浏览器按能力选择其中一种。
- Hand Landmarker float16 模型版本 `1`：原始来源 `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`，MediaPipe 官方模型。

WASM 和模型合计较大，首次手势启动仍取决于访问设备、网站带宽与缓存；不能将本地测试耗时视为所有用户的加载时间。

## 回归验证

需要 Node.js、Playwright 和 Microsoft Edge，先启动上面的静态服务，然后运行：

```sh
node tests/browser.cjs
```

可用 `TEST_URL` 环境变量改变服务地址。Playwright 必须在 Node.js 模块搜索路径中。

测试使用浏览器的 canvas.captureStream 生成视频，不访问真实摄像头；加载真实 MediaPipe 模型，验证后台推理、模型复用、权限拒绝、取消后迟到的视频流、手机触屏/分辨率、CPU 兼容回退、不安全 HTTP 提示以及人为增加 80 ms 推理耗时后的渲染连续性。手机模拟不等于 iOS / Android 实机测试，实际手势准确率、授权行为与帧率仍需在目标手机的 HTTPS 网站上验证。
