/**
 * Saca el juego de fotos de un tipo de torreta para `docs/torretas/` (herramienta de desarrollo).
 *
 *   node tools/fotos-torreta.cjs <tipo> <nombre> [--sin2d]
 *   node tools/fotos-torreta.cjs turret_laser laser
 *
 * Necesita el servidor de desarrollo de esta rama en el puerto 5183 (`GAL_PORT`) y, para la comparación, el de la
 * vista 2D del tag `v-2d-final` en el 5184 (`DOSD_PORT`). Genera, por nivel y giro de cámara, `3d-<nombre>-n<nivel>-<giro>.png`,
 * y además `3d-<nombre>-alejado.png`, `3d-<nombre>-disparo.png`, `angulos-<nombre>.png` y `comparacion-<nombre>.png`.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [tipo, nombre, flag] = process.argv.slice(2);
if (!tipo || !nombre) {
  console.error('Uso: node tools/fotos-torreta.cjs <tipo> <nombre> [--sin2d]');
  process.exit(2);
}
const GAL = `http://localhost:${process.env.GAL_PORT || 5183}`;
const DOSD = `http://localhost:${process.env.DOSD_PORT || 5184}`;
const D = 'docs/torretas';
const R = ';window.__gal.render()';
const ANG = [45, 135, 225, 315];

function shoot(url, shots, w, h, wait = 6000) {
  const r = spawnSync('npx', ['electron', 'tools/captura.cjs'], {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, CAP_URL: url, CAP_SHOTS: JSON.stringify(shots), CAP_W: String(w), CAP_H: String(h), CAP_WAIT: String(wait) },
  });
  if (r.stdout && /ERRORES/.test(r.stdout)) console.log(r.stdout.split('\n').filter((l) => /ERRORES/.test(l)).join('\n'));
  if (r.status) console.log(`(captura terminó con código ${r.status})`);
}

// 1. Cada nivel desde los cuatro giros.
for (const l of [1, 2, 3]) {
  const shots = ANG.map((a) => ({ out: `${D}/3d-${nombre}-n${l}-${a}.png`, js: `window.__gal.aim(45);window.__gal.focus(${['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost', 'turret_missile'].indexOf(tipo)},${l},${a},4.2)${R}`, wait: 500 }));
  shoot(`${GAL}/galeria-torretas.html?tipo=${tipo}&nivel=${l}&limpio=1`, shots, 640, 560);
}
// 2. Los tres niveles a zoom alejado y un disparo.
shoot(
  `${GAL}/galeria-torretas.html?tipo=${tipo}&limpio=1`,
  [
    { out: `${D}/3d-${nombre}-alejado.png`, js: `window.__gal.aim(45);window.__gal.view(45,0.9)${R}`, wait: 500 },
    { out: `${D}/3d-${nombre}-disparo.png`, js: `window.__gal.view(45,1.9);window.__gal.fire();for(let i=0;i<4;i++)window.__gal.render()`, wait: 60 },
  ],
  900,
  560,
);

// 3. Hojas de comparación (páginas HTML en docs/torretas, que se capturan a PNG).
const cell = (src) => `<div class="c"><img src="${src}"></div>`;
const rows = [1, 2, 3].map((l) => `<div class="row"><b>nivel ${l}</b>${ANG.map((a) => cell(`3d-${nombre}-n${l}-${a}.png`)).join('')}</div>`).join('\n');
fs.writeFileSync(
  `${D}/angulos-${nombre}.html`,
  `<!doctype html><meta charset="utf-8"><title>${nombre}: cuatro ángulos y tres niveles</title>
<style>body{margin:0;background:#1d2330;color:#e8ecf2;font:13px system-ui,sans-serif;padding:10px 14px}h2{margin:0 0 8px;font-size:15px}.row{display:flex;gap:6px;margin-bottom:6px;align-items:center}.row>b{width:52px;color:#ffd166}.c{width:250px;height:220px;overflow:hidden;border-radius:5px;background:#9fd0e8}.c img{width:100%;height:100%;object-fit:cover;object-position:50% 46%;transform:scale(1.18)}</style>
<h2>${nombre} 3D · giros de cámara de 90° (45°, 135°, 225°, 315°)</h2>
${rows}`,
);
shoot(`${GAL}/docs/torretas/angulos-${nombre}.html`, [{ out: `${D}/angulos-${nombre}.png` }], 1100, 720, 2500);

if (flag !== '--sin2d') {
  // Galería 2D completa de ese tipo (4 giros por nivel) y hoja 2D frente a 3D.
  shoot(
    `${DOSD}/galeria-torretas.html?tipo=${tipo}`,
    [{ out: `${D}/2d-${nombre}-completa.png`, js: `document.getElementById("dirs").value="4";document.getElementById("dirs").onchange();document.querySelector("header").style.position="static"`, wait: 800 }],
    1090,
    1950,
    3000,
  );
  const crop = (l) => `<div class="c d2"><div class="s" style="background-image:url(2d-${nombre}-completa.png);background-position:-281px -${80 + (l - 1) * 597}px"></div><span>nivel ${l}</span></div>`;
  const view = (l) => `<div class="c d3"><img src="3d-${nombre}-n${l}-${l === 2 ? 45 : 135}.png"><span>nivel ${l}</span></div>`;
  fs.writeFileSync(
    `${D}/comparacion-${nombre}.html`,
    `<!doctype html><meta charset="utf-8"><title>${nombre}: 2D frente a 3D</title>
<style>body{margin:0;background:#1d2330;color:#e8ecf2;font:14px system-ui,sans-serif;padding:14px 18px}h2{margin:0 0 10px;font-size:16px}.row{display:flex;gap:8px;align-items:center;margin-bottom:8px}.row>b{width:54px;color:#ffd166}.c{width:330px;height:290px;border-radius:6px;position:relative;overflow:hidden}.d2{background:#2c3a28}.d3{background:#9fd0e8}.s{width:258px;height:258px;margin:16px auto;transform:scale(1.1);background-size:1090px auto}.c span{position:absolute;left:6px;top:4px;font-size:11px;background:rgba(0,0,0,.5);padding:1px 6px;border-radius:3px}.d3 img{width:100%;height:100%;object-fit:cover;object-position:50% 52%}</style>
<h2>${nombre}: 2D (arriba) frente a 3D (abajo)</h2>
<div class="row"><b>2D</b>${[1, 2, 3].map(crop).join('')}</div>
<div class="row"><b>3D</b>${[1, 2, 3].map(view).join('')}</div>`,
  );
  shoot(`${GAL}/docs/torretas/comparacion-${nombre}.html`, [{ out: `${D}/comparacion-${nombre}.png` }], 1080, 700, 2500);
}
console.log(`listo: ${path.resolve(D)}`);
