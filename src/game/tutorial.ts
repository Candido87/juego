/**
 * Motor del tutorial (lógica pura, sin Phaser ni DOM).
 *
 * Los pasos son DATOS (`TUTORIAL_STEPS`): id, condición de cumplimiento, resalte y recursos que se reponen.
 * Un paso se completa solo cuando el estado del juego (o un gesto que la vista anota con `flag`) cumple su condición;
 * nunca con un botón "siguiente". Si el jugador ya hizo algo antes de tiempo, el paso se da por cumplido.
 * Los textos están en `tutorialText.ts`.
 */
import { add, count, entries } from './bag';
import { CONFIG } from './config';
import { Game } from './game';
import { powerMult } from './power';
import type { Bag, BuildKind, BuildingKind } from './types';
import { generateWorld } from './world';

/** Qué debe resaltar la interfaz en un paso. */
export interface Highlight {
  /** Botón de la barra de construcción. */
  tool?: BuildKind;
  /** Elemento de la interfaz (id del DOM). */
  ui?: string;
  /** Casilla/zona del mapa que conviene señalar con una flecha. */
  target?: 'iron' | 'oil' | 'core' | 'enemy_path';
  /** Atenuar el resto de la pantalla. */
  dim?: boolean;
}

export interface TutorialStep {
  id: string;
  highlight?: Highlight;
  /** Mínimos que se reponen en el almacén al activarse el paso, para no atascarse. */
  ensure?: Bag;
  /** Edificios que se desbloquean (sólo en la partida del tutorial). */
  unlock?: BuildKind[];
  /** Si devuelve false el paso no existe aún en este juego y se salta solo. */
  available?: (g: Game) => boolean;
  /** Condición de cumplimiento. */
  done: (g: Game, s: TutorialState) => boolean;
}

export interface TutorialState {
  /** Índice del paso actual (== pasos.length cuando acaba). */
  index: number;
  /** Último paso al que se le aplicó `ensure`/`unlock` (para hacerlo una sola vez). */
  entered: number;
  completed: string[];
  skipped: string[];
  /** Gestos de la vista (cámara, zoom, herramienta elegida, final aceptado...). */
  flags: string[];
  finished: boolean;
}

export const newTutorialState = (): TutorialState => ({ index: 0, entered: -1, completed: [], skipped: [], flags: [], finished: false });

// ---------------------------------------------------------------- consultas del estado del juego

const exists = (g: Game, pred: (b: ReturnType<Game['buildings']['values']> extends IterableIterator<infer B> ? B : never) => boolean) => {
  for (const b of g.buildings.values()) if (pred(b)) return true;
  return false;
};
const has = (g: Game, kind: BuildingKind, built = false) => exists(g, (b) => b.kind === kind && (!built || b.built));
const flag = (s: TutorialState, f: string) => s.flags.includes(f);
const ORES = ['iron_ore', 'copper_ore', 'coal', 'stone'] as const;

