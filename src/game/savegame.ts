/**
 * Guardado y carga de partida (lógica pura, sin DOM): una partida se guarda como JSON con la semilla del mundo
 * y el estado de `Game.exportState()`. Hay dos ranuras: la manual y el autoguardado.
 */
import { Game, GameState } from './game';
import { generateWorld } from './world';

export const SAVE_VERSION = 1;
export type SaveSlot = 'manual' | 'auto';
export const SAVE_KEYS: Record<SaveSlot, string> = { manual: 'iso-factory-td:save:manual', auto: 'iso-factory-td:save:auto' };
/** Segundos reales entre autoguardados. */
export const AUTOSAVE_SECONDS = 60;

export interface SaveFile {
  version: number;
  /** Semilla y tamaño del mapa: el mundo se regenera igual. */
  seed: number;
  mapW: number;
  mapH: number;
  /** Fecha del guardado (ms desde 1970) y resumen para mostrar en la interfaz. */
  savedAt: number;
  wave: number;
  time: number;
  population: number;
  /** Progreso de la guía de inicio (opaco para este módulo). */
  guia?: unknown;
  state: GameState;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function makeSave(game: Game, seed: number, now = Date.now(), guia?: unknown): SaveFile {
  return {
    version: SAVE_VERSION,
    seed,
    mapW: game.world.w,
    mapH: game.world.h,
    savedAt: now,
    wave: game.wave,
    time: game.time,
    population: game.population,
    guia,
    state: game.exportState(),
  };
}

/** Crea una partida nueva con el mundo del guardado y le aplica su estado. */
export function gameFromSave(save: SaveFile): Game {
  const game = new Game({ world: generateWorld(save.seed, save.mapW, save.mapH) });
  game.importState(save.state);
  return game;
}

/** ¿Tiene el contenido la forma de un guardado de esta versión? (no valida cada campo del estado) */
export function isSave(v: unknown): v is SaveFile {
  const s = v as Partial<SaveFile> | null;
  return (
    !!s &&
    typeof s === 'object' &&
    s.version === SAVE_VERSION &&
    Number.isFinite(s.seed) &&
    Number.isInteger(s.mapW) &&
    Number.isInteger(s.mapH) &&
    s.mapW! > 0 &&
    s.mapH! > 0 &&
    !!s.state &&
    Array.isArray(s.state.buildings) &&
    Array.isArray(s.state.npcs)
  );
}

export function writeSave(store: Store | null, slot: SaveSlot, save: SaveFile): boolean {
  try {
    store?.setItem(SAVE_KEYS[slot], JSON.stringify(save));
    return !!store;
  } catch {
    return false;
  }
}

/** Lee una ranura; null si no hay nada, está dañada o es de otra versión. */
export function readSave(store: Store | null, slot: SaveSlot): SaveFile | null {
  try {
    const raw = store?.getItem(SAVE_KEYS[slot]);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return isSave(v) ? v : null;
  } catch {
    return null;
  }
}

export function deleteSave(store: Store | null, slot: SaveSlot): void {
  try {
    store?.removeItem(SAVE_KEYS[slot]);
  } catch {
    /* nada que borrar */
  }
}

/** La partida guardada más reciente de las dos ranuras. */
export function latestSave(store: Store | null): { slot: SaveSlot; save: SaveFile } | null {
  const a = readSave(store, 'auto');
  const m = readSave(store, 'manual');
  if (a && m) return a.savedAt > m.savedAt ? { slot: 'auto', save: a } : { slot: 'manual', save: m };
  if (a) return { slot: 'auto', save: a };
  if (m) return { slot: 'manual', save: m };
  return null;
}

/** Texto corto de una partida guardada: «Oleada 4 · 12:30 · 5 personas». */
export function saveSummary(s: SaveFile): string {
  const min = Math.floor(s.time / 60);
  const sec = String(Math.floor(s.time % 60)).padStart(2, '0');
  return `Oleada ${s.wave} · ${min}:${sec} · ${s.population} ${s.population === 1 ? 'persona' : 'personas'}`;
}

/** Marca de autoguardado: cada cuánto y sólo si la partida sigue viva. */
export class AutoSaver {
  private t = 0;
  constructor(private every: number = AUTOSAVE_SECONDS) {}
  /** Devuelve true cuando toca guardar. No cuenta con la partida acabada. */
  tick(dt: number, game: Pick<Game, 'gameOver'>): boolean {
    if (game.gameOver) return false;
    this.t += dt;
    if (this.t < this.every) return false;
    this.t = 0;
    return true;
  }
}

