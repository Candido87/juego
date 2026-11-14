/**
 * Lógica del menú de construcción por categorías (pura, sin DOM): qué botones tiene cada categoría,
 * cuáles están bloqueados y por qué, y cómo se cambia de categoría.
 */
import { CATEGORIES, Category, CategoryId, categoryOf } from './descripciones';
import type { Game } from './game';
import { lockReason } from './tooltips';
import { BuildKind } from './types';

export interface MenuEntry {
  kind: BuildKind;
  /** Atajo de teclado (1..9) según la posición en la categoría; vacío a partir del décimo. */
  key: string;
  /** Motivo del bloqueo (null = se puede construir). */
  locked: string | null;
}

export const category = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id)!;

/** Botones de una categoría, en orden, con su atajo y su bloqueo. */
export function menuEntries(g: Game, id: CategoryId): MenuEntry[] {
  return category(id).kinds.map((kind, i) => ({ kind, key: i < 9 ? String(i + 1) : '', locked: lockReason(g, kind) }));
}

/** Categoría siguiente (+1) o anterior (−1), dando la vuelta. */
export function cycleCategory(current: CategoryId, dir: 1 | -1): CategoryId {
  const i = CATEGORIES.findIndex((c) => c.id === current);
  return CATEGORIES[(i + dir + CATEGORIES.length) % CATEGORIES.length].id;
}

/** Edificio que corresponde a la tecla numérica `n` (1..9) en la categoría, si existe. */
export function kindForKey(id: CategoryId, n: number): BuildKind | undefined {
  return category(id).kinds[n - 1];
}

/** ¿Tiene la categoría algo construible ahora? (para atenuar pestañas vacías) */
export function categoryAvailable(g: Game, id: CategoryId): boolean {
  return menuEntries(g, id).some((e) => !e.locked);
}

export { categoryOf };
