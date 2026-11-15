/**
 * Fotos de los efectos de disparo de los cinco tipos (balas, láser, lanzallamas, hielo y misil) en tres instantes
 * seguidos, para `docs/torretas/disparos.png`. Necesita el servidor de esta rama en el puerto 5183 (`GAL_PORT`).
 * Uso: `node tools/fotos-disparos.cjs`.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const D = 'docs/torretas';
const GAL = `http://localhost:${process.env.GAL_PORT || 5183}`;
const run = (url, shots, w, h, wait) =>
  spawnSync('npx', ['electron', 'tools/captura.cjs'], { shell: true, encoding: 'utf8', env: { ...process.env, CAP_URL: url, CAP_SHOTS: JSON.stringify(shots), CAP_W: String(w), CAP_H: String(h), CAP_WAIT: String(wait) } });
const R = (n) => `for(let i=0;i<${n};i++)window.__gal.render()`;
const shots = [
  { out: `${D}/disparo-0.png`, js: `window.__gal.pause(true);window.__gal.aim(135);window.__gal.view(45,1.25);${R(2)};window.__gal.fire();${R(8)}`, wait: 300 },
  { out: `${D}/disparo-1.png`, js: R(12), wait: 300 },
  { out: `${D}/disparo-2.png`, js: R(24), wait: 300 },
];
run(`${GAL}/galeria-torretas.html?nivel=2&limpio=1`, shots, 900, 520, 6000);
const names = ['recién disparado (0,13 s)', 'en vuelo (0,33 s)', 'impacto (0,73 s)'];
fs.writeFileSync(`${D}/disparos.html`, `<!doctype html><meta charset="utf-8"><title>Disparos</title>
<style>body{margin:0;background:#1d2330;color:#e8ecf2;font:13px system-ui,sans-serif;padding:10px 14px}h2{margin:0 0 8px;font-size:15px}.row{display:grid;grid-template-columns:repeat(2,620px);gap:6px}.c{width:620px;height:360px;overflow:hidden;border-radius:5px;background:#9fd0e8;position:relative}.c img{width:100%;height:100%;object-fit:cover}.c span{position:absolute;left:5px;top:4px;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:3px;font-size:12px}</style>
<h2>Efectos de disparo (balas, láser, lanzallamas, hielo y misil, de atrás hacia delante)</h2><div class="row">${names.map((n, i) => `<div class="c"><img src="disparo-${i}.png"><span>${n}</span></div>`).join('')}</div>`);
run(`${GAL}/docs/torretas/disparos.html`, [{ out: `${D}/disparos.png` }], 1290, 780, 2500);
for (let i = 0; i < 3; i++) fs.rmSync(`${D}/disparo-${i}.png`, { force: true });
fs.rmSync(`${D}/disparos.html`, { force: true });
console.log('listo: docs/torretas/disparos.png');
