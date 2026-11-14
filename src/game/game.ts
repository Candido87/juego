/**
 * Estado y sistemas del juego. Sin Phaser ni DOM: se puede simular sin gráficos.
 */
import { add, addAll, count, entries, take } from './bag';
import { BuildingDef, CONFIG, TurretDef } from './config';
import { JobBoard } from './jobs';
import { Npc, stepNpc } from './npc';
import { dijkstra } from './path';
import { Grid, PowerNet, emptyGrid, needsStart, powerMult, rebuildGrid, stepPower } from './power';
import {
  Bag,
  BuildKind,
  BuildingKind,
  DX,
  DY,
  Dir,
  EnemyKind,
  FREE_ROLES,
  ItemId,
  NpcRole,
  Ore,
  Tile,
  TurretKind,
  isLiquid,
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
  /** Satisfacción eléctrica recibida este paso (0 = sin energía). */
  power: number;
  /** Generador de combustión en marcha. */
  running: boolean;
  /** Consumidor crítico: recibe energía antes. */
  critical: boolean;
  /** Batería: energía guardada. */
  charge: number;
  /** Torreta: disparos cargados de la unidad de munición en uso. */
  shots: number;
  markedForRemoval: boolean;
}

/** Estado visible de una fábrica. */
export interface FactoryStatus {
  state: 'none' | 'norecipe' | 'producing' | 'missing' | 'full';
  /** Materiales que faltan (estado 'missing'). */
  missing?: ItemId[];
  /** Produce, pero sin la red eléctrica (más despacio). */
  lowPower?: boolean;
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
  | { type: 'npcLeft'; id: number; x: number; y: number }
  | { type: 'npcArrived'; id: number; x: number; y: number }
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
  readonly stats = { delivered: 0, kills: 0, built: 0, npcDeaths: 0, npcLeft: 0, foodEaten: 0, arrivals: 0 };
  /** Comida: fracción de ración acumulada pendiente de comer. */
  foodDebt = 0;
  /** Hay hambre (no queda comida en el almacén). */
  hungry = false;
  /** Segundos de hambre seguida (para las marchas). */
  hungerTime = 0;
  /** Rol de quien llegue a la colonia (null = el rol con menos gente). */
  growthRole: NpcRole | null = null;
  /** Segundos hasta la próxima comprobación de crecimiento. */
  growthTimer: number = CONFIG.growth.interval;
  readonly unlockedBuildings = new Set<BuildKind>(CONFIG.startUnlocks.buildings);
  readonly unlockedRecipes = new Set<string>(CONFIG.startUnlocks.recipes);
  /** Bonificaciones de investigación. */
  readonly bonus = { npcSpeed: 0, npcCapacity: 0, npcWork: 0, houseCapacity: 0 };
  /** Nivel global de cada tipo de torreta (sube con el árbol). */
  readonly turretLevel: Record<TurretKind, number> = { turret_bullet: 1, turret_laser: 1, turret_fire: 1, turret_frost: 1 };

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

  /** Productividad de la población: 1 bien alimentada, menos con hambre. */
  hungerFactor(): number {
    return this.hungry ? CONFIG.food.hungryFactor : 1;
  }
  npcSpeed(n: Npc): number {
    return CONFIG.npc.roles[n.role].speed * (1 + this.bonus.npcSpeed) * this.hungerFactor();
  }
  npcCapacity(n: Npc): number {
    return CONFIG.npc.roles[n.role].capacity + this.bonus.npcCapacity;
  }
  npcWork(n: Npc): number {
    return CONFIG.npc.roles[n.role].workRate * (1 + this.bonus.npcWork) * this.hungerFactor();
  }

  /** Población total (NPCs vivos). */
  get population(): number {
    return this.npcs.length;
  }

  /** Plazas de vivienda: núcleo + casas terminadas. */
  housingCapacity(): number {
    let n = CONFIG.housing.core;
    for (const b of this.buildings.values()) if (b.kind === 'house' && b.built) n += CONFIG.housing.house + this.bonus.houseCapacity;
    return n;
  }

