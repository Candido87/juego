/**
 * Calcula el registro de aspectos (src/view3d/aspectos.ts) a partir de las medidas SIN escalar (docs/escala/medidas-base.json) y
 * de los tamaños objetivo de CONFIG.scale: factor uniforme `f` (limitado por el ancho de la huella) y estiramiento vertical `sy`
 * para llegar a la altura objetivo. Muros: sólo `sy` (sus brazos deben seguir llegando al borde de la casilla).
 *   node tools/calcular-aspectos.cjs        (imprime la tabla; con --write reescribe aspectos.ts)
 */
const fs = require('fs');
const src = fs.readFileSync('src/game/config.ts', 'utf8');
const block = src.slice(src.indexOf('targets: {'), src.indexOf('} as Record<string, { w?: number; h?: number }>'));
const targets = {};
for (const m of block.matchAll(/(\w+): \{ ([^}]*) \}/g)) {
  const t = {};
  for (const kv of m[2].split(',')) {
    const [k, v] = kv.split(':').map((x) => x.trim());
    if (k) t[k] = Number(v);
  }
  targets[m[1]] = t;
}
const fill = Number((src.match(/fill: ([0-9.]+)/) || [])[1] || 0.95);
const rows = JSON.parse(fs.readFileSync('docs/escala/medidas-base.json', 'utf8'));
const NO = /^(belt|pipeline|item_|turret_|pole|elevator$|rock_|plant_)/;
const SY_MAX = 2.6;
const out = {};
const seen = new Set();
const r2 = (n) => Math.round(n * 100) / 100;
for (const r of rows) {
  if (r.cat === 'huella' || seen.has(r.key) || NO.test(r.key)) continue;
  seen.add(r.key);
  const t = targets[r.key];
  if (!t || !t.h) continue;
  const wall = r.key.startsWith('wall_');
  const cap = r.cat === 'edificio' ? fill * Math.max(...r.cell) : Infinity;
  const width = Math.max(r.w, r.d);
  let f = wall ? 1 : Math.min(t.h / r.h, cap / width);
  if (r.cat === 'decoración') f = Math.min(t.h / r.h, 1.0 / 0.01);
  let sy = t.h / (r.h * f);
  sy = wall ? sy : Math.min(Math.max(sy, 1), SY_MAX);
  if (Math.abs(sy - 1) < 0.03) sy = 1;
  out[r.key] = { f: r2(f), ...(sy !== 1 ? { sy: r2(sy) } : {}) };
}
const lines = Object.entries(out).map(([k, v]) => `  ${k}: { f: ${v.f}${v.sy ? `, sy: ${v.sy}` : ''} },`);
const body = `/**
 * Registro de aspectos: el factor de escala de cada modelo, en un único sitio (no repartido por el código).
 * \`f\` multiplica el modelo entero (uniforme); \`sy\` lo estira en vertical para llegar a la altura objetivo cuando el ancho de la
 * huella ya no deja crecer más. Las claves son el tipo de edificio, \`npc_<rol>\`, \`enemy_<tipo>\` y el nombre del modelo de árbol.
 * Los valores salen de \`node tools/calcular-aspectos.cjs --write\` (medidas sin escalar de \`docs/escala/medidas-base.json\` y los
 * objetivos de \`CONFIG.scale.targets\`); se pueden retocar a mano. Cintas, tuberías, postes y torretas no entran: se construyen ya a medida.
 */
export const ASPECTOS: Record<string, { f: number; sy?: number }> = {
${lines.join('\n')}
};

/** Factor uniforme de un modelo (1 si no está registrado). */
export const aspectF = (key: string): number => ASPECTOS[key]?.f ?? 1;
/** Estiramiento vertical adicional de un modelo (1 si no hay). */
export const aspectSy = (key: string): number => ASPECTOS[key]?.sy ?? 1;
`;
if (process.argv.includes('--write')) fs.writeFileSync('src/view3d/aspectos.ts', body);
for (const [k, v] of Object.entries(out)) {
  const r = rows.find((x) => x.key === k);
  console.log(k.padEnd(16), JSON.stringify(v).padEnd(22), 'ancho', r2(Math.max(r.w, r.d) * v.f), 'alto', r2(r.h * v.f * (v.sy ?? 1)), 'obj', targets[k].h);
}
