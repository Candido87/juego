/**
 * Cola de trabajos. Se recalcula a partir del estado del juego cada `scanInterval` s:
 * cada trabajo deseado tiene una clave estable, así que conserva su prioridad y su NPC asignado.
 */
import { count, entries, missing, total } from './bag';
import { CONFIG } from './config';
import type { Building, Game } from './game';
import type { Npc } from './npc';
import type { ItemId, JobType, NpcRole } from './types';

export interface Job {
  id: number;
  key: string;
  type: JobType;
  buildingId: number;
  item: ItemId | null;
  qty: number;
  priority: number;
  npcId: number | null;
}

export const JOB_ROLE: Record<JobType, NpcRole> = {
  build: 'constructor',
  deconstruct: 'constructor',
  repair: 'constructor',
  supply: 'transporter',
  collect: 'transporter',
  maintain: 'operator',
  start: 'operator',
};

export const JOB_NAMES: Record<JobType, string> = {
  build: 'Construir',
  deconstruct: 'Desmontar',
  repair: 'Reparar',
  supply: 'Abastecer',
  collect: 'Recoger',
  maintain: 'Mantener',
  start: 'Arrancar',
};

interface Desired {
  key: string;
  type: JobType;
  buildingId: number;
  item: ItemId | null;
  qty: number;
  urgent: boolean;
}

/** Sistemas que añaden trabajos deseados (se amplía en otros módulos). */
export type JobSource = (game: Game, out: Desired[]) => void;
const sources: JobSource[] = [];
export function registerJobSource(s: JobSource): void {
  sources.push(s);
}
export type { Desired };

function baseJobs(game: Game, out: Desired[]): void {
  const J = CONFIG.jobs;
  for (const b of game.buildings.values()) {
    const job = (type: JobType, item: ItemId | null = null, qty = 0, urgent = false) =>
      out.push({ key: `${type}:${b.id}${item ? `:${item}` : ''}`, type, buildingId: b.id, item, qty, urgent });
    if (!b.built) {
      job('build');
      continue;
    }
    if (b.markedForRemoval) {
      job('deconstruct');
      continue;
    }
    // Reparar: con el primer material de su coste.
    const repairItem = entries(game.def(b.kind).cost)[0]?.[0];
    if (repairItem && b.hp < b.maxHp * J.repairBelow) job('repair', repairItem, 0, b.hp < b.maxHp * 0.35);
    // Abastecer entradas, munición y combustible.
    for (const item of game.inputsOf(b)) {
      if (!game.needsManualSupply(b, item)) continue;
      const cap = game.capacityFor(b, item);
      const have = count(b.inv, item);
      if (have < cap * J.supplyBelow) {
        const empty = have === 0 && !game.turretReady(b) && !!game.turretDef(b);
        job('supply', item, cap - have, empty);
      }
    }
    // Recoger salidas que no salen solas.
    if (total(b.out) >= J.collectMin && !game.outputFlows(b)) job('collect', null, total(b.out));
    // Arrancar generadores parados que ya tienen combustible.
    if (game.needsStart(b)) job('start', null, 0, true);
    // Mantenimiento por desgaste.
    if ((b.kind === 'factory' || b.kind === 'refinery' || game.turretDef(b)) && b.condition < J.maintainBelow) job('maintain', null, 0, b.condition <= 0);
  }
}

/** ¿Puede empezarse ya el trabajo? (p. ej. hay material en el almacén). */
export function jobFeasible(game: Game, job: Job, b: Building): boolean {
  switch (job.type) {
    case 'build': {
      const need = missing(game.def(b.kind).cost, b.delivered);
      return total(need) === 0 || Object.keys(need).some((i) => count(game.storage, i as ItemId) > 0);
    }
    case 'supply':
    case 'repair':
      return job.item !== null && count(game.storage, job.item) > 0;
    default:
      return true;
  }
}

export class JobBoard {
  private byKey = new Map<string, Job>();
  private byId = new Map<number, Job>();
  private nextId = 1;
  private timer = 0;

  list(): Job[] {
    return [...this.byKey.values()].sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  get(id: number): Job | undefined {
    return this.byId.get(id);
  }

  setPriority(id: number, p: number): void {
    const j = this.byId.get(id);
    if (j) j.priority = Math.max(CONFIG.jobs.minPriority, Math.min(CONFIG.jobs.maxPriority, p));
  }

  complete(job: Job): void {
    this.byKey.delete(job.key);
    this.byId.delete(job.id);
  }

  unassign(job: Job): void {
    job.npcId = null;
  }

  update(game: Game, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CONFIG.jobs.scanInterval;
    this.refresh(game);
    this.assign(game);
  }

  /** Sincroniza la cola con el estado del juego. */
  refresh(game: Game): void {
    const desired: Desired[] = [];
    baseJobs(game, desired);
    for (const s of sources) s(game, desired);
    const keys = new Set<string>();
    for (const d of desired) {
      keys.add(d.key);
      const j = this.byKey.get(d.key);
      if (j) {
        j.qty = d.qty;
        continue;
      }
      const job: Job = {
        id: this.nextId++,
        key: d.key,
        type: d.type,
        buildingId: d.buildingId,
        item: d.item,
        qty: d.qty,
        priority: CONFIG.jobs.priority[d.type] + (d.urgent ? CONFIG.jobs.urgentBonus : 0),
        npcId: null,
      };
      this.byKey.set(job.key, job);
      this.byId.set(job.id, job);
    }
    for (const j of [...this.byKey.values()]) {
      const gone = !game.buildings.has(j.buildingId);
      if (gone || (!keys.has(j.key) && j.npcId === null)) this.complete(j);
    }
  }

  /** Los NPCs libres cogen el trabajo de su rol con más prioridad y, a igualdad, el más cercano. */
  assign(game: Game): void {
    const free = game.npcs.filter((n) => n.jobId === null && total(n.carry) === 0);
    if (!free.length) return;
    const open = [...this.byKey.values()].filter((j) => j.npcId === null);
    for (const n of free) {
      let best: Job | null = null;
      let bestScore = -Infinity;
      for (const j of open) {
        if (j.npcId !== null || JOB_ROLE[j.type] !== n.role) continue;
        const b = game.buildings.get(j.buildingId);
        if (!b || !jobFeasible(game, j, b)) continue;
        const dist = Math.abs(b.x + b.w / 2 - n.x) + Math.abs(b.y + b.d / 2 - n.y);
        const score = j.priority * 1000 - dist;
        if (score > bestScore) {
          bestScore = score;
          best = j;
        }
      }
      if (best) {
        best.npcId = n.id;
        n.jobId = best.id;
        n.work = 0;
      }
    }
  }

  /** Trabajos asignados a un NPC concreto (para la interfaz). */
  ofNpc(n: Npc): Job | undefined {
    return n.jobId === null ? undefined : this.byId.get(n.jobId);
  }
}