  /** ¿Se dan las condiciones para que llegue alguien? */
  canGrow(): boolean {
    return !this.hungry && this.npcs.length < this.housingCapacity() && count(this.storage, 'food') >= CONFIG.growth.foodMin;
  }

  /** Rol para el siguiente en llegar. */
  nextArrivalRole(): NpcRole {
    if (this.growthRole) return this.growthRole;
    let best: NpcRole = 'constructor';
    let bestN = Infinity;
    for (const r of FREE_ROLES) {
      const n = this.npcs.filter((o) => o.role === r).length;
      if (n < bestN) {
        bestN = n;
        best = r;
      }
    }
    return best;
  }

  /** Pasa a una persona al rol `role`, sacándola del rol libre con más gente (prefiere a quien no trabaja). */
  reassignTo(role: NpcRole): boolean {
    if (role === 'mechanic') return false;
    const donors = this.npcs.filter((n) => n.role !== role && n.role !== 'mechanic');
    if (!donors.length) return false;
    const size = (r: NpcRole) => this.npcs.filter((n) => n.role === r).length;
    donors.sort((a, b) => size(b.role) - size(a.role) || Number(a.jobId !== null) - Number(b.jobId !== null) || a.id - b.id);
    this.changeRole(donors[0], role);
    return true;
  }

  private stepGrowth(dt: number): void {
    this.growthTimer -= dt;
    if (this.growthTimer > 0) return;
    this.growthTimer = CONFIG.growth.interval;
    if (!this.canGrow()) return;
    take(this.storage, 'food', CONFIG.growth.foodCost);
    const n = this.spawnNpc(this.nextArrivalRole());
    this.stats.arrivals++;
    this.emit({ type: 'npcArrived', id: n.id, x: n.x, y: n.y });
  }

