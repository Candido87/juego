/**
 * Árbol de tecnología: consultas sobre los datos de `CONFIG.tech` (lógica pura, con tests). La compra y sus efectos
 * están en `Game.research`; la pantalla del árbol y los tooltips sólo leen de aquí.
 */
import { CONFIG, TECH_BRANCHES, TechBranch, TechNode } from './config';
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
