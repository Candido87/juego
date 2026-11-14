/**
 * Guía de inicio (lógica pura, sin Phaser ni DOM): avisos ligeros que proponen UN objetivo cada vez para empezar bien.
 *
 * Es un modo distinto del tutorial guiado (`tutorial.ts`, partida aparte con ayudas): aquí se juega la partida normal,
 * no se reponen recursos ni se bloquea nada. Los pasos son datos: id, condición de cumplimiento, resalte y, si procede,
 * cuándo aparecen (`when`). Un paso se cumple solo cuando el estado del juego lo cumple (aunque el jugador lo haya hecho
 * antes o en otro orden). Los textos, en `guia-inicio-textos.ts`.
 */
import { CONFIG } from './config';
import type { Building, Game } from './game';
import { BuildKind, Ore } from './types';
import { oreAt } from './world';

export interface GuiaHighlight {
  /** Botón de la barra de construcción. */
  tool?: BuildKind;
  /** Elemento de la interfaz (id del DOM). */
  ui?: string;
  /** Zona del mapa que se señala con una flecha. */
  target?: 'iron' | 'stone' | 'enemy_path' | 'core';
}

export interface GuiaStep {
  id: string;
  highlight?: GuiaHighlight;
  /** Edificio que pide construir (para avisar de lo que falta). */
  build?: BuildKind;
  /** Receta que pide elegir en una fábrica. */
  recipe?: string;
  /** Pasos con hora: preceden a los demás cuando su `when` se cumple. */
  urgent?: boolean;
  /** Sólo se propone cuando esto es cierto. */
  when?: (g: Game, s: GuiaState) => boolean;
  /** Condición de cumplimiento. */
  done: (g: Game, s: GuiaState) => boolean;
}

export interface GuiaState {
  completed: string[];
  /** Observaciones del juego (wave_seen, next_ack...). */
  flags: string[];
  /** Pasos cuyo aviso cerró el jugador (no vuelve a mostrarse). */
  hidden: string[];
  /** La guía está desactivada (no se repite en otras partidas). */
  disabled: boolean;
}

export const newGuiaState = (): GuiaState => ({ completed: [], flags: [], hidden: [], disabled: false });

// ---------------------------------------------------------------- consultas

const built = (g: Game, pred: (b: Building) => boolean): boolean => {
  for (const b of g.buildings.values()) if (b.built && pred(b)) return true;
  return false;
};

const hasBuilt = (g: Game, kind: BuildKind) => built(g, (b) => b.kind === kind);
const drillOn = (g: Game, ores: Ore[]) => built(g, (b) => b.kind === 'drill' && ores.includes(oreAt(g.world, b.x, b.y)));
const factoryWith = (g: Game, recipe: string) => built(g, (b) => b.kind === 'factory' && b.recipe === recipe);
const flag = (s: GuiaState, f: string) => s.flags.includes(f);

/** Pasos de la guía, en el orden eficiente: primero recursos, luego componentes, luego defensa. */
export const GUIA_STEPS: GuiaStep[] = [
  { id: 'drill_iron', highlight: { tool: 'drill', target: 'iron' }, build: 'drill', done: (g) => drillOn(g, [Ore.Iron]) },
  { id: 'storage', highlight: { tool: 'storage' }, build: 'storage', done: (g) => hasBuilt(g, 'storage') && (g.storage.iron_ore ?? 0) > 0 },
  { id: 'factory_plates', highlight: { tool: 'factory' }, build: 'factory', recipe: 'iron_plate', done: (g) => factoryWith(g, 'iron_plate') },
  { id: 'farm', highlight: { tool: 'farm' }, build: 'farm', done: (g) => hasBuilt(g, 'farm') },
  { id: 'drill_stone', highlight: { tool: 'drill', target: 'stone' }, build: 'drill', done: (g) => drillOn(g, [Ore.Stone, Ore.Coal]) },
  { id: 'factory_ammo', highlight: { tool: 'factory' }, build: 'factory', recipe: 'ammo', done: (g) => factoryWith(g, 'ammo') },
  { id: 'factory_gun', highlight: { tool: 'factory' }, build: 'factory', recipe: 'gun_part', done: (g) => factoryWith(g, 'gun_part') },
  {
    id: 'turret',
    highlight: { tool: 'turret_bullet', target: 'enemy_path' },
    build: 'turret_bullet',
    done: (g) => built(g, (b) => b.kind === 'turret_bullet' && g.turretReady(b)),
  },
  {
    id: 'wave_soon',
    urgent: true,
    highlight: { target: 'enemy_path', ui: 'hud' },
    when: (g) => g.wave === 0 && g.nextWaveIn <= CONFIG.guia.waveWarning,
    done: (g) => g.wave >= 1,
  },
  {
    id: 'wave_now',
    urgent: true,
    highlight: { ui: 'selected' },
    when: (g) => g.wave >= 1 && g.enemies.length > 0,
    done: (g, s) => flag(s, 'wave_seen') && g.enemies.length === 0,
  },
  {
    id: 'next',
    highlight: { tool: 'workshop' },
    when: (g, s) => flag(s, 'wave_seen') && g.enemies.length === 0,
    done: (g, s) => hasBuilt(g, 'workshop') || flag(s, 'next_ack'),
  },
];

