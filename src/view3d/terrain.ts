/** Terreno 3D: losas, bloques y rampas del Nature Kit, árboles, rocas y menas, instanciado y troceado en chunks. */
import * as THREE from 'three';
import { Ore, Tile } from '../game/types';
import { DecorKind, generateDecor, tintNoise, zoneWeights } from '../view/decor';
import { World, heightAt, inBounds } from '../game/world';
import { TERRAIN } from './catalog';
import { instanced } from './loader';
import { GROUND_TINT, ORE_COLOR, zoneMultiplier } from './palette';
import { LEVEL_H } from './pick';
import { GROUND_OFFSET, slopeLower } from './relieve';
import { aspectF } from './aspectos';

/** Factor del registro de aspectos de un modelo de árbol (por el nombre del modelo). */
const aF = (model: string): number => aspectF(model.replace('nature/', ''));

/** Giro (rad, eje Y) de la rampa para que baje hacia cada dirección 0:+x 1:+z 2:-x 3:-z. El modelo baja hacia -z con giro 0 (comprobado en sus vértices). */
export const SLOPE_YAW = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];


export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface Terrain {
  group: THREE.Group;
  /** Esconde (escala 0) la decoración de una casilla cuando se construye encima. */
  hideDecor(x: number, y: number): void;
  /** Opacidad (1 = sólido) de la decoración con transparencia por tramado (árboles) de una casilla; no hace nada si no hay. */
  setFade(x: number, y: number, fade: number): void;
  /** Casillas con árboles. */
  treeTiles(): [number, number][];
  stats: { tiles: number; chunks: number; instancedMeshes: number; decor: number };
}

interface Chunk {
  flat: THREE.Matrix4[];
  blocks: THREE.Matrix4[];
  slopes: THREE.Matrix4[];
  flatC: THREE.Color[];
  blocksC: THREE.Color[];
  slopesC: THREE.Color[];
  decor: Map<string, { mats: THREE.Matrix4[]; colors: THREE.Color[]; keys: string[] }>;
}

/**
 * `chunk` = lado (en casillas) de cada trozo. Cada trozo es un conjunto de InstancedMesh con su propia
 * esfera de visión, así que Three descarta los que quedan fuera de la cámara. 0 = un solo trozo.
 */
/** Modelos 3D de cada tipo de decoración de `decor.ts` (se elige uno por casilla) y su escala. */
const DECOR_MODELS: Record<DecorKind, { models: readonly string[]; scale: number; jitter: number }> = {
  tree: { models: [TERRAIN.trees[0], TERRAIN.trees[1]], scale: 1, jitter: 0.3 },
  trees: { models: [TERRAIN.trees[3]], scale: 1.15, jitter: 0.2 },
  pine: { models: [TERRAIN.trees[2]], scale: 0.95, jitter: 0.3 },
  pineLarge: { models: [TERRAIN.trees[4]], scale: 1.25, jitter: 0.2 },
  rock: { models: [TERRAIN.rocks[0], TERRAIN.rocks[1]], scale: 0.8, jitter: 0.3 },
  rockDirt: { models: [TERRAIN.rocks[2], TERRAIN.rocks[3]], scale: 0.75, jitter: 0.3 },
  bush: { models: [TERRAIN.small[0]], scale: 1.2, jitter: 0.4 },
  flower: { models: TERRAIN.small.slice(1), scale: 1.2, jitter: 0.4 },
};

/**
 * `spawns` = casillas de aparición de enemigos: ni ellas ni el pasillo hasta el núcleo llevan decoración (reglas de `decor.ts`).
 */
/** Añade a una malla instanciada la opacidad por instancia (`aFade`), dibujada con tramado: sin mezcla, sin ordenar y sin coste extra. */
function addFade(im: THREE.InstancedMesh): void {
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(im.count).fill(1), 1);
  im.geometry = im.geometry.clone();
  im.geometry.setAttribute('aFade', fade);
  const base = im.material as THREE.Material;
  const mat = base.clone();
  const prev = base.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('void main() {', `attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;`);
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `varying float vFade;
void main() {
  if (vFade < 0.999 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > vFade) discard;`,
    );
  };
  mat.customProgramCacheKey = () => 'hole-fade';
  im.material = mat;
  im.userData.fade = fade;
}

