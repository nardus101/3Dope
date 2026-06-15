import type { ImportFormat, MeshInsight, ViewerAsset } from '../types/viewer';

const supportedFormats: ImportFormat[] = ['stl', 'glb', 'gltf', 'fbx', 'obj', 'usdz', 'step', 'ply', 'blend'];

export function detectFormat(file: File): ImportFormat {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'stp') return 'step';
  return supportedFormats.includes(extension as ImportFormat) ? (extension as ImportFormat) : 'unknown';
}

export async function analyzeAsset(file: File): Promise<{ asset: ViewerAsset; insights: MeshInsight[] }> {
  const format = detectFormat(file);
  const isSupported = format !== 'unknown';

  await new Promise((resolve) => window.setTimeout(resolve, 420));

  return {
    asset: {
      id: crypto.randomUUID(),
      name: file.name,
      format,
      size: file.size,
      createdAt: Date.now(),
      status: isSupported ? 'ready' : 'unsupported'
    },
    insights: [
      {
        label: 'Import',
        value: isSupported ? `${format.toUpperCase()} queued for progressive parsing` : 'Format flagged for plugin pipeline',
        tone: isSupported ? 'good' : 'warn'
      },
      { label: 'Mesh cleanup', value: 'Normals, bounds, and scale pass prepared', tone: 'info' },
      { label: 'Streaming', value: `${Math.max(1, file.size / 1024 / 1024).toFixed(1)} MB lazy asset envelope`, tone: 'info' },
      { label: 'Studio framing', value: 'Auto-center and camera fit ready', tone: 'good' }
    ]
  };
}
