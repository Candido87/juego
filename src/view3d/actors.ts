/**
 * Qué hace y cómo se ve cada personaje, torreta y chimenea (lógica pura: sólo lee el juego).
 * La vista 3D traduce esto a animaciones, tintes y partículas.
 */
import { CONFIG } from '../game/config';
import type { Building, Enemy, Game } from '../game/game';
import type { Npc } from '../game/npc';
import type { ItemId, NpcRole, TurretKind } from '../game/types';
import { isWallKind } from '../view/muros';

/** Segundos quieto antes de pasar a la animación de trabajo o ataque (evita parpadeos al doblar esquinas). */
export const STILL_TIME = 0.25;

export type NpcAnim = 'walk' | 'idle' | 'work';
/** Animación de un NPC: anda si se mueve; si lleva un rato quieto con tarea, trabaja; si no, espera. */
export function npcAnim(n: Pick<Npc, 'jobId'>, moving: boolean, still: number): NpcAnim {
  if (moving) return 'walk';
  return n.jobId !== null && still >= STILL_TIME ? 'work' : 'idle';
}

/** Objeto que más lleva encima un NPC (para enseñarlo), o null si va de vacío. */
export function carried(n: Pick<Npc, 'carry'>): ItemId | null {
  let best: ItemId | null = null;
  let most = 0;
  for (const [item, q] of Object.entries(n.carry) as [ItemId, number][]) {
    if (q > most) {
      most = q;
      best = item;
    }
  }
  return best;
}

export type EnemyAnim = 'walk' | 'attack';
export interface EnemyLook {
  anim: EnemyAnim;
  slowed: boolean;
  burning: boolean;
  /** Velocidad de la animación de andar. */
  pace: number;
}
/** Estado visible de un enemigo: ataca si lleva un rato parado (su ruta está bloqueada o golpea algo). */
export function enemyLook(e: Pick<Enemy, 'kind' | 'slowTimer' | 'slowFactor' | 'burnTimer'>, moving: boolean, still: number): EnemyLook {
  const slowed = e.slowTimer > 0;
  const base = e.kind === 'runner' ? 1.4 : e.kind === 'tank' ? 0.7 : 1;
  return { anim: !moving && still >= STILL_TIME ? 'attack' : 'walk', slowed, burning: e.burnTimer > 0, pace: base * (slowed ? Math.max(0.3, e.slowFactor) : 1) };
}

/** Modelo y tinte de cada rol (el tinte los distingue de lejos, como los colores de la 2D). */
export const ROLE_LOOK: Record<NpcRole, { model: string; tint: number | null; scale: number }> = {
  constructor: { model: 'characters/character-worker', tint: null, scale: 0.9 },
  transporter: { model: 'characters/character-male-a', tint: 0xbfe0ff, scale: 0.9 },
  operator: { model: 'characters/character-female-a', tint: 0xfff0b0, scale: 0.88 },
  mechanic: { model: 'characters/character-soldier', tint: 0xffc890, scale: 0.92 },
  researcher: { model: 'characters/character-male-a', tint: 0xd9c2ff, scale: 0.9 },
};

/** Color propio de cada torreta (anillos de nivel, disparo y brillo). */
export const TURRET_COLOR: Record<TurretKind, number> = {
  turret_bullet: 0xffd060,
  turret_laser: 0x45e0ff,
  turret_fire: 0xff8030,
  turret_frost: 0x9fe8ff,
};

/** Color del misil (la lógica no tiene esta torreta; sólo se ve en la galería): fuego de su estela. */
export const MISSILE_COLOR = 0xffb060;

export interface TurretLook {
  level: number;
  /** Anillos de color apilados bajo el cañón (uno por nivel por encima del primero). */
  rings: number;
  /** Escala del cañón. */
  gunScale: number;
}
export function turretLook(game: Pick<Game, 'turretLevel'>, kind: TurretKind): TurretLook {
  const level = Math.max(1, Math.min(CONFIG.turretLevels.maxLevel, game.turretLevel[kind]));
  return { level, rings: level - 1, gunScale: 1 + 0.14 * (level - 1) };
}

export type TurretState = 'ready' | 'noammo' | 'nopower' | 'worn';
/** ¿Puede disparar la torreta ahora mismo? Si no, por qué. */
export function turretState(game: Game, b: Building): TurretState {
  const t = game.turretDef(b);
  if (t && t.energyPerShot > 0 && game.turretPower(b) <= 0) return 'nopower';
  if (!game.turretReady(b)) return 'noammo';
  if (game.wearFactor(b) <= 0) return 'worn';
  return 'ready';
}

export interface Smoke {
  /** Desplazamiento desde el centro del edificio, en casillas. */
  dx: number;
  dz: number;
  /** Bocanadas por segundo. */
  rate: number;
  color: number;
  size: number;
  /** Sale de lo alto del modelo (chimenea) o de media altura (daño). */
  fromTop: boolean;
  /** Además suelta chispas (edificio muy dañado). */
  sparks?: boolean;
}

/** Vida por debajo de la cual un edificio humea, y por debajo de la cual además chispea. */
export const DAMAGE_SMOKE = 0.5;
export const DAMAGE_SPARKS = 0.25;

/** Humos de un edificio en este momento: chimeneas de lo que está en marcha y humo negro de lo que está dañado. */
export function smokeSources(b: Building): Smoke[] {
  if (!b.built) return [];
  const out: Smoke[] = [];
  if (b.kind === 'factory' && b.recipe && b.craft > 0) out.push({ dx: 0.2, dz: -0.2, rate: 3, color: 0xd8dde4, size: 0.2, fromTop: true });
  else if (b.kind === 'refinery' && b.recipe && b.craft > 0) out.push({ dx: 0.3, dz: -0.3, rate: 6, color: 0x4a4a55, size: 0.26, fromTop: true });
  else if (b.kind === 'generator' && b.running) out.push({ dx: 0, dz: 0, rate: 4, color: 0x70707c, size: 0.2, fromTop: true });
  else if (b.kind === 'core') out.push({ dx: 0.55, dz: -0.55, rate: 1.5, color: 0xe6e9ee, size: 0.24, fromTop: true });
  const f = b.hp / b.maxHp;
  if (!isWallKind(b.kind) && f < DAMAGE_SMOKE) out.push({ dx: 0, dz: 0, rate: f < DAMAGE_SPARKS ? 6 : 3.5, color: 0x26262b, size: 0.24, fromTop: false, sparks: f < DAMAGE_SPARKS });
  return out;
}
