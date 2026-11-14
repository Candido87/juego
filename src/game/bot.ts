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

function buildMine(game: Game, plan: MinePlan): boolean {
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

/** Realiza como mucho una acción. Devuelve una descripción o null si no hizo nada. */
export function botTick(game: Game): string | null {
  const turrets = countKind(game, 'turret_bullet');
  if (turrets < 1 + Math.ceil(game.wave * 0.6)) {
    if (placeBestTurret(game, 'turret_bullet')) return 'torreta';
  }
  if (game.npcs.filter((n) => n.role === 'constructor').length < 3 && game.canHire('constructor')) {
    game.hire('constructor');
    return 'contratar constructor';
  }
  if (countKind(game, 'drill') < 4) {
    const { w, h } = game.world;
    const ores: Tile[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (oreAt(game.world, x, y) !== Ore.None && !game.buildingAt(x, y)) ores.push({ x, y });
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
