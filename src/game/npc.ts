/**
 * NPCs: se mueven por la cuadrícula esquivando edificios sólidos y ejecutan trabajos.
 * El comportamiento se decide cada paso a partir del estado (qué llevan, dónde están),
 * así que no hay máquinas de estados frágiles.
 */
import { add, addAll, count, entries, missing, take, total } from './bag';
import { CONFIG } from './config';
import type { Building, Game } from './game';
import type { Job } from './jobs';
import { bfsPath } from './path';
import type { Bag, NpcRole, Tile } from './types';

export interface Npc {
  id: number;
  role: NpcRole;
  /** Posición continua (centro de casilla = i + 0.5). */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  jobId: number | null;
  path: Tile[];
  /** Destino del camino actual (para saber si hay que recalcularlo). */
  goalKey: string;
  carry: Bag;
  /** Segundos de trabajo acumulados en la tarea actual. */
  work: number;
}

type Goal = { kind: 'storage' } | { kind: 'building'; b: Building };
type Outcome = 'continue' | 'done' | 'abort';

const tileOf = (n: Npc): Tile => ({ x: Math.floor(n.x), y: Math.floor(n.y) });

function atGoal(game: Game, goal: Goal, x: number, y: number): boolean {
  if (goal.kind === 'building') return game.touches(goal.b, x, y);
  return game.storageBuildings().some((s) => game.touches(s, x, y));
}

/**
 * Avanza hacia el objetivo. Devuelve true si ya está en él, false si sigue andando,
 * o null si no hay ruta posible.
 */
export function moveTo(game: Game, n: Npc, goal: Goal, dt: number): boolean | null {
  const key = goal.kind === 'storage' ? 'storage' : `b${goal.b.id}`;
  if (n.goalKey !== key) {
    n.path = [];
    n.goalKey = key;
  }
  if (n.path.length && !game.npcPassable(n.path[0].x, n.path[0].y)) n.path = [];
  const t = tileOf(n);
  if (n.path.length === 0 && !atGoal(game, goal, t.x, t.y)) {
    const p = bfsPath(game.world.w, game.world.h, t, (x, y) => atGoal(game, goal, x, y), (x, y) => game.npcPassable(x, y));
    if (!p) return null;
    n.path = p;
  }
  // Camina por los centros de casilla; sin camino, se centra en la casilla actual.
  let budget = game.npcSpeed(n) * dt;
  while (budget > 1e-9) {
    const wp = n.path[0] ?? tileOf(n);
    const dx = wp.x + 0.5 - n.x;
    const dy = wp.y + 0.5 - n.y;
    const d = Math.hypot(dx, dy);
    if (d > budget) {
      n.x += (dx / d) * budget;
      n.y += (dy / d) * budget;
      break;
    }
    n.x = wp.x + 0.5;
    n.y = wp.y + 0.5;
    budget -= d;
    if (n.path.length) n.path.shift();
    else break;
  }
  const nt = tileOf(n);
  const centered = Math.abs(n.x - (nt.x + 0.5)) < 1e-6 && Math.abs(n.y - (nt.y + 0.5)) < 1e-6;
  return n.path.length === 0 && centered && atGoal(game, goal, nt.x, nt.y);
}

/** Deja todo lo que lleva en el almacén. */
function depositAll(game: Game, n: Npc): void {
  addAll(game.storage, n.carry);
  n.carry = {};
}

function free(game: Game, n: Npc): number {
  return game.npcCapacity(n) - total(n.carry);
}

// ------------------------------------------------------------------ trabajos

function doBuild(game: Game, n: Npc, b: Building, dt: number): Outcome {
  if (b.built) return 'done';
  const need = missing(game.def(b.kind).cost, b.delivered);
  if (total(need) === 0) {
    const r = moveTo(game, n, { kind: 'building', b }, dt);
    if (r === null) return 'abort';
    if (!r) return 'continue';
    b.progress += (dt * game.npcWork(n)) / game.def(b.kind).buildTime;
    if (b.progress >= 1) {
      game.completeBuilding(b);
      return 'done';
    }
    return 'continue';
  }
  const useful = entries(need).some(([i]) => count(n.carry, i) > 0);
  if (useful) {
    const r = moveTo(game, n, { kind: 'building', b }, dt);
    if (r === null) return 'abort';
    if (r) for (const [i, m] of entries(need)) add(b.delivered, i, take(n.carry, i, m));
    return 'continue';
  }
  const r = moveTo(game, n, { kind: 'storage' }, dt);
  if (r === null) return 'abort';
  if (!r) return 'continue';
  depositAll(game, n);
  for (const [i, m] of entries(need)) add(n.carry, i, take(game.storage, i, Math.min(m, free(game, n))));
  return total(n.carry) > 0 ? 'continue' : 'abort';
}

function doDeconstruct(game: Game, n: Npc, b: Building, dt: number): Outcome {
  if (!b.markedForRemoval) return 'done';
  const r = moveTo(game, n, { kind: 'building', b }, dt);
  if (r === null) return 'abort';
  if (!r) return 'continue';
  n.work += dt * game.npcWork(n);
  if (n.work >= game.def(b.kind).buildTime * CONFIG.deconstruct.timeFactor) {
    game.finishDeconstruct(b);
    return 'done';
  }
  return 'continue';
}

/** Ejecutores por tipo de trabajo (otros módulos registran los suyos). */
export type JobRunner = (game: Game, n: Npc, job: Job, b: Building, dt: number) => Outcome;
const runners: Partial<Record<Job['type'], JobRunner>> = {
  build: (g, n, _j, b, dt) => doBuild(g, n, b, dt),
  deconstruct: (g, n, _j, b, dt) => doDeconstruct(g, n, b, dt),
};
export function registerJobRunner(type: Job['type'], r: JobRunner): void {
  runners[type] = r;
}
export type { Outcome, Goal };

export function stepNpc(game: Game, n: Npc, dt: number): void {
  const job = n.jobId === null ? undefined : game.jobs.get(n.jobId);
  if (n.jobId !== null && !job) n.jobId = null;
  if (!job) {
    // Sin trabajo: si lleva algo, lo devuelve al almacén.
    if (total(n.carry) > 0) {
      const r = moveTo(game, n, { kind: 'storage' }, dt);
      if (r) depositAll(game, n);
      if (r === null) n.carry = {};
    }
    return;
  }
  const b = game.buildings.get(job.buildingId);
  const runner = runners[job.type];
  const outcome: Outcome = !b || !runner ? 'done' : runner(game, n, job, b, dt);
  if (outcome === 'continue') return;
  n.jobId = null;
  n.work = 0;
  if (outcome === 'done') game.jobs.complete(job);
  else game.jobs.unassign(job);
}
