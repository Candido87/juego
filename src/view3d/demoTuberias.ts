/**
 * Mapa de pruebas de tuberías (`?demo=tuberias`, Hito 0 del encargo de conexiones): todas las configuraciones en filas sobre un
 * mundo plano con un resalte para el desnivel. Cada caso lleva su id y las casillas que ocupa, para compararlo con lo que dibuja la vista.
 * La disposición es pura (sin Three) y la usa también el test que fija la tabla de conexiones esperada.
 */
import type { Game } from '../game/game';
import { ports } from '../game/puertos';
import type { Dir } from '../game/types';
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
    const y = 6 + row * 6;
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
  for (let y = 30; y < 38; y++) for (let x = 30; x < 38; x++) w.height[y * 40 + x] = 1;
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
  // Desnivel: tubería que cruza del nivel 0 al 1 (resalte en x 30..37, y 30..37).
  for (const [x, y] of [[28, 34], [29, 34], [30, 34], [31, 34]]) put('pipeline', x, y);
  notes.push('desnivel: tuberías en 28..31,34 (28 y 29 a nivel 0; 30 y 31 a nivel 1)');
  return { cases, notes };
}
