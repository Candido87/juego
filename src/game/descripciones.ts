/**
 * Descripciones de edificios, materiales y roles (español), separadas de la lógica.
 *
 * Sólo el texto explicativo corto es manual (`QUE`, `SIRVE`, `ITEM_TEXT`, `ROLE_TEXT`).
 * TODO lo demás se calcula leyendo `config.ts` (costes, producción por minuto, consumo, alcance, vida...;
 * y "se produce en" / "se usa en" a partir de recetas, costes, munición y combustible), así que nunca se desactualiza.
 */
import { entries } from './bag';
import { CONFIG } from './config';
import { ORE_ITEM } from './game';
import { BUILD_KINDS, BuildKind, BuildingKind, ITEM_IDS, ItemId, NPC_ROLES, NpcRole, TurretKind } from './types';

// ---------------------------------------------------------------- textos manuales

/** Qué hace cada edificio. */
export const QUE: Record<BuildingKind, string> = {
  core: 'El corazón de la colonia: aloja a la gente y todo lo que llega queda guardado en él.',
  drill: 'Extrae mena del yacimiento que tiene debajo.',
  belt: 'Mueve objetos de una casilla a la siguiente.',
  belt_fast: 'Cinta que mueve los objetos más deprisa.',
  pipeline: 'Lleva petróleo o gasolina en el sentido de la flecha. No usa electricidad.',
  storage: 'Punto de entrega: las cintas y los Transportistas dejan aquí lo que llevan.',
  factory: 'Transforma materiales en otros según la receta que elijas.',
  farm: 'Cultiva comida de forma continua.',
  pump: 'Bombea petróleo de un yacimiento.',
  refinery: 'Refina petróleo y lo convierte en gasolina.',
  workshop: 'Reserva a dos personas como Mecánicos que sólo reparan daños.',
  laboratory: 'Con energía e Investigadores genera puntos de investigación.',
  house: 'Vivienda para la población.',
  pole: 'Enlaza edificios con la red eléctrica mediante cables.',
  generator: 'Quema gasolina para producir electricidad.',
  solar: 'Produce algo de electricidad sin combustible.',
  turbine: 'Generador avanzado: mucha más electricidad por la misma gasolina.',
  accumulator: 'Guarda electricidad sobrante y la devuelve cuando falta.',
  feeder: 'Mete automáticamente objetos de la casilla de atrás en el edificio de delante.',
  turret_bullet: 'Dispara balas al enemigo más cercano.',
  turret_laser: 'Dispara un rayo que ignora la armadura. Necesita electricidad.',
  turret_fire: 'Lanza fuego en área que quema a los enemigos de tierra.',
  turret_frost: 'Ralentiza a los enemigos de tierra con frío en área. Necesita electricidad.',
  wall_wood: 'Muro barato que frena al enemigo.',
  wall_stone: 'Muro resistente de piedra.',
  wall_metal: 'El muro más resistente.',
  wall_gate: 'Puerta en la muralla: tu gente pasa, el enemigo no.',
};

