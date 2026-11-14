/**
 * Ayudas de la guía para cintas, energía y tuberías (lógica pura, sin Phaser):
 * - seguir una cadena de cintas/tuberías desde la salida de un edificio y ver dónde acaba,
 * - diagnosticar por qué no fluye (sentido contrario, sin conexión, sin energía, sin poste...),
 * - proponer una ruta de ejemplo (casillas con su sentido) hasta el destino.
 */
import { CONFIG } from './config';
import type { Building, Game } from './game';
import { Dir, DX, DY, BuildKind, Ore, Tile, dirBetween, opposite } from './types';
import { inBounds, oreAt } from './world';

export type Medium = 'solid' | 'liquid';

/** Aviso concreto de "por qué no funciona": texto y, si procede, la casilla donde mirar. */
export interface Diag {
  code: string;
  text: string;
  tile?: Tile;
}

export interface Chain {
  /** Casillas de cinta/tubería recorridas, en orden. */
  tiles: Building[];
  end:
    | { kind: 'dest'; building: Building }
    | { kind: 'empty'; tile: Tile }
    | { kind: 'reverse'; building: Building }
    | { kind: 'blocked'; building: Building }
    | { kind: 'wrong'; building: Building }
    | { kind: 'loop' };
}

const isBelt = (b: Building) => b.kind === 'belt' || b.kind === 'belt_fast';

/** ¿El edificio puede recibir material de ese medio? (el almacén recibe todo lo que le llega por conducto). */
export function acceptsMedium(g: Game, b: Building, medium: Medium): boolean {
  if (!b.built && !b.markedForRemoval) return true; // en obra: cuenta como conectado
  if (g.def(b.kind).storage) return true;
  if (medium === 'liquid') {
    if (b.kind === 'refinery') return true;
    return !!CONFIG.power.generators[b.kind as BuildKind]?.fuel;
  }
  if (b.kind === 'factory') return true;
  return !!g.turretDef(b)?.ammo;
}

/** Sigue el conducto desde la casilla de delante de `src` (en su dirección de salida). */
export function followChain(g: Game, src: Building, medium: Medium): Chain {
  const tiles: Building[] = [];
  let dir: Dir = src.dir;
  let x = src.x + DX[dir];
  let y = src.y + DY[dir];
  for (let guard = 0; guard < 300; guard++) {
    const b = g.buildingAt(x, y);
    if (!b) return { tiles, end: { kind: 'empty', tile: { x, y } } };
    const conduit = medium === 'solid' ? isBelt(b) : b.kind === 'pipeline';
    if (conduit) {
      if (b.dir === opposite(dir)) return { tiles, end: { kind: 'reverse', building: b } };
      tiles.push(b);
      dir = b.dir;
      x = b.x + DX[dir];
      y = b.y + DY[dir];
      continue;
    }
    if (isBelt(b) || b.kind === 'pipeline') return { tiles, end: { kind: 'wrong', building: b } };
    return acceptsMedium(g, b, medium) ? { tiles, end: { kind: 'dest', building: b } } : { tiles, end: { kind: 'blocked', building: b } };
  }
  return { tiles, end: { kind: 'loop' } };
}

/** Medio que saca un edificio por su salida. */
export function outMedium(b: Building): Medium | null {
  if (b.kind === 'pump' || b.kind === 'refinery') return 'liquid';
  if (b.kind === 'drill' || b.kind === 'farm' || b.kind === 'factory') return 'solid';
  return null;
}

const nameOf = (k: string) => (CONFIG.buildings as Record<string, { name: string }>)[k]?.name ?? (k === 'core' ? 'el núcleo' : k);
const tileOf = (b: Building): Tile => ({ x: b.x, y: b.y });

