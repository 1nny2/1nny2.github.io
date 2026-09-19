import { build } from 'esbuild';
import { mkdir, copyFile, readdir } from 'node:fs/promises';

await build({
  entryPoints: ['src/app.js'],
  outdir: 'assets',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2020'],
  minify: true,
  metafile: false,
  legalComments: 'linked',
});
// 手势模型单独部署，仅在用户打开摄像头时下载。
await mkdir('assets/hands', { recursive: true });
for (const name of await readdir('node_modules/@mediapipe/hands')) {
  if (/\.(js|wasm|data|tflite|binarypb)$/.test(name)) {
    await copyFile(`node_modules/@mediapipe/hands/${name}`, `assets/hands/${name}`);
  }
}
await copyFile('node_modules/three/LICENSE', 'assets/THREE-LICENSE.txt');
console.log('Built local renderer, optional bloom, and on-demand hand tracking assets.');
