/**
 * Mapa de pruebas de tuberías (`?demo=tuberias`, Hito 0 del encargo de conexiones): todas las configuraciones en filas sobre un
 * mundo plano con un resalte para el desnivel. Cada caso lleva su id y las casillas que ocupa, para compararlo con lo que dibuja la vista.
 * La disposición es pura (sin Three) y la usa también el test que fija la tabla de conexiones esperada.
 */
import type { Game } from '../game/game';
import { ports } from '../game/puertos';
import { Ore, type Dir } from '../game/types';
import { createFlatWorld, type World } from '../game/world';

export interface PipeCase {
  id: string;
  label: string;
  /** Tuberías del caso (x, y, dirección): la central mira a su primer lado abierto y cada vecina apunta a la central, así todas quedan unidas. */
  pipes: [number, number, Dir][];
  /** Casilla cuya pieza se estudia y las direcciones (0:+x 1:+y 2:-x 3:-y) que debe tener abiertas. */
  probe: [number, number];
  open: Dir[];
}

const DV: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const at = (x: number, y: number, d: Dir): [number, number] => [x + DV[d][0], y + DV[d][1]];

/** Casos de pura geometría de tuberías (sin edificios). Separados 5 casillas en x y 6 en y. */
export function pipeCases(): PipeCase[] {
  const out: PipeCase[] = [];
  const add = (id: string, label: string, col: number, row: number, open: Dir[]): void => {
    const x = 5 + col * 5;
    const y = 4 + row * 5; // filas en y = 4, 9 y 14: lejos del núcleo (19-20)
    const pipes: [number, number, Dir][] = [[x, y, open[0] ?? 0], ...open.map((d): [number, number, Dir] => [...at(x, y, d), ((d + 2) % 4) as Dir])];
    out.push({ id, label, pipes, probe: [x, y], open });
  };
  // Fila 0: aislado, extremo (1 vecino, en los 4 sentidos).
  add('aislado', 'tramo aislado', 0, 0, []);
  ([0, 1, 2, 3] as Dir[]).forEach((d, i) => add(`extremo${d}`, `extremo con vecino hacia ${d}`, 1 + i, 0, [d]));
  // Fila 1: rectas y curvas.
  add('recta-h', 'recta horizontal', 0, 1, [0, 2]);
  add('recta-v', 'recta vertical', 1, 1, [1, 3]);
  ([[0, 1], [1, 2], [2, 3], [3, 0]] as Dir[][]).forEach((o, i) => add(`curva${o.join('')}`, `curva ${o.join('+')}`, 2 + i, 1, o));
  // Fila 2: uniones en T (falta un lado) y cruce.
  ([3, 0, 1, 2] as Dir[]).forEach((missing, i) => add(`t-sin${missing}`, `T sin lado ${missing}`, i, 2, ([0, 1, 2, 3] as Dir[]).filter((d) => d !== missing)));
  add('cruce', 'cruce', 4, 2, [0, 1, 2, 3]);
  return out;
}

/** Mundo del mapa de pruebas: 40×40 plano con un resalte de un nivel (para la subida/bajada) en x 30..37, y 30..37. */
export function tuberiasWorld(): World {
  const w = createFlatWorld(40, 40);
  // Terraza de un nivel (x 30..37, y 28..38), segunda terraza encima (x 34..37, y 35..38) y un hoyo (33,31) para el valle.
  for (let y = 28; y < 39; y++) for (let x = 30; x < 38; x++) w.height[y * 40 + x] = 1;
  for (let y = 35; y < 39; y++) for (let x = 34; x < 38; x++) w.height[y * 40 + x] = 2;
  w.height[31 * 40 + 33] = 0;
  w.ore[31 * 40 + 8] = Ore.Oil; // la bomba del caso de puertos necesita petróleo debajo
  return w;
}

/** Coloca en `game` todos los casos, las tuberías hacia los puertos de una bomba y de un generador, y las de desnivel. */
export function placeDemoTuberias(game: Game): { cases: PipeCase[]; notes: string[] } {
  const notes: string[] = [];
  const put = (kind: 'pipeline' | 'pump' | 'generator' | 'refinery', x: number, y: number, dir: Dir = 0) => {
    game.unlockedBuildings.add(kind);
    const b = game.place(kind, x, y, dir);
    if (b) game.completeBuilding(b);
    else notes.push(`no se pudo colocar ${kind} en ${x},${y}`);
    return b;
  };
  const cases = pipeCases();
  for (const c of cases) for (const [x, y, d] of c.pipes) put('pipeline', x, y, d);
  // Puertos (los edificios son 1×1): bomba, generador y refinería con una tubería en cada casilla de puerto de líquido y otra en un lado sin puerto.
  for (const [kind, x, y] of [['pump', 8, 31], ['generator', 16, 31], ['refinery', 22, 31]] as const) {
    const b = put(kind, x, y);
    if (!b) continue;
    const ps = ports(b.kind, b.x, b.y, b.dir).filter((p) => p.medium === 'liquid');
    for (const p of ps) put('pipeline', p.x, p.y);
    const noPort = ([0, 1, 2, 3] as Dir[]).map((d) => at(b.x, b.y, d)).find(([fx, fy]) => !ps.some((p) => p.x === fx && p.y === fy) && game.canPlace('pipeline', fx, fy).ok);
    if (noPort) put('pipeline', noPort[0], noPort[1]);
    notes.push(`${kind} en ${b.x},${b.y}: puertos de líquido ${ps.map((p) => `${p.io}@${p.x},${p.y}`).join(' | ') || 'ninguno'}; tubería sin puerto en ${noPort ? noPort.join(',') : '-'}`);
  }
  // Desniveles (terrazas de tuberiasWorld). Cada caso, con la pieza esperada en la casilla baja:
  const line = (y: number, x0: number, x1: number, oil = false) => {
    for (let x = x0; x <= x1; x++) {
      const b = put('pipeline', x, y, 0);
      if (b && oil) b.inv = { oil: 1 };
    }
  };
  line(29, 28, 31); // escalón recto (stepStraight) en (29,29)
  line(31, 32, 34); // valle (valleyStraight) en el hoyo (33,31)
  put('pipeline', 29, 32, 1); // giro con escalón (stepCorner) en (29,33): entra desde arriba y sube hacia +x
  put('pipeline', 29, 33, 0);
  put('pipeline', 30, 33, 0);
  line(36, 28, 36, true); // escalera de 2 niveles con petróleo (cristal): escalones en (29,36) y (33,36)
  line(38, 29, 30); // extremo que sube (stepEnd) en (29,38)
  // Esquina en llano con petróleo: codo del kit en versión de cristal.
  for (const [x, y, d] of [[24, 36, 0], [25, 36, 1], [25, 37, 1]] as const) {
    const b = put('pipeline', x, y, d);
    if (b) b.inv = { oil: 1 };
  }
  notes.push('desniveles: escalón recto (29,29), valle (33,31), giro con escalón (29,33), escalera con petróleo y=36, extremo que sube (29,38), codo de cristal (25,36)');

  return { cases, notes };
}
