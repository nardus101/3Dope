import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { AccumulativeShadows, ContactShadows, Environment, Float, Html, Line, MeshReflectorMaterial, OrbitControls, PerspectiveCamera, RandomizedLight, Sparkles, Text, useDetectGPU } from '@react-three/drei';
import { Bloom, DepthOfField, EffectComposer, Noise, SSAO, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { useViewerStore } from '../store/viewerStore';
import type { AssetDiagnostics, ClippingAxis, LightingPreset, MaterialControls, QualityMode, RenderMode, UnitSystem } from '../types/viewer';

const modeMaterials: Record<RenderMode, THREE.MeshStandardMaterialParameters> = {
  showcase: { color: '#d8dee9', metalness: 0.72, roughness: 0.23 },
  clay: { color: '#b9b2a6', metalness: 0.02, roughness: 0.66 },
  wireframe: { color: '#e8fbff', metalness: 0.1, roughness: 0.45, wireframe: true },
  xray: { color: '#82f6ff', metalness: 0.05, roughness: 0.18, transparent: true, opacity: 0.34 },
  holographic: { color: '#5fe8ff', metalness: 0.2, roughness: 0.12, transparent: true, opacity: 0.58 },
  technical: { color: '#cfd8e3', metalness: 0.35, roughness: 0.38 },
  neon: { color: '#111827', metalness: 0.45, roughness: 0.16, emissive: '#1df7ff', emissiveIntensity: 0.32 }
};

const lighting: Record<LightingPreset, { env: string; key: string; rim: string; intensity: number; bg: string }> = {
  obsidian: { env: 'night', key: '#e8f2ff', rim: '#72f7ff', intensity: 2.8, bg: '#030306' },
  atelier: { env: 'studio', key: '#fff1df', rim: '#b6ceff', intensity: 2.35, bg: '#070706' },
  horizon: { env: 'sunset', key: '#ffd5a8', rim: '#9ee8ff', intensity: 2.15, bg: '#06070a' },
  surgical: { env: 'city', key: '#f4fbff', rim: '#d7e6ff', intensity: 2.65, bg: '#06080a' },
  hologram: { env: 'night', key: '#90fff7', rim: '#8878ff', intensity: 2.4, bg: '#020611' }
};

const qualityDpr: Record<QualityMode, [number, number]> = {
  eco: [0.75, 1],
  balanced: [1, 1.5],
  cinematic: [1, 2],
  ultra: [1.25, 2]
};

export function ViewerCanvas() {
  const qualityMode = useViewerStore((state) => state.qualityMode);
  const gpu = useDetectGPU();

  return (
    <Canvas
      className="viewer-canvas"
      dpr={qualityDpr[qualityMode]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: gpu.tier >= 2 ? 'high-performance' : 'default',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15
      }}
      shadows="soft"
      performance={{ min: 0.55 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <WebglRecoveryBridge />
      <Suspense fallback={<LoadingStage />}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}

function WebglRecoveryBridge() {
  const { gl } = useThree();
  const setImportNotice = useViewerStore((state) => state.setImportNotice);
  const setQualityMode = useViewerStore((state) => state.setQualityMode);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setQualityMode('eco');
      setImportNotice({
        id: crypto.randomUUID(),
        tone: 'warn',
        title: 'Viewport recovered',
        detail: 'WebGL reported pressure during rendering. Quality was reduced to protect the session.'
      });
    };
    const handleContextRestored = () => {
      setImportNotice({
        id: crypto.randomUUID(),
        tone: 'good',
        title: 'Viewport restored',
        detail: 'The renderer is active again. Large models will stay in GPU-safe preview mode.'
      });
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl, setImportNotice, setQualityMode]);

  return null;
}

function Scene() {
  const renderMode = useViewerStore((state) => state.renderMode);
  const lightingPreset = useViewerStore((state) => state.lightingPreset);
  const qualityMode = useViewerStore((state) => state.qualityMode);
  const selectedAssetId = useViewerStore((state) => state.selectedAssetId);
  const importedObject = useViewerStore((state) => (state.selectedAssetId ? state.sceneObjects[state.selectedAssetId] : undefined));
  const selectedVisible = useViewerStore((state) => (state.selectedAssetId ? state.assetVisibility[state.selectedAssetId] ?? true : true));
  const selectedDiagnostics = useViewerStore((state) => (state.selectedAssetId ? state.assetDiagnostics[state.selectedAssetId] : undefined));
  const heavyModel = Boolean(selectedDiagnostics && selectedDiagnostics.triangleCount > 180000);
  const measurementsVisible = useViewerStore((state) => state.measurementsVisible);
  const measurementPoints = useViewerStore((state) => state.measurementPoints);
  const unitSystem = useViewerStore((state) => state.unitSystem);
  const editMode = useViewerStore((state) => state.editMode);
  const clippingEnabled = useViewerStore((state) => state.clippingEnabled);
  const clippingAxis = useViewerStore((state) => state.clippingAxis);
  const clippingOffset = useViewerStore((state) => state.clippingOffset);
  const clippingInverted = useViewerStore((state) => state.clippingInverted);
  const preset = lighting[lightingPreset];

  return (
    <>
      <ClippingController enabled={clippingEnabled} axis={clippingAxis} offset={clippingOffset} inverted={clippingInverted} />
      <color attach="background" args={[preset.bg]} />
      <fog attach="fog" args={[preset.bg, 9, 26]} />
      <PerspectiveCamera makeDefault position={[4.4, 2.8, 5.4]} fov={38} />
      <CameraRig />
      <ambientLight intensity={0.18} />
      <directionalLight position={[4, 6, 5]} intensity={preset.intensity} color={preset.key} castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[-4, 2.2, -3]} intensity={55} color={preset.rim} distance={9} />
      <Environment preset={preset.env as never} background={false} environmentIntensity={1.15} />

      <EditableStage editMode={editMode}>
        {selectedVisible ? (
          importedObject ? <ImportedModel key={selectedAssetId} source={importedObject} mode={renderMode} heavyModel={heavyModel} /> : <Showpiece mode={renderMode} />
        ) : (
          <group />
        )}
      </EditableStage>

      <ReflectiveFloor preset={lightingPreset} />
      {!heavyModel && (
        <>
          <AccumulativeShadows temporal frames={64} alphaTest={0.78} scale={9} position={[0, -1.28, 0]} color={preset.rim} opacity={0.48}>
            <RandomizedLight amount={8} radius={5} ambient={0.3} intensity={1.4} position={[4, 5, 3]} bias={0.001} />
          </AccumulativeShadows>
          <ContactShadows position={[0, -1.22, 0]} opacity={0.42} scale={8} blur={2.8} far={4} />
        </>
      )}
      <gridHelper args={[12, 24, '#2e5669', '#121a22']} position={[0, -1.25, 0]} />
      {clippingEnabled && selectedDiagnostics ? <ClippingGuide diagnostics={selectedDiagnostics} axis={clippingAxis} offset={clippingOffset} inverted={clippingInverted} /> : null}
      {measurementsVisible && selectedDiagnostics ? <MeasurementOverlay diagnostics={selectedDiagnostics} unitSystem={unitSystem} /> : null}
      {measurementsVisible && measurementPoints.length > 0 ? <PointMeasurementOverlay points={measurementPoints} unitSystem={unitSystem} /> : null}
      <Sparkles count={qualityMode === 'eco' ? 24 : 72} scale={8} size={1.2} speed={0.18} color={preset.rim} opacity={0.36} />
      <PostFX qualityMode={qualityMode} renderMode={renderMode} heavyModel={heavyModel} />
    </>
  );
}

