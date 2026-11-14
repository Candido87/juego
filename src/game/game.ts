/**
 * Simulación completa del juego (economía, cintas, torres, oleadas).
 * No depende de Phaser ni del DOM: se puede ejecutar sin gráficos (tests, scripts/simulate.ts).
 */
import { CONFIG } from './config';
import { BuildKind, BuildingKind, DX, DY, Dir, Ore, Tile, opposite } from './types';
import { World, coreOrigin, generateWorld, inBounds, oreAt, spawnPoints } from './world';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  d: number;
  dir: Dir;
  /** Cinta: objeto que transporta (Ore.None si vacía). */
  item: Ore;
  /** Cinta: avance del objeto en la casilla, 0 = entrada, 1 = salida. */
  progress: number;
  /** Taladro: tiempo acumulado. Torre: enfriamiento restante. */
  timer: number;
}

export interface Enemy {
  id: number;
  /** Posición continua en casillas (centro de la casilla i = i + 0.5). */
  x: number;
  y: number;
  /** Casilla hacia la que camina. */
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  speed: number;
}

export type GameEvent =
  | { type: 'shot'; towerId: number; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'kill'; x: number; y: number }
  | { type: 'coreHit'; damage: number }
  | { type: 'wave'; wave: number }
  | { type: 'deliver'; item: Ore }
  | { type: 'gameOver' };

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
}

export interface GameOptions {
  seed?: number;
  world?: World;
}

export const FOOTPRINT: Record<BuildingKind, [number, number]> = {
  core: [2, 2],
  drill: [1, 1],
  belt: [1, 1],
  tower: [1, 1],
};

/** Edificios que cortan el paso de los enemigos (las cintas se pueden pisar). */
const BLOCKS_PATH: Record<BuildingKind, boolean> = { core: false, drill: true, belt: false, tower: true };

interface QueuedSpawn {
  at: number;
  hp: number;
  speed: number;
  spawn: Tile;
}

export class Game {
  readonly world: World;
  readonly spawns: Tile[];
  readonly core: Building;
  readonly buildings = new Map<number, Building>();
  enemies: Enemy[] = [];
  credits: number = CONFIG.startCredits;
  coreHp: number = CONFIG.coreHp;
  time = 0;
  wave = 0;
  nextWaveIn: number = CONFIG.firstWaveDelay;
  gameOver = false;
  /** Se incrementa cada vez que cambia el campo de rutas (útil para que la vista recalcule caminos). */
  flowVersion = 0;
  readonly stats = { delivered: 0, kills: 0, earned: 0 };

  private owner: Int32Array;
  private dist: Int32Array;
  private nextId = 1;
  private acc = 0;
  private queue: QueuedSpawn[] = [];
  private events: GameEvent[] = [];

  constructor(opts: GameOptions = {}) {
    this.world = opts.world ?? generateWorld(opts.seed ?? 1, CONFIG.mapW, CONFIG.mapH);
    const n = this.world.w * this.world.h;
    this.owner = new Int32Array(n).fill(-1);
    this.dist = new Int32Array(n).fill(-1);
    this.spawns = spawnPoints(this.world);
    const c = coreOrigin(this.world);
    this.core = this.addBuilding('core', c.x, c.y, 0);
    this.recomputeFlow();
  }

  // ---------------------------------------------------------------- consultas

  buildingAt(x: number, y: number): Building | undefined {
    if (!inBounds(this.world, x, y)) return undefined;
    const id = this.owner[y * this.world.w + x];
    return id === -1 ? undefined : this.buildings.get(id);
  }

  isSpawn(x: number, y: number): boolean {
    return this.spawns.some((s) => s.x === x && s.y === y);
  }

  /** Distancia (en pasos) hasta el núcleo según el campo de rutas; -1 si inalcanzable. */
  distAt(x: number, y: number): number {
    return inBounds(this.world, x, y) ? this.dist[y * this.world.w + x] : -1;
  }

