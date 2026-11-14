import { describe, expect, it } from 'vitest';
import { BUILD_KINDS } from '../game/types';
import { SHAPES } from './shapes';
import { chamfer, cyl, rect, rotate, solidFaces } from './solids';
import { HEAD_STEPS, MODELED, headIndex, headYaw, turretModel } from './turretModels';

describe('sólidos', () => {
  it('una caja muestra 2 caras laterales y la tapa; girarla 180° muestra las otras 2', () => {
    const s = { foot: rect(0.5, 0.5, 0.4, 0.4), z0: 0, z1: 10, color: 0x888888 };
    expect(solidFaces(s, 0)).toHaveLength(3);
    expect(solidFaces(s, Math.PI / 2)).toHaveLength(3);
    const lit = solidFaces(s, 0).map((f) => f.color);
    expect(new Set(lit).size).toBe(3); // tres tonos: arriba, izquierda, derecha
  });
  it('un cilindro y un chaflán tienen caras visibles y la tapa es la más clara', () => {
    for (const foot of [cyl(0.5, 0.5, 0.2, 10), chamfer(0.5, 0.5, 0.5, 0.5, 0.1)]) {
      const faces = solidFaces({ foot, z0: 0, z1: 8, color: 0x808080 }, 0.3);
      expect(faces.length).toBeGreaterThan(2);
      const top = faces.find((f) => f.normal.z === 1)!;
      expect(Math.max(...faces.map((f) => f.color & 255))).toBe(top.color & 255);
    }
  });
  it('rotar 360° devuelve el punto original', () => {
    const p = rotate(rotate({ x: 0.9, y: 0.3 }, 1.1), -1.1);
    expect(p.x).toBeCloseTo(0.9);
    expect(p.y).toBeCloseTo(0.3);
  });
});

describe('torretas modeladas', () => {
  it('el rumbo se redondea al índice más cercano y da la vuelta', () => {
    expect(headIndex(0)).toBe(0);
    expect(headIndex(headYaw(5))).toBe(5);
    expect(headIndex(-0.01)).toBe(0);
    expect(headIndex(Math.PI * 2 - 0.01)).toBe(0);
    expect(headIndex(Math.PI)).toBe(HEAD_STEPS / 2);
  });
  it('todo tipo y nivel modelado tiene base y cabeza, y su prisma de respaldo sigue registrado', () => {
    for (const k of MODELED)
      for (const lv of [1, 2, 3]) {
        const m = turretModel(k, lv);
        expect(m.base.length, `${k} ${lv} base`).toBeGreaterThan(0);
        expect(m.head.length, `${k} ${lv} cabeza`).toBeGreaterThan(5);
        expect(SHAPES[k]).toBeDefined();
      }
    for (const k of BUILD_KINDS.filter((x) => x.startsWith('turret_'))) expect(SHAPES[k]).toBeDefined();
  });
  it('cada nivel cambia el modelo de forma visible', () => {
    for (const k of MODELED) {
      const s = [1, 2, 3].map((lv) => JSON.stringify(turretModel(k, lv)));
      expect(new Set(s).size).toBe(3);
    }
  });
});