function ClippingController({ enabled, axis, offset, inverted }: { enabled: boolean; axis: ClippingAxis; offset: number; inverted: boolean }) {
  const { gl } = useThree();

  useEffect(() => {
    const baseNormal = axis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : axis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    const normal = inverted ? baseNormal.multiplyScalar(-1) : baseNormal;
    const planePoint = axis === 'x'
      ? new THREE.Vector3(offset, 0, 0)
      : axis === 'y'
        ? new THREE.Vector3(0, offset, 0)
        : new THREE.Vector3(0, 0, offset);
    const plane = new THREE.Plane(normal, -normal.dot(planePoint));

    gl.clippingPlanes = enabled ? [plane] : [];
    gl.localClippingEnabled = enabled;

    return () => {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
    };
  }, [axis, enabled, gl, inverted, offset]);

  return null;
}

const unitFactors = {
  model: 1,
  mm: 1000,
  cm: 100,
  m: 1,
  in: 39.3701
} as const;

function MeasurementOverlay({ diagnostics, unitSystem }: { diagnostics: AssetDiagnostics; unitSystem: UnitSystem }) {
  const min = diagnostics.boundsMin;
  const max = diagnostics.boundsMax;
  const size = diagnostics.boundsSize;
  const labelOffset = 0.18;
  const y = min[1] - 0.08;
  const format = (value: number) => `${(value * unitFactors[unitSystem]).toFixed(unitSystem === 'model' ? 2 : 1)} ${unitSystem}`;

  return (
    <group>
      <Line points={[[min[0], y, max[2] + labelOffset], [max[0], y, max[2] + labelOffset]]} color="#72f7ff" lineWidth={1.4} transparent opacity={0.82} />
      <Line points={[[max[0] + labelOffset, y, min[2]], [max[0] + labelOffset, y, max[2]]]} color="#ffd166" lineWidth={1.4} transparent opacity={0.82} />
      <Line points={[[min[0] - labelOffset, min[1], min[2]], [min[0] - labelOffset, max[1], min[2]]]} color="#a7ff83" lineWidth={1.4} transparent opacity={0.82} />
      <DimensionLabel position={[(min[0] + max[0]) / 2, y + 0.08, max[2] + labelOffset]} color="#72f7ff" text={`W ${format(size[0])}`} />
      <DimensionLabel position={[max[0] + labelOffset, y + 0.08, (min[2] + max[2]) / 2]} color="#ffd166" text={`D ${format(size[2])}`} />
      <DimensionLabel position={[min[0] - labelOffset, (min[1] + max[1]) / 2, min[2]]} color="#a7ff83" text={`H ${format(size[1])}`} />
    </group>
  );
}

