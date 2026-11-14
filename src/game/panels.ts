/**
 * Lógica pura de los paneles (sin DOM): agrupación del Almacén por tipo y resúmenes de los paneles plegados.
 */
import { count, total } from './bag';
import { GROUP_NAMES, ITEM_GROUP, ItemGroup } from './descripciones';
import type { Game } from './game';
import { itemStatus, pendingNeed } from './tooltips';
import { ITEM_IDS, ItemId } from './types';

/** Orden de los grupos en el Almacén. */
export const GROUP_ORDER: ItemGroup[] = ['bruto', 'pieza', 'combustible', 'comida'];

export interface InventoryGroup {
  group: ItemGroup;
  name: string;
  items: [ItemId, number][];
}

/** Materiales del almacén agrupados por tipo (los grupos vacíos no salen) y en el orden de `ITEM_IDS`. */
export function groupInventory(g: Game): InventoryGroup[] {
  return GROUP_ORDER.map((group) => ({
    group,
    name: GROUP_NAMES[group],
    items: ITEM_IDS.filter((i) => ITEM_GROUP[i] === group && count(g.storage, i) > 0).map((i): [ItemId, number] => [i, count(g.storage, i)]),
  })).filter((x) => x.items.length > 0);
}

/** Resumen del Almacén cuando está plegado: tipos de material y cuántos faltan. */
export function inventorySummary(g: Game): string {
  const groups = groupInventory(g);
  const types = groups.reduce((n, x) => n + x.items.length, 0);
  // Sólo lo relevante: lo que tienes, lo que piden las obras pendientes y la comida (el hambre).
  const falta = ITEM_IDS.filter((i) => (count(g.storage, i) > 0 || pendingNeed(g, i) > 0 || i === 'food') && itemStatus(g, i).status === 'falta').length;
  return `${types} materiales${falta ? ` · ${falta} en falta` : ''}`;
}

/** Resumen del panel de NPCs: personas, libres y si hay hambre. */
export function npcSummary(g: Game): string {
  const busy = g.npcs.filter((n) => n.role !== 'mechanic' && (n.jobId !== null || total(n.carry) > 0)).length;
  const mech = g.npcs.filter((n) => n.role === 'mechanic').length;
  const free = g.population - busy - mech;
  return `${g.population}/${g.housingCapacity()} personas · ${free} libres${g.hungry ? ' · ¡hambre!' : ''}`;
}

/** Resumen de la cola de trabajos. */
export function jobsSummary(g: Game): string {
  const list = g.jobs.list();
  const waiting = list.filter((j) => j.npcId === null).length;
  return `${list.length} trabajos${waiting ? ` · ${waiting} esperando` : ''}`;
}
