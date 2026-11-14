/**
 * Decoración procedural del mapa (sólo visual, no toca la lógica): árboles, rocas, arbustos y flores en posiciones
 * deterministas según la semilla del mapa, y teñido del terreno por zonas (hierba, tierra seca, roca, arena).
 * Regla de jugabilidad (la más simple): la decoración NO bloquea ni se tala; se oculta donde hay un edificio.
 * Nunca se coloca sobre menas, junto al núcleo, en las casillas de aparición ni sobre la línea recta aparición → núcleo.
 */
import { mulberry32, valueNoise } from '../game/rng';
import { Ore, Tile } from '../game/types';
import type { World } from '../game/world';

export type DecorKind = 'tree' | 'trees' | 'pine' | 'pineLarge' | 'rock' | 'rockDirt' | 'bush' | 'flower';
export interface Decor {
  x: number;
  y: number;
  kind: DecorKind;
  /** Giro del PNG (índice 0-3 → N,E,S,W) para dar variedad. */
  rot: number;
  /** Objeto alto que puede tapar el cursor, el fantasma o un enemigo. */
  tall: boolean;
}

export const DECOR = {
  /** Radio (casillas, Chebyshev) alrededor del centro del núcleo sin decoración. */
  coreClear: 5,
  /** Distancia a la línea aparición→núcleo sin decoración. */
  pathClear: 2,
  spawnClear: 3,
  forestThreshold: 0.56,
  treeChance: 0.32,
  scatterTree: 0.012,
  rockChance: 0.025,
  bushChance: 0.04,
  flowerChance: 0.05,
};

const TALL = new Set<DecorKind>(['tree', 'trees', 'pine', 'pineLarge']);

function distToSegment(px: number, py: number, a: Tile, b: Tile): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** ¿Se puede poner decoración en la casilla? (sin mena, fuera del pasillo y del entorno del núcleo y de las apariciones). */
export function decorFree(world: World, x: number, y: number, core: Tile, spawns: Tile[]): boolean {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  if (world.ore[y * world.w + x] !== Ore.None) return false;
  const cx = core.x + 1;
  const cy = core.y + 1;
  if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= DECOR.coreClear) return false;
  for (const s of spawns) {
    if (Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= DECOR.spawnClear) return false;
    if (distToSegment(x, y, s, { x: cx, y: cy }) <= DECOR.pathClear) return false;
  }
  return true;
}

export function generateDecor(world: World, seed: number, core: Tile, spawns: Tile[]): Decor[] {
  const rng = mulberry32((seed ^ 0x5eed1e) >>> 0);
  const forest = valueNoise(mulberry32((seed ^ 0xf0e57) >>> 0));
  const out: Decor[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const r = rng();
      const r2 = rng();
      const r3 = rng();
      if (!decorFree(world, x, y, core, spawns)) continue;
      const f = forest(x * 0.11, y * 0.11);
      let kind: DecorKind | null = null;
      if (f > DECOR.forestThreshold && r < DECOR.treeChance) kind = r2 < 0.45 ? 'tree' : r2 < 0.65 ? 'trees' : r2 < 0.9 ? 'pine' : 'pineLarge';
      else if (r < DECOR.scatterTree) kind = r2 < 0.6 ? 'tree' : 'pine';
      else if (r < DECOR.scatterTree + DECOR.rockChance) kind = r2 < 0.7 ? 'rock' : 'rockDirt';
      else if (r < DECOR.scatterTree + DECOR.rockChance + DECOR.bushChance) kind = 'bush';
      else if (r < DECOR.scatterTree + DECOR.rockChance + DECOR.bushChance + DECOR.flowerChance) kind = 'flower';
      if (kind) out.push({ x, y, kind, rot: Math.floor(r3 * 4), tall: TALL.has(kind) });
    }
  }
  return out;
}

/** Colores de teñido (se multiplican con la hierba): tierra seca, hierba normal, roca grisácea. */
const ZONES: [number, number][] = [
  [0.0, 0xffd89a],
  [0.32, 0xffffff],
  [0.7, 0xffffff],
  [0.85, 0xc9cfd8],
];
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** Teñido continuo del terreno (las transiciones entre zonas son graduales). Las menas no se tiñen. */
export function terrainTint(noise: (x: number, y: number) => number, x: number, y: number): number {
  const n = noise(x * 0.07, y * 0.07);
  for (let i = 1; i < ZONES.length; i++) {
    if (n <= ZONES[i][0]) {
      const [n0, c0] = ZONES[i - 1];
      const [n1, c1] = ZONES[i];
      const t = (n - n0) / (n1 - n0);
      return (lerp((c0 >> 16) & 255, (c1 >> 16) & 255, t) << 16) | (lerp((c0 >> 8) & 255, (c1 >> 8) & 255, t) << 8) | lerp(c0 & 255, c1 & 255, t);
    }
  }
  return ZONES[ZONES.length - 1][1];
}

export const tintNoise = (seed: number) => valueNoise(mulberry32((seed ^ 0x7177) >>> 0));

/** Imágenes de Sketch Town que usa la decoración: [paquete, nombre]. Cada una en sus 4 giros. */
export const DECOR_SPRITES: Partial<Record<DecorKind, ['base' | 'exp', string]>> = {
  tree: ['base', 'tree_single'],
  trees: ['base', 'tree_multiple'],
  pine: ['exp', 'tree_pine'],
  pineLarge: ['exp', 'tree_pineLarge'],
  rock: ['base', 'rocks_grass'],
  rockDirt: ['base', 'rocks_dirt'],
};
export const decorSpriteKey = (kind: DecorKind, rot: number) => `dec_${kind}_${'NESW'[rot]}`;
