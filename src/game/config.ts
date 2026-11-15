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

/** Categorías del panel de recetas. */
export type RecipeCategory = 'materiales' | 'piezas' | 'municion' | 'torretas' | 'construccion' | 'combustible' | 'ciencia';
export const RECIPE_CATEGORIES: { id: RecipeCategory; name: string }[] = [
  { id: 'materiales', name: 'Materiales' },
  { id: 'piezas', name: 'Piezas' },
  { id: 'municion', name: 'Munición' },
  { id: 'torretas', name: 'Torretas' },
  { id: 'construccion', name: 'Construcción' },
  { id: 'combustible', name: 'Combustible' },
  { id: 'ciencia', name: 'Ciencia' },
];

export interface RecipeDef {
  name: string;
  category: RecipeCategory;
  inputs: Bag;
  outputs: Bag;
  time: number;
  /** Nivel de fábrica necesario (1 = fábrica normal; 2+ = árbol de tecnología). */
  tier: number;
  /** Edificio que la fabrica (por defecto la fábrica genérica). */
  building?: BuildKind;
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
  /** Multiplicador sumado a los puntos de investigación por minuto (0.2 = +20 %). */
  researchRate?: number;
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
  /** Almacén inicial: componentes para las primeras obras, algo de materia prima, munición y comida. */
  startItems: { frame: 36, gear: 44, wire: 30, gun_part: 4, pipe: 24, iron_plate: 30, copper_plate: 10, wood: 16, ammo: 40, food: 30, gasoline: 6 } as Bag,
  /** Población inicial: 3 personas. */
  startNpcs: { constructor: 1, transporter: 1, operator: 1 } as Record<NpcRole, number>,
  startUnlocks: {
    buildings: ['drill', 'belt', 'pipeline', 'storage', 'factory', 'farm', 'pump', 'refinery', 'workshop', 'house', 'turret_bullet', 'pole', 'generator'] as BuildKind[],
    /** Recetas de nivel 1. Las de nivel 2 (circuito, batería, placa de muro, ciencia II) llegan con el árbol. */
    recipes: ['iron_plate', 'copper_plate', 'brick', 'gear', 'frame', 'wire', 'pipe', 'gun_part', 'ammo', 'tool_kit', 'science_1'],
  },

  /** Componentes: lo que piden los edificios para construirse (fabricados, no materia prima). */
  components: ['frame', 'gear', 'wire', 'pipe', 'gun_part', 'tool_kit', 'circuit', 'battery', 'wall_plate'] as ItemId[],

  items: {
    iron_ore: 'Mena de hierro',
    copper_ore: 'Mena de cobre',
    coal: 'Carbón',
    stone: 'Piedra',
    sulfur: 'Azufre',
    wood: 'Madera',
    iron_plate: 'Placa de hierro',
    copper_plate: 'Placa de cobre',
    gear: 'Engranaje',
    ammo: 'Munición',
    circuit: 'Circuito',
    brick: 'Ladrillo',
    battery: 'Batería',
    wall_plate: 'Placa de muro',
    science_1: 'Ciencia I',
    science_2: 'Ciencia II',
    food: 'Comida',
    frame: 'Bastidor',
    wire: 'Cable',
    pipe: 'Tubería',
    gun_part: 'Mecanismo de torreta',
    tool_kit: 'Kit de taller',
    oil: 'Petróleo',
    gasoline: 'Gasolina',
  } as Record<ItemId, string>,