/** ¿Por qué no llega lo que sale de `src`? null si la cadena está bien (aunque no haya energía todavía). */
export function diagnoseOutput(g: Game, src: Building): Diag | null {
  const medium = outMedium(src);
  if (!medium) return null;
  const front = { x: src.x + DX[src.dir], y: src.y + DY[src.dir] };
  const conduit = medium === 'solid' ? 'cinta' : 'tubería';
  const fb = g.buildingAt(front.x, front.y);
  if (fb && !fb.built) return null; // se está construyendo
  if (!fb) return { code: 'no_conduit', tile: front, text: `La salida de ${nameOf(src.kind).toLowerCase()} apunta a esta casilla vacía: pon aquí una ${conduit}.` };
  const c = followChain(g, src, medium);
  switch (c.end.kind) {
    case 'reverse':
      return { code: 'reverse', tile: tileOf(c.end.building), text: `Esta ${conduit} apunta al sentido contrario: pulsa R para girarla (la flecha debe ir hacia el destino).` };
    case 'empty':
      return { code: 'dangling', tile: c.end.tile, text: `La ${conduit} termina en el vacío: continúala hasta el destino.` };
    case 'wrong':
      return {
        code: 'wrong_conduit',
        tile: tileOf(c.end.building),
        text: medium === 'solid' ? 'Los líquidos no van en cinta: usa una tubería.' : 'Esto es una cinta y aquí va líquido: usa una tubería.',
      };
    case 'blocked': {
      const t = tileOf(c.end.building);
      if (medium === 'solid' && (c.end.building.kind === 'refinery' || c.end.building.kind === 'generator')) return { code: 'wrong_dest', tile: t, text: `${nameOf(c.end.building.kind)} no admite sólidos por cinta.` };
      return { code: 'blocked', tile: t, text: `${nameOf(c.end.building.kind)} no acepta lo que llega por aquí. Llévalo a un almacén, una fábrica o una torreta.` };
    }
    case 'loop':
      return { code: 'loop', text: 'La cadena da vueltas sin llegar a ningún sitio.' };
    case 'dest': {
      // Fábrica sin receta: acepta pero no usa.
      const d = c.end.building;
      if (medium === 'solid' && d.kind === 'factory' && !d.recipe && d.built) return { code: 'no_recipe', tile: tileOf(d), text: 'La fábrica de destino no tiene receta: haz clic en ella y elige una.' };
      return null;
    }
  }
}

/** ¿Hay generadores y están en marcha? Para explicar por qué no hay energía. */
export function powerStatus(g: Game): { generators: number; running: number; fuelLeft: number } {
  let generators = 0;
  let running = 0;
  let fuelLeft = g.storage.gasoline ?? 0;
  for (const b of g.buildings.values()) {
    const gen = CONFIG.power.generators[b.kind as BuildKind];
    if (!gen?.fuel || !b.built) continue;
    generators++;
    if (b.running) running++;
    fuelLeft += b.inv.gasoline ?? 0;
  }
  return { generators, running, fuelLeft };
}

/** Diagnóstico de energía: ¿por qué este edificio eléctrico no la recibe? */
export function diagnosePower(g: Game, b: Building): Diag | null {
  if (!b.built || !(b.kind in CONFIG.power.demand)) return null;
  const name = nameOf(b.kind).toLowerCase();
  const ps = powerStatus(g);
  const net = g.netOf(b);
  const label = b.kind === 'belt' || b.kind === 'belt_fast' ? 'Esta cinta' : `Esta ${name}`;
  if (!net) {
    if (ps.generators === 0 && !g.buildings.size) return null;
    return { code: 'no_pole', tile: tileOf(b), text: `${label} no tiene energía: conecta un poste a menos de ${CONFIG.power.supplyRadius} casillas (y enlázalo con el resto de postes, alcance ${CONFIG.power.wireRange}).` };
  }
  if (net.production <= 0) {
    if (ps.generators === 0) return { code: 'no_generator', tile: tileOf(b), text: 'La red no tiene generador: construye uno y enlázalo con los postes.' };
    if (ps.running === 0 && ps.fuelLeft <= 0) return { code: 'no_fuel', tile: tileOf(b), text: 'El generador se ha quedado sin gasolina: llévale gasolina (o produce más con la refinería) y arráncalo.' };
    if (ps.running === 0) return { code: 'gen_stopped', tile: tileOf(b), text: 'El generador está parado: un Operario debe arrancarlo (cuando tenga gasolina lo hace solo).' };
    return { code: 'gen_unlinked', tile: tileOf(b), text: 'Ningún generador está enlazado con esta red: pon un poste junto al generador.' };
  }
  if (net.sNormal < 0.99 || net.sCritical < 0.99) return { code: 'overload', tile: tileOf(b), text: 'Se consume más energía de la que se produce: todo va más lento. Añade otro generador.' };
  return null;
}

/** Primer edificio con la misma clase de problema: el primero que tenga diagnóstico entre `list`. */
export function firstDiag(g: Game, list: Building[], fn: (g: Game, b: Building) => Diag | null): Diag | null {
  for (const b of list) {
    const d = fn(g, b);
    if (d) return d;
  }
  return null;
}

// ---------------------------------------------------------------- ruta de ejemplo

export interface RouteTile {
  x: number;
  y: number;
  dir: Dir;
}

/**
 * Ruta de ejemplo (BFS por casillas libres) desde la salida de `src` hasta una casilla vecina de un edificio de destino.
 * Cada casilla lleva el sentido en que debe ir la cinta o la tubería.
 */
