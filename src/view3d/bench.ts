/** Escenario de medición: mapa grande con cientos de edificios y enemigos (sólo para pruebas de rendimiento). */
import { Enemy, Game } from '../game/game';
import { BuildKind, EnemyKind, ENEMY_KINDS } from '../game/types';
import { mulberry32 } from '../game/rng';

export interface BenchOptions {
  objects: number;
  enemies: number;
  seed?: number;
}

const RUNS: BuildKind[] = ['belt', 'belt_fast', 'pipeline', 'wall_stone', 'wall_wood', 'wall_metal'];
const SINGLES: BuildKind[] = ['factory', 'house', 'storage', 'drill', 'generator', 'turret_bullet', 'turret_laser', 'solar', 'pole', 'workshop'];

/** Coloca `objects` edificios ya construidos (tiras de cinta/tubería/muro y edificios sueltos) y `enemies` enemigos. */
export function setupBench(game: Game, o: BenchOptions): { placed: number } {
  const rnd = mulberry32(o.seed ?? 3);
  const { w, h } = game.world;
  let placed = 0;
  const put = (kind: BuildKind, x: number, y: number, dir: 0 | 1 | 2 | 3) => {
    game.unlockedBuildings.add(kind);
    if (!game.canPlace(kind, x, y).ok) return false;
    const b = game.place(kind, x, y, dir);
    if (!b) return false;
    game.completeBuilding(b);
    placed++;
    return true;
  };
  let guard = 0;
  while (placed < o.objects && guard++ < o.objects * 20) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    if (rnd() < 0.7) {
      const kind = RUNS[Math.floor(rnd() * RUNS.length)];
      const horiz = rnd() < 0.5;
      const len = 4 + Math.floor(rnd() * 8);
      for (let i = 0; i < len && placed < o.objects; i++) put(kind, x + (horiz ? i : 0), y + (horiz ? 0 : i), horiz ? 0 : 1);
    } else put(SINGLES[Math.floor(rnd() * SINGLES.length)], x, y, 0);
  }
  // Algunas cintas con objetos encima para medir también eso.
  for (const b of game.buildings.values()) if ((b.kind === 'belt' || b.kind === 'belt_fast') && rnd() < 0.5) (b.item = 'iron_ore'), (b.beltProgress = rnd());
  for (let i = 0; i < o.enemies; i++) {
    const kind: EnemyKind = ENEMY_KINDS[i % ENEMY_KINDS.length];
    const x = rnd() * w;
    const y = rnd() * h;
    const e = {
      id: 100000 + i, kind, x, y, tx: x, ty: y, hp: 1e9, maxHp: 1e9, speed: 0, armor: 0, flying: kind === 'flyer',
      slowTimer: 0, slowFactor: 1, burnTimer: 0, burnDps: 0, attacking: null,
    } as unknown as Enemy;
    game.enemies.push(e);
  }
  return { placed };
}

/** Mueve los enemigos de la prueba en círculos pequeños para que animen y cambien de posición. */
export function wiggle(game: Game, t: number): void {
  for (const e of game.enemies) {
    if (e.id < 100000) continue;
    const a = t * 0.8 + e.id;
    e.x += Math.cos(a) * 0.02;
    e.y += Math.sin(a) * 0.02;
  }
}
