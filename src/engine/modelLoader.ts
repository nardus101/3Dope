import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { detectFormat } from './importPipeline';
import type { AssetDiagnostics, ImportFormat } from '../types/viewer';

const MAX_PREVIEW_TRIANGLES = 350_000;
const HEAVY_MODEL_TRIANGLES = 180_000;
const FLOOR_Y = -1.2;
const ORIENTATION_SAMPLE_TRIANGLES = 80_000;

const uprightCandidates = [
  { label: 'native Y-up', rotation: new THREE.Euler(0, 0, 0) },
  { label: 'CAD Z-up', rotation: new THREE.Euler(-Math.PI / 2, 0, 0) },
  { label: 'inverted Z-up', rotation: new THREE.Euler(Math.PI / 2, 0, 0) },
  { label: 'X-up', rotation: new THREE.Euler(0, 0, Math.PI / 2) },
  { label: 'inverted X-up', rotation: new THREE.Euler(0, 0, -Math.PI / 2) }
];

export interface ParsedModel {
  object: THREE.Object3D;
  format: ImportFormat;
  diagnostics: AssetDiagnostics;
}

export async function loadModelFile(file: File): Promise<ParsedModel> {
  const format = detectFormat(file);
  let object: THREE.Object3D;

  if (format === 'stl') {
    const geometry = parseStlGeometry(await file.arrayBuffer(), file.name);
    object = meshFromGeometry(geometry, file.name);
  } else if (format === 'ply') {
    const geometry = new PLYLoader().parse(await file.arrayBuffer());
    assertRenderableGeometry(geometry, file.name);
    geometry.computeVertexNormals();
    object = meshFromGeometry(geometry, file.name);
  } else if (format === 'obj') {
    object = new OBJLoader().parse(await file.text());
    object.name = file.name;
  } else if (format === 'fbx') {
    object = new FBXLoader().parse(await file.arrayBuffer(), '');
    object.name = file.name;
  } else if (format === 'glb' || format === 'gltf') {
    object = await parseGltf(file);
  } else {
    throw new Error(`${format.toUpperCase()} preview needs a dedicated CAD conversion plugin before browser rendering.`);
  }

  prepareObject(object);
  autoOrientUpright(object);
  normalizeObject(object);

  return {
    object,
    format,
    diagnostics: inspectObject(object)
  };
}

function parseStlGeometry(buffer: ArrayBuffer, name: string) {
  const stlKind = classifyStl(buffer);

  if (stlKind === 'binary') {
    const geometry = parseBinaryStlPreview(buffer, name);
    geometry.computeVertexNormals();
    return geometry;
  }

  if (stlKind === 'invalid') {
    throw new Error(`${name} is not a valid STL file. It looks like a downloaded web page or unsupported text file, not mesh geometry.`);
  }

  try {
    const geometry = new STLLoader().parse(buffer);
    assertRenderableGeometry(geometry, name);
    const previewGeometry = limitGeometryForPreview(geometry);
    previewGeometry.computeVertexNormals();
    return previewGeometry;
  } catch (error) {
    try {
      const fallback = parseBinaryStlPreview(buffer, name);
      fallback.computeVertexNormals();
      return fallback;
    } catch {
      throw error instanceof Error ? error : new Error(`Unable to parse STL file "${name}".`);
    }
  }
}

function assertRenderableGeometry(geometry: THREE.BufferGeometry, name: string) {
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) {
    throw new Error(`${name} did not contain renderable triangle geometry.`);
  }

  const values = position.array;
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new Error(`${name} contains invalid vertex data at position ${index}.`);
    }
  }
}

function classifyStl(buffer: ArrayBuffer): 'ascii' | 'binary' | 'invalid' {
  if (buffer.byteLength < 15) return 'invalid';
  if (looksLikeAsciiStl(buffer)) return 'ascii';
  if (buffer.byteLength < 84) return 'invalid';

  const reader = new DataView(buffer);
  const storedFaces = reader.getUint32(80, true);
  const expectedBytes = 84 + storedFaces * 50;
  const payloadBytes = buffer.byteLength - 84;

  if (expectedBytes === buffer.byteLength) return 'binary';
  if (payloadBytes > 0 && payloadBytes % 50 === 0 && !looksLikeTextDocument(buffer)) return 'binary';
  return 'invalid';
}

