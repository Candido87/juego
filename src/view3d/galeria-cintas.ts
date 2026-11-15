/**
 * Galería de cintas (página de desarrollo `galeria-cintas.html`): todos los modelos `conveyor*` del Factory Kit de Kenney, cada
 * uno con su nombre debajo, sobre una cuadrícula de casillas. Sirve para elegir las piezas de cada cinta y medir las reales.
 *
 * Automatización: `window.__cin` (`mode('iso'|'orbit')`, `focus(grupo)`, `report()`, `render()`).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BASE_YAW, CameraRig } from './camera';
import { CONFIG } from '../game/config';
import { Game } from '../game/game';
import type { Building } from '../game/game';
import { createFlatWorld } from '../game/world';
import { ROLE_LOOK } from './actors';
import { aspectF } from './aspectos';
import { CHAR_SCALE, NPC_MODEL } from './catalog';
import { gltf, instance, preload } from './loader';
import { LEVEL_H } from './pick';
import { ITEM_GEO, OPT_OFF, View3D } from './scene3d';
import { ITEM_SHAPES } from './pieces';

/** Todos los modelos de cinta del kit, agrupados como en la tabla de mapeo. */
export const CONVEYOR_GROUPS: Record<string, string[]> = {
  rectas: ['conveyor', 'conveyor-sides', 'conveyor-stripe', 'conveyor-stripe-sides', 'conveyor-bars', 'conveyor-bars-sides', 'conveyor-bars-stripe', 'conveyor-bars-stripe-side'],
  largas: ['conveyor-long', 'conveyor-long-sides', 'conveyor-long-stripe', 'conveyor-long-stripe-sides'],
  tramos: ['conveyor-stripe-part-end', 'conveyor-stripe-part-middle', 'conveyor-long-part-end', 'conveyor-long-part-middle', 'conveyor-long-sides-part-end', 'conveyor-long-sides-part-middle', 'conveyor-long-stripe-sides-part-end', 'conveyor-long-stripe-sides-part-middle'],
  curvas: ['conveyor-corner', 'conveyor-stripe-corner'],
  empalmes: ['conveyor-junction-t', 'conveyor-sides-junction-t', 'conveyor-stripe-junction-t', 'conveyor-stripe-sides-junction-t'],
  cruces: ['conveyor-cross', 'conveyor-sides-cross', 'conveyor-stripe-cross', 'conveyor-stripe-sides-cross'],
  cuestas: ['conveyor-bars-high', 'conveyor-bars-high-slope', 'conveyor-bars-fence', 'conveyor-bars-fence-slope', 'conveyor-bars-stripe-high', 'conveyor-bars-stripe-high-slope', 'conveyor-bars-stripe-fence', 'conveyor-bars-stripe-fence-slope'],
};

export interface PieceRow {
  group: string;
  name: string;
  /** Tamaño de la caja envolvente (ancho x, alto y, fondo z) y su centro, en las unidades del archivo. */
  size: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
  /** Eje más largo del modelo (por donde corre la cinta). */
  axis: 'x' | 'z';
}

const COLS = 8;
const GAP = 2.6;

