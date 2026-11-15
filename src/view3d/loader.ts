/** Carga y cache de modelos .glb, clonado (con esqueleto) e instanciado de mallas repetidas. */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ModelId } from './catalog';

const loader = new GLTFLoader();
const cache = new Map<ModelId, GLTF>();
export const BASE_URL = `${import.meta.env.BASE_URL}assets/3d/`;

export async function preload(ids: ModelId[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      if (!cache.has(id)) cache.set(id, await loader.loadAsync(`${BASE_URL}${id}.glb`));
      onProgress?.(++done, ids.length);
    }),
  );
}

export function gltf(id: ModelId): GLTF {
  const g = cache.get(id);
  if (!g) throw new Error(`Modelo sin precargar: ${id}`);
  return g;
}

export function animations(id: ModelId): THREE.AnimationClip[] {
  return gltf(id).animations;
}

export function bounds(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

/** Clona un modelo, lo escala para que su lado horizontal máximo sea `fit` y lo apoya en y=0 centrado. */
export function instance(id: ModelId, fit?: number, scaleMul = 1): THREE.Group {
  const root = SkeletonUtils.clone(gltf(id).scene);
  const wrap = new THREE.Group();
  wrap.add(root);
  if (fit) {
    const b = bounds(root);
    const s = fit / Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 0.001);
    root.scale.setScalar(s * scaleMul);
  } else root.scale.setScalar(scaleMul);
  const b2 = bounds(wrap);
  root.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  return wrap;
}

const tintCache = new Map<string, THREE.Material>();
/** Multiplica el color de los materiales; las copias teñidas se comparten (misma pieza + mismo color = mismo material), lo que permite agrupar. */
export function tint(obj: THREE.Object3D, color: number): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const out = mats.map((mt) => {
      const key = `${mt.uuid}|${color}`;
      let c = tintCache.get(key);
      if (!c) {
        c = (mt as THREE.MeshStandardMaterial).clone();
        (c as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(color));
        tintCache.set(key, c);
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? out : out[0];
  });
}

/**
 * Instancia un modelo muchas veces con un solo InstancedMesh por malla del modelo.
 * `mats` son las matrices de cada instancia (en espacio de mundo); `colors` opcional.
 */
export function instanced(id: ModelId, mats: THREE.Matrix4[], colors?: THREE.Color[]): THREE.Group {
  const out = new THREE.Group();
  if (!mats.length) return out;
  const scene = gltf(id).scene;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, mats.length);
    const local = m.matrixWorld;
    const tmp = new THREE.Matrix4();
    mats.forEach((mat, i) => {
      im.setMatrixAt(i, tmp.multiplyMatrices(mat, local));
      if (colors) im.setColorAt(i, colors[i]);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    out.add(im);
  });
  return out;
}
