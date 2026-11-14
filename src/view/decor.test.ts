import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { Ore } from '../game/types';
import { DECOR, DECOR_SPRITES, decorFree, generateDecor, terrainTint, tintNoise } from './decor';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('decoración procedural', () => {
  const g = new Game({ seed: 7 });
  const d1 = generateDecor(g.world, 7, g.core, g.spawns);

  it('es determinista con la misma semilla y distinta con otra', () => {
    expect(generateDecor(g.world, 7, g.core, g.spawns)).toEqual(d1);
    expect(generateDecor(g.world, 8, g.core, g.spawns)).not.toEqual(d1);
    expect(d1.length).toBeGreaterThan(50);
    expect(d1.some((d) => d.tall)).toBe(true);
  });

  it('nunca cae sobre menas, junto al núcleo, en las apariciones ni sobre el pasillo', () => {
    for (const d of d1) {
      expect(g.world.ore[d.y * g.world.w + d.x]).toBe(Ore.None);
      expect(Math.max(Math.abs(d.x - (g.core.x + 1)), Math.abs(d.y - (g.core.y + 1)))).toBeGreaterThan(DECOR.coreClear);
      expect(decorFree(g.world, d.x, d.y, g.core, g.spawns)).toBe(true);
    }
  });

  it('el pasillo hacia el núcleo queda libre', () => {
    const s = g.spawns[0];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = Math.round(s.x + (g.core.x + 1 - s.x) * t);
      const y = Math.round(s.y + (g.core.y + 1 - s.y) * t);
      expect(d1.some((d) => d.x === x && d.y === y)).toBe(false);
    }
  });

  it('el teñido varía de forma continua', () => {
    const n = tintNoise(7);
    const set = new Set<number>();
    for (let i = 0; i < 400; i += 3) set.add(terrainTint(n, i, i * 0.7));
    expect(set.size).toBeGreaterThan(5);
  });

  it('las imágenes de los árboles y rocas existen en los 4 giros', () => {
    for (const [pack, name] of Object.values(DECOR_SPRITES))
      for (const r of 'NESW') expect(existsSync(resolve(__dirname, `../../public/assets/${pack === 'base' ? 'sketch-town' : 'sketch-town-expansion'}/Tiles/${name}_${r}.png`)), name).toBe(true);
  });
});