function looksLikeAsciiStl(buffer: ArrayBuffer) {
  const sample = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2048));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample).trimStart().toLowerCase();
  return text.startsWith('solid') && !text.includes('\0') && (text.includes('facet') || text.includes('endsolid'));
}

function looksLikeTextDocument(buffer: ArrayBuffer) {
  const sample = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample).trimStart().toLowerCase();
  return (
    text.startsWith('<!doctype html') ||
    text.startsWith('<html') ||
    text.startsWith('<?xml') ||
    text.startsWith('{') ||
    text.startsWith('[')
  );
}

function parseBinaryStlPreview(buffer: ArrayBuffer, name: string) {
  if (buffer.byteLength < 84) {
    throw new Error(`${name} is too small to be a binary STL.`);
  }

  const payloadBytes = buffer.byteLength - 84;
  if (payloadBytes % 50 !== 0) {
    throw new Error(`${name} has an invalid binary STL byte length.`);
  }

  const totalFaces = payloadBytes / 50;
  if (totalFaces < 1) {
    throw new Error(`${name} did not contain binary STL triangles.`);
  }

  const reader = new DataView(buffer);
  const stride = Math.max(1, Math.ceil(totalFaces / MAX_PREVIEW_TRIANGLES));
  const previewFaces = Math.ceil(totalFaces / stride);
  const vertices = new Float32Array(previewFaces * 9);
  const normals = new Float32Array(previewFaces * 9);
  let writtenFaces = 0;

  for (let face = 0; face < totalFaces; face += stride) {
    const start = 84 + face * 50;
    const normal = [
      reader.getFloat32(start, true),
      reader.getFloat32(start + 4, true),
      reader.getFloat32(start + 8, true)
    ];
    const targetFace = writtenFaces * 9;
    let validFace = true;

    for (let vertex = 0; vertex < 3; vertex += 1) {
      const source = start + 12 + vertex * 12;
      const target = targetFace + vertex * 3;
      const x = reader.getFloat32(source, true);
      const y = reader.getFloat32(source + 4, true);
      const z = reader.getFloat32(source + 8, true);

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        validFace = false;
        break;
      }

      vertices[target] = x;
      vertices[target + 1] = y;
      vertices[target + 2] = z;
      normals[target] = normal[0];
      normals[target + 1] = normal[1];
      normals[target + 2] = normal[2];
    }

    if (validFace) writtenFaces += 1;
  }

  if (writtenFaces < 1) {
    throw new Error(`${name} did not contain valid binary STL triangles.`);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices.subarray(0, writtenFaces * 9), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals.subarray(0, writtenFaces * 9), 3));
  geometry.userData.sourceTriangleCount = totalFaces;
  geometry.userData.previewTriangleCount = writtenFaces;
  assertRenderableGeometry(geometry, name);
  return geometry;
}

function limitGeometryForPreview(geometry: THREE.BufferGeometry) {
  const sourceGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = sourceGeometry.getAttribute('position');
  const triangleCount = Math.floor(position.count / 3);

  if (triangleCount <= MAX_PREVIEW_TRIANGLES) return sourceGeometry;

  const normal = sourceGeometry.getAttribute('normal');
  const stride = Math.ceil(triangleCount / MAX_PREVIEW_TRIANGLES);
  const previewFaces = Math.ceil(triangleCount / stride);
  const vertices = new Float32Array(previewFaces * 9);
  const normals = normal ? new Float32Array(previewFaces * 9) : null;
  let writtenFaces = 0;

  for (let face = 0; face < triangleCount; face += stride) {
    const source = face * 9;
    const target = writtenFaces * 9;
    for (let component = 0; component < 9; component += 1) {
      vertices[target + component] = position.array[source + component];
      if (normal && normals) normals[target + component] = normal.array[source + component];
    }
    writtenFaces += 1;
  }

  const previewGeometry = new THREE.BufferGeometry();
  previewGeometry.setAttribute('position', new THREE.BufferAttribute(vertices.subarray(0, writtenFaces * 9), 3));
  if (normals) previewGeometry.setAttribute('normal', new THREE.BufferAttribute(normals.subarray(0, writtenFaces * 9), 3));
  previewGeometry.userData.sourceTriangleCount = triangleCount;
  previewGeometry.userData.previewTriangleCount = writtenFaces;
  return previewGeometry;
}