  /** Coste = componentes (el primero es el que se gasta al reparar). */
  buildings: {
    drill: { name: 'Taladro', cost: { frame: 1, gear: 2 }, buildTime: 3, hp: 60, solid: true, size: [1, 1] },
    belt: { name: 'Cinta', cost: { gear: 1 }, buildTime: 0.6, hp: 20, solid: false, size: [1, 1] },
    belt_fast: { name: 'Cinta rápida', cost: { gear: 1, wire: 1 }, buildTime: 0.8, hp: 25, solid: false, size: [1, 1] },
    pipeline: { name: 'Tubería', cost: { pipe: 1 }, buildTime: 0.6, hp: 25, solid: false, size: [1, 1] },
    storage: { name: 'Almacén', cost: { frame: 3 }, buildTime: 4, hp: 120, solid: true, size: [1, 1], storage: true },
    factory: { name: 'Fábrica', cost: { frame: 3, gear: 2 }, buildTime: 5, hp: 100, solid: true, size: [1, 1] },
    farm: { name: 'Granja', cost: { frame: 2, gear: 1 }, buildTime: 4, hp: 60, solid: true, size: [1, 1] },
    pump: { name: 'Bomba de petróleo', cost: { pipe: 2, frame: 2, gear: 1 }, buildTime: 4, hp: 70, solid: true, size: [1, 1] },
    refinery: { name: 'Refinería', cost: { pipe: 3, frame: 3, gear: 2 }, buildTime: 6, hp: 110, solid: true, size: [1, 1] },
    workshop: { name: 'Taller', cost: { tool_kit: 4, frame: 3 }, buildTime: 6, hp: 120, solid: true, size: [1, 1] },
    laboratory: { name: 'Laboratorio', cost: { tool_kit: 3, frame: 3, wire: 4 }, buildTime: 7, hp: 100, solid: true, size: [1, 1] },
    house: { name: 'Casa', cost: { frame: 2, wood: 4 }, buildTime: 4, hp: 80, solid: true, size: [1, 1] },
    pole: { name: 'Poste', cost: { wire: 2, frame: 1 }, buildTime: 1, hp: 40, solid: true, size: [1, 1] },
    generator: { name: 'Generador', cost: { frame: 3, gear: 2, wire: 4 }, buildTime: 5, hp: 80, solid: true, size: [1, 1] },
    solar: { name: 'Panel solar', cost: { circuit: 2, wire: 4, frame: 1 }, buildTime: 4, hp: 50, solid: true, size: [1, 1] },
    turbine: { name: 'Turbina', cost: { frame: 4, pipe: 4, circuit: 4 }, buildTime: 7, hp: 120, solid: true, size: [1, 1] },
    accumulator: { name: 'Batería', cost: { battery: 4, frame: 1 }, buildTime: 4, hp: 60, solid: true, size: [1, 1] },
    feeder: { name: 'Alimentador', cost: { gear: 2, frame: 1, circuit: 1 }, buildTime: 1.5, hp: 40, solid: true, size: [1, 1] },
    turret_bullet: { name: 'Torreta de balas', cost: { frame: 1, gun_part: 2 }, buildTime: 4, hp: 100, solid: true, size: [1, 1] },
    turret_laser: { name: 'Torreta láser', cost: { circuit: 4, wire: 4, frame: 2 }, buildTime: 5, hp: 90, solid: true, size: [1, 1] },
    turret_fire: { name: 'Lanzallamas', cost: { gun_part: 2, pipe: 2, brick: 2 }, buildTime: 5, hp: 120, solid: true, size: [1, 1] },
    turret_frost: { name: 'Torreta de hielo', cost: { gun_part: 1, circuit: 3, battery: 1 }, buildTime: 5, hp: 90, solid: true, size: [1, 1] },
    wall_wood: { name: 'Muro de madera', cost: { frame: 1, wood: 3 }, buildTime: 1.5, hp: 120, solid: true, size: [1, 1] },
    wall_stone: { name: 'Muro de piedra', cost: { frame: 1, brick: 3 }, buildTime: 2.5, hp: 320, solid: true, size: [1, 1] },
    wall_metal: { name: 'Muro de metal', cost: { wall_plate: 2, frame: 1 }, buildTime: 3.5, hp: 750, solid: true, size: [1, 1] },
    /** Puerta: cierra el paso a los enemigos como un muro, pero la colonia la cruza (ver `Game.npcPassable`). */
    wall_gate: { name: 'Puerta', cost: { frame: 2, gear: 1 }, buildTime: 2.5, hp: 220, solid: true, size: [1, 1] },
  } as Record<BuildKind, BuildingDef>,
  coreDef: { name: 'Núcleo', cost: {}, buildTime: 0, hp: 300, solid: true, size: [2, 2], storage: true } as BuildingDef,

