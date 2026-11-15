/**
 * Registro de aspectos: el factor de escala de cada modelo, en un único sitio (no repartido por el código).
 * `f` multiplica el modelo entero (uniforme); `sy` lo estira en vertical para llegar a la altura objetivo cuando el ancho de la
 * huella ya no deja crecer más. Las claves son el tipo de edificio, `npc_<rol>`, `enemy_<tipo>` y el nombre del modelo de árbol.
 * Los valores salen de `node tools/calcular-aspectos.cjs --write` (medidas sin escalar de `docs/escala/medidas-base.json` y los
 * objetivos de `CONFIG.scale.targets`); se pueden retocar a mano. Cintas, tuberías, postes y torretas no entran: se construyen ya a medida.
 */
// <generado>
export const ASPECTOS: Record<string, { f: number; sy?: number }> = {
  npc_constructor: { f: 0.64 },
  npc_transporter: { f: 0.79 },
  npc_operator: { f: 0.7 },
  npc_mechanic: { f: 0.69 },
  npc_researcher: { f: 0.79 },
  enemy_grunt: { f: 0.74 },
  enemy_runner: { f: 0.7 },
  enemy_armored: { f: 0.63 },
  enemy_flyer: { f: 0.74 },
  enemy_tank: { f: 0.63 },
  drill: { f: 1.06 },
  storage: { f: 1, sy: 2.24 },
  factory: { f: 0.86 },
  farm: { f: 0.85 },
  pump: { f: 0.9 },
  refinery: { f: 0.99 },
  workshop: { f: 1, sy: 2.13 },
  laboratory: { f: 1, sy: 1.27 },
  house: { f: 1, sy: 1.64 },
  generator: { f: 0.99 },
  solar: { f: 1, sy: 1.46 },
  turbine: { f: 0.87 },
  accumulator: { f: 1.01 },
  feeder: { f: 0.96 },
  core: { f: 1.06, sy: 1.33 },
  tree_default: { f: 0.76 },
  tree_oak: { f: 0.94 },
  tree_pineTallA: { f: 0.89 },
  tree_fat: { f: 0.83 },
  tree_cone: { f: 0.73 },
  wall_wood: { f: 1, sy: 0.78 },
  wall_stone: { f: 1, sy: 0.72 },
  wall_metal: { f: 1, sy: 0.68 },
  wall_gate: { f: 1, sy: 0.69 },
};
// </generado>

/** Factor uniforme de un modelo (1 si no está registrado). */
export const aspectF = (key: string): number => ASPECTOS[key]?.f ?? 1;
/** Estiramiento vertical adicional de un modelo (1 si no hay). */
export const aspectSy = (key: string): number => ASPECTOS[key]?.sy ?? 1;

/**
 * Piezas de cinta del Factory Kit de Kenney (CC0): qué modelo se usa para cada forma y sus medidas originales [largo (eje del
 * flujo, x), alto, ancho]. La escala de cada pieza sale de CONFIG.scale (cinta de ancho beltWidth y alto beltHeight, 1 casilla
 * de largo): escalaPieza da el factor por eje. Curvas, T y cruces se componen con medios tramos de la pieza recta y la pieza
 * hub (el cruce a escala) en el centro, porque los modelos de curva y T sólo encajan a ancho completo.
 */
export const CINTA_PIEZAS = {
  normal: { recta: 'factory/conveyor-sides', hub: 'factory/conveyor-sides-cross' },
  rapida: { recta: 'factory/conveyor-stripe-sides', hub: 'factory/conveyor-stripe-sides-cross' },
} as const;
export const CINTA_NATIVO: Record<string, [number, number, number]> = {
  'factory/conveyor-sides': [1, 0.4, 1],
  'factory/conveyor-stripe-sides': [1, 0.4, 1],
  'factory/conveyor-sides-cross': [1, 0.4, 1],
  'factory/conveyor-stripe-sides-cross': [1, 0.4, 1],
};
/** Escala por eje [largo, alto, ancho] de una pieza de cinta para que mida beltHeight de alto y beltWidth de ancho. */
export function escalaPieza(model: string, beltWidth: number, beltHeight: number): [number, number, number] {
  const n = CINTA_NATIVO[model] ?? [1, beltHeight, beltWidth];
  return [1, beltHeight / n[1], beltWidth / n[2]];
}
