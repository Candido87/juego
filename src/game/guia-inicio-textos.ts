/**
 * Textos de la guía de inicio (español). Archivo aparte del motor; las cifras salen de `config.ts`, así que
 * se mantienen al día cuando cambian costes, recetas o ritmos.
 * Clave = id del paso en `guia-inicio.ts`.
 */
import { CONFIG } from './config';
import { formatClock } from './format';
import type { Game } from './game';
import { GuiaStep, shortage } from './guia-inicio';

export interface GuiaText {
  title: string;
  text: string;
}

const ITEM_NAMES = CONFIG.items as Record<string, string>;

/** "1 bastidor y 2 engranajes" a partir de un coste. */
export function costText(cost: Record<string, number>): string {
  const parts = Object.entries(cost).map(([i, n]) => `${n}× ${(ITEM_NAMES[i] ?? i).toLowerCase()}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0] ?? 'nada';
}

const costOf = (kind: keyof typeof CONFIG.buildings) => costText(CONFIG.buildings[kind].cost as Record<string, number>);
const recipeIn = (id: string) => costText(CONFIG.recipes[id].inputs as Record<string, number>);
const recipeOut = (id: string) => costText(CONFIG.recipes[id].outputs as Record<string, number>);
const perMinute = () => Math.round(60 / CONFIG.drill.period);

/** Texto de cada paso. Recibe el juego para poder dar cifras vivas (tiempo que queda, población...). */
export const GUIA_TEXT: Record<string, (g: Game) => GuiaText> = {
  drill_iron: () => ({
    title: 'Saca hierro',
    text: `Construye un taladro sobre el yacimiento de hierro (gris claro). Cuesta ${costOf('drill')} y extrae unos ${perMinute()} minerales por minuto.`,
  }),
  storage: () => ({
    title: 'Un almacén cerca',
    text: `Construye un almacén junto al taladro (${costOf('storage')}). Sin electricidad, tu Transportista lleva el hierro a mano hasta el almacén.`,
  }),
  factory_plates: () => ({
    title: 'Fábrica de placas',
    text: `Construye una fábrica (${costOf('factory')}), haz clic en ella y elige la receta Placa de hierro: ${recipeIn('iron_plate')} → ${recipeOut('iron_plate')}.`,
  }),
  farm: (g) => ({
    title: 'Comida',
    text: `Tienes ${g.population} personas y comen sin parar. Construye una granja (${costOf('farm')}) antes de que se acabe la comida.`,
  }),
  drill_sulfur: () => ({
    title: 'Azufre',
    text: `Construye un taladro (${costOf('drill')}) sobre un yacimiento de azufre (amarillo): la munición se fabrica con ${recipeIn('ammo')}.`,
  }),
  drill_stone: () => ({
    title: 'Piedra o carbón',
    text: `Construye otro taladro (${costOf('drill')}) sobre piedra: hace falta para los mecanismos de torreta (${recipeIn('gun_part')}) y los ladrillos.`,
  }),
  factory_ammo: () => ({
    title: 'Fábrica de munición',
    text: `Construye otra fábrica y elige la receta Munición: ${recipeIn('ammo')} → ${recipeOut('ammo')}. La torreta de balas la gasta al disparar.`,
  }),
  factory_gun: () => ({
    title: 'Mecanismos de torreta',
    text: `Construye otra fábrica y elige la receta Mecanismo de torreta: ${recipeIn('gun_part')} → ${recipeOut('gun_part')}. Hace falta uno por torreta.`,
  }),
  turret: () => ({
    title: 'Tu primera torreta',
    text: `Construye una torreta de balas (${costOf('turret_bullet')}) en el camino de los enemigos y comprueba que tiene munición: sin ella no dispara.`,
  }),
  wave_soon: (g) => ({
    title: `La oleada llega en ${formatClock(g.nextWaveIn)}`,
    text: 'Comprueba: ① hay una torreta con munición (si no, un Transportista debe llevársela), ② está en el camino hacia el núcleo, ③ tienes comida. Puedes seguir construyendo.',
  }),
  wave_now: () => ({
    title: '¡Oleada en curso!',
    text: 'Haz clic en una torreta para ver su munición y su desgaste. Tus Mecánicos reparan lo dañado cuando termine el ataque.',
  }),
  next: () => ({
    title: 'Y ahora…',
    text: `Construye un taller (${costOf('workshop')}) para reparar, luego petróleo y gasolina para tener electricidad, y por último el laboratorio y el árbol de tecnología (T).`,
  }),
};

/** Aviso corto al cumplir un paso. */
export const GUIA_DONE: Record<string, string> = {
  drill_iron: '¡Taladro en marcha!',
  storage: 'El hierro ya llega al almacén',
  factory_plates: 'Fábrica de placas lista',
  farm: 'Granja construida',
  drill_sulfur: 'Azufre en camino',
  drill_stone: 'Piedra en camino',
  factory_ammo: 'Munición en producción',
  factory_gun: 'Mecanismos en producción',
  turret: 'Torreta lista para disparar',
  wave_soon: 'Oleada en marcha',
  wave_now: '¡Oleada superada!',
  next: 'Buen comienzo',
};

/** Textos extra de ayuda cuando falta un recurso para el paso ("te falta ..."). */
export function guiaShortage(g: Game, st: GuiaStep): string {
  const miss = shortage(g, st);
  const entries = Object.entries(miss);
  if (!entries.length) return '';
  return `Te falta: ${costText(miss)}. Fabrícalo en una Fábrica.`;
}

/** Texto completo (título, cuerpo y, si procede, lo que falta). */
export function guiaText(g: Game, st: GuiaStep): GuiaText & { missing: string } {
  const t = GUIA_TEXT[st.id](g);
  return { ...t, missing: guiaShortage(g, st) };
}
