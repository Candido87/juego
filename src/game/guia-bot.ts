/**
 * Jugador automático que sigue la guía de inicio paso a paso (para tests y `npm run sim`).
 * Sólo usa la API pública del juego: coloca obras, cintas, postes y tuberías como lo haría un jugador.
 */
import { addAll } from './bag';
import { affordable, placeBestTurret, placeNear, placeNextToCore } from './bot';
import { CONFIG } from './config';
import { Building, Game } from './game';
import { RouteTile, followChain, outMedium, planRoute } from './guia-flujo';
import { GuiaState, currentStep, setGuiaFlag } from './guia-inicio';
import { Bag, BuildKind, DX, DY, Dir, Ore, Tile } from './types';
import { inBounds, oreAt } from './world';

function oreTiles(g: Game, ores: Ore[]): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < g.world.h; y++) for (let x = 0; x < g.world.w; x++) if (ores.includes(oreAt(g.world, x, y))) out.push({ x, y });
  const cx = g.core.x + 1;
  const cy = g.core.y + 1;
  return out.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

const all = (g: Game, kind: BuildKind) => [...g.buildings.values()].filter((b) => b.kind === kind);
const count = (g: Game, kind: BuildKind, recipe?: string) => all(g, kind).filter((b) => !recipe || b.recipe === recipe).length;
const drillsOn = (g: Game, ores: Ore[]) => all(g, 'drill').filter((b) => ores.includes(oreAt(g.world, b.x, b.y)));

/** Taladro sobre la mena más cercana libre (como mucho `max` por tipo de mena). */
function placeDrill(g: Game, ores: Ore[], max = 1): void {
  if (drillsOn(g, ores).length >= max) return;
  const t = oreTiles(g, ores).find((o) => g.canPlace('drill', o.x, o.y).ok && !g.buildingAt(o.x, o.y));
  if (t) g.place('drill', t.x, t.y, 0);
}

/** Pone una fábrica con la receta pedida (si ya hay una sin receta, se la da). */
function placeFactory(g: Game, recipe: string): void {
  if (count(g, 'factory', recipe) > 0) return;
  const idle = all(g, 'factory').find((b) => !b.recipe);
  if (idle) {
    g.setRecipe(idle.id, recipe);
    return;
  }
  // La de munición va suelta (no pegada al núcleo) para poder sacarla por cinta hasta la torreta.
  if (recipe === 'ammo') placeNear(g, 'factory');
  else placeNextToCore(g, 'factory', recipe) || placeNear(g, 'factory');
  const f = all(g, 'factory').find((b) => !b.recipe);
  if (f) g.setRecipe(f.id, recipe);
}

/** Coste de `n` piezas de un conducto. */
function conduitCost(kind: 'belt' | 'pipeline', n: number): Bag {
  const c: Bag = {};
  for (let i = 0; i < n; i++) addAll(c, CONFIG.buildings[kind].cost);
  return c;
}

/**
 * Conecta la salida de `src` con un destino por cintas o tuberías: prueba las cuatro orientaciones, se queda con la ruta
 * más corta, gira el origen y coloca todas las piezas. Devuelve false si no hay ruta o no hay materiales.
 */
export function connect(g: Game, src: Building, isTarget: (b: Building) => boolean, kind: 'belt' | 'pipeline'): boolean {
  const m = outMedium(src);
  // Ya tiene conducto delante (completo o a medias): el bot no lo rehace.
  if (m && followChain(g, src, m).tiles.length > 0) return false;
  const original = src.dir;
  let best: { dir: Dir; route: RouteTile[] } | null = null;
  for (const d of [0, 1, 2, 3] as Dir[]) {
    src.dir = d;
    const route = planRoute(g, src, isTarget);
    if (route && (!best || route.length < best.route.length)) best = { dir: d, route };
  }
  src.dir = original;
  if (!best || best.route.length === 0) return false;
  if (!affordable(g, conduitCost(kind, best.route.length))) return false;
  if (!best.route.every((t) => g.canPlace(kind, t.x, t.y).ok)) return false;
  src.dir = best.dir;
  for (const t of best.route) g.place(kind, t.x, t.y, t.dir);
  return true;
}

