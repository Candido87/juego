/**
 * Redes eléctricas (lógica pura).
 * - Los postes se enlazan solos con otros postes a ≤ wireRange: cada componente conexa es una red.
 * - Cada edificio eléctrico se conecta al poste más cercano a ≤ supplyRadius (Chebyshev).
 * - Cada paso: producción + baterías se reparten entre la demanda; primero los críticos.
 *   Satisfacción s ∈ [0,1] → rendimiento = sinRed + (conRed − sinRed)·s.
 */
import { count, take } from './bag';
import { CONFIG } from './config';
import type { Building, Game } from './game';
import type { BuildKind } from './types';

export interface PowerNet {
  id: number;
  poles: number[];
  members: number[];
  /** Producción y demanda del último paso (unidades/s). */
  production: number;
  demand: number;
  /** Energía almacenada y capacidad de las baterías de la red. */
  stored: number;
  capacity: number;
  /** Satisfacción de los críticos y del resto. */
  sCritical: number;
  sNormal: number;
}

export interface Grid {
  nets: PowerNet[];
  /** Edificio → red (o ausente). */
  netOf: Map<number, number>;
  /** Pares de postes enlazados (para dibujar cables). */
  wires: [number, number][];
}

export const emptyGrid = (): Grid => ({ nets: [], netOf: new Map(), wires: [] });

const P = () => CONFIG.power;

export function isGenerator(kind: string): boolean {
  return kind in P().generators;
}

/** ¿Participa el edificio en la red (consume, produce o almacena)? */
export function isElectric(kind: string): boolean {
  return kind in P().demand || isGenerator(kind) || kind === 'accumulator';
}

/** Distancia Chebyshev entre la huella de un edificio y una casilla. */
function cheb(b: Building, x: number, y: number): number {
  const dx = x < b.x ? b.x - x : x >= b.x + b.w ? x - (b.x + b.w - 1) : 0;
  const dy = y < b.y ? b.y - y : y >= b.y + b.d ? y - (b.y + b.d - 1) : 0;
  return Math.max(dx, dy);
}

/** Reconstruye la topología (llamar cuando cambian edificios). Conserva la energía almacenada por batería. */
export function rebuildGrid(game: Game): Grid {
  const poles = [...game.buildings.values()].filter((b) => b.kind === 'pole' && b.built);
  // Unión-búsqueda de postes.
  const parent = new Map<number, number>(poles.map((p) => [p.id, p.id]));
  const find = (a: number): number => {
    while (parent.get(a)! !== a) {
      parent.set(a, parent.get(parent.get(a)!)!);
      a = parent.get(a)!;
    }
    return a;
  };
  const wires: [number, number][] = [];
  for (let i = 0; i < poles.length; i++) {
    for (let j = i + 1; j < poles.length; j++) {
      const a = poles[i];
      const b = poles[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= P().wireRange) {
        wires.push([a.id, b.id]);
        parent.set(find(a.id), find(b.id));
      }
    }
  }
  const byRoot = new Map<number, PowerNet>();
  const nets: PowerNet[] = [];
  const netOf = new Map<number, number>();
  for (const p of poles) {
    const r = find(p.id);
    let net = byRoot.get(r);
    if (!net) {
      net = { id: nets.length, poles: [], members: [], production: 0, demand: 0, stored: 0, capacity: 0, sCritical: 0, sNormal: 0 };
      byRoot.set(r, net);
      nets.push(net);
    }
    net.poles.push(p.id);
    netOf.set(p.id, net.id);
  }
  for (const b of game.buildings.values()) {
    if (!b.built || !isElectric(b.kind)) continue;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const p of poles) {
      const d = cheb(b, p.x, p.y);
      if (d <= P().supplyRadius && d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) continue;
    const net = nets[netOf.get(best.id)!];
    net.members.push(b.id);
    netOf.set(b.id, net.id);
  }
  return { nets, netOf, wires };
}

/** Demanda actual de un edificio conectado. */
export function demandOf(b: Building): number {
  return P().demand[b.kind as BuildKind] ?? 0;
}

/** Avanza generadores y reparte la energía. Escribe `b.power` (satisfacción) en cada consumidor. */
export function stepPower(game: Game, dt: number): void {
  // Por defecto nadie tiene energía.
  for (const b of game.buildings.values()) b.power = 0;
  for (const net of game.grid.nets) {
    let production = 0;
    let crit = 0;
    let normal = 0;
    let capacity = 0;
    let stored = 0;
    const batteries: Building[] = [];
    for (const id of net.members) {
      const b = game.buildings.get(id);
      if (!b || !b.built) continue;
      const gen = P().generators[b.kind as BuildKind];
      if (gen) production += generatorOutput(b, dt);
      if (b.kind === 'accumulator') {
        batteries.push(b);
        capacity += P().batteryCapacity;
        stored += b.charge;
      }
      const d = demandOf(b);
      if (d > 0) {
        if (b.critical) crit += d;
        else normal += d;
      }
    }
    // Energía disponible este paso: producción + baterías.
    let avail = production * dt + stored;
    const needC = crit * dt;
    const needN = normal * dt;
    const sC = needC > 0 ? Math.min(1, avail / needC) : 1;
    avail -= needC * sC;
    const sN = needN > 0 ? Math.min(1, avail / needN) : 1;
    const used = needC * sC + needN * sN;
    // Baterías: guardan el excedente o cubren el déficit.
    const delta = production * dt - used; // >0 sobra, <0 falta
    let newStored = Math.max(0, Math.min(capacity, stored + delta));
    // Repartir proporcionalmente entre baterías.
    for (const bat of batteries) bat.charge = capacity > 0 ? (newStored * P().batteryCapacity) / capacity : 0;
    if (!batteries.length) newStored = 0;
    for (const id of net.members) {
      const b = game.buildings.get(id);
      if (b && demandOf(b) > 0) b.power = b.critical ? sC : sN;
    }
    net.production = production;
    net.demand = crit + normal;
    net.stored = newStored;
    net.capacity = capacity;
    net.sCritical = sC;
    net.sNormal = sN;
  }
}

/** Potencia que da un generador este paso (y gasta su combustible). */
function generatorOutput(b: Building, dt: number): number {
  const gen = P().generators[b.kind as BuildKind]!;
  if (!gen.fuel) return gen.power; // solar
  if (!b.running) return 0;
  if (b.timer <= 0) {
    if (take(b.inv, gen.fuel, 1) === 0) {
      b.running = false; // sin combustible: se para y habrá que arrancarlo
      return 0;
    }
    b.timer += gen.burnTime!;
  }
  b.timer -= dt;
  return gen.power;
}

/** ¿Está parado un generador de combustión con combustible listo para arrancar? */
export function needsStart(b: Building): boolean {
  const gen = P().generators[b.kind as BuildKind];
  return !!gen?.fuel && b.built && !b.running && count(b.inv, gen.fuel) > 0;
}

/** Multiplicador de rendimiento según la energía recibida. */
export function powerMult(b: Building): number {
  const m = P().mult[b.kind as BuildKind];
  if (!m) return 1;
  return m[0] + (m[1] - m[0]) * b.power;
}