  belt: { speed: 2, fastSpeed: 4 },
  /** Tuberías (sin energía): unidades de líquido que caben por casilla y que pasan a la siguiente por segundo. */
  pipe: { cap: 4, rate: 4 },
  drill: { period: 2, outCap: 6 },
  /** Granja: 1 comida cada `period` s (sin red; con red, más rápido según power.mult.farm). */
  farm: { period: 4, outCap: 8 },
  /** Bomba de petróleo: 1 petróleo cada `period` s sin red (con red, × power.mult.pump). */
  pump: { period: 3, outCap: 8 },
  /** Comida y hambre de la población. */
  food: {
    /** Cada persona come `perPerson` comida cada `interval` s. */
    perPerson: 1,
    interval: 20,
    /** Con hambre, trabajo y velocidad de los NPCs se multiplican por esto. */
    hungryFactor: 0.5,
    /** Segundos de hambre seguida antes de que alguien se marche. */
    starveGrace: 40,
    /** Después, se marcha una persona cada tantos segundos. */
    leaveInterval: 25,
  },
  /** Fábrica (nivel 1): sólo recetas con tier ≤ `tier`. */
  factory: { inputBatches: 3, outCap: 10, tier: 1 },

  /** Red eléctrica. Potencias en unidades/s; la energía de batería en unidades. */
  power: {
    /** Alcance de cable entre postes (casillas, distancia euclídea entre centros). */
    wireRange: 6,
    /** Distancia Chebyshev máxima entre un edificio y su poste. */
    supplyRadius: 2,
    /** Consumo de cada edificio conectado. */
    demand: { belt: 0.5, belt_fast: 1, drill: 3, farm: 2, pump: 2, refinery: 4, factory: 5, feeder: 1, turret_laser: 8, turret_frost: 6, laboratory: 3 } as Partial<Record<BuildKind, number>>,
    /** Multiplicador de rendimiento [sin red, con red]; con apagón se interpola según la satisfacción. */
    mult: { belt: [0, 1], belt_fast: [0, 1], drill: [1, 2], farm: [1, 2], pump: [1, 2], refinery: [0.5, 1.5], factory: [0.5, 1.5], laboratory: [0, 1] } as Partial<Record<BuildKind, [number, number]>>,
    generators: {
      generator: { power: 20, fuel: 'gasoline', burnTime: 10, fuelCap: 10 },
      turbine: { power: 60, fuel: 'gasoline', burnTime: 6, fuelCap: 10 },
      solar: { power: 5 },
    } as Partial<Record<BuildKind, { power: number; fuel?: ItemId; burnTime?: number; fuelCap?: number }>>,
    batteryCapacity: 400,
    /** Segundos que tarda un Operario en arrancar un generador parado. */
    startTime: 2,
    /** Por defecto, las torretas son consumidores críticos. */
    criticalByDefault: ['turret_laser', 'turret_frost'] as BuildKind[],
  },
  /** Cada unidad del primer material del coste repara esta fracción de la vida. */
  repair: {
    fractionPerUnit: 0.34,
    secondsPerUnit: 0.6,
    /** Ritmo de reparación de un Constructor (sin taller) y de un Mecánico. */
    constructorFactor: 0.5,
    mechanicFactor: 1.5,
  },
  /** Vivienda: plazas del núcleo y de cada casa. */
  housing: { core: 3, house: 4 },
  /**
   * Crecimiento: cada `interval` s, si hay plaza libre, no hay hambre y comida ≥ `foodMin`,
   * se gastan `foodCost` y llega una persona.
   */
  growth: { interval: 30, foodMin: 15, foodCost: 8 },
  /** Taller: personas que toma de la población; siempre deja al menos `minOutside` fuera. */
  workshop: { workers: 2, minOutside: 1 },
  /**
   * Investigación con puntos. Cada laboratorio tiene `labSlots` puestos; cada investigador de la población en un puesto
   * añade `pointsPerResearcher` puntos por minuto (con energía). El laboratorio n-ésimo en activo rinde `labFalloff`^(n-1).
   * Siempre queda `minOutside` persona fuera de la investigación (y del taller).
   */
  research: { labSlots: 2, pointsPerResearcher: 6, labFalloff: 0.8, minOutside: 1 },
  deconstruct: { refund: 0.5, timeFactor: 0.5 },


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

