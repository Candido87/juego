/**
 * Jugador automático que sigue la guía de inicio paso a paso (para tests y `npm run sim`).
 * Sólo usa la API pública del juego y los helpers del bot sencillo.
 */
import { placeBestTurret, placeNear, placeNextToCore } from './bot';
import { Game } from './game';
import { GuiaState, currentStep, setGuiaFlag } from './guia-inicio';
import { BuildKind, Ore, Tile } from './types';
import { oreAt } from './world';

function oreTiles(g: Game, ores: Ore[]): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < g.world.h; y++) for (let x = 0; x < g.world.w; x++) if (ores.includes(oreAt(g.world, x, y))) out.push({ x, y });
  const cx = g.core.x + 1;
  const cy = g.core.y + 1;
  return out.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

const count = (g: Game, kind: BuildKind, recipe?: string) => [...g.buildings.values()].filter((b) => b.kind === kind && (!recipe || b.recipe === recipe)).length;

function placeDrill(g: Game, ores: Ore[]): void {
  // Sólo uno por tipo de mena (ya sea en obra o construido).
  if ([...g.buildings.values()].some((b) => b.kind === 'drill' && ores.includes(oreAt(g.world, b.x, b.y)))) return;
  const t = oreTiles(g, ores).find((o) => g.canPlace('drill', o.x, o.y).ok && !g.buildingAt(o.x, o.y));
  if (t) g.place('drill', t.x, t.y, 0);
}

/** Pone una fábrica con la receta pedida (si ya hay una sin receta, se la da). */
function placeFactory(g: Game, recipe: string): void {
  if (count(g, 'factory', recipe) > 0) return;
  const idle = [...g.buildings.values()].find((b) => b.kind === 'factory' && !b.recipe);
  if (idle) {
    g.setRecipe(idle.id, recipe);
    return;
  }
  placeNextToCore(g, 'factory', recipe) || placeNear(g, 'factory');
  const f = [...g.buildings.values()].find((b) => b.kind === 'factory' && !b.recipe);
  if (f) g.setRecipe(f.id, recipe);
}

/** Hace como mucho una acción según el paso actual de la guía. */
export function guiaBotTick(g: Game, s: GuiaState): void {
  const st = currentStep(g, s);
  if (!st) return;
  switch (st.id) {
    case 'drill_iron':
      placeDrill(g, [Ore.Iron]);
      break;
    case 'storage':
      if (count(g, 'storage') === 0) placeNear(g, 'storage');
      break;
    case 'factory_plates':
    case 'factory_ammo':
    case 'factory_gun':
      placeFactory(g, st.recipe!);
      break;
    case 'farm':
      if (count(g, 'farm') === 0) placeNextToCore(g, 'farm');
      break;
    case 'drill_sulfur':
      placeDrill(g, [Ore.Sulfur]);
      break;
    case 'drill_stone':
      placeDrill(g, [Ore.Stone]);
      break;
    case 'turret':
      if (count(g, 'turret_bullet') === 0) placeBestTurret(g, 'turret_bullet');
      break;
    case 'next':
      setGuiaFlag(s, 'next_ack');
      break;
    default:
      break;
  }
}
