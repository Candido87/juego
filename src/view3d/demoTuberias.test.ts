import { describe, expect, it } from 'vitest';
import { pipePlan3, portsMatch, portsOf } from '../game/conexiones3d';
import { planFor, pipeConnections } from '../game/conexiones';
import { Game } from '../game/game';
import { DX, DY, opposite } from '../game/types';
import { pipeCases, placeDemoTuberias, tuberiasWorld } from './demoTuberias';

function demo() {
  const g = new Game({ world: tuberiasWorld(), noWaves: true });
  const r = placeDemoTuberias(g);
  return { g, r };
}
const piece = (g: Game, x: number, y: number) => pipePlan3(g, g.buildingAt(x, y)!).piece;

describe('mapa de pruebas de tuberías (?demo=tuberias)', () => {
  it('se coloca entero y cada caso en llano da la pieza esperada', () => {
    const { g, r } = demo();
    expect(r.notes.filter((n) => n.startsWith('no se pudo'))).toEqual([]);
    for (const c of pipeCases()) {
      const b = g.buildingAt(c.probe[0], c.probe[1])!;
      const expected = c.open.length === 0 ? 'isolated' : c.open.length === 1 ? 'end' : c.open.length === 4 ? 'cross' : c.open.length === 3 ? 'tee' : (c.open[0] + 2) % 4 === c.open[1] ? 'straight' : 'corner';
      expect(planFor(pipeConnections(g, b).mask).piece, c.id).toBe(expected);
      expect(pipePlan3(g, b).piece, c.id).toBe(expected);
    }
  });

  it('los casos con desnivel dan escalón recto, valle, giro con escalón, escalera de 2 niveles y extremo que sube', () => {
    const { g } = demo();
    expect(piece(g, 29, 29)).toBe('stepStraight');
    expect(piece(g, 30, 29)).toBe('straight'); // la casilla alta llega a nivel
    expect(piece(g, 33, 31)).toBe('valleyStraight');
    expect(['stepCornerR', 'stepCornerL']).toContain(piece(g, 29, 33));
    expect(piece(g, 29, 36)).toBe('stepStraight');
    expect(piece(g, 33, 36)).toBe('stepStraight');
    expect(piece(g, 29, 38)).toBe('stepEnd');
    expect(piece(g, 25, 36)).toBe('corner'); // codo del kit
  });

  it('en todo el mapa los extremos de las piezas contiguas coinciden (sin huecos) y no hay ninguna pieza inválida', () => {
    const { g } = demo();
    const h = (x: number, y: number) => g.world.height[y * g.world.w + x];
    for (const a of g.buildings.values()) {
      if (a.kind !== 'pipeline') continue;
      const plan = pipePlan3(g, a);
      expect(plan.valid, `${a.x},${a.y}`).toBe(true);
      for (const pt of portsOf(plan)) {
        const bx = a.x + DX[pt.side];
        const by = a.y + DY[pt.side];
        const b = g.buildingAt(bx, by)!;
        if (b.kind !== 'pipeline') continue; // puerto de una máquina
        const pb = portsOf(pipePlan3(g, b)).find((q) => q.side === opposite(pt.side))!;
        expect(pb, `${a.x},${a.y}→${bx},${by}`).toBeDefined();
        expect(portsMatch(a.x, a.y, pt, bx, by, pb, h(a.x, a.y), h(bx, by))).toBe(true);
      }
    }
  });
});
