/**
 * Árbol de tecnología: consultas sobre los datos de `CONFIG.tech` (lógica pura, con tests). La compra y sus efectos
 * están en `Game.research`; la pantalla del árbol y los tooltips sólo leen de aquí.
 */
import { CONFIG, TECH_BRANCHES, TechBranch, TechNode } from './config';
import type { Game } from './game';
import type { BuildKind } from './types';

const BY_ID = new Map<string, TechNode>();
const index = (): Map<string, TechNode> => {
  if (BY_ID.size !== CONFIG.tech.length) {
    BY_ID.clear();
    for (const n of CONFIG.tech) BY_ID.set(n.id, n);
  }
  return BY_ID;
};

/** Nodo por id (lanza si no existe: un id inválido es un error de datos). */
export function techNode(id: string): TechNode {
  const n = index().get(id);
  if (!n) throw new Error(`Tecnología desconocida: ${id}`);
  return n;
}

export const techExists = (id: string): boolean => index().has(id);

/** Nodos de una rama, por columna y coste. */
export function techOfBranch(branch: TechBranch): TechNode[] {
  return CONFIG.tech.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.id.localeCompare(b.id));
}

export { TECH_BRANCHES };

/** Nodo que desbloquea un edificio (undefined si viene desbloqueado de inicio). */
export function techUnlockingBuilding(kind: BuildKind): TechNode | undefined {
  return CONFIG.tech.find((n) => n.unlocks.buildings?.includes(kind));
}

/** Nodo que desbloquea una receta (undefined si viene desbloqueada de inicio). */
export function techUnlockingRecipe(id: string): TechNode | undefined {
  return CONFIG.tech.find((n) => n.unlocks.recipes?.includes(id));
}

/** Nodos que dependen de este (para dibujar las líneas del árbol hacia delante). */
export function techDependents(id: string): TechNode[] {
  return CONFIG.tech.filter((n) => n.requires.includes(id));
}

/** Coste total en puntos de un nodo y de todos sus requisitos que aún faltan (para saber "cuánto falta" de una meta). */
export function techPathCost(id: string, done: ReadonlySet<string>): number {
  const seen = new Set<string>();
  const walk = (x: string): number => {
    if (done.has(x) || seen.has(x)) return 0;
    seen.add(x);
    const n = techNode(x);
    return n.cost + n.requires.reduce((s, r) => s + walk(r), 0);
  };
  return walk(id);
}

/** Nodo que sube las fábricas al nivel `tier` (undefined si ya viene de inicio). */
export function techUnlockingTier(tier: number): TechNode | undefined {
  return CONFIG.tech.filter((n) => (n.effects?.factoryTier ?? 0) >= tier).sort((a, b) => (a.effects!.factoryTier! - b.effects!.factoryTier!) || a.cost - b.cost)[0];
}

/** Nombre, rama y coste de un nodo, para los mensajes de bloqueo: «Torreta láser» (Armamento, 35 puntos). */
export const techLabel = (n: TechNode): string => `«${n.name}» (${n.branch}, ${n.cost} puntos)`;

/**
 * Texto de "qué falta" para un nodo que desbloquea algo: cuál es, y si ya se puede comprar, si faltan puntos o si antes hay
 * que investigar otro. Lo usan el menú de construcción, los tooltips, el panel de recetas y los avisos.
 */
export function techLockText(g: Game, n: TechNode): string {
  const st = g.techState(n.id);
  if (st === 'available') return `${techLabel(n)}: ya tienes los puntos, pulsa T para investigarlo`;
  if (st === 'locked') return `${techLabel(n)}: antes investiga ${n.requires.filter((r) => !g.researched.has(r)).map((r) => `«${techNode(r).name}»`).join(' y ')}`;
  if (st === 'nopoints') return `${techLabel(n)}: te faltan ${Math.ceil(n.cost - g.researchPoints)} puntos`;
  return techLabel(n);
}