  /** Recetas. tier 1 = fábrica normal; tier 2 = árbol de tecnología. */
  recipes: {
    iron_plate: { name: 'Placa de hierro', inputs: { iron_ore: 1 }, outputs: { iron_plate: 1 }, time: 1.5, tier: 1, category: 'materiales' },
    copper_plate: { name: 'Placa de cobre', inputs: { copper_ore: 1 }, outputs: { copper_plate: 1 }, time: 1.5, tier: 1, category: 'materiales' },
    brick: { name: 'Ladrillo', inputs: { stone: 2 }, outputs: { brick: 1 }, time: 2, tier: 1, category: 'materiales' },
    gear: { name: 'Engranaje', inputs: { iron_plate: 1 }, outputs: { gear: 1 }, time: 1.2, tier: 1, category: 'piezas' },
    frame: { name: 'Bastidor', inputs: { iron_plate: 2, wood: 1 }, outputs: { frame: 2 }, time: 2, tier: 1, category: 'piezas' },
    wire: { name: 'Cable', inputs: { copper_plate: 1 }, outputs: { wire: 2 }, time: 1, tier: 1, category: 'piezas' },
    pipe: { name: 'Tubería', inputs: { iron_plate: 1 }, outputs: { pipe: 1 }, time: 1.2, tier: 1, category: 'piezas' },
    gun_part: { name: 'Mecanismo de torreta', inputs: { gear: 1, iron_plate: 2, stone: 1 }, outputs: { gun_part: 1 }, time: 2.5, tier: 1, category: 'torretas' },
    ammo: { name: 'Munición', inputs: { iron_plate: 1, sulfur: 1 }, outputs: { ammo: 6 }, time: 1.5, tier: 1, category: 'municion' },
    tool_kit: { name: 'Kit de taller', inputs: { gear: 2, frame: 1 }, outputs: { tool_kit: 1 }, time: 3, tier: 1, category: 'construccion' },
    science_1: { name: 'Ciencia I', inputs: { copper_plate: 1, gear: 1 }, outputs: { science_1: 1 }, time: 4, tier: 1, category: 'ciencia' },
    circuit: { name: 'Circuito', inputs: { wire: 3, iron_plate: 1 }, outputs: { circuit: 1 }, time: 2.5, tier: 2, category: 'piezas' },
    battery: { name: 'Batería', inputs: { copper_plate: 1, coal: 1 }, outputs: { battery: 1 }, time: 2.5, tier: 2, category: 'piezas' },
    wall_plate: { name: 'Placa de muro', inputs: { iron_plate: 3 }, outputs: { wall_plate: 1 }, time: 2, tier: 2, category: 'piezas' },
    gasoline: { name: 'Gasolina', inputs: { oil: 2 }, outputs: { gasoline: 1 }, time: 3, tier: 1, category: 'combustible', building: 'refinery' },
    science_2: { name: 'Ciencia II', inputs: { circuit: 1, brick: 1 }, outputs: { science_2: 1 }, time: 6, tier: 2, category: 'ciencia' },
  } as Record<string, RecipeDef>,

  npc: {
    roles: {
      constructor: { name: 'Constructor', cost: { iron_plate: 4, gear: 2 }, speed: 2.2, capacity: 12, hp: 60, workRate: 1 },
      transporter: { name: 'Transportista', cost: { iron_plate: 3, gear: 2 }, speed: 2.6, capacity: 10, hp: 55, workRate: 1 },
      mechanic: { name: 'Mecánico', cost: {}, speed: 2.2, capacity: 8, hp: 60, workRate: 1 },
      operator: { name: 'Operario', cost: { iron_plate: 3, gear: 1, copper_plate: 2 }, speed: 2, capacity: 0, hp: 60, workRate: 1 },
      researcher: { name: 'Investigador', cost: {}, speed: 2, capacity: 0, hp: 60, workRate: 1 },
    } as Record<NpcRole, NpcDef>,
    maintainTime: 2.5,
  },

