/**
 * Genera docs/escala/informe.md (tabla modelo / tamaño actual / tamaño objetivo / factor de escala) a partir de
 * docs/escala/medidas.json (salida de `__esc.report()` en la galería de escala) y de los objetivos de `CONFIG.scale.targets`.
 *   node tools/informe-escala.cjs
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
const rows = JSON.parse(fs.readFileSync('docs/escala/medidas.json', 'utf8'));
const seen = new Set();
const out = ['| Tipo | Modelo | Tamaño actual (ancho × fondo × alto) | Tamaño objetivo | Factor de escala | Base (y mín.) |', '|---|---|---|---|---|---|'];
const line = (a) => out.push(`| ${a.join(' | ')} |`);
const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
for (const r of rows) {
  if (r.cat === 'huella' || seen.has(r.key)) continue;
  seen.add(r.key);
  const t = targets[r.key];
  const linear = /^(belt|pipeline)/.test(r.key);
  const cross = linear ? Math.min(r.w, r.d) : Math.max(r.w, r.d);
  const parts = [];
  const fac = [];
  if (t?.w) {
    parts.push(`ancho ${t.w}`);
    fac.push(`${linear ? 'sección' : 'ancho'} ×${f(t.w / cross)}`);
  }
  if (t?.h) {
    parts.push(`alto ${t.h}`);
    fac.push(`alto ×${f(t.h / r.h)}`);
  }
  line([r.cat, r.name, `${r.w} × ${r.d} × ${r.h}`, t ? parts.join(', ') : '— (sin objetivo)', t ? fac.join(', ') : '—', r.minY < -0.001 ? `**${r.minY}** (hundida)` : String(r.minY)]);
}
fs.writeFileSync('docs/escala/informe.md', `# Informe de escala (Hito 0)\n\nUnidad: **1 casilla = 1 unidad de Three.js** (\`CONFIG.scale.unit\`). Medidas en casillas, tomadas con \`__esc.report()\` en la galería de escala (cajas envolventes del modelo ya colocado como en el juego).\n\n${out.join('\n')}\n`);
console.log(out.length - 2, 'filas');
