/**
 * Jugador automático muy simple, para simular partidas sin gráficos.
 * Sólo usa la API pública de Game.
 */
import { CONFIG } from './config';
import { Game } from './game';
import { DX, DY, Dir, Ore, Tile, dirBetween } from './types';
import { inBounds, oreAt } from './world';

export interface MinePlan {
  drill: Tile;
  drillDir: Dir;
  belts: { x: number; y: number; dir: Dir }[];
  cost: number;
}

/** Busca (BFS) una ruta de cintas libre desde una casilla de mena hasta el núcleo. */
export function planMine(game: Game, ore: Tile, maxLen = 30): MinePlan | null {
  const { w } = game.world;
  const free = (x: number, y: number) =>
    inBounds(game.world, x, y) && !game.buildingAt(x, y) && !game.isSpawn(x, y);
  const isCore = (x: number, y: number) => game.buildingAt(x, y)?.kind === 'core';
  const prev = new Map<number, number>();
  const start: number[] = [];
  for (let k = 0; k < 4; k++) {
    const x = ore.x + DX[k];
    const y = ore.y + DY[k];
    if (isCore(x, y)) return { drill: ore, drillDir: k as Dir, belts: [], cost: CONFIG.cost.drill };
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
      if (isCore(nx, ny)) {
        // Reconstruir camino.
        const path: Tile[] = [];
        for (let c = i; c !== -1; c = prev.get(c)!) path.unshift({ x: c % w, y: (c / w) | 0 });
        const belts = path.map((t, j) => ({
          x: t.x,
          y: t.y,
          dir: dirBetween(t, j + 1 < path.length ? path[j + 1] : { x: nx, y: ny })!,
        }));
        return {
          drill: ore,
          drillDir: dirBetween(ore, path[0])!,
          belts,
          cost: CONFIG.cost.drill + belts.length * CONFIG.cost.belt,
        };
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

function buildMine(game: Game, plan: MinePlan): boolean {
  if (game.credits < plan.cost || !game.canPlace('drill', plan.drill.x, plan.drill.y).ok) return false;
  for (const b of plan.belts) if (!game.canPlace('belt', b.x, b.y).ok) return false;
  game.place('drill', plan.drill.x, plan.drill.y, plan.drillDir);
  for (const b of plan.belts) game.place('belt', b.x, b.y, b.dir);
  return true;
}

function placeBestTower(game: Game): boolean {
  const pathTiles = new Set<string>();
  for (const s of game.spawns) for (const t of game.pathFrom(s)) pathTiles.add(`${t.x},${t.y}`);
  const c = game.core;
  let best: Tile | null = null;
  let bestScore = 0;
  const R = CONFIG.tower.range;
  for (let y = c.y - 7; y <= c.y + 8; y++) {
    for (let x = c.x - 7; x <= c.x + 8; x++) {
      if (!game.canPlace('tower', x, y).ok) continue;
      let score = 0;
      for (const key of pathTiles) {
        const [px, py] = key.split(',').map(Number);
        if (Math.hypot(px - x, py - y) <= R) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best ? game.place('tower', best.x, best.y) !== null : false;
}

/** Realiza como mucho una acción. Devuelve una descripción o null si no hizo nada. */
export function botTick(game: Game): string | null {
  let towers = 0;
  let drills = 0;
  for (const b of game.buildings.values()) {
    if (b.kind === 'tower') towers++;
    if (b.kind === 'drill') drills++;
  }
  const wantTowers = 1 + Math.ceil(game.wave * 0.8);
  if (towers < wantTowers && game.credits >= CONFIG.cost.tower) {
    return placeBestTower(game) ? 'torre' : null;
  }
  if (drills < 10) {
    const { w, h } = game.world;
    const ores: Tile[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (oreAt(game.world, x, y) !== Ore.None && !game.buildingAt(x, y)) ores.push({ x, y });
    const cx = game.core.x + 1;
    const cy = game.core.y + 1;
    ores.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    for (const o of ores.slice(0, 12)) {
      const plan = planMine(game, o);
      if (plan && game.credits >= plan.cost) return buildMine(game, plan) ? 'mina' : null;
    }
  }
  if (game.credits >= CONFIG.cost.tower * 2) return placeBestTower(game) ? 'torre' : null;
  return null;
}
