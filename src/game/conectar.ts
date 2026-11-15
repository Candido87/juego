/**
 * Conexión de cintas y tuberías (lógica pura): encaje magnético con los puertos y comprobación de cada extremo de la pieza que
 * se va a colocar. Lo usa la vista para orientar sola la pieza junto a un puerto y para pintar la salida y la entrada de la
 * previsualización en verde (correcto), rojo (incompatible, con el motivo) o naranja (abierto).
 */
import type { Building, Game } from './game';
import { FLOW_NAMES, Port, PortMedium, hasPorts, ports } from './puertos';
import { DX, DY, Dir, opposite } from './types';

export type LineTool = 'belt' | 'belt_fast' | 'pipeline';
export const isLineTool = (k: string | null): k is LineTool => k === 'belt' || k === 'belt_fast' || k === 'pipeline';
const isLine = (b: Building) => b.kind === 'belt' || b.kind === 'belt_fast' || b.kind === 'pipeline';

export type EndState = 'ok' | 'error' | 'open';
export interface LineEnd {
  state: EndState;
  /** Por qué es incompatible (error) o qué falta (abierto). */
  reason?: string;
}
export interface LinePreview {
  /** Dirección que le correspondería por el puerto que tiene al lado (null = ningún puerto compatible cerca). */
  snap: Dir | null;
  /** Extremo delantero (hacia donde va el material) y trasero (de donde viene). */
  head: LineEnd;
  tail: LineEnd;
  /** La casilla es la de un puerto y ya hay algo puesto. */
  occupied: string | null;
}

const mediumOf = (t: LineTool): PortMedium => (t === 'pipeline' ? 'liquid' : 'solid');
const mediumName = (m: PortMedium) => (m === 'liquid' ? 'una tubería' : 'una cinta');

/** Puertos de los edificios vecinos cuya casilla exterior es (x,y). */
export function portsAt(g: Game, x: number, y: number): { owner: Building; port: Port }[] {
  const out: { owner: Building; port: Port }[] = [];
  for (let k = 0; k < 4; k++) {
    const n = g.buildingAt(x + DX[k], y + DY[k]);
    if (!n || !n.built || !hasPorts(n.kind)) continue;
    for (const port of ports(n.kind, n.x, n.y, n.dir)) if (port.x === x && port.y === y) out.push({ owner: n, port });
  }
  return out;
}

/** Orientación que daría el imán a una pieza en (x,y): la del puerto compatible de al lado (null si no hay o ya está bien). */
export function snapDir(g: Game, tool: LineTool, x: number, y: number, current: Dir): Dir | null {
  const cands = portsAt(g, x, y).filter((c) => c.port.medium === mediumOf(tool));
  if (!cands.length || cands.some((c) => c.port.dir === current)) return null;
  return cands.find((c) => c.port.io === 'out')?.port.dir ?? cands[0].port.dir;
}

/** Comprueba los dos extremos de una pieza de `tool` en (x,y) mirando a `dir`. */
export function previewLine(g: Game, tool: LineTool, x: number, y: number, dir: Dir): LinePreview {
  const medium = mediumOf(tool);
  const here = portsAt(g, x, y);
  const snap = snapDir(g, tool, x, y, dir);
  const existing = g.buildingAt(x, y);
  const occupied = existing && here.length ? 'Puerto ya ocupado: ya hay una conexión en esta casilla' : null;

  // Delantero: el material sale hacia (x+dir).
  const front = g.buildingAt(x + DX[dir], y + DY[dir]);
  let head: LineEnd;
  if (!front || !front.built) head = { state: 'open', reason: 'Abierto: la línea acaba en el vacío' };
  else if (isLine(front)) {
    const fm: PortMedium = front.kind === 'pipeline' ? 'liquid' : 'solid';
    if (fm !== medium) head = { state: 'error', reason: `Tipo de flujo incorrecto: ${mediumName(medium)} no puede entrar en ${mediumName(fm)}` };
    else if (front.dir === opposite(dir)) head = { state: 'error', reason: 'Sentido contrario: la línea de enfrente viene hacia aquí' };
    else head = { state: 'ok' };
  } else if (front.kind === 'core') {
    head = medium === 'solid' ? { state: 'ok' } : { state: 'error', reason: 'Tipo de flujo incorrecto: el núcleo no recibe líquidos' };
  } else {
    const mine = here.find((c) => c.owner === front);
    if (!mine) head = { state: 'error', reason: `${g.def(front.kind).name} no tiene entrada por esta cara` };
    else if (mine.port.io === 'out') head = { state: 'error', reason: 'Salida con salida: la línea va hacia una salida del edificio' };
    else if (mine.port.medium !== medium) head = { state: 'error', reason: `Tipo de flujo incorrecto: la entrada es de ${FLOW_NAMES[mine.port.flow]} y esto es ${mediumName(medium)}` };
    else head = { state: 'ok' };
  }

  // Trasero: de dónde viene el material (x-dir).
  const back = g.buildingAt(x - DX[dir], y - DY[dir]);
  let tail: LineEnd;
  // Una salida de edificio que da a esta casilla alimenta la pieza aunque no esté justo detrás (la cinta hace una curva).
  const feeder = here.find((c) => c.port.io === 'out' && c.owner !== front && !(c.owner === back && c.port.dir === dir));
  if (feeder) {
    tail =
      feeder.port.medium === medium
        ? { state: 'ok' }
        : { state: 'error', reason: `Tipo de flujo incorrecto: la salida es de ${FLOW_NAMES[feeder.port.flow]} y esto es ${mediumName(medium)}` };
  } else if (!back || !back.built) tail = { state: 'open', reason: 'Abierto: nada alimenta esta línea todavía' };
  else if (isLine(back)) {
    const bm: PortMedium = back.kind === 'pipeline' ? 'liquid' : 'solid';
    if (bm !== medium) tail = { state: 'error', reason: `Tipo de flujo incorrecto: ${mediumName(bm)} no puede alimentar ${mediumName(medium)}` };
    else if (back.dir !== dir) tail = { state: 'open', reason: 'Abierto: la línea de atrás no apunta hacia aquí' };
    else tail = { state: 'ok' };
  } else {
    const mine = here.find((c) => c.owner === back);
    if (!mine) tail = { state: 'open', reason: `${g.def(back.kind).name} no saca material por esta cara` };
    else if (mine.port.io === 'in') tail = { state: 'error', reason: 'Entrada con entrada: la línea sale de una entrada del edificio' };
    else if (mine.port.dir !== dir) tail = { state: 'error', reason: 'Sentido contrario: la salida del edificio apunta a otro lado' };
    else if (mine.port.medium !== medium) tail = { state: 'error', reason: `Tipo de flujo incorrecto: la salida es de ${FLOW_NAMES[mine.port.flow]} y esto es ${mediumName(medium)}` };
    else tail = { state: 'ok' };
  }
  return { snap, head, tail, occupied };
}
