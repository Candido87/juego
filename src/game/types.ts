/** Direcciones en la cuadrícula: 0:+x, 1:+y, 2:-x, 3:-y. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const rotateCW = (d: Dir): Dir => ((d + 1) % 4) as Dir;

export interface Tile {
  x: number;
  y: number;
}

export function dirBetween(a: Tile, b: Tile): Dir | null {
  for (let d = 0; d < 4; d++) {
    if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d as Dir;
  }
  return null;
}

/** Tipos de mena del mapa. 0 = sin mena. */
export const Ore = { None: 0, Iron: 1, Copper: 2, Coal: 3, Stone: 4, Wood: 5 } as const;
export type Ore = (typeof Ore)[keyof typeof Ore];

/** Todas las piezas/objetos que existen. */
export const ITEM_IDS = [
  'iron_ore',
  'copper_ore',
  'coal',
  'stone',
  'wood',
  'iron_plate',
  'copper_plate',
  'gear',
  'ammo',
  'circuit',
  'brick',
  'battery',
  'wall_plate',
  'science_1',
  'science_2',
  'food',
  'frame',
  'wire',
  'pipe',
  'gun_part',
  'tool_kit',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/** Bolsa de objetos: id → cantidad. */
export type Bag = Partial<Record<ItemId, number>>;

export const BUILD_KINDS = [
  'drill',
  'belt',
  'belt_fast',
  'storage',
  'factory',
  'farm',
  'pole',
  'generator',
  'solar',
  'turbine',
  'accumulator',
  'feeder',
  'turret_bullet',
  'turret_laser',
  'turret_fire',
  'turret_frost',
  'wall_wood',
  'wall_stone',
  'wall_metal',
] as const;
export type BuildKind = (typeof BUILD_KINDS)[number];
export type BuildingKind = 'core' | BuildKind;

export type TurretKind = 'turret_bullet' | 'turret_laser' | 'turret_fire' | 'turret_frost';
export type WallKind = 'wall_wood' | 'wall_stone' | 'wall_metal';

export const NPC_ROLES = ['constructor', 'transporter', 'operator'] as const;
export type NpcRole = (typeof NPC_ROLES)[number];

export const ENEMY_KINDS = ['grunt', 'runner', 'armored', 'flyer', 'tank'] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export type JobType = 'build' | 'deconstruct' | 'repair' | 'supply' | 'collect' | 'maintain' | 'start';
