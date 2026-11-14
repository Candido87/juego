/** Operaciones sobre bolsas de objetos (id → cantidad). */
import type { Bag, ItemId } from './types';

export const count = (b: Bag, i: ItemId): number => b[i] ?? 0;

export function add(b: Bag, i: ItemId, n: number): void {
  const v = (b[i] ?? 0) + n;
  if (v <= 0) delete b[i];
  else b[i] = v;
}

export function addAll(b: Bag, other: Bag, factor = 1): void {
  for (const [i, n] of entries(other)) add(b, i, Math.floor(n * factor));
}

export function entries(b: Bag): [ItemId, number][] {
  return (Object.entries(b) as [ItemId, number][]).filter(([, n]) => n > 0);
}

export function total(b: Bag): number {
  let t = 0;
  for (const [, n] of entries(b)) t += n;
  return t;
}

export function hasAll(b: Bag, need: Bag): boolean {
  return entries(need).every(([i, n]) => count(b, i) >= n);
}

/** Lo que falta de `need` teniendo `have`. */
export function missing(need: Bag, have: Bag): Bag {
  const out: Bag = {};
  for (const [i, n] of entries(need)) {
    const m = n - count(have, i);
    if (m > 0) out[i] = m;
  }
  return out;
}

/** Saca hasta `n` unidades; devuelve las sacadas. */
export function take(b: Bag, i: ItemId, n: number): number {
  const t = Math.max(0, Math.min(n, count(b, i)));
  add(b, i, -t);
  return t;
}
