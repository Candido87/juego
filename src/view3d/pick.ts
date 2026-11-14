/** Selección de casilla con relieve: avanza un rayo hasta chocar con la columna de una casilla. */
import type { Vec3 } from './camera';

/** Altura en unidades de mundo de cada nivel del juego. */
export const LEVEL_H = 0.5;

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
