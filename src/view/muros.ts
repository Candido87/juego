/**
 * Murallas: qué edificios son muro y en qué estado de daño están (lógica pura, con test).
 * La forma de cada tramo (recta, esquina, T, cruz, extremo) la decide la vista 3D con `armsFor` (`view3d/pieces.ts`).
 */
import type { WallKind } from '../game/types';

export const WALL_KINDS: WallKind[] = ['wall_wood', 'wall_stone', 'wall_metal'];
export const isWallKind = (k: string): k is WallKind => (WALL_KINDS as string[]).includes(k);

/** Estado de daño: 0 intacto, 1 dañado, 2 casi roto. */
export type WallDamage = 0 | 1 | 2;
export function wallDamage(hp: number, maxHp: number): WallDamage {
  const f = maxHp > 0 ? hp / maxHp : 1;
  return f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
}
