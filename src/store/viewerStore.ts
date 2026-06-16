import { create } from 'zustand';
import * as THREE from 'three';
import type { AssetDiagnostics, BackgroundMode, CameraBookmark, ClippingAxis, ImportNotice, LightingPreset, MaterialControls, MeasurementPoint, MeasurementReadout, MeshInsight, ObjectTransform, QualityMode, RenderMode, TransformMode, UnitSystem, ViewerAsset } from '../types/viewer';

type TransformAxis = 'x' | 'y' | 'z';

interface EditSnapshot {
  objectTransforms: Record<string, ObjectTransform>;
  assetMaterials: Record<string, MaterialControls>;
  assetVisibility: Record<string, boolean>;
  assetLocks: Record<string, boolean>;
}

interface ViewerState {
  assets: ViewerAsset[];
  sceneObjects: Record<string, THREE.Object3D>;
  objectTransforms: Record<string, ObjectTransform>;
  assetMaterials: Record<string, MaterialControls>;
  assetVisibility: Record<string, boolean>;
  assetLocks: Record<string, boolean>;
  assetDiagnostics: Record<string, AssetDiagnostics>;
  selectedAssetId: string | null;
  cameraFitRequest: number;
  importNotice: ImportNotice | null;
  renderMode: RenderMode;
  qualityMode: QualityMode;
  lightingPreset: LightingPreset;
  backgroundMode: BackgroundMode;
  beginnerMode: boolean;
  precisionMode: boolean;
  presentationMode: boolean;
  editMode: boolean;
  transformMode: TransformMode;
  transformSnap: boolean;
  unitSystem: UnitSystem;
  measurementsVisible: boolean;
  pointMeasurementMode: boolean;
  measurementPoints: MeasurementPoint[];
  measurementReadouts: MeasurementReadout[];
  clippingEnabled: boolean;
  clippingAxis: ClippingAxis;
  clippingOffset: number;
  clippingInverted: boolean;
  transformDragging: boolean;
  undoStack: EditSnapshot[];
  redoStack: EditSnapshot[];
  turntable: boolean;
  inspectorOpen: boolean;
  hierarchyOpen: boolean;
  showDropTarget: boolean;
  meshInsights: MeshInsight[];
  cameraBookmarks: CameraBookmark[];
  cameraBookmarkCaptureRequest: number;
  cameraBookmarkFocusRequest: CameraBookmark | null;
  setRenderMode: (mode: RenderMode) => void;
  setQualityMode: (mode: QualityMode) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  setBackgroundMode: (mode: BackgroundMode) => void;
  toggleBeginnerMode: () => void;
  togglePrecisionMode: () => void;
  togglePresentationMode: () => void;
  toggleEditMode: () => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleTransformSnap: () => void;
  setUnitSystem: (unit: UnitSystem) => void;
  toggleMeasurements: () => void;
  togglePointMeasurementMode: () => void;
  addMeasurementPoint: (point: MeasurementPoint) => void;
  captureSelectedMeasurements: () => void;
  clearMeasurements: () => void;
  toggleClipping: () => void;
  setClippingAxis: (axis: ClippingAxis) => void;
  setClippingOffset: (offset: number) => void;
  resetClippingOffset: () => void;
  toggleClippingInverted: () => void;
  updateSelectedTransform: (updater: (transform: ObjectTransform) => ObjectTransform) => void;
  commitSelectedTransform: (transform: ObjectTransform) => void;
  setTransformDragging: (dragging: boolean) => void;
  autoCenterSelected: () => void;
  dropSelectedToFloor: () => void;
  reorientSelectedUpright: () => void;
  rotateSelected: (axis: TransformAxis, radians: number) => void;
  resetSelectedTransform: () => void;
  setSelectedMaterialControl: <K extends keyof MaterialControls>(key: K, value: MaterialControls[K]) => void;
  undo: () => void;
  redo: () => void;
  toggleSelectedVisibility: () => void;
  toggleSelectedLock: () => void;
  duplicateSelectedAsset: () => void;
  deleteSelectedAsset: () => void;
  exportProject: () => string;
  setMaterialControl: <K extends keyof MaterialControls>(key: K, value: MaterialControls[K]) => void;
  toggleTurntable: () => void;
  toggleInspector: () => void;
  toggleHierarchy: () => void;
  setDropTarget: (visible: boolean) => void;
  selectAsset: (assetId: string) => void;
  addAsset: (asset: ViewerAsset, insights: MeshInsight[], object?: THREE.Object3D, diagnostics?: AssetDiagnostics) => void;
  setImportNotice: (notice: ImportNotice | null) => void;
  requestCameraFit: () => void;
  addBookmark: () => void;
  saveCameraBookmark: (position: [number, number, number], target: [number, number, number]) => void;
  focusCameraBookmark: (bookmarkId: string) => void;
}