function ClippingGuide({ diagnostics, axis, offset, inverted }: { diagnostics: AssetDiagnostics; axis: ClippingAxis; offset: number; inverted: boolean }) {
  const center = diagnostics.boundsCenter;
  const size = Math.max(...diagnostics.boundsSize, 0.8) * 1.35;
  const normalOffset = inverted ? -0.006 : 0.006;
  const position: [number, number, number] = axis === 'x'
    ? [offset + normalOffset, center[1], center[2]]
    : axis === 'y'
      ? [center[0], offset + normalOffset, center[2]]
      : [center[0], center[1], offset + normalOffset];
  const rotation: [number, number, number] = axis === 'x'
    ? [0, Math.PI / 2, 0]
    : axis === 'y'
      ? [Math.PI / 2, 0, 0]
      : [0, 0, 0];
  const axisLabel = axis.toUpperCase();

  return (
    <group>
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color="#72f7ff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Line
        points={[
          axis === 'x' ? [offset, center[1] - size / 2, center[2] - size / 2] : axis === 'y' ? [center[0] - size / 2, offset, center[2] - size / 2] : [center[0] - size / 2, center[1] - size / 2, offset],
          axis === 'x' ? [offset, center[1] + size / 2, center[2] + size / 2] : axis === 'y' ? [center[0] + size / 2, offset, center[2] + size / 2] : [center[0] + size / 2, center[1] + size / 2, offset]
        ]}
        color="#72f7ff"
        lineWidth={1.2}
        transparent
        opacity={0.72}
      />
      <DimensionLabel position={[position[0], position[1] + size * 0.52, position[2]]} color="#72f7ff" text={`${axisLabel} slice ${offset.toFixed(2)}`} />
    </group>
  );
}

