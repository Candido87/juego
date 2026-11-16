import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PIPE_KIT, PIPE_PIECES, glassModel } from './tuberiasPiezas';

interface Medida {
  min: number[];
  max: number[];
  ends: { normal: number[]; center: number[]; outerR: number; innerR: number }[];
}
const medidas = JSON.parse(readFileSync(join('docs', 'tuberias', 'medidas-piezas.json'), 'utf8')) as Record<string, Medida>;
const name = (model: string) => model.replace('factory/', '');
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('puertos geométricos de las piezas de tubería', () => {
  it('cada pieza (y su versión de cristal) existe en public/assets/3d', () => {
    for (const p of PIPE_PIECES) {
      expect(existsSync(join('public', 'assets', '3d', `${p.model}.glb`)), p.model).toBe(true);
      expect(existsSync(join('public', 'assets', '3d', `${glassModel(p.model)}.glb`)), glassModel(p.model)).toBe(true);
    }
  });

  it('la caja y los puertos de la tabla coinciden con lo medido en el .glb (tolerancia 0,02)', () => {
    for (const p of PIPE_PIECES) {
      const m = medidas[name(p.model)];
      expect(m, p.model).toBeDefined();
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(m.min[i] - p.min[i]), `${p.id} min ${i}`).toBeLessThan(0.02);
        expect(Math.abs(m.max[i] - p.max[i]), `${p.id} max ${i}`).toBeLessThan(0.02);
      }
      // Cada puerto de la tabla es una cara exterior de brida medida, mirando hacia fuera.
      for (const port of p.ports) {
        const near = m.ends.filter((e) => dist(e.center, port.pos) < 0.02);
        expect(near.length, `${p.id} puerto ${port.pos}`).toBeGreaterThan(0);
        expect(near.some((e) => dist(e.normal, port.dir) < 0.02), `${p.id} dirección ${port.dir}`).toBe(true);
      }
      // Y no queda ningún extremo medido sin puerto: los exteriores son los de normal hacia fuera desde el centro de la pieza.
      const outer = m.ends.filter((e) => {
        const c = [(m.min[0] + m.max[0]) / 2, 0.5, (m.min[2] + m.max[2]) / 2];
        return (e.center[0] - c[0]) * e.normal[0] + (e.center[1] - c[1]) * e.normal[1] + (e.center[2] - c[2]) * e.normal[2] > 0;
      });
      for (const e of outer) expect(p.ports.some((port) => dist(port.pos, e.center) < 0.02), `${p.id} extremo sin puerto ${e.center}`).toBe(true);
    }
  });

  it('los puertos miran hacia fuera con vectores unitarios y están a la altura del eje del tubo salvo los verticales', () => {
    for (const p of PIPE_PIECES) {
      for (const port of p.ports) {
        expect(Math.hypot(...port.dir), p.id).toBeCloseTo(1, 3);
        if (port.dir[1] === 0) expect(port.pos[1], p.id).toBeCloseTo(PIPE_KIT.axisY, 3);
        // Hacia fuera: alejarse del origen en la dirección del puerto no se mete dentro de la caja.
        const out = [port.pos[0] + port.dir[0] * 0.05, port.pos[1] + port.dir[1] * 0.05, port.pos[2] + port.dir[2] * 0.05];
        for (let i = 0; i < 3; i++) expect(out[i] <= p.max[i] + 0.06 && out[i] >= p.min[i] - 0.06, `${p.id} fuera ${i}`).toBe(true);
      }
    }
  });

  it('las rectas miden 1 y 2, la T y el cruce están en el plano XY y la curva y el codo en el plano XZ', () => {
    const by = (id: string) => PIPE_PIECES.find((p) => p.id === id)!;
    expect(by('recta').max[0] - by('recta').min[0]).toBeCloseTo(1, 2);
    expect(by('larga').max[0] - by('larga').min[0]).toBeCloseTo(2, 2);
    for (const id of ['lateral', 'cruce', 'empalme']) expect(by(id).ports.every((q) => q.pos[2] === 0 && q.dir[2] === 0), id).toBe(true);
    for (const id of ['curva45', 'codo90']) expect(by(id).ports.every((q) => q.pos[1] === 0.5 && q.dir[1] === 0), id).toBe(true);
    // Giro del tubo en la curva (45°) y en el codo (90°): ángulo entre las direcciones salientes menos 180°.
    const turn = (id: string) => {
      const [a, b] = by(id).ports;
      const dot = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] + a.dir[2] * b.dir[2];
      return 180 - (Math.acos(dot) * 180) / Math.PI;
    };
    expect(turn('curva45')).toBeCloseTo(45, 0);
    expect(turn('codo90')).toBeCloseTo(90, 0);
  });
});
