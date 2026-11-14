/**
 * Lógica pura (sin DOM) del panel de recetas de una fábrica: qué recetas hay, en qué categoría, cuáles se pueden elegir
 * y por qué no, y los textos automáticos de "qué produce, para qué sirve y dónde se necesita" (salen de config.ts).
 */
import { entries } from './bag';
import { CONFIG, RECIPE_CATEGORIES, RecipeCategory } from './config';
import { itemUsedIn } from './descripciones';
import type { Building, Game } from './game';
import type { ItemId } from './types';

export interface RecipeEntry {
  id: string;
  name: string;
  category: RecipeCategory;
  inputs: [ItemId, number][];
  outputs: [ItemId, number][];
  time: number;
  /** Energía que consume mientras fabrica (unidades/s de la red eléctrica). */
  energy: number;
  /** ¿Se puede elegir en esta fábrica? */
  available: boolean;
  /** Motivo si no está disponible. */
  reason?: string;
  /** ¿Es la receta actual de la fábrica? */
  selected: boolean;
}

/** Recetas que se fabrican en una fábrica genérica (la refinería tiene la suya). */
export const factoryRecipeIds = (): string[] => Object.keys(CONFIG.recipes).filter((id) => (CONFIG.recipes[id].building ?? 'factory') === 'factory');

/** Motivo por el que una receta no se puede elegir (undefined si se puede). */
export function recipeBlockedReason(g: Game, id: string): string | undefined {
  const r = CONFIG.recipes[id];
  if (!g.unlockedRecipes.has(id)) return 'Sin investigar: se desbloquea en el árbol de tecnología';
  if (r.tier > CONFIG.factory.tier) return `Necesita una fábrica de nivel ${r.tier}`;
  return undefined;
}

export function recipeEntries(g: Game, b: Building | null, category?: RecipeCategory): RecipeEntry[] {
  return factoryRecipeIds()
    .filter((id) => !category || CONFIG.recipes[id].category === category)
    .map((id): RecipeEntry => {
      const r = CONFIG.recipes[id];
      const reason = recipeBlockedReason(g, id);
      return {
        id,
        name: r.name,
        category: r.category,
        inputs: entries(r.inputs),
        outputs: entries(r.outputs),
        time: r.time,
        energy: CONFIG.power.demand.factory ?? 0,
        available: !reason,
        reason,
        selected: !!b && b.recipe === id,
      };
    });
}

/** Categorías con recetas (con cuántas hay y cuántas se pueden elegir). */
export function recipeCategories(g: Game): { id: RecipeCategory; name: string; total: number; available: number }[] {
  return RECIPE_CATEGORIES.map((c) => {
    const list = recipeEntries(g, null, c.id);
    return { id: c.id, name: c.name, total: list.length, available: list.filter((e) => e.available).length };
  }).filter((c) => c.total > 0);
}

const itemName = (i: ItemId) => CONFIG.items[i];
const bagText = (list: [ItemId, number][]) => list.map(([i, n]) => `${n} ${itemName(i)}`).join(' + ');

/** "1 Placa de hierro + 1 Azufre → 6 Munición". */
export const recipeFormula = (e: Pick<RecipeEntry, 'inputs' | 'outputs'>) => `${bagText(e.inputs)} → ${bagText(e.outputs)}`;

export interface RecipeTip {
  id: string;
  title: string;
  formula: string;
  time: number;
  energy: number;
  /** Qué produce. */
  produces: string;
  /** Para qué se usa y dónde se necesita (calculado de costes, recetas, munición, combustible). */
  usedIn: string[];
  reason?: string;
}

/** Texto automático de una receta: lo que produce, para qué sirve y dónde se necesita. */
export function recipeTip(g: Game, id: string): RecipeTip {
  const e = recipeEntries(g, null).find((x) => x.id === id)!;
  const used = new Set<string>();
  for (const [item] of e.outputs) for (const u of itemUsedIn(item)) used.add(u);
  return {
    id,
    title: e.name,
    formula: recipeFormula(e),
    time: e.time,
    energy: e.energy,
    produces: e.outputs.map(([i, n]) => `${n} × ${itemName(i)}`).join(', '),
    usedIn: [...used],
    reason: e.reason,
  };
}

/** Texto y color del estado de una fábrica (para el panel y el indicador sobre el edificio). */
export function factoryStatusText(g: Game, b: Building): { text: string; tone: 'good' | 'warn' | 'bad' | 'muted'; short: string } {
  const st = g.factoryStatus(b);
  switch (st.state) {
    case 'norecipe':
      return { text: 'Sin receta: elige una receta para que produzca', tone: 'bad', short: 'elige una receta' };
    case 'missing': {
      const names = (st.missing ?? []).map((i) => CONFIG.items[i]).join(', ');
      return { text: `Falta material: ${names}`, tone: 'warn', short: `falta ${names}` };
    }
    case 'full':
      return { text: 'Salida llena: esperando que se recoja', tone: 'warn', short: 'salida llena' };
    case 'producing':
      return st.lowPower
        ? { text: 'Produciendo despacio: sin energía de la red', tone: 'warn', short: 'sin energía' }
        : { text: 'Produciendo', tone: 'good', short: 'produciendo' };
    default:
      return { text: '', tone: 'muted', short: '' };
  }
}