  /** Camino que seguiría un enemigo desde una casilla hasta el núcleo. */
  pathFrom(start: Tile, maxLen = 400): Tile[] {
    const path: Tile[] = [{ ...start }];
    let cur = start;
    while (path.length < maxLen && !this.isCoreTile(cur.x, cur.y)) {
      cur = this.nextTile(cur.x, cur.y);
      path.push(cur);
    }
    return path;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- comandos

  canPlace(kind: BuildKind, x: number, y: number): PlaceCheck {
    if (this.gameOver) return { ok: false, reason: 'Partida terminada' };
    const [fw, fd] = FOOTPRINT[kind];
    const tiles: number[] = [];
    for (let dy = 0; dy < fd; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(this.world, tx, ty)) return { ok: false, reason: 'Fuera del mapa' };
        if (this.owner[ty * this.world.w + tx] !== -1) return { ok: false, reason: 'Casilla ocupada' };
        if (this.isSpawn(tx, ty)) return { ok: false, reason: 'Zona de aparición' };
        tiles.push(ty * this.world.w + tx);
      }
    }
    if (this.credits < CONFIG.cost[kind]) return { ok: false, reason: 'Créditos insuficientes' };
    if (kind === 'drill' && oreAt(this.world, x, y) === Ore.None) {
      return { ok: false, reason: 'El taladro necesita mena' };
    }
    if (BLOCKS_PATH[kind]) {
      const w = this.world.w;
      const occupied = this.enemies.some(
        (e) => tiles.includes(Math.floor(e.y) * w + Math.floor(e.x)) || tiles.includes(e.ty * w + e.tx),
      );
      if (occupied) return { ok: false, reason: 'Hay enemigos ahí' };
      const dist = this.computeDist(new Set(tiles));
      if (this.spawns.some((s) => dist[s.y * w + s.x] < 0)) {
        return { ok: false, reason: 'Bloquearía el camino al núcleo' };
      }
    }
    return { ok: true };
  }

  place(kind: BuildKind, x: number, y: number, dir: Dir = 0): Building | null {
    if (!this.canPlace(kind, x, y).ok) return null;
    this.credits -= CONFIG.cost[kind];
    const b = this.addBuilding(kind, x, y, dir);
    if (BLOCKS_PATH[kind]) this.recomputeFlow();
    return b;
  }

  remove(x: number, y: number): boolean {
    const b = this.buildingAt(x, y);
    if (!b || b.kind === 'core') return false;
    this.credits += Math.floor(CONFIG.cost[b.kind as BuildKind] * CONFIG.refund);
    this.buildings.delete(b.id);
    for (let dy = 0; dy < b.d; dy++)
      for (let dx = 0; dx < b.w; dx++) this.owner[(b.y + dy) * this.world.w + b.x + dx] = -1;
    if (BLOCKS_PATH[b.kind]) this.recomputeFlow();
    return true;
  }

  /** Cambia la dirección de una cinta o taladro (gratis). */
  rotate(x: number, y: number, dir: Dir): boolean {
    const b = this.buildingAt(x, y);
    if (!b || (b.kind !== 'belt' && b.kind !== 'drill')) return false;
    b.dir = dir;
    return true;
  }

  // ---------------------------------------------------------------- tiempo

  /** Avanza la simulación `seconds` segundos reales usando pasos fijos. */
  update(seconds: number): void {
    this.acc += Math.min(seconds, 0.5);
    while (this.acc >= CONFIG.step) {
      this.acc -= CONFIG.step;
      this.step(CONFIG.step);
    }
  }

  step(dt: number): void {
    if (this.gameOver) return;
    this.time += dt;
    this.stepWaves(dt);
    this.stepBelts(dt);
    this.stepDrills(dt);
    this.stepTowers(dt);
    this.stepEnemies(dt);
    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.gameOver = true;
      this.events.push({ type: 'gameOver' });
    }
  }

  /** Lanza la siguiente oleada ya (botón "adelantar oleada"). */
  callWaveNow(): void {
    this.nextWaveIn = 0;
  }

  // ---------------------------------------------------------------- interno

  private addBuilding(kind: BuildingKind, x: number, y: number, dir: Dir): Building {
    const [w, d] = FOOTPRINT[kind];
    const b: Building = { id: this.nextId++, kind, x, y, w, d, dir, item: Ore.None, progress: 0, timer: 0 };
    this.buildings.set(b.id, b);
    for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) this.owner[(y + dy) * this.world.w + x + dx] = b.id;
    return b;
  }

  private isCoreTile(x: number, y: number): boolean {
    const c = this.core;
    return x >= c.x && y >= c.y && x < c.x + c.w && y < c.y + c.d;
  }

  private walkable(i: number): boolean {
    const id = this.owner[i];
    if (id === -1) return true;
    return !BLOCKS_PATH[this.buildings.get(id)!.kind];
  }

  /** BFS desde el núcleo. Devuelve distancias en pasos (-1 = inalcanzable). */
  private computeDist(extraBlocked?: Set<number>): Int32Array {
    const { w, h, height } = this.world;
    const dist = new Int32Array(w * h).fill(-1);
    const q = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    const c = this.core;
    for (let y = c.y; y < c.y + c.d; y++)
      for (let x = c.x; x < c.x + c.w; x++) {
        dist[y * w + x] = 0;
        q[tail++] = y * w + x;
      }
    while (head < tail) {
      const i = q[head++];
      const x = i % w;
      const y = (i / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (dist[ni] !== -1 || !this.walkable(ni) || extraBlocked?.has(ni)) continue;
        if (Math.abs(height[ni] - height[i]) > 1) continue;
        dist[ni] = dist[i] + 1;
        q[tail++] = ni;
      }
    }
    return dist;
  }

  private recomputeFlow(): void {
    this.dist = this.computeDist();
    this.flowVersion++;
  }

  /** Siguiente casilla del camino hacia el núcleo. */
  private nextTile(x: number, y: number): Tile {
    const cur = this.distAt(x, y);
    let best: Tile | null = null;
    let bestScore = Infinity;
    const c = this.core;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.d / 2;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (!inBounds(this.world, nx, ny)) continue;
      const nd = this.distAt(nx, ny);
      // Con ruta: bajar por el gradiente. Sin ruta (raro): ir en línea recta al núcleo.
      const score = cur >= 0 ? (nd >= 0 && nd < cur ? nd : Infinity) : Math.hypot(nx + 0.5 - cx, ny + 0.5 - cy);
      if (score < bestScore) {
        bestScore = score;
        best = { x: nx, y: ny };
      }
    }
    return best ?? { x, y };
  }

  private stepWaves(dt: number): void {
    this.nextWaveIn -= dt;
    if (this.nextWaveIn <= 0) {
      this.wave++;
      this.nextWaveIn = CONFIG.waveInterval;
      const E = CONFIG.enemy;
      const n = this.wave - 1;
      const count = E.baseCount + E.countGrowth * n;
      const hp = E.baseHp * Math.pow(E.hpGrowth, n);
      const speed = Math.min(E.maxSpeed, E.baseSpeed + E.speedGrowth * n);
      const active = Math.min(this.spawns.length, 1 + Math.floor(n / 2));
      for (let i = 0; i < count; i++) {
        this.queue.push({ at: this.time + i * CONFIG.spawnGap, hp, speed, spawn: this.spawns[(i + n) % active] });
      }
      this.events.push({ type: 'wave', wave: this.wave });
    }
    while (this.queue.length && this.queue[0].at <= this.time) {
      const q = this.queue.shift()!;
      this.enemies.push({
        id: this.nextId++,
        x: q.spawn.x + 0.5,
        y: q.spawn.y + 0.5,
        tx: q.spawn.x,
        ty: q.spawn.y,
        hp: q.hp,
        maxHp: q.hp,
        speed: q.speed,
      });
    }
  }

  /** Intenta meter un objeto en la casilla (x,y) viniendo en dirección `dir`. */
  private pushItem(x: number, y: number, item: Ore, dir: Dir): boolean {
    const b = this.buildingAt(x, y);
    if (!b) return false;
    if (b.kind === 'core') {
      const v = CONFIG.oreValue[item] ?? 0;
      this.credits += v;
      this.stats.delivered++;
      this.stats.earned += v;
      this.events.push({ type: 'deliver', item });
      return true;
    }
    if (b.kind === 'belt' && b.item === Ore.None && b.dir !== opposite(dir)) {
      b.item = item;
      b.progress = 0;
      return true;
    }
    return false;
  }

  private stepBelts(dt: number): void {
    for (const b of this.buildings.values()) {
      if (b.kind !== 'belt' || b.item === Ore.None) continue;
      b.progress = Math.min(1, b.progress + CONFIG.beltSpeed * dt);
      if (b.progress >= 1 && this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], b.item, b.dir)) {
        b.item = Ore.None;
        b.progress = 0;
      }
    }
  }

  private stepDrills(dt: number): void {
    for (const b of this.buildings.values()) {
      if (b.kind !== 'drill') continue;
      b.timer += dt;
      if (b.timer < CONFIG.drillPeriod) continue;
      const ore = oreAt(this.world, b.x, b.y);
      if (this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], ore, b.dir)) b.timer -= CONFIG.drillPeriod;
      else b.timer = CONFIG.drillPeriod; // salida bloqueada: espera
    }
  }

  private stepTowers(dt: number): void {
    const T = CONFIG.tower;
    for (const b of this.buildings.values()) {
      if (b.kind !== 'tower') continue;
      b.timer -= dt;
      if (b.timer > 0) continue;
      const cx = b.x + 0.5;
      const cy = b.y + 0.5;
      let target: Enemy | null = null;
      let best = T.range;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d <= best) {
          best = d;
          target = e;
        }
      }
      if (!target) {
        b.timer = 0;
        continue;
      }
      target.hp -= T.damage;
      b.timer = T.cooldown;
      this.events.push({ type: 'shot', towerId: b.id, fromX: cx, fromY: cy, toX: target.x, toY: target.y });
    }
    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp > 0) alive.push(e);
      else {
        this.credits += CONFIG.enemy.bounty;
        this.stats.kills++;
        this.events.push({ type: 'kill', x: e.x, y: e.y });
      }
    }
    this.enemies = alive;
  }

  private stepEnemies(dt: number): void {
    const survivors: Enemy[] = [];
    for (const e of this.enemies) {
      let budget = e.speed * dt;
      let hit = false;
      for (let guard = 0; guard < 4 && budget > 0; guard++) {
        const cx = e.tx + 0.5;
        const cy = e.ty + 0.5;
        const dx = cx - e.x;
        const dy = cy - e.y;
        const d = Math.hypot(dx, dy);
        if (d > budget) {
          e.x += (dx / d) * budget;
          e.y += (dy / d) * budget;
          break;
        }
        e.x = cx;
        e.y = cy;
        budget -= d;
        if (this.isCoreTile(e.tx, e.ty)) {
          hit = true;
          break;
        }
        const next = this.nextTile(e.tx, e.ty);
        e.tx = next.x;
        e.ty = next.y;
      }
      if (hit) {
        this.coreHp -= CONFIG.enemy.damage;
        this.events.push({ type: 'coreHit', damage: CONFIG.enemy.damage });
      } else survivors.push(e);
    }
    this.enemies = survivors;
  }
}
