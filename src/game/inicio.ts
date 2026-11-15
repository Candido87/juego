/**
 * Menú principal: qué entradas se ofrecen según las partidas guardadas y a qué dirección lleva cada una.
 * Lógica pura (sin DOM): la vista sólo pinta la lista y navega.
 */
import { SaveFile, SaveSlot, saveSummary } from './savegame';

export type StartAction = 'continue' | 'new' | 'load' | 'tutorial' | 'options' | 'help' | 'quit';

export interface StartEntry {
  action: StartAction;
  label: string;
  /** Línea pequeña bajo el botón (resumen de la partida, aviso...). */
  detail?: string;
  /** Ranura que se carga con `continue` y `load`. */
  slot?: SaveSlot;
  /** Botón destacado: lo que la mayoría querrá pulsar. */
  primary?: boolean;
}

export type Saves = Record<SaveSlot, SaveFile | null>;

const SLOT_NAME: Record<SaveSlot, string> = { manual: 'guardado manual', auto: 'autoguardado' };

/** Fecha corta de un guardado: «15/11 10:42». */
export function savedWhen(s: SaveFile): string {
  const d = new Date(s.savedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Entradas del menú, en orden:
 * - «Continuar» con la partida viva más reciente (si hay alguna); es la destacada.
 * - «Nueva partida» (destacada si no hay nada que continuar).
 * - «Cargar» para la otra ranura si también tiene una partida viva distinta.
 * - Tutorial, opciones, controles y salir, siempre.
 * Las partidas terminadas (núcleo caído) no se ofrecen.
 */
export function startMenu(saves: Saves): StartEntry[] {
  const live = (['manual', 'auto'] as SaveSlot[])
    .map((slot) => ({ slot, save: saves[slot] }))
    .filter((e): e is { slot: SaveSlot; save: SaveFile } => !!e.save && !e.save.state.gameOver)
    .sort((a, b) => b.save.savedAt - a.save.savedAt);
  const out: StartEntry[] = [];
  const [latest, other] = live;
  if (latest) out.push({ action: 'continue', label: 'Continuar', detail: `${saveSummary(latest.save)} · ${savedWhen(latest.save)}`, slot: latest.slot, primary: true });
  out.push({ action: 'new', label: 'Nueva partida', primary: !latest });
  if (other) out.push({ action: 'load', label: `Cargar ${SLOT_NAME[other.slot]}`, detail: `${saveSummary(other.save)} · ${savedWhen(other.save)}`, slot: other.slot });
  out.push(
    { action: 'tutorial', label: 'Tutorial', detail: 'Aprende a jugar paso a paso' },
    { action: 'options', label: 'Opciones' },
    { action: 'help', label: 'Controles y ayuda' },
    { action: 'quit', label: 'Salir' },
  );
  return out;
}

/**
 * Parámetros de la dirección que abre lo elegido, o null si la entrada no cambia de página (opciones, ayuda, salir).
 * `seed` es la semilla de la partida nueva.
 */
export function startQuery(e: Pick<StartEntry, 'action' | 'slot'>, seed: number): string | null {
  if (e.action === 'new') return `seed=${Math.floor(seed)}`;
  if ((e.action === 'continue' || e.action === 'load') && e.slot) return `load=${e.slot}`;
  if (e.action === 'tutorial') return 'tutorial=1';
  return null;
}

/** ¿Se abre el menú principal? Sin parámetros en la dirección, o con `menu=1`. */
export function wantsMenu(search: string): boolean {
  const q = new URLSearchParams(search);
  return [...q.keys()].length === 0 || q.get('menu') === '1';
}