/** Para qué sirve (el motivo de construirlo). */
export const SIRVE: Record<BuildingKind, string> = {
  core: 'Si su vida llega a cero pierdes la partida. Defiéndelo.',
  drill: 'Es el primer paso de la industria: sin mena no hay placas, componentes ni munición. Se coloca sobre un yacimiento.',
  belt: 'Une taladros, fábricas y almacén sin que nadie acarree. Sin electricidad no se mueve: entonces los Transportistas lo hacen a mano.',
  belt_fast: 'Para rutas con mucho tráfico. Igual que la cinta, necesita electricidad.',
  pipeline: 'Los líquidos no van en cinta: bomba → tubería → refinería → tubería → generador. Se coloca y se gira como una cinta.',
  storage: 'El inventario es global, así que no amplía lo que puedes guardar; sirve de destino cercano para cintas y NPCs.',
  factory: 'Aquí salen las placas, engranajes, bastidores y demás componentes que piden todos los edificios. Hay que elegir una receta.',
  farm: 'La gente come cada poco: sin comida hay hambre, se trabaja más despacio y acaban marchándose. Se coloca en tierra sin mena.',
  pump: 'El petróleo se refina en gasolina, el combustible de los generadores. Se coloca sobre petróleo.',
  refinery: 'Sin gasolina los generadores se paran y las cintas dejan de moverse.',
  workshop: 'Repara torretas, muros, cables y edificios dañados por las oleadas (primero lo crítico). Con poca gente es una decisión importante.',
  laboratory: 'Produce puntos de investigación para comprar tecnologías. Tiene dos puestos: cada Investigador (una persona de tu población que deja de hacer otras tareas) añade puntos por minuto. Necesita energía; sin ella o sin Investigadores no produce.',
  house: 'Con plaza libre y comida de sobra, llega gente nueva. Más gente = más manos para trabajar.',
  pole: 'Cada edificio eléctrico se conecta al poste más cercano; los postes cercanos se enlazan solos formando una red.',
  generator: 'Alimenta cintas, taladros, fábricas y torretas eléctricas. Necesita gasolina y que un Operario lo arranque.',
  solar: 'Complementa a los generadores sin gastar combustible.',
  turbine: 'Para redes grandes que piden mucha electricidad.',
  accumulator: 'Evita apagones cortos: aguanta los picos de consumo con la energía que guardó.',
  feeder: 'Automatiza el abastecimiento de fábricas, torretas y generadores. Necesita electricidad.',
  turret_bullet: 'Tu defensa básica. Necesita munición: se la lleva un Transportista o un alimentador.',
  turret_laser: 'Eficaz contra enemigos blindados. Sin electricidad no dispara.',
  turret_fire: 'Muy eficaz contra grupos de enemigos de tierra. Gasta carbón; no alcanza a los voladores.',
  turret_frost: 'Da tiempo a las demás torretas. No alcanza a los voladores.',
  wall_wood: 'Obliga a los enemigos a rodear o a romperlo antes de seguir.',
  wall_stone: 'Aguanta bastante más que la madera.',
  wall_metal: 'Para los puntos de choque más importantes.',
  wall_gate: 'Deja salir y entrar a la colonia sin abrir un hueco en la defensa. Aguanta menos que un muro de piedra.',
};

/** Qué es cada material o componente. */
export const ITEM_TEXT: Record<ItemId, string> = {
  iron_ore: 'Mena de hierro sin procesar.',
  copper_ore: 'Mena de cobre sin procesar.',
  coal: 'Carbón: combustible para el lanzallamas y ingrediente de baterías.',
  stone: 'Piedra, para fabricar ladrillos.',
  wood: 'Madera de los bosques.',
  iron_plate: 'Hierro fundido, la base de casi todos los componentes.',
  copper_plate: 'Cobre fundido, para cables y ciencia.',
  gear: 'Componente mecánico muy común.',
  ammo: 'Munición para las torretas de balas.',
  circuit: 'Componente electrónico avanzado.',
  brick: 'Ladrillo de piedra cocida.',
  battery: 'Pila para acumuladores y torretas de hielo.',
  wall_plate: 'Plancha reforzada para muros de metal.',
  science_1: 'Paquete de investigación de nivel I.',
  science_2: 'Paquete de investigación de nivel II.',
  food: 'Alimento de la población: se consume continuamente.',
  frame: 'Bastidor: la estructura de casi todos los edificios.',
  wire: 'Cable de cobre para la red eléctrica.',
  pipe: 'Tubería para bombas, refinerías y lanzallamas.',
  gun_part: 'Mecanismo de torreta: la pieza clave de las torretas.',
  tool_kit: 'Kit de herramientas para el taller.',
  oil: 'Petróleo crudo: se refina en gasolina.',
  gasoline: 'Combustible de los generadores.',
  sulfur: 'Azufre: yacimientos amarillos. Con hierro se fabrica la munición.',
};

/** Qué hace cada rol de la población. */
export const ROLE_TEXT: Record<NpcRole, { que: string; sirve: string }> = {
  constructor: { que: 'Levanta las obras, desmonta edificios y acarrea cuando no tiene nada que construir.', sirve: 'Sin Constructores nada se construye.' },
  transporter: { que: 'Lleva a mano materiales, munición y combustible, y recoge lo que producen los edificios.', sirve: 'Es el motor del modo manual: cubre lo que las cintas no hacen sin electricidad.' },
  operator: { que: 'Arranca los generadores y da mantenimiento a fábricas y torretas desgastadas.', sirve: 'Sin Operarios los generadores no arrancan y las máquinas rinden menos.' },
  mechanic: { que: 'Sólo repara los daños de las oleadas (infraestructura crítica primero).', sirve: 'Lo asigna el Taller; no hace ninguna otra tarea.' },
  researcher: { que: 'Trabaja en un laboratorio y produce puntos de investigación. No hace ninguna otra tarea, pero come como los demás.', sirve: 'Sin Investigadores el laboratorio no produce. Cada uno es un trabajador menos para el resto de tareas.' },
};