/** Como `connect`, pero si faltan engranajes o tuberías pone una fábrica que los produzca (como haría el jugador). */
function connectOrCraft(g: Game, src: Building, isTarget: (b: Building) => boolean, kind: 'belt' | 'pipeline'): void {
  const m = outMedium(src);
  if (m && followChain(g, src, m).tiles.length > 0) return;
  if (connect(g, src, isTarget, kind)) return;
  const need = kind === 'belt' ? 'gear' : 'pipe';
  if (affordable(g, conduitCost(kind, 40)) || count(g, 'factory', need) > 0) return;
  // Sin factoría libre ni bastidores, se reconvierte la que más sobra (como haría el jugador).
  const spare = all(g, 'factory').find((b) => b.built && b.recipe === 'gun_part' && (g.storage[b.recipe as keyof typeof g.storage] ?? 0) >= 4);
  if (spare) g.setRecipe(spare.id, need);
  else placeFactory(g, need);
}

// ---------------------------------------------------------------- energía

const chebToPole = (p: Building, x: number, y: number) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y));

/** Un poste por tick hasta que todo edificio eléctrico tenga red (cubre generador, cintas, taladros, fábricas, bombas...). */
function ensurePoles(g: Game): boolean {
  const poles = all(g, 'pole');
  const R = CONFIG.power.supplyRadius;
  const W = CONFIG.power.wireRange;
  const needy = [...g.buildings.values()].filter(
    (b) => ['generator', 'belt', 'belt_fast', 'pump', 'refinery'].includes(b.kind) && !poles.some((p) => chebToPole(p, b.x, b.y) <= R),
  );
  if (!needy.length) return false;
  if (!affordable(g, CONFIG.buildings.pole.cost)) return false;
  const gen = all(g, 'generator')[0];
  // Primero el generador, luego lo que quede más cerca de la red.
  const target = gen && needy.includes(gen) ? gen : needy.sort((a, b) => dist(poles, a) - dist(poles, b))[0];
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = target.y - R; y <= target.y + R; y++) {
    for (let x = target.x - R; x <= target.x + R; x++) {
      if (!inBounds(g.world, x, y) || !g.canPlace('pole', x, y).ok) continue;
      const link = poles.length ? Math.min(...poles.map((p) => Math.hypot(p.x - x, p.y - y))) : 0;
      // El poste debe enlazar con la red existente; entre los válidos, el más cerca de otros edificios que lo necesiten.
      if (poles.length && link > W) continue;
      const covers = needy.filter((n) => chebToPole({ x, y } as Building, n.x, n.y) <= R).length;
      const score = covers * 10 - link * 0.1 - Math.hypot(x - target.x, y - target.y) * 0.01;
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (!best) {
    // Sin enlace posible: un poste intermedio en línea recta hacia el edificio, a menos de `wireRange` del más cercano.
    const from = poles.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
    if (!from) return true;
    const d = Math.hypot(target.x - from.x, target.y - from.y) || 1;
    for (const k of [W - 1, W - 2, W - 3]) {
      const x = Math.round(from.x + ((target.x - from.x) / d) * k);
      const y = Math.round(from.y + ((target.y - from.y) / d) * k);
      if (g.canPlace('pole', x, y).ok) {
        best = { x, y, score: 0 };
        break;
      }
    }
  }
  if (best) g.place('pole', best.x, best.y);
  return true;
}

const dist = (poles: Building[], b: Building) => (poles.length ? Math.min(...poles.map((p) => Math.hypot(p.x - b.x, p.y - b.y))) : 0);

// ---------------------------------------------------------------- tick

const isTargetKind =
  (...kinds: string[]) =>
  (b: Building) =>
    kinds.includes(b.kind);

/** Hace como mucho una acción según el paso actual de la guía. */
export function guiaBotTick(g: Game, s: GuiaState): void {
  const st = currentStep(g, s);
  // Mantenimiento: las fábricas y la refinería se paran al desgastarse; hacen falta Operarios (y casas para que lleguen).
  const worn = [...g.buildings.values()].some((b) => b.built && (b.kind === 'factory' || b.kind === 'refinery') && b.condition < 0.5);
  g.growthRole = worn ? 'operator' : 'constructor';
  if (worn && g.population >= g.housingCapacity() && ![...g.buildings.values()].some((b) => b.kind === 'house' && !b.built)) placeNear(g, 'house');
  // Engranajes de sobra: la fábrica reconvertida vuelve a los mecanismos de torreta.
  if ((g.storage.gear ?? 0) >= 100) for (const b of all(g, 'factory')) if (b.recipe === 'gear') g.setRecipe(b.id, 'gun_part');
  // Con generador, los edificios eléctricos necesitan postes sea cual sea el paso.
  if (count(g, 'generator') > 0 && (st?.id !== 'power_gen') && ensurePoles(g)) return;
  if (!st) return;
  switch (st.id) {
    case 'drill_iron':
      placeDrill(g, [Ore.Iron]);
      break;
    case 'storage':
      if (count(g, 'storage') === 0) placeNear(g, 'storage');
      break;
    case 'belt_connect': {
      const d = drillsOn(g, [Ore.Iron]).find((b) => b.built);
      if (d) connectOrCraft(g, d, isTargetKind('storage', 'core'), 'belt');
      break;
    }
    case 'power_gen':
      if (count(g, 'generator') === 0) placeNear(g, 'generator');
      break;
    case 'power_poles':
      ensurePoles(g);
      break;
    case 'farm':
      if (count(g, 'farm') === 0) placeNextToCore(g, 'farm');
      break;
    case 'turret':
      if (count(g, 'turret_bullet') === 0) placeBestTurret(g, 'turret_bullet');
      break;
    case 'lab_build':
      if (count(g, 'laboratory') === 0) placeNear(g, 'laboratory');
      break;
    case 'lab_staff':
      // Con la población justa no se puede: hacen falta casas para que llegue más gente.
      if (!g.reassignTo('researcher') && g.population >= g.housingCapacity() && ![...g.buildings.values()].some((b) => b.kind === 'house' && !b.built)) placeNear(g, 'house');
      break;
    case 'tech_first': {
      const id = g.recommendedTech();
      if (id && g.techState(id) === 'available') g.research(id);
      break;
    }
    case 'oil_pump': {
      if (count(g, 'pump') > 0) break;
      const t = oreTiles(g, [Ore.Oil]).find((o) => g.canPlace('pump', o.x, o.y).ok);
      if (t && affordable(g, CONFIG.buildings.pump.cost)) g.place('pump', t.x, t.y, 0);
      break;
    }
    case 'oil_refine': {
      if (count(g, 'refinery') === 0) {
        placeNear(g, 'refinery');
        break;
      }
      const pump = all(g, 'pump').find((b) => b.built);
      if (pump && all(g, 'refinery')[0].built) connectOrCraft(g, pump, isTargetKind('refinery'), 'pipeline');
      break;
    }
    case 'oil_fuel': {
      const ref = all(g, 'refinery').find((b) => b.built);
      if (ref) connectOrCraft(g, ref, isTargetKind('generator'), 'pipeline');
      break;
    }
    case 'factory_plates':
    case 'factory_ammo':
    case 'factory_gun':
      placeFactory(g, st.recipe!);
      break;
    case 'chain_plates': {
      const factory = all(g, 'factory').find((b) => b.built && b.recipe === 'iron_plate');
      if (!factory) break;
      // Segundo taladro de hierro, sin cinta al almacén, que alimenta la fábrica.
      const free = drillsOn(g, [Ore.Iron]).filter((d) => d.built && d !== drillsOn(g, [Ore.Iron])[0]);
      if (!free.length) {
        placeDrill(g, [Ore.Iron], 2);
        break;
      }
      connectOrCraft(g, free[0], (b) => b.kind === 'factory' && b.recipe === 'iron_plate', 'belt');
      break;
    }
    case 'drill_sulfur':
      placeDrill(g, [Ore.Sulfur]);
      break;
    case 'drill_stone':
      placeDrill(g, [Ore.Stone]);
      break;
    case 'chain_ammo': {
      const f = all(g, 'factory').find((b) => b.built && b.recipe === 'ammo');
      if (f) connectOrCraft(g, f, isTargetKind('turret_bullet'), 'belt');
      break;
    }
    case 'walls':
      if ((g.storage.wood ?? 0) < 3) placeDrill(g, [Ore.Wood]);
      if (count(g, 'wall_wood') === 0 && !placeBestTurret(g, 'wall_wood') && (g.storage.frame ?? 0) < 2) {
        // Faltan bastidores: se reconvierte la fábrica de mecanismos (que ya tiene de sobra).
        const f = all(g, 'factory').find((b) => b.built && b.recipe === 'gun_part');
        if (f) g.setRecipe(f.id, 'frame');
      }
      break;
    case 'next':
      setGuiaFlag(s, 'next_ack');
      break;
    default:
      break;
  }
}