// ---------------------------------------------------------------- máquina de pasos

export interface GuiaEvent {
  type: 'completed';
  id: string;
}

/** Paso a mostrar ahora: el urgente que toque; si no, el primero sin cumplir (y cuyo `when`, si lo tiene, se cumple). */
export function currentStep(g: Game, s: GuiaState): GuiaStep | undefined {
  if (s.disabled) return undefined;
  const pending = GUIA_STEPS.filter((st) => !s.completed.includes(st.id) && (!st.when || st.when(g, s)));
  return pending.find((st) => st.urgent) ?? pending[0];
}

/** Paso visible (el actual, salvo que el jugador haya cerrado su aviso). */
export function visibleStep(g: Game, s: GuiaState): GuiaStep | undefined {
  const st = currentStep(g, s);
  return st && !s.hidden.includes(st.id) ? st : undefined;
}

/** Posición del paso entre los que no son urgentes: "paso N de M". */
export function guiaProgress(s: GuiaState): { n: number; total: number } {
  const regular = GUIA_STEPS.filter((st) => !st.urgent);
  return { n: Math.min(regular.filter((st) => s.completed.includes(st.id)).length + 1, regular.length), total: regular.length };
}

export function setGuiaFlag(s: GuiaState, f: string): void {
  if (!s.flags.includes(f)) s.flags.push(f);
}

/** Actualiza el estado: anota observaciones y completa los pasos cuya condición ya se cumple. Devuelve lo que se completó. */
export function stepGuia(g: Game, s: GuiaState): GuiaEvent[] {
  const out: GuiaEvent[] = [];
  if (s.disabled) return out;
  if (g.wave >= 1 && g.enemies.length > 0) setGuiaFlag(s, 'wave_seen');
  for (const st of GUIA_STEPS) {
    if (s.completed.includes(st.id)) continue;
    if (st.done(g, s)) {
      s.completed.push(st.id);
      out.push({ type: 'completed', id: st.id });
    }
  }
  return out;
}

/** Cierra el aviso actual (no vuelve a salir; el paso sigue pendiente). */
export function dismissCurrent(g: Game, s: GuiaState): void {
  const st = currentStep(g, s);
  if (st && !s.hidden.includes(st.id)) s.hidden.push(st.id);
}

/** Desactiva toda la guía (no se repite en otras partidas). */
export function disableGuia(s: GuiaState): void {
  s.disabled = true;
}

/** Vuelve a abrir la guía desde el principio (los pasos ya cumplidos se saltan solos). */
export function reopenGuia(s: GuiaState): void {
  s.disabled = false;
  s.completed = [];
  s.hidden = [];
  s.flags = [];
}

/** Nueva partida: la guía vuelve a empezar salvo que el jugador la haya desactivado. */
export function resetForNewGame(s: GuiaState): GuiaState {
  const n = newGuiaState();
  n.disabled = s.disabled;
  return n;
}

// ---------------------------------------------------------------- guardado

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function saveGuia(store: KV, s: GuiaState): void {
  store.setItem(CONFIG.guia.storageKey, JSON.stringify(s));
}

export function loadGuia(store: KV): GuiaState {
  try {
    const raw = store.getItem(CONFIG.guia.storageKey);
    if (!raw) return newGuiaState();
    const o = JSON.parse(raw) as Partial<GuiaState>;
    const ids = new Set(GUIA_STEPS.map((x) => x.id));
    const list = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
    return { completed: list(o.completed).filter((x) => ids.has(x)), flags: list(o.flags), hidden: list(o.hidden).filter((x) => ids.has(x)), disabled: !!o.disabled };
  } catch {
    return newGuiaState();
  }
}

// ---------------------------------------------------------------- ayudas

/** Lo que falta en el almacén para construir el edificio de un paso (vacío si no pide o ya lo tiene). */
export function shortage(g: Game, st: GuiaStep): Record<string, number> {
  const out: Record<string, number> = {};
  if (!st.build) return out;
  const cost = (CONFIG.buildings[st.build]?.cost ?? {}) as Record<string, number>;
  for (const [item, n] of Object.entries(cost)) {
    const m = n - ((g.storage as Record<string, number>)[item] ?? 0);
    if (m > 0) out[item] = m;
  }
  return out;
}
