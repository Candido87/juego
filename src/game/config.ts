import { BuildKind, Ore } from './types';

/** Todos los números de balance del juego en un único sitio. */
export const CONFIG = {
  mapW: 40,
  mapH: 40,
  /** Paso fijo de simulación (s). */
  step: 1 / 30,
  startCredits: 150,
  coreHp: 100,
  cost: { drill: 30, belt: 2, tower: 60 } as Record<BuildKind, number>,
  refund: 0.5,
  oreValue: { [Ore.Iron]: 1, [Ore.Copper]: 2 } as Record<number, number>,
  drillPeriod: 2,
  /** Casillas por segundo. */
  beltSpeed: 2,
  tower: { range: 4.5, damage: 5, cooldown: 0.6 },
  firstWaveDelay: 40,
  waveInterval: 30,
  spawnGap: 0.9,
  enemy: {
    baseHp: 12,
    hpGrowth: 1.22,
    baseSpeed: 0.9,
    speedGrowth: 0.03,
    maxSpeed: 1.8,
    damage: 10,
    bounty: 4,
    baseCount: 3,
    countGrowth: 2,
  },
};
