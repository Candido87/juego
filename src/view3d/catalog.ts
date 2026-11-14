/**
 * Catálogo de modelos 3D: qué pieza de Kenney representa cada edificio, enemigo, torreta y decoración.
 * Datos puros (sin Three): los comprueba un test contra los archivos de `public/assets/3d/`.
 */
import type { BuildingKind, EnemyKind, TurretKind } from '../game/types';

/** Ruta relativa a `public/assets/3d/` sin extensión: `pack/modelo`. */
export type ModelId = string;

export interface Part {
  model: ModelId;
  /** Lado máximo (en casillas) al que se ajusta el modelo. */
  fit?: number;
  /** Se apila sobre la parte anterior. */
  stack?: boolean;
  /** Desplazamiento horizontal en casillas. */
  dx?: number;
  dz?: number;
  /** Color multiplicado sobre la paleta del modelo. */
  tint?: number;
  /** Estiramiento vertical. */
  sy?: number;
  /** Gira continuamente (engranajes). */
  spin?: boolean;
  /** Se mueve arriba/abajo (pistones). */
  bob?: boolean;
}

export const BUILDING_PARTS: Record<BuildingKind, Part[]> = {
  core: [{ model: 'industrial/building-h', fit: 1.8 }, { model: 'industrial/chimney-large', fit: 0.5, dx: 0.55, dz: -0.55 }],
  drill: [{ model: 'factory/machine-connection-hole', fit: 0.85 }, { model: 'factory/piston-round', fit: 0.4, stack: true, bob: true }],
  belt: [{ model: 'factory/conveyor', fit: 1 }],
  belt_fast: [{ model: 'factory/conveyor-stripe', fit: 1 }],
  pipeline: [{ model: 'factory/pipe-large', fit: 1 }],
  storage: [{ model: 'industrial/shipping-container-a', fit: 0.95 }],
  factory: [{ model: 'factory/machine', fit: 0.9 }, { model: 'factory/robot-arm-a', fit: 0.5, stack: true }],
  farm: [{ model: 'factory/hopper-square', fit: 0.8 }, { model: 'forest/plant', fit: 0.5, stack: true }],
  pump: [{ model: 'industrial/detail-tank', fit: 0.8 }, { model: 'factory/pipe-large-valve', fit: 0.5, stack: true }],
  refinery: [{ model: 'industrial/detail-tank-large', fit: 0.9 }, { model: 'industrial/chimney-medium', fit: 0.4, dx: 0.3, dz: -0.3 }],
  workshop: [{ model: 'industrial/building-c', fit: 0.95 }],
  house: [{ model: 'industrial/building-a', fit: 0.95 }],
  pole: [{ model: 'industrial/chimney-small', fit: 0.3 }],
  generator: [{ model: 'industrial/building-d', fit: 0.8 }, { model: 'factory/cog-a', fit: 0.5, stack: true, spin: true }],
  solar: [{ model: 'industrial/solar-panel-flat', fit: 0.95 }],
  turbine: [{ model: 'industrial/windmill', fit: 0.9 }],
  accumulator: [{ model: 'industrial/detail-tank', fit: 0.7 }, { model: 'factory/cog-b', fit: 0.3, stack: true }],
  feeder: [{ model: 'factory/hopper-round', fit: 0.6 }],
  turret_bullet: [{ model: 'factory/hopper-round', fit: 0.85 }],
  turret_laser: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xa8d8ff }],
  turret_fire: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xffb080 }],
  turret_frost: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xc8f0ff }],
  wall_wood: [{ model: 'factory/structure-short', fit: 1.05, tint: 0xc98a52, sy: 1.4 }],
  wall_stone: [{ model: 'factory/structure-medium', fit: 1.05, tint: 0xb0b8c0 }],
  wall_metal: [{ model: 'factory/structure-tall', fit: 1.05, tint: 0xf0f4fa }],
};

/** Arma montada como cañón sobre la base de cada torreta (gira hacia el objetivo). */
export const TURRET_GUN: Record<TurretKind, { model: ModelId; fit: number; y: number }> = {
  turret_bullet: { model: 'weapons/blaster-a', fit: 0.7, y: 0.75 },
  turret_laser: { model: 'weapons/blaster-m', fit: 0.7, y: 0.75 },
  turret_fire: { model: 'weapons/blaster-h', fit: 0.65, y: 0.75 },
  turret_frost: { model: 'weapons/blaster-e', fit: 0.65, y: 0.75 },
};

export const NPC_MODEL: ModelId = 'characters/character-worker';
export const CHAR_SCALE = 1.3;

export const ENEMY_MODEL: Record<EnemyKind, { model: ModelId; scale: number; lift: number }> = {
  grunt: { model: 'characters/character-zombie', scale: 1, lift: 0 },
  runner: { model: 'characters/character-raider', scale: 0.95, lift: 0 },
  armored: { model: 'characters/character-robot', scale: 1.15, lift: 0 },
  flyer: { model: 'characters/character-alien', scale: 0.9, lift: 1.1 },
  tank: { model: 'characters/character-knight', scale: 1.5, lift: 0 },
};

/** Terreno y decoración (Nature Kit y Mini Forest). */
export const TERRAIN = {
  flat: 'nature/ground_grass',
  block: 'nature/cliff_block_rock',
  slope: 'nature/cliff_blockSlope_rock',
  trees: ['nature/tree_default', 'nature/tree_oak', 'nature/tree_pineTallA', 'nature/tree_fat', 'nature/tree_cone'],
  rocks: ['nature/rock_largeA', 'nature/rock_largeB', 'nature/stone_largeA', 'nature/rock_tallA'],
  small: ['nature/plant_bush', 'nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/mushroom_redGroup'],
  oreRock: 'nature/stone_smallA',
  camp: ['nature/tent_smallOpen', 'nature/campfire_logs', 'nature/log_stack'],
} as const;

/** Todos los modelos que hay que precargar. */
export function allModels(): ModelId[] {
  const s = new Set<ModelId>();
  for (const parts of Object.values(BUILDING_PARTS)) for (const p of parts) s.add(p.model);
  for (const g of Object.values(TURRET_GUN)) s.add(g.model);
  s.add(NPC_MODEL);
  for (const e of Object.values(ENEMY_MODEL)) s.add(e.model);
  s.add(TERRAIN.flat);
  s.add(TERRAIN.block);
  s.add(TERRAIN.slope);
  s.add(TERRAIN.oreRock);
  for (const m of [...TERRAIN.trees, ...TERRAIN.rocks, ...TERRAIN.small, ...TERRAIN.camp]) s.add(m);
  for (const m of ['factory/conveyor-corner', 'factory/pipe-large-curve', 'factory/pipe-large-junction', 'factory/pipe-large-cross', 'factory/structure-short', 'factory/box-small', 'weapons/bullet-foam', 'factory/arrow']) s.add(m);
  return [...s];
}
