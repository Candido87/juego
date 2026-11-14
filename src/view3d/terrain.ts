/** Terreno 3D: losas, bloques y rampas del Nature Kit, árboles, rocas y menas, todo instanciado. */
import * as THREE from 'three';
import { Ore } from '../game/types';
import { World, heightAt, inBounds } from '../game/world';
import { TERRAIN } from './catalog';
import { instanced } from './loader';
import { LEVEL_H } from './pick';

/** Giro (rad, eje Y) de la rampa para que baje hacia cada dirección 0:+x 1:+z 2:-x 3:-z. El modelo baja hacia -z con giro 0 (comprobado en sus vértices). */
export const SLOPE_YAW = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export const ORE_COLOR: Record<number, number> = {
  [Ore.Iron]: 0x9db4d6,
  [Ore.Copper]: 0xe0894a,
  [Ore.Coal]: 0x3a3a44,
  [Ore.Stone]: 0xd9d4c4,
  [Ore.Wood]: 0x6fbf5a,
  [Ore.Oil]: 0x22222c,
  [Ore.Sulfur]: 0xf0e04a,
};

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
  stats: { tiles: number; instancedMeshes: number; decor: number };
}

export function buildTerrain(world: World, coreTile: { x: number; y: number }, seed = 1): Terrain {
  const flat: THREE.Matrix4[] = [];
  const blocks: THREE.Matrix4[] = [];
  const slopes: THREE.Matrix4[] = [];
  const decor = new Map<string, { mats: THREE.Matrix4[]; colors: THREE.Color[]; keys: string[] }>();
  const add = (model: string, key: string, m: THREE.Matrix4, color?: number) => {
    let d = decor.get(model);
    if (!d) decor.set(model, (d = { mats: [], colors: [], keys: [] }));
    d.mats.push(m);
    d.colors.push(new THREE.Color(color ?? 0xffffff));
    d.keys.push(key);
  };
  const place = (px: number, py: number, pz: number, yaw = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const h = heightAt(world, x, y);
      const cx = x + 0.5;
      const cz = y + 0.5;
      if (h <= 0) flat.push(place(cx, 0, cz));
      else {
        // Rampa: una sola vecina más baja y las demás iguales o más altas.
        let lower = -1;
        let lowerCount = 0;
        let okOthers = true;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (!inBounds(world, nx, ny)) continue;
          const nh = heightAt(world, nx, ny);
          if (nh === h - 1) {
            lower = d;
            lowerCount++;
          } else if (nh < h) okOthers = false;
        }
        if (lowerCount === 1 && okOthers && h === 1) slopes.push(place(cx, 0, cz, SLOPE_YAW[lower], 1, LEVEL_H, 1));
        else blocks.push(place(cx, 0, cz, 0, 1, h * LEVEL_H, 1));
      }
      const o = world.ore[y * world.w + x];
      const key = `${x},${y}`;
      const top = h * LEVEL_H;
      if (o === Ore.Wood) {
        const r = hash2(x, y, seed);
        const model = TERRAIN.trees[Math.floor(r * TERRAIN.trees.length)];
        const s = 0.85 + hash2(y, x, seed + 1) * 0.5;
        add(model, key, place(cx + (hash2(x, y, 5) - 0.5) * 0.3, top, cz + (hash2(x, y, 6) - 0.5) * 0.3, hash2(x, y, 7) * 6.28, s, s, s));
      } else if (o !== Ore.None) {
        for (let k = 0; k < 2; k++) {
          const s = 0.7 + hash2(x, y, 10 + k) * 0.5;
          add(TERRAIN.oreRock, key, place(cx + (hash2(x, y, 20 + k) - 0.5) * 0.7, top, cz + (hash2(x, y, 30 + k) - 0.5) * 0.7, hash2(x, y, 40 + k) * 6.28, s, s, s), ORE_COLOR[o]);
        }
      } else if (Math.hypot(x - coreTile.x, y - coreTile.y) > 5) {
        const r = hash2(x, y, seed + 50);
        if (r < 0.06) add(TERRAIN.small[Math.floor(hash2(x, y, 3) * TERRAIN.small.length)], key, place(cx, top, cz, hash2(x, y, 4) * 6.28, 1.2, 1.2, 1.2));
        else if (r < 0.085) add(TERRAIN.rocks[Math.floor(hash2(x, y, 8) * TERRAIN.rocks.length)], key, place(cx, top, cz, hash2(x, y, 9) * 6.28, 0.8, 0.8, 0.8));
      }
    }
  }

  const group = new THREE.Group();
  let meshes = 0;
  const addGroup = (g: THREE.Group) => {
    meshes += g.children.length;
    group.add(g);
  };
  addGroup(instanced(TERRAIN.flat, flat));
  addGroup(instanced(TERRAIN.block, blocks));
  addGroup(instanced(TERRAIN.slope, slopes));
  const index = new Map<string, { g: THREE.Group; i: number }[]>();
  let decorCount = 0;
  for (const [model, d] of decor) {
    const g = instanced(model, d.mats, d.colors);
    addGroup(g);
    decorCount += d.mats.length;
    d.keys.forEach((k, i) => {
      let l = index.get(k);
      if (!l) index.set(k, (l = []));
      l.push({ g, i });
    });
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    stats: { tiles: world.w * world.h, instancedMeshes: meshes, decor: decorCount },
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
