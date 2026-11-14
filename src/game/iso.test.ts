import { describe, expect, it } from 'vitest';
import { depthOf, gridToScreen, occludes, pickTile, screenToGrid, screenToTile } from './iso';
import { mulberry32 } from './rng';

describe('conversión cuadrícula ↔ pantalla', () => {
  it('casillas conocidas: rombo 64x32', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(gridToScreen(0, 1)).toEqual({ x: -32, y: 16 });
    expect(gridToScreen(1, 1)).toEqual({ x: 0, y: 32 });
    expect(gridToScreen(1, 1, 2)).toEqual({ x: 0, y: 0 });
  });

  it('ida y vuelta grid → pantalla → grid da el mismo punto (aleatorio, con altura)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 2000; i++) {
      const gx = rng() * 200 - 100;
      const gy = rng() * 200 - 100;
      const gz = Math.floor(rng() * 3);
      const s = gridToScreen(gx, gy, gz);
      const g = screenToGrid(s.x, s.y, gz);
      expect(g.x).toBeCloseTo(gx, 9);
      expect(g.y).toBeCloseTo(gy, 9);
    }
  });

  it('ida y vuelta pantalla → grid → pantalla', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const sx = rng() * 4000 - 2000;
      const sy = rng() * 4000 - 2000;
      const gz = Math.floor(rng() * 3);
      const g = screenToGrid(sx, sy, gz);
      const s = gridToScreen(g.x, g.y, gz);
      expect(s.x).toBeCloseTo(sx, 9);
      expect(s.y).toBeCloseTo(sy, 9);
    }
  });

  it('el centro de cada casilla se resuelve a esa casilla', () => {
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) {
        const c = gridToScreen(x + 0.5, y + 0.5);
        expect(screenToTile(c.x, c.y)).toEqual({ x, y });
      }
  });
});

describe('selección con relieve', () => {
  const W = 10;
  const H = 10;
  it('terreno plano: devuelve la casilla bajo el cursor', () => {
    const c = gridToScreen(3.5, 4.5);
    expect(pickTile(c.x, c.y, W, H, () => 0)).toEqual({ x: 3, y: 4 });
  });

  it('una casilla elevada se selecciona por su cara superior', () => {
    const heights = (x: number, y: number) => (x === 5 && y === 5 ? 2 : 0);
    const c = gridToScreen(5.5, 5.5, 2);
    expect(pickTile(c.x, c.y, W, H, heights)).toEqual({ x: 5, y: 5 });
  });

  it('una casilla alta delante tapa a la de detrás', () => {
    // El punto de suelo de (4,4) queda cubierto por la columna de (5,5) a altura 2.
    const heights = (x: number, y: number) => (x === 5 && y === 5 ? 2 : 0);
    const p = gridToScreen(5.5, 5.5, 1); // a media altura de la columna
    expect(pickTile(p.x, p.y, W, H, heights)).toEqual({ x: 5, y: 5 });
  });

  it('fuera del mapa devuelve null', () => {
    const p = gridToScreen(-3, -3);
    expect(pickTile(p.x, p.y, W, H, () => 0)).toBeNull();
  });
});

describe('profundidad y oclusión', () => {
  it('lo de delante (mayor x+y) se dibuja encima', () => {
    expect(depthOf(3, 3)).toBeGreaterThan(depthOf(2, 3));
    expect(depthOf(2, 3, 5)).toBeGreaterThan(depthOf(2, 3, 0));
    expect(depthOf(3, 3, 0)).toBeGreaterThan(depthOf(2, 3, 9));
  });

  it('occludes sólo si está delante y cubre el punto', () => {
    const rect = { x: 0, y: 0, width: 50, height: 80 };
    expect(occludes(rect, 100, { x: 10, y: 10 }, 50)).toBe(true);
    expect(occludes(rect, 100, { x: 10, y: 10 }, 150)).toBe(false); // objetivo delante
    expect(occludes(rect, 100, { x: 90, y: 10 }, 50)).toBe(false); // fuera del rect
  });
});
