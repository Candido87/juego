import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Game } from './game';
import { flatGame, instant, powerUp, run } from './testutil';
import { DX, DY, Dir } from './types';

/** Cinta que recorre `path` (casillas) y sale hacia `into`; devuelve las cintas en orden. */
function layBelts(g: Game, path: [number, number][], into: [number, number]) {
  return path.map(([x, y], i) => {
    const next = i + 1 < path.length ? path[i + 1] : into;
    const dir = ([0, 1, 2, 3] as Dir[]).find((d) => x + DX[d] === next[0] && y + DY[d] === next[1])!;
    expect(dir, `${x},${y} → ${next}`).toBeDefined();
    return instant(g, 'belt', x, y, dir);
  });
}

/** Recorrido recto de `a` a `b` (incluye ambos, un eje cada vez). */
const line = (a: [number, number], b: [number, number]): [number, number][] => {
  const out: [number, number][] = [];
  let [x, y] = a;
  out.push([x, y]);
  while (x !== b[0] || y !== b[1]) {
    if (x !== b[0]) x += Math.sign(b[0] - x);
    else y += Math.sign(b[1] - y);
    out.push([x, y]);
  }
  return out;
};
const join = (...segs: [number, number][][]): [number, number][] => {
  const out: [number, number][] = [];
  for (const s of segs) for (const p of s) if (!out.length || out[out.length - 1][0] !== p[0] || out[out.length - 1][1] !== p[1]) out.push(p);
  return out;
};

/**
 * Pone postes junto a las cintas (uno cada 3 casillas, en la casilla libre vecina que no sea de la ruta, a menos de 2 de cada
 * cinta y de 6 del siguiente poste) y un generador en marcha pegado al primero.
 */
function energize(g: Game, path: [number, number][], _unused?: unknown, _gen?: unknown) {
  const onPath = new Set(path.map(([x, y]) => `${x},${y}`));
  const used = new Set<string>();
  const near = ([x, y]: [number, number]): [number, number] => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const k = `${x + dx},${y + dy}`;
      if (x + dx < 0 || y + dy < 0 || x + dx > 19 || y + dy > 19 || onPath.has(k) || used.has(k)) continue;
      // Lejos del núcleo (9..10): no se pisa.
      if (x + dx >= 9 && x + dx <= 10 && y + dy >= 9 && y + dy <= 10) continue;
      used.add(k);
      return [x + dx, y + dy];
    }
    throw new Error('sin sitio para el poste');
  };
  const poles = path.filter((_, i) => i % 3 === 1).map((t) => near(t));
  const gen = near(poles[0]);
  powerUp(g, poles, gen);
}

/**
 * Alimenta el primer tramo con un objeto cada vez que queda libre y cuenta: lo inyectado ha de ser igual a lo entregado en el
 * almacén más lo que aún va por las cintas (sin pérdidas ni duplicados).
 */
function feed(g: Game, first: { item: unknown; beltProgress: number }, belts: { item: unknown }[], seconds: number) {
  let injected = 0;
  const before = g.storage.iron_ore ?? 0;
  for (let i = 0; i < seconds / CONFIG.step; i++) {
    if (first.item === null) {
      (first as { item: string | null }).item = 'iron_ore';
      first.beltProgress = 0;
      injected++;
    }
    g.step(CONFIG.step);
  }
  const delivered = (g.storage.iron_ore ?? 0) - before;
  const onBelts = belts.filter((b) => b.item !== null).length;
  return { injected, delivered, onBelts };
}

