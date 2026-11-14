/**
 * Murallas con sprites de Sketch Town (CC0, Kenney): qué pieza y qué giro corresponde a cada combinación de vecinos
 * y a cada estado de daño. Sin dependencias de Phaser, para poder probarlo.
 *
 * Vecinos en la cuadrícula: N = (0,-1), E = (+1,0), S = (0,+1), W = (-1,0).
 * Piezas: `single` (aislado), `end` (un vecino), `straight` (dos opuestos), `corner` (dos contiguos), `junction` (tres o cuatro).
 */
import type { WallKind } from '../game/types';

export const WALL_KINDS: WallKind[] = ['wall_wood', 'wall_stone', 'wall_metal'];
export const isWallKind = (k: string): k is WallKind => (WALL_KINDS as string[]).includes(k);

export const NB = { N: 1, E: 2, S: 4, W: 8 } as const;
export const NB_DELTAS: [number, number, number][] = [
  [0, -1, NB.N],
  [1, 0, NB.E],
  [0, 1, NB.S],
  [-1, 0, NB.W],
];

export type WallPiece = 'single' | 'end' | 'straight' | 'corner' | 'junction';

/** Máscara de vecinos a partir de una función "¿hay muro en (dx,dy)?". */
export function wallMask(has: (dx: number, dy: number) => boolean): number {
  let m = 0;
  for (const [dx, dy, bit] of NB_DELTAS) if (has(dx, dy)) m |= bit;
  return m;
}

/** `rot` (0-3): hacia dónde mira el extremo (N,E,S,W), qué esquina es (NE,ES,SW,WN) o el eje del tramo (0 = N-S, 1 = E-O). */
export function wallPiece(mask: number): { piece: WallPiece; rot: number } {
  const bits = [NB.N, NB.E, NB.S, NB.W];
  const n = bits.filter((b) => mask & b).length;
  if (n === 0) return { piece: 'single', rot: 0 };
  if (n === 1) return { piece: 'end', rot: bits.findIndex((b) => mask & b) };
  if (n === 2) {
    if ((mask & NB.N && mask & NB.S) || (mask & NB.E && mask & NB.W)) return { piece: 'straight', rot: mask & NB.N ? 0 : 1 };
    // Esquina: NE = 0, ES = 1, SW = 2, WN = 3.
    const i = bits.findIndex((b, k) => mask & b && mask & bits[(k + 1) % 4]);
    return { piece: 'corner', rot: i };
  }
  return { piece: 'junction', rot: 0 };
}

/** Estado de daño: 0 intacto, 1 dañado, 2 casi roto. */
export type WallDamage = 0 | 1 | 2;
export function wallDamage(hp: number, maxHp: number): WallDamage {
  const f = maxHp > 0 ? hp / maxHp : 1;
  return f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
}

export type SketchPack = 'base' | 'exp';
export interface WallLayer {
  pack: SketchPack;
  name: string;
  /** Letra del PNG (N/E/S/W) para cada `rot` 0..3 de la pieza. */
  rots: [string, string, string, string];
}

/** Familias de piezas: castillo de piedra (piedra y metal, teñido distinto) y valla de madera. */
const CASTLE = {
  single: [{ pack: 'base', name: 'castle_bend', rots: ['S', 'S', 'S', 'S'] }],
  end: [{ pack: 'exp', name: 'castle_end', rots: ['N', 'E', 'S', 'W'] }],
  straight: [{ pack: 'base', name: 'castle_wall', rots: ['N', 'E', 'N', 'E'] }],
  corner: [{ pack: 'base', name: 'castle_corner', rots: ['N', 'E', 'S', 'W'] }],
  junction: [{ pack: 'base', name: 'castle_tower', rots: ['N', 'N', 'N', 'N'] }],
} satisfies Record<WallPiece, WallLayer[]>;

const FENCE = {
  single: [{ pack: 'exp', name: 'fence_woodEnd', rots: ['N', 'N', 'N', 'N'] }],
  end: [{ pack: 'exp', name: 'fence_woodEnd', rots: ['N', 'E', 'S', 'W'] }],
  straight: [{ pack: 'exp', name: 'fence_wood', rots: ['N', 'E', 'N', 'E'] }],
  corner: [{ pack: 'exp', name: 'fence_woodCorner', rots: ['N', 'E', 'S', 'W'] }],
  junction: [
    { pack: 'exp', name: 'fence_wood', rots: ['N', 'N', 'N', 'N'] },
    { pack: 'exp', name: 'fence_wood', rots: ['E', 'E', 'E', 'E'] },
  ],
} satisfies Record<WallPiece, WallLayer[]>;

export const WALL_FAMILY: Record<WallKind, Record<WallPiece, WallLayer[]>> = {
  wall_wood: FENCE,
  wall_stone: CASTLE,
  wall_metal: CASTLE,
};

/** Colores de teñido por material y daño (se mezclan encima del sprite). */
export const WALL_TINT: Record<WallKind, { color: string; alpha: number }> = {
  wall_wood: { color: '#7a4a22', alpha: 0.3 },
  wall_stone: { color: '#c9b48a', alpha: 0.3 },
  wall_metal: { color: '#2d4f7a', alpha: 0.4 },
};

/** Piezas necesarias para cargar (todas las familias, sin repetir), como [paquete, nombre, letra]. */
export function wallAssetList(): [SketchPack, string, string][] {
  const seen = new Set<string>();
  const out: [SketchPack, string, string][] = [];
  for (const fam of Object.values(WALL_FAMILY))
    for (const layers of Object.values(fam))
      for (const l of layers)
        for (const r of l.rots) {
          const k = `${l.name}_${r}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push([l.pack, l.name, r]);
        }
  return out;
}

export const wallAssetKey = (name: string, rot: string) => `sk_${name}_${rot}`;
export const wallAssetUrl = (pack: SketchPack, name: string, rot: string) =>
  `assets/${pack === 'base' ? 'sketch-town' : 'sketch-town-expansion'}/Tiles/${name}_${rot}.png`;
export const wallKey = (kind: WallKind, mask: number, dmg: WallDamage) => `${kind}_m${mask}_d${dmg}`;
