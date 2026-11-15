/**
 * Herramienta Conectar (lógica pura): busca con A* la ruta más corta y con menos curvas de cinta o tubería entre una salida
 * libre y una entrada compatible (o un empalme en una línea existente), esquivando edificios, árboles y casillas de otros
 * puertos. Si no hay ruta o la conexión no es válida, explica por qué y sugiere qué hacer.
 */
import { LineTool, portsAt } from './conectar';
import { CONFIG } from './config';
import type { Building, Game } from './game';
import { Port, canLink, portsWithStatus } from './puertos';
import { pipeJoinConflict } from './tuberias';
import { Bag, DX, DY, Dir, opposite } from './types';
import { heightAt, inBounds } from './world';

export interface RoutePiece {
  x: number;
  y: number;
  dir: Dir;
  /** Qué se construye ahí (por defecto la herramienta de la ruta); 'elevator' donde hay un salto de más de 1 nivel. */
  kind?: 'elevator';
}
export interface Route {
  tool: LineTool;
  pieces: RoutePiece[];
  curves: number;
  /** Cambios de altura de 1 nivel a lo largo de la ruta (rampas: se suben más despacio). */
  slopes: number;
  /** Ascensores que necesita la ruta para saltos de más de 1 nivel. */
  elevators: number;
  /** Materiales que cuesta colocarla entera. */
  cost: Bag;
}
export type RouteResult = { ok: true; route: Route } | { ok: false; reason: string; fix?: string };

/** Destino: una entrada de un edificio, o una línea existente de la que se entra de lado (empalme). */
export type RouteTarget = { port: Port } | { line: Building };

/** Penalizaciones de la búsqueda (en casillas): cada curva y cada cambio de altura cuestan algo más que avanzar recto. */
export const ROUTE_COST = { turn: 0.6, slope: 0.8, lift: 10 };
/** Tope de estados explorados (evita bloquear el juego en mapas enormes). */
const MAX_STATES = 40000;

const isLine = (b: Building) => b.kind === 'belt' || b.kind === 'belt_fast' || b.kind === 'pipeline' || b.kind === 'elevator';

/** Herramienta que corresponde a un puerto: cinta para sólidos, tubería para líquidos. */
export const toolFor = (p: Port): LineTool => (p.medium === 'liquid' ? 'pipeline' : 'belt');

/** Salidas del edificio que aún no tienen nada pegado. */
export function freeOutPorts(g: Game, b: Building): Port[] {
  return portsWithStatus(g, b)
    .filter((x) => x.port.io === 'out' && x.status.state === 'free' && !g.buildingAt(x.port.x, x.port.y))
    .map((x) => x.port);
}
/** Entradas del edificio que aún no tienen nada pegado. */
export function freeInPorts(g: Game, b: Building): Port[] {
  return portsWithStatus(g, b)
    .filter((x) => x.port.io === 'in' && x.status.state === 'free' && !g.buildingAt(x.port.x, x.port.y))
    .map((x) => x.port);
}

/** Cola de prioridad mínima muy simple (montículo binario). */
class Heap {
  private a: { k: number; f: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, f: number) {
    const a = this.a;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.k;
  }
}

const costOf = (tool: LineTool, n: number, lifts = 0): Bag => {
  const out: Bag = {};
  for (const [k, v] of Object.entries(CONFIG.buildings[tool].cost)) out[k as keyof Bag] = (v ?? 0) * (n - lifts);
  for (const [k, v] of Object.entries(CONFIG.buildings.elevator.cost)) if (lifts) out[k as keyof Bag] = (out[k as keyof Bag] ?? 0) + (v ?? 0) * lifts;
  return out;
};

