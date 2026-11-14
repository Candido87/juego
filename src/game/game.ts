/**
 * Estado y sistemas del juego. Sin Phaser ni DOM: se puede simular sin gráficos.
 */
import { add, addAll, count, entries, take } from './bag';
import { BuildingDef, CONFIG } from './config';
import { JobBoard } from './jobs';
import { Npc, stepNpc } from './npc';
import { dijkstra } from './path';
import {
  Bag,
  BuildKind,
  BuildingKind,
  DX,
  DY,
  Dir,
  EnemyKind,
  ItemId,
  NpcRole,
  Ore,
  Tile,
  TurretKind,
  opposite,
} from './types';
import { World, coreOrigin, generateWorld, inBounds, oreAt, spawnPoints } from './world';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  d: number;
  dir: Dir;
  /** false = obra pendiente. */
  built: boolean;
  /** Avance de la obra 0..1. */
  progress: number;
  /** Materiales ya entregados a la obra. */
  delivered: Bag;
  hp: number;
  maxHp: number;
  /** Cinta: objeto transportado. */
  item: ItemId | null;
  beltProgress: number;
  /** Taladro: tiempo acumulado. Torreta: enfriamiento. */
  timer: number;
  /** Entradas / munición / combustible. */
  inv: Bag;
  /** Salidas pendientes de sacar. */
  out: Bag;
  recipe: string | null;
  craft: number;
  /** Estado de mantenimiento 0..1. */
  condition: number;
  /** Torreta: disparos cargados de la unidad de munición en uso. */
  shots: number;
  markedForRemoval: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  flying: boolean;
  slowTimer: number;
  slowFactor: number;
  burnTimer: number;
  burnDps: number;
  /** Edificio que está atacando (si su ruta está bloqueada). */
  attacking: number | null;
}

export type GameEvent =
  | { type: 'shot'; towerId: number; kind: TurretKind; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'kill'; x: number; y: number }
  | { type: 'coreHit'; damage: number }
  | { type: 'wave'; wave: number }
  | { type: 'deliver'; item: ItemId }
  | { type: 'built'; id: number }
  | { type: 'destroyed'; id: number; x: number; y: number }
  | { type: 'npcDied'; id: number; x: number; y: number }
  | { type: 'researched'; id: string }
  | { type: 'gameOver' };

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
}

export interface GameOptions {
  seed?: number;
  world?: World;
  /** Desactiva las oleadas (útil en tests). */
  noWaves?: boolean;
}

interface QueuedSpawn {
  at: number;
  kind: EnemyKind;
  hpMult: number;
  spawn: Tile;
}

export class Game {
  readonly world: World;
  readonly spawns: Tile[];
  readonly core: Building;
  readonly buildings = new Map<number, Building>();
  enemies: Enemy[] = [];
  npcs: Npc[] = [];
  readonly jobs = new JobBoard();
  /** Inventario global (núcleo + almacenes). */
  readonly storage: Bag = { ...CONFIG.startItems };
  coreHp: number = CONFIG.coreHp;
  time = 0;
  wave = 0;
  nextWaveIn: number = CONFIG.waves.firstDelay;
  gameOver = false;
  flowVersion = 0;
  readonly stats = { delivered: 0, kills: 0, built: 0, npcDeaths: 0 };
  readonly unlockedBuildings = new Set<BuildKind>(CONFIG.startUnlocks.buildings);
  readonly unlockedRecipes = new Set<string>(CONFIG.startUnlocks.recipes);
  /** Bonificaciones de investigación. */
  readonly bonus = { npcSpeed: 0, npcCapacity: 0, npcWork: 0 };

  private owner: Int32Array;
  private dist: Float64Array;
  private nextId = 1;
  private acc = 0;
  private queue: QueuedSpawn[] = [];
  private events: GameEvent[] = [];
  private noWaves: boolean;

