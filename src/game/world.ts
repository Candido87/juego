import { mulberry32, valueNoise } from './rng';
import { Ore, Tile } from './types';

export const MAX_HEIGHT = 2;

export interface World {
  w: number;
  h: number;
  /** Altura por casilla (0..MAX_HEIGHT). */
  height: Uint8Array;
  /** Tipo de mena por casilla (Ore). */
  ore: Uint8Array;
}

export const inBounds = (world: World, x: number, y: number) =>
  x >= 0 && y >= 0 && x < world.w && y < world.h;

export const heightAt = (world: World, x: number, y: number) =>
  inBounds(world, x, y) ? world.height[y * world.w + x] : 0;

export const oreAt = (world: World, x: number, y: number): Ore =>
  (inBounds(world, x, y) ? world.ore[y * world.w + x] : Ore.None) as Ore;

export function createFlatWorld(w: number, h: number): World {
  return { w, h, height: new Uint8Array(w * h), ore: new Uint8Array(w * h) };
}

/** Esquina superior del núcleo (2x2) en el centro del mapa. */
export function coreOrigin(world: World): Tile {
  return { x: Math.floor(world.w / 2) - 1, y: Math.floor(world.h / 2) - 1 };
}

export function spawnPoints(world: World): Tile[] {
  const mx = Math.floor(world.w / 2);
  const my = Math.floor(world.h / 2);
  return [
    { x: 0, y: my },
    { x: mx, y: 0 },
    { x: world.w - 1, y: my },
    { x: mx, y: world.h - 1 },
  ];
}

/** Limita el desnivel entre vecinas a 1 bajando las casillas demasiado altas. */
export function smoothHeights(world: World): void {
  const { w, h, height } = world;
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (!inBounds(world, nx, ny)) continue;
          const n = height[ny * w + nx];
          if (height[i] > n + 1) {
            height[i] = n + 1;
            changed = true;
          }
        }
      }
    }
  }
}

/** Altura interpolada (bilineal entre centros de casilla) para entidades en movimiento. */
export function heightAtPoint(world: World, fx: number, fy: number): number {
  const u = Math.min(Math.max(fx - 0.5, 0), world.w - 1);
  const v = Math.min(Math.max(fy - 0.5, 0), world.h - 1);
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, world.w - 1);
  const y1 = Math.min(y0 + 1, world.h - 1);
  const tx = u - x0;
  const ty = v - y0;
  const a = heightAt(world, x0, y0) * (1 - tx) + heightAt(world, x1, y0) * tx;
  const b = heightAt(world, x0, y1) * (1 - tx) + heightAt(world, x1, y1) * tx;
  return a * (1 - ty) + b * ty;
}

export function generateWorld(seed: number, w: number, h: number): World {
  const rng = mulberry32(seed);
  const hNoise = valueNoise(rng);
  const oreA = valueNoise(rng);
  const oreB = valueNoise(rng);
  const world = createFlatWorld(w, h);
  const c = coreOrigin(world);
  // Distancia de Chebyshev al centro del núcleo 2x2.
  const cheb = (x: number, y: number) => Math.max(Math.abs(x - c.x - 0.5), Math.abs(y - c.y - 0.5));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hNoise(x / 9, y / 9) * 0.65 + hNoise(x / 4 + 37, y / 4 + 11) * 0.35;
      let z = n < 0.45 ? 0 : n < 0.6 ? 1 : 2;
      if (cheb(x, y) < 4) z = 0;
      world.height[y * w + x] = z;
    }
  }
  smoothHeights(world);

  const oreC = valueNoise(rng);
  const oreD = valueNoise(rng);
  const forest = valueNoise(rng);
  const oil = valueNoise(rng);
  // Después del resto de ruidos: así las menas anteriores no cambian con la misma semilla.
  const sulfur = valueNoise(rng);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cheb(x, y) < 5) continue;
      const i = y * w + x;
      if (oreA(x / 4, y / 4) > 0.8) world.ore[i] = Ore.Iron;
      else if (oreB(x / 4 + 5, y / 4 + 9) > 0.82) world.ore[i] = Ore.Copper;
      else if (oreC(x / 4 + 13, y / 4 + 2) > 0.83) world.ore[i] = Ore.Coal;
      else if (oreD(x / 4 + 21, y / 4 + 17) > 0.83) world.ore[i] = Ore.Stone;
      else if (oil(x / 5 + 41, y / 5 + 7) > 0.86) world.ore[i] = Ore.Oil;
      else if (sulfur(x / 4 + 53, y / 4 + 3) > 0.83) world.ore[i] = Ore.Sulfur;
      else if (forest(x / 6 + 3, y / 6 + 29) > 0.74) world.ore[i] = Ore.Wood;
    }
  }
  // Parcelas garantizadas cerca del núcleo para que el arranque sea siempre jugable.
  const patch = (px: number, py: number, ore: Ore) => {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        if (inBounds(world, px + dx, py + dy)) world.ore[(py + dy) * w + px + dx] = ore;
  };
  patch(c.x - 6, c.y, Ore.Iron);
  patch(c.x + 7, c.y + 3, Ore.Copper);
  patch(c.x + 2, c.y - 7, Ore.Coal);
  patch(c.x - 3, c.y + 7, Ore.Stone);
  patch(c.x - 7, c.y - 5, Ore.Wood);
  patch(c.x + 6, c.y - 5, Ore.Oil);
  patch(c.x + 7, c.y - 2, Ore.Sulfur);
  for (const s of spawnPoints(world)) world.ore[s.y * w + s.x] = Ore.None;
  return world;
}