const defaultInsights: MeshInsight[] = [
  { label: 'Topology', value: 'Clean procedural demo mesh', tone: 'good' },
  { label: 'Scale', value: 'Auto-centered at 1.0 m', tone: 'info' },
  { label: 'Printability', value: 'No open boundary edges', tone: 'good' },
  { label: 'Overhangs', value: '12% needs support preview', tone: 'warn' }
];

const defaultTransform: ObjectTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1
};

const defaultMaterial: MaterialControls = {
  color: '#d8dee9',
  metalness: 0.72,
  roughness: 0.23,
  opacity: 1
};

const floorY = -1.2;
const defaultCameraPosition: [number, number, number] = [4.4, 2.8, 5.4];
const defaultCameraTarget: [number, number, number] = [0, -0.05, 0];

function cloneTransform(transform: ObjectTransform): ObjectTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: transform.scale
  };
}

function cloneMaterial(material: MaterialControls): MaterialControls {
  return { ...material };
}

function cloneSnapshot(state: Pick<ViewerState, 'objectTransforms' | 'assetMaterials' | 'assetVisibility' | 'assetLocks'>): EditSnapshot {
  return {
    objectTransforms: Object.fromEntries(Object.entries(state.objectTransforms).map(([id, transform]) => [id, cloneTransform(transform)])),
    assetMaterials: Object.fromEntries(Object.entries(state.assetMaterials).map(([id, material]) => [id, cloneMaterial(material)])),
    assetVisibility: { ...state.assetVisibility },
    assetLocks: { ...state.assetLocks }
  };
}

function withUndo(state: ViewerState) {
  return {
    undoStack: [...state.undoStack.slice(-49), cloneSnapshot(state)],
    redoStack: []
  };
}

function transformsEqual(a: ObjectTransform, b: ObjectTransform) {
  return (
    a.scale === b.scale &&
    a.position.every((value, index) => value === b.position[index]) &&
    a.rotation.every((value, index) => value === b.rotation[index])
  );
}

function getObjectBounds(object: THREE.Object3D, transform: ObjectTransform) {
  const wrapper = new THREE.Group();
  const clone = object.clone(true);
  wrapper.add(clone);
  wrapper.position.set(...transform.position);
  wrapper.rotation.set(...transform.rotation);
  wrapper.scale.setScalar(transform.scale);
  wrapper.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(wrapper);
}

function floorTransform(object: THREE.Object3D, transform: ObjectTransform): ObjectTransform {
  const box = getObjectBounds(object, transform);
  if (box.isEmpty()) return transform;

  return {
    ...cloneTransform(transform),
    position: [
      transform.position[0],
      Number((transform.position[1] + floorY - box.min.y).toFixed(5)),
      transform.position[2]
    ]
  };
}

function centerTransform(object: THREE.Object3D, transform: ObjectTransform): ObjectTransform {
  const floored = floorTransform(object, transform);
  const box = getObjectBounds(object, floored);
  if (box.isEmpty()) return floored;

  const center = new THREE.Vector3();
  box.getCenter(center);

  return {
    ...cloneTransform(floored),
    position: [
      Number((floored.position[0] - center.x).toFixed(5)),
      floored.position[1],
      Number((floored.position[2] - center.z).toFixed(5))
    ]
  };
}

function transformBoundsScore(object: THREE.Object3D, transform: ObjectTransform) {
  const box = getObjectBounds(object, transform);
  if (box.isEmpty()) return { height: 0, footprint: 0 };
  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    height: size.y,
    footprint: size.x * size.z
  };
}

function normalizeAngle(angle: number) {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Number(wrapped.toFixed(5));
}

function roundedRotation(rotation: [number, number, number]): [number, number, number] {
  return rotation.map(normalizeAngle) as [number, number, number];
}