export function planRoute(g: Game, src: Building, isTarget: (b: Building) => boolean, maxLen = 40): RouteTile[] | null {
  const { w } = g.world;
  // Casillas a las que ya apunta otra salida (taladro, fábrica, cinta, tubería): una ruta por ahí se mezclaría con su material.
  const fed = new Set<number>();
  for (const o of g.buildings.values()) {
    if (o === src || !(outMedium(o) || o.kind === 'belt' || o.kind === 'belt_fast' || o.kind === 'pipeline')) continue;
    fed.add((o.y + DY[o.dir]) * w + o.x + DX[o.dir]);
  }
  const free = (x: number, y: number) => inBounds(g.world, x, y) && !g.buildingAt(x, y) && !g.isSpawn(x, y) && !g.isCoreTile(x, y) && !fed.has(y * w + x);
  const start = { x: src.x + DX[src.dir], y: src.y + DY[src.dir] };
  const target = (x: number, y: number) => {
    const b = g.buildingAt(x, y);
    return !!b && b !== src && isTarget(b);
  };
  if (!free(start.x, start.y)) return null;
  const prev = new Map<number, number>([[start.y * w + start.x, -1]]);
  const q = [start.y * w + start.x];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % w;
    const y = (i / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (target(nx, ny)) {
        const path: Tile[] = [];
        for (let c = i; c !== -1; c = prev.get(c)!) path.unshift({ x: c % w, y: (c / w) | 0 });
        return path.map((t, j) => ({ ...t, dir: dirBetween(t, j + 1 < path.length ? path[j + 1] : { x: nx, y: ny })! }));
      }
      const ni = ny * w + nx;
      if (prev.has(ni) || !free(nx, ny)) continue;
      prev.set(ni, i);
      if (prev.size < maxLen * maxLen) q.push(ni);
    }
  }
  return null;
}

// ---------------------------------------------------------------- enlaces (qué conecta con qué)

/** "Origen → destino" que pide un paso de la guía. */
export interface LinkSpec {
  from: BuildKind;
  /** Receta que debe tener el origen (fábricas). */
  recipe?: string;
  /** Mena bajo el origen (taladros). */
  ore?: Ore[];
  /** Tipos de edificio de destino válidos. */
  to: (BuildKind | 'core')[];
  /** No cuentan como origen los que ya acaban en estos destinos (p. ej. el taladro ya conectado al almacén). */
  skipLinkedTo?: (BuildKind | 'core')[];
}

const matches = (g: Game, b: Building, l: LinkSpec) =>
  b.kind === l.from && (!l.recipe || b.recipe === l.recipe) && (!l.ore || l.ore.includes(oreAt(g.world, b.x, b.y)));

/** Orígenes construidos que cumplen el enlace. */
export function linkSources(g: Game, l: LinkSpec): Building[] {
  return [...g.buildings.values()].filter((b) => {
    if (!b.built || !matches(g, b, l)) return false;
    if (!l.skipLinkedTo) return true;
    const m = outMedium(b);
    const c = m ? followChain(g, b, m) : null;
    return !(c && c.end.kind === 'dest' && (l.skipLinkedTo as string[]).includes(c.end.building.kind));
  });
}

/** ¿La cadena de `src` acaba en un destino del enlace? */
export function linked(g: Game, src: Building, l: LinkSpec): boolean {
  const m = outMedium(src);
  if (!m) return false;
  const c = followChain(g, src, m);
  return c.end.kind === 'dest' && (l.to as string[]).includes(c.end.building.kind) && c.end.building.built;
}

/** Algún origen del enlace ya está conectado por conducto a su destino (estructura, no flujo). */
export function linkDone(g: Game, l: LinkSpec): boolean {
  return linkSources(g, l).some((b) => {
    if (!linked(g, b, l)) return false;
    const tiles = followChain(g, b, outMedium(b)!).tiles;
    return tiles.length > 0 && tiles.every((t) => t.built);
  });
}

/** Origen del enlace al que todavía le falta conexión (el más cercano al núcleo), o undefined. */
export function pendingSource(g: Game, l: LinkSpec): Building | undefined {
  const cx = g.core.x + g.core.w / 2;
  const cy = g.core.y + g.core.d / 2;
  return linkSources(g, l)
    .filter((b) => !linked(g, b, l))
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
}

/** Diagnóstico del enlace: el del primer origen pendiente (o con energía que falla si ya está conectado). */
export function diagnoseLink(g: Game, l: LinkSpec, includePower = true): Diag | null {
  const src = pendingSource(g, l) ?? linkSources(g, l)[0];
  if (!src) return null;
  const d = diagnoseOutput(g, src);
  if (d) return d;
  if (includePower && outMedium(src) === 'solid') {
    const c = followChain(g, src, 'solid');
    for (const belt of c.tiles) {
      const p = diagnosePower(g, belt);
      if (p) return p;
    }
  }
  return null;
}

/** Ruta de ejemplo del enlace para el primer origen pendiente. */
export function routeFor(g: Game, l: LinkSpec): RouteTile[] | null {
  const src = pendingSource(g, l);
  if (!src) return null;
  return planRoute(g, src, (b) => (l.to as string[]).includes(b.kind));
}
