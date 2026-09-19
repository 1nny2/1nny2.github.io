import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function createBloom(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer);
  // 辉光限制为一倍像素比，避免高 DPI 下多次渲染大尺寸缓冲区。
  composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1));
  composer.setSize(width, height);
  const bloomPass = new UnrealBloomPass(new Vector2(width, height), 1.6, 0.7, 0);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);
  return { composer, bloomPass };
}
