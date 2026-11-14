/** Direcciones en la cuadrícula: 0:+x, 1:+y, 2:-x, 3:-y. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const rotateCW = (d: Dir): Dir => ((d + 1) % 4) as Dir;

export interface Tile {
  x: number;
  y: number;
}

export function dirBetween(a: Tile, b: Tile): Dir | null {
  for (let d = 0; d < 4; d++) {
    if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d as Dir;
  }
  return null;
}

/** Tipos de mena. 0 = sin mena. */
export const Ore = { None: 0, Iron: 1, Copper: 2 } as const;
export type Ore = (typeof Ore)[keyof typeof Ore];

export type BuildingKind = 'core' | 'drill' | 'belt' | 'tower';
export type BuildKind = Exclude<BuildingKind, 'core'>;
