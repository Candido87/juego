import { describe, expect, it } from 'vitest';
import { BUILD_KINDS } from './types';
import { hasPorts, ports } from './puertos';

describe('T5 · puertos de entrada y salida', () => {
  it('taladro y granja sacan sólido por delante; la bomba, líquido', () => {
    expect(ports('drill', 5, 5, 0)).toEqual([{ x: 6, y: 5, dir: 0, io: 'out', medium: 'solid' }]);
    expect(ports('farm', 5, 5, 1)[0]).toMatchObject({ x: 5, y: 6, io: 'out', medium: 'solid' });
    expect(ports('pump', 5, 5, 2)[0]).toMatchObject({ x: 4, y: 5, io: 'out', medium: 'liquid' });
  });

  it('la fábrica saca por delante y admite sólido por las otras tres caras, apuntando hacia ella', () => {
    const p = ports('factory', 5, 5, 0);
    expect(p.filter((q) => q.io === 'out')).toHaveLength(1);
    const ins = p.filter((q) => q.io === 'in');
    expect(ins).toHaveLength(3);
    expect(ins.every((q) => q.medium === 'solid')).toBe(true);
    // La entrada de atrás (4,5) apunta hacia la fábrica (+x = dir 0).
    expect(ins.find((q) => q.x === 4 && q.y === 5)?.dir).toBe(0);
    expect(ins.some((q) => q.x === 6 && q.y === 5)).toBe(false);
  });

  it('la refinería es líquida y el generador sólo admite líquido (gasolina)', () => {
    expect(ports('refinery', 5, 5, 3).every((q) => q.medium === 'liquid')).toBe(true);
    const g = ports('generator', 5, 5, 0);
    expect(g).toHaveLength(4);
    expect(g.every((q) => q.io === 'in' && q.medium === 'liquid')).toBe(true);
  });

  it('las torretas de munición admiten sólido; las eléctricas y las cintas no tienen puertos', () => {
    expect(ports('turret_bullet', 5, 5, 0)).toHaveLength(4);
    expect(hasPorts('turret_laser')).toBe(false);
    expect(hasPorts('belt')).toBe(false);
    expect(hasPorts('pipeline')).toBe(false);
  });

  it('cada edificio devuelve una lista (nunca falla)', () => {
    for (const k of BUILD_KINDS) expect(Array.isArray(ports(k, 3, 3, 0))).toBe(true);
  });
});
