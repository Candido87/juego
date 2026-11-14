import { describe, expect, it } from 'vitest';
import { NB, WALL_FAMILY, WALL_KINDS, WALL_TINT, wallAssetList, wallDamage, wallMask, wallPiece } from './muros';
import { SHAPES, shapeKey } from './shapes';

describe('muros conectados', () => {
  it('elige pieza y giro según los vecinos', () => {
    expect(wallPiece(0).piece).toBe('single');
    expect(wallPiece(NB.E)).toEqual({ piece: 'end', rot: 1 });
    expect(wallPiece(NB.N | NB.S)).toEqual({ piece: 'straight', rot: 0 });
    expect(wallPiece(NB.E | NB.W)).toEqual({ piece: 'straight', rot: 1 });
    expect(wallPiece(NB.W | NB.N)).toEqual({ piece: 'corner', rot: 3 });
    expect(wallPiece(NB.N | NB.E | NB.S).piece).toBe('junction');
    expect(wallPiece(15).piece).toBe('junction');
  });

  it('las 16 combinaciones tienen pieza en cada material', () => {
    for (const k of WALL_KINDS) for (let m = 0; m < 16; m++) expect(WALL_FAMILY[k][wallPiece(m).piece].length).toBeGreaterThan(0);
  });

  it('la máscara lee los vecinos', () => {
    expect(wallMask((dx, dy) => dx === 0 && dy === -1)).toBe(NB.N);
    expect(wallMask(() => true)).toBe(15);
  });

  it('tres estados de daño por vida restante', () => {
    expect(wallDamage(100, 100)).toBe(0);
    expect(wallDamage(50, 100)).toBe(1);
    expect(wallDamage(10, 100)).toBe(2);
  });

  it('cada material tiene tinte, lista de imágenes sin repetir y prisma de respaldo', () => {
    const list = wallAssetList().map((a) => `${a[1]}_${a[2]}`);
    expect(new Set(list).size).toBe(list.length);
    for (const k of WALL_KINDS) {
      expect(WALL_TINT[k]).toBeDefined();
      expect(SHAPES[shapeKey(k, 0)]).toBeDefined();
    }
  });
});
