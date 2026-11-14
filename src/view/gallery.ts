/** Página de desarrollo: todas las torretas (tipo × nivel × rumbo) sin arrancar el juego. */
import { HEAD_STEPS, LOOK_LEVELS, MODELED, TURRET_CANVAS as C, drawTurretParts, headYaw, turretModel } from './turretModels';

const root = document.getElementById('root')!;
const zoom = document.getElementById('zoom') as HTMLInputElement;
const dirs = document.getElementById('dirs') as HTMLSelectElement;
const NAMES: Record<string, string> = { turret_bullet: 'Balas', turret_laser: 'Láser', turret_fire: 'Fuego', turret_frost: 'Hielo' };

function cell(kind: (typeof MODELED)[number], level: number, i: number, z: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cell';
  const cv = document.createElement('canvas');
  cv.width = C.w;
  cv.height = C.h;
  cv.style.width = `${C.w * z}px`;
  cv.style.height = `${C.h * z}px`;
  const ctx = cv.getContext('2d')!;
  drawTurretParts(ctx, 0, 0, turretModel(kind, level), headYaw(i));
  el.append(cv, `${Math.round((i / HEAD_STEPS) * 360)}°`);
  return el;
}

type State = 'normal' | 'apagada' | 'dañada' | 'en obra';

/** Celda de estado: los mismos efectos que aplica el juego (tinte, humo, translucidez). */
function stateCell(kind: (typeof MODELED)[number], state: State, z: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cell';
  const cv = document.createElement('canvas');
  cv.width = C.w;
  cv.height = C.h;
  cv.style.width = `${C.w * z}px`;
  cv.style.height = `${C.h * z}px`;
  const ctx = cv.getContext('2d')!;
  if (state === 'apagada') ctx.filter = 'brightness(0.68) saturate(0.6)';
  if (state === 'en obra') {
    ctx.globalAlpha = 0.42;
    ctx.filter = 'sepia(0.3) hue-rotate(180deg) brightness(1.2)';
  }
  drawTurretParts(ctx, 0, 0, turretModel(kind, 1), Math.PI / 4);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  if (state === 'dañada') {
    for (let k = 0; k < 3; k++) {
      const ph = (k + 0.5) / 3;
      ctx.fillStyle = `rgba(${k === 1 ? 85 : 46},${k === 1 ? 85 : 46},${k === 1 ? 85 : 46},${(1 - ph) * 0.7})`;
      ctx.beginPath();
      ctx.arc(C.w / 2 + Math.sin((ph + k) * 6) * 5, C.oy - 36 - ph * 28, 2.5 + ph * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  el.append(cv, `${NAMES[kind]} · ${state}`);
  return el;
}

function render() {
  const z = Number(zoom.value);
  document.getElementById('zv')!.textContent = `${z}×`;
  const step = HEAD_STEPS / Number(dirs.value);
  root.innerHTML = '';
  const only = new URLSearchParams(location.search).get('tipo');
  const statesOnly = new URLSearchParams(location.search).get('vista') === 'estados';
  for (const kind of MODELED) {
    if (only && only !== kind) continue;
    for (const level of statesOnly ? [] : LOOK_LEVELS) {
      const h = document.createElement('h3');
      h.textContent = `${NAMES[kind]} · nivel ${level}`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (let i = 0; i < HEAD_STEPS; i += step) grid.append(cell(kind, level, i, z));
      root.append(h, grid);
    }
    const hs = document.createElement('h3');
    hs.textContent = `${NAMES[kind]} · estados`;
    const gs = document.createElement('div');
    gs.className = 'grid';
    for (const st of ['normal', 'apagada', 'dañada', 'en obra'] as State[]) gs.append(stateCell(kind, st, z));
    root.append(hs, gs);
  }
}
zoom.oninput = render;
dirs.onchange = render;
render();
