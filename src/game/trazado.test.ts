import { describe, expect, it } from 'vitest';
import { PIECE_TABLE, maskOf, pipeConnections, planFor } from './conexiones';
import { Game } from './game';
import { mulberry32 } from './rng';
import { instant, powerUp, run } from './testutil';
import { Tile, commitTrace, extendPath, pathDirs, planTrace, stepDir, undoTrace } from './trazado';
import { createFlatWorld } from './world';

const t = (x: number, y: number): Tile => ({ x, y });
const flat = () => new Game({ world: createFlatWorld(20, 20), noWaves: true });
const adjacent = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

describe('trazado: recorrido por ejes', () => {
  it('nunca va en diagonal: dos casillas contiguas cualesquiera del recorrido están a un paso', () => {
    const r = mulberry32(5);
    let path: Tile[] = [t(3, 3)];
    for (let i = 0; i < 200; i++) {
      path = extendPath(path, t(Math.floor(r() * 18), Math.floor(r() * 18)));
      for (let k = 1; k < path.length; k++) expect(adjacent(path[k - 1], path[k])).toBe(true);
      expect(new Set(path.map((p) => `${p.x},${p.y}`)).size).toBe(path.length); // sin casillas repetidas
    }
  });

  it('en línea recta llega hasta el cursor; en diagonal sale un camino en L o escalonado que también llega', () => {
    expect(extendPath([t(2, 2)], t(6, 2)).map((p) => p.x)).toEqual([2, 3, 4, 5, 6]);
    const l = extendPath([t(2, 2)], t(5, 4));
    expect(l[0]).toEqual(t(2, 2));
    expect(l[l.length - 1]).toEqual(t(5, 4));
    expect(l).toHaveLength(6);
    // Sigue recto antes de girar: el primer tramo es horizontal (eje dominante) y hay un solo giro.
    const turns = l.slice(2).filter((p, i) => (p.x - l[i + 1].x !== 0) !== (l[i + 1].x - l[i].x !== 0)).length;
    expect(turns).toBe(1);
  });

  it('al retroceder deshace el recorrido hasta la casilla a la que vuelve el ratón', () => {
    let p = extendPath([t(2, 2)], t(7, 2));
    p = extendPath(p, t(4, 2));
    expect(p).toEqual([t(2, 2), t(3, 2), t(4, 2)]);
    p = extendPath(p, t(2, 2));
    expect(p).toEqual([t(2, 2)]);
  });

  it('con Mayús queda una línea recta desde la primera casilla según el eje dominante', () => {
    const p = extendPath([t(5, 5)], t(9, 7), true);
    expect(p.every((q) => q.y === 5)).toBe(true);
    expect(p[p.length - 1]).toEqual(t(9, 5));
    const v = extendPath([t(5, 5)], t(6, 11), true);
    expect(v.every((q) => q.x === 5)).toBe(true);
    expect(v).toHaveLength(7);
  });

  it('cada casilla apunta a la siguiente y la última sigue la dirección anterior', () => {
    const p = [t(2, 2), t(3, 2), t(3, 3), t(3, 4)];
    expect(pathDirs(p, 0)).toEqual([0, 1, 1, 1]);
    expect(pathDirs([t(4, 4)], 2)).toEqual([2]);
    expect(stepDir(t(1, 1), t(1, 0))).toBe(3);
    expect(stepDir(t(1, 1), t(3, 1))).toBeNull();
  });
});

describe('trazado: piezas que salen del recorrido (tabla única)', () => {
  it('un recorrido en L produce extremo, recta, curva, recta y extremo con el giro correcto', () => {
    const g = flat();
    const plan = planTrace(g, 'pipeline', [t(2, 2), t(3, 2), t(4, 2), t(4, 3), t(4, 4)], 0);
    expect(plan.ok).toBe(true);
    const rec = commitTrace(g, plan)!;
    expect(rec.placed).toHaveLength(5);
    for (const id of rec.placed) g.completeBuilding(g.buildings.get(id)!);
    const pieces = plan.tiles.map((q) => planFor(pipeConnections(g, g.buildingAt(q.x, q.y)!).mask).piece);
    expect(pieces).toEqual(['end', 'straight', 'corner', 'straight', 'end']);
  });

  it('un recorrido en U y otro en escalón construyen piezas válidas de la tabla en cada casilla', () => {
    for (const path of [
      [t(2, 2), t(3, 2), t(4, 2), t(4, 3), t(3, 3), t(2, 3)],
      [t(2, 2), t(3, 2), t(3, 3), t(4, 3), t(4, 4), t(5, 4)],
    ]) {
      const g = flat();
      const rec = commitTrace(g, planTrace(g, 'pipeline', path, 0))!;
      for (const id of rec.placed) g.completeBuilding(g.buildings.get(id)!);
      for (const q of path) {
        const m = pipeConnections(g, g.buildingAt(q.x, q.y)!).mask;
        expect(planFor(m)).toBe(PIECE_TABLE[m]);
        // Todas las casillas del interior del recorrido tienen exactamente 2 uniones (recta o curva).
        const i = path.findIndex((p) => p.x === q.x && p.y === q.y);
        if (i > 0 && i < path.length - 1) expect(['straight', 'corner']).toContain(planFor(m).piece);
      }
    }
  });

  it('una cinta trazada transporta: el material recorre todo el camino de una punta a la otra', () => {
    const g = flat();
    const path = [t(2, 2), t(3, 2), t(4, 2), t(4, 3), t(4, 4)];
    const rec = commitTrace(g, planTrace(g, 'belt', path, 0))!;
    for (const id of rec.placed) g.completeBuilding(g.buildings.get(id)!);
    powerUp(g, [[3, 3], [5, 3]], [3, 5]);
    const first = g.buildingAt(2, 2)!;
    first.item = 'iron_ore';
    first.beltProgress = 0;
    run(g, 25);
    // El objeto ha recorrido las cinco casillas, con la curva, hasta la última.
    expect(g.buildingAt(4, 4)!.item).toBe('iron_ore');
    expect(first.item).toBeNull();
    // Las direcciones siguen el recorrido: de (2,2) a +x, giro a +y.
    expect(g.buildingAt(2, 2)!.dir).toBe(0);
    expect(g.buildingAt(4, 2)!.dir).toBe(1);
    expect(maskOf([g.buildingAt(4, 4)!.dir])).toBe(maskOf([1]));
  });
});

