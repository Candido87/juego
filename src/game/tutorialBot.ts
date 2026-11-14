/**
 * Jugador automático que hace lo que pide cada paso del tutorial. Sirve para comprobar que el tutorial
 * se puede completar de principio a fin sin quedarse atascado. Sólo usa la API pública del juego.
 */
import { placeBestTurret, placeNear, placeNextToCore } from './bot';
import { Game } from './game';
import { TutorialState, setFlag, stepAt } from './tutorial';
import { BuildKind, Ore, Tile } from './types';
import { inBounds, oreAt } from './world';

/** Casillas con mena `ore`, de la más cercana al núcleo a la más lejana. */
function oreTiles(g: Game, ore: Ore): Tile[] {
  const out: Tile[] = [];
  const { w, h } = g.world;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (oreAt(g.world, x, y) === ore) out.push({ x, y });
  const cx = g.core.x + 1;
  const cy = g.core.y + 1;
  return out.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

const count = (g: Game, kind: BuildKind): number => [...g.buildings.values()].filter((b) => b.kind === kind).length;

/** Primera casilla libre a ≤ r (Chebyshev) de (x,y) donde se pueda colocar `kind`. */
function freeNear(g: Game, kind: BuildKind, x: number, y: number, r: number): Tile | null {
  for (let d = 1; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const t = { x: x + dx, y: y + dy };
        if (inBounds(g.world, t.x, t.y) && g.canPlace(kind, t.x, t.y).ok) return t;
      }
    }
  }
  return null;
}

/** Hace como mucho una acción según el paso actual. */
export function tutorialBotTick(g: Game, s: TutorialState): void {
  const id = stepAt(s)?.id;
  switch (id) {
    case 'camera':
      setFlag(s, 'camera_moved');
      setFlag(s, 'zoomed');
      break;
    case 'tool':
      setFlag(s, 'tool_selected');
      break;
    case 'drill':
      if (count(g, 'drill') === 0) {
        const t = oreTiles(g, Ore.Iron).find((o) => g.canPlace('drill', o.x, o.y).ok);
        if (t) g.place('drill', t.x, t.y, 0);
      }
      break;
    case 'components':
      if (count(g, 'factory') === 0) placeNextToCore(g, 'factory', 'gear');
      break;
    case 'belts':
      if (count(g, 'belt') === 0) placeNear(g, 'belt');
      break;
    case 'oil':
      if (count(g, 'pump') === 0) {
        const t = oreTiles(g, Ore.Oil).find((o) => g.canPlace('pump', o.x, o.y).ok);
        if (t) g.place('pump', t.x, t.y, 0);
      }
      if (count(g, 'refinery') === 0) placeNear(g, 'refinery');
      break;
    case 'power': {
      const belt = [...g.buildings.values()].find((b) => b.kind === 'belt');
      if (!belt) break;
      if (count(g, 'pole') === 0) {
        const t = freeNear(g, 'pole', belt.x, belt.y, 2);
        if (t) g.place('pole', t.x, t.y);
      }
      const pole = [...g.buildings.values()].find((b) => b.kind === 'pole');
      if (pole && count(g, 'generator') === 0) {
        const t = freeNear(g, 'generator', pole.x, pole.y, 2);
        if (t) g.place('generator', t.x, t.y);
      }
      break;
    }
    case 'food':
      if (count(g, 'farm') === 0) placeNextToCore(g, 'farm');
      if (count(g, 'house') === 0) placeNear(g, 'house');
      break;
    case 'turret':
      if (count(g, 'turret_bullet') === 0) placeBestTurret(g, 'turret_bullet');
      break;
    case 'walls':
      if (![...g.buildings.values()].some((b) => b.kind.startsWith('wall_'))) placeNear(g, 'wall_wood');
      break;
    case 'workshop':
      if (count(g, 'workshop') === 0) placeNear(g, 'workshop');
      break;
    case 'finish':
      setFlag(s, 'finish');
      break;
    default:
      break; // 'manual' y 'wave': sólo esperar
  }
}
