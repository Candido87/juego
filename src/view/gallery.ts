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

function render() {
  const z = Number(zoom.value);
  document.getElementById('zv')!.textContent = `${z}×`;
  const step = HEAD_STEPS / Number(dirs.value);
  root.innerHTML = '';
  for (const kind of MODELED) {
    for (const level of LOOK_LEVELS) {
      const h = document.createElement('h3');
      h.textContent = `${NAMES[kind]} · nivel ${level}`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (let i = 0; i < HEAD_STEPS; i += step) grid.append(cell(kind, level, i, z));
      root.append(h, grid);
    }
  }
}
zoom.oninput = render;
dirs.onchange = render;
render();