  /** Comida que consume la población por minuto. */
  foodPerMinute(): number {
    return (this.npcs.length * CONFIG.food.perPerson * 60) / CONFIG.food.interval;
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
    const ore = oreAt(this.world, x, y);
    if (kind === 'drill' && (ore === Ore.None || ore === Ore.Oil)) {
      return { ok: false, reason: 'El taladro necesita mena' };
    }
    if (kind === 'pump' && ore !== Ore.Oil) {
      return { ok: false, reason: 'La bomba va sobre petróleo' };
    }
    if (kind === 'farm' && oreAt(this.world, x, y) !== Ore.None) {
      return { ok: false, reason: 'La granja necesita tierra libre' };
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
    if (!b || !ROTATABLE.includes(b.kind)) return false;
    b.dir = dir;
    return true;
  }

  /** Cambia el rol de un NPC (no se puede poner/quitar Mecánico a mano: eso lo hace el Taller). */
  setRole(npcId: number, role: NpcRole): boolean {
    const n = this.npcs.find((o) => o.id === npcId);
    if (!n || n.role === role || role === 'mechanic' || n.role === 'mechanic') return false;
    this.changeRole(n, role);
    return true;
  }

  /** Cambia el rol soltando el trabajo actual; lo que llevaba vuelve al almacén. */
  changeRole(n: Npc, role: NpcRole): void {
    if (n.jobId !== null) {
      const job = this.jobs.get(n.jobId);
      if (job) this.jobs.unassign(job);
      n.jobId = null;
    }
    addAll(this.storage, n.carry);
    n.carry = {};
    n.work = 0;
    n.path = [];
    n.role = role;
  }

  /** ¿Hay un taller terminado con mecánicos? (entonces los Constructores no reparan) */
  hasWorkshop(): boolean {
    return this.npcs.some((n) => n.role === 'mechanic');
  }

  /** Talleres terminados (y no marcados para desmontar). */
  workshops(): Building[] {
    return [...this.buildings.values()].filter((b) => b.kind === 'workshop' && b.built && !b.markedForRemoval);
  }

  /** Personas fuera del taller (y de otros puestos fijos). */
  generalWorkers(): Npc[] {
    return this.npcs.filter((n) => n.role !== 'mechanic');
  }

  /**
   * Dotación de los talleres: cada uno quiere `workshop.workers` mecánicos. Se toman del rol con más gente
   * (prefiriendo a quien esté libre) dejando al menos `minOutside` fuera. Si sobran mecánicos, vuelven a Constructor.
   */
  private staffWorkshops(): void {
    const W = CONFIG.workshop;
    const want = this.workshops().length * W.workers;
    let mech = this.npcs.filter((n) => n.role === 'mechanic');
    while (mech.length > want) {
      this.changeRole(mech[mech.length - 1], 'constructor');
      mech = mech.slice(0, -1);
    }
    while (mech.length < want) {
      const pool = this.generalWorkers();
      if (pool.length <= W.minOutside) break;
      const byRole = new Map<NpcRole, number>();
      for (const n of pool) byRole.set(n.role, (byRole.get(n.role) ?? 0) + 1);
      pool.sort((a, b) => byRole.get(b.role)! - byRole.get(a.role)! || Number(a.jobId !== null) - Number(b.jobId !== null) || a.id - b.id);
      this.changeRole(pool[0], 'mechanic');
      mech.push(pool[0]);
    }
  }

  /** Cambia la receta de una fábrica. Lo que tenía dentro pasa a la salida para que se recoja. */
  setRecipe(id: number, recipe: string | null): boolean {
    const b = this.buildings.get(id);
    if (!b || b.kind !== 'factory') return false;
    if (recipe !== null && !this.recipesFor(b).includes(recipe)) return false;
    if (b.recipe === recipe) return true;
    // Lo que hay dentro vuelve a la salida (lo recoge un NPC o sale por cinta) y la producción en curso se cancela devolviendo sus entradas.
    if (b.recipe && b.craft > 0) addAll(b.out, CONFIG.recipes[b.recipe].inputs);
    addAll(b.out, b.inv);
    b.inv = {};
    b.recipe = recipe;
    b.craft = 0;
    return true;
  }

  /** Estado de una fábrica o refinería para mostrarlo sobre el edificio. */
  factoryStatus(b: Building): FactoryStatus {
    if (!isCrafter(b.kind) || !b.built) return { state: 'none' };
    if (!b.recipe) return { state: 'norecipe' };
    const r = CONFIG.recipes[b.recipe];
    if (b.craft > 0) return { state: 'producing', lowPower: powerMult(b) < 1 };
    const missingItems = entries(r.inputs)
      .filter(([i, n]) => count(b.inv, i) < n)
      .map(([i]) => i);
    if (missingItems.length) return { state: 'missing', missing: missingItems };
    let outTotal = 0;
    for (const [, n] of entries(b.out)) outTotal += n;
    let produced = 0;
    for (const [, n] of entries(r.outputs)) produced += n;
    if (outTotal + produced > CONFIG.factory.outCap) return { state: 'full' };
    return { state: 'producing', lowPower: powerMult(b) < 1 };
  }

  /** Recetas que puede fabricar este edificio: desbloqueadas, de su nivel y de su tipo de edificio. */
  recipesFor(b: Building): string[] {
    if (b.kind !== 'factory') return [];
    return Object.keys(CONFIG.recipes).filter((id) => {
      const r = CONFIG.recipes[id];
      return this.unlockedRecipes.has(id) && r.tier <= CONFIG.factory.tier && (r.building ?? 'factory') === 'factory';
    });
  }

  /** Cuántas unidades de `item` caben como entrada en el edificio (0 = no lo acepta). */
  capacityFor(b: Building, item: ItemId): number {
    if (!b.built) return 0;
    if (isCrafter(b.kind) && b.recipe) {
      const need = CONFIG.recipes[b.recipe].inputs[item] ?? 0;
      return need * CONFIG.factory.inputBatches;
    }
    const t = this.turretDef(b);
    if (t?.ammo === item) return t.ammoCap;
    const gen = CONFIG.power.generators[b.kind as BuildKind];
    if (gen?.fuel === item) return gen.fuelCap ?? 0;
    return 0;
  }

  /** Objetos que el edificio puede recibir como entrada (para generar abastecimientos). */
  inputsOf(b: Building): ItemId[] {
    if (isCrafter(b.kind) && b.recipe) return entries(CONFIG.recipes[b.recipe].inputs).map(([i]) => i);
    const t = this.turretDef(b);
    if (t?.ammo) return [t.ammo];
    const gen = CONFIG.power.generators[b.kind as BuildKind];
    return gen?.fuel ? [gen.fuel] : [];
  }

  /** ¿Necesita que un NPC le traiga `item`? (Con automatización, sólo si está vacío.) */
  needsManualSupply(_b: Building, _item: ItemId): boolean {
    return true;
  }

  /** ¿La salida del edificio sale sola (hay algo delante que la acepta)? */
  outputFlows(b: Building): boolean {
    const front = this.buildingAt(b.x + DX[b.dir], b.y + DY[b.dir]);
    if (!front || !front.built) return false;
    if (front.kind === 'pipeline') return true;
    if (this.def(front.kind).storage) return true;
    // Una cinta sólo se lleva la salida si tiene energía.
    return (front.kind === 'belt' || front.kind === 'belt_fast') && powerMult(front) > 0;
  }

  turretDef(b: Building): TurretDef | undefined {
    return (CONFIG.turrets as Partial<Record<BuildingKind, TurretDef>>)[b.kind];
  }

  /** Rendimiento por desgaste: 1, `lowEfficiency` bajo el umbral, 0 si está roto. */
  wearFactor(b: Building): number {
    if (b.condition <= 0) return 0;
    return b.condition < CONFIG.wear.lowThreshold ? CONFIG.wear.lowEfficiency : 1;
  }

  /** ¿Tiene la torreta con qué disparar ya mismo? */
  turretReady(b: Building): boolean {
    const t = this.turretDef(b);
    if (!t) return false;
    if (t.ammo) return b.shots > 0 || count(b.inv, t.ammo) > 0;
    return true;
  }

  /** Lo que todavía cabe de `item`. */
  room(b: Building, item: ItemId): number {
    return Math.max(0, this.capacityFor(b, item) - count(b.inv, item));
  }

  /** ¿Hay alguna torreta (colocada, aunque sea en obra)? */
  hasTurret(): boolean {
    for (const b of this.buildings.values()) if (b.kind in CONFIG.turrets) return true;
    return false;
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
    this.gridDirty = true;
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
    this.stepGrid(dt);
    this.stepFood(dt);
    this.stepGrowth(dt);
    this.staffWorkshops();
    if (this.gameOver) return;
    this.jobs.update(this, dt);
    for (const n of [...this.npcs]) stepNpc(this, n, dt);
    this.stepBelts(dt);
    this.stepPipes(dt);
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
      power: 0,
      running: false,
      critical: CONFIG.power.criticalByDefault.includes(kind as BuildKind),
      charge: 0,
      markedForRemoval: false,
    };
    if (kind === 'refinery') b.recipe = 'gasoline';
    this.buildings.set(b.id, b);
    for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) this.owner[(y + dy) * this.world.w + x + dx] = b.id;
    return b;
  }

  deleteBuilding(b: Building): void {
    this.buildings.delete(b.id);
    for (let dy = 0; dy < b.d; dy++)
      for (let dx = 0; dx < b.w; dx++) this.owner[(b.y + dy) * this.world.w + b.x + dx] = -1;
    if (b.built && this.def(b.kind).solid) this.recomputeFlow();
    if (b.built) this.gridDirty = true;
  }

  // ---------------------------------------------------------------- electricidad

  /** Topología de redes eléctricas (se reconstruye al cambiar edificios). */
  grid: Grid = emptyGrid();
  gridDirty = true;

  netOf(b: Building): PowerNet | undefined {
    const id = this.grid.netOf.get(b.id);
    return id === undefined ? undefined : this.grid.nets[id];
  }

  needsStart(b: Building): boolean {
    return needsStart(b);
  }

  setCritical(id: number, critical: boolean): void {
    const b = this.buildings.get(id);
    if (b) b.critical = critical;
  }

  private stepGrid(dt: number): void {
    if (this.gridDirty) {
      this.grid = rebuildGrid(this);
      this.gridDirty = false;
    }
    stepPower(this, dt);
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
    this.dropNpc(n);
    this.stats.npcDeaths++;
    this.emit({ type: 'npcDied', id: n.id, x: n.x, y: n.y });
    this.checkPopulation();
  }

  /** Una persona abandona la colonia (hambre). Lo que llevaba se pierde. */
  npcLeave(n: Npc): void {
    this.dropNpc(n);
    this.stats.npcLeft++;
    this.emit({ type: 'npcLeft', id: n.id, x: n.x, y: n.y });
    this.checkPopulation();
  }

  private dropNpc(n: Npc): void {
    this.npcs = this.npcs.filter((o) => o !== n);
    if (n.jobId !== null) {
      const job = this.jobs.get(n.jobId);
      if (job) this.jobs.unassign(job);
    }
  }

  /** Sin población se pierde la partida. */
  private checkPopulation(): void {
    if (this.npcs.length === 0 && !this.gameOver) {
      this.gameOver = true;
      this.emit({ type: 'gameOver' });
    }
  }

  /** La población come del almacén; sin comida hay hambre y, si dura, la gente se marcha. */
  private stepFood(dt: number): void {
    const F = CONFIG.food;
    if (this.npcs.length === 0) return;
    this.foodDebt += (dt * this.npcs.length * F.perPerson) / F.interval;
    while (this.foodDebt >= 1) {
      if (take(this.storage, 'food', 1) === 0) break;
      this.foodDebt -= 1;
      this.stats.foodEaten++;
    }
    if (this.foodDebt >= 1) {
      this.foodDebt = 1; // no se acumula deuda infinita
      this.hungry = true;
      this.hungerTime += dt;
      if (this.hungerTime >= F.starveGrace) {
        this.hungerTime = F.starveGrace - F.leaveInterval;
        this.npcLeave(this.npcs[this.npcs.length - 1]);
      }
    } else {
      this.hungry = false;
      this.hungerTime = 0;
    }
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
      const count = this.wave === 1 ? W.firstCount : W.baseCount + W.countGrowth * n;
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
  pushItem(x: number, y: number, item: ItemId, dir: Dir, src?: Building): boolean {
    const b = this.buildingAt(x, y);
    if (!b || !b.built) return false;
    const belt = b.kind === 'belt' || b.kind === 'belt_fast';
    if (isLiquid(item)) {
      // Los líquidos sólo viajan por tuberías: un productor sólo puede sacarlos a una tubería.
      if (belt) return false;
      if (src && src.kind !== 'pipeline' && b.kind !== 'pipeline') return false;
      if (b.kind === 'pipeline') {
        if (b.dir === opposite(dir)) return false;
        const have = Object.keys(b.inv)[0] as ItemId | undefined;
        if ((have && have !== item) || count(b.inv, item) >= CONFIG.pipe.cap) return false;
        add(b.inv, item, 1);
        return true;
      }
    } else {
      if (b.kind === 'pipeline') return false;
      // Un productor no pasa material a otro edificio de producción: sólo a cintas y almacenes.
      if (src && isProducer(src.kind) && !belt && !this.def(b.kind).storage) return false;
    }
    if (this.def(b.kind).storage) {
      add(this.storage, item, 1);
      this.stats.delivered++;
      this.emit({ type: 'deliver', item });
      return true;
    }
    if (belt) {
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
  factorySpeed(b: Building): number {
    return powerMult(b) * this.wearFactor(b);
  }

  private stepFactories(dt: number): void {
    for (const b of this.buildings.values()) {
      if (!isCrafter(b.kind) || !b.built) continue;
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
  protected onCrafted(b: Building): void {
    b.condition = Math.max(0, b.condition - CONFIG.wear.factoryPerCraft);
  }

  private stepBelts(dt: number): void {
    for (const b of this.buildings.values()) {
      if ((b.kind !== 'belt' && b.kind !== 'belt_fast') || !b.built || b.item === null) continue;
      // Sin energía la cinta no se mueve (multiplicador 0): eso es el modo manual.
      const speed = (b.kind === 'belt_fast' ? CONFIG.belt.fastSpeed : CONFIG.belt.speed) * powerMult(b);
      if (speed <= 0) continue;
      b.beltProgress = Math.min(1, b.beltProgress + speed * dt);
      if (b.beltProgress >= 1 && this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], b.item, b.dir, b)) {
        b.item = null;
        b.beltProgress = 0;
      }
    }
  }

  /** Tuberías: pasan líquido a la casilla de delante (sin energía); `b.timer` acumula el caudal. */
  private stepPipes(dt: number): void {
    for (const b of this.buildings.values()) {
      if (b.kind !== 'pipeline' || !b.built) continue;
      const item = Object.keys(b.inv).find((k) => count(b.inv, k as ItemId) > 0) as ItemId | undefined;
      if (!item) {
        b.timer = 0;
        continue;
      }
      b.timer = Math.min(CONFIG.pipe.rate, b.timer + CONFIG.pipe.rate * dt);
      while (b.timer >= 1 && count(b.inv, item) > 0) {
        if (!this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], item, b.dir, b)) break;
        take(b.inv, item, 1);
        b.timer -= 1;
      }
    }
  }

  /** Saca un objeto de `out` hacia la casilla de delante (cinta, almacén...). */
  private pushOutput(b: Building): void {
    for (const [item] of entries(b.out)) {
      if (this.pushItem(b.x + DX[b.dir], b.y + DY[b.dir], item, b.dir, b)) {
        add(b.out, item, -1);
        return;
      }
    }
  }

  /** Qué produce un extractor (taladro, granja...) y a qué ritmo. */
  producerOf(b: Building): { item: ItemId; period: number; cap: number } | null {
    if (b.kind === 'drill') {
      const item = ORE_ITEM[oreAt(this.world, b.x, b.y)];
      return item ? { item, period: CONFIG.drill.period, cap: CONFIG.drill.outCap } : null;
    }
    if (b.kind === 'farm') return { item: 'food', period: CONFIG.farm.period, cap: CONFIG.farm.outCap };
    if (b.kind === 'pump') return { item: 'oil', period: CONFIG.pump.period, cap: CONFIG.pump.outCap };
    return null;
  }

  private stepDrills(dt: number): void {
    for (const b of this.buildings.values()) {
      if (!b.built) continue;
      const p = this.producerOf(b);
      if (!p) continue;
      if (count(b.out, p.item) < p.cap) {
        b.timer += dt * powerMult(b);
        if (b.timer >= p.period) {
          b.timer -= p.period;
          add(b.out, p.item, 1);
        }
      }
      this.pushOutput(b);
    }
  }

  /** Factor de energía de una torreta (1 = plena). Las que no usan energía siempre 1. */
  turretPower(b: Building): number {
    const t = this.turretDef(b);
    return !t || t.energyPerShot === 0 ? 1 : 0;
  }

  turretRange(kind: TurretKind): number {
    return CONFIG.turrets[kind].range + (this.turretLevel[kind] - 1) * CONFIG.turretLevels.rangePerLevel;
  }

  turretDamage(kind: TurretKind): number {
    return CONFIG.turrets[kind].damage * (1 + (this.turretLevel[kind] - 1) * CONFIG.turretLevels.damagePerLevel);
  }

  /** Aplica daño teniendo en cuenta la armadura. */
  damageEnemy(e: Enemy, dmg: number, ignoresArmor: boolean): void {
    e.hp -= ignoresArmor ? dmg : Math.max(dmg * CONFIG.armorMinFraction, dmg - e.armor);
  }

  private stepTurrets(dt: number): void {
    for (const b of this.buildings.values()) {
      const t = this.turretDef(b);
      if (!t || !b.built) continue;
      const kind = b.kind as TurretKind;
      const eff = this.wearFactor(b) * this.turretPower(b);
      if (eff <= 0) continue;
      b.timer -= dt * eff;
      if (b.timer > 0) continue;
      const cx = b.x + 0.5;
      const cy = b.y + 0.5;
      let target: Enemy | null = null;
      let best = this.turretRange(kind);
      for (const e of this.enemies) {
        if (e.hp <= 0 || (e.flying && !t.hitsAir)) continue;
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
      // Munición: cada unidad da `shotsPerAmmo` disparos.
      if (t.ammo) {
        if (b.shots <= 0) {
          if (take(b.inv, t.ammo, 1) === 0) {
            b.timer = 0;
            continue;
          }
          b.shots += t.shotsPerAmmo;
        }
        b.shots--;
      }
      const dmg = this.turretDamage(kind);
      const hits =
        t.area > 0
          ? this.enemies.filter((e) => e.hp > 0 && (t.hitsAir || !e.flying) && Math.hypot(e.x - target!.x, e.y - target!.y) <= t.area)
          : [target];
      for (const e of hits) {
        this.damageEnemy(e, dmg, t.ignoresArmor);
        if (t.burnDps > 0) {
          e.burnTimer = t.burnTime;
          e.burnDps = Math.max(e.burnDps, t.burnDps);
        }
        if (t.slow < 1) {
          e.slowTimer = t.slowTime;
          e.slowFactor = Math.min(e.slowFactor, t.slow);
        }
      }
      b.timer = t.cooldown;
      b.condition = Math.max(0, b.condition - CONFIG.wear.turretPerShot);
      this.emit({ type: 'shot', towerId: b.id, kind, fromX: cx, fromY: cy, toX: target.x, toY: target.y });
    }
    this.removeDeadEnemies();
  }

  /** Daña el edificio construido más cercano al enemigo (a ≤ enemyHitRadius de su huella). */
  private hitBuildingNear(e: Enemy, dmg: number): void {
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    let best: Building | null = null;
    let bestD = CONFIG.enemyHitRadius;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.buildingAt(tx + dx, ty + dy);
        if (!b || !b.built || b.kind === 'core') continue;
        const cx = Math.max(b.x, Math.min(e.x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(e.y, b.y + b.d));
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d <= bestD) {
          bestD = d;
          best = b;
        }
      }
    }
    if (!best) return;
    best.hp -= dmg;
    if (best.hp <= 0) {
      this.emit({ type: 'destroyed', id: best.id, x: best.x, y: best.y });
      this.deleteBuilding(best);
    }
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
      // Quemadura y ralentización.
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        e.hp -= e.burnDps * dt;
        if (e.burnTimer <= 0) e.burnDps = 0;
      }
      let speed = e.speed;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        speed *= e.slowFactor;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }
      let budget = speed * dt;
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
      // Daño a NPCs y al edificio que tenga al lado.
      if (def.dps > 0 && !e.flying) this.hitBuildingNear(e, def.dps * CONFIG.buildingDamageFactor * dt);
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

/** Edificios que se pueden girar (tienen salida o dirección). */
export const ROTATABLE: BuildingKind[] = ['belt', 'belt_fast', 'pipeline', 'drill', 'factory', 'feeder', 'farm', 'pump', 'refinery'];

/** Edificios que transforman entradas en salidas con una receta. */
/** Edificios de producción: no se pasan material entre sí; su salida sólo la aceptan cintas, tuberías o almacenes. */
export const isProducer = (k: BuildingKind) => k === 'drill' || k === 'farm' || k === 'pump' || k === 'factory' || k === 'refinery';

export const isCrafter = (k: BuildingKind) => k === 'factory' || k === 'refinery';

export const ORE_ITEM: Record<number, ItemId | undefined> = {
  [Ore.Iron]: 'iron_ore',
  [Ore.Copper]: 'copper_ore',
  [Ore.Coal]: 'coal',
  [Ore.Stone]: 'stone',
  [Ore.Wood]: 'wood',
  [Ore.Oil]: 'oil',
  [Ore.Sulfur]: 'sulfur',
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
