import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { flatGame, instant, run } from './testutil';
import { Ore } from './types';
import { powerMult } from './power';

const P = CONFIG.power;

describe('redes eléctricas', () => {
  it('postes a menos del alcance forman una red; más lejos, dos', () => {
    const g = flatGame();
    instant(g, 'pole', 2, 2);
    instant(g, 'pole', 2 + P.wireRange, 2); // justo en el alcance
    instant(g, 'pole', 2 + P.wireRange * 2 + 1, 2); // fuera
    run(g, 0.1);
    expect(g.grid.nets.length).toBe(2);
    expect(g.grid.wires.length).toBe(1);
  });

  it('un edificio se conecta al poste cercano y no a uno lejano', () => {
    const g = flatGame();
    instant(g, 'pole', 3, 3);
    const near = instant(g, 'factory', 3 + P.supplyRadius, 3);
    const far = instant(g, 'factory', 3 + P.supplyRadius + 1, 3);
    run(g, 0.1);
    expect(g.netOf(near)).toBeDefined();
    expect(g.netOf(far)).toBeUndefined();
  });

  it('generador sin arrancar no produce; un Operario lo arranca si tiene combustible', () => {
    const g = flatGame();
    instant(g, 'pole', 4, 4);
    const gen = instant(g, 'generator', 5, 4);
    const f = instant(g, 'factory', 4, 5);
    gen.inv = { gasoline: 5 };
    run(g, 0.1);
    expect(gen.running).toBe(false);
    expect(f.power).toBe(0);
    g.jobs.refresh(g);
    expect(g.jobs.list().some((j) => j.type === 'start')).toBe(true);
    run(g, 15);
    expect(gen.running).toBe(true);
    expect(f.power).toBe(1);
    expect(powerMult(f)).toBe(P.mult.factory![1]);
  });

  it('arranque desde cero: Transportista lleva gasolina y Operario arranca', () => {
    const g = flatGame();
    g.storage.gasoline = 10;
    instant(g, 'pole', 4, 4);
    const gen = instant(g, 'generator', 5, 4);
    run(g, 40);
    expect(gen.running).toBe(true);
    expect(g.grid.nets[0].production).toBe(P.generators.generator!.power);
  });

  it('sin combustible el generador se para', () => {
    const g = flatGame();
    instant(g, 'pole', 4, 4);
    const gen = instant(g, 'generator', 5, 4);
    gen.inv = { gasoline: 1 };
    gen.running = true;
    g.npcs = [];
    run(g, P.generators.generator!.burnTime! + 1);
    expect(gen.running).toBe(false);
  });

  it('apagón parcial: rendimiento proporcional a la energía disponible', () => {
    const g = flatGame();
    g.npcs = [];
    instant(g, 'pole', 4, 4);
    const gen = instant(g, 'generator', 5, 4);
    gen.inv = { gasoline: 10 };
    gen.running = true;
    // Demanda = 2 × producción.
    const n = Math.round((2 * P.generators.generator!.power) / P.demand.factory!);
    const fs = [];
    for (let i = 0; i < n; i++) fs.push(instant(g, 'factory', 2 + (i % 5), 2 + Math.floor(i / 5)));
    run(g, 0.2);
    for (const f of fs) expect(f.power).toBeCloseTo(0.5, 5);
    const [lo, hi] = P.mult.factory!;
    expect(g.factorySpeed(fs[0])).toBeCloseTo(lo + (hi - lo) * 0.5, 5);
  });

  it('los consumidores críticos reciben energía primero', () => {
    const g = flatGame();
    g.npcs = [];
    instant(g, 'pole', 4, 4);
    const gen = instant(g, 'generator', 5, 4);
    gen.inv = { gasoline: 10 };
    gen.running = true;
    const n = Math.round((2 * P.generators.generator!.power) / P.demand.factory!);
    const fs = [];
    for (let i = 0; i < n; i++) fs.push(instant(g, 'factory', 2 + (i % 5), 2 + Math.floor(i / 5)));
    for (const f of fs.slice(0, n / 2)) g.setCritical(f.id, true);
    run(g, 0.2);
    expect(fs[0].power).toBe(1);
    expect(fs[n - 1].power).toBe(0);
  });

  it('los taladros funcionan sin red y van más rápido con ella', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    const d = instant(g, 'drill', 3, 3);
    expect(powerMult(d)).toBe(P.mult.drill![0]);
    d.power = 1;
    expect(powerMult(d)).toBe(P.mult.drill![1]);
  });
});