function DimensionLabel({ position, color, text }: { position: [number, number, number]; color: string; text: string }) {
  return (
    <Text position={position} fontSize={0.08} color={color} anchorX="center" anchorY="middle" outlineColor="#030306" outlineWidth={0.012}>
      {text}
    </Text>
  );
}

function EditableStage({ editMode, children }: { editMode: boolean; children: ReactElement }) {
  const group = useRef<THREE.Group | null>(null);
  const turntable = useViewerStore((state) => state.turntable);
  const selectedAssetId = useViewerStore((state) => state.selectedAssetId);
  const transform = useViewerStore((state) => (state.selectedAssetId ? state.objectTransforms[state.selectedAssetId] : undefined));
  const diagnostics = useViewerStore((state) => (state.selectedAssetId ? state.assetDiagnostics[state.selectedAssetId] : undefined));
  const selectedLocked = useViewerStore((state) => (state.selectedAssetId ? state.assetLocks[state.selectedAssetId] : false));
  const pointMeasurementMode = useViewerStore((state) => state.pointMeasurementMode);
  const addMeasurementPoint = useViewerStore((state) => state.addMeasurementPoint);
  const setTransformDragging = useViewerStore((state) => state.setTransformDragging);

  useEffect(() => {
    if (!editMode) setTransformDragging(false);
    return () => setTransformDragging(false);
  }, [editMode, setTransformDragging]);

  useFrame((_, delta) => {
    if (group.current && turntable && !editMode) group.current.rotation.y += delta * 0.28;
  });

  const stageObject = (
    <group
      key={selectedAssetId ?? 'unselected'}
      ref={group}
      position={transform?.position ?? [0, 0, 0]}
      rotation={transform?.rotation ?? [0, 0, 0]}
      scale={transform?.scale ?? 1}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (!pointMeasurementMode) return;
        event.stopPropagation();
        addMeasurementPoint(event.point.toArray() as [number, number, number]);
      }}
    >
      {children}
      {editMode && diagnostics ? <SelectionFrame diagnostics={diagnostics} locked={Boolean(selectedLocked)} /> : null}
    </group>
  );

  if (editMode || pointMeasurementMode || selectedLocked) return stageObject;

  return (
    <Float speed={1.15} rotationIntensity={0.12} floatIntensity={0.18}>
      {stageObject}
    </Float>
  );
}

function SelectionFrame({ diagnostics, locked }: { diagnostics: AssetDiagnostics; locked: boolean }) {
  const size: [number, number, number] = [
    Math.max(0.001, diagnostics.boundsSize[0]),
    Math.max(0.001, diagnostics.boundsSize[1]),
    Math.max(0.001, diagnostics.boundsSize[2])
  ];

  return (
    <mesh position={diagnostics.boundsCenter} raycast={() => null}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={locked ? '#ffd166' : '#72f7ff'} wireframe transparent opacity={0.32} depthTest={false} />
    </mesh>
  );
}

function PointMeasurementOverlay({ points, unitSystem }: { points: [number, number, number][]; unitSystem: UnitSystem }) {
  const format = (value: number) => `${(value * unitFactors[unitSystem]).toFixed(unitSystem === 'model' ? 3 : 2)} ${unitSystem}`;
  const distance = points.length === 2 ? Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]) : null;
  const midpoint: [number, number, number] | null = points.length === 2
    ? [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2 + 0.12, (points[0][2] + points[1][2]) / 2]
    : null;

  return (
    <group>
      {points.map((point, index) => (
        <mesh key={`${point.join('-')}-${index}`} position={point}>
          <sphereGeometry args={[0.045, 18, 18]} />
          <meshBasicMaterial color={index === 0 ? '#72f7ff' : '#ffd166'} depthTest={false} />
        </mesh>
      ))}
      {points.length === 2 ? <Line points={points} color="#ffffff" lineWidth={1.8} transparent opacity={0.9} /> : null}
      {distance !== null && midpoint ? <DimensionLabel position={midpoint} color="#ffffff" text={format(distance)} /> : null}
    </group>
  );
}

