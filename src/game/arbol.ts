/**
 * Pantalla del árbol de tecnología, parte pura (sin DOM): distribución de los nodos en el plano, textos de los tooltips
 * (generados a partir de los datos del árbol, no escritos a mano en la interfaz), búsqueda y filtros.
 */
import { CONFIG, TECH_BRANCHES, TechBranch, TechNode } from './config';
import type { Game } from './game';
import { techNode, techOfBranch } from './tecnologia';
import type { BuildKind } from './types';

// ---------- distribución ----------

export const TREE = { nodeW: 154, nodeH: 58, gapX: 64, gapY: 12, lanePad: 20, labelW: 132, laneGap: 10 } as const;

export interface TreeLayout {
  nodes: Map<string, { x: number; y: number }>;
  lanes: { branch: TechBranch; y: number; h: number }[];
  /** Líneas de requisito: del lado derecho del nodo previo al lado izquierdo del siguiente. */
  edges: { from: string; to: string; x1: number; y1: number; x2: number; y2: number }[];
  width: number;
  height: number;
}

/** Una fila (carril) por rama; las columnas son los `tier`; los nodos de una misma columna se apilan. */
export function layoutTree(): TreeLayout {
  const nodes = new Map<string, { x: number; y: number }>();
  const lanes: TreeLayout['lanes'] = [];
  const maxTier = Math.max(...CONFIG.tech.map((n) => n.tier));
  let y = 0;
  for (const branch of TECH_BRANCHES) {
    const list = techOfBranch(branch);
    if (!list.length) continue;
    const rows = new Map<number, number>();
    let most = 0;
    for (const n of list) {
      const row = rows.get(n.tier) ?? 0;
      rows.set(n.tier, row + 1);
      most = Math.max(most, row + 1);
      nodes.set(n.id, { x: TREE.labelW + (n.tier - 1) * (TREE.nodeW + TREE.gapX), y: y + TREE.lanePad + row * (TREE.nodeH + TREE.gapY) });
    }
    const h = most * TREE.nodeH + (most - 1) * TREE.gapY + 2 * TREE.lanePad;
    lanes.push({ branch, y, h });
    y += h + TREE.laneGap;
  }
  const edges: TreeLayout['edges'] = [];
  for (const n of CONFIG.tech) {
    const to = nodes.get(n.id)!;
    for (const r of n.requires) {
      const from = nodes.get(r)!;
      edges.push({ from: r, to: n.id, x1: from.x + TREE.nodeW, y1: from.y + TREE.nodeH / 2, x2: to.x, y2: to.y + TREE.nodeH / 2 });
    }
  }
  return { nodes, lanes, edges, width: TREE.labelW + maxTier * TREE.nodeW + (maxTier - 1) * TREE.gapX, height: y - TREE.laneGap };
}

// ---------- textos ----------

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Qué desbloquea o mejora un nodo, una línea por cosa. */
export function techUnlockLines(n: TechNode): string[] {
  const out: string[] = [];
  for (const b of n.unlocks.buildings ?? []) out.push(`Edificio: ${CONFIG.buildings[b].name}`);
  for (const r of n.unlocks.recipes ?? []) out.push(`Receta: ${CONFIG.recipes[r].name}`);
  const e = n.effects;
  if (e) {
    if (e.turretLevel) out.push(`${CONFIG.buildings[e.turretLevel].name}: sube un nivel (más daño y alcance)`);
    if (e.factoryTier) out.push(`Fábricas: nivel ${e.factoryTier} (permite las recetas de ese nivel)`);
    if (e.npcSpeed) out.push(`Personas: +${pct(e.npcSpeed)} de velocidad al andar`);
    if (e.npcCapacity) out.push(`Personas: +${e.npcCapacity} de capacidad de carga`);
    if (e.npcWork) out.push(`Personas: +${pct(e.npcWork)} de velocidad de trabajo`);
    if (e.houseCapacity) out.push(`Casas: +${e.houseCapacity} ${e.houseCapacity === 1 ? 'plaza' : 'plazas'} cada una`);
    if (e.researchRate) out.push(`Investigación: +${pct(e.researchRate)} de puntos por minuto`);
  }
  return out;
}

/** Edificio que representa el nodo en su icono (el primero que desbloquea; o la torreta que mejora), si lo hay. */
export function techIconKind(n: TechNode): BuildKind | null {
  return n.unlocks.buildings?.[0] ?? n.effects?.turretLevel ?? null;
}

export type TechState = 'done' | 'locked' | 'nopoints' | 'available';
export const TECH_STATE_TEXT: Record<TechState, string> = { done: 'Investigado', locked: 'Bloqueado: faltan requisitos', nopoints: 'Sin puntos suficientes', available: 'Disponible' };

export interface TechTip {
  id: string;
  title: string;
  branch: TechBranch;
  cost: number;
  state: TechState;
  stateText: string;
  /** Lo que desbloquea o mejora. */
  unlocks: string[];
  /** Requisitos previos y si ya se cumplen. */
  requires: { id: string; name: string; done: boolean }[];
  /** Si no se puede comprar: por qué, con puntos y tiempo. */
  reason?: string;
  /** Recomendado como siguiente paso. */
  recommended: boolean;
}

/** Datos del tooltip de un nodo, todos sacados del nodo y del estado de la partida. */
export function techTip(g: Game, id: string): TechTip {
  const n = techNode(id);
  const state = g.techState(id);
  const can = g.canResearch(id);
  return {
    id,
    title: n.name,
    branch: n.branch,
    cost: n.cost,
    state,
    stateText: TECH_STATE_TEXT[state],
    unlocks: techUnlockLines(n),
    requires: n.requires.map((r) => ({ id: r, name: techNode(r).name, done: g.researched.has(r) })),
    reason: can.ok || state === 'done' ? undefined : can.reason,
    recommended: g.recommendedTech() === id,
  };
}

// ---------- búsqueda y filtros ----------

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿Coincide el nodo con la búsqueda? Mira el nombre, la rama y lo que desbloquea (sin acentos ni mayúsculas). */
export function techMatches(n: TechNode, query: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  return norm([n.name, n.branch, ...techUnlockLines(n)].join(' ')).includes(q);
}

/** ¿Se ve el nodo con este filtro de rama y búsqueda? */
export function techVisible(n: TechNode, branch: TechBranch | null, query: string): boolean {
  return (!branch || n.branch === branch) && techMatches(n, query);
}
