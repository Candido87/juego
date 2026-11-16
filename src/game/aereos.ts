/**
 * Enemigos aéreos (lógica pura): vuelan en línea recta, por encima de muros y edificios, hacia un objetivo que depende del tipo.
 * - núcleo (ligero): lo golpea y desaparece;
 * - industria (bombardero): el edificio de producción más cercano; al llegar bombardea en área hasta que cae;
 * - torreta (pesado): la torreta más cercana; al llegar la ataca hasta que cae.
 * Si no queda objetivo de su tipo, van al núcleo. Sólo el lanzamisiles los alcanza (`hitsAir` en `CONFIG.turrets`).
 */
import type { BuildingKind } from './types';

export type AirTarget = 'core' | 'industry' | 'turret';

/** Edificios que cuentan como "industria" para el bombardero. */
export const INDUSTRY_KINDS: readonly BuildingKind[] = ['factory', 'refinery', 'generator', 'turbine', 'drill', 'pump', 'farm'];

export interface TargetCandidate {
  id: number;
  kind: BuildingKind;
  built: boolean;
  x: number;
  y: number;
  w: number;
  d: number;
}

export function isTargetOf(mode: AirTarget, kind: BuildingKind): boolean {
  if (mode === 'industry') return INDUSTRY_KINDS.includes(kind);
  if (mode === 'turret') return kind.startsWith('turret_');
  return false;
}

/** Edificio terminado del tipo pedido más cercano al punto (por su centro), o null si no hay (entonces se va al núcleo). */
export function pickAirTarget(from: { x: number; y: number }, buildings: Iterable<TargetCandidate>, mode: AirTarget): TargetCandidate | null {
  if (mode === 'core') return null;
  let best: TargetCandidate | null = null;
  let bestD = Infinity;
  for (const b of buildings) {
    if (!b.built || !isTargetOf(mode, b.kind)) continue;
    const d = Math.hypot(b.x + b.w / 2 - from.x, b.y + b.d / 2 - from.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Avanza `budget` casillas en línea recta hacia (tx, ty). `arrived` si queda a menos de `reach` del punto. */
export function flyToward(x: number, y: number, tx: number, ty: number, budget: number, reach = 0.6): { x: number; y: number; arrived: boolean } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= reach) return { x, y, arrived: true };
  const step = Math.min(budget, d - reach + 1e-9);
  return { x: x + (dx / d) * step, y: y + (dy / d) * step, arrived: d - step <= reach + 1e-6 };
}
