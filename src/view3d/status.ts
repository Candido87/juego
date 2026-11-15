/** Estado que se muestra como icono sobre un edificio (lógica pura: sólo lee el juego). */
import { CONFIG } from '../game/config';
import type { Building, Game } from '../game/game';
import type { BuildKind, ItemId } from '../game/types';

export type StatusIcon =
  | { type: 'remove' }
  | { type: 'norecipe' }
  | { type: 'missing' }
  | { type: 'full' }
  | { type: 'lowpower' }
  | { type: 'nofuel' }
  | { type: 'noammo' }
  | { type: 'producing'; item: ItemId };

/**
 * Icono de estado de un edificio, o null si no hay nada que avisar.
 * Prioridad: marcado para desmontar > fábrica (sin receta, falta material, salida llena, poca energía, produciendo)
 * > generador parado sin combustible > torreta sin munición.
 */
export function statusIcon(game: Game, b: Building): StatusIcon | null {
  if (!b.built) return null;
  if (b.markedForRemoval) return { type: 'remove' };
  if (b.kind === 'factory') {
    const st = game.factoryStatus(b);
    if (st.state === 'norecipe') return { type: 'norecipe' };
    if (st.state === 'missing') return { type: 'missing' };
    if (st.state === 'full') return { type: 'full' };
    if (st.state === 'producing') {
      if (st.lowPower) return { type: 'lowpower' };
      const out = b.recipe ? (Object.keys(CONFIG.recipes[b.recipe].outputs)[0] as ItemId | undefined) : undefined;
      return out ? { type: 'producing', item: out } : null;
    }
    return null;
  }
  const gen = CONFIG.power.generators[b.kind as BuildKind];
  if (gen?.fuel && !b.running) return { type: 'nofuel' };
  const t = game.turretDef(b);
  if (t?.ammo && !game.turretReady(b)) return { type: 'noammo' };
  return null;
}

/** Clave estable del icono (para no redibujar si no cambia). */
export const statusKey = (s: StatusIcon | null): string => (s ? (s.type === 'producing' ? `producing:${s.item}` : s.type) : '');

/** Texto y tono de cada icono (el dibujo lo hace la vista). */
export const STATUS_STYLE: Record<Exclude<StatusIcon['type'], 'producing'>, { glyph: string; tone: 'bad' | 'warn'; title: string }> = {
  remove: { glyph: '✕', tone: 'bad', title: 'Marcado para desmontar' },
  norecipe: { glyph: '?', tone: 'bad', title: 'Sin receta' },
  missing: { glyph: '!', tone: 'warn', title: 'Falta material' },
  full: { glyph: '■', tone: 'warn', title: 'Salida llena' },
  lowpower: { glyph: '⚡', tone: 'warn', title: 'Sin energía de la red' },
  nofuel: { glyph: '⚡', tone: 'bad', title: 'Generador parado: sin combustible' },
  noammo: { glyph: '∅', tone: 'bad', title: 'Sin munición' },
};