/** Busca la ruta de `from` (salida) a `to`. */
export function findRoute(g: Game, from: Port, to: RouteTarget): RouteResult {
  const tool = toolFor(from);
  const w = g.world.w;
  const h = g.world.h;
  if (from.io !== 'out') return { ok: false, reason: 'Hay que empezar en una salida', fix: 'Pulsa primero en un edificio con una salida libre (flecha llena)' };
  if ('port' in to) {
    const link = canLink(from, to.port);
    if (!link.ok) return { ok: false, reason: link.reason, fix: 'Une una salida con una entrada del mismo tipo de flujo' };
  } else if (!isLine(to.line) || (to.line.kind === 'pipeline') !== (tool === 'pipeline')) {
    return { ok: false, reason: `Tipo de flujo incorrecto: no se puede entrar de lado en ${to.line.kind === 'pipeline' ? 'una tubería' : 'una cinta'} con ${tool === 'pipeline' ? 'una tubería' : 'una cinta'}`, fix: 'Elige una línea del mismo tipo' };
  }
  if (g.buildingAt(from.x, from.y)) return { ok: false, reason: 'Puerto ya ocupado: la salida ya tiene algo pegado', fix: 'Quita la pieza que hay delante o elige otra salida' };
  const goalTile = 'port' in to ? { x: to.port.x, y: to.port.y } : { x: to.line.x, y: to.line.y };
  if ('port' in to && g.buildingAt(goalTile.x, goalTile.y)) return { ok: false, reason: 'Puerto ya ocupado: la entrada ya tiene algo pegado', fix: 'Quita la pieza que hay delante o elige otra entrada' };

  // Casillas de puertos de otros edificios: no se atraviesan (una cinta ahí recibiría o daría material sin querer).
  const mine = (x: number, y: number) => (x === from.x && y === from.y) || ('port' in to && x === to.port.x && y === to.port.y);
  const free = (x: number, y: number): boolean => {
    if (!inBounds(g.world, x, y)) return false;
    if (mine(x, y)) return g.canPlace(tool, x, y).ok;
    if (!g.canPlace(tool, x, y).ok) return false;
    return portsAt(g, x, y).length === 0;
  };
  if (!free(from.x, from.y)) {
    const why = g.canPlace(tool, from.x, from.y).reason ?? 'no se puede construir';
    return { ok: false, reason: `La casilla de la salida no está libre: ${why}`, fix: 'Despeja la casilla pegada a la salida' };
  }
  if ('port' in to && !free(to.port.x, to.port.y)) {
    const why = g.canPlace(tool, to.port.x, to.port.y).reason ?? 'no se puede construir';
    return { ok: false, reason: `La casilla de la entrada no está libre: ${why}`, fix: 'Despeja la casilla pegada a la entrada' };
  }

  // Estado = (casilla, sentido, ¿es ascensor?). Un ascensor sólo con cintas y si la tecnología está investigada.
  const canLift = tool === 'belt' && g.unlockedBuildings.has('elevator');
  const idx = (x: number, y: number, d: number, lift = 0) => ((y * w + x) * 4 + d) * 2 + lift;
  const hAt = (x: number, y: number) => heightAt(g.world, x, y);
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new Heap();
  const hOf = (x: number, y: number) => Math.abs(x - goalTile.x) + Math.abs(y - goalTile.y);
  const heightCost = (ax: number, ay: number, bx: number, by: number) => (hAt(ax, ay) !== hAt(bx, by) ? ROUTE_COST.slope : 0);
  // Pieza inicial en la casilla de la salida: cualquier sentido salvo volver al edificio.
  for (let d = 0; d < 4; d++) {
    if (d === opposite(from.dir)) continue;
    for (let l = 0; l <= (canLift ? 1 : 0); l++) {
      best.set(idx(from.x, from.y, d, l), 1 + (l ? ROUTE_COST.lift : 0));
      heap.push(idx(from.x, from.y, d, l), 1 + (l ? ROUTE_COST.lift : 0) + hOf(from.x, from.y));
    }
  }
  let goalState = -1;
  let explored = 0;
  while (heap.size && explored++ < MAX_STATES) {
    const k = heap.pop();
    const lift = k & 1;
    const d = ((k >> 1) & 3) as Dir;
    const t = k >> 3;
    const x = t % w;
    const y = (t - x) / w;
    const g0 = best.get(k)!;
    // ¿Es una pieza final?
    if ('port' in to) {
      if (x === goalTile.x && y === goalTile.y && d === to.port.dir && !lift) {
        goalState = k;
        break;
      }
    } else {
      const lx = x + DX[d];
      const ly = y + DY[d];
      const reach = lift ? CONFIG.elevator.maxRise : 1;
      if (lx === to.line.x && ly === to.line.y && to.line.dir !== opposite(d) && Math.abs(hAt(lx, ly) - hAt(x, y)) <= reach) {
        goalState = k;
        break;
      }
    }
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (!free(nx, ny)) continue;
    if (!('port' in to) && nx === goalTile.x && ny === goalTile.y) continue;
    // Un desnivel de 1 nivel es rampa; más de 1 sólo lo salva un ascensor (la pieza que sale hacia arriba o abajo).
    const dh = Math.abs(hAt(nx, ny) - hAt(x, y));
    if (dh > (lift ? CONFIG.elevator.maxRise : 1)) continue;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === opposite(d)) continue;
      for (let nl = 0; nl <= (canLift ? 1 : 0); nl++) {
        const nk = idx(nx, ny, nd, nl);
        const c = g0 + 1 + (nd !== d ? ROUTE_COST.turn : 0) + (lift ? 0 : heightCost(x, y, nx, ny)) + (nl ? ROUTE_COST.lift : 0);
        if (c < (best.get(nk) ?? Infinity)) {
          best.set(nk, c);
          prev.set(nk, k);
          heap.push(nk, c + hOf(nx, ny));
        }
      }
    }
  }
  if (goalState < 0) {
    return {
      ok: false,
      reason: explored >= MAX_STATES ? 'El destino está demasiado lejos para trazar la ruta' : 'No hay camino: edificios, árboles u otros puertos bloquean el recorrido',
      fix:
        tool === 'belt'
          ? g.unlockedBuildings.has('elevator')
            ? 'Quita un obstáculo o elige otra entrada. Un desnivel de más de 1 nivel sólo lo salva un ascensor de cintas (hasta 4 niveles)'
            : 'Quita un obstáculo o elige otra entrada. Si hay un desnivel de más de 1 nivel, investiga el Ascensor de cintas (Logística)'
          : 'Quita un obstáculo o elige otra entrada. Las tuberías sólo suben o bajan 1 nivel: rodea el desnivel',
    };
  }
  const pieces: RoutePiece[] = [];
  for (let k: number | undefined = goalState; k !== undefined; k = prev.get(k)) {
    const d = ((k >> 1) & 3) as Dir;
    const t = k >> 3;
    const x = t % w;
    pieces.push({ x, y: (t - x) / w, dir: d, ...(k & 1 ? { kind: 'elevator' as const } : {}) });
  }
  pieces.reverse();
  let curves = 0;
  let slopes = 0;
  let elevators = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (i > 0 && pieces[i].dir !== pieces[i - 1].dir) curves++;
    if (pieces[i].kind) elevators++;
    if (i > 0 && !pieces[i - 1].kind && hAt(pieces[i].x, pieces[i].y) !== hAt(pieces[i - 1].x, pieces[i - 1].y)) slopes++;
  }
  if (tool === 'pipeline') {
    for (const p of pieces) {
      const mix = pipeJoinConflict(g, p.x, p.y, p.dir);
      if (mix) return { ok: false, reason: mix, fix: 'Elige otra entrada del mismo líquido o separa las redes de tuberías' };
    }
  }
  return { ok: true, route: { tool, pieces, curves, slopes, elevators, cost: costOf(tool, pieces.length, elevators) } };
}

/** ¿Hay materiales para toda la ruta? (Las obras las levantan los Constructores con lo que haya en el almacén.) */
export function canAffordRoute(g: Game, route: Route): boolean {
  return Object.entries(route.cost).every(([k, v]) => (g.storage[k as keyof Bag] ?? 0) >= (v ?? 0));
}

/** Coloca las obras de la ruta; devuelve cuántas se pusieron (todas, salvo que algo falle por el camino). */
export function buildRoute(g: Game, route: Route): number {
  let n = 0;
  for (const p of route.pieces) {
    if (!g.place(p.kind ?? route.tool, p.x, p.y, p.dir)) break;
    n++;
  }
  return n;
}