function bestUprightTransform(object: THREE.Object3D, current: ObjectTransform): ObjectTransform {
  const quarter = Math.PI / 2;
  const candidates: ObjectTransform[] = [
    current,
    { ...cloneTransform(current), rotation: roundedRotation([current.rotation[0] - quarter, current.rotation[1], current.rotation[2]]) },
    { ...cloneTransform(current), rotation: roundedRotation([current.rotation[0] + quarter, current.rotation[1], current.rotation[2]]) },
    { ...cloneTransform(current), rotation: roundedRotation([current.rotation[0], current.rotation[1], current.rotation[2] - quarter]) },
    { ...cloneTransform(current), rotation: roundedRotation([current.rotation[0], current.rotation[1], current.rotation[2] + quarter]) },
    { ...cloneTransform(current), rotation: roundedRotation([current.rotation[0] + Math.PI, current.rotation[1], current.rotation[2]]) },
    { ...cloneTransform(current), rotation: roundedRotation([current.rotation[0], current.rotation[1], current.rotation[2] + Math.PI]) }
  ];

  const scored = candidates.map((candidate) => {
    const floored = floorTransform(object, candidate);
    return {
      transform: floored,
      ...transformBoundsScore(object, floored)
    };
  });

  return scored.reduce((winner, candidate) => {
    if (candidate.height > winner.height * 1.04) return candidate;
    if (Math.abs(candidate.height - winner.height) <= Math.max(0.02, winner.height * 0.04) && candidate.footprint > winner.footprint) return candidate;
    return winner;
  }, scored[0]).transform;
}

function rotateTransform(object: THREE.Object3D | undefined, current: ObjectTransform, axis: TransformAxis, radians: number) {
  const rotated = cloneTransform(current);
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  rotated.rotation[axisIndex] = normalizeAngle(rotated.rotation[axisIndex] + radians);
  return object ? floorTransform(object, rotated) : rotated;
}

