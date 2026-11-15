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
}
export interface Route {
  tool: LineTool;
  pieces: RoutePiece[];
  curves: number;
  /** Cambios de altura a lo largo de la ruta (de momento sólo informativos: rampas y ascensores llegan con la Logística). */
  slopes: number;
  /** Materiales que cuesta colocarla entera. */
  cost: Bag;
}
export type RouteResult = { ok: true; route: Route } | { ok: false; reason: string; fix?: string };

/** Destino: una entrada de un edificio, o una línea existente de la que se entra de lado (empalme). */
export type RouteTarget = { port: Port } | { line: Building };

/** Penalizaciones de la búsqueda (en casillas): cada curva y cada cambio de altura cuestan algo más que avanzar recto. */
export const ROUTE_COST = { turn: 0.6, slope: 0.8 };
/** Tope de estados explorados (evita bloquear el juego en mapas enormes). */
const MAX_STATES = 40000;

const isLine = (b: Building) => b.kind === 'belt' || b.kind === 'belt_fast' || b.kind === 'pipeline';

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

const costOf = (tool: LineTool, n: number): Bag => {
  const out: Bag = {};
  for (const [k, v] of Object.entries(CONFIG.buildings[tool].cost)) out[k as keyof Bag] = (v ?? 0) * n;
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

  const idx = (x: number, y: number, d: number) => (y * w + x) * 4 + d;
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new Heap();
  const hOf = (x: number, y: number) => Math.abs(x - goalTile.x) + Math.abs(y - goalTile.y);
  const heightCost = (ax: number, ay: number, bx: number, by: number) => (heightAt(g.world, ax, ay) !== heightAt(g.world, bx, by) ? ROUTE_COST.slope : 0);
  // Pieza inicial en la casilla de la salida: cualquier sentido salvo volver al edificio.
  for (let d = 0; d < 4; d++) {
    if (d === opposite(from.dir)) continue;
    best.set(idx(from.x, from.y, d), 1);
    heap.push(idx(from.x, from.y, d), 1 + hOf(from.x, from.y));
  }
  let goalState = -1;
  let explored = 0;
  while (heap.size && explored++ < MAX_STATES) {
    const k = heap.pop();
    const d = (k & 3) as Dir;
    const t = k >> 2;
    const x = t % w;
    const y = (t - x) / w;
    const g0 = best.get(k)!;
    // ¿Es una pieza final?
    if ('port' in to) {
      if (x === goalTile.x && y === goalTile.y && d === to.port.dir) {
        goalState = k;
        break;
      }
    } else {
      const lx = x + DX[d];
      const ly = y + DY[d];
      if (lx === to.line.x && ly === to.line.y && to.line.dir !== opposite(d)) {
        goalState = k;
        break;
      }
    }
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (!free(nx, ny)) continue;
    if (!('port' in to) && nx === goalTile.x && ny === goalTile.y) continue;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === opposite(d)) continue;
      const nk = idx(nx, ny, nd);
      const c = g0 + 1 + (nd !== d ? ROUTE_COST.turn : 0) + heightCost(x, y, nx, ny);
      if (c < (best.get(nk) ?? Infinity)) {
        best.set(nk, c);
        prev.set(nk, k);
        heap.push(nk, c + hOf(nx, ny));
      }
    }
  }
  if (goalState < 0) {
    return {
      ok: false,
      reason: explored >= MAX_STATES ? 'El destino está demasiado lejos para trazar la ruta' : 'No hay camino: edificios, árboles u otros puertos bloquean el recorrido',
      fix: 'Quita un obstáculo, elige otra entrada más cercana o construye por partes. Los desniveles que no se pueden salvar se resolverán con rampas y ascensores (Logística)',
    };
  }
  const pieces: RoutePiece[] = [];
  for (let k: number | undefined = goalState; k !== undefined; k = prev.get(k)) {
    const d = (k & 3) as Dir;
    const t = k >> 2;
    const x = t % w;
    pieces.push({ x, y: (t - x) / w, dir: d });
  }
  pieces.reverse();
  let curves = 0;
  let slopes = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (i > 0 && pieces[i].dir !== pieces[i - 1].dir) curves++;
    if (i > 0 && heightAt(g.world, pieces[i].x, pieces[i].y) !== heightAt(g.world, pieces[i - 1].x, pieces[i - 1].y)) slopes++;
  }
  if (tool === 'pipeline') {
    for (const p of pieces) {
      const mix = pipeJoinConflict(g, p.x, p.y, p.dir);
      if (mix) return { ok: false, reason: mix, fix: 'Elige otra entrada del mismo líquido o separa las redes de tuberías' };
    }
  }
  return { ok: true, route: { tool, pieces, curves, slopes, cost: costOf(tool, pieces.length) } };
}

/** ¿Hay materiales para toda la ruta? (Las obras las levantan los Constructores con lo que haya en el almacén.) */
export function canAffordRoute(g: Game, route: Route): boolean {
  return Object.entries(route.cost).every(([k, v]) => (g.storage[k as keyof Bag] ?? 0) >= (v ?? 0));
}

/** Coloca las obras de la ruta; devuelve cuántas se pusieron (todas, salvo que algo falle por el camino). */
export function buildRoute(g: Game, route: Route): number {
  let n = 0;
  for (const p of route.pieces) {
    if (!g.place(route.tool, p.x, p.y, p.dir)) break;
    n++;
  }
  return n;
}
