import { describe, expect, it } from 'vitest';
import { PIECE_TABLE, dirsOf, maskOf, pipeConnections, planFor } from './conexiones';
import { Game } from './game';
import { mulberry32 } from './rng';
import { instant } from './testutil';
import { pipeNetworks } from './tuberias';
import { ports } from './puertos';
import { DX, DY, Dir, Ore, opposite } from './types';
import { createFlatWorld } from './world';

const rot = (mask: number, k: number) => maskOf(dirsOf(mask).map((d) => d + k));

describe('tabla única máscara → pieza', () => {
  it('tiene las 16 máscaras y cada pieza, girada k cuartos, reproduce exactamente la máscara', () => {
    expect(PIECE_TABLE).toHaveLength(16);
    const canon = { isolated: [], end: [0], straight: [0, 2], corner: [0, 1], tee: [0, 1, 2], cross: [0, 1, 2, 3] } as const;
    for (let m = 0; m < 16; m++) {
      const p = planFor(m);
      expect(maskOf(canon[p.piece].map((d) => d + p.k)), `máscara ${m}`).toBe(m);
      expect(p.open).toEqual(dirsOf(m));
      expect(p.k).toBeGreaterThanOrEqual(0);
      expect(p.k).toBeLessThan(4);
    }
  });

  it('reparto de piezas: 1 aislada, 4 extremos, 2 rectas, 4 curvas, 4 T y 1 cruce', () => {
    const n: Record<string, number> = {};
    for (const p of PIECE_TABLE) n[p.piece] = (n[p.piece] ?? 0) + 1;
    expect(n).toEqual({ isolated: 1, end: 4, straight: 2, corner: 4, tee: 4, cross: 1 });
  });

  it('girar la máscara no cambia el tipo de pieza (sólo su giro) y el giro es determinista', () => {
    for (let m = 0; m < 16; m++)
      for (let r = 1; r < 4; r++) {
        expect(planFor(rot(m, r)).piece).toBe(planFor(m).piece);
        expect(planFor(m)).toEqual(planFor(m)); // idempotente: la misma entrada da siempre lo mismo
      }
  });

  it('las rectas sólo existen en los dos ejes y no hay curva con lados opuestos', () => {
    expect(planFor(0b0101).piece).toBe('straight');
    expect(planFor(0b1010).piece).toBe('straight');
    for (let m = 0; m < 16; m++) if (planFor(m).piece === 'corner') expect(dirsOf(m)[1] - dirsOf(m)[0]).not.toBe(2);
  });
});

