/**
 * Motor de conexiones común a cintas y tuberías (lógica pura). Es la **única fuente de verdad** de qué pieza va en cada casilla:
 *  1. `pipeConnections` dice con qué lados se une una tubería usando la **misma regla que la lógica de redes** (`tuberias.ts`), así que
 *     lo que se dibuja unido es lo que realmente está unido;
 *  2. `planFor` convierte una máscara de lados abiertos (4 bits: bit d = dirección d, 0:+x 1:+y 2:-x 3:-y) en pieza y giro, con una tabla
 *     de 16 entradas calculada una sola vez. Las cintas (`beltPiece`) y las tuberías (la vista 3D) la usan por igual.
 */
import { portsAt } from './conectar';
import type { Building, Game } from './game';
import { DX, DY, Dir, opposite } from './types';

export type PieceId = 'isolated' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';

export interface PiecePlan {
  piece: PieceId;
  /** Cuartos de vuelta (0..3) que llevan la forma canónica a esta máscara: lado d canónico → (d + k) mod 4. */
  k: number;
  /** Lados abiertos (por orden de dirección). */
  open: Dir[];
}

/** Lados abiertos de cada pieza con giro 0. */
const CANON: Record<PieceId, number[]> = {
  isolated: [],
  end: [0],
  straight: [0, 2],
  corner: [0, 1],
  tee: [0, 1, 2],
  cross: [0, 1, 2, 3],
};

const norm = (d: number) => ((d % 4) + 4) % 4;
export const maskOf = (dirs: Iterable<number>): number => {
  let m = 0;
  for (const d of dirs) m |= 1 << norm(d);
  return m;
};
export const dirsOf = (mask: number): Dir[] => ([0, 1, 2, 3] as Dir[]).filter((d) => mask & (1 << d));
const rotMask = (mask: number, k: number): number => {
  let out = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) out |= 1 << norm(d + k);
  return out;
};

/** Tabla única: máscara (0..15) → pieza y giro (el menor k que lo consigue). */
export const PIECE_TABLE: readonly PiecePlan[] = (() => {
  const table: PiecePlan[] = [];
  for (let mask = 0; mask < 16; mask++) {
    let found: PiecePlan | null = null;
    for (const piece of Object.keys(CANON) as PieceId[]) {
      const canon = maskOf(CANON[piece]);
      for (let k = 0; k < 4 && !found; k++) if (rotMask(canon, k) === mask) found = { piece, k, open: dirsOf(mask) };
      if (found) break;
    }
    table.push(found!);
  }
  return table;
})();

/** Pieza y giro de una máscara de lados abiertos. */
export const planFor = (mask: number): PiecePlan => PIECE_TABLE[mask & 15];

// ---------------------------------------------------------------- tuberías

export interface PipeConn {
  /** Lados con unión (otra tubería o puerto de líquido compatible). */
  mask: number;
  /** De ellos, los que dan a una máquina (puerto): llevan conector físico. */
  machines: number;
}

/**
 * Con qué se une la tubería `b`, con la regla de la lógica de redes: con la que tiene **delante** y con las **que apuntan a ella**;
 * y con una máquina por el lado de un puerto de líquido compatible (un puerto de salida admite cualquier tubería salvo la que mira hacia
 * él; uno de entrada sólo la que apunta a él). Es simétrica: si A se une con B por un lado, B se une con A por el opuesto.
 */
export function pipeConnections(g: Game, b: Building): PipeConn {
  let mask = 0;
  let machines = 0;
  for (let d = 0; d < 4; d++) {
    const n = g.buildingAt(b.x + DX[d], b.y + DY[d]);
    if (n && n.kind === 'pipeline' && (d === b.dir || n.dir === opposite(d as Dir))) mask |= 1 << d;
  }
  for (const { owner, port } of portsAt(g, b.x, b.y)) {
    if (port.medium !== 'liquid') continue;
    const ok = port.io === 'out' ? b.dir !== opposite(port.dir) : port.dir === b.dir;
    if (!ok) continue;
    for (let d = 0; d < 4; d++) {
      if (owner.x === b.x + DX[d] && owner.y === b.y + DY[d]) {
        mask |= 1 << d;
        machines |= 1 << d;
      }
    }
  }
  return { mask, machines };
}
