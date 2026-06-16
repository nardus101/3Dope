import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Aperture, Box, Brain, Camera, Copy, Crosshair, Download, Eye, EyeOff, Gauge, Layers3, Lock, Maximize2, Move3D, Orbit, PanelLeftClose, PanelRightClose, Ruler, Redo2, Rotate3D, ScanLine, Scaling, Sparkles, Trash2, Undo2, Unlock, Upload, WandSparkles, X } from 'lucide-react';
import { ViewerCanvas } from './components/ViewerCanvas';
import { useViewerStore } from './store/viewerStore';
import { detectRuntimeCapabilities } from './engine/capabilities';
import { analyzeAsset } from './engine/importPipeline';
import { loadModelFile } from './engine/modelLoader';
import type { BackgroundMode, ClippingAxis, LightingPreset, QualityMode, RenderMode, TransformMode, UnitSystem } from './types/viewer';

const renderModes: Array<{ id: RenderMode; label: string }> = [
  { id: 'showcase', label: 'Showcase' },
  { id: 'clay', label: 'Clay' },
  { id: 'wireframe', label: 'Wire' },
  { id: 'xray', label: 'X-Ray' },
  { id: 'holographic', label: 'Holo' },
  { id: 'technical', label: 'Tech' },
  { id: 'neon', label: 'Neon' }
];

const lightingPresets: Array<{ id: LightingPreset; label: string }> = [
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'atelier', label: 'Atelier' },
  { id: 'horizon', label: 'Horizon' },
  { id: 'surgical', label: 'Surgical' },
  { id: 'hologram', label: 'Hologram' }
];

const backgroundModes: Array<{ id: BackgroundMode; label: string; swatch: string }> = [
  { id: 'obsidian', label: 'Obsidian', swatch: '#030306' },
  { id: 'graphite', label: 'Graphite', swatch: '#0a0b0c' },
  { id: 'arctic', label: 'Arctic', swatch: '#eef5f8' },
  { id: 'midnight', label: 'Midnight', swatch: '#020712' },
  { id: 'ember', label: 'Ember', swatch: '#120806' },
  { id: 'hologram', label: 'Hologram', swatch: '#020611' }
];

const qualityModes: Array<{ id: QualityMode; label: string; detail: string }> = [
  { id: 'performance', label: 'Performance', detail: 'Stable matte floor, no post-FX' },
  { id: 'balanced', label: 'Balanced', detail: 'Static shadows, reduced GPU load' },
  { id: 'studio', label: 'Studio', detail: 'Reflection and cinematic post-FX' }
];

const transformModes: Array<{ id: TransformMode; label: string; icon: ReactNode }> = [
  { id: 'translate', label: 'Move', icon: <Move3D size={16} /> },
  { id: 'rotate', label: 'Rotate', icon: <Rotate3D size={16} /> },
  { id: 'scale', label: 'Scale', icon: <Scaling size={16} /> }
];

const unitSystems: Array<{ id: UnitSystem; label: string }> = [
  { id: 'model', label: 'Model' },
  { id: 'mm', label: 'mm' },
  { id: 'cm', label: 'cm' },
  { id: 'm', label: 'm' },
  { id: 'in', label: 'in' }
];

const clippingAxes: Array<{ id: ClippingAxis; label: string }> = [
  { id: 'x', label: 'X' },
  { id: 'y', label: 'Y' },
  { id: 'z', label: 'Z' }
];

const unitFactors: Record<UnitSystem, number> = {
  model: 1,
  mm: 1000,
  cm: 100,
  m: 1,
  in: 39.3701
};

const quarterTurn = Math.PI / 2;
const halfTurn = Math.PI;

interface RenderBoundaryState {
  hasError: boolean;
  message: string;
}

class RenderErrorBoundary extends Component<{ children: ReactNode }, RenderBoundaryState> {
  state: RenderBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): RenderBoundaryState {
    return {
      hasError: true,
      message: error.message || 'The 3D renderer stopped unexpectedly.'
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3Dope render failure', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="render-fallback glass">
        <strong>Viewport recovered</strong>
        <span>{this.state.message}</span>
        <button onClick={() => this.setState({ hasError: false, message: '' })}>Restart 3D View</button>
      </div>
    );
  }
}

