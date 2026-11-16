/**
 * Trazado arrastrando (lógica pura): con la herramienta Cinta o Tubería se mantiene pulsado y se arrastra; el recorrido va por ejes
 * (nunca en diagonal), se deshace al retroceder y cada pieza apunta hacia la siguiente, así que las curvas, T y cruces salen solos
 * de la tabla de conexiones. `planTrace` valida casilla a casilla (motivo, desnivel, mezcla de líquidos) y suma el coste;
 * `commitTrace` construye todo de una vez y devuelve un registro para deshacerlo con un solo paso (`undoTrace`).
 */
import { addAll } from './bag';
import { CONFIG } from './config';
import type { Game } from './game';
import { pipeJoinConflict } from './tuberias';
import { Bag, BuildKind, DX, DY, Dir } from './types';
import { heightAt } from './world';

export interface Tile {
  x: number;
  y: number;
}
export type LineKind = 'belt' | 'belt_fast' | 'pipeline';
export const isLineKindName = (k: string | null | undefined): k is LineKind => k === 'belt' || k === 'belt_fast' || k === 'pipeline';

const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const MAX_STEPS = 400;

/**
 * Prolonga (o acorta) el recorrido hasta `target`, siempre por ejes. Sigue recto en el eje que llevaba mientras quede distancia en él y
 * gira después (camino en L, o escalonado si el ratón va en diagonal). Si el siguiente paso cae en una casilla ya trazada, el recorrido
 * vuelve atrás hasta ella (deshacer al retroceder). Con `straight` (Mayús) el recorrido es una línea recta desde la primera casilla.
 */
export function extendPath(path: Tile[], target: Tile, straight = false): Tile[] {
  if (!path.length) return [target];
  if (straight) {
    const s = path[0];
    const dx = target.x - s.x;
    const dy = target.y - s.y;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const out: Tile[] = [{ ...s }];
    const n = horiz ? Math.abs(dx) : Math.abs(dy);
    for (let i = 1; i <= n; i++) out.push(horiz ? { x: s.x + Math.sign(dx) * i, y: s.y } : { x: s.x, y: s.y + Math.sign(dy) * i });
    return out;
  }
  let p = path.map((t) => ({ ...t }));
  for (let guard = 0; guard < MAX_STEPS; guard++) {
    const last = p[p.length - 1];
    if (same(last, target)) break;
    const dx = target.x - last.x;
    const dy = target.y - last.y;
    const prevAxis = p.length >= 2 ? (p[p.length - 2].x !== last.x ? 'x' : 'y') : null;
    let axis: 'x' | 'y' = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    if (prevAxis === 'x' && dx !== 0) axis = 'x';
    else if (prevAxis === 'y' && dy !== 0) axis = 'y';
    const next: Tile = axis === 'x' ? { x: last.x + Math.sign(dx), y: last.y } : { x: last.x, y: last.y + Math.sign(dy) };
    const at = p.findIndex((t) => same(t, next));
    if (at >= 0) p = p.slice(0, at + 1);
    else p.push(next);
  }
  return p;
}

/** Dirección (0:+x 1:+y 2:-x 3:-y) del paso entre dos casillas contiguas, o null. */
export function stepDir(a: Tile, b: Tile): Dir | null {
  for (let d = 0; d < 4; d++) if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d as Dir;
  return null;
}

/** Dirección de cada casilla en el sentido de la marcha: hacia la siguiente; la última sigue la de la anterior (o `fallback` si sólo hay una). */
export function pathDirs(path: Tile[], fallback: Dir): Dir[] {
  return path.map((t, i) => (i < path.length - 1 ? stepDir(t, path[i + 1]) ?? fallback : i > 0 ? stepDir(path[i - 1], t) ?? fallback : fallback));
}

export interface TraceTile extends Tile {
  dir: Dir;
  /** ok: se construye; reuse: ya hay una pieza igual (sólo se gira); bad: no se puede. */
  status: 'ok' | 'reuse' | 'bad';
  reason?: string;
}

export interface TracePlan {
  kind: LineKind;
  /** Casillas en el sentido de la marcha (ya invertido si procede). */
  tiles: TraceTile[];
  /** Coste total en componentes de las piezas nuevas. */
  cost: Bag;
  /** Todas las casillas válidas. */
  ok: boolean;
  /** Primer motivo de rechazo. */
  reason?: string;
  /** Hay materiales para todo (si no, las obras esperan). */
  affordable: boolean;
  /** Piezas nuevas / ya existentes que sólo se giran. */
  fresh: number;
  reused: number;
}

