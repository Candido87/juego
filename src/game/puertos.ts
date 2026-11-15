/**
 * Puntos de conexión de cada edificio (lógica pura): dónde sale y dónde entra el material, de qué tipo de flujo es cada
 * uno y en qué estado está (libre, conectado, error o bloqueado). La vista dibuja un conector con flecha en cada uno.
 *
 * `x,y` es la casilla de FUERA del edificio donde debe ir la cinta o la tubería; `dir` es el sentido del flujo en esa
 * casilla (la salida se aleja del edificio; la entrada apunta hacia él); `side` es el lado de la huella por el que está
 * (la dirección que va del edificio a esa casilla). Los edificios actuales ocupan una casilla; con huellas mayores
 * `x,y` seguirá siendo la casilla exterior pegada al lado.
 */
import { CONFIG } from './config';
import type { Building, Game } from './game';
import { BuildingKind, DX, DY, Dir, ItemId, opposite } from './types';

export type PortMedium = 'solid' | 'liquid';
/** Tipo de flujo: sólidos (por cinta) o un líquido concreto (por tubería). */
export type PortFlow = 'solid' | 'oil' | 'gasoline';
export interface Port {
  x: number;
  y: number;
  dir: Dir;
  io: 'in' | 'out';
  medium: PortMedium;
  flow: PortFlow;
  side: Dir;
}

const DIRS: Dir[] = [0, 1, 2, 3];

/** Nombre en español de cada tipo de flujo. */
export const FLOW_NAMES: Record<PortFlow, string> = { solid: 'sólidos', oil: 'petróleo', gasoline: 'gasolina' };
const mediumOf = (f: PortFlow): PortMedium => (f === 'solid' ? 'solid' : 'liquid');

/** Puertos de un edificio de 1×1 en (x,y) mirando a `dir`. Cintas y tuberías no tienen (ellas son la conexión). */
export function ports(kind: BuildingKind, x: number, y: number, dir: Dir): Port[] {
  const cfg = (CONFIG.portFlow as Record<string, { in?: PortFlow; out?: PortFlow }>)[kind];
  const gen = CONFIG.power.generators[kind as keyof typeof CONFIG.power.generators];
  const out = (flow: PortFlow): Port => ({ x: x + DX[dir], y: y + DY[dir], dir, io: 'out', medium: mediumOf(flow), flow, side: dir });
  const side = (k: Dir, flow: PortFlow): Port => ({ x: x + DX[k], y: y + DY[k], dir: opposite(k), io: 'in', medium: mediumOf(flow), flow, side: k });
  const inputs = (flow: PortFlow, skipFront: boolean) => DIRS.filter((k) => !skipFront || k !== dir).map((k) => side(k, flow));
  switch (kind) {
    case 'drill':
    case 'farm':
      return [out('solid')];
    case 'pump':
      return [out(cfg?.out ?? 'oil')];
    case 'factory':
      return [out('solid'), ...inputs('solid', true)];
    case 'refinery':
      return [out(cfg?.out ?? 'gasoline'), ...inputs(cfg?.in ?? 'oil', true)];
    case 'storage':
      return inputs('solid', false);
    default: {
      if (gen?.fuel) return inputs(gen.fuel as PortFlow, false);
      const t = (CONFIG.turrets as Record<string, { ammo?: ItemId }>)[kind];
      if (t?.ammo) return inputs('solid', false);
      return [];
    }
  }
}

/** ¿Tiene el edificio puertos que mostrar? */
export const hasPorts = (kind: BuildingKind): boolean => ports(kind, 0, 0, 0).length > 0;