describe('cintas con curvas: el material llega entero', () => {
  it('serpiente con curvas a derecha y a izquierda hacia el núcleo, sin pérdidas ni duplicados', () => {
    const g = flatGame();
    g.npcs = [];
    // Este → sur → este → sur → este: cuatro curvas (dos de cada tipo) y entrada al núcleo (9,9) por el oeste.
    const path = join(line([2, 2], [5, 2]), line([5, 2], [5, 5]), line([5, 5], [8, 5]), line([8, 5], [8, 9]));
    const belts = layBelts(g, path, [9, 9]);
    energize(g, path);
    run(g, 0.3);
    expect(belts.every((b) => b.power > 0)).toBe(true);
    const r = feed(g, belts[0], belts, 60);
    expect(r.injected).toBeGreaterThan(40);
    expect(r.delivered + r.onBelts).toBe(r.injected);
    // Casi todo llega: sólo queda por el camino lo que cabe en cintas (uno por casilla como máximo).
    expect(r.onBelts).toBeLessThanOrEqual(belts.length);
    expect(r.delivered).toBeGreaterThan(r.injected - belts.length);
  });

  it('también hacia el otro lado (oeste y norte), con curvas en los dos sentidos', () => {
    const g = flatGame();
    g.npcs = [];
    // Oeste a lo largo de y=12, norte por x=12 y oeste de nuevo hacia el núcleo (10,10) por el este.
    const path = join(line([17, 12], [12, 12]), line([12, 12], [12, 10]), line([12, 10], [11, 10]));
    const belts = layBelts(g, path, [10, 10]);
    energize(g, path);
    run(g, 0.3);
    expect(belts.every((b) => b.power > 0)).toBe(true);
    const r = feed(g, belts[0], belts, 50);
    expect(r.delivered + r.onBelts).toBe(r.injected);
    expect(r.delivered).toBeGreaterThan(r.injected - belts.length);
  });

  it('las curvas no frenan: mismo caudal que una recta con la misma velocidad de cinta', () => {
    const straight = flatGame();
    straight.npcs = [];
    const sPath = line([2, 9], [8, 9]);
    const sBelts = layBelts(straight, sPath, [9, 9]);
    energize(straight, sPath);
    run(straight, 0.3);
    feed(straight, sBelts[0], sBelts, 20); // la cinta se llena (más larga = más tarda)
    const a = feed(straight, sBelts[0], sBelts, 30);
    const curved = flatGame();
    curved.npcs = [];
    const cPath = join(line([2, 2], [5, 2]), line([5, 2], [5, 5]), line([5, 5], [8, 5]), line([8, 5], [8, 9]));
    const cBelts = layBelts(curved, cPath, [9, 9]);
    energize(curved, cPath);
    run(curved, 0.3);
    feed(curved, cBelts[0], cBelts, 20);
    const b = feed(curved, cBelts[0], cBelts, 30);
    // Régimen estacionario: un objeto por casilla y `speed` casillas por segundo; el caudal no depende de las curvas.
    expect(Math.abs(b.delivered - a.delivered)).toBeLessThanOrEqual(3);
    expect(a.delivered).toBeGreaterThan(CONFIG.belt.speed * 30 * 0.8);
  });

  it('un empalme lateral (T) no pierde ni duplica: los dos ramales entregan', () => {
    const g = flatGame();
    g.npcs = [];
    // Tronco por y=9 hacia el núcleo; un ramal entra por el norte en (5,9).
    const trunk = line([2, 9], [8, 9]);
    const tBelts = layBelts(g, trunk, [9, 9]);
    const branch = line([5, 5], [5, 8]);
    const bBelts = layBelts(g, branch, [5, 9]);
    energize(g, [...trunk, ...branch]);
    for (const [x, y] of branch.filter((_, i) => i % 2 === 0)) instant(g, 'pole', x - 1, y);
    run(g, 0.3);
    expect([...tBelts, ...bBelts].every((b) => b.power > 0)).toBe(true);
    let injA = 0;
    let injB = 0;
    const before = g.storage.iron_ore ?? 0;
    // El tronco se alimenta a un objeto por segundo (la mitad de su capacidad) para que quede hueco al ramal.
    const every = Math.round(1 / CONFIG.step);
    for (let i = 0; i < 60 / CONFIG.step; i++) {
      if (i % every === 0 && tBelts[0].item === null) ((tBelts[0].item = 'iron_ore'), (tBelts[0].beltProgress = 0), injA++);
      if (bBelts[0].item === null) ((bBelts[0].item = 'iron_ore'), (bBelts[0].beltProgress = 0), injB++);
      g.step(CONFIG.step);
    }
    const delivered = (g.storage.iron_ore ?? 0) - before;
    const onBelts = [...tBelts, ...bBelts].filter((b) => b.item !== null).length;
    expect(delivered + onBelts).toBe(injA + injB);
    // Los dos ramales avanzan (ninguno se queda sin servicio).
    expect(injA).toBeGreaterThan(40);
    expect(injB).toBeGreaterThan(10);
  });

  it('dos cintas de frente no se pasan nada (y no pierden lo que llevan); un extremo sin salida se llena y espera', () => {
    const g = flatGame();
    g.npcs = [];
    const a = instant(g, 'belt', 3, 3, 0);
    const b = instant(g, 'belt', 4, 3, 2);
    powerUp(g, [[3, 4], [4, 4]], [2, 4]);
    a.item = 'iron_ore';
    a.beltProgress = 0;
    b.item = 'coal';
    b.beltProgress = 0;
    run(g, 20);
    expect([a.item, b.item]).toEqual(['iron_ore', 'coal']);
    // Cinta que acaba en el vacío: el objeto llega al final y espera, no desaparece.
    const h = flatGame();
    h.npcs = [];
    const c = instant(h, 'belt', 3, 3, 0);
    powerUp(h, [[3, 4]], [2, 4]);
    c.item = 'wood';
    c.beltProgress = 0;
    run(h, 10);
    expect(c.item).toBe('wood');
    expect(c.beltProgress).toBe(1);
  });
});
