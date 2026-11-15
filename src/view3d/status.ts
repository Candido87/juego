/** Estado que se muestra como icono sobre un edificio (lógica pura: sólo lee el juego). */
import { CONFIG } from '../game/config';
import type { Building, Game } from '../game/game';
import { demandOf, powerMult } from '../game/power';
import type { BuildKind, ItemId } from '../game/types';

export type StatusIcon =
  | { type: 'remove' }
  | { type: 'norecipe' }
  | { type: 'missing' }
  | { type: 'full' }
  | { type: 'lowpower' }
  | { type: 'nofuel' }
  | { type: 'noammo' }
  | { type: 'nopower' }
  | { type: 'nonet' }
  | { type: 'worn' }
  | { type: 'broken' }
  | { type: 'producing'; item: ItemId };

/**
 * Icono de estado de un edificio, o null si no hay nada que avisar.
 * Prioridad: marcado para desmontar > averiado > fábrica (sin receta, falta material, salida llena, sin red, poca energía,
 * desgastada, produciendo) > generador parado sin combustible > torreta sin energía > torreta sin munición
 * > sin conexión a la red > desgastado.
 */
export function statusIcon(game: Game, b: Building): StatusIcon | null {
  if (!b.built) return null;
  if (b.markedForRemoval) return { type: 'remove' };
  if (b.condition <= 0) return { type: 'broken' };
  const worn = b.condition < CONFIG.wear.lowThreshold;
  if (b.kind === 'factory') {
    const st = game.factoryStatus(b);
    if (st.state === 'norecipe') return { type: 'norecipe' };
    if (st.state === 'missing') return { type: 'missing' };
    if (st.state === 'full') return { type: 'full' };
    if (st.state === 'producing') {
      if (offGrid(game, b)) return { type: 'nonet' };
      if (st.lowPower) return { type: 'lowpower' };
      if (worn) return { type: 'worn' };
      const out = b.recipe ? (Object.keys(CONFIG.recipes[b.recipe].outputs)[0] as ItemId | undefined) : undefined;
      return out ? { type: 'producing', item: out } : null;
    }
    return worn ? { type: 'worn' } : null;
  }
  const gen = CONFIG.power.generators[b.kind as BuildKind];
  if (gen?.fuel && !b.running) return { type: 'nofuel' };
  const t = game.turretDef(b);
  if (t && t.energyPerShot > 0 && game.turretPower(b) <= 0) return { type: 'nopower' };
  if (t?.ammo && !game.turretReady(b)) return { type: 'noammo' };
  if (!t && offGrid(game, b)) return { type: 'nonet' };
  return worn ? { type: 'worn' } : null;
}

/** ¿Es una cinta que no se mueve por falta de energía? (modo manual: la vista la apaga). */
export function beltStopped(b: Building): boolean {
  return (b.kind === 'belt' || b.kind === 'belt_fast') && b.built && powerMult(b) <= 0;
}

/**
 * ¿Consumidor eléctrico sin poste que lo conecte a ninguna red? Las cintas no cuentan (se ven apagadas).
 * Mientras no exista ninguna red el aviso sólo sale en lo que no funciona nada sin energía: al principio de la partida
 * todo va a mano y llenar el mapa de avisos no ayudaría.
 */
export function offGrid(game: Game, b: Building): boolean {
  if (!b.built || b.kind === 'belt' || b.kind === 'belt_fast' || demandOf(b) <= 0 || game.netOf(b)) return false;
  const mult = CONFIG.power.mult[b.kind as BuildKind];
  return game.grid.nets.length > 0 || (!!mult && mult[0] <= 0);
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
  nopower: { glyph: '⚡', tone: 'bad', title: 'Torreta sin energía' },
  nonet: { glyph: '⌁', tone: 'bad', title: 'Sin conexión a la red eléctrica: falta un poste cerca' },
  worn: { glyph: '⚙', tone: 'warn', title: 'Desgastado: rinde la mitad hasta que lo repare un Operario' },
  broken: { glyph: '⚙', tone: 'bad', title: 'Averiado: no funciona hasta que lo repare un Operario' },
};
