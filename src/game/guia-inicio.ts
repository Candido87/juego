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
import { BuildKind, Ore, Tile } from './types';
import { Diag, LinkSpec, diagnoseLink, diagnosePower, linkDone, powerStatus } from './guia-flujo';
import { oreAt } from './world';

export interface GuiaHighlight {
  /** Botón de la barra de construcción. */
  tool?: BuildKind;
  /** Elemento de la interfaz (id del DOM). */
  ui?: string;
  /** Zona del mapa que se señala con una flecha. */
  target?: 'iron' | 'sulfur' | 'stone' | 'oil' | 'enemy_path' | 'core';
  /** Dibuja las flechas de entrada/salida de los edificios de estos tipos. */
  ports?: BuildKind[];
  /** Dibuja el alcance de los postes (conexión de edificios y enlace entre postes). */
  poleRange?: boolean;
  /** Dibuja la ruta de ejemplo (casillas con flecha) del enlace del paso. */
  route?: boolean;
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
  /** Conexión que pide el paso (origen → destino): sirve para la ruta de ejemplo y los avisos. */
  link?: LinkSpec;
  /** Aviso concreto de por qué se ha atascado el jugador (null si todo va bien). */
  diagnose?: (g: Game) => Diag | null;
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

// Enlaces (origen → destino) que piden los pasos de cintas y tuberías.
export const L_IRON_STORE: LinkSpec = { from: 'drill', ore: [Ore.Iron], to: ['storage', 'core'] };
export const L_IRON_FACTORY: LinkSpec = { from: 'drill', ore: [Ore.Iron], to: ['factory'], skipLinkedTo: ['storage', 'core'] };
export const L_PLATES_STORE: LinkSpec = { from: 'factory', recipe: 'iron_plate', to: ['storage', 'core'] };
export const L_AMMO_TURRET: LinkSpec = { from: 'factory', recipe: 'ammo', to: ['turret_bullet'] };
export const L_PUMP_REFINERY: LinkSpec = { from: 'pump', to: ['refinery'] };
export const L_REFINERY_GEN: LinkSpec = { from: 'refinery', to: ['generator'] };

const anyBuilt = (g: Game, kinds: BuildKind[]) => built(g, (b) => kinds.includes(b.kind as BuildKind));
const WALLS: BuildKind[] = ['wall_wood', 'wall_stone', 'wall_metal'];
const consumers = (g: Game) => [...g.buildings.values()].filter((b) => b.built && ['belt', 'belt_fast', 'drill', 'factory', 'pump', 'refinery'].includes(b.kind));
const gens = (g: Game) => [...g.buildings.values()].filter((b) => b.built && CONFIG.power.generators[b.kind as BuildKind]?.fuel);

/** ¿Hay una red con producción y consumo (el HUD deja de marcar 0/0)? */
export const powered = (g: Game) => g.grid.nets.some((n) => n.production > 0 && n.demand > 0);

/** Pasos de la guía, en el orden eficiente: cintas, energía, defensa básica, petróleo, cadenas de producción y resto. */
export const GUIA_STEPS: GuiaStep[] = [
  { id: 'drill_iron', highlight: { tool: 'drill', target: 'iron', ports: ['drill'] }, build: 'drill', done: (g) => drillOn(g, [Ore.Iron]) },
  { id: 'storage', highlight: { tool: 'storage' }, build: 'storage', done: (g) => hasBuilt(g, 'storage') },
  {
    id: 'belt_connect',
    highlight: { tool: 'belt', ports: ['drill', 'storage'], route: true },
    build: 'belt',
    link: L_IRON_STORE,
    done: (g) => linkDone(g, L_IRON_STORE),
    diagnose: (g) => diagnoseLink(g, L_IRON_STORE, false),
  },
  { id: 'power_gen', highlight: { tool: 'generator', ports: ['generator'] }, build: 'generator', done: (g) => hasBuilt(g, 'generator') },
  {
    id: 'power_fuel',
    highlight: { tool: 'generator' },
    done: (g) => built(g, (b) => !!CONFIG.power.generators[b.kind as BuildKind]?.fuel && b.running),
    diagnose: (g) => {
      const ps = powerStatus(g);
      if (!ps.generators) return null;
      if (ps.running === 0 && ps.fuelLeft <= 0) return { code: 'no_fuel', text: 'No queda gasolina: sin ella el generador no arranca. Fabrica más con la bomba y la refinería (pasos de petróleo).' };
      return null;
    },
  },
  {
    id: 'power_poles',
    highlight: { tool: 'pole', poleRange: true },
    build: 'pole',
    done: (g) => powered(g),
    diagnose: (g) => {
      for (const b of [...gens(g), ...consumers(g)]) {
        if (g.netOf(b)) continue;
        return { code: 'no_pole', tile: { x: b.x, y: b.y }, text: `Esto no está en ninguna red: pon un poste a menos de ${CONFIG.power.supplyRadius} casillas y enlázalo con los demás (alcance ${CONFIG.power.wireRange}).` };
      }
      const b = consumers(g)[0];
      return b ? diagnosePower(g, b) : null;
    },
  },
  {
    id: 'belt_flow',
    highlight: { tool: 'belt', ports: ['drill', 'storage'] },
    link: L_IRON_STORE,
    done: (g) => (g.stats.beltTo.storage ?? 0) > 0,
    diagnose: (g) => diagnoseLink(g, L_IRON_STORE, true),
  },
  { id: 'farm', highlight: { tool: 'farm' }, build: 'farm', done: (g) => hasBuilt(g, 'farm') },
  {
    id: 'turret',
    highlight: { tool: 'turret_bullet', target: 'enemy_path', ports: ['turret_bullet'] },
    build: 'turret_bullet',
    done: (g) => built(g, (b) => b.kind === 'turret_bullet' && g.turretReady(b)),
  },
  { id: 'oil_pump', highlight: { tool: 'pump', target: 'oil', ports: ['pump'] }, build: 'pump', done: (g) => hasBuilt(g, 'pump') },
  {
    id: 'oil_refine',
    highlight: { tool: 'pipeline', ports: ['pump', 'refinery'], route: true },
    build: 'refinery',
    link: L_PUMP_REFINERY,
    done: (g) => (g.stats.pipeTo.refinery ?? 0) > 0,
    diagnose: (g) => (hasBuilt(g, 'refinery') ? diagnoseLink(g, L_PUMP_REFINERY, true) : { code: 'no_refinery', text: 'Falta la refinería: construye una cerca de la bomba (déjale sitio para las tuberías).' }),
  },
  {
    id: 'oil_fuel',
    highlight: { tool: 'pipeline', ports: ['refinery', 'generator'], route: true },
    link: L_REFINERY_GEN,
    done: (g) => (g.stats.pipeTo.generator ?? 0) > 0 && g.stats.refined > 0,
    diagnose: (g) => diagnoseLink(g, L_REFINERY_GEN, true),
  },
  { id: 'factory_plates', highlight: { tool: 'factory', ports: ['factory'] }, build: 'factory', recipe: 'iron_plate', done: (g) => factoryWith(g, 'iron_plate') },
  {
    id: 'chain_plates',
    highlight: { tool: 'belt', ports: ['drill', 'factory', 'storage'], route: true },
    build: 'belt',
    link: L_IRON_FACTORY,
    done: (g) => (g.stats.beltTo.factory ?? 0) > 0 && g.stats.manufacturedStored > 0,
    diagnose: (g) => diagnoseLink(g, L_IRON_FACTORY, true) ?? diagnoseLink(g, L_PLATES_STORE, true),
  },
  { id: 'drill_sulfur', highlight: { tool: 'drill', target: 'sulfur' }, build: 'drill', done: (g) => drillOn(g, [Ore.Sulfur]) },
  { id: 'drill_stone', highlight: { tool: 'drill', target: 'stone' }, build: 'drill', done: (g) => drillOn(g, [Ore.Stone]) },
  { id: 'factory_ammo', highlight: { tool: 'factory', ports: ['factory'] }, build: 'factory', recipe: 'ammo', done: (g) => factoryWith(g, 'ammo') },
  { id: 'factory_gun', highlight: { tool: 'factory' }, build: 'factory', recipe: 'gun_part', done: (g) => factoryWith(g, 'gun_part') },
  {
    id: 'chain_ammo',
    highlight: { tool: 'belt', ports: ['factory', 'turret_bullet'], route: true },
    build: 'belt',
    link: L_AMMO_TURRET,
    done: (g) => (g.stats.beltTo.turret_bullet ?? 0) > 0,
    diagnose: (g) => diagnoseLink(g, L_AMMO_TURRET, true),
  },
  // Los muros se investigan en el árbol: el paso sólo aparece cuando ya se pueden construir.
  { id: 'walls', highlight: { tool: 'wall_wood', target: 'enemy_path' }, build: 'wall_wood', when: (g) => WALLS.some((k) => g.unlockedBuildings.has(k)), done: (g) => anyBuilt(g, WALLS) },
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

// ---------------------------------------------------------------- casilla señalada

/** Casilla que debe señalar la flecha de un paso: mena libre más cercana al núcleo, tramo de camino enemigo o el núcleo. */
export function guideTargetTile(g: Game, target: NonNullable<GuiaHighlight['target']>): Tile | null {
  const cx = g.core.x + g.core.w / 2;
  const cy = g.core.y + g.core.d / 2;
  if (target === 'core') return { x: g.core.x, y: g.core.y };
  if (target === 'enemy_path') {
    const sp = g.spawns[0];
    if (!sp) return null;
    const path = g.pathFrom(sp);
    // Un tramo a unas 8 casillas del núcleo: sitio razonable para la primera torreta.
    return path[Math.max(0, path.length - 1 - CONFIG.guia.pathMarkDistance)] ?? null;
  }
  const ores: Ore[] = target === 'iron' ? [Ore.Iron] : target === 'sulfur' ? [Ore.Sulfur] : target === 'oil' ? [Ore.Oil] : [Ore.Stone, Ore.Coal];
  let best: Tile | null = null;
  let bd = Infinity;
  for (let y = 0; y < g.world.h; y++) {
    for (let x = 0; x < g.world.w; x++) {
      if (!ores.includes(oreAt(g.world, x, y)) || g.buildingAt(x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  }
  return best;
}
