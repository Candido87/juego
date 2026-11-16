/**
 * Jugador automático sencillo para simular partidas sin gráficos.
 * Sólo usa la API pública de Game: coloca obras y deja que los NPCs trabajen.
 */
import { addAll, hasAll } from './bag';
import { CONFIG } from './config';
import { Game } from './game';
import { Bag, BuildKind, DX, DY, Dir, Ore, Tile, dirBetween } from './types';
import { inBounds, oreAt } from './world';

export interface MinePlan {
  drill: Tile;
  drillDir: Dir;
  belts: { x: number; y: number; dir: Dir }[];
}

/** Busca (BFS) una ruta de cintas libre desde una casilla de mena hasta un almacén. */
export function planMine(game: Game, ore: Tile, maxLen = 30): MinePlan | null {
  const { w } = game.world;
  const free = (x: number, y: number) => inBounds(game.world, x, y) && !game.buildingAt(x, y) && !game.isSpawn(x, y);
  const isStore = (x: number, y: number) => {
    const b = game.buildingAt(x, y);
    return !!b && b.built && !!game.def(b.kind).storage;
  };
  const prev = new Map<number, number>();
  const start: number[] = [];
  for (let k = 0; k < 4; k++) {
    const x = ore.x + DX[k];
    const y = ore.y + DY[k];
    if (isStore(x, y)) return { drill: ore, drillDir: k as Dir, belts: [] };
    if (free(x, y)) {
      start.push(y * w + x);
      prev.set(y * w + x, -1);
    }
  }
  const depth = new Map<number, number>(start.map((i) => [i, 0]));
  const q = [...start];
  while (q.length) {
    const i = q.shift()!;
    const x = i % w;
    const y = (i / w) | 0;
    if ((depth.get(i) ?? 0) > maxLen) continue;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (isStore(nx, ny)) {
        const path: Tile[] = [];
        for (let c = i; c !== -1; c = prev.get(c)!) path.unshift({ x: c % w, y: (c / w) | 0 });
        const belts = path.map((t, j) => ({
          x: t.x,
          y: t.y,
          dir: dirBetween(t, j + 1 < path.length ? path[j + 1] : { x: nx, y: ny })!,
        }));
        return { drill: ore, drillDir: dirBetween(ore, path[0])!, belts };
      }
      const ni = ny * w + nx;
      if (prev.has(ni) || !free(nx, ny) || (nx === ore.x && ny === ore.y)) continue;
      prev.set(ni, i);
      depth.set(ni, (depth.get(i) ?? 0) + 1);
      q.push(ni);
    }
  }
  return null;
}

/** Coste total de las obras aún no terminadas (lo que el almacén tendrá que pagar). */
function pendingCost(game: Game): Bag {
  const out: Bag = {};
  for (const b of game.buildings.values()) if (!b.built) addAll(out, game.def(b.kind).cost);
  return out;
}

/** ¿Puede pagarse `cost` además de lo ya encargado? */
export function affordable(game: Game, cost: Bag): boolean {
  const need = pendingCost(game);
  addAll(need, cost);
  return hasAll(game.storage, need);
}

/** Sin red, las cintas no se mueven: el bot pone sólo el taladro y deja que los Transportistas recojan. */
function buildMine(game: Game, plan: MinePlan): boolean {
  // Las cintas gastan energía: sólo se tienden si la red aguanta su consumo (si no, el taladro queda para los Transportistas).
  if (!game.grid.nets.some((n) => n.production - n.demand >= CONFIG.power.demand.belt! * plan.belts.length)) plan = { ...plan, belts: [] };
  const cost: Bag = {};
  addAll(cost, CONFIG.buildings.drill.cost);
  for (let i = 0; i < plan.belts.length; i++) addAll(cost, CONFIG.buildings.belt.cost);
  if (!affordable(game, cost) || !game.canPlace('drill', plan.drill.x, plan.drill.y).ok) return false;
  for (const b of plan.belts) if (!game.canPlace('belt', b.x, b.y).ok) return false;
  game.place('drill', plan.drill.x, plan.drill.y, plan.drillDir);
  for (const b of plan.belts) game.place('belt', b.x, b.y, b.dir);
  return true;
}

