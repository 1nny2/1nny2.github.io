/* NNY出品 · 浩源 · 浪尖儿社区
 * GitHub Pages 部署时，将下面地址改成已部署的 Node 服务地址。
 * 本地运行留空，客户端请求当前页面同源的 /api/。
 */
window.NNY_API_BASE = location.hostname === '1nny2.github.io'
  ? 'https://nikon-jim-saturday-aud.trycloudflare.com'
  : '';