function omitKey<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  assets: [
    {
      id: 'demo-orbital-part',
      name: 'Orbital Rotor Assembly',
      format: 'glb',
      size: 4280000,
      createdAt: Date.now(),
      status: 'ready'
    }
  ],
  sceneObjects: {},
  objectTransforms: {
    'demo-orbital-part': defaultTransform
  },
  assetMaterials: {
    'demo-orbital-part': defaultMaterial
  },
  assetVisibility: {
    'demo-orbital-part': true
  },
  assetLocks: {
    'demo-orbital-part': false
  },
  assetDiagnostics: {},
  selectedAssetId: 'demo-orbital-part',
  cameraFitRequest: 0,
  importNotice: null,
  renderMode: 'showcase',
  qualityMode: 'balanced',
  lightingPreset: 'obsidian',
  backgroundMode: 'obsidian',
  beginnerMode: true,
  precisionMode: false,
  presentationMode: false,
  editMode: false,
  transformMode: 'translate',
  transformSnap: false,
  unitSystem: 'model',
  measurementsVisible: true,
  pointMeasurementMode: false,
  measurementPoints: [],
  measurementReadouts: [],
  clippingEnabled: false,
  clippingAxis: 'y',
  clippingOffset: 0,
  clippingInverted: false,
  transformDragging: false,
  undoStack: [],
  redoStack: [],
  turntable: true,
  inspectorOpen: true,
  hierarchyOpen: true,
  showDropTarget: false,
  meshInsights: defaultInsights,
  cameraBookmarks: [{ id: 'hero', name: 'Hero angle', createdAt: Date.now(), position: defaultCameraPosition, target: defaultCameraTarget }],
  cameraBookmarkCaptureRequest: 0,
  cameraBookmarkFocusRequest: null,
  setRenderMode: (renderMode) => set({ renderMode }),
  setQualityMode: (qualityMode) => set({ qualityMode }),
  setLightingPreset: (lightingPreset) => set({ lightingPreset }),
  setBackgroundMode: (backgroundMode) => set({ backgroundMode }),
  toggleBeginnerMode: () => set((state) => ({ beginnerMode: !state.beginnerMode })),
  togglePrecisionMode: () => set((state) => ({ precisionMode: !state.precisionMode })),
  togglePresentationMode: () => set((state) => ({ presentationMode: !state.presentationMode })),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode, turntable: state.editMode ? state.turntable : false })),
  setTransformMode: (transformMode) => set({ transformMode }),
  toggleTransformSnap: () => set((state) => ({ transformSnap: !state.transformSnap })),
  setUnitSystem: (unitSystem) => set({ unitSystem }),
  toggleMeasurements: () => set((state) => ({ measurementsVisible: !state.measurementsVisible })),
  togglePointMeasurementMode: () =>
    set((state) => ({
      pointMeasurementMode: !state.pointMeasurementMode,
      measurementsVisible: true,
      turntable: state.pointMeasurementMode ? state.turntable : false
    })),
  addMeasurementPoint: (point) =>
    set((state) => {
      const roundedPoint: MeasurementPoint = point.map((value) => Number(value.toFixed(5))) as MeasurementPoint;
      const nextPoints: MeasurementPoint[] = state.measurementPoints.length >= 2 ? [roundedPoint] : [...state.measurementPoints, roundedPoint];

      if (nextPoints.length < 2) {
        return {
          measurementPoints: nextPoints,
          measurementsVisible: true
        };
      }

      const [start, end] = nextPoints;
      const distance = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      const otherReadouts = state.measurementReadouts.filter((readout) => readout.id !== 'point-distance');

      return {
        measurementPoints: nextPoints,
        measurementsVisible: true,
        measurementReadouts: [
          ...otherReadouts,
          {
            id: 'point-distance',
            label: 'Point Distance',
            value: distance,
            unit: state.unitSystem
          }
        ]
      };
    }),
  captureSelectedMeasurements: () =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      const diagnostics = state.assetDiagnostics[state.selectedAssetId];
      if (!diagnostics) return state;
      const [width, height, depth] = diagnostics.boundsSize;
      const diagonal = Math.hypot(width, height, depth);
      return {
        measurementReadouts: [
          { id: 'width', label: 'Width', value: width, unit: state.unitSystem },
          { id: 'height', label: 'Height', value: height, unit: state.unitSystem },
          { id: 'depth', label: 'Depth', value: depth, unit: state.unitSystem },
          { id: 'diagonal', label: 'Diagonal', value: diagonal, unit: state.unitSystem },
          { id: 'radius', label: 'Radius', value: diagnostics.radius, unit: state.unitSystem }
        ]
      };
    }),
  clearMeasurements: () => set({ measurementReadouts: [], measurementPoints: [] }),
  toggleClipping: () => set((state) => ({ clippingEnabled: !state.clippingEnabled })),
  setClippingAxis: (clippingAxis) => set({ clippingAxis }),
  setClippingOffset: (clippingOffset) => set({ clippingOffset }),
  resetClippingOffset: () => set({ clippingOffset: 0 }),
  toggleClippingInverted: () => set((state) => ({ clippingInverted: !state.clippingInverted })),
  updateSelectedTransform: (updater) =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      if (state.assetLocks[state.selectedAssetId]) return state;
      const current = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;
      return {
        ...withUndo(state),
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: updater(current)
        }
      };
    }),
  commitSelectedTransform: (transform) =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      if (state.assetLocks[state.selectedAssetId]) return { transformDragging: false };
      const current = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;
      if (transformsEqual(current, transform)) return { transformDragging: false };

      return {
        ...withUndo(state),
        transformDragging: false,
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: cloneTransform(transform)
        }
      };
    }),
  setTransformDragging: (transformDragging) => set({ transformDragging }),
  autoCenterSelected: () =>
    set((state) => {
      if (!state.selectedAssetId || state.assetLocks[state.selectedAssetId]) return state;
      const object = state.sceneObjects[state.selectedAssetId];
      const current = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;
      const next = object
        ? centerTransform(object, current)
        : { ...cloneTransform(current), position: [0, current.position[1], 0] as [number, number, number] };
      if (transformsEqual(current, next)) return state;

      return {
        ...withUndo(state),
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: next
        }
      };
    }),
  dropSelectedToFloor: () =>
    set((state) => {
      if (!state.selectedAssetId || state.assetLocks[state.selectedAssetId]) return state;
      const object = state.sceneObjects[state.selectedAssetId];
      if (!object) return state;
      const current = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;
      const next = floorTransform(object, current);
      if (transformsEqual(current, next)) return state;

      return {
        ...withUndo(state),
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: next
        }
      };
    }),
  reorientSelectedUpright: () =>
    set((state) => {
      if (!state.selectedAssetId || state.assetLocks[state.selectedAssetId]) return state;
      const object = state.sceneObjects[state.selectedAssetId];
      const current = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;
      const fallback = {
        ...cloneTransform(current),
        rotation: roundedRotation([current.rotation[0] - Math.PI / 2, current.rotation[1], current.rotation[2]])
      };
      const next = object ? bestUprightTransform(object, current) : fallback;
      if (transformsEqual(current, next)) return state;

      return {
        ...withUndo(state),
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: next
        }
      };
    }),
  rotateSelected: (axis, radians) =>
    set((state) => {
      if (!state.selectedAssetId || state.assetLocks[state.selectedAssetId]) return state;
      const object = state.sceneObjects[state.selectedAssetId];
      const current = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;
      const next = rotateTransform(object, current, axis, radians);
      if (transformsEqual(current, next)) return state;

      return {
        ...withUndo(state),
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: next
        }
      };
    }),
  resetSelectedTransform: () =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      if (state.assetLocks[state.selectedAssetId]) return state;
      return {
        ...withUndo(state),
        objectTransforms: {
          ...state.objectTransforms,
          [state.selectedAssetId]: defaultTransform
        }
      };
    }),
  setSelectedMaterialControl: (key, value) =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      if (state.assetLocks[state.selectedAssetId]) return state;
      const current = state.assetMaterials[state.selectedAssetId] ?? defaultMaterial;
      return {
        ...withUndo(state),
        assetMaterials: {
          ...state.assetMaterials,
          [state.selectedAssetId]: {
            ...current,
            [key]: value
          }
        }
      };
    }),
  undo: () =>
    set((state) => {
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) return state;
      return {
        ...previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack.slice(-49), cloneSnapshot(state)]
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next) return state;
      return {
        ...next,
        undoStack: [...state.undoStack.slice(-49), cloneSnapshot(state)],
        redoStack: state.redoStack.slice(0, -1)
      };
    }),
  toggleSelectedVisibility: () =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      return {
        ...withUndo(state),
        assetVisibility: {
          ...state.assetVisibility,
          [state.selectedAssetId]: !(state.assetVisibility[state.selectedAssetId] ?? true)
        }
      };
    }),
  toggleSelectedLock: () =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      return {
        ...withUndo(state),
        assetLocks: {
          ...state.assetLocks,
          [state.selectedAssetId]: !state.assetLocks[state.selectedAssetId]
        }
      };
    }),
  duplicateSelectedAsset: () =>
    set((state) => {
      if (!state.selectedAssetId) return state;
      const asset = state.assets.find((entry) => entry.id === state.selectedAssetId);
      if (!asset) return state;
      const duplicateId = crypto.randomUUID();
      const duplicate: ViewerAsset = {
        ...asset,
        id: duplicateId,
        name: `${asset.name} Copy`,
        createdAt: Date.now()
      };
      const sourceObject = state.sceneObjects[state.selectedAssetId];
      const transform = state.objectTransforms[state.selectedAssetId] ?? defaultTransform;

      return {
        assets: [duplicate, ...state.assets],
        selectedAssetId: duplicateId,
        sceneObjects: sourceObject ? { ...state.sceneObjects, [duplicateId]: sourceObject.clone(true) } : state.sceneObjects,
        objectTransforms: {
          ...state.objectTransforms,
          [duplicateId]: {
            ...cloneTransform(transform),
            position: [transform.position[0] + 0.18, transform.position[1], transform.position[2] + 0.18]
          }
        },
        assetMaterials: {
          ...state.assetMaterials,
          [duplicateId]: cloneMaterial(state.assetMaterials[state.selectedAssetId] ?? defaultMaterial)
        },
        assetVisibility: {
          ...state.assetVisibility,
          [duplicateId]: true
        },
        assetLocks: {
          ...state.assetLocks,
          [duplicateId]: false
        },
        assetDiagnostics: state.assetDiagnostics[state.selectedAssetId]
          ? { ...state.assetDiagnostics, [duplicateId]: state.assetDiagnostics[state.selectedAssetId] }
          : state.assetDiagnostics
      };
    }),
  deleteSelectedAsset: () =>
    set((state) => {
      if (!state.selectedAssetId || state.selectedAssetId === 'demo-orbital-part') return state;
      const deletedAssetId = state.selectedAssetId;
      const nextAssets = state.assets.filter((asset) => asset.id !== state.selectedAssetId);
      const nextSelected = nextAssets[0]?.id ?? 'demo-orbital-part';

      return {
        assets: nextAssets,
        selectedAssetId: nextSelected,
        sceneObjects: omitKey(state.sceneObjects, deletedAssetId),
        objectTransforms: omitKey(state.objectTransforms, deletedAssetId),
        assetMaterials: omitKey(state.assetMaterials, deletedAssetId),
        assetVisibility: omitKey(state.assetVisibility, deletedAssetId),
        assetLocks: omitKey(state.assetLocks, deletedAssetId),
        assetDiagnostics: omitKey(state.assetDiagnostics, deletedAssetId)
      };
    }),
  exportProject: () => {
    const state = get();
    return JSON.stringify(
      {
        app: '3Dope',
        version: '0.7.11-brand-logo-polish',
        exportedAt: new Date().toISOString(),
        selectedAssetId: state.selectedAssetId,
        render: {
          renderMode: state.renderMode,
          qualityMode: state.qualityMode,
          lightingPreset: state.lightingPreset,
          backgroundMode: state.backgroundMode,
          unitSystem: state.unitSystem,
          measurementsVisible: state.measurementsVisible,
          pointMeasurementMode: state.pointMeasurementMode,
          clipping: {
            enabled: state.clippingEnabled,
            axis: state.clippingAxis,
            offset: state.clippingOffset,
            inverted: state.clippingInverted
          }
        },
        assets: state.assets.map((asset) => ({
          ...asset,
          transform: state.objectTransforms[asset.id] ?? defaultTransform,
          material: state.assetMaterials[asset.id] ?? defaultMaterial,
          visible: state.assetVisibility[asset.id] ?? true,
          locked: state.assetLocks[asset.id] ?? false,
          diagnostics: state.assetDiagnostics[asset.id] ?? null
        })),
        cameraBookmarks: state.cameraBookmarks,
        measurements: state.measurementReadouts,
        measurementPoints: state.measurementPoints
      },
      null,
      2
    );
  },
  setMaterialControl: (key, value) =>
    get().setSelectedMaterialControl(key, value),
  toggleTurntable: () => set((state) => ({ turntable: !state.turntable })),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  toggleHierarchy: () => set((state) => ({ hierarchyOpen: !state.hierarchyOpen })),
  setDropTarget: (showDropTarget) => set({ showDropTarget }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  addAsset: (asset, meshInsights, object, diagnostics) =>
    set((state) => ({
      assets: [asset, ...get().assets],
      selectedAssetId: object ? asset.id : state.selectedAssetId,
      meshInsights: object ? meshInsights : state.meshInsights,
      sceneObjects: object ? { ...state.sceneObjects, [asset.id]: object } : state.sceneObjects,
      objectTransforms: {
        ...state.objectTransforms,
        [asset.id]: defaultTransform
      },
      assetMaterials: {
        ...state.assetMaterials,
        [asset.id]: cloneMaterial(defaultMaterial)
      },
      assetVisibility: {
        ...state.assetVisibility,
        [asset.id]: true
      },
      assetLocks: {
        ...state.assetLocks,
        [asset.id]: false
      },
      assetDiagnostics: diagnostics ? { ...state.assetDiagnostics, [asset.id]: diagnostics } : state.assetDiagnostics,
      cameraFitRequest: object ? state.cameraFitRequest + 1 : state.cameraFitRequest
    })),
  setImportNotice: (importNotice) => set({ importNotice }),
  requestCameraFit: () => set((state) => ({ cameraFitRequest: state.cameraFitRequest + 1 })),
  addBookmark: () =>
    set((state) => ({
      cameraBookmarkCaptureRequest: state.cameraBookmarkCaptureRequest + 1
    })),
  saveCameraBookmark: (position, target) =>
    set((state) => ({
      cameraBookmarks: [
        ...state.cameraBookmarks,
        {
          id: crypto.randomUUID(),
          name: `View ${state.cameraBookmarks.length + 1}`,
          createdAt: Date.now(),
          position,
          target
        }
      ]
    })),
  focusCameraBookmark: (bookmarkId) =>
    set((state) => {
      const bookmark = state.cameraBookmarks.find((entry) => entry.id === bookmarkId);
      return bookmark ? { cameraBookmarkFocusRequest: bookmark } : state;
    })
}));
