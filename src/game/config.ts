/**
 * TODOS los números del juego: costes, daños, tiempos, velocidades, árbol, oleadas.
 * Ningún otro archivo de lógica debe tener números de balance.
 */
import type { Bag, BuildKind, EnemyKind, ItemId, JobType, NpcRole, TurretKind } from './types';

export interface BuildingDef {
  name: string;
  cost: Bag;
  /** Segundos de trabajo de un Constructor. */
  buildTime: number;
  hp: number;
  /** Bloquea el paso (enemigos y NPCs). */
  solid: boolean;
  size: [number, number];
  /** El núcleo y los almacenes forman el inventario global. */
  storage?: boolean;
}

export interface TurretDef {
  range: number;
  damage: number;
  cooldown: number;
  /** Objeto que se gasta como munición (si no, usa energía). */
  ammo?: ItemId;
  /** Disparos que da cada unidad de munición. */
  shotsPerAmmo: number;
  /** Unidades de munición que caben. */
  ammoCap: number;
  energyPerShot: number;
  /** Radio del daño en área (0 = un objetivo). */
  area: number;
  burnDps: number;
  burnTime: number;
  /** Multiplicador de velocidad mientras está ralentizado (1 = nada). */
  slow: number;
  slowTime: number;
  hitsAir: boolean;
  ignoresArmor: boolean;
}

export interface RecipeDef {
  name: string;
  inputs: Bag;
  outputs: Bag;
  time: number;
}

export interface NpcDef {
  name: string;
  cost: Bag;
  speed: number;
  capacity: number;
  hp: number;
  workRate: number;
}

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  armor: number;
  /** Daño por segundo a edificios y NPCs. */
  dps: number;
  coreDamage: number;
  flying: boolean;
}

export interface TechEffects {
  /** Multiplicador sumado a la velocidad de los NPCs (0.25 = +25 %). */
  npcSpeed?: number;
  npcCapacity?: number;
  npcWork?: number;
  /** Sube el nivel global de un tipo de torreta. */
  turretLevel?: TurretKind;
}

export interface TechNode {
  id: string;
  name: string;
  branch: 'Armamento' | 'Defensa' | 'Industria' | 'Logística' | 'Ingeniería';
  cost: Bag;
  time: number;
  requires: string[];
  unlocks: { buildings?: BuildKind[]; recipes?: string[] };
  effects?: TechEffects;
  /** Columna dentro de la rama, para dibujar el árbol. */
  tier: number;
}