export async function startBeltGallery(host: HTMLElement): Promise<void> {
  const ids = Object.values(CONVEYOR_GROUPS).flat().map((n) => `factory/${n}`);
  await preload(ids);
  // Fábrica de piezas del juego (cintas a escala, casa de referencia): el mismo constructor que usa la vista.
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-9999px;width:64px;height:64px';
  document.body.appendChild(stage);
  const view = new View3D(stage, new Game({ world: createFlatWorld(8, 8), noWaves: true }), OPT_OFF);
  await view.init();
  const factory = view as unknown as { makeBuilding(b: Building, sig: string): { group: THREE.Group } };
  const mk = (kind: string, sig: string, dir = 0) =>
    factory.makeBuilding({ id: -1, kind, x: 0, y: 0, w: 1, d: 1, dir, built: true, hp: 1, maxHp: 1, progress: 1 } as unknown as Building, sig).group;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfd8de);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.9));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(12, 30, 10);
  scene.add(sun);
  const block = (x: number, z: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), new THREE.MeshStandardMaterial({ color: 0x9b8a6a, roughness: 1 }));
    m.position.set(x + w / 2, h / 2, z + 0.5);
    scene.add(m);
  };
  const grid = new THREE.GridHelper(80, 80, 0x4f7a3a, 0x7aa65e);
  grid.position.set(20, 0, 20);
  scene.add(grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa9d18a, roughness: 1 }));
  ground.position.set(20, -0.01, 20);
  scene.add(ground);

  const rows: PieceRow[] = [];
  const zones: Record<string, { x: number; z: number }> = {};
  let rowStart = 0;
  const label = (text: { name: string; dims: string }, x: number, z: number) => {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 0, 384, 96);
    g.fillStyle = '#1d2330';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(text.name, 192, 36, 372);
    g.font = '24px system-ui, sans-serif';
    g.fillText(text.dims, 192, 76, 372);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(2.3, 0.58, 1);
    sp.position.set(x, 0.05, z + 1.05);
    sp.renderOrder = 10;
    scene.add(sp);
  };
  for (const [group, names] of Object.entries(CONVEYOR_GROUPS)) {
    zones[group] = { x: 1 + (Math.min(names.length, COLS) - 1) * GAP * 0.5, z: 2 + rowStart * GAP };
    names.forEach((name, i) => {
      const col = i % COLS;
      const row = rowStart + Math.floor(i / COLS);
      const x = 2 + col * GAP;
      const z = 2 + row * GAP;
      // Sin recolocar: tal y como viene en el archivo (origen y orientación originales).
      const obj = gltf(`factory/${name}`).scene.clone(true);
      obj.position.set(x, 0, z);
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      const s = b.getSize(new THREE.Vector3());
      const r = (n: number) => +n.toFixed(3);
      rows.push({
        group,
        name,
        size: [r(s.x), r(s.y), r(s.z)],
        min: [r(b.min.x - x), r(b.min.y), r(b.min.z - z)],
        max: [r(b.max.x - x), r(b.max.y), r(b.max.z - z)],
        axis: s.x >= s.z ? 'x' : 'z',
      });
      label({ name, dims: `${r(s.x)} × ${r(s.y)} × ${r(s.z)}` }, x, z);
    });
    rowStart += Math.ceil(names.length / COLS) + 0.4;
  }

  // ---------- A ESCALA: las piezas del juego (aspectos.ts) con un árbol, una persona y un edificio de referencia ----------
  const zA = 2 + rowStart * GAP + 3;
  zones.escala = { x: 12, z: zA + 3 };
  label({ name: 'A ESCALA', dims: 'piezas del juego (0,65 × 0,18)' }, 3, zA - 1.4);
  const put = (obj: THREE.Object3D, x: number, z: number, y = 0) => {
    obj.position.set(x + 0.5, y, z + 0.5);
    scene.add(obj);
    return obj;
  };
  // Línea normal: recta ×3, curva a la derecha, recta ×2 hacia el sur, con un objeto de cada forma encima.
  for (const x of [1, 2, 3]) put(mk('belt', 'belt|0|1|s0----'), x, zA);
  put(mk('belt', 'belt|1|1|s0--i-', 1), 4, zA);
  for (const z of [1, 2]) put(mk('belt', 'belt|1|1|s0----', 1), 4, zA + z);
  // Línea rápida (franja naranja) y curva a la izquierda.
  for (const x of [1, 2, 3]) put(mk('belt_fast', 'belt_fast|0|1|s0----'), x, zA + 4);
  put(mk('belt_fast', 'belt_fast|3|1|s0--i-', 3), 4, zA + 4);
  for (const z of [1, 2]) put(mk('belt_fast', 'belt_fast|3|1|s0----', 3), 4, zA + 4 - z);
  // Empalme en T, cruce, cuesta que sube y cuesta que baja.
  put(mk('belt', 'belt|0|1|s0-ii-'), 7, zA);
  put(mk('belt', 'belt|0|1|s0iiii'), 9, zA);
  put(mk('belt', 'belt|0|1|s1----'), 11, zA);
  block(12, zA, 2, LEVEL_H);
  put(mk('belt', 'belt|0|1|s0----'), 12, zA, LEVEL_H);
  put(mk('belt', 'belt|0|1|s0----'), 13, zA, LEVEL_H);
  put(mk('belt', 'belt|0|1|s-1----'), 14, zA, LEVEL_H);
  // Objetos transportados apoyados sobre la superficie de la cinta.
  ITEM_SHAPES.forEach((shape, i) => {
    const m = new THREE.Mesh(ITEM_GEO[shape].geo, new THREE.MeshStandardMaterial({ color: 0xd9a35a, roughness: 1 }));
    m.position.set(1.5 + (i % 3), ITEM_GEO[shape].y, zA + 0.5 + Math.floor(i / 3) * 4);
    scene.add(m);
  });
  // Referencias: persona, árbol y edificio (casa) a su escala del juego.
  put(instance(NPC_MODEL, undefined, ROLE_LOOK.constructor.scale * CHAR_SCALE * aspectF('npc_constructor')), 7, zA + 3);
  put(instance('nature/tree_default', undefined, aspectF('tree_default')), 9, zA + 3);
  put(mk('house', 'house|0|1|'), 11, zA + 3);
  label({ name: 'persona · árbol · casa', dims: `cinta ${CONFIG.scale.beltWidth} × ${CONFIG.scale.beltHeight}` }, 9.5, zA + 5);

  const rig = new CameraRig();
  rig.yaw = BASE_YAW;
  const iso = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const persp = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  const controls = new OrbitControls(persp, renderer.domElement);
  let mode: 'iso' | 'orbit' = 'iso';
  const render = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    if (mode === 'iso') {
      const hh = rig.halfHeight(h);
      iso.left = -hh * (w / h);
      iso.right = hh * (w / h);
      iso.top = hh;
      iso.bottom = -hh;
      const p = rig.position(120);
      iso.position.set(p.x, p.y, p.z);
      iso.lookAt(rig.x, 0, rig.z);
      iso.updateProjectionMatrix();
      renderer.render(scene, iso);
    } else {
      controls.update();
      renderer.render(scene, persp);
    }
  };
  const focus = (group: string) => {
    const names = CONVEYOR_GROUPS[group];
    const z = zones[group];
    if (group === 'escala' && z) {
      rig.x = 8;
      rig.z = z.z - 0.5;
      rig.zoom = 1.75;
    } else if (!names || !z) {
      rig.x = 10;
      rig.z = 10;
      rig.zoom = 0.5;
    } else {
      rig.x = Math.min(names.length, COLS) * GAP * 0.5 + 1;
      rig.z = z.z + Math.floor((names.length - 1) / COLS) * GAP * 0.5;
      rig.zoom = Math.max(0.5, 3.3 / Math.max(1, Math.min(names.length, COLS) / 3 + Math.ceil(names.length / COLS) / 2));
    }
    controls.target.set(rig.x, 0.3, rig.z);
    persp.position.set(rig.x + 4, 5, rig.z + 7);
    render();
  };
  focus('todo');
  const loop = () => {
    render();
    requestAnimationFrame(loop);
  };
  loop();
  renderer.domElement.addEventListener('wheel', (e) => {
    if (mode !== 'iso') return;
    e.preventDefault();
    rig.zoom = Math.min(8, Math.max(0.3, rig.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  }, { passive: false });
  let dragging = false;
  renderer.domElement.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (dragging && mode === 'iso') rig.drag(e.movementX, e.movementY);
  });
  const api = {
    mode: (m: 'iso' | 'orbit') => {
      mode = m;
      render();
    },
    focus,
    report: () => rows,
    render,
  };
  (window as unknown as { __cin: unknown }).__cin = api;
  const bar = document.getElementById('bar')!;
  bar.innerHTML =
    '<b>Cintas del Factory Kit</b><span class="grp"><button data-mode="iso">Isométrica</button><button data-mode="orbit">Orbital</button></span>' +
    `<span class="grp"><button data-zone="todo">todo</button>${Object.keys(CONVEYOR_GROUPS).map((z) => `<button data-zone="${z}">${z}</button>`).join('')}<button data-zone="escala">a escala</button></span>`;
  bar.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.mode) api.mode(t.dataset.mode as 'iso' | 'orbit');
    else if (t.dataset.zone) api.focus(t.dataset.zone);
  });
}
