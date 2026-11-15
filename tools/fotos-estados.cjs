/**
 * Fotos de los estados de las torretas (normal, apagada, en obra, dañada, muy dañada) para `docs/torretas/estados.png`.
 * Necesita el servidor de desarrollo de esta rama en el puerto 5183 (`GAL_PORT`). Uso: `node tools/fotos-estados.cjs`.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const D = 'docs/torretas';
const GAL = `http://localhost:${process.env.GAL_PORT || 5183}`;
const STATES = ['normal', 'apagada', 'en obra', 'dañada', 'muy dañada'];
const run = (url, shots, w, h, wait) =>
  spawnSync('npx', ['electron', 'tools/captura.cjs'], { shell: true, encoding: 'utf8', env: { ...process.env, CAP_URL: url, CAP_SHOTS: JSON.stringify(shots), CAP_W: String(w), CAP_H: String(h), CAP_WAIT: String(wait) } });
// Cada estado con los cinco tipos del nivel 2. Se deja pasar un rato para que el humo y los pilotos se vean.
const shots = STATES.map((s, i) => ({
  out: `${D}/estado-${i}.png`,
  js: `window.__gal.state(${JSON.stringify(s)});window.__gal.aim(40);window.__gal.view(45,1.3);new Promise(r=>setTimeout(()=>{for(let i=0;i<150;i++)window.__gal.render();r(1)},300))`,
  wait: 500,
}));
run(`${GAL}/galeria-torretas.html?nivel=2&limpio=1`, shots, 920, 480, 6000);
const cell = (i) => `<div class="c"><img src="estado-${i}.png"><span>${STATES[i]}</span></div>`;
fs.writeFileSync(`${D}/estados.html`, `<!doctype html><meta charset="utf-8"><title>Estados de las torretas</title>
<style>body{margin:0;background:#1d2330;color:#e8ecf2;font:13px system-ui,sans-serif;padding:10px 14px}h2{margin:0 0 8px;font-size:15px}.row{display:grid;grid-template-columns:repeat(2,620px);gap:6px}.c{width:620px;height:324px;overflow:hidden;border-radius:5px;background:#9fd0e8;position:relative}.c img{width:100%;height:100%;object-fit:cover;transform:scale(1.8);transform-origin:50% 52%}.c span{position:absolute;left:5px;top:4px;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:3px;font-size:12px}</style>
<h2>Estados (nivel 2): balas, láser, lanzallamas, hielo y misil, de atrás hacia delante</h2><div class="row">${STATES.map((_, i) => cell(i)).join('')}</div>`);
run(`${GAL}/docs/torretas/estados.html`, [{ out: `${D}/estados.png` }], 1290, 1010, 2500);
for (let i = 0; i < STATES.length; i++) fs.rmSync(`${D}/estado-${i}.png`, { force: true });
fs.rmSync(`${D}/estados.html`, { force: true });
console.log('listo: docs/torretas/estados.png');