export const CONFIG = {
  mapW: 40,
  mapH: 40,
  /** Paso fijo de simulación (s). */
  step: 1 / 30,

  coreHp: 300,
  startItems: { iron_plate: 60, gear: 24, copper_plate: 10, wood: 12, ammo: 40 } as Bag,
  startNpcs: { constructor: 2, transporter: 0, operator: 0 } as Record<NpcRole, number>,
  startUnlocks: {
    buildings: ['drill', 'belt', 'storage', 'factory', 'turret_bullet'] as BuildKind[],
    recipes: ['iron_plate', 'copper_plate', 'gear', 'ammo', 'brick', 'circuit', 'battery', 'wall_plate', 'science_1', 'science_2'],
  },

  items: {
    iron_ore: 'Mena de hierro',
    copper_ore: 'Mena de cobre',
    coal: 'Carbón',
    stone: 'Piedra',
    wood: 'Madera',
    iron_plate: 'Placa de hierro',
    copper_plate: 'Placa de cobre',
    gear: 'Engranaje',
    ammo: 'Munición',
    circuit: 'Componente',
    brick: 'Ladrillo',
    battery: 'Batería',
    wall_plate: 'Placa de muro',
    science_1: 'Ciencia I',
    science_2: 'Ciencia II',
  } as Record<ItemId, string>,

  buildings: {
    drill: { name: 'Taladro', cost: { iron_plate: 4, gear: 2 }, buildTime: 3, hp: 60, solid: true, size: [1, 1] },
    belt: { name: 'Cinta', cost: { iron_plate: 1 }, buildTime: 0.6, hp: 20, solid: false, size: [1, 1] },
    belt_fast: { name: 'Cinta rápida', cost: { iron_plate: 1, gear: 1 }, buildTime: 0.8, hp: 25, solid: false, size: [1, 1] },
    storage: { name: 'Almacén', cost: { iron_plate: 6, wood: 4 }, buildTime: 4, hp: 120, solid: true, size: [1, 1], storage: true },
    factory: { name: 'Fábrica', cost: { iron_plate: 8, gear: 4 }, buildTime: 5, hp: 100, solid: true, size: [1, 1] },
    generator: { name: 'Generador', cost: { iron_plate: 6, copper_plate: 4 }, buildTime: 5, hp: 80, solid: true, size: [1, 1] },
    accumulator: { name: 'Acumulador', cost: { battery: 4, iron_plate: 2 }, buildTime: 4, hp: 60, solid: true, size: [1, 1] },
    turret_bullet: { name: 'Torreta de balas', cost: { iron_plate: 6, gear: 3 }, buildTime: 4, hp: 100, solid: true, size: [1, 1] },
    turret_laser: { name: 'Torreta láser', cost: { copper_plate: 6, circuit: 4 }, buildTime: 5, hp: 90, solid: true, size: [1, 1] },
    turret_fire: { name: 'Lanzallamas', cost: { iron_plate: 6, brick: 4, gear: 2 }, buildTime: 5, hp: 120, solid: true, size: [1, 1] },
    turret_frost: { name: 'Torreta de hielo', cost: { copper_plate: 4, circuit: 3, battery: 1 }, buildTime: 5, hp: 90, solid: true, size: [1, 1] },
    wall_wood: { name: 'Muro de madera', cost: { wood: 3 }, buildTime: 1.5, hp: 120, solid: true, size: [1, 1] },
    wall_stone: { name: 'Muro de piedra', cost: { brick: 3 }, buildTime: 2.5, hp: 320, solid: true, size: [1, 1] },
    wall_metal: { name: 'Muro de metal', cost: { wall_plate: 2 }, buildTime: 3.5, hp: 750, solid: true, size: [1, 1] },
  } as Record<BuildKind, BuildingDef>,
  coreDef: { name: 'Núcleo', cost: {}, buildTime: 0, hp: 300, solid: true, size: [2, 2], storage: true } as BuildingDef,

  belt: { speed: 2, fastSpeed: 4 },
  drill: { period: 2, outCap: 6 },
  /** speed: multiplicador de velocidad de fabricación (manual, sin energía). */
  factory: { inputBatches: 3, outCap: 10, speed: 1 },
  /** Cada unidad del primer material del coste repara esta fracción de la vida. */
  repair: { fractionPerUnit: 0.34, secondsPerUnit: 0.6 },
  deconstruct: { refund: 0.5, timeFactor: 0.5 },

  energy: { baseCapacity: 50, accumulatorCapacity: 300, generatorPower: 10, coalBurnTime: 8, generatorFuelCap: 10 },

  turrets: {
    turret_bullet: {
      range: 4.5, damage: 6, cooldown: 0.5, ammo: 'ammo', shotsPerAmmo: 1, ammoCap: 40, energyPerShot: 0,
      area: 0, burnDps: 0, burnTime: 0, slow: 1, slowTime: 0, hitsAir: true, ignoresArmor: false,
    },
    turret_laser: {
      range: 5.5, damage: 9, cooldown: 0.7, shotsPerAmmo: 0, ammoCap: 0, energyPerShot: 6,
      area: 0, burnDps: 0, burnTime: 0, slow: 1, slowTime: 0, hitsAir: true, ignoresArmor: true,
    },
    turret_fire: {
      range: 3, damage: 4, cooldown: 0.4, ammo: 'coal', shotsPerAmmo: 4, ammoCap: 20, energyPerShot: 0,
      area: 1.2, burnDps: 4, burnTime: 3, slow: 1, slowTime: 0, hitsAir: false, ignoresArmor: false,
    },
    turret_frost: {
      range: 4, damage: 2, cooldown: 1, shotsPerAmmo: 0, ammoCap: 0, energyPerShot: 4,
      area: 1.5, burnDps: 0, burnTime: 0, slow: 0.45, slowTime: 2, hitsAir: false, ignoresArmor: true,
    },
  } as Record<TurretKind, TurretDef>,
  turretLevels: { damagePerLevel: 0.35, rangePerLevel: 0.5, maxLevel: 3 },
  /** Daño mínimo que atraviesa la armadura (fracción del daño). */
  armorMinFraction: 0.2,

  /** Desgaste por uso; un Operario lo repone. */
  wear: { factoryPerCraft: 0.02, turretPerShot: 0.004, lowThreshold: 0.5, lowEfficiency: 0.5 },

  recipes: {
    iron_plate: { name: 'Placa de hierro', inputs: { iron_ore: 1 }, outputs: { iron_plate: 1 }, time: 1.5 },
    copper_plate: { name: 'Placa de cobre', inputs: { copper_ore: 1 }, outputs: { copper_plate: 1 }, time: 1.5 },
    gear: { name: 'Engranaje', inputs: { iron_plate: 2 }, outputs: { gear: 1 }, time: 1.2 },
    ammo: { name: 'Munición', inputs: { iron_plate: 1 }, outputs: { ammo: 4 }, time: 1.5 },
    brick: { name: 'Ladrillo', inputs: { stone: 2 }, outputs: { brick: 1 }, time: 2 },
    circuit: { name: 'Componente', inputs: { copper_plate: 2, iron_plate: 1 }, outputs: { circuit: 1 }, time: 2.5 },
    battery: { name: 'Batería', inputs: { copper_plate: 1, coal: 1 }, outputs: { battery: 1 }, time: 2.5 },
    wall_plate: { name: 'Placa de muro', inputs: { iron_plate: 3 }, outputs: { wall_plate: 1 }, time: 2 },
    science_1: { name: 'Ciencia I', inputs: { copper_plate: 1, gear: 1 }, outputs: { science_1: 1 }, time: 4 },
    science_2: { name: 'Ciencia II', inputs: { circuit: 1, brick: 1 }, outputs: { science_2: 1 }, time: 6 },
  } as Record<string, RecipeDef>,

  npc: {
    roles: {
      constructor: { name: 'Constructor', cost: { iron_plate: 4, gear: 2 }, speed: 2.2, capacity: 12, hp: 40, workRate: 1 },
      transporter: { name: 'Transportista', cost: { iron_plate: 3, gear: 2 }, speed: 2.6, capacity: 10, hp: 35, workRate: 1 },
      operator: { name: 'Operario', cost: { iron_plate: 3, gear: 1, copper_plate: 2 }, speed: 2, capacity: 0, hp: 40, workRate: 1 },
    } as Record<NpcRole, NpcDef>,
    maintainTime: 2.5,
  },

  jobs: {
    scanInterval: 0.5,
    priority: { build: 2, deconstruct: 1, repair: 3, supply: 2, collect: 1, maintain: 2 } as Record<JobType, number>,
    /** Prioridad extra para torretas sin munición/energía. */
    urgentBonus: 3,
    /** Se pide abastecer cuando queda menos de esta fracción. */
    supplyBelow: 0.5,
    collectMin: 4,
    repairBelow: 0.7,
    maintainBelow: 0.6,
    minPriority: 0,
    maxPriority: 9,
  },

  /** Coste extra de ruta enemiga por atravesar edificios (se paran a romperlos). */
  enemyPath: { wallCost: 8, buildingCost: 20 },
  /** Radio (casillas) en el que un enemigo daña a un NPC. */
  enemyHitRadius: 0.7,

  enemies: {
    grunt: { name: 'Normal', hp: 14, speed: 0.9, armor: 0, dps: 8, coreDamage: 10, flying: false },
    runner: { name: 'Rápido', hp: 8, speed: 1.8, armor: 0, dps: 4, coreDamage: 6, flying: false },
    armored: { name: 'Blindado', hp: 22, speed: 0.7, armor: 4, dps: 8, coreDamage: 12, flying: false },
    flyer: { name: 'Volador', hp: 10, speed: 1.2, armor: 0, dps: 0, coreDamage: 8, flying: true },
    tank: { name: 'Tanque', hp: 70, speed: 0.5, armor: 3, dps: 30, coreDamage: 30, flying: false },
  } as Record<EnemyKind, EnemyDef>,

  waves: {
    firstDelay: 60,
    interval: 35,
    spawnGap: 0.8,
    baseCount: 3,
    countGrowth: 2,
    hpGrowth: 1.12,
    /** Composición: a partir de la oleada `from`, proporción de cada tipo. */
    table: [{ from: 1, mix: { grunt: 1 } }] as { from: number; mix: Partial<Record<EnemyKind, number>> }[],
  },

  tech: [] as TechNode[],
};

export type Config = typeof CONFIG;
