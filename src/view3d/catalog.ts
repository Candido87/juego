/**
 * Catálogo de modelos 3D: qué pieza de Kenney representa cada edificio, enemigo, torreta y decoración.
 * Datos puros (sin Three): los comprueba un test contra los archivos de `public/assets/3d/`.
 */
import type { BuildingKind, EnemyKind, TurretKind } from '../game/types';
import { ROLE_LOOK } from './actors';
import { CINTA_PIEZAS } from './aspectos';
import { BELT_MODELS } from './pieces';

/** Ruta relativa a `public/assets/3d/` sin extensión: `pack/modelo`. */
export type ModelId = string;

export interface Part {
  /** Modelo de Kenney; si falta, la parte es una figura simple (`prim`). */
  model?: ModelId;
  /** Figura simple hecha por código: caja o cilindro de `size` [ancho, alto, fondo] y color `color`. */
  prim?: 'box' | 'cyl';
  size?: [number, number, number];
  color?: number;
  /** Brilla sola (pilotos, franjas de carga). */
  glow?: boolean;
  /** Altura de su base sobre el suelo (si no, 0 o encima de la parte anterior con `stack`). */
  y?: number;
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
  belt: [{ model: 'factory/conveyor-sides', fit: 1 }],
  belt_fast: [{ model: 'factory/conveyor-stripe-sides', fit: 1 }],
  pipeline: [{ model: 'factory/pipe-large', fit: 1 }],
  storage: [{ model: 'industrial/shipping-container-a', fit: 0.95 }],
  factory: [{ model: 'factory/machine', fit: 0.9 }, { model: 'factory/robot-arm-a', fit: 0.34, stack: true }],
  farm: [{ model: 'factory/hopper-square', fit: 0.8 }, { model: 'forest/plant', fit: 0.5, stack: true }],
  pump: [{ model: 'industrial/detail-tank', fit: 0.8 }, { model: 'factory/pipe-large-valve', fit: 0.5, stack: true }],
  refinery: [{ model: 'industrial/detail-tank-large', fit: 0.9 }, { model: 'industrial/chimney-medium', fit: 0.4, dx: 0.3, dz: -0.3 }],
  workshop: [{ model: 'industrial/building-c', fit: 0.95 }],
  laboratory: [{ model: 'industrial/building-g', fit: 0.95 }, { model: 'factory/scanner-low', fit: 0.45, stack: true, dx: 0.15, dz: -0.15 }],
  house: [{ model: 'industrial/building-a', fit: 0.95, tint: 0xf4c9a0 }, { model: 'industrial/chimney-small', fit: 0.16, dx: 0.26, dz: -0.26 }],
  // Poste eléctrico: mástil de madera con cruceta y dos aisladores (el pack no trae ninguno).
  pole: [
    { prim: 'box', size: [0.26, 0.1, 0.26], color: 0x8d949c },
    { prim: 'cyl', size: [0.11, 1.45, 0.11], color: 0x8a5a3a },
    { prim: 'box', size: [0.74, 0.07, 0.09], color: 0x6c442c, y: 1.22 },
    { prim: 'cyl', size: [0.08, 0.13, 0.08], color: 0xdfe6ee, y: 1.29, dx: -0.3 },
    { prim: 'cyl', size: [0.08, 0.13, 0.08], color: 0xdfe6ee, y: 1.29, dx: 0.3 },
  ],
  generator: [{ model: 'industrial/building-d', fit: 0.8 }, { model: 'factory/cog-a', fit: 0.5, stack: true, spin: true }],
  solar: [{ model: 'industrial/solar-panel-flat', fit: 0.95 }],
  turbine: [{ model: 'industrial/windmill', fit: 0.9 }],
  // Batería: caja con franja de carga encendida y dos bornes.
  accumulator: [
    { prim: 'box', size: [0.78, 0.5, 0.56], color: 0x3b4a5c },
    { prim: 'box', size: [0.8, 0.12, 0.58], color: 0x9be564, glow: true, y: 0.2 },
    { prim: 'box', size: [0.82, 0.06, 0.6], color: 0x26313f, y: 0.5 },
    { prim: 'cyl', size: [0.13, 0.13, 0.13], color: 0xd9483b, y: 0.56, dx: -0.2 },
    { prim: 'cyl', size: [0.13, 0.13, 0.13], color: 0x4a7bd9, y: 0.56, dx: 0.2 },
  ],
  // Alimentador: brazo robótico del Factory Kit sobre una placa de apoyo, con piloto verde (ESC-6).
  feeder: [
    { prim: 'box', size: [0.86, 0.1, 0.86], color: 0x4a5361 },
    { model: 'factory/robot-arm-a', fit: 0.42, stack: true },
    { prim: 'cyl', size: [0.09, 0.07, 0.09], color: 0x9be564, glow: true, y: 0.1, dx: 0.34, dz: 0.34 },
  ],
  // Ascensor: torre baja con una plataforma de carga arriba.
  elevator: [
    { prim: 'box', size: [0.7, 0.9, 0.7], color: 0x5c6b80 },
    { prim: 'box', size: [0.8, 0.1, 0.8], color: 0xffc800, y: 0.9, glow: true },
    { prim: 'box', size: [0.5, 0.3, 0.5], color: 0x2f3947, y: 1.0 },
  ],
  turret_bullet: [{ model: 'factory/hopper-round', fit: 0.85 }],
  turret_laser: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xa8d8ff }],
  turret_fire: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xffb080 }],
  turret_frost: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xc8f0ff }],
  turret_missile: [{ model: 'factory/hopper-round', fit: 0.85, tint: 0xffb08a }],
  wall_wood: [{ model: 'factory/structure-short', fit: 1.05, tint: 0xc98a52, sy: 1.4 }],
  wall_stone: [{ model: 'factory/structure-medium', fit: 1.05, tint: 0xb0b8c0 }],
  wall_metal: [{ model: 'factory/structure-tall', fit: 1.05, tint: 0xf0f4fa }],
  wall_gate: [{ model: 'factory/structure-medium', fit: 1.05, tint: 0xd9a35a }],
};