function ImportedModel({ source, mode, heavyModel }: { source: THREE.Object3D; mode: RenderMode; heavyModel: boolean }) {
  const materialControls = useViewerStore((state) => (state.selectedAssetId ? state.assetMaterials[state.selectedAssetId] : undefined));
  const materialProps = modeMaterials[mode];
  const object = useMemo(() => {
    const cloned = source.clone(true);
    const overrideMaterial = createEditedMaterial(materialProps, materialControls ?? defaultMaterialControls);

    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = !heavyModel;
      child.receiveShadow = !heavyModel;

      child.material = overrideMaterial.clone();
    });

    return cloned;
  }, [source, materialProps, materialControls, heavyModel]);

  return (
    <group>
      <primitive object={object} />
      {mode === 'technical' && <ImportedWireOverlay source={source} />}
      {mode === 'holographic' && <HolographicRings />}
    </group>
  );
}

function ImportedWireOverlay({ source }: { source: THREE.Object3D }) {
  const wireObject = useMemo(() => {
    const cloned = source.clone(true);
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = new THREE.MeshBasicMaterial({ color: '#6ef7ff', wireframe: true, transparent: true, opacity: 0.32 });
    });
    return cloned;
  }, [source]);

  return <primitive object={wireObject} />;
}

function Showpiece({ mode }: { mode: RenderMode }) {
  const materialControls = useViewerStore((state) => (state.selectedAssetId ? state.assetMaterials[state.selectedAssetId] : undefined));
  const materialProps = modeMaterials[mode];
  const material = useMemo(() => createEditedMaterial(materialProps, materialControls ?? defaultMaterialControls), [materialProps, materialControls]);

  return (
    <group position={[0, 0, 0]}>
      <mesh castShadow receiveShadow material={material}>
        <torusKnotGeometry args={[0.95, 0.25, 220, 28, 2, 3]} />
      </mesh>
      <mesh castShadow receiveShadow material={material} scale={[1.95, 0.16, 1.95]} position={[0, -0.74, 0]}>
        <cylinderGeometry args={[1, 1, 1, 96]} />
      </mesh>
      <mesh castShadow material={material} position={[0, 0, 0]}>
        <icosahedronGeometry args={[1.42, 2]} />
      </mesh>
      {mode === 'technical' && <TopologyOverlay />}
      {mode === 'neon' && <NeonShell />}
      {mode === 'holographic' && <HolographicRings />}
    </group>
  );
}

const defaultMaterialControls: MaterialControls = {
  color: '#d8dee9',
  metalness: 0.72,
  roughness: 0.23,
  opacity: 1
};

function createEditedMaterial(materialProps: THREE.MeshStandardMaterialParameters, controls: MaterialControls) {
  return new THREE.MeshStandardMaterial({
    ...materialProps,
    color: controls.color,
    metalness: controls.metalness,
    roughness: controls.roughness,
    opacity: controls.opacity,
    transparent: controls.opacity < 1 || Boolean(materialProps.transparent),
    depthWrite: controls.opacity >= 0.65
  });
}

