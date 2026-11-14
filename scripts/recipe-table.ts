/** Imprime la tabla de recetas en Markdown (para pegarla en SPEC.md): `npx vite-node scripts/recipe-table.ts`. */
import { CONFIG, RECIPE_CATEGORIES } from '../src/game/config';

const name = (i: string) => (CONFIG.items as Record<string, string>)[i] ?? i;
const bag = (b: Record<string, number | undefined>) =>
  Object.entries(b)
    .map(([i, n]) => `${n} ${name(i)}`)
    .join(' + ');

const lines = ['| Categoría | Receta | Entradas | Salida | Tiempo | Edificio | Nivel |', '|---|---|---|---|---|---|---|'];
for (const c of RECIPE_CATEGORIES) {
  for (const [id, r] of Object.entries(CONFIG.recipes).filter(([, x]) => x.category === c.id)) {
    lines.push(`| ${c.name} | ${r.name} (\`${id}\`) | ${bag(r.inputs)} | ${bag(r.outputs)} | ${r.time} s | ${r.building ?? 'factory'} | ${r.tier} |`);
  }
}
console.log(lines.join('\n'));