export const NPC_MODEL: ModelId = 'characters/character-worker';
export const CHAR_SCALE = 1.3;

export const ENEMY_MODEL: Record<EnemyKind, { model: ModelId; scale: number; lift: number }> = {
  grunt: { model: 'characters/character-zombie', scale: 1, lift: 0 },
  runner: { model: 'characters/character-raider', scale: 0.95, lift: 0 },
  armored: { model: 'characters/character-robot', scale: 1.15, lift: 0 },
  flyer: { model: 'characters/character-alien', scale: 0.9, lift: 1.1 },
  tank: { model: 'characters/character-knight', scale: 1.5, lift: 0 },
  // Aéreos pendientes de modelo propio (AIR7): de momento figuras en el aire.
  bomber: { model: 'characters/character-alien', scale: 1.15, lift: 1.3 },
  heavy: { model: 'characters/character-robot', scale: 1.5, lift: 1.4 },
};

/** Aeronaves enemigas (AIR7): modelos del Space Kit, ajustados a `fit` casillas y a `lift` de altura sobre el suelo. */
export const AIR_MODEL: Partial<Record<EnemyKind, { model: ModelId; fit: number; lift: number; tint: number }>> = {
  flyer: { model: 'space/craft_speederA', fit: 0.7, lift: 1.5, tint: 0xff8f80 },
  bomber: { model: 'space/craft_cargoA', fit: 1.0, lift: 1.7, tint: 0xff7060 },
  heavy: { model: 'space/craft_miner', fit: 1.3, lift: 1.9, tint: 0xc05050 },
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
  for (const parts of Object.values(BUILDING_PARTS)) for (const p of parts) if (p.model) s.add(p.model);
  s.add(NPC_MODEL);
  for (const r of Object.values(ROLE_LOOK)) s.add(r.model);
  for (const e of Object.values(ENEMY_MODEL)) s.add(e.model);
  for (const a of Object.values(AIR_MODEL)) s.add(a!.model);
  s.add(TERRAIN.flat);
  s.add(TERRAIN.block);
  s.add(TERRAIN.slope);
  s.add(TERRAIN.oreRock);
  for (const m of [...TERRAIN.trees, ...TERRAIN.rocks, ...TERRAIN.small, ...TERRAIN.camp]) s.add(m);
  for (const p of Object.values(BELT_MODELS)) s.add(p.model);
  for (const set of Object.values(CINTA_PIEZAS)) for (const m of Object.values(set)) s.add(m);
  s.add('factory/hopper-square'); // ascensor (scene3d.ts: ELEVATOR_PARTS)
  s.add('factory/conveyor-sides');
  s.add('factory/cone'); // obras (scene3d.ts: syncCones)
  for (const m of ['factory/pipe-large-bend', 'factory/pipe-glass-large', 'factory/pipe-glass-large-bend']) s.add(m); // tuberías: codo del kit y tramos de cristal
  s.add('factory/indicator-special-cross'); // casilla prohibida al construir
  for (const m of ['factory/pipe-large', 'factory/structure-short', 'factory/structure-medium', 'factory/structure-tall', 'factory/box-small', 'weapons/bullet-foam', 'factory/arrow']) s.add(m);
  return [...s];
}