/** Pasos del tutorial, en orden. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'camera', highlight: { ui: 'hud' }, done: (_g, s) => flag(s, 'camera_moved') && flag(s, 'zoomed') },
  { id: 'tool', highlight: { ui: 'toolbar' }, done: (_g, s) => flag(s, 'tool_selected') },
  {
    id: 'drill',
    highlight: { tool: 'drill', target: 'iron' },
    ensure: { frame: 1, gear: 2 },
    done: (g) => has(g, 'drill'),
  },
  {
    id: 'manual',
    highlight: { ui: 'jobs' },
    done: (g) => ORES.some((o) => count(g.storage, o) > 0),
  },
  {
    id: 'components',
    highlight: { tool: 'factory' },
    ensure: { frame: 3, gear: 2, iron_plate: 6 },
    done: (g) => exists(g, (b) => b.kind === 'factory' && b.built && !!b.recipe && CONFIG.components.includes(Object.keys(CONFIG.recipes[b.recipe].outputs)[0] as never)),
  },
  { id: 'belts', highlight: { tool: 'belt' }, ensure: { gear: 3 }, done: (g) => has(g, 'belt') },
  {
    id: 'oil',
    highlight: { tool: 'pump', target: 'oil' },
    ensure: { pipe: 5, frame: 5, gear: 3 },
    done: (g) => has(g, 'pump') && has(g, 'refinery'),
  },
  {
    id: 'power',
    highlight: { tool: 'generator' },
    ensure: { frame: 4, gear: 3, wire: 6, gasoline: 4 },
    done: (g) =>
      exists(g, (b) => b.kind === 'generator' && b.built && b.running) &&
      exists(g, (b) => (b.kind === 'belt' || b.kind === 'belt_fast') && b.built && powerMult(b) > 0),
  },
  {
    id: 'food',
    highlight: { tool: 'farm' },
    ensure: { frame: 4, gear: 2, wood: 4 },
    done: (g) => has(g, 'farm', true) && has(g, 'house', true),
  },
  {
    id: 'turret',
    highlight: { tool: 'turret_bullet', target: 'enemy_path' },
    ensure: { frame: 2, gun_part: 2, ammo: 10 },
    done: (g) => exists(g, (b) => b.kind === 'turret_bullet' && b.built && g.turretReady(b)),
  },
  {
    id: 'walls',
    highlight: { tool: 'wall_wood' },
    ensure: { frame: 2, wood: 6 },
    unlock: ['wall_wood'],
    done: (g) => exists(g, (b) => b.kind.startsWith('wall_')),
  },
  {
    id: 'wave',
    highlight: { target: 'enemy_path' },
    done: (g) => g.wave >= 1 && g.enemies.length === 0 && g.stats.kills >= CONFIG.tutorial.waveKills,
  },
  {
    id: 'workshop',
    highlight: { tool: 'workshop' },
    ensure: { tool_kit: 4, frame: 3 },
    done: (g) => g.npcs.filter((n) => n.role === 'mechanic').length >= CONFIG.workshop.workers,
  },
  {
    id: 'lab',
    highlight: { ui: 'techBtn' },
    // Disponible cuando el juego tenga laboratorio (hito M4 del encargo de menús).
    available: () => 'lab' in CONFIG.buildings,
    done: () => false,
  },
  { id: 'finish', highlight: { ui: 'hud' }, done: (_g, s) => flag(s, 'finish') },
];

// ---------------------------------------------------------------- máquina de pasos

export const stepAt = (s: TutorialState): TutorialStep | undefined => TUTORIAL_STEPS[s.index];

/** Pasos que existen en este juego (los no disponibles no cuentan en "paso N de M"). */
export function activeSteps(g: Game): TutorialStep[] {
  return TUTORIAL_STEPS.filter((st) => !st.available || st.available(g));
}

/** Posición (1..M) del paso actual entre los disponibles. */
export function progress(g: Game, s: TutorialState): { n: number; total: number } {
  const act = activeSteps(g);
  const cur = stepAt(s);
  const total = act.length;
  if (!cur) return { n: total, total };
  const i = act.findIndex((st) => st.id === cur.id);
  return { n: i < 0 ? Math.min(s.completed.length + 1, total) : i + 1, total };
}

/** Anota un gesto de la vista ('camera_moved', 'zoomed', 'tool_selected', 'finish'...). */
export function setFlag(s: TutorialState, f: string): void {
  if (!s.flags.includes(f)) s.flags.push(f);
}

/** Repone lo necesario para el paso (sin pasarse): sólo sube lo que falte. */
export function applyEnsure(g: Game, ensure: Bag | undefined): void {
  for (const [item, n] of entries(ensure ?? {})) {
    const have = count(g.storage, item);
    if (have < n) add(g.storage, item, n - have);
  }
}

/**
 * Avanza lo que se pueda: aplica `ensure` al entrar en un paso, completa los cumplidos y salta los no disponibles.
 * Devuelve true si algo cambió.
 */