/** Mapa de tuberías aleatorio (dirección y casillas al azar) colocado en el orden dado. */
function randomPipes(seed: number, n: number): { x: number; y: number; d: Dir }[] {
  const r = mulberry32(seed);
  const seen = new Set<string>();
  const out: { x: number; y: number; d: Dir }[] = [];
  while (out.length < n) {
    const x = 2 + Math.floor(r() * 6);
    const y = 2 + Math.floor(r() * 6);
    if (seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    out.push({ x, y, d: Math.floor(r() * 4) as Dir });
  }
  return out;
}
function build(list: { x: number; y: number; d: Dir }[]): Game {
  const g = new Game({ world: createFlatWorld(20, 20), noWaves: true });
  for (const p of list) instant(g, 'pipeline', p.x, p.y, p.d);
  return g;
}
const masks = (g: Game) => new Map([...g.buildings.values()].filter((b) => b.kind === 'pipeline').map((b) => [`${b.x},${b.y}`, pipeConnections(g, b).mask]));

describe('conexiones de tuberías = regla de la lógica de redes', () => {
  it('no depende del orden en que se colocan las piezas y recalcular no cambia nada', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const list = randomPipes(seed, 22);
      const a = masks(build(list));
      const reversed = masks(build([...list].reverse()));
      const rnd = mulberry32(seed + 100);
      const shuffled = masks(build([...list].sort(() => rnd() - 0.5)));
      expect(reversed).toEqual(a);
      expect(shuffled).toEqual(a);
      const g = build(list);
      expect(masks(g)).toEqual(masks(g));
    }
  });

  it('es simétrica: si A se une con B por un lado, B se une con A por el opuesto', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = build(randomPipes(seed, 22));
      const m = masks(g);
      for (const [k, mask] of m) {
        const [x, y] = k.split(',').map(Number);
        for (const d of dirsOf(mask)) {
          const nb = m.get(`${x + DX[d]},${y + DY[d]}`);
          expect(nb, `${k} hacia ${d}`).toBeDefined();
          expect((nb! >> opposite(d)) & 1, `${k} hacia ${d}`).toBe(1);
        }
      }
    }
  });

  it('las componentes que forman las máscaras son exactamente las redes de la lógica', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = build(randomPipes(seed, 24));
      const m = masks(g);
      const comp = new Map<string, number>();
      let n = 0;
      for (const start of m.keys()) {
        if (comp.has(start)) continue;
        const stack = [start];
        comp.set(start, n);
        while (stack.length) {
          const [x, y] = stack.pop()!.split(',').map(Number);
          for (const d of dirsOf(m.get(`${x},${y}`)!)) {
            const nk = `${x + DX[d]},${y + DY[d]}`;
            if (!comp.has(nk)) {
              comp.set(nk, n);
              stack.push(nk);
            }
          }
        }
        n++;
      }
      const nets = pipeNetworks(g);
      expect(n, `semilla ${seed}`).toBe(nets.length);
      for (const net of nets) expect(new Set(net.pipes.map((p) => comp.get(`${p.x},${p.y}`))).size).toBe(1);
    }
  });

  it('las paralelas y las que se alejan NO se dibujan unidas (antes sí)', () => {
    let g = build([{ x: 5, y: 5, d: 0 }, { x: 5, y: 6, d: 0 }]);
    expect([...masks(g).values()]).toEqual([0, 0]);
    g = build([{ x: 5, y: 5, d: 2 }, { x: 6, y: 5, d: 0 }]);
    expect([...masks(g).values()]).toEqual([0, 0]);
    g = build([{ x: 5, y: 5, d: 0 }, { x: 6, y: 5, d: 0 }]);
    expect([...masks(g).values()]).toEqual([0b0001, 0b0100]);
  });
});

describe('conexiones de tuberías con puertos de edificios', () => {
  it('sólo hay unión con la máquina por un lado con puerto y con la orientación adecuada', () => {
    const world = createFlatWorld(20, 20);
    world.ore[6 * 20 + 6] = Ore.Oil;
    const g = new Game({ world, noWaves: true });
    const pump = instant(g, 'pump', 6, 6, 0); // salida de petróleo en (7,6)
    const out = ports(pump.kind, pump.x, pump.y, pump.dir).find((p) => p.io === 'out' && p.medium === 'liquid')!;
    const ok = instant(g, 'pipeline', out.x, out.y, out.dir);
    const towardPump = opposite(out.dir);
    expect(pipeConnections(g, ok)).toEqual({ mask: 1 << towardPump, machines: 1 << towardPump });
    // Una tubería en un lado de la bomba sin puerto no se une con ella.
    const free = ([0, 1, 2, 3] as Dir[]).map((d) => ({ x: pump.x + DX[d], y: pump.y + DY[d] })).find((t) => !(t.x === out.x && t.y === out.y))!;
    const side = instant(g, 'pipeline', free.x, free.y, 0);
    expect(pipeConnections(g, side).machines).toBe(0);
    // La que mira hacia la bomba desde el puerto de salida no es válida.
    // (la colocación rechaza esa orientación; se gira a mano la pieza ya colocada: la lógica sólo lee su dir)
    ok.dir = opposite(out.dir);
    expect(pipeConnections(g, ok).machines).toBe(0);
  });

  it('un puerto de entrada sólo se une con la tubería que apunta a él', () => {
    const g = new Game({ world: createFlatWorld(20, 20), noWaves: true });
    const gen = instant(g, 'generator', 4, 4, 0);
    const inPort = ports(gen.kind, gen.x, gen.y, gen.dir).find((p) => p.io === 'in' && p.medium === 'liquid')!;
    expect(inPort).toBeDefined();
    const facing = instant(g, 'pipeline', inPort.x, inPort.y, inPort.dir);
    expect(pipeConnections(g, facing).machines).not.toBe(0);
    // Girada para que no apunte al generador: ya no se une.
    facing.dir = opposite(inPort.dir);
    expect(pipeConnections(g, facing).machines).toBe(0);
  });
});