function App() {
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const capabilities = useMemo(() => detectRuntimeCapabilities(), []);
  const store = useViewerStore();
  const selectedAsset = store.assets.find((asset) => asset.id === store.selectedAssetId) ?? store.assets[0];
  const selectedDiagnostics = store.selectedAssetId ? store.assetDiagnostics[store.selectedAssetId] : undefined;
  const selectedMaterial = store.selectedAssetId ? store.assetMaterials[store.selectedAssetId] : undefined;
  const selectedTransform = store.selectedAssetId ? store.objectTransforms[store.selectedAssetId] : undefined;
  const selectedVisible = store.selectedAssetId ? (store.assetVisibility[store.selectedAssetId] ?? true) : true;
  const selectedLocked = store.selectedAssetId ? Boolean(store.assetLocks[store.selectedAssetId]) : false;
  const transformStep = store.transformSnap ? 0.1 : 0.025;
  const rotationStep = store.transformSnap ? Math.PI / 12 : Math.PI / 72;
  const formatMeasurement = (value: number) => `${(value * unitFactors[store.unitSystem]).toFixed(store.unitSystem === 'model' ? 3 : 2)} ${store.unitSystem}`;

  useEffect(() => {
    if (!store.importNotice) return;
    const timeout = window.setTimeout(() => store.setImportNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [store, store.importNotice]);

  const importFile = useCallback(async (file: File) => {
    setIsImporting(true);
    store.setImportNotice({
      id: crypto.randomUUID(),
      tone: 'info',
      title: 'Importing model',
      detail: `${file.name} is being parsed and staged.`
    });
    try {
      const [analysis, parsed] = await Promise.all([analyzeAsset(file), loadModelFile(file)]);
      const diagnostics = parsed.diagnostics;
      const orientationLabel = typeof parsed.object.userData.orientationLabel === 'string'
        ? parsed.object.userData.orientationLabel
        : 'Auto-upright: native floor';
      store.addAsset(
        {
          ...analysis.asset,
          format: parsed.format,
          status: 'ready'
        },
        [
          { label: 'Geometry', value: `${diagnostics.triangleCount.toLocaleString()} triangles`, tone: 'good' },
          { label: 'Vertices', value: `${diagnostics.vertexCount.toLocaleString()} staged for GPU upload`, tone: 'info' },
          { label: 'Bounds', value: diagnostics.boundsSize.map((value) => value.toFixed(2)).join(' x '), tone: 'info' },
          { label: 'Orientation', value: orientationLabel, tone: 'good' },
          { label: 'Mesh cleanup', value: 'Centered, scaled, normals rebuilt', tone: 'good' },
          { label: 'Studio framing', value: 'Ready for inspection and turntable', tone: 'good' }
        ],
        parsed.object,
        diagnostics
      );
      store.setImportNotice({
        id: crypto.randomUUID(),
        tone: 'good',
        title: 'Model loaded',
        detail: `${file.name} loaded with ${diagnostics.triangleCount.toLocaleString()} triangles and camera fit.`
      });
    } catch (error) {
      const analysis = await analyzeAsset(file);
      const message = error instanceof Error ? error.message : 'Unable to load this file.';
      store.addAsset(
        {
          ...analysis.asset,
          status: 'error',
          error: message
        },
        [
          { label: 'Import failed', value: message, tone: 'warn' },
          { label: 'Supported now', value: 'STL, GLB, GLTF, OBJ, PLY, FBX', tone: 'info' },
          { label: 'CAD pipeline', value: 'STEP, USDZ, BLEND need conversion plugin', tone: 'warn' }
        ]
      );
      store.setImportNotice({
        id: crypto.randomUUID(),
        tone: 'warn',
        title: 'Import failed',
        detail: message
      });
    } finally {
      setIsImporting(false);
    }
  }, [store]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const queuedFiles = Array.from(files).filter((file) => file.size > 0);

    if (queuedFiles.length === 0) {
      store.setImportNotice({
        id: crypto.randomUUID(),
        tone: 'warn',
        title: 'No model file found',
        detail: 'Drop one or more STL, GLB, GLTF, OBJ, PLY, or FBX files.'
      });
      return;
    }

    for (const file of queuedFiles) {
      await importFile(file);
    }
  }, [importFile, store]);

  const exportProject = () => {
    const blob = new Blob([store.exportProject()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `3dope-project-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    store.setImportNotice({
      id: crypto.randomUUID(),
      tone: 'good',
      title: 'Project exported',
      detail: 'Scene metadata, transforms, materials, render settings, and diagnostics were saved.'
    });
  };

  useEffect(() => {
    const showDropTarget = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      store.setDropTarget(true);
    };
    const onDragEnter = (event: DragEvent) => {
      showDropTarget(event);
      dragDepthRef.current += 1;
    };
    const onDragOver = (event: DragEvent) => {
      showDropTarget(event);
    };
    const onDragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) store.setDropTarget(false);
    };
    const onDrop = async (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      store.setDropTarget(false);
      const files = event.dataTransfer?.files;
      if (!files) return;
      await importFiles(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles, store]);

  return (
    <main className={store.presentationMode ? 'app presentation' : 'app'}>
      <RenderErrorBoundary>
        <ViewerCanvas />
      </RenderErrorBoundary>

      <div className="vignette" />
      <div className="scanline" />

      <AnimatePresence>
        {store.importNotice && (
          <motion.div
            key={store.importNotice.id}
            className={`import-notice glass ${store.importNotice.tone}`}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
          >
            <strong>{store.importNotice.title}</strong>
            <span>{store.importNotice.detail}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="topbar glass">
        <div className="brand">
          <div className="brand-mark">
            <img src="/brand/3dope-logo-mark.png" alt="3Dope" />
          </div>
          <div>
            <strong>3Dope</strong>
            <span>{capabilities.renderer} / {capabilities.gpuTier}</span>
          </div>
        </div>
        <div className="mode-strip">
          {renderModes.map((mode) => (
            <button key={mode.id} className={store.renderMode === mode.id ? 'active' : ''} onClick={() => store.setRenderMode(mode.id)}>
              {mode.label}
            </button>
          ))}
        </div>
        <div className="top-actions">
          <IconButton label="Bookmark camera" onClick={store.addBookmark}><Camera size={17} /></IconButton>
          <IconButton label="Presentation mode" active={store.presentationMode} onClick={store.togglePresentationMode}><Maximize2 size={17} /></IconButton>
        </div>
      </header>

      {store.presentationMode && (
        <button className="presentation-exit glass" onClick={store.togglePresentationMode}>
          <Maximize2 size={16} /> Exit Presentation
        </button>
      )}

      <AnimatePresence>
        {store.hierarchyOpen && !store.presentationMode && (
          <motion.aside className="left-panel glass panel" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <PanelHeader icon={<Layers3 size={17} />} title="Scene" action={<IconButton label="Collapse scene panel" onClick={store.toggleHierarchy}><PanelLeftClose size={16} /></IconButton>} />
            <div className="asset-list">
              {store.assets.map((asset) => (
                <button key={asset.id} className={asset.id === selectedAsset.id ? 'asset active' : 'asset'} onClick={() => store.selectAsset(asset.id)}>
                  <span className={`asset-dot ${store.assetVisibility[asset.id] === false ? 'hidden' : ''} ${store.assetLocks[asset.id] ? 'locked' : ''}`} />
                  <span>
                    <strong>{asset.name}</strong>
                    <small>{asset.format.toUpperCase()} · {(asset.size / 1024 / 1024).toFixed(1)} MB · {asset.error ?? asset.status}{store.assetLocks[asset.id] ? ' · locked' : ''}</small>
                  </span>
                </button>
              ))}
            </div>

            <section>
              <h2>Workflow</h2>
              <div className="toggle-row">
                <Toggle label="Beginner" active={store.beginnerMode} onClick={store.toggleBeginnerMode} />
                <Toggle label="Precision" active={store.precisionMode} onClick={store.togglePrecisionMode} />
              </div>
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                multiple
                accept=".stl,.glb,.gltf,.obj,.ply,.fbx,.usdz,.step,.stp,.blend"
                onChange={(event) => {
                  const files = event.currentTarget.files;
                  if (files) void importFiles(files);
                  event.currentTarget.value = '';
                }}
              />
              <button className="wide-command" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Import STL, GLB, OBJ, PLY, FBX</button>
            </section>

            <section>
              <h2>Edit System</h2>
              <div className="scene-actions">
                <IconButton label="Undo" onClick={store.undo}><Undo2 size={16} /></IconButton>
                <IconButton label="Redo" onClick={store.redo}><Redo2 size={16} /></IconButton>
                <IconButton label={selectedVisible ? 'Hide selected' : 'Show selected'} active={selectedVisible} onClick={store.toggleSelectedVisibility}>{selectedVisible ? <Eye size={16} /> : <EyeOff size={16} />}</IconButton>
                <IconButton label={selectedLocked ? 'Unlock selected' : 'Lock selected'} active={selectedLocked} onClick={store.toggleSelectedLock}>{selectedLocked ? <Lock size={16} /> : <Unlock size={16} />}</IconButton>
                <IconButton label="Duplicate selected" onClick={store.duplicateSelectedAsset}><Copy size={16} /></IconButton>
                <IconButton label="Delete selected" onClick={store.deleteSelectedAsset}><Trash2 size={16} /></IconButton>
              </div>
              <div className="toggle-row">
                <Toggle label="Edit" active={store.editMode} onClick={store.toggleEditMode} />
                <Toggle label="Snap" active={store.transformSnap} onClick={store.toggleTransformSnap} />
              </div>
              <div className="tool-grid">
                {transformModes.map((mode) => (
                  <button key={mode.id} className={store.transformMode === mode.id ? 'active' : ''} onClick={() => store.setTransformMode(mode.id)}>
                    {mode.icon}
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>
              {selectedTransform && (
                <div className="transform-readout">
                  <div>
                    <span>Position</span>
                    <strong>{selectedTransform.position.map((value) => value.toFixed(2)).join(' / ')}</strong>
                  </div>
                  <div>
                    <span>Rotation</span>
                    <strong>{selectedTransform.rotation.map((value) => `${Math.round(value * 180 / Math.PI)} deg`).join(' / ')}</strong>
                  </div>
                  <div>
                    <span>Scale</span>
                    <strong>{selectedTransform.scale.toFixed(2)}x</strong>
                  </div>
                </div>
              )}
              <div className="orientation-panel">
                <div className="orientation-actions">
                  <button onClick={store.autoCenterSelected}><Crosshair size={15} /> Auto Center</button>
                  <button onClick={store.dropSelectedToFloor}><Move3D size={15} /> Drop To Floor</button>
                  <button onClick={store.reorientSelectedUpright}><Rotate3D size={15} /> Stand Upright</button>
                </div>
                <div className="quick-orient-grid" aria-label="Quick object orientation">
                  <button onClick={() => store.rotateSelected('x', -quarterTurn)}>
                    <span>Roll Left</span>
                    <strong>X -90</strong>
                  </button>
                  <button onClick={() => store.rotateSelected('x', quarterTurn)}>
                    <span>Roll Right</span>
                    <strong>X +90</strong>
                  </button>
                  <button onClick={() => store.rotateSelected('y', -quarterTurn)}>
                    <span>Turn Left</span>
                    <strong>Y -90</strong>
                  </button>
                  <button onClick={() => store.rotateSelected('y', quarterTurn)}>
                    <span>Turn Right</span>
                    <strong>Y +90</strong>
                  </button>
                  <button onClick={() => store.rotateSelected('z', -quarterTurn)}>
                    <span>Tilt Back</span>
                    <strong>Z -90</strong>
                  </button>
                  <button onClick={() => store.rotateSelected('z', quarterTurn)}>
                    <span>Tilt Forward</span>
                    <strong>Z +90</strong>
                  </button>
                </div>
                <div className="flip-strip" aria-label="Flip object">
                  <button onClick={() => store.rotateSelected('x', halfTurn)}>Flip X</button>
                  <button onClick={() => store.rotateSelected('y', halfTurn)}>Flip Y</button>
                  <button onClick={() => store.rotateSelected('z', halfTurn)}>Flip Z</button>
                </div>
              </div>
              {store.transformMode === 'translate' && (
                <div className="nudge-grid">
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, position: [transform.position[0] - transformStep, transform.position[1], transform.position[2]] }))}>X-</button>
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, position: [transform.position[0] + transformStep, transform.position[1], transform.position[2]] }))}>X+</button>
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, position: [transform.position[0], transform.position[1] - transformStep, transform.position[2]] }))}>Y-</button>
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, position: [transform.position[0], transform.position[1] + transformStep, transform.position[2]] }))}>Y+</button>
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, position: [transform.position[0], transform.position[1], transform.position[2] - transformStep] }))}>Z-</button>
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, position: [transform.position[0], transform.position[1], transform.position[2] + transformStep] }))}>Z+</button>
                </div>
              )}
              {store.transformMode === 'rotate' && (
                <div className="nudge-grid">
                  <button onClick={() => store.rotateSelected('x', -rotationStep)}>Pitch -</button>
                  <button onClick={() => store.rotateSelected('x', rotationStep)}>Pitch +</button>
                  <button onClick={() => store.rotateSelected('y', -rotationStep)}>Yaw -</button>
                  <button onClick={() => store.rotateSelected('y', rotationStep)}>Yaw +</button>
                  <button onClick={() => store.rotateSelected('z', -rotationStep)}>Roll -</button>
                  <button onClick={() => store.rotateSelected('z', rotationStep)}>Roll +</button>
                </div>
              )}
              {store.transformMode === 'scale' && (
                <div className="nudge-grid scale-grid">
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, scale: Math.max(0.05, transform.scale - transformStep) }))}>Scale-</button>
                  <button onClick={() => store.updateSelectedTransform((transform) => ({ ...transform, scale: transform.scale + transformStep }))}>Scale+</button>
                </div>
              )}
              <button className="wide-command secondary-command" onClick={store.resetSelectedTransform}>Reset Transform</button>
              <button className="wide-command secondary-command" onClick={exportProject}><Download size={16} /> Export Project JSON</button>
            </section>

            <section>
              <h2>Viewpoints</h2>
              <div className="bookmark-grid">
                {store.cameraBookmarks.map((bookmark) => (
                  <button key={bookmark.id} onClick={() => store.focusCameraBookmark(bookmark.id)}>
                    {bookmark.name}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Measurement</h2>
              <div className="unit-grid">
                {unitSystems.map((unit) => (
                  <button key={unit.id} className={store.unitSystem === unit.id ? 'active' : ''} onClick={() => store.setUnitSystem(unit.id)}>
                    {unit.label}
                  </button>
                ))}
              </div>
              <div className="scene-actions measurement-actions">
                <IconButton label="Capture dimensions" onClick={store.captureSelectedMeasurements}><Ruler size={16} /></IconButton>
                <IconButton label="Pick two points" active={store.pointMeasurementMode} onClick={store.togglePointMeasurementMode}><Crosshair size={16} /></IconButton>
                <IconButton label={store.measurementsVisible ? 'Hide measurements' : 'Show measurements'} active={store.measurementsVisible} onClick={store.toggleMeasurements}>{store.measurementsVisible ? <Eye size={16} /> : <EyeOff size={16} />}</IconButton>
                <IconButton label="Clear measurements" onClick={store.clearMeasurements}><X size={16} /></IconButton>
              </div>
              <div className="measurement-hint">
                {store.pointMeasurementMode
                  ? `${Math.min(store.measurementPoints.length + 1, 2)} of 2 points: click the model surface`
                  : 'Use bounds capture or pick two points on the model surface.'}
              </div>
            </section>

            <section>
              <h2>Section Slice</h2>
              <div className="toggle-row">
                <Toggle label="Slice" active={store.clippingEnabled} onClick={store.toggleClipping} />
                <Toggle label="Invert" active={store.clippingInverted} onClick={store.toggleClippingInverted} />
              </div>
              <div className="axis-grid">
                {clippingAxes.map((axis) => (
                  <button key={axis.id} className={store.clippingAxis === axis.id ? 'active' : ''} onClick={() => store.setClippingAxis(axis.id)}>
                    {axis.label}
                  </button>
                ))}
              </div>
              <div className="section-control">
                <span>Plane</span>
                <input
                  type="range"
                  min="-1.6"
                  max="1.6"
                  step="0.01"
                  value={store.clippingOffset}
                  onChange={(event) => store.setClippingOffset(Number(event.currentTarget.value))}
                />
                <strong>{store.clippingOffset.toFixed(2)}</strong>
              </div>
              <button className="wide-command secondary-command" onClick={store.resetClippingOffset}>
                <ScanLine size={16} /> Center Slice Plane
              </button>
              <div className="measurement-hint">
                Use section slicing to inspect internal geometry without changing the imported mesh.
              </div>
            </section>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {store.inspectorOpen && !store.presentationMode && (
          <motion.aside className="right-panel glass panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
            <PanelHeader icon={<ScanLine size={17} />} title="Inspector" action={<IconButton label="Collapse inspector" onClick={store.toggleInspector}><PanelRightClose size={16} /></IconButton>} />

            <section>
              <h2>Studio Lighting</h2>
              <div className="preset-grid">
                {lightingPresets.map((preset) => (
                  <button key={preset.id} className={store.lightingPreset === preset.id ? 'active' : ''} onClick={() => store.setLightingPreset(preset.id)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Background</h2>
              <div className="background-grid">
                {backgroundModes.map((mode) => (
                  <button key={mode.id} className={store.backgroundMode === mode.id ? 'active' : ''} onClick={() => store.setBackgroundMode(mode.id)}>
                    <i style={{ background: mode.swatch }} />
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Render Budget</h2>
              <div className="quality-grid">
                {qualityModes.map((mode) => (
                  <button key={mode.id} className={store.qualityMode === mode.id ? 'active' : ''} onClick={() => store.setQualityMode(mode.id)}>
                    <span>{mode.label}</span>
                    <small>{mode.detail}</small>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Material Editor</h2>
              <div className="material-editor">
                <label>
                  <span>Base</span>
                  <input type="color" value={selectedMaterial?.color ?? '#d8dee9'} disabled={selectedLocked} onChange={(event) => store.setSelectedMaterialControl('color', event.currentTarget.value)} />
                </label>
                <RangeControl label="Metal" value={selectedMaterial?.metalness ?? 0.72} disabled={selectedLocked} onChange={(value) => store.setSelectedMaterialControl('metalness', value)} />
                <RangeControl label="Rough" value={selectedMaterial?.roughness ?? 0.23} disabled={selectedLocked} onChange={(value) => store.setSelectedMaterialControl('roughness', value)} />
                <RangeControl label="Alpha" value={selectedMaterial?.opacity ?? 1} disabled={selectedLocked} onChange={(value) => store.setSelectedMaterialControl('opacity', value)} />
              </div>
            </section>

            <section>
              <h2>Mesh Intelligence</h2>
              <div className="insight-list">
                {store.meshInsights.map((insight) => (
                  <div className={`insight ${insight.tone}`} key={insight.label}>
                    <span>{insight.label}</span>
                    <strong>{insight.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2>Import Diagnostics</h2>
              {selectedDiagnostics ? (
                <div className="metric-grid diagnostics-grid">
                  <Metric icon={<Box size={16} />} label="Meshes" value={selectedDiagnostics.meshCount.toLocaleString()} />
                  <Metric icon={<Gauge size={16} />} label="Triangles" value={selectedDiagnostics.triangleCount.toLocaleString()} />
                  <Metric icon={<Activity size={16} />} label="Vertices" value={selectedDiagnostics.vertexCount.toLocaleString()} />
                  <Metric icon={<Aperture size={16} />} label="Radius" value={selectedDiagnostics.radius.toFixed(2)} />
                  <div className="diagnostic-wide">
                    <span>Bounds</span>
                    <strong>{selectedDiagnostics.boundsSize.map((value) => value.toFixed(2)).join(' x ')}</strong>
                  </div>
                </div>
              ) : (
                <div className="diagnostic-empty">Import a model to inspect parser output, bounds, and camera fit data.</div>
              )}
            </section>

            <section>
              <h2>Measurements</h2>
              {store.measurementReadouts.length > 0 ? (
                <div className="insight-list">
                  {store.measurementReadouts.map((measurement) => (
                    <div className="insight info" key={measurement.id}>
                      <span>{measurement.label}</span>
                      <strong>{formatMeasurement(measurement.value)}</strong>
                    </div>
                  ))}
                </div>
              ) : selectedDiagnostics ? (
                <div className="diagnostic-empty">Capture dimensions to pin width, height, depth, diagonal, and radius readouts.</div>
              ) : (
                <div className="diagnostic-empty">Import a model before capturing dimensions.</div>
              )}
              {store.measurementPoints.length > 0 && (
                <div className="point-list">
                  {store.measurementPoints.map((point, index) => (
                    <div className="diagnostic-wide" key={`${point.join('-')}-${index}`}>
                      <span>Point {index + 1}</span>
                      <strong>{point.map((value) => value.toFixed(3)).join(', ')}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2>Apple Silicon Path</h2>
              <div className="metric-grid">
                <Metric icon={<Gauge size={16} />} label="Adaptive DPR" value={`${capabilities.pixelRatio.toFixed(1)}x`} />
                <Metric icon={<Activity size={16} />} label="Refresh" value={capabilities.highRefreshDisplay ? 'Retina high' : 'Standard'} />
                <Metric icon={<Brain size={16} />} label="Parser" value="Async" />
                <Metric icon={<Aperture size={16} />} label="Post FX" value={store.qualityMode} />
              </div>
            </section>
          </motion.aside>
        )}
      </AnimatePresence>

      {!store.presentationMode && (
        <nav className="dock glass">
          <IconButton label="Scene panel" active={store.hierarchyOpen} onClick={store.toggleHierarchy}><Layers3 size={20} /></IconButton>
          <IconButton label="Turntable" active={store.turntable} onClick={store.toggleTurntable}><Orbit size={20} /></IconButton>
          <IconButton
            label="Smart suggest"
            onClick={() => store.setImportNotice({
              id: crypto.randomUUID(),
              tone: 'info',
              title: 'Smart suggestions',
              detail: selectedDiagnostics
                ? `${selectedAsset.name}: use Capture dimensions, Technical mode, and Section Slice for inspection.`
                : 'Import a model first, then 3Dope can suggest useful inspection tools.'
            })}
          >
            <WandSparkles size={20} />
          </IconButton>
          <IconButton label="Inspector" active={store.inspectorOpen} onClick={store.toggleInspector}><Sparkles size={20} /></IconButton>
        </nav>
      )}

      <AnimatePresence>
        {(store.showDropTarget || isImporting) && (
          <motion.div className="drop-target" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="drop-card glass" initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }}>
              <Upload size={34} />
              <strong>{isImporting ? 'Analyzing geometry' : 'Drop model to stage'}</strong>
              <span>Progressive import, auto-repair checks, studio framing, and material preview</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function PanelHeader({ icon, title, action }: { icon: ReactNode; title: string; action: ReactNode }) {
  return (
    <div className="panel-header">
      <div>{icon}<strong>{title}</strong></div>
      {action}
    </div>
  );
}

function IconButton({ children, label, active, onClick }: { children: ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return <button className={active ? 'icon-button active' : 'icon-button'} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'toggle active' : 'toggle'} onClick={onClick}>{label}</button>;
}

function RangeControl({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.01" value={value} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <strong>{Math.round(value * 100)}</strong>
    </label>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="metric">{icon}<span>{label}</span><strong>{value}</strong></div>;
}

export default App;
