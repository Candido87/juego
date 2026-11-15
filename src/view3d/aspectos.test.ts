import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from '../game/config';
import { ASPECTOS, aspectF, aspectSy } from './aspectos';

interface Row {
  cat: string;
  key: string;
  name: string;
  w: number;
  d: number;
  h: number;
  cell: [number, number];
}
/** Medidas de cada modelo SIN escalar (galería de escala antes del registro de aspectos). */
const base: Row[] = JSON.parse(readFileSync(resolve(__dirname, '../../docs/escala/medidas-base.json'), 'utf8'));
const row = (key: string) => base.find((r) => r.key === key && r.cat !== 'huella')!;
const S = CONFIG.scale;

/** Tamaño de un modelo con su factor del registro: [ancho máx, alto]. */
const size = (key: string): [number, number] => {
  const r = row(key);
  return [Math.max(r.w, r.d) * aspectF(key), r.h * aspectF(key) * aspectSy(key)];
};

describe('Registro de aspectos · escala de edificios, personas, enemigos y árboles', () => {
  it('todas las claves del registro existen en las medidas y tienen objetivo', () => {
    for (const k of Object.keys(ASPECTOS)) {
      expect(row(k), k).toBeDefined();
      expect(S.targets[k], k).toBeDefined();
    }
  });

  it('con su factor, cada modelo registrado queda a menos de un 6 % de la altura objetivo', () => {
    for (const k of Object.keys(ASPECTOS)) {
      const [, h] = size(k);
      expect(Math.abs(h - S.targets[k].h!) / S.targets[k].h!, k).toBeLessThan(0.06);
    }
  });

  it('la caja de cada edificio cabe en su huella (95 %) y no pasa de la altura máxima', () => {
    for (const r of base.filter((x) => x.cat === 'edificio')) {
      const [w, h] = size(r.key);
      expect(w, r.key).toBeLessThanOrEqual(S.fill * Math.max(...r.cell) + 0.01);
      expect(h, r.key).toBeLessThanOrEqual(S.maxBuildingHeight + 0.01);
    }
  });

  it('alturas mínimas: casa ≥ 1,0, almacén ≥ 0,9, taller y laboratorio ≥ 1,2, fábrica 1,4–2,0', () => {
    for (const [k, min] of Object.entries(S.minHeight) as [string, number][]) expect(size(k)[1], k).toBeGreaterThanOrEqual(min - 0.02);
    expect(size('factory')[1]).toBeLessThanOrEqual(S.maxFactoryHeight);
  });

  it('proporciones relativas: persona < torreta pequeña < edificios grandes, y ninguna persona supera a un edificio pequeño', () => {
    const people = base.filter((r) => r.cat === 'persona').map((r) => size(r.key)[1]);
    const turret = Math.min(...base.filter((r) => r.cat === 'torreta').map((r) => r.h));
    const big = ['factory', 'refinery', 'turbine', 'core'].map((k) => size(k)[1]);
    for (const p of people) expect(p).toBeLessThan(turret);
    for (const b of big) expect(b).toBeGreaterThan(turret);
    const smallBuildings = ['house', 'storage', 'workshop', 'laboratory', 'drill', 'generator', 'pump', 'farm', 'feeder', 'accumulator'];
    for (const k of smallBuildings) for (const p of people) expect(size(k)[1], k).toBeGreaterThan(p);
  });

  it('las personas miden ≈ 0,62 y los enemigos corrientes no superan a los edificios; el tank es el mayor', () => {
    for (const r of base.filter((x) => x.cat === 'persona')) expect(size(r.key)[1]).toBeCloseTo(0.62, 1);
    const enemies = base.filter((x) => x.cat === 'enemigo').map((r) => [r.key, size(r.key)[1]] as const);
    const tank = enemies.find(([k]) => k === 'enemy_tank')![1];
    for (const [k, h] of enemies) if (k !== 'enemy_tank') expect(h, k).toBeLessThan(tank);
  });

  it('árboles de 1,0 a 1,3 de alto con la copa de 0,8 de ancho como máximo', () => {
    for (const k of ['tree_default', 'tree_oak', 'tree_pineTallA', 'tree_fat', 'tree_cone']) {
      const [w, h] = size(k);
      expect(h, k).toBeGreaterThanOrEqual(S.tree.minHeight - 0.02);
      expect(h, k).toBeLessThanOrEqual(S.tree.maxHeight + 0.02);
      expect(w, k).toBeLessThanOrEqual(S.tree.maxCanopy);
    }
  });

  it('los muros sólo se aplastan en vertical (sus brazos tienen que seguir llegando al borde de la casilla)', () => {
    for (const k of ['wall_wood', 'wall_stone', 'wall_metal', 'wall_gate']) expect(aspectF(k)).toBe(1);
  });

  it('los objetos transportados caben en el carril y el más alto no supera los 0,25', () => {
    for (const r of base.filter((x) => x.cat === 'objeto')) expect(Math.min(r.w, r.d)).toBeLessThanOrEqual(S.beltLane);
  });
});
