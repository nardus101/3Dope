export type RenderMode =
  | 'showcase'
  | 'clay'
  | 'wireframe'
  | 'xray'
  | 'holographic'
  | 'technical'
  | 'neon';

export type QualityMode = 'performance' | 'balanced' | 'studio';

export type LightingPreset = 'obsidian' | 'atelier' | 'horizon' | 'surgical' | 'hologram';

export type BackgroundMode = 'obsidian' | 'graphite' | 'arctic' | 'midnight' | 'ember' | 'hologram';

export type ImportFormat = 'stl' | 'glb' | 'gltf' | 'fbx' | 'obj' | 'usdz' | 'step' | 'ply' | 'blend' | 'unknown';

export type TransformMode = 'translate' | 'rotate' | 'scale';

export type UnitSystem = 'model' | 'mm' | 'cm' | 'm' | 'in';

export type ClippingAxis = 'x' | 'y' | 'z';

export interface MaterialControls {
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
}

export interface ObjectTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export interface AssetDiagnostics {
  meshCount: number;
  triangleCount: number;
  vertexCount: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  boundsSize: [number, number, number];
  boundsCenter: [number, number, number];
  radius: number;
}

export interface ImportNotice {
  id: string;
  tone: 'good' | 'warn' | 'info';
  title: string;
  detail: string;
}

export interface MeasurementReadout {
  id: string;
  label: string;
  value: number;
  unit: UnitSystem;
}

export type MeasurementPoint = [number, number, number];

export interface ViewerAsset {
  id: string;
  name: string;
  format: ImportFormat;
  size: number;
  createdAt: number;
  status: 'ready' | 'analyzing' | 'unsupported' | 'error';
  error?: string;
}

export interface MeshInsight {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'info';
}

export interface CameraBookmark {
  id: string;
  name: string;
  createdAt: number;
  position: [number, number, number];
  target: [number, number, number];
}
