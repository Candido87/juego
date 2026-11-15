/**
 * Contenido de los tooltips (lógica pura, sin DOM): qué mostrar para un botón de construcción, un material
 * del almacén o un indicador del HUD. La vista sólo le da formato. Los datos salen de `descripciones.ts` y `config.ts`.
 */
import { count, missing } from './bag';
import { CONFIG } from './config';
import { describeBuilding, describeItem, formatStat } from './descripciones';
import type { Game } from './game';
import { techLockText, techUnlockingBuilding } from './tecnologia';
import { BuildKind, BuildingKind, ItemId } from './types';

// ---------------------------------------------------------------- edificios

export interface CostLine {
  item: ItemId;
  need: number;
  have: number;
  /** Lo que tienes cubre lo que pide. */
  ok: boolean;
}

export interface BuildTip {
  kind: BuildingKind;
  title: string;
  que: string;
  sirve: string;
  cost: CostLine[];
  stats: string[];
  /** Motivo si está bloqueado (null = disponible). */
  locked: string | null;
  /** Atajo de teclado (1..9) si lo tiene. */
  key?: string;
}

/** Motivo por el que un edificio no se puede construir todavía (null = se puede). */
export function lockReason(g: Game, kind: BuildingKind): string | null {
  if (kind === 'core' || g.unlockedBuildings.has(kind as BuildKind)) return null;
  const node = techUnlockingBuilding(kind as BuildKind);
  return node ? `Requiere investigar ${techLockText(g, node)}` : 'Bloqueado: aún no hay tecnología que lo desbloquee';
}

export function buildTip(g: Game, kind: BuildingKind, key?: string): BuildTip {
  const info = describeBuilding(kind);
  return {
    kind,
    title: info.name,
    que: info.que,
    sirve: info.sirve,
    cost: info.cost.map(([item, need]) => {
      const have = count(g.storage, item);
      return { item, need, have, ok: have >= need };
    }),
    stats: info.stats.map(formatStat),
    locked: lockReason(g, kind),
    key,
  };
}

// ---------------------------------------------------------------- materiales

export type ItemStatus = 'falta' | 'sobra' | 'normal';

export interface ItemTip {
  item: ItemId;
  title: string;
  text: string;
  amount: number;
  producedIn: string[];
  usedIn: string[];
  status: ItemStatus;
  /** Explicación corta del estado ("" si es normal). */
  reason: string;
}

/** Lo que piden las obras pendientes de `item` y aún no tienen entregado. */
export function pendingNeed(g: Game, item: ItemId): number {
  let n = 0;
  for (const b of g.buildings.values()) {
    if (b.built) continue;
    n += count(missing(g.def(b.kind).cost, b.delivered), item);
  }
  return n;
}

/** Mayor cantidad de `item` que pide un edificio desbloqueado (0 si no se usa para construir). */
function maxCost(g: Game, item: ItemId): number {
  let m = 0;
  for (const k of g.unlockedBuildings) m = Math.max(m, CONFIG.buildings[k].cost[item] ?? 0);
  return m;
}

/** ¿Hay algo desbloqueado que consuma este material (construcción, receta, munición o combustible)? */
function usedNow(g: Game, item: ItemId): boolean {
  if (maxCost(g, item) > 0) return true;
  if (item === 'food') return true;
  for (const id of g.unlockedRecipes) if ((CONFIG.recipes[id]?.inputs[item] ?? 0) > 0) return true;
  if (Object.values(CONFIG.turrets).some((t) => t.ammo === item)) return true;
  return Object.values(CONFIG.power.generators).some((gen) => gen.fuel === item);
}

