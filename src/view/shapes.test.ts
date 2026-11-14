import { describe, expect, it } from 'vitest';
import { BUILD_KINDS, Dir, ENEMY_KINDS, ITEM_IDS } from '../game/types';
import { SHAPES, enemyKey, enemySpriteKey, shapeKey } from './shapes';
import { ENEMY_SPRITES, TILE_COUNT } from './sprites';

describe('aspectos registrados', () => {
  it('cada edificio (y el núcleo) tiene su modelo en todas las direcciones', () => {
    expect(SHAPES.core).toBeDefined();
    for (const kind of BUILD_KINDS) {
      for (const d of [0, 1, 2, 3] as Dir[]) expect(SHAPES[shapeKey(kind, d)], `${kind} dir ${d}`).toBeDefined();
    }
  });

  it('cada torreta tiene un modelo propio, distinto de las demás', () => {
    const turrets = BUILD_KINDS.filter((k) => k.startsWith('turret_'));
    expect(turrets.length).toBe(4);
    const looks = turrets.map((k) => JSON.stringify(SHAPES[k]));
    expect(new Set(looks).size).toBe(turrets.length);
  });

  it('cada objeto tiene su cubito', () => {
    for (const i of ITEM_IDS) expect(SHAPES[`item_${i}`], i).toBeDefined();
  });

  it('cada enemigo tiene prisma de respaldo y sprite, y se ven distintos', () => {
    for (const k of ENEMY_KINDS) {
      expect(SHAPES[enemyKey(k)], `prisma ${k}`).toBeDefined();
      const s = ENEMY_SPRITES[k];
      expect(s, `sprite ${k}`).toBeDefined();
      expect(Number.isInteger(s.frame) && s.frame >= 0 && s.frame < TILE_COUNT).toBe(true);
      expect(Number.isInteger(s.scale) && s.scale >= 1).toBe(true);
      expect(enemySpriteKey(k)).not.toBe(enemyKey(k));
    }
    expect(new Set(ENEMY_KINDS.map((k) => ENEMY_SPRITES[k].frame)).size).toBe(ENEMY_KINDS.length);
    const prisms = ENEMY_KINDS.map((k) => JSON.stringify(SHAPES[enemyKey(k)]));
    expect(new Set(prisms).size).toBe(ENEMY_KINDS.length);
  });
});