export function placeBestTurret(game: Game, kind: BuildKind): boolean {
  if (!affordable(game, CONFIG.buildings[kind].cost)) return false;
  const pathTiles: Tile[] = [];
  for (const s of game.spawns) pathTiles.push(...game.pathFrom(s));
  const c = game.core;
  let best: Tile | null = null;
  let bestScore = 0;
  const R = (CONFIG.turrets as Record<string, { range: number }>)[kind]?.range ?? 4;
  for (let y = c.y - 7; y <= c.y + 8; y++) {
    for (let x = c.x - 7; x <= c.x + 8; x++) {
      if (!game.canPlace(kind, x, y).ok) continue;
      let score = 0;
      for (const p of pathTiles) if (Math.hypot(p.x - x, p.y - y) <= R) score++;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best ? game.place(kind, best.x, best.y) !== null : false;
}

function countKind(game: Game, kind: BuildKind): number {
  let n = 0;
  for (const b of game.buildings.values()) if (b.kind === kind) n++;
  return n;
}

/** Fábricas que el bot quiere, en orden. Van pegadas al núcleo y le escupen la salida. */
/** Menas que el bot explota, en orden. */
const BOT_ORES: Ore[] = [Ore.Iron, Ore.Wood, Ore.Sulfur, Ore.Iron, Ore.Stone, Ore.Wood, Ore.Iron, Ore.Iron, Ore.Wood, Ore.Iron, Ore.Sulfur, Ore.Stone];

const BOT_FACTORIES = ['iron_plate', 'frame', 'gear', 'ammo', 'gun_part', 'iron_plate', 'iron_plate', 'frame', 'gear', 'ammo'];

/** Coloca un edificio con salida pegado al núcleo, mirando hacia él (y le pone receta si es fábrica). */
export function placeNextToCore(game: Game, kind: BuildKind, recipe?: string): boolean {
  if (!affordable(game, CONFIG.buildings[kind].cost)) return false;
  const c = game.core;
  for (let y = c.y - 1; y <= c.y + c.d; y++) {
    for (let x = c.x - 1; x <= c.x + c.w; x++) {
      const t = { x, y };
      // Casilla vecina (no diagonal) al núcleo; dirección hacia él.
      for (let k = 0; k < 4; k++) {
        if (!game.isCoreTile(x + DX[k], y + DY[k]) || !game.canPlace(kind, x, y).ok) continue;
        const f = game.place(kind, t.x, t.y, k as Dir);
        if (f && recipe) game.setRecipe(f.id, recipe);
        return !!f;
      }
    }
  }
  return false;
}

/** Topes de existencias: por encima, el bot quita la receta para no gastar placas de más. */
const BOT_STOCK: Record<string, [number, number]> = { gear: [10, 25], ammo: [30, 80], frame: [10, 30], gun_part: [4, 12], missile: [6, 20] };

/** Activa/desactiva fábricas según existencias (como haría un jugador). */
function regulate(game: Game): void {
  for (const b of game.buildings.values()) {
    if (b.kind !== 'factory' || !b.built) continue;
    const want = (b as { botRecipe?: string }).botRecipe ?? b.recipe;
    if (!want) continue;
    (b as { botRecipe?: string }).botRecipe = want;
    const lim = BOT_STOCK[want];
    if (!lim) continue;
    const have = game.storage[want as keyof typeof game.storage] ?? 0;
    if (have >= lim[1] && b.recipe) game.setRecipe(b.id, null);
    else if (have <= lim[0] && !b.recipe) game.setRecipe(b.id, want);
  }
}

/** Coloca un edificio en la primera casilla libre alrededor del núcleo (anillos de 2 a 6). */
export function placeNear(game: Game, kind: BuildKind): boolean {
  if (!affordable(game, CONFIG.buildings[kind].cost)) return false;
  const c = game.core;
  for (let r = 2; r <= 6; r++)
    for (let y = c.y - r; y < c.y + c.d + r; y++)
      for (let x = c.x - r; x < c.x + c.w + r; x++) {
        const edge = x === c.x - r || y === c.y - r || x === c.x + c.w + r - 1 || y === c.y + c.d + r - 1;
        if (edge && (x + y) % 2 === 0 && game.canPlace(kind, x, y).ok) return game.place(kind, x, y) !== null;
      }
  return false;
}

/** Tecnologías que el bot compra, por orden de preferencia (después, la recomendada). Defensa y economía primero. */
export const BOT_TECH_ORDER = ['def_wood', 'arm_bullet_2', 'ing_research_1', 'ind_tier2', 'pop_houses_1', 'log_speed_1', 'ing_work_1', 'def_stone', 'arm_fire', 'ind_circuits', 'ing_research_2', 'arm_bullet_3', 'arm_laser', 'ind_battery', 'arm_missile', 'pop_houses_2', 'log_capacity', 'ing_work_2', 'arm_fire_2'];

/** Compra la primera tecnología de su lista que esté disponible (o, si no, la recomendada). Devuelve el id comprado. */
export function buyTech(game: Game): string | null {
  for (const id of BOT_TECH_ORDER) {
    if (game.techState(id) === 'available') return game.research(id) ? id : null;
  }
  const rec = game.recommendedTech();
  if (rec && game.techState(rec) === 'available' && game.researchPoints > 60) return game.research(rec) ? rec : null;
  return null;
}

/** Realiza como mucho una acción. Devuelve una descripción o null si no hizo nada. */
export function botTick(game: Game): string | null {
  regulate(game);
  // Investigación: con laboratorio, un investigador por cada tres personas (hasta los puestos) y compra de tecnologías.
  const wantResearchers = Math.min(game.researchSlots(), Math.max(1, Math.floor(game.population / 3)));
  if (game.labs().length && game.researchers().length < wantResearchers && !game.researcherBlock()) game.reassignTo('researcher');
  if (buyTech(game)) return 'tecnología';
  // Laboratorio: uno cuando ya hay generador y gente de sobra (los postes los pone la guía); un segundo con más población.
  const labs = countKind(game, 'laboratory');
  if (countKind(game, 'generator') > 0 && game.population >= 5 + labs * 4 && labs < 2 && placeNear(game, 'laboratory')) return 'laboratorio';
  // Quien llegue: Transportista si hay mucho que acarrear, si no Constructor.
  const haul = game.jobs.list().filter((j) => (j.type === 'supply' || j.type === 'collect') && j.npcId === null).length;
  const role = (r: string) => game.npcs.filter((n) => n.role === r).length;
  game.growthRole = haul > 3 && role('transporter') <= role('constructor') ? 'transporter' : 'constructor';
  // Comida: una granja por cada 3 personas (más una de margen).
  const farms = countKind(game, 'farm');
  if (farms < 1 + Math.floor(game.population / 3) && placeNextToCore(game, 'farm')) return 'granja';
  // Vivienda: siempre una plaza libre por delante para que la colonia crezca.
  const pendingHouses = [...game.buildings.values()].some((b) => b.kind === 'house' && !b.built);
  if (!pendingHouses && game.population >= game.housingCapacity() && placeNear(game, 'house')) return 'casa';
  const turrets = countKind(game, 'turret_bullet');
  if (turrets < 1 + Math.ceil(game.wave * 0.6)) {
    if (placeBestTurret(game, 'turret_bullet')) return 'torreta';
  }
  // Defensa antiaérea: con el lanzamisiles desbloqueado, uno y luego uno más cada pocas oleadas, y una fábrica de misiles.
  if (game.airAvailable()) {
    if (countKind(game, 'turret_missile') < 1 + Math.floor(game.wave / 4) && placeBestTurret(game, 'turret_missile')) return 'lanzamisiles';
    const hasMissileFactory = [...game.buildings.values()].some((b) => b.kind === 'factory' && ((b as { botRecipe?: string }).botRecipe ?? b.recipe) === 'missile');
    if (!hasMissileFactory && game.factoryTier >= 2 && placeNextToCore(game, 'factory', 'missile')) return 'fábrica de misiles';
  }
  const factories = countKind(game, 'factory');
  if (factories < Math.min(BOT_FACTORIES.length, 4 + game.wave) && countKind(game, 'drill') >= 1 && placeNextToCore(game, 'factory', BOT_FACTORIES[factories])) {
    return 'fábrica';
  }
  const drills = countKind(game, 'drill');
  if (drills < BOT_ORES.length) {
    const { w, h } = game.world;
    const ores: Tile[] = [];
    const wanted = BOT_ORES[drills];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (oreAt(game.world, x, y) === wanted && !game.buildingAt(x, y)) ores.push({ x, y });
    const cx = game.core.x + 1;
    const cy = game.core.y + 1;
    ores.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    for (const o of ores.slice(0, 12)) {
      const plan = planMine(game, o);
      if (plan) return buildMine(game, plan) ? 'mina' : null;
    }
  }
  return null;
}