  constructor(opts: GameOptions = {}) {
    this.world = opts.world ?? generateWorld(opts.seed ?? 1, CONFIG.mapW, CONFIG.mapH);
    this.noWaves = !!opts.noWaves;
    const n = this.world.w * this.world.h;
    this.owner = new Int32Array(n).fill(-1);
    this.dist = new Float64Array(n).fill(Infinity);
    this.spawns = spawnPoints(this.world);
    const c = coreOrigin(this.world);
    this.core = this.addBuilding('core', c.x, c.y, 0, true);
    for (const role of Object.keys(CONFIG.startNpcs) as NpcRole[]) {
      for (let i = 0; i < CONFIG.startNpcs[role]; i++) this.spawnNpc(role);
    }
    this.recomputeFlow();
  }

  // ---------------------------------------------------------------- consultas

  def(kind: BuildingKind): BuildingDef {
    return kind === 'core' ? CONFIG.coreDef : CONFIG.buildings[kind];
  }

  newId(): number {
    return this.nextId++;
  }

  buildingAt(x: number, y: number): Building | undefined {
    if (!inBounds(this.world, x, y)) return undefined;
    const id = this.owner[y * this.world.w + x];
    return id === -1 ? undefined : this.buildings.get(id);
  }

  isSpawn(x: number, y: number): boolean {
    return this.spawns.some((s) => s.x === x && s.y === y);
  }

  isSolid(b: Building): boolean {
    return b.built && this.def(b.kind).solid;
  }

  /** Casilla transitable para NPCs. */
  npcPassable(x: number, y: number): boolean {
    if (!inBounds(this.world, x, y)) return false;
    const b = this.buildingAt(x, y);
    return !b || !this.isSolid(b);
  }

  /** ¿Está la casilla pegada (4 vecinos) a la huella del edificio, o dentro si no es sólido? */
  touches(b: Building, x: number, y: number): boolean {
    const inside = x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.d;
    if (inside) return !this.isSolid(b);
    const dx = x < b.x ? b.x - x : x >= b.x + b.w ? x - (b.x + b.w - 1) : 0;
    const dy = y < b.y ? b.y - y : y >= b.y + b.d ? y - (b.y + b.d - 1) : 0;
    return dx + dy === 1;
  }

  storageBuildings(): Building[] {
    const out: Building[] = [];
    for (const b of this.buildings.values()) if (b.built && this.def(b.kind).storage) out.push(b);
    return out;
  }

  isCoreTile(x: number, y: number): boolean {
    const c = this.core;
    return x >= c.x && y >= c.y && x < c.x + c.w && y < c.y + c.d;
  }

  /** Coste de ruta enemiga hasta el núcleo; Infinity si inalcanzable. */
  distAt(x: number, y: number): number {
    return inBounds(this.world, x, y) ? this.dist[y * this.world.w + x] : Infinity;
  }