/** ¿Pueden unirse una salida y una entrada? (distinto sentido y mismo tipo de flujo). Devuelve el motivo si no. */
export function canLink(from: Port, to: Port): { ok: true } | { ok: false; reason: string } {
  if (from.io === 'in' && to.io === 'in') return { ok: false, reason: 'Entrada con entrada: une una salida con una entrada' };
  if (from.io === 'out' && to.io === 'out') return { ok: false, reason: 'Salida con salida: une una salida con una entrada' };
  if (from.io === 'in') return { ok: false, reason: 'Sentido contrario: empieza en la salida y acaba en la entrada' };
  if (from.flow !== to.flow) {
    return { ok: false, reason: `Tipo de flujo incorrecto: la salida es de ${FLOW_NAMES[from.flow]} y la entrada de ${FLOW_NAMES[to.flow]}` };
  }
  return { ok: true };
}

/** Estado de un puerto: libre (nada conectado), conectado, error (conexión mal hecha) o bloqueado (conectado pero parado). */
export type PortState = 'free' | 'connected' | 'error' | 'blocked';
export interface PortStatus {
  state: PortState;
  /** Qué pasa (sólo en error o bloqueado). */
  reason?: string;
  /** Cómo arreglarlo. */
  fix?: string;
}

const isBelt = (b: Building) => b.kind === 'belt' || b.kind === 'belt_fast';
const hasAny = (bag: Record<string, number | undefined>) => Object.values(bag).some((n) => (n ?? 0) > 0);

/** Estado de un puerto concreto de un edificio, mirando lo que hay en su casilla exterior. */
export function portStatus(g: Game, b: Building, p: Port): PortStatus {
  const n = g.buildingAt(p.x, p.y);
  if (!n || !n.built) return { state: 'free' };
  const pipe = n.kind === 'pipeline';
  if (!isBelt(n) && !pipe) return { state: 'free' };
  const need = p.medium === 'liquid' ? 'una tubería' : 'una cinta';
  if (p.medium === 'liquid' && !pipe) {
    return { state: 'error', reason: 'Una cinta no transporta líquidos', fix: `Quita la cinta y pon ${need}` };
  }
  if (p.medium === 'solid' && pipe) {
    return { state: 'error', reason: 'Una tubería no transporta sólidos', fix: `Quita la tubería y pon ${need}` };
  }
  const line = pipe ? 'La tubería' : 'La cinta';
  if (p.io === 'out') {
    if (n.dir === opposite(p.dir)) return { state: 'error', reason: `Sentido contrario: ${line.toLowerCase()} va hacia el edificio`, fix: 'Gírala con R' };
  } else if (n.dir !== p.dir) {
    return {
      state: 'error',
      reason: n.dir === opposite(p.dir) ? `Sentido contrario: ${line.toLowerCase()} se aleja del edificio` : `${line} no apunta al edificio`,
      fix: 'Gírala con R para que entre en el edificio',
    };
  }
  if (pipe) {
    const have = Object.keys(n.inv).find((k) => (n.inv[k as ItemId] ?? 0) > 0) as ItemId | undefined;
    if (have && have !== p.flow) {
      return { state: 'error', reason: `La tubería lleva ${CONFIG.items[have]} y este puerto es de ${FLOW_NAMES[p.flow]}`, fix: 'Una red de tuberías sólo transporta un líquido: sepáralas' };
    }
  }
  // Conectado: ¿está parado? Salida con la línea llena, o entrada con el objeto esperando en el borde.
  const full = pipe ? Object.values(n.inv).reduce<number>((s, v) => s + (v ?? 0), 0) >= CONFIG.pipe.cap : n.item !== null && n.beltProgress >= 1;
  if (p.io === 'out' && full && hasAny(b.out)) {
    return { state: 'blocked', reason: 'La salida está llena y no avanza', fix: 'Mira el final de la línea: que llegue a una entrada con sitio' };
  }
  if (p.io === 'in' && full) {
    return { state: 'blocked', reason: 'Hay material esperando para entrar y no entra', fix: 'Comprueba que el edificio admita ese material y que tenga hueco' };
  }
  return { state: 'connected' };
}

/** Puertos de un edificio colocado con su estado. */
export function portsWithStatus(g: Game, b: Building): { port: Port; status: PortStatus }[] {
  return ports(b.kind, b.x, b.y, b.dir).map((port) => ({ port, status: portStatus(g, b, port) }));
}
