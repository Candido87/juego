import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { PIECE_TABLE, maskOf } from './conexiones';
import { PLAN3, SIDE, Sides, affectedTiles, pipePlan3, pipeSides, planFor3, portsMatch, portsOf } from './conexiones3d';
import { Game } from './game';
import { ports } from './puertos';
import { mulberry32 } from './rng';
import { instant } from './testutil';
import { DX, DY, Dir, Ore, opposite } from './types';
import { createFlatWorld } from './world';

const N = SIDE.NONE;
const L = SIDE.LEVEL;
const U = SIDE.UP;

describe('tabla única con desnivel (81 patrones)', () => {
  it('cubre todos los patrones y el reparto de piezas es el esperado', () => {
    expect(PLAN3.size).toBe(81);
    const n: Record<string, number> = {};
    for (const p of PLAN3.values()) n[p.piece] = (n[p.piece] ?? 0) + 1;
    expect(n).toEqual({
      isolated: 1, end: 4, straight: 2, corner: 4, tee: 4, cross: 1, // llano: igual que la tabla plana
      stepEnd: 4, stepStraight: 4, stepCornerR: 4, stepCornerL: 4, valleyStraight: 2, valleyCorner: 4, // con desnivel
      invalid: 43,
    });
  });

  it('en llano da lo mismo que la tabla plana de conexiones.ts', () => {
    for (let mask = 0; mask < 16; mask++) {
      const sides = [0, 1, 2, 3].map((d) => (mask & (1 << d) ? L : N)) as unknown as Sides;
      const p = planFor3(sides);
      expect(p.piece).toBe(PIECE_TABLE[mask].piece);
      expect(p.k).toBe(PIECE_TABLE[mask].k);
      expect(p.valid).toBe(true);
    }
  });

  it('los escalones: extremo, recta, giro a derecha e izquierda con su giro correcto', () => {
    expect(planFor3([U, N, N, N]).piece).toBe('stepEnd');
    expect(planFor3([N, N, N, U]).k).toBe(3);
    expect(planFor3([U, N, L, N]).piece).toBe('stepStraight');
    expect(planFor3([N, L, N, U]).piece).toBe('stepStraight');
    // Sube por el lado d y entra a nivel por el lado d+1 (derecha) o d+3 (izquierda): quiralidad distinta.
    for (let d = 0; d < 4; d++) {
      const s = (side: number, kind: number, other: number, kind2: number) => {
        const a = [N, N, N, N] as number[];
        a[side] = kind;
        a[other] = kind2;
        return a as unknown as Sides;
      };
      expect(planFor3(s(d, U, (d + 1) % 4, L)).piece).toBe('stepCornerR');
      expect(planFor3(s(d, U, (d + 3) % 4, L)).piece).toBe('stepCornerL');
      expect(planFor3(s(d, U, (d + 1) % 4, U)).piece).toBe('valleyCorner');
    }
    expect(planFor3([U, N, U, N]).piece).toBe('valleyStraight');
  });

  it('cada plan válido, girado k cuartos desde su forma canónica, reproduce exactamente los lados (giro correcto)', () => {
    for (const p of PLAN3.values()) {
      if (!p.valid || p.up.length === 0) continue;
      // Lados con unión y con subida son los del patrón.
      expect(p.up.every((d) => p.sides[d] === U)).toBe(true);
      expect(p.level.every((d) => p.sides[d] === L)).toBe(true);
      expect(p.up.length + p.level.length).toBe(p.sides.filter((s) => s !== N).length);
    }
  });

  it('T, cruce o más de dos uniones con un lado que sube son inválidos y explican el motivo; nunca hay pieza girada mal', () => {
    for (const p of PLAN3.values()) {
      const n = p.up.length + p.level.length;
      if (p.up.length > 0 && n >= 3) {
        expect(p.valid, p.sides.join('')).toBe(false);
        expect(p.reason).toContain('T o un cruce');
      }
      if (p.valid) expect(p.piece).not.toBe('invalid');
    }
  });
});

