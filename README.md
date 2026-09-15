# 粒子星云核心

## 运行与部署

已包含构建好的 `assets/`，可直接把 **index.html 和整个 assets 目录** 一起发布到静态网站，不再依赖外部 CDN。不要只上传 HTML，也不要用 `file://` 双击打开。

本地预览（Node.js 18+，不需要先安装依赖）：

```sh
node scripts/serve.mjs
```

访问 http://localhost:4173。手机连接同一 Wi-Fi 后可访问电脑的局域网 IP 和 4173 端口。局域网 HTTP 支持触摸游玩；摄像头手势需要 HTTPS（电脑本机 localhost 也可）。

## 操作

- 手机：拖动旋转、双指缩放；底部按钮切换主题或触发全部特效。
- 电脑：拖动旋转、滚轮缩放；聚焦画布后可用方向键和加减键。
- 摄像头：进入后点“开启手势”；首次下载模型时可继续游玩，也可取消。关闭手势或切到后台会释放摄像头，回到页面后需手动重新开启。
- 操作说明可展开；横竖屏布局、刘海安全区和 44px 触控区域均已处理。

## 加载与性能调整

- 移除 4 个首屏同步 MediaPipe 脚本；Three.js 固定版本并本地打包压缩。首屏仅请求应用和共享渲染模块，合计约 507KB（未启用 HTTP 压缩）。
- 手机及低核心设备基础粒子从 26,200 降至 8,660，DPR 上限 1.25，星云精灵减半，保留核心辉光并跳过 Bloom 多通道后处理。桌面按需加载 Bloom，失败时继续基础渲染。
- 手势模型、WASM 单独放在 `assets/hands/`，约 24MB，只有主动开启摄像头后才按设备所需加载；不会在首屏预取整个目录。
- 手势推理限制为约 10–15 次/秒，避免同一视频帧重复推理；动画在后台暂停；特效对象设上限并在结束时释放。
- 建议生产静态服务器开启 Brotli/Gzip；HTML 与 app.js 使用重新验证缓存，带哈希的 chunk 可长期缓存。

## 修改与验证

源代码在 `src/`，页面与响应式样式在 `index.html`。

```sh
npm ci
npm run build
npm start
# 另一个终端，默认使用本机 Edge：
npm test
npm run test:hands
```

测试依赖本机 Edge；也可设置 `BROWSER_CHANNEL=chrome` 使用已安装的 Chrome。自动化覆盖桌面、窄窗口、手机、平板、横竖屏、拖动/双指缩放、特效按钮、无外网首屏、权限拒绝、模型加载失败、取消后的摄像头释放与 WebGL 失败提示。截图和本地加载计时保存在 `test-results/`。桌面浏览器的移动模拟不代表真实 iOS/Android 的帧率，真实设备表现还取决于 GPU、浏览器和网络。

## 第三方资源

Three.js 0.160.0（MIT，见 `assets/THREE-LICENSE.txt`）；MediaPipe Hands 0.4.1675469240（Apache-2.0，源项目 https://github.com/google-ai-edge/mediapipe）。依赖版本和校验值固定在 `package-lock.json`。
