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

/** Forma con la que se dibuja cada objeto sobre una cinta (el color lo da el objeto). */
export type ItemShape = 'lump' | 'log' | 'slab' | 'disc' | 'shell' | 'crate';
export const ITEM_SHAPES: ItemShape[] = ['lump', 'log', 'slab', 'disc', 'shell', 'crate'];
const SHAPE_OF: Record<string, ItemShape> = {
  iron_ore: 'lump', copper_ore: 'lump', coal: 'lump', stone: 'lump', sulfur: 'lump',
  wood: 'log', pipe: 'log',
  iron_plate: 'slab', copper_plate: 'slab', brick: 'slab', wall_plate: 'slab', circuit: 'slab', frame: 'slab',
  gear: 'disc', wire: 'disc',
  ammo: 'shell', battery: 'shell', gun_part: 'shell', science_1: 'shell', science_2: 'shell',
};
/** Menas en terrón, madera en tronco, placas en losa, engranajes en disco, munición y pilas en cilindro; el resto en caja. */
export function itemShape(item: string): ItemShape {
  return SHAPE_OF[item] ?? 'crate';
}

/** Un tramo de la capa animada de una cinta: desplazamiento del centro de la casilla, sentido del flujo y si es medio tramo. */
export interface FlowQuad {
  dx: number;
  dz: number;
  /** Sentido en que fluye el material (0:+x 1:+z 2:-x 3:-z). */
  flow: Dir;
  /** Medio tramo (del borde al centro o del centro al borde) en vez de la casilla entera. */
  half: boolean;
}

/**
 * Tramos de la textura de dirección de una cinta que sale hacia `dir` y recibe de las direcciones `incoming` (vecinas que la alimentan).
 * Recta (sin entradas o sólo por detrás): un tramo entero. Con entradas laterales (curva, T, cruce): medio tramo por cada
 * entrada, yendo del borde al centro, y medio tramo del centro a la salida: así la textura sigue el recorrido del material.
 */
export function beltFlowQuads(dir: Dir, incoming: Iterable<number>): FlowQuad[] {
  const back = norm(dir + 2);
  const ins = [...new Set([...incoming].map(norm))].filter((d) => d !== dir);
  if (ins.every((d) => d === back)) return [{ dx: 0, dz: 0, flow: dir, half: false }];
  const out: FlowQuad[] = ins.map((d) => ({ dx: HALF_DX[d] * 0.25, dz: HALF_DZ[d] * 0.25, flow: norm(d + 2) as Dir, half: true }));
  out.push({ dx: HALF_DX[dir] * 0.25, dz: HALF_DZ[dir] * 0.25, flow: dir, half: true });
  return out;
}
const HALF_DX = [1, 0, -1, 0];
const HALF_DZ = [0, 1, 0, -1];

/**
 * Lados de una cinta donde va un conector físico (placa de brida) porque allí hay un edificio y no otra cinta:
 * delante si la salida da a un edificio, detrás si hay un edificio y ninguna cinta entra por ese lado.
 */
export function beltConnectors(dir: Dir, incoming: Iterable<number>, frontBuilding: boolean, backBuilding: boolean): Dir[] {
  const back = norm(dir + 2) as Dir;
  const out: Dir[] = [];
  if (frontBuilding) out.push(dir);
  if (backBuilding && ![...incoming].some((d) => norm(d) === back)) out.push(back);
  return out;
}

/**
 * Posición y giro de un objeto que va por una cinta, respecto al centro de la casilla (en unidades de casilla).
 * `progress` 0..1 es el avance real del juego: 0 en el borde de entrada, 1 en el de salida. En una recta el objeto va en línea;
 * en una curva (entrada lateral y nada por detrás) recorre una curva suave del borde de entrada al de salida. Con varias
 * entradas laterales el juego no dice por cuál llegó: se usa la primera. `yaw` es el giro Y que lleva el eje x del objeto a la tangente.
 */
export function beltItemPose(dir: Dir, incoming: Iterable<number>, progress: number): { x: number; z: number; yaw: number } {
  const p = Math.min(1, Math.max(0, progress));
  const back = norm(dir + 2);
  const ins = [...new Set([...incoming].map(norm))].filter((d) => d !== dir);
  const side = ins.length === 0 || ins.includes(back) ? back : ins[0];
  // Entrada = borde de la casilla por donde llega (en la dirección `side`), salida = borde de delante, control = centro.
  const ex = HALF_DX[side] * 0.5;
  const ez = HALF_DZ[side] * 0.5;
  const sx = HALF_DX[dir] * 0.5;
  const sz = HALF_DZ[dir] * 0.5;
  const a = (1 - p) * (1 - p);
  const b = p * p;
  const x = a * ex + b * sx;
  const z = a * ez + b * sz;
  // Derivada de la curva: 2(1-p)(0-E) + 2p(S-0).
  const tx = -2 * (1 - p) * ex + 2 * p * sx;
  const tz = -2 * (1 - p) * ez + 2 * p * sz;
  return { x, z, yaw: Math.atan2(-tz, tx) };
}