/** Grupo de cada material (para ordenar el Almacén). */
export type ItemGroup = 'bruto' | 'pieza' | 'combustible' | 'comida';
export const ITEM_GROUP: Record<ItemId, ItemGroup> = {
  iron_ore: 'bruto',
  sulfur: 'bruto',
  copper_ore: 'bruto',
  stone: 'bruto',
  wood: 'bruto',
  oil: 'bruto',
  coal: 'combustible',
  gasoline: 'combustible',
  food: 'comida',
  iron_plate: 'pieza',
  copper_plate: 'pieza',
  gear: 'pieza',
  ammo: 'pieza',
  circuit: 'pieza',
  brick: 'pieza',
  battery: 'pieza',
  wall_plate: 'pieza',
  science_1: 'pieza',
  science_2: 'pieza',
  frame: 'pieza',
  wire: 'pieza',
  pipe: 'pieza',
  gun_part: 'pieza',
  tool_kit: 'pieza',
};
export const GROUP_NAMES: Record<ItemGroup, string> = { bruto: 'Materias primas', pieza: 'Piezas y componentes', combustible: 'Combustible', comida: 'Comida' };

// ---------------------------------------------------------------- datos calculados de config.ts

export interface Stat {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
}

export interface BuildingInfo {
  kind: BuildingKind;
  name: string;
  que: string;
  sirve: string;
  /** Componentes que cuesta (leídos de config). */
  cost: [ItemId, number][];
  stats: Stat[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const itemName = (i: ItemId) => CONFIG.items[i];
const bname = (k: BuildingKind) => (k === 'core' ? CONFIG.coreDef.name : CONFIG.buildings[k].name);

/** Rendimiento sin red / con red de un edificio (1/1 si no depende de la energía). */
function mult(kind: BuildingKind): [number, number] {
  return CONFIG.power.mult[kind as BuildKind] ?? [1, 1];
}

/** Estadísticas reales del edificio, calculadas de `config.ts`. */
export function buildingStats(kind: BuildingKind): Stat[] {
  const def = kind === 'core' ? CONFIG.coreDef : CONFIG.buildings[kind];
  const s: Stat[] = [{ key: 'hp', label: 'Vida', value: def.hp }];
  const P = CONFIG.power;
  const demand = P.demand[kind as BuildKind];
  const [lo, hi] = mult(kind);
  const perMin = (period: number, what: string, unit = what) => {
    s.push({ key: 'item', label: 'Produce', value: what });
    s.push({ key: 'ratePerMin', label: 'Sin electricidad', value: r1((60 / period) * lo), unit: `${unit}/min` });
    if (hi !== lo) s.push({ key: 'ratePerMinPowered', label: 'Con electricidad', value: r1((60 / period) * hi), unit: `${unit}/min` });
  };
  if (kind === 'drill') perMin(CONFIG.drill.period, 'mena del yacimiento', 'mena');
  if (kind === 'farm') perMin(CONFIG.farm.period, itemName('food'));
  if (kind === 'pump') perMin(CONFIG.pump.period, itemName('oil'));
  if (kind === 'refinery') {
    const r = CONFIG.recipes.gasoline;
    s.push({ key: 'recipe', label: 'Receta', value: `${entries(r.inputs).map(([i, n]) => `${n} ${itemName(i)}`).join(' + ')} → ${entries(r.outputs).map(([i, n]) => `${n} ${itemName(i)}`).join(' + ')}` });
    s.push({ key: 'ratePerMin', label: 'Sin electricidad', value: r1((60 / r.time) * lo * (r.outputs.gasoline ?? 1)), unit: 'Gasolina/min' });
    s.push({ key: 'ratePerMinPowered', label: 'Con electricidad', value: r1((60 / r.time) * hi * (r.outputs.gasoline ?? 1)), unit: 'Gasolina/min' });
  }
  if (kind === 'factory') {
    s.push({ key: 'speed', label: 'Velocidad sin / con electricidad', value: `×${lo} / ×${hi}` });
    s.push({ key: 'capacity', label: 'Entradas (tandas de la receta)', value: CONFIG.factory.inputBatches });
  }
  if (kind === 'belt' || kind === 'belt_fast') {
    const sp = kind === 'belt' ? CONFIG.belt.speed : CONFIG.belt.fastSpeed;
    s.push({ key: 'beltSpeed', label: 'Velocidad', value: sp, unit: 'casillas/s' });
  }
  if (kind === 'pipeline') {
    s.push({ key: 'pipeCap', label: 'Capacidad', value: CONFIG.pipe.cap, unit: 'unidades' });
    s.push({ key: 'pipeRate', label: 'Caudal', value: CONFIG.pipe.rate, unit: 'unidades/s' });
  }
  const gen = P.generators[kind as BuildKind];
  if (gen) {
    s.push({ key: 'power', label: 'Produce', value: gen.power, unit: 'energía/s' });
    if (gen.fuel) {
      s.push({ key: 'fuel', label: 'Combustible', value: itemName(gen.fuel) });
      s.push({ key: 'fuelPerMin', label: 'Gasta', value: r1(60 / gen.burnTime!), unit: `${itemName(gen.fuel)}/min` });
      s.push({ key: 'fuelCap', label: 'Capacidad de combustible', value: gen.fuelCap ?? 0 });
    }
  }
  if (kind === 'accumulator') s.push({ key: 'capacity', label: 'Capacidad', value: P.batteryCapacity, unit: 'energía' });
  if (kind === 'pole') {
    s.push({ key: 'wireRange', label: 'Alcance del cable', value: P.wireRange, unit: 'casillas' });
    s.push({ key: 'supplyRadius', label: 'Radio de suministro', value: P.supplyRadius, unit: 'casillas' });
  }
  if (kind === 'house') s.push({ key: 'housing', label: 'Plazas', value: CONFIG.housing.house });
  if (kind === 'core') s.push({ key: 'housing', label: 'Plazas', value: CONFIG.housing.core });
  if (kind === 'workshop') s.push({ key: 'workers', label: 'Mecánicos', value: CONFIG.workshop.workers });
  if (kind === 'laboratory') {
    s.push({ key: 'slots', label: 'Puestos de Investigador', value: CONFIG.research.labSlots });
    s.push({ key: 'points', label: 'Puntos por minuto y Investigador', value: CONFIG.research.pointsPerResearcher });
  }
  const t = (CONFIG.turrets as Partial<Record<BuildingKind, (typeof CONFIG.turrets)[TurretKind]>>)[kind];
  if (t) {
    s.push({ key: 'range', label: 'Alcance', value: t.range, unit: 'casillas' });
    s.push({ key: 'damage', label: 'Daño por disparo', value: t.damage });
    s.push({ key: 'dps', label: 'Daño por segundo', value: r1(t.damage / t.cooldown) });
    if (t.area > 0) s.push({ key: 'area', label: 'Radio de área', value: t.area, unit: 'casillas' });
    if (t.ammo) {
      s.push({ key: 'ammo', label: 'Munición', value: itemName(t.ammo) });
      s.push({ key: 'ammoCap', label: 'Capacidad de munición', value: t.ammoCap });
      s.push({ key: 'shotsPerAmmo', label: 'Disparos por unidad', value: t.shotsPerAmmo });
    }
    s.push({ key: 'air', label: 'Alcanza voladores', value: t.hitsAir ? 'sí' : 'no' });
    if (t.ignoresArmor) s.push({ key: 'armor', label: 'Ignora la armadura', value: 'sí' });
  }
  if (demand !== undefined) s.push({ key: 'energyUse', label: 'Consume', value: demand, unit: 'energía/s' });
  return s;
}

export function describeBuilding(kind: BuildingKind): BuildingInfo {
  const def = kind === 'core' ? CONFIG.coreDef : CONFIG.buildings[kind];
  return { kind, name: bname(kind), que: QUE[kind], sirve: SIRVE[kind], cost: entries(def.cost), stats: buildingStats(kind) };
}

/** Una estadística en una línea de texto. */
export function formatStat(st: Stat): string {
  return `${st.label}: ${st.value}${st.unit ? ` ${st.unit}` : ''}`;
}

export interface ItemInfo {
  item: ItemId;
  name: string;
  text: string;
  group: ItemGroup;
  /** Dónde se produce (calculado de recetas y extractores). */
  producedIn: string[];
  /** Dónde se usa (calculado de costes, recetas, munición, combustible y población). */
  usedIn: string[];
}

export function itemProducedIn(item: ItemId): string[] {
  const out: string[] = [];
  const ores = Object.values(ORE_ITEM).filter(Boolean);
  if (ores.includes(item)) out.push(item === 'oil' ? bname('pump') : bname('drill'));
  if (item === 'food') out.push(bname('farm'));
  for (const r of Object.values(CONFIG.recipes)) {
    if ((r.outputs[item] ?? 0) > 0) out.push(`${bname(r.building ?? 'factory')} (receta ${r.name})`);
  }
  return out;
}

export function itemUsedIn(item: ItemId): string[] {
  const out: string[] = [];
  for (const k of BUILD_KINDS) if ((CONFIG.buildings[k].cost[item] ?? 0) > 0) out.push(`${bname(k)} (construcción)`);
  for (const r of Object.values(CONFIG.recipes)) {
    if ((r.inputs[item] ?? 0) > 0) out.push(`${bname(r.building ?? 'factory')} (receta ${r.name})`);
  }
  for (const [k, t] of Object.entries(CONFIG.turrets)) if (t.ammo === item) out.push(`${bname(k as BuildKind)} (munición)`);
  for (const [k, g] of Object.entries(CONFIG.power.generators)) if (g.fuel === item) out.push(`${bname(k as BuildKind)} (combustible)`);
  for (const n of CONFIG.tech) if ((n.cost[item] ?? 0) > 0) out.push(`Investigación: ${n.name}`);
  // Los paquetes de ciencia existen para investigar; hasta que haya nodos en el árbol se describen por su propósito.
  if (item.startsWith('science_') && !out.some((u) => u.startsWith('Investigación'))) out.push('Investigación (árbol de tecnología)');
  if (item === 'food') out.push('La población (consumo continuo)');
  if (item === 'food') out.push(`${bname('house')} y núcleo (para crecer hace falta comida de sobra)`);
  return out;
}

export function describeItem(item: ItemId): ItemInfo {
  return { item, name: itemName(item), text: ITEM_TEXT[item], group: ITEM_GROUP[item], producedIn: itemProducedIn(item), usedIn: itemUsedIn(item) };
}

export interface RoleInfo {
  role: NpcRole;
  name: string;
  que: string;
  sirve: string;
  stats: Stat[];
}

export function describeRole(role: NpcRole): RoleInfo {
  const d = CONFIG.npc.roles[role];
  const stats: Stat[] = [
    { key: 'speed', label: 'Velocidad', value: d.speed, unit: 'casillas/s' },
    { key: 'hp', label: 'Vida', value: d.hp },
  ];
  if (d.capacity > 0) stats.push({ key: 'capacity', label: 'Capacidad de carga', value: d.capacity });
  return { role, name: d.name, ...ROLE_TEXT[role], stats };
}

/** Texto completo de un edificio en líneas (para tooltips y pruebas). */
export function buildingLines(kind: BuildingKind): string[] {
  const i = describeBuilding(kind);
  return [i.que, i.sirve, ...(i.cost.length ? [`Coste: ${i.cost.map(([it, n]) => `${n} ${itemName(it)}`).join(', ')}`] : []), ...i.stats.map(formatStat)];
}

export function itemLines(item: ItemId): string[] {
  const i = describeItem(item);
  return [i.text, `Se produce en: ${i.producedIn.join('; ') || '—'}`, `Se usa en: ${i.usedIn.join('; ') || '—'}`];
}

export const ALL_ITEMS: readonly ItemId[] = ITEM_IDS;

// ---------------------------------------------------------------- categorías del menú de construcción

export type CategoryId = 'extraction' | 'transport' | 'industry' | 'energy' | 'defense' | 'population' | 'services';

export interface Category {
  id: CategoryId;
  name: string;
  kinds: BuildKind[];
}

/** Categorías del menú de construcción. Cada edificio está en exactamente una (lo comprueba un test). */
export const CATEGORIES: Category[] = [
  { id: 'extraction', name: 'Extracción', kinds: ['drill', 'pump'] },
  { id: 'transport', name: 'Transporte', kinds: ['belt', 'belt_fast', 'pipeline', 'feeder', 'storage'] },
  { id: 'industry', name: 'Industria', kinds: ['factory', 'refinery'] },
  { id: 'energy', name: 'Energía', kinds: ['pole', 'generator', 'solar', 'turbine', 'accumulator'] },
  { id: 'defense', name: 'Defensa', kinds: ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost', 'wall_wood', 'wall_stone', 'wall_metal', 'wall_gate'] },
  { id: 'population', name: 'Población', kinds: ['farm', 'house'] },
  { id: 'services', name: 'Servicios', kinds: ['workshop', 'laboratory'] },
];

export const categoryOf = (kind: BuildKind): CategoryId => CATEGORIES.find((c) => c.kinds.includes(kind))!.id;
