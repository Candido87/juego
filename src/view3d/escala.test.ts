import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../game/config';
import { ITEM_GEO } from './scene3d';
import { ITEM_SHAPES } from './pieces';

const S = CONFIG.scale;

describe('Escala · cintas, tuberías y objetos transportados', () => {
  it('una casilla es una unidad y la cinta es más baja y estrecha que la casilla', () => {
    expect(S.unit).toBe(1);
    expect(S.beltWidth).toBeLessThan(0.7);
    expect(S.beltWidth).toBeGreaterThanOrEqual(0.55);
    expect(S.beltHeight).toBeGreaterThanOrEqual(0.12);
    expect(S.beltHeight).toBeLessThanOrEqual(0.2);
    expect(S.beltRail * 2).toBeLessThan(S.beltWidth / 2);
    expect(S.beltLane).toBeLessThanOrEqual(S.beltWidth - 2 * S.beltRail);
  });

  it('la tubería es más fina que la cinta y las bridas no pasan de 0,45', () => {
    expect(S.pipeDiameter).toBeGreaterThanOrEqual(0.3);
    expect(S.pipeDiameter).toBeLessThanOrEqual(0.4);
    expect(S.pipeFlange).toBeGreaterThanOrEqual(S.pipeDiameter);
    expect(S.pipeFlange).toBeLessThanOrEqual(0.45);
    expect(S.pipeDiameter).toBeLessThan(S.beltWidth);
  });

  it('cada forma de objeto mide entre 0,15 y 0,25 de lado máximo y cabe en el carril', () => {
    for (const shape of ITEM_SHAPES) {
      const g = ITEM_GEO[shape].geo;
      g.computeBoundingBox();
      const size = g.boundingBox!.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z);
      expect(max, shape).toBeGreaterThanOrEqual(S.itemSize[0] - 0.005);
      expect(max, shape).toBeLessThanOrEqual(S.itemSize[1] + 0.005);
      // Cabe en el carril: su ancho (perpendicular al avance) no supera el carril útil.
      expect(Math.min(size.x, size.z), shape).toBeLessThanOrEqual(S.beltLane);
    }
  });

  it('los objetos descansan sobre la superficie de la cinta: su base coincide con la altura de la cinta', () => {
    for (const shape of ITEM_SHAPES) {
      const g = ITEM_GEO[shape].geo;
      g.computeBoundingBox();
      const base = ITEM_GEO[shape].y + g.boundingBox!.min.y;
      expect(base, shape).toBeGreaterThanOrEqual(S.beltHeight - 1e-6);
      expect(base, shape).toBeLessThanOrEqual(S.beltHeight + 0.01);
    }
  });
});