/**
 * Valida un recorrido. `reversed` invierte el sentido de la marcha (tecla R). Casilla ocupada por otra cosa, desnivel de más de 1 nivel
 * entre contiguas (pide ascensor, sólo cintas), líquido distinto en una red tocada... se explican en `reason`.
 */
export function planTrace(g: Game, kind: LineKind, path: Tile[], fallback: Dir, reversed = false): TracePlan {
  const ordered = reversed ? [...path].reverse() : path;
  const dirs = pathDirs(ordered, fallback);
  const tiles: TraceTile[] = ordered.map((t, i) => {
    const dir = dirs[i];
    const here = g.buildingAt(t.x, t.y);
    if (here && here.kind === kind) return { ...t, dir, status: 'reuse' };
    const check = g.canPlace(kind as BuildKind, t.x, t.y);
    if (!check.ok) return { ...t, dir, status: 'bad', reason: check.reason ?? 'No se puede construir aquí' };
    const mix = kind === 'pipeline' ? pipeJoinConflict(g, t.x, t.y, dir) : null;
    if (mix) return { ...t, dir, status: 'bad', reason: mix };
    return { ...t, dir, status: 'ok' };
  });
  // Desnivel entre casillas contiguas: una cinta o tubería sólo salva 1 nivel.
  for (let i = 1; i < tiles.length; i++) {
    const dh = Math.abs(heightAt(g.world, tiles[i].x, tiles[i].y) - heightAt(g.world, tiles[i - 1].x, tiles[i - 1].y));
    if (dh > 1 && tiles[i].status !== 'bad') {
      tiles[i] = {
        ...tiles[i],
        status: 'bad',
        reason: kind === 'pipeline' ? `Desnivel de ${dh} niveles: una tubería sólo salva 1` : `Desnivel de ${dh} niveles: pon un ascensor de cintas (Logística)`,
      };
    }
  }
  const cost: Bag = {};
  let fresh = 0;
  let reused = 0;
  for (const t of tiles) {
    if (t.status === 'ok') {
      addAll(cost, CONFIG.buildings[kind].cost);
      fresh++;
    } else if (t.status === 'reuse') reused++;
  }
  const bad = tiles.find((t) => t.status === 'bad');
  return {
    kind,
    tiles,
    cost,
    ok: !bad && tiles.length > 0,
    reason: bad?.reason,
    affordable: Object.entries(cost).every(([k, v]) => (g.storage[k as keyof Bag] ?? 0) >= (v ?? 0)),
    fresh,
    reused,
  };
}

/** Lo necesario para deshacer un trazado de una vez. */
export interface TraceUndo {
  placed: number[];
  rotated: { x: number; y: number; dir: Dir }[];
}

/** Construye todo el recorrido (obras para los constructores) y gira las piezas iguales que ya había. Nada si el plan no es válido. */
export function commitTrace(g: Game, plan: TracePlan): TraceUndo | null {
  if (!plan.ok) return null;
  const rec: TraceUndo = { placed: [], rotated: [] };
  for (const t of plan.tiles) {
    if (t.status === 'reuse') {
      const b = g.buildingAt(t.x, t.y);
      if (b && b.dir !== t.dir) {
        rec.rotated.push({ x: t.x, y: t.y, dir: b.dir });
        g.rotate(t.x, t.y, t.dir);
      }
    } else {
      const b = g.place(plan.kind as BuildKind, t.x, t.y, t.dir);
      if (b) rec.placed.push(b.id);
    }
  }
  return rec;
}

/** Revierte un trazado: cancela las obras (devolviendo lo entregado), marca para desmontar lo ya construido y restaura los giros. */
export function undoTrace(g: Game, rec: TraceUndo): number {
  let n = 0;
  for (const id of rec.placed) {
    const b = g.buildings.get(id);
    if (!b) continue;
    if (!b.markedForRemoval) g.remove(b.x, b.y);
    n++;
  }
  for (const r of rec.rotated) g.rotate(r.x, r.y, r.dir);
  return n;
}
