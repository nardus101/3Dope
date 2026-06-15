export interface RuntimeCapabilities {
  gpuTier: 'apple-silicon-optimized' | 'webgl-fallback';
  renderer: 'webgpu-ready' | 'webgl2';
  pixelRatio: number;
  highRefreshDisplay: boolean;
  supportsWebGPU: boolean;
}

export function detectRuntimeCapabilities(): RuntimeCapabilities {
  const supportsWebGPU = 'gpu' in navigator;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const highRefreshDisplay = matchMedia('(min-resolution: 2dppx)').matches;
  const appleSiliconHint = /Mac/.test(navigator.platform) && navigator.maxTouchPoints === 0;

  return {
    gpuTier: appleSiliconHint ? 'apple-silicon-optimized' : 'webgl-fallback',
    renderer: supportsWebGPU ? 'webgpu-ready' : 'webgl2',
    pixelRatio,
    highRefreshDisplay,
    supportsWebGPU
  };
}