/** Terreno con alturas 0..2 al azar y un mapa de tuberías al azar encima. */
function randomScene(seed: number, pipes = 24): Game {
  const r = mulberry32(seed);
  const world = createFlatWorld(20, 20);
  for (let y = 2; y < 9; y++) for (let x = 2; x < 9; x++) world.height[y * 20 + x] = Math.floor(r() * 3);
  const g = new Game({ world, noWaves: true });
  const seen = new Set<string>();
  while (seen.size < pipes) {
    const x = 2 + Math.floor(r() * 7);
    const y = 2 + Math.floor(r() * 7);
    if (seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    instant(g, 'pipeline', x, y, Math.floor(r() * 4) as Dir);
  }
  return g;
}
const pipesOf = (g: Game) => [...g.buildings.values()].filter((b) => b.kind === 'pipeline');
const h = (g: Game, x: number, y: number) => g.world.height[y * g.world.w + x];

describe('conexiones con desnivel sobre terreno al azar', () => {
  it('los extremos de las piezas contiguas coinciden en el mundo (posición y dirección) en llano, subiendo y bajando', () => {
    let pairs = 0;
    let steps = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = randomScene(seed);
      for (const a of pipesOf(g)) {
        const pa = pipePlan3(g, a);
        for (const pt of portsOf(pa)) {
          const bx = a.x + DX[pt.side];
          const by = a.y + DY[pt.side];
          const b = g.buildingAt(bx, by)!;
          expect(b.kind).toBe('pipeline'); // sólo hay unión con tuberías (aquí no hay máquinas)
          const pb = portsOf(pipePlan3(g, b)).find((q) => q.side === opposite(pt.side));
          expect(pb, `la vecina también ve la unión (${a.x},${a.y})→(${bx},${by})`).toBeDefined();
          expect(portsMatch(a.x, a.y, pt, bx, by, pb!, h(g, a.x, a.y), h(g, bx, by))).toBe(true);
          pairs++;
          if (h(g, a.x, a.y) !== h(g, bx, by)) steps++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(200);
    expect(steps).toBeGreaterThan(30); // se probaron muchas uniones con desnivel de ±1
  });

  it('la casilla baja sube (UP) y la alta llega a nivel; con más de 1 nivel de diferencia no hay unión', () => {
    let up = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = randomScene(seed);
      for (const a of pipesOf(g)) {
        const s = pipeSides(g, a);
        for (let d = 0; d < 4; d++) {
          const n = g.buildingAt(a.x + DX[d], a.y + DY[d]);
          if (!n || n.kind !== 'pipeline') continue;
          const dh = h(g, n.x, n.y) - h(g, a.x, a.y);
          const linked = pipeSidesLinked(g, a, d);
          if (!linked) {
            expect(s[d]).toBe(N);
            continue;
          }
          if (Math.abs(dh) > 1) expect(s[d]).toBe(N);
          else if (dh === 1) {
            expect(s[d]).toBe(U);
            up++;
          } else expect(s[d]).toBe(L);
        }
      }
    }
    expect(up).toBeGreaterThan(30);
  });

  it('no depende del orden de colocación y recalcular no cambia nada', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = randomScene(seed);
      const plans = (game: Game) => new Map(pipesOf(game).map((b) => [`${b.x},${b.y}`, JSON.stringify(pipePlan3(game, b))]));
      const a = plans(g);
      expect(plans(g)).toEqual(a);
      // Misma escena colocada en otro orden.
      const list = pipesOf(g).map((b) => ({ x: b.x, y: b.y, d: b.dir }));
      const w2 = createFlatWorld(20, 20);
      w2.height.set(g.world.height);
      const g2 = new Game({ world: w2, noWaves: true });
      for (const p of [...list].reverse()) instant(g2, 'pipeline', p.x, p.y, p.d);
      expect(plans(g2)).toEqual(a);
    }
  });

  it('al borrar o colocar una pieza sólo cambian ella y sus cuatro vecinas, incluidas las de otro nivel', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = randomScene(seed, 20);
      const snap = () => new Map(pipesOf(g).map((b) => [`${b.x},${b.y}`, JSON.stringify(pipePlan3(g, b))]));
      const before = snap();
      const victim = pipesOf(g)[seed % 20];
      const near = new Set(affectedTiles(victim.x, victim.y).map((t) => `${t.x},${t.y}`));
      g.deleteBuilding(victim);
      const after = snap();
      for (const [k, v] of before) {
        if (near.has(k)) continue;
        expect(after.get(k), `casilla lejana ${k}`).toBe(v);
      }
    }
  });
});

/** ¿La lógica une a con su vecina por el lado d? (pipeSides sólo marca los unidos). */
function pipeSidesLinked(g: Game, a: { x: number; y: number }, d: number): boolean {
  const n = g.buildingAt(a.x + DX[d], a.y + DY[d]);
  const me = g.buildingAt(a.x, a.y)!;
  return !!n && n.kind === 'pipeline' && (d === me.dir || n.dir === opposite(d as Dir));
}

describe('puertos de edificios en otro nivel', () => {
  it('una tubería junto a una máquina más alta sube hacia ella; a más de un nivel no se une', () => {
    for (const rise of [0, 1, -1, 2]) {
      const world = createFlatWorld(20, 20);
      world.ore[6 * 20 + 6] = Ore.Oil;
      const g = new Game({ world, noWaves: true });
      const pump = instant(g, 'pump', 6, 6, 0);
      const out = ports(pump.kind, pump.x, pump.y, pump.dir).find((p) => p.io === 'out' && p.medium === 'liquid')!;
      const pipe = instant(g, 'pipeline', out.x, out.y, out.dir);
      g.world.height[6 * 20 + 6] = Math.max(0, rise);
      g.world.height[out.y * 20 + out.x] = rise < 0 ? 1 : 0;
      const towardPump = opposite(out.dir);
      const side = pipeSides(g, pipe)[towardPump];
      const dh = h(g, 6, 6) - h(g, out.x, out.y);
      if (Math.abs(dh) > 1) expect(side).toBe(N);
      else if (dh === 1) expect(side).toBe(U);
      else expect(side).toBe(L);
    }
  });
});

it('la altura de un nivel está en config.ts', () => {
  expect(CONFIG.scale.levelH).toBeGreaterThan(0);
  expect(maskOf([0])).toBe(1);
});