function meshFromGeometry(geometry: THREE.BufferGeometry, name: string) {
  const material = new THREE.MeshStandardMaterial({
    color: '#d8dee9',
    metalness: 0.58,
    roughness: 0.28
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

async function parseGltf(file: File) {
  const loader = new GLTFLoader();
  const arrayBuffer = await file.arrayBuffer();

  return new Promise<THREE.Object3D>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      '',
      (gltf) => {
        gltf.scene.name = file.name;
        resolve(gltf.scene);
      },
      (error) => reject(error instanceof Error ? error : new Error('Unable to parse GLTF asset.'))
    );
  });
}

function prepareObject(object: THREE.Object3D) {
  const heavyModel = countTriangles(object) > HEAVY_MODEL_TRIANGLES;

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.castShadow = !heavyModel;
    child.receiveShadow = !heavyModel;
    child.frustumCulled = true;

    if (child.geometry) {
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
      if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
    }

    if (!child.material) {
      child.material = new THREE.MeshStandardMaterial({ color: '#d8dee9', metalness: 0.55, roughness: 0.3 });
    }
  });
}

function autoOrientUpright(object: THREE.Object3D) {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);

  const scored = uprightCandidates.map((candidate) => ({
    ...candidate,
    score: scoreUprightCandidate(object, candidate.rotation)
  }));
  const nativeScore = scored[0].score;
  const best = scored.reduce((winner, candidate) => (candidate.score > winner.score ? candidate : winner), scored[0]);
  const strongEnough = best.score > Math.max(0.08, nativeScore * 1.18);

  if (best !== scored[0] && strongEnough) {
    object.rotation.copy(best.rotation);
    object.userData.orientationLabel = `Auto-upright: ${best.label}`;
  } else {
    object.userData.orientationLabel = 'Auto-upright: native floor';
  }

  object.updateMatrixWorld(true);
}

function scoreUprightCandidate(object: THREE.Object3D, rotation: THREE.Euler) {
  const candidateMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
  const triangle = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let downwardArea = 0;
  let totalArea = 0;

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const position = child.geometry.getAttribute('position');
    if (!position) return;

    const triangleCount = Math.floor(position.count / 3);
    const stride = Math.max(1, Math.ceil(triangleCount / ORIENTATION_SAMPLE_TRIANGLES));

    for (let face = 0; face < triangleCount; face += stride) {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        triangle[vertex].fromBufferAttribute(position, face * 3 + vertex);
        triangle[vertex].applyMatrix4(child.matrixWorld).applyMatrix4(candidateMatrix);
      }

      edgeA.subVectors(triangle[1], triangle[0]);
      edgeB.subVectors(triangle[2], triangle[0]);
      normal.crossVectors(edgeA, edgeB);
      const area = normal.length() * 0.5;
      if (!Number.isFinite(area) || area <= 0) continue;

      totalArea += area;
      normal.normalize();
      if (normal.y < -0.62) downwardArea += area * Math.abs(normal.y);
    }
  });

  return totalArea > 0 ? downwardArea / totalArea : 0;
}

function normalizeObject(object: THREE.Object3D) {
  object.position.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z);
  const scale = maxAxis > 0 ? 2.7 / maxAxis : 1;
  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  object.updateMatrixWorld(true);

  const normalizedBox = new THREE.Box3().setFromObject(object);
  object.position.y += FLOOR_Y - normalizedBox.min.y;
  object.updateMatrixWorld(true);
}

function countTriangles(object: THREE.Object3D) {
  let total = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const geometry = child.geometry;
    total += geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
  });
  return Math.round(total);
}

function countVertices(object: THREE.Object3D) {
  let total = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    total += child.geometry.getAttribute('position')?.count ?? 0;
  });
  return total;
}

function countMeshes(object: THREE.Object3D) {
  let total = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) total += 1;
  });
  return total;
}

function inspectObject(object: THREE.Object3D): AssetDiagnostics {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const sphere = new THREE.Sphere();

  box.getSize(size);
  box.getCenter(center);
  box.getBoundingSphere(sphere);

  return {
    meshCount: countMeshes(object),
    triangleCount: countTriangles(object),
    vertexCount: countVertices(object),
    boundsMin: box.min.toArray(),
    boundsMax: box.max.toArray(),
    boundsSize: size.toArray(),
    boundsCenter: center.toArray(),
    radius: Number.isFinite(sphere.radius) ? sphere.radius : 1
  };
}
