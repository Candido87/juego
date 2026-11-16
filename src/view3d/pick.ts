/** Selección de casilla con relieve: avanza un rayo hasta chocar con la columna de una casilla. */
import { CONFIG } from '../game/config';
import type { Vec3 } from './camera';

/** Altura en unidades de mundo de cada nivel del juego (`CONFIG.scale.levelH`). */
export const LEVEL_H = CONFIG.scale.levelH;

export interface PickWorld {
  w: number;
  h: number;
  /** Nivel (0..MAX_HEIGHT) de la casilla. */
  levelAt(x: number, y: number): number;
}

/**
 * Devuelve la casilla (x, y del juego) donde el rayo `origin + t·dir` entra primero en una
 * columna (suelo hasta su altura), o null si sale del mapa sin tocar nada.
 */
export function pickTile3D(origin: Vec3, dir: Vec3, world: PickWorld, maxT = 400, step = 0.05): { x: number; y: number } | null {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const dx = dir.x / len;
  const dy = dir.y / len;
  const dz = dir.z / len;
  for (let t = 0; t <= maxT; t += step) {
    const px = origin.x + dx * t;
    const py = origin.y + dy * t;
    const pz = origin.z + dz * t;
    if (py < -1) return null;
    const tx = Math.floor(px);
    const ty = Math.floor(pz);
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue;
    if (py <= world.levelAt(tx, ty) * LEVEL_H + 1e-6) return { x: tx, y: ty };
  }
  return null;
}

export interface Box {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Caja más cercana que corta el rayo (método de las losas), o null. Sirve para elegir un edificio por su cuerpo visible. */
export function pickBox(origin: Vec3, dir: Vec3, boxes: Iterable<Box>): number | null {
  let best: number | null = null;
  let bestT = Infinity;
  for (const b of boxes) {
    let t0 = -Infinity;
    let t1 = Infinity;
    let hit = true;
    for (const [o, d, lo, hi] of [
      [origin.x, dir.x, b.minX, b.maxX],
      [origin.y, dir.y, b.minY, b.maxY],
      [origin.z, dir.z, b.minZ, b.maxZ],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) hit = false;
        continue;
      }
      const a = (lo - o) / d;
      const c = (hi - o) / d;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
    }
    if (hit && t0 <= t1 && t1 >= 0 && t0 < bestT) {
      bestT = t0;
      best = b.id;
    }
  }
  return best;
}
