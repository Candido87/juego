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
    text: `Construye un taladro sobre el yacimiento de hierro (gris claro). Cuesta ${costOf('drill')} y extrae unos ${perMinute()} minerales por minuto. Fíjate en la flecha: marca por dónde sale el mineral.`,
  }),
  storage: () => ({
    title: 'Un almacén cerca',
    text: `Construye un almacén cerca del taladro (${costOf('storage')}). Es el destino de las cintas: lo que llegue queda guardado.`,
  }),
  belt_connect: () => ({
    title: 'Cintas: une el taladro con el almacén',
    text: `Los materiales sólidos se mueven con cintas (${costOf('belt')} cada una). ① Elige Cinta en la categoría Transporte. ② Haz clic en cada casilla, o mantén Mayús y arrastra para dibujar el recorrido. ③ R gira el sentido; las flechas indican hacia dónde va. Conecta la flecha de salida del taladro con el almacén: se marca una ruta de ejemplo. Atajo: con Conectar (V) pulsas la salida y luego la entrada y la ruta se traza sola. Las luces de los puertos avisan: verde conectado, rojo error, naranja bloqueado; L activa la vista de logística.`,
  }),
  power_gen: () => ({
    title: 'Energía: un generador',
    text: `Las cintas necesitan electricidad: sin ella no se mueven (y los Transportistas llevan el material a mano). Construye un generador (${costOf('generator')}). Quema gasolina y ya tienes ${CONFIG.startItems.gasoline ?? 0} de inicio.`,
  }),
  power_fuel: () => ({
    title: 'Arranca el generador',
    text: 'Tu Transportista le lleva la gasolina inicial y un Operario lo arranca; tarda unos segundos. Cuando se queda sin gasolina se para y la energía vuelve a 0: por eso luego haremos gasolina propia.',
  }),
  power_poles: () => ({
    title: 'Postes: lleva la energía',
    text: `Los postes (${costOf('pole')}) llevan la energía. Cada edificio se conecta al poste que tenga a ${CONFIG.power.supplyRadius} casillas o menos, y los postes se enlazan entre sí hasta ${CONFIG.power.wireRange} casillas (se marca el alcance). Cubre el generador, las cintas y el taladro y mira el panel de Energía del HUD: debe pasar de 0/0 a producción/consumo. Si se consume más de lo que se produce, todo va más lento; sin gasolina, se para.`,
  }),
  belt_flow: () => ({
    title: 'Comprueba que el hierro llega',
    text: 'Con energía, la cinta lleva el hierro hasta el almacén por sí sola. Espera a ver llegar el primer mineral. Si no se mueve, se te avisará de por qué (sentido contrario, sin poste, sin gasolina...).',
  }),
  farm: (g) => ({
    title: 'Comida',
    text: `Tienes ${g.population} personas y comen sin parar. Construye una granja (${costOf('farm')}) antes de que se acabe la comida.`,
  }),
  turret: () => ({
    title: 'Tu primera torreta',
    text: `Construye una torreta de balas (${costOf('turret_bullet')}) en el camino de los enemigos y comprueba que tiene munición: sin ella no dispara. Un Transportista se la lleva; más adelante la automatizaremos con cintas.`,
  }),
  lab_build: () => ({
    title: 'Un laboratorio para investigar',
    text: `Construye un laboratorio (${costOf('laboratory')}) en Servicios y conéctalo a la red con un poste: sin energía no produce. Las tecnologías (más torretas, muros, recetas y mejoras) se compran con los puntos que genera.`,
  }),
  lab_staff: (g) => ({
    title: 'Asigna un Investigador',
    text: `El laboratorio sólo produce con Investigadores: personas de tu población que dejan de hacer otras tareas (y comen igual). Pulsa +1 en la fila "Investigador" del panel de personas: cada uno da ${CONFIG.research.pointsPerResearcher} puntos por minuto. Con pocos habitantes es una decisión seria; más casas y comida permiten investigar más rápido.${g.researcherBlock() ? ` Ahora no se puede: ${g.researcherBlock()}.` : ''}`,
  }),
  tech_first: (g) => ({
    title: 'Tu primera tecnología',
    text: `Abre Investigación (T) y compra la más barata que tengas disponible (${Math.floor(g.researchPoints)} puntos ahora, ${g.pointsPerMinute().toFixed(1)} por minuto). La marcada con ★ es la recomendada. Se desbloquea al instante.`,
  }),
  oil_pump: () => ({
    title: 'Petróleo: la bomba',
    text: `La gasolina viene del petróleo. Construye una bomba (${costOf('pump')}) sobre el yacimiento oscuro marcado. Necesita electricidad (sin ella va a la mitad de ritmo).`,
  }),
  oil_refine: () => ({
    title: 'Tuberías: bomba → refinería',
    text: `Los líquidos no van en cinta: van por tuberías (${costOf('pipeline')} cada una, sin electricidad; se colocan y giran como las cintas). Construye una refinería (${costOf('refinery')}) cerca y une la salida de la bomba con su entrada con tuberías (flechas celestes). La bomba y la refinería sí usan electricidad.`,
  }),
  oil_fuel: () => ({
    title: 'Tuberías: refinería → generador',
    text: 'Tiende otra tubería desde la salida de la refinería hasta el generador: así se alimenta solo con gasolina propia. Se completa cuando el generador recibe gasolina refinada. Si no sale nada, comprueba que la bomba y la refinería tienen energía.',
  }),
  factory_plates: () => ({
    title: 'Fábrica de placas',
    text: `Construye una fábrica (${costOf('factory')}), haz clic en ella y elige la receta Placa de hierro: ${recipeIn('iron_plate')} → ${recipeOut('iron_plate')}.`,
  }),
  chain_plates: () => ({
    title: 'Cadena: taladro → cinta → fábrica → almacén',
    text: 'Construye un segundo taladro de hierro (sin cinta al almacén) y llévalo con cinta hasta la entrada de la fábrica de placas; luego saca las placas con otra cinta hasta el almacén. Los edificios de producción no se pasan material por sí solos, aunque estén juntos: siempre con cinta.',
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
  chain_ammo: () => ({
    title: 'Munición por cinta hasta la torreta',
    text: 'Une la salida de la fábrica de munición con una torreta mediante cintas: así no depende de nadie que se la lleve a mano. Se completa cuando llega munición a la torreta por la cinta.',
  }),
  walls: () => ({
    title: 'Muros',
    text: `Construye un muro (${costOf('wall_wood')}) en el camino enemigo, delante de la torreta: los enemigos se paran a romperlo mientras disparas.`,
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
    text: `Construye un taller (${costOf('workshop')}) para reparar, y luego el laboratorio y el árbol de tecnología (T).`,
  }),
};

/** Aviso corto al cumplir un paso. */
export const GUIA_DONE: Record<string, string> = {
  drill_iron: '¡Taladro en marcha!',
  storage: 'Almacén listo',
  belt_connect: 'Cinta conectada',
  power_gen: 'Generador construido',
  power_fuel: 'Generador en marcha',
  power_poles: '¡Hay energía en la red!',
  belt_flow: 'El hierro llega por la cinta',
  farm: 'Granja construida',
  turret: 'Torreta lista para disparar',
  lab_build: 'Laboratorio construido',
  lab_staff: 'Ya hay un Investigador trabajando',
  tech_first: 'Primera tecnología investigada',
  oil_pump: 'Bomba sobre el petróleo',
  oil_refine: 'El petróleo llega a la refinería',
  oil_fuel: 'Gasolina propia para el generador',
  factory_plates: 'Fábrica de placas lista',
  chain_plates: 'Cadena de placas completa',
  drill_sulfur: 'Azufre en camino',
  drill_stone: 'Piedra en camino',
  factory_ammo: 'Munición en producción',
  factory_gun: 'Mecanismos en producción',
  chain_ammo: 'La munición llega sola a la torreta',
  walls: 'Muro levantado',
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
