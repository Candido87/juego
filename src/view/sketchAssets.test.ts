import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKETCH_SCALE, SKETCH_TOP_CENTER } from './sketch';

const root = resolve(__dirname, '../../public/assets');

describe('pack Sketch Town en public/assets', () => {
  it('están las piezas clave del terreno, muros y decoración (4 giros cada una)', () => {
    const base = ['grass_center', 'dirt_center', 'water_center', 'grass_slope', 'grass_water', 'castle_wall', 'castle_corner', 'castle_bend', 'castle_center', 'castle_tower', 'castle_gate', 'tree_single', 'rocks_grass', 'building_center'];
    const exp = ['cliff', 'castle_end', 'fence_wood', 'tree_pine', 'furrow_cropWheat'];
    for (const n of base) for (const r of 'NESW') expect(existsSync(resolve(root, `sketch-town/Tiles/${n}_${r}.png`)), `${n}_${r}`).toBe(true);
    for (const n of exp) for (const r of 'NESW') expect(existsSync(resolve(root, `sketch-town-expansion/Tiles/${n}_${r}.png`)), `${n}_${r}`).toBe(true);
  });
  it('cada pack lleva su licencia', () => {
    expect(existsSync(resolve(root, 'sketch-town/LICENSE-NOTICE.txt'))).toBe(true);
    expect(existsSync(resolve(root, 'sketch-town-expansion/License.txt'))).toBe(true);
  });
  it('la escala del pack deja la cara superior en 64 px de ancho (losa 2:1 del juego)', () => {
    expect(232 * SKETCH_SCALE).toBeCloseTo(64);
    expect(116 * SKETCH_SCALE).toBeCloseTo(32);
    expect(SKETCH_TOP_CENTER).toEqual({ x: 128, y: 187 });
  });
});