/** ¿Falta o sobra? Reglas simples y explicadas en SPEC.md. */
export function itemStatus(g: Game, item: ItemId): { status: ItemStatus; reason: string } {
  const amount = count(g.storage, item);
  const U = CONFIG.ui;
  if (item === 'food') {
    const perMin = g.foodPerMinute();
    if (g.hungry) return { status: 'falta', reason: 'Hay hambre: no queda comida.' };
    if (perMin > 0 && amount / perMin < U.foodLowMinutes) return { status: 'falta', reason: 'Queda comida para menos de un minuto y medio.' };
    if (perMin > 0 && amount / perMin >= U.foodSurplusMinutes) return { status: 'sobra', reason: 'Hay comida de sobra: la población puede crecer.' };
    return { status: 'normal', reason: '' };
  }
  const need = pendingNeed(g, item);
  if (need > amount) return { status: 'falta', reason: `Las obras pendientes piden ${need} y sólo hay ${amount}.` };
  if (amount === 0 && usedNow(g, item)) return { status: 'falta', reason: 'No queda nada y se usa en cosas que puedes construir o fabricar.' };
  const limit = maxCost(g, item) > 0 ? maxCost(g, item) * U.surplusFactor : U.surplusFallback;
  if (need === 0 && amount >= limit) return { status: 'sobra', reason: 'Tienes de sobra para lo que se gasta ahora.' };
  return { status: 'normal', reason: '' };
}

export function itemTip(g: Game, item: ItemId): ItemTip {
  const info = describeItem(item);
  const st = itemStatus(g, item);
  return { item, title: info.name, text: info.text, amount: count(g.storage, item), producedIn: info.producedIn, usedIn: info.usedIn, ...st };
}

// ---------------------------------------------------------------- HUD

export const HUD_KEYS = ['core', 'wave', 'population', 'food', 'gasoline', 'energy'] as const;
export type HudKey = (typeof HUD_KEYS)[number];

export interface HudTip {
  key: HudKey;
  title: string;
  /** Qué significa el número. */
  means: string;
  /** Qué pasa si llega a cero (o se descompensa). */
  zero: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Explicación de cada indicador del HUD, con los números de config.ts. */
export function hudTip(g: Game, key: HudKey): HudTip {
  const F = CONFIG.food;
  switch (key) {
    case 'core':
      return {
        key,
        title: 'Núcleo',
        means: `Vida del núcleo (máximo ${CONFIG.coreHp}). Los enemigos que llegan hasta él le restan vida.`,
        zero: 'Si llega a 0 pierdes la partida.',
      };
    case 'wave':
      return {
        key,
        title: 'Oleada',
        means: `Número de oleadas que han llegado; cada ${CONFIG.waves.interval} s viene otra, con más enemigos y más fuertes. «Adelantar oleada» llama a la siguiente ya.`,
        zero: 'En la oleada 0 todavía no ha llegado ninguna: es tu tiempo de preparación.',
      };
    case 'population':
      return {
        key,
        title: 'Población',
        means: `Personas vivas / plazas de vivienda (núcleo ${CONFIG.housing.core}, cada casa ${CONFIG.housing.house}). Llega gente nueva cada ${CONFIG.growth.interval} s si hay plaza libre y al menos ${CONFIG.growth.foodMin} de comida.`,
        zero: 'Si llega a 0 pierdes la partida. Los enemigos y el hambre reducen la población.',
      };
    case 'food':
      return {
        key,
        title: 'Comida',
        means: `Comida en el almacén. La población consume ${r1(g.foodPerMinute())} por minuto (${F.perPerson} por persona cada ${F.interval} s). Las granjas la producen.`,
        zero: `Con 0 hay hambre: la gente trabaja y anda a ×${F.hungryFactor}, y tras ${F.starveGrace} s una persona se marcha cada ${F.leaveInterval} s.`,
      };
    case 'gasoline': {
      const gen = CONFIG.power.generators.generator!;
      return {
        key,
        title: 'Gasolina',
        means: `Gasolina en el almacén: el combustible de los generadores (cada uno quema 1 cada ${gen.burnTime} s). Se obtiene refinando petróleo.`,
        zero: 'Sin gasolina los generadores se paran, la red se apaga y las cintas dejan de moverse (los Transportistas lo hacen a mano).',
      };
    }
    case 'energy':
      return {
        key,
        title: 'Energía',
        means: 'Producción / consumo eléctrico de todas las redes, en energía por segundo. Se produce en generadores y paneles solares y se gasta en cintas, taladros, fábricas y torretas eléctricas.',
        zero: 'Si el consumo supera la producción hay apagón parcial: todo rinde menos, proporcionalmente (primero se sirven los consumidores críticos, como las torretas). Con 0 de producción las cintas se paran.',
      };
  }
}

/** Texto del coste en una línea (para pruebas y accesibilidad). */
export function costText(lines: CostLine[]): string {
  return lines.map((l) => `${l.need} ${CONFIG.items[l.item]}`).join(', ');
}