  pathFrom(start: Tile, maxLen = 400): Tile[] {
    const path: Tile[] = [{ ...start }];
    let cur = start;
    while (path.length < maxLen && !this.isCoreTile(cur.x, cur.y)) {
      const next = this.nextTile(cur.x, cur.y);
      if (next.x === cur.x && next.y === cur.y) break;
      cur = next;
      path.push(cur);
    }
    return path;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  npcSpeed(n: Npc): number {
    return CONFIG.npc.roles[n.role].speed * (1 + this.bonus.npcSpeed);
  }
  npcCapacity(n: Npc): number {
    return CONFIG.npc.roles[n.role].capacity + this.bonus.npcCapacity;
  }
  npcWork(n: Npc): number {
    return CONFIG.npc.roles[n.role].workRate * (1 + this.bonus.npcWork);
  }

  // ---------------------------------------------------------------- comandos

  canPlace(kind: BuildKind, x: number, y: number): PlaceCheck {
    if (this.gameOver) return { ok: false, reason: 'Partida terminada' };
    if (!this.unlockedBuildings.has(kind)) return { ok: false, reason: 'Sin investigar' };
    const [fw, fd] = this.def(kind).size;
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
    if (kind === 'drill' && oreAt(this.world, x, y) === Ore.None) {
      return { ok: false, reason: 'El taladro necesita mena' };
    }
    if (this.def(kind).solid) {
      const w = this.world.w;
      const occupied = this.enemies.some(
        (e) => !e.flying && (tiles.includes(Math.floor(e.y) * w + Math.floor(e.x)) || tiles.includes(e.ty * w + e.tx)),
      );
      if (occupied) return { ok: false, reason: 'Hay enemigos ahí' };
      const dist = this.computeDist(new Set(tiles));
      if (this.spawns.some((s) => !isFinite(dist[s.y * w + s.x]))) {
        return { ok: false, reason: 'Bloquearía el camino al núcleo' };
      }
    }
    return { ok: true };
  }

  /** Crea una obra. La levantará un Constructor con piezas del almacén. */
  place(kind: BuildKind, x: number, y: number, dir: Dir = 0): Building | null {
    if (!this.canPlace(kind, x, y).ok) return null;
    return this.addBuilding(kind, x, y, dir, false);
  }

  /** Obra sin terminar: se cancela (devuelve lo entregado). Edificio: marca/desmarca para desmontar. */
  remove(x: number, y: number): boolean {
    const b = this.buildingAt(x, y);
    if (!b || b.kind === 'core') return false;
    if (!b.built) {
      addAll(this.storage, b.delivered);
      this.deleteBuilding(b);
      return true;
    }
    b.markedForRemoval = !b.markedForRemoval;
    return true;
  }

  rotate(x: number, y: number, dir: Dir): boolean {
    const b = this.buildingAt(x, y);
    if (!b || (b.kind !== 'belt' && b.kind !== 'belt_fast' && b.kind !== 'drill' && b.kind !== 'factory')) return false;
    b.dir = dir;
    return true;
  }

  /** Contrata un NPC pagando piezas del almacén. */
  hire(role: NpcRole): Npc | null {
    const cost = CONFIG.npc.roles[role].cost;
    if (!entries(cost).every(([i, n]) => count(this.storage, i) >= n)) return null;
    for (const [i, n] of entries(cost)) take(this.storage, i, n);
    return this.spawnNpc(role);
  }

  /** Cambia la receta de una fábrica. Lo que tenía dentro pasa a la salida para que se recoja. */
  setRecipe(id: number, recipe: string | null): boolean {
    const b = this.buildings.get(id);
    if (!b || b.kind !== 'factory') return false;
    if (recipe !== null && (!CONFIG.recipes[recipe] || !this.unlockedRecipes.has(recipe))) return false;
    if (b.recipe === recipe) return true;
    addAll(b.out, b.inv);
    b.inv = {};
    b.recipe = recipe;
    b.craft = 0;
    return true;
  }

  /** Cuántas unidades de `item` caben como entrada en el edificio (0 = no lo acepta). */
  capacityFor(b: Building, item: ItemId): number {
    if (!b.built) return 0;
    if (b.kind === 'factory' && b.recipe) {
      const need = CONFIG.recipes[b.recipe].inputs[item] ?? 0;
      return need * CONFIG.factory.inputBatches;
    }
    return 0;
  }

  /** Lo que todavía cabe de `item`. */
  room(b: Building, item: ItemId): number {
    return Math.max(0, this.capacityFor(b, item) - count(b.inv, item));
  }

  canHire(role: NpcRole): boolean {
    return entries(CONFIG.npc.roles[role].cost).every(([i, n]) => count(this.storage, i) >= n);
  }

  callWaveNow(): void {
    this.nextWaveIn = 0;
  }

  // ---------------------------------------------------------------- llamadas desde NPCs

  completeBuilding(b: Building): void {
    b.built = true;
    b.progress = 1;
    b.delivered = {};
    b.hp = b.maxHp;
    this.stats.built++;
    this.emit({ type: 'built', id: b.id });
    if (this.def(b.kind).solid) this.recomputeFlow();
  }

  finishDeconstruct(b: Building): void {
    addAll(this.storage, this.def(b.kind).cost, CONFIG.deconstruct.refund);
    addAll(this.storage, b.inv);
    addAll(this.storage, b.out);
    this.deleteBuilding(b);
  }

  // ---------------------------------------------------------------- tiempo

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
    if (!this.noWaves) this.stepWaves(dt);
    this.jobs.update(this, dt);
    for (const n of [...this.npcs]) stepNpc(this, n, dt);
    this.stepBelts(dt);
    this.stepDrills(dt);
    this.stepFactories(dt);
    this.stepTurrets(dt);
    this.stepEnemies(dt);
    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.gameOver = true;
      this.emit({ type: 'gameOver' });
    }
  }

  // ---------------------------------------------------------------- interno

  private addBuilding(kind: BuildingKind, x: number, y: number, dir: Dir, built: boolean): Building {
    const def = this.def(kind);
    const [w, d] = def.size;
    const b: Building = {
      id: this.nextId++,
      kind,
      x,
      y,
      w,
      d,
      dir,
      built,
      progress: built ? 1 : 0,
      delivered: {},
      hp: def.hp,
      maxHp: def.hp,
      item: null,
      beltProgress: 0,
      timer: 0,
      inv: {},
      out: {},
      recipe: null,
      craft: 0,
      condition: 1,
      shots: 0,
      markedForRemoval: false,
    };
    this.buildings.set(b.id, b);
    for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) this.owner[(y + dy) * this.world.w + x + dx] = b.id;
    return b;
  }

  deleteBuilding(b: Building): void {
    this.buildings.delete(b.id);
    for (let dy = 0; dy < b.d; dy++)
      for (let dx = 0; dx < b.w; dx++) this.owner[(b.y + dy) * this.world.w + b.x + dx] = -1;
    if (b.built && this.def(b.kind).solid) this.recomputeFlow();
  }

  private spawnNpc(role: NpcRole): Npc {
    const c = this.core;
    // Primera casilla libre alrededor del núcleo.
    let pos: Tile = { x: c.x - 1, y: c.y };
    for (let r = 1; r < 6; r++) {
      let found = false;
      for (let y = c.y - r; y < c.y + c.d + r && !found; y++)
        for (let x = c.x - r; x < c.x + c.w + r && !found; x++)
          if (this.npcPassable(x, y)) {
            pos = { x, y };
            found = true;
          }
      if (found) break;
    }
    const def = CONFIG.npc.roles[role];
    const n: Npc = {
      id: this.nextId++,
      role,
      x: pos.x + 0.5,
      y: pos.y + 0.5,
      hp: def.hp,
      maxHp: def.hp,
      jobId: null,
      path: [],
      goalKey: '',
      carry: {},
      work: 0,
    };
    this.npcs.push(n);
    return n;
  }

  killNpc(n: Npc): void {
    this.npcs = this.npcs.filter((o) => o !== n);
    if (n.jobId !== null) {
      const job = this.jobs.get(n.jobId);
      if (job) this.jobs.unassign(job);
    }
    this.stats.npcDeaths++;
    this.emit({ type: 'npcDied', id: n.id, x: n.x, y: n.y });
  }

  /** Coste de entrar en una casilla para la ruta enemiga. */
  private enemyCost(x: number, y: number, extra?: Set<number>): number {
    const i = y * this.world.w + x;
    if (extra?.has(i)) return Infinity;
    const b = this.buildingAt(x, y);
    if (!b || b.kind === 'core' || !this.isSolid(b)) return 1;
    return Infinity;
  }

  private computeDist(extra?: Set<number>): Float64Array {
    const c = this.core;
    const sources: Tile[] = [];
    for (let y = c.y; y < c.y + c.d; y++) for (let x = c.x; x < c.x + c.w; x++) sources.push({ x, y });
    const h = this.world.height;
    const w = this.world.w;
    return dijkstra(this.world.w, this.world.h, sources, (x, y, fx, fy) =>
      Math.abs(h[y * w + x] - h[fy * w + fx]) > 1 ? Infinity : this.enemyCost(x, y, extra),
    );
  }

  recomputeFlow(): void {
    this.dist = this.computeDist();
    this.flowVersion++;
  }

  private nextTile(x: number, y: number): Tile {
    const cur = this.distAt(x, y);
    let best: Tile = { x, y };
    let bestScore = Infinity;
    const c = this.core;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.d / 2;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (!inBounds(this.world, nx, ny)) continue;
      const nd = this.distAt(nx, ny);
      const score = isFinite(cur) ? (nd < cur ? nd : Infinity) : Math.hypot(nx + 0.5 - cx, ny + 0.5 - cy);
      if (score < bestScore) {
        bestScore = score;
        best = { x: nx, y: ny };
      }
    }
    return best;
  }

  private stepWaves(dt: number): void {
    this.nextWaveIn -= dt;
    if (this.nextWaveIn <= 0) {
      this.wave++;
      this.nextWaveIn = CONFIG.waves.interval;
      const W = CONFIG.waves;
      const n = this.wave - 1;
      const count = W.baseCount + W.countGrowth * n;
      const hpMult = Math.pow(W.hpGrowth, n);
      const active = Math.min(this.spawns.length, 1 + Math.floor(n / 2));
      const kinds = waveKinds(this.wave);
      for (let i = 0; i < count; i++) {
        this.queue.push({
          at: this.time + i * W.spawnGap,
          kind: kinds[i % kinds.length],
          hpMult,
          spawn: this.spawns[(i + n) % active],
        });
      }
      this.emit({ type: 'wave', wave: this.wave });
    }
    while (this.queue.length && this.queue[0].at <= this.time) {
      const q = this.queue.shift()!;
      const def = CONFIG.enemies[q.kind];
      const hp = def.hp * q.hpMult;
      this.enemies.push({
        id: this.nextId++,
        kind: q.kind,
        x: q.spawn.x + 0.5,
        y: q.spawn.y + 0.5,
        tx: q.spawn.x,
        ty: q.spawn.y,
        hp,
        maxHp: hp,
        speed: def.speed,
        armor: def.armor,
        flying: def.flying,
        slowTimer: 0,
        slowFactor: 1,
        burnTimer: 0,
        burnDps: 0,
        attacking: null,
      });
    }
  }

  /** Intenta meter un objeto en (x,y) viniendo en dirección `dir`. */
  pushItem(x: number, y: number, item: ItemId, dir: Dir): boolean {
    const b = this.buildingAt(x, y);
    if (!b || !b.built) return false;
    if (this.def(b.kind).storage) {
      add(this.storage, item, 1);
      this.stats.delivered++;
      this.emit({ type: 'deliver', item });
      return true;
    }
    if (b.kind === 'belt' || b.kind === 'belt_fast') {
      if (b.item !== null || b.dir === opposite(dir)) return false;
      b.item = item;
      b.beltProgress = 0;
      return true;
    }
    if (this.room(b, item) > 0) {
      add(b.inv, item, 1);
      return true;
    }
    return false;
  }

  /** Velocidad de fabricación (se amplía con energía y desgaste). */
  factorySpeed(_b: Building): number {
    return CONFIG.factory.speed;
  }

  private stepFactories(dt: number): void {
    for (const b of this.buildings.values()) {
      if (b.kind !== 'factory' || !b.built) continue;
      this.pushOutput(b);
      if (!b.recipe) continue;
      const r = CONFIG.recipes[b.recipe];
      if (b.craft === 0) {
        if (!entries(r.inputs).every(([i, n]) => count(b.inv, i) >= n)) continue;
        let outTotal = 0;
        for (const [, n] of entries(b.out)) outTotal += n;
        let produced = 0;
        for (const [, n] of entries(r.outputs)) produced += n;
        if (outTotal + produced > CONFIG.factory.outCap) continue;
        for (const [i, n] of entries(r.inputs)) take(b.inv, i, n);
        b.craft = 1e-9;
      }
      b.craft += dt * this.factorySpeed(b);
      if (b.craft >= r.time) {
        b.craft = 0;
        addAll(b.out, r.outputs);
        this.onCrafted(b);
      }
    }
  }

  /** Gancho tras fabricar (desgaste, estadísticas). */
  protected onCrafted(_b: Building): void {}

  private stepBelts(dt: number): void {
    for (const b of this.buildings.values()) {
      if ((b.kind !== 'belt' && b.kind !== 'belt_fast') || !b.built || b.item === null) continue;
      const speed = b.kind === 'belt_fast' ? CONFIG.belt.fastSpeed : CONFIG.belt.speed;
      b.beltProgress = Math.min(1, b.beltProgress + speed * dt);
      if (b.beltProgress >= 1 && this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], b.item, b.dir)) {
        b.item = null;
        b.beltProgress = 0;
      }
    }
  }

  /** Saca un objeto de `out` hacia la casilla de delante (cinta, almacén...). */
  private pushOutput(b: Building): void {
    for (const [item] of entries(b.out)) {
      if (this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], item, b.dir)) {
        add(b.out, item, -1);
        return;
      }
    }
  }

  private stepDrills(dt: number): void {
    for (const b of this.buildings.values()) {
      if (b.kind !== 'drill' || !b.built) continue;
      const item = ORE_ITEM[oreAt(this.world, b.x, b.y)];
      if (item && count(b.out, item) < CONFIG.drill.outCap) {
        b.timer += dt;
        if (b.timer >= CONFIG.drill.period) {
          b.timer -= CONFIG.drill.period;
          add(b.out, item, 1);
        }
      }
      this.pushOutput(b);
    }
  }

  private stepTurrets(dt: number): void {
    for (const b of this.buildings.values()) {
      if (b.kind !== 'turret_bullet' || !b.built) continue;
      const T = CONFIG.turrets[b.kind];
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
      this.emit({ type: 'shot', towerId: b.id, kind: b.kind, fromX: cx, fromY: cy, toX: target.x, toY: target.y });
    }
    this.removeDeadEnemies();
  }

  private removeDeadEnemies(): void {
    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp > 0) alive.push(e);
      else {
        this.stats.kills++;
        this.emit({ type: 'kill', x: e.x, y: e.y });
      }
    }
    this.enemies = alive;
  }

  private stepEnemies(dt: number): void {
    const survivors: Enemy[] = [];
    for (const e of this.enemies) {
      const def = CONFIG.enemies[e.kind];
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
      // Daño a NPCs cercanos.
      if (def.dps > 0) {
        for (const n of this.npcs) {
          if (Math.hypot(n.x - e.x, n.y - e.y) <= CONFIG.enemyHitRadius) n.hp -= def.dps * dt;
        }
      }
      if (hit) {
        this.coreHp -= def.coreDamage;
        this.emit({ type: 'coreHit', damage: def.coreDamage });
      } else survivors.push(e);
    }
    this.enemies = survivors;
    for (const n of [...this.npcs]) if (n.hp <= 0) this.killNpc(n);
  }
}

export const ORE_ITEM: Record<number, ItemId | undefined> = {
  [Ore.Iron]: 'iron_ore',
  [Ore.Copper]: 'copper_ore',
  [Ore.Coal]: 'coal',
  [Ore.Stone]: 'stone',
  [Ore.Wood]: 'wood',
};

/** Lista determinista de tipos de enemigo para una oleada según la tabla de config. */
export function waveKinds(wave: number): EnemyKind[] {
  let row = CONFIG.waves.table[0];
  for (const r of CONFIG.waves.table) if (wave >= r.from) row = r;
  const kinds: EnemyKind[] = [];
  for (const [k, n] of Object.entries(row.mix) as [EnemyKind, number][]) for (let i = 0; i < n; i++) kinds.push(k);
  // Intercalar para que no salgan todos los de un tipo seguidos.
  const out: EnemyKind[] = [];
  const byKind = new Map<EnemyKind, number>();
  for (const k of kinds) byKind.set(k, (byKind.get(k) ?? 0) + 1);
  while (out.length < kinds.length) {
    for (const [k, n] of byKind) {
      if (n > 0) {
        out.push(k);
        byKind.set(k, n - 1);
      }
    }
  }
  return out;
}