export function buildTerrain(world: World, coreTile: { x: number; y: number }, seed = 1, chunk = 16, spawns: Tile[] = []): Terrain {
  const zone = tintNoise(seed);
  const decor = new Map<number, { kind: DecorKind; rot: number }>();
  for (const d of generateDecor(world, seed, coreTile, spawns)) decor.set(d.y * world.w + d.x, d);
  const size = chunk > 0 ? chunk : Math.max(world.w, world.h);
  const chunks = new Map<number, Chunk>();
  const chunkAt = (x: number, y: number): Chunk => {
    const k = Math.floor(y / size) * 100000 + Math.floor(x / size);
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { flat: [], blocks: [], slopes: [], flatC: [], blocksC: [], slopesC: [], decor: new Map() }));
    return c;
  };
  const place = (px: number, py: number, pz: number, yaw = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const c = chunkAt(x, y);
      const add = (model: string, key: string, m: THREE.Matrix4, color?: number) => {
        let d = c.decor.get(model);
        if (!d) c.decor.set(model, (d = { mats: [], colors: [], keys: [] }));
        d.mats.push(m);
        d.colors.push(new THREE.Color(color ?? 0xffffff));
        d.keys.push(key);
      };
      const h = heightAt(world, x, y);
      const cx = x + 0.5;
      const cz = y + 0.5;
      // Tinte del suelo: con recurso, el color de su yacimiento; sin él, la zona (hierba, arena o tierra seca, roca) con
      // transición continua. Una variación suave por casilla evita el plano liso.
      const oreHere = world.ore[y * world.w + x];
      const tint = new THREE.Color(GROUND_TINT[oreHere] ?? 0xffffff);
      if (oreHere === Ore.None) {
        const zw = zoneWeights(zone(x * 0.07, y * 0.07));
        const [mr, mg, mb] = zoneMultiplier(zw.dry, zw.rock);
        tint.setRGB(mr, mg, mb);
      }
      tint.multiplyScalar(0.93 + hash2(x, y, seed + 90) * 0.07);
      // Los modelos de terreno arrancan en y = -GROUND_OFFSET: se suben para que la superficie quede en nivel × LEVEL_H.
      if (h <= 0) (c.flat.push(place(cx, GROUND_OFFSET, cz)), c.flatC.push(tint));
      else {
        const lower = slopeLower(world, x, y);
        if (lower !== null) (c.slopes.push(place(cx, GROUND_OFFSET * LEVEL_H, cz, SLOPE_YAW[lower], 1, LEVEL_H, 1)), c.slopesC.push(tint));
        else (c.blocks.push(place(cx, GROUND_OFFSET * h * LEVEL_H, cz, 0, 1, h * LEVEL_H, 1)), c.blocksC.push(tint));
      }
      const o = world.ore[y * world.w + x];
      const key = `${x},${y}`;
      const top = h * LEVEL_H;
      if (o === Ore.Wood) {
        const r = hash2(x, y, seed);
        const model = TERRAIN.trees[Math.floor(r * TERRAIN.trees.length)];
        const s = (0.85 + hash2(y, x, seed + 1) * 0.5) * aF(model);
        add(model, key, place(cx + (hash2(x, y, 5) - 0.5) * 0.3, top + GROUND_OFFSET * s, cz + (hash2(x, y, 6) - 0.5) * 0.3, hash2(x, y, 7) * 6.28, s, s, s));
      } else if (o !== Ore.None) {
        for (let k = 0; k < 2; k++) {
          const s = 0.7 + hash2(x, y, 10 + k) * 0.5;
          add(TERRAIN.oreRock, key, place(cx + (hash2(x, y, 20 + k) - 0.5) * 0.7, top + GROUND_OFFSET * s, cz + (hash2(x, y, 30 + k) - 0.5) * 0.7, hash2(x, y, 40 + k) * 6.28, s, s, s), ORE_COLOR[o]);
        }
      } else {
        // Decoración con las reglas de la 2D: determinista por semilla, nunca sobre menas, junto al núcleo, en las
        // apariciones ni en el pasillo aparición → núcleo. No bloquea: se esconde al construir encima.
        const d = decor.get(y * world.w + x);
        if (d) {
          const spec = DECOR_MODELS[d.kind];
          const model = spec.models[Math.floor(hash2(x, y, seed + 3) * spec.models.length)];
          const s = spec.scale * (0.85 + hash2(y, x, seed + 4) * 0.3) * aF(model);
          add(model, key, place(cx + (hash2(x, y, 5) - 0.5) * spec.jitter, top + GROUND_OFFSET * s, cz + (hash2(x, y, 6) - 0.5) * spec.jitter, d.rot * (Math.PI / 2) + hash2(x, y, 7) * 0.6, s, s, s));
        }
      }
    }
  }

  const group = new THREE.Group();
  let meshes = 0;
  let decorCount = 0;
  const index = new Map<string, { g: THREE.Group; i: number }[]>();
  const addGroup = (g: THREE.Group) => {
    meshes += g.children.length;
    for (const im of g.children) (im as THREE.InstancedMesh).computeBoundingSphere();
    group.add(g);
  };
  for (const c of chunks.values()) {
    addGroup(instanced(TERRAIN.flat, c.flat, c.flatC, 'grass', true));
    addGroup(instanced(TERRAIN.block, c.blocks, c.blocksC, 'grass', true));
    addGroup(instanced(TERRAIN.slope, c.slopes, c.slopesC, 'grass', true));
    for (const [model, d] of c.decor) {
      const g = instanced(model, d.mats, d.colors);
      if ((TERRAIN.trees as readonly string[]).includes(model)) for (const im of g.children) addFade(im as THREE.InstancedMesh);
      addGroup(g);
      decorCount += d.mats.length;
      d.keys.forEach((k, i) => {
        let l = index.get(k);
        if (!l) index.set(k, (l = []));
        l.push({ g, i });
      });
    }
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    stats: { tiles: world.w * world.h, chunks: chunks.size, instancedMeshes: meshes, decor: decorCount },
    setFade(x, y, fade) {
      for (const { g, i } of index.get(`${x},${y}`) ?? []) {
        for (const c of g.children) {
          const a = c.userData.fade as THREE.InstancedBufferAttribute | undefined;
          if (!a || a.getX(i) === fade) continue;
          a.setX(i, fade);
          a.needsUpdate = true;
        }
      }
    },
    treeTiles() {
      const out: [number, number][] = [];
      for (const [k, l] of index) if (l.some(({ g }) => g.children.some((c) => c.userData.fade))) out.push(k.split(',').map(Number) as [number, number]);
      return out;
    },
    hideDecor(x, y) {
      for (const { g, i } of index.get(`${x},${y}`) ?? []) {
        for (const c of g.children) {
          const im = c as THREE.InstancedMesh;
          im.setMatrixAt(i, zero);
          im.instanceMatrix.needsUpdate = true;
        }
      }
      index.delete(`${x},${y}`);
    },
  };
}
