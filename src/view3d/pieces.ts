/**
 * Qué pieza y qué giro corresponde a cada combinación de conexiones (cintas, tuberías, muros). Lógica pura, con tests.
 *
 * Direcciones del juego: 0:+x 1:+z(+y del juego) 2:-x 3:-z. Un giro Y de Three de k cuartos de vuelta (+90° cada uno)
 * lleva la dirección d del modelo a (d − k) mod 4.
 */
import type { Dir } from '../game/types';

/** Lados abiertos de cada modelo de cinta con giro 0 (medidos en los vértices de los .glb: los lados con borde alto están cerrados). */
export const BELT_MODELS = {
  straight: { model: 'factory/conveyor', open: [0, 2] },
  corner: { model: 'factory/conveyor-corner', open: [1, 2] },
  tee: { model: 'factory/conveyor-junction-t', open: [0, 1, 2] },
  cross: { model: 'factory/conveyor-cross', open: [0, 1, 2, 3] },
} as const;

const norm = (d: number) => ((d % 4) + 4) % 4;
export const maskOf = (dirs: Iterable<number>): number => {
  let m = 0;
  for (const d of dirs) m |= 1 << norm(d);
  return m;
};
export const dirsOf = (mask: number): Dir[] => ([0, 1, 2, 3] as Dir[]).filter((d) => mask & (1 << d));

/** Cuartos de vuelta k (0..3) para que los lados abiertos del modelo coincidan con los deseados, o null si no encaja. */
export function orient(modelOpen: readonly number[], want: Iterable<number>): number | null {
  const target = maskOf(want);
  for (let k = 0; k < 4; k++) if (maskOf(modelOpen.map((d) => d - k)) === target) return k;
  return null;
}

/** Ángulo (rad) del giro Y para k cuartos de vuelta. */
export const quarterYaw = (k: number) => (k * Math.PI) / 2;

/** Giro Y que lleva el eje +x del modelo a la dirección d (para piezas que "apuntan"). */
export const yawToDir = (d: number) => -(norm(d) * Math.PI) / 2;

export interface Placed {
  model: string;
  /** Cuartos de vuelta. */
  k: number;
  piece: 'straight' | 'corner' | 'tee' | 'cross';
}

/**
 * Pieza de una cinta que sale hacia `dir` y recibe de las direcciones `incoming` (vecinas cuya cinta apunta a ésta).
 * Sin entradas o sólo por detrás: recta. Una entrada lateral: curva. Detrás + un lado, o los dos lados: empalme en T. Todo: cruce.
 */
export function beltPiece(dir: Dir, incoming: Iterable<number>): Placed {
  const open = new Set<number>([dir]);
  for (const d of incoming) if (norm(d) !== dir) open.add(norm(d));
  if (open.size === 1) open.add(norm(dir + 2));
  const n = open.size;
  const piece = n === 4 ? 'cross' : n === 3 ? 'tee' : open.has(norm(dir + 2)) ? 'straight' : 'corner';
  const def = BELT_MODELS[piece];
  return { model: def.model, k: orient(def.open, open) ?? 0, piece };
}

export interface Arms {
  /** Direcciones con brazo (medio tramo desde el centro hasta el borde). */
  arms: Dir[];
  /** Hay pieza central (poste o codo): cuando no es un tramo recto simple. */
  hub: boolean;
  /** Tramo recto completo: eje 0 (x) o 1 (z); null si se compone con brazos. */
  straightAxis: 0 | 1 | null;
}

/**
 * Tuberías y muros se componen con brazos: sin vecinos o con uno, un tramo recto (en el eje del vecino o en `fallbackAxis`);
 * dos opuestos, tramo recto; cualquier otra combinación (esquina, T, cruz), brazos + pieza central.
 * Los muros piden siempre pieza central en los extremos y aislados (`hubOnEnds`), para que se vea el poste.
 */
export function armsFor(mask: number, fallbackAxis: 0 | 1 = 0, hubOnEnds = false): Arms {
  const dirs = dirsOf(mask);
  if (dirs.length === 0) return { arms: [], hub: hubOnEnds, straightAxis: hubOnEnds ? null : fallbackAxis };
  if (dirs.length === 1) return hubOnEnds ? { arms: dirs, hub: true, straightAxis: null } : { arms: [], hub: false, straightAxis: (dirs[0] % 2) as 0 | 1 };
  if (dirs.length === 2 && norm(dirs[0] + 2) === dirs[1]) return { arms: [], hub: false, straightAxis: (dirs[0] % 2) as 0 | 1 };
  return { arms: dirs, hub: true, straightAxis: null };
}
