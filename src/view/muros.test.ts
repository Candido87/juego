import { describe, expect, it } from 'vitest';
import { WALL_KINDS, isWallKind, wallDamage } from './muros';

describe('murallas', () => {
  it('tres materiales y nada más cuenta como muro', () => {
    expect(WALL_KINDS).toEqual(['wall_wood', 'wall_stone', 'wall_metal']);
    expect(isWallKind('wall_stone')).toBe(true);
    expect(isWallKind('wall_gate')).toBe(false);
    expect(isWallKind('belt')).toBe(false);
  });

  it('tres estados de daño por vida restante', () => {
    expect(wallDamage(100, 100)).toBe(0);
    expect(wallDamage(50, 100)).toBe(1);
    expect(wallDamage(10, 100)).toBe(2);
    expect(wallDamage(0, 0)).toBe(0);
  });
});
