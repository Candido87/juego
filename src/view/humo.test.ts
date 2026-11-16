import { describe, expect, it } from 'vitest';
import { smokeSource } from './humo';

const base = { kind: 'factory', built: true, hp: 100, maxHp: 100, craft: 0, power: 1, running: false } as Parameters<typeof smokeSource>[0];

describe('humo', () => {
  it('una fábrica produciendo echa humo blanco; parada o sin energía, nada', () => {
    expect(smokeSource({ ...base, craft: 0.3 })?.kind).toBe('white');
    expect(smokeSource(base)).toBeNull();
    expect(smokeSource({ ...base, craft: 0.3, power: 0 })).toBeNull();
  });
  it('el generador sólo echa humo en marcha', () => {
    expect(smokeSource({ ...base, kind: 'generator', running: true })?.kind).toBe('white');
    expect(smokeSource({ ...base, kind: 'generator' })).toBeNull();
  });
  it('por debajo del 50 % de vida echa humo negro, más cuanto peor; torretas y obras no', () => {
    const a = smokeSource({ ...base, hp: 40 })!;
    const b = smokeSource({ ...base, hp: 10 })!;
    expect(a.kind).toBe('black');
    expect(b.rate).toBeGreaterThan(a.rate);
    expect(smokeSource({ ...base, kind: 'turret_bullet', hp: 10 })).toBeNull();
    expect(smokeSource({ ...base, hp: 10, built: false })).toBeNull();
  });
});
