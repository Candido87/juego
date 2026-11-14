/** Utilidades compartidas por los tests de lógica. */
import { expect } from 'vitest';
import { CONFIG } from './config';
import { Game } from './game';
import { BuildKind, Ore } from './types';
import { createFlatWorld } from './world';

/** Mapa plano 20x20 (núcleo en 9,9–10,10) con menas opcionales; oleadas desactivadas salvo que se pidan. */
export function flatGame(oreTiles: [number, number, Ore][] = [], opts: { waves?: boolean } = {}) {
  const world = createFlatWorld(20, 20);
  for (const [x, y, o] of oreTiles) world.ore[y * 20 + x] = o;
  return new Game({ world, noWaves: !opts.waves });
}

export function run(g: Game, seconds: number) {
  for (let i = 0; i < seconds / CONFIG.step; i++) g.step(CONFIG.step);
}

/** Red con generador en marcha (mucha gasolina) y postes en las casillas dadas. */
export function powerUp(g: Game, poles: [number, number][], gen: [number, number]) {
  for (const [x, y] of poles) instant(g, 'pole', x, y);
  const b = instant(g, 'generator', gen[0], gen[1]);
  b.inv = { gasoline: 1000 };
  b.running = true;
  return b;
}

/** Construye al instante (para preparar escenarios). Las torretas con munición salen llenas. */
export function instant(g: Game, kind: BuildKind, x: number, y: number, dir: 0 | 1 | 2 | 3 = 0) {
  g.unlockedBuildings.add(kind);
  const b = g.place(kind, x, y, dir)!;
  expect(b).not.toBeNull();
  g.completeBuilding(b);
  const t = g.turretDef(b);
  if (t?.ammo) b.inv[t.ammo] = t.ammoCap;
  return b;
}