function TopologyOverlay() {
  return (
    <group>
      <mesh>
        <torusKnotGeometry args={[0.955, 0.252, 96, 12, 2, 3]} />
        <meshBasicMaterial color="#6ef7ff" wireframe transparent opacity={0.42} />
      </mesh>
      <mesh scale={[1.96, 0.18, 1.96]} position={[0, -0.74, 0]}>
        <cylinderGeometry args={[1, 1, 1, 48]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function NeonShell() {
  return (
    <mesh scale={1.018}>
      <torusKnotGeometry args={[0.95, 0.25, 160, 18, 2, 3]} />
      <meshBasicMaterial color="#41f4ff" wireframe transparent opacity={0.38} />
    </mesh>
  );
}

function HolographicRings() {
  return (
    <group>
      {[0, 1, 2].map((index) => (
        <mesh key={index} rotation={[Math.PI / 2, 0, (index * Math.PI) / 3]} scale={1.3 + index * 0.18}>
          <torusGeometry args={[1, 0.006, 8, 160]} />
          <meshBasicMaterial color={index === 1 ? '#8f7dff' : '#6ffff6'} transparent opacity={0.48} />
        </mesh>
      ))}
    </group>
  );
}

function ReflectiveFloor({ preset }: { preset: LightingPreset }) {
  const accent = lighting[preset].rim;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.31, 0]} receiveShadow>
      <planeGeometry args={[22, 22]} />
      <MeshReflectorMaterial
        blur={[420, 120]}
        resolution={1024}
        mixBlur={1.7}
        mixStrength={0.9}
        roughness={0.62}
        depthScale={0.55}
        minDepthThreshold={0.35}
        maxDepthThreshold={1.4}
        color="#07080b"
        metalness={0.42}
        mirror={0.34}
        reflectorOffset={0.02}
      />
      <pointLight position={[0, 0.1, 0]} intensity={8} color={accent} distance={6} />
    </mesh>
  );
}

function CameraRig() {
  const precisionMode = useViewerStore((state) => state.precisionMode);
  const transformDragging = useViewerStore((state) => state.transformDragging);
  const selectedAssetId = useViewerStore((state) => state.selectedAssetId);
  const cameraFitRequest = useViewerStore((state) => state.cameraFitRequest);
  const diagnostics = useViewerStore((state) => (state.selectedAssetId ? state.assetDiagnostics[state.selectedAssetId] : undefined));
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!diagnostics || !(camera instanceof THREE.PerspectiveCamera)) return;

    const center = new THREE.Vector3(...diagnostics.boundsCenter);
    const radius = Math.max(diagnostics.radius, 0.5);
    const distance = Math.max(3.2, radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.35);
    const direction = new THREE.Vector3(1.15, 0.72, 1.25).normalize();

    camera.position.copy(center).add(direction.multiplyScalar(distance));
    camera.near = Math.max(0.01, distance / 200);
    camera.far = Math.max(100, distance * 12);
    camera.updateProjectionMatrix();

    if (controls.current) {
      controls.current.target.copy(center);
      controls.current.update();
    }
  }, [camera, cameraFitRequest, diagnostics, selectedAssetId]);

  useFrame(() => {
    camera.updateProjectionMatrix();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!transformDragging}
      enableDamping
      dampingFactor={precisionMode ? 0.06 : 0.085}
      rotateSpeed={precisionMode ? 0.38 : 0.58}
      zoomSpeed={precisionMode ? 0.48 : 0.72}
      panSpeed={0.42}
      minDistance={2.2}
      maxDistance={12}
      target={[0, -0.05, 0]}
    />
  );
}

function PostFX({ qualityMode, renderMode, heavyModel }: { qualityMode: QualityMode; renderMode: RenderMode; heavyModel: boolean }) {
  if (qualityMode === 'eco' || heavyModel) return null;

  return (
    <EffectComposer multisampling={qualityMode === 'ultra' ? 8 : 4} enableNormalPass>
      <SSAO samples={qualityMode === 'ultra' ? 24 : 12} radius={0.22} intensity={18} luminanceInfluence={0.55} />
      <Bloom intensity={renderMode === 'neon' ? 1.2 : 0.42} luminanceThreshold={0.18} luminanceSmoothing={0.62} mipmapBlur />
      <DepthOfField focusDistance={0.02} focalLength={0.034} bokehScale={qualityMode === 'balanced' ? 0.35 : 1.55} />
      <Noise opacity={0.025} />
      <Vignette eskil={false} offset={0.15} darkness={0.72} />
    </EffectComposer>
  );
}

function LoadingStage() {
  return (
    <Html center>
      <div className="loading-stage">Preparing cinematic stage</div>
    </Html>
  );
}