describe('trazado: plan, motivos y coste', () => {
  it('suma el coste de las piezas nuevas y avisa si faltan materiales', () => {
    const g = flat();
    const plan = planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0);
    expect(plan.fresh).toBe(3);
    expect(plan.cost.frame ?? plan.cost.gear ?? plan.cost.iron_plate ?? 0).toBeGreaterThan(0);
    for (const k of Object.keys(g.storage)) delete g.storage[k as keyof typeof g.storage];
    expect(planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0).affordable).toBe(false);
  });

  it('una casilla ocupada se marca en rojo con su motivo y el plan no es válido', () => {
    const g = flat();
    instant(g, 'storage', 3, 2);
    const plan = planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0);
    expect(plan.ok).toBe(false);
    expect(plan.tiles[1].status).toBe('bad');
    expect(plan.reason).toBeTruthy();
    expect(commitTrace(g, plan)).toBeNull();
  });

  it('un desnivel de 2 niveles se rechaza (cinta: propone el ascensor); de 1 nivel se admite', () => {
    const w = createFlatWorld(20, 20);
    w.height[2 * 20 + 4] = 2;
    w.height[2 * 20 + 3] = 1;
    const g = new Game({ world: w, noWaves: true });
    const bad = planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0);
    expect(bad.ok).toBe(true); // 0→1→2: dos pasos de un nivel
    const w2 = createFlatWorld(20, 20);
    w2.height[2 * 20 + 4] = 2;
    const g2 = new Game({ world: w2, noWaves: true });
    const p2 = planTrace(g2, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0);
    expect(p2.ok).toBe(false);
    expect(p2.reason).toContain('ascensor');
    expect(planTrace(g2, 'pipeline', [t(2, 2), t(3, 2), t(4, 2)], 0).reason).toContain('tubería');
  });

  it('invertir (R) cambia el sentido de las piezas sin cambiar las casillas', () => {
    const g = flat();
    const p = [t(2, 2), t(3, 2), t(4, 2)];
    const a = planTrace(g, 'belt', p, 0);
    const b = planTrace(g, 'belt', p, 0, true);
    expect(a.tiles.map((q) => q.dir)).toEqual([0, 0, 0]);
    expect(b.tiles.map((q) => q.dir)).toEqual([2, 2, 2]);
    expect(b.tiles.map((q) => q.x)).toEqual([4, 3, 2]);
  });

  it('una pieza igual ya puesta sólo se gira (sin coste) y el resto se construye', () => {
    const g = flat();
    instant(g, 'belt', 3, 2, 1);
    const plan = planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0);
    expect(plan.reused).toBe(1);
    expect(plan.fresh).toBe(2);
    expect(plan.ok).toBe(true);
  });
});

describe('trazado: un solo paso para construir y para deshacer', () => {
  it('construye todo el recorrido a la vez (obras) y un deshacer lo revierte entero, devolviendo los materiales', () => {
    const g = flat();
    const before = JSON.stringify(g.storage);
    const n0 = g.buildings.size;
    const rec = commitTrace(g, planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2), t(4, 3)], 0))!;
    expect(g.buildings.size).toBe(n0 + 4);
    expect(rec.placed.every((id) => !g.buildings.get(id)!.built)).toBe(true); // obras para los constructores
    expect(undoTrace(g, rec)).toBe(4);
    expect(g.buildings.size).toBe(n0);
    expect(JSON.stringify(g.storage)).toBe(before);
  });

  it('deshacer también restaura el giro de las piezas existentes', () => {
    const g = flat();
    instant(g, 'belt', 3, 2, 1);
    const rec = commitTrace(g, planTrace(g, 'belt', [t(2, 2), t(3, 2), t(4, 2)], 0))!;
    expect(g.buildingAt(3, 2)!.dir).toBe(0);
    undoTrace(g, rec);
    expect(g.buildingAt(3, 2)!.dir).toBe(1);
  });
});