  jobs: {
    scanInterval: 0.5,
    priority: { build: 2, deconstruct: 1, repair: 3, supply: 2, collect: 1, maintain: 2, start: 4 } as Record<JobType, number>,
    /** Prioridad extra para torretas sin munición/energía. */
    urgentBonus: 3,
    /** Prioridad extra al reparar infraestructura crítica (generadores, torretas, red). */
    criticalRepairBonus: 2,
    /** Penalización (en puntos de prioridad × 1000) cuando un Constructor ayuda a acarrear. */
    helpPenalty: 9000,
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
  /** Los enemigos terrestres dañan el edificio que tienen al lado con dps × este factor. */
  buildingDamageFactor: 0.3,

  enemies: {
    grunt: { name: 'Normal', hp: 14, speed: 0.9, armor: 0, dps: 8, coreDamage: 10, flying: false },
    runner: { name: 'Rápido', hp: 8, speed: 1.8, armor: 0, dps: 4, coreDamage: 6, flying: false },
    armored: { name: 'Blindado', hp: 22, speed: 0.7, armor: 4, dps: 8, coreDamage: 12, flying: false },
    flyer: { name: 'Volador', hp: 10, speed: 1.2, armor: 0, dps: 0, coreDamage: 8, flying: true },
    tank: { name: 'Tanque', hp: 70, speed: 0.5, armor: 3, dps: 30, coreDamage: 30, flying: false },
  } as Record<EnemyKind, EnemyDef>,

  waves: {
    /** Segundos hasta la primera oleada (5:00). */
    firstDelay: 300,
    /** La primera oleada es suave: pocos enemigos débiles. */
    firstCount: 2,
    interval: 35,
    spawnGap: 0.8,
    baseCount: 3,
    countGrowth: 2,
    hpGrowth: 1.12,
    /** Composición: a partir de la oleada `from`, proporción de cada tipo. */
    table: [{ from: 1, mix: { grunt: 1 } }] as { from: number; mix: Partial<Record<EnemyKind, number>> }[],
  },

  tech: [] as TechNode[],

  /** Interfaz: tooltips y avisos. */
  ui: {
    /** Retraso (ms) antes de enseñar un tooltip. */
    tipDelay: 300,
    /** Margen (px) con el borde de la pantalla y separación con el panel. */
    tipMargin: 8,
    tipGap: 8,
    /** Un material "sobra" cuando hay ≥ este múltiplo del mayor coste que lo usa. */
    surplusFactor: 8,
    /** Umbral de "sobra" para materiales que no se gastan en construir (mena, munición, gasolina). */
    surplusFallback: 60,
    /** La comida "sobra" con tantos minutos de consumo guardados, y "queda poca" por debajo de foodLowMinutes. */
    foodSurplusMinutes: 5,
    foodLowMinutes: 1.5,
  },

  /** Tutorial: mapa pequeño y fijo con configuración propia (el juego normal no cambia). */
  /** Guía de inicio (avisos ligeros en la partida normal). */
  guia: {
    /** Segundos antes de la oleada en que se avisa con la lista de comprobación. */
    waveWarning: 60,
    /** Duración (s) del aviso corto de paso cumplido. */
    toastSeconds: 2.5,
    /** A cuántas casillas del núcleo (siguiendo el camino enemigo) se marca el sitio para la torreta. */
    pathMarkDistance: 8,
    storageKey: 'iso-factory-td:guia',
  },

  tutorial: {
    seed: 7,
    mapW: 24,
    mapH: 24,
    /** Almacén inicial del tutorial: sin menas (así "llegó mena al almacén" demuestra el transporte a mano). */
    startItems: { frame: 14, gear: 12, wire: 8, pipe: 12, gun_part: 4, iron_plate: 20, copper_plate: 6, wood: 12, ammo: 20, food: 40, gasoline: 6 } as Bag,
    /** Con 3 personas el taller y la obra se estorban: el tutorial acorta la llegada de gente. */
    growthTimer: 5,
    /** Población que el tutorial intenta alcanzar antes del taller. */
    minPopulation: 4,
    /** Bajas que debe causar la oleada de prueba para darla por superada. */
    waveKills: 1,
    /** El núcleo del tutorial no baja de esta vida (no se puede perder el tutorial). */
    minCoreHp: 120,
    storageKey: 'iso-factory-td:tutorial',
  },
};

export type Config = typeof CONFIG;
