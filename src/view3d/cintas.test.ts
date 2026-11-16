import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CINTA_PIEZAS } from './aspectos';
import { CONVEYOR_GROUPS } from './galeria-cintas';
import { beltConnectors, beltFlowQuads, beltItemPose } from './pieces';
import type { Dir } from '../game/types';

const DIRS: Dir[] = [0, 1, 2, 3];
const VEC = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Todas las combinaciones de entradas posibles de una cinta que sale hacia `dir` (sin la propia salida). */
function inputs(dir: Dir): number[][] {
  const others = DIRS.filter((d) => d !== dir);
  const out: number[][] = [[]];
  for (let m = 1; m < 8; m++) out.push(others.filter((_, i) => m & (1 << i)));
  return out;
}

describe('cintas: geometría del recorrido de los objetos (CIN-K5)', () => {
  it('siempre dentro de la casilla, del borde de entrada al de salida', () => {
    for (const dir of DIRS)
      for (const ins of inputs(dir)) {
        const a = beltItemPose(dir, ins, 0);
        const z = beltItemPose(dir, ins, 1);
        expect(Math.abs(z.x - VEC[dir][0] * 0.5) + Math.abs(z.z - VEC[dir][1] * 0.5), `salida dir ${dir}`).toBeLessThan(1e-9);
        const entry = ins.length === 0 || ins.includes((dir + 2) % 4) ? (dir + 2) % 4 : ins[0];
        expect(Math.abs(a.x - VEC[entry][0] * 0.5) + Math.abs(a.z - VEC[entry][1] * 0.5), `entrada dir ${dir} ${ins}`).toBeLessThan(1e-9);
        for (let i = 0; i <= 20; i++) {
          const p = beltItemPose(dir, ins, i / 20);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(0.5 + 1e-9);
        }
      }
  });

  it('el recorrido es continuo (sin saltos) y no retrocede en el sentido de la marcha', () => {
    for (const dir of DIRS)
      for (const ins of inputs(dir)) {
        let prev = beltItemPose(dir, ins, 0);
        for (let i = 1; i <= 50; i++) {
          const p = beltItemPose(dir, ins, i / 50);
          expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.05);
          // Avanza hacia delante (o de lado en una curva), nunca hacia atrás.
          expect((p.x - prev.x) * VEC[dir][0] + (p.z - prev.z) * VEC[dir][1]).toBeGreaterThanOrEqual(-1e-9);
          prev = p;
        }
      }
  });

  it('progreso fuera de rango se recorta', () => {
    expect(beltItemPose(0, [], -3)).toEqual(beltItemPose(0, [], 0));
    expect(beltItemPose(0, [1], 9)).toEqual(beltItemPose(0, [1], 1));
  });

  it('una recta tiene velocidad uniforme y una curva más corta no es más larga que la recta', () => {
    const len = (ins: number[]) => {
      let l = 0;
      let prev = beltItemPose(0, ins, 0);
      for (let i = 1; i <= 100; i++) {
        const p = beltItemPose(0, ins, i / 100);
        l += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
      }
      return l;
    };
    expect(len([])).toBeCloseTo(1, 3);
    expect(len([1])).toBeLessThan(1.2);
    expect(len([1])).toBeGreaterThan(0.7);
  });
});

describe('cintas: capa de dirección y conectores', () => {
  it('los tramos de la capa de dirección caben en la casilla', () => {
    for (const dir of DIRS)
      for (const ins of inputs(dir)) {
        const quads = beltFlowQuads(dir, ins);
        expect(quads.length).toBeGreaterThan(0);
        for (const q of quads) {
          expect(Math.abs(q.dx)).toBeLessThanOrEqual(0.25 + 1e-9);
          expect(Math.abs(q.dz)).toBeLessThanOrEqual(0.25 + 1e-9);
        }
        // Siempre hay un tramo que fluye hacia la salida.
        expect(quads.some((q) => q.flow === dir)).toBe(true);
      }
  });

  it('un conector sólo aparece donde hay un edificio', () => {
    expect(beltConnectors(0, [], false, false)).toEqual([]);
    expect(beltConnectors(0, [], true, true)).toEqual([0, 2]);
    expect(beltConnectors(0, [2], false, true)).toEqual([]);
  });
});

describe('cintas: piezas del kit', () => {
  const root = join(process.cwd(), 'public', 'assets', '3d', 'factory');
  it('todos los modelos de la galería existen', () => {
    for (const names of Object.values(CONVEYOR_GROUPS)) for (const n of names) expect(existsSync(join(root, `${n}.glb`)), n).toBe(true);
  });
  it('las piezas elegidas para cada cinta existen', () => {
    for (const set of Object.values(CINTA_PIEZAS))
      for (const m of Object.values(set)) expect(existsSync(join(root, `${m.replace('factory/', '')}.glb`)), m).toBe(true);
  });
});

describe('cintas: rampas (la de abajo absorbe el desnivel)', () => {
  it('sube hacia una cinta más alta; baja desde una cinta más alta que la alimenta; la de arriba va llana', async () => {
    const { rampSlope } = await import('./pieces');
    expect(rampSlope(true, 1, false, 0)).toBe(1);
    expect(rampSlope(false, 0, true, 1)).toBe(-1);
    // La de arriba (delante hay una cinta más baja) no se inclina: antes se hundía en su casilla.
    expect(rampSlope(true, -1, false, 0)).toBe(0);
    expect(rampSlope(false, 0, false, 0)).toBe(0);
    expect(rampSlope(true, 0, true, 0)).toBe(0);
  });
  it('el centro de la pieza inclinada y los objetos nunca quedan bajo la casilla y enlazan con los dos niveles', async () => {
    const { rampCenter, rampItemLift } = await import('./pieces');
    const LH = 0.5;
    for (const s of [-1, 1]) {
      expect(rampCenter(s, LH)).toBeCloseTo(LH / 2);
      const a = rampItemLift(s, 0, LH);
      const z = rampItemLift(s, 1, LH);
      expect(Math.min(a, z)).toBeCloseTo(0);
      expect(Math.max(a, z)).toBeCloseTo(LH);
    }
    expect(rampItemLift(1, 0, LH)).toBeCloseTo(0);
    expect(rampItemLift(-1, 0, LH)).toBeCloseTo(LH);
    expect(rampItemLift(0, 0.5, LH)).toBe(0);
  });
});