export function stepTutorial(g: Game, s: TutorialState): boolean {
  let changed = false;
  while (!s.finished) {
    const st = stepAt(s);
    if (!st) {
      s.finished = true;
      changed = true;
      break;
    }
    if (st.available && !st.available(g)) {
      s.skipped.push(st.id);
      s.index++;
      changed = true;
      continue;
    }
    if (s.entered !== s.index) {
      s.entered = s.index;
      applyEnsure(g, st.ensure);
      for (const k of st.unlock ?? []) g.unlockedBuildings.add(k);
      changed = true;
    }
    if (!st.done(g, s)) break;
    s.completed.push(st.id);
    s.index++;
    changed = true;
  }
  if (s.index >= TUTORIAL_STEPS.length) s.finished = true;
  return changed;
}

/** Salta el paso actual. */
export function skipStep(s: TutorialState): void {
  const st = stepAt(s);
  if (!st) return;
  s.skipped.push(st.id);
  s.index++;
  if (s.index >= TUTORIAL_STEPS.length) s.finished = true;
}

/** Salta todo el tutorial. */
export function skipAll(s: TutorialState): void {
  while (!s.finished) skipStep(s);
}

// ---------------------------------------------------------------- partida del tutorial

/** Crea la partida del tutorial: mapa pequeño con semilla fija, almacén propio y sin oleadas hasta el paso de la oleada. */
export function createTutorialGame(): Game {
  const T = CONFIG.tutorial;
  const g = new Game({ world: generateWorld(T.seed, T.mapW, T.mapH) });
  for (const k of Object.keys(g.storage)) delete (g.storage as Bag)[k as keyof Bag];
  Object.assign(g.storage, T.startItems);
  g.nextWaveIn = Infinity;
  return g;
}

/**
 * Reglas propias del tutorial que se aplican cada paso de simulación (no tocan el juego normal):
 * - las oleadas sólo ocurren durante el paso "wave" (una, la primera);
 * - antes del taller se acelera la llegada de gente si hay plaza.
 */
export function tutorialTick(g: Game, s: TutorialState): void {
  const st = stepAt(s);
  g.coreHp = Math.max(g.coreHp, CONFIG.tutorial.minCoreHp);
  // Una sola oleada: en el paso "wave" se llama a la primera y después se detiene todo.
  if (g.wave >= 1) g.nextWaveIn = Infinity;
  else if (st?.id === 'wave') {
    if (!isFinite(g.nextWaveIn)) g.callWaveNow();
  } else g.nextWaveIn = Infinity;
  const idx = TUTORIAL_STEPS.findIndex((x) => x.id === 'food');
  if (s.index > idx && g.population < CONFIG.tutorial.minPopulation && g.canGrow()) g.growthTimer = Math.min(g.growthTimer, CONFIG.tutorial.growthTimer);
}

// ---------------------------------------------------------------- guardado

/** Subconjunto de `Storage` que usamos (así se puede probar sin navegador). */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
}

export function saveTutorial(store: KV, s: TutorialState): void {
  store.setItem(CONFIG.tutorial.storageKey, JSON.stringify(s));
}

/** Recupera el progreso (o uno nuevo si no hay o está dañado). */
export function loadTutorial(store: KV): TutorialState {
  try {
    const raw = store.getItem(CONFIG.tutorial.storageKey);
    if (!raw) return newTutorialState();
    const o = JSON.parse(raw) as Partial<TutorialState>;
    const s = newTutorialState();
    if (typeof o.index === 'number' && o.index >= 0 && o.index <= TUTORIAL_STEPS.length) s.index = o.index;
    s.completed = Array.isArray(o.completed) ? o.completed.filter((x) => typeof x === 'string') : [];
    s.skipped = Array.isArray(o.skipped) ? o.skipped.filter((x) => typeof x === 'string') : [];
    s.flags = Array.isArray(o.flags) ? o.flags.filter((x) => typeof x === 'string') : [];
    s.finished = !!o.finished || s.index >= TUTORIAL_STEPS.length;
    // `entered` se reinicia: al recargar se vuelve a reponer lo del paso actual (es idempotente).
    return s;
  } catch {
    return newTutorialState();
  }
}

export function clearTutorial(store: KV): void {
  store.removeItem?.(CONFIG.tutorial.storageKey);
}
