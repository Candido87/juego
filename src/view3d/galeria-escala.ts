/**
 * Galería de escala (página de desarrollo `galeria-escala.html`): sobre una cuadrícula de casillas visibles, una cinta recta,
 * una curva, una rampa, un ascensor, una tubería, objetos transportados, personas, enemigos, una torreta de cada tipo, cada
 * edificio con su huella propuesta, un árbol, una roca y un muro, todos dibujados con el mismo código que el juego.
 *
 * Vista isométrica fija (la del juego) y cámara orbital. Para automatizar capturas e informes: `window.__esc`
 * (`mode('iso'|'orbit')`, `focus(zona)`, `labels(on)`, `report()`, `render()`).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from '../game/config';
import { Game } from '../game/game';
import type { Building } from '../game/game';
import { BUILD_KINDS, BuildKind, EnemyKind, NpcRole, TurretKind } from '../game/types';
import { createFlatWorld } from '../game/world';
import { BASE_YAW, CameraRig, PITCH } from './camera';
import { ENEMY_MODEL, NPC_MODEL, TERRAIN, CHAR_SCALE } from './catalog';
import { ROLE_LOOK } from './actors';
import { gltf, instance, tint } from './loader';
import { LEVEL_H } from './pick';
import { ITEM_GEO, OPT_OFF, View3D } from './scene3d';
import { ITEM_SHAPES } from './pieces';
import { aspectF } from './aspectos';

export interface ScaleRow {
  cat: string;
  name: string;
  /** Clave del objetivo en `CONFIG.scale.targets`. */
  key: string;
  /** Tamaño de la caja envolvente en casillas. */
  w: number;
  d: number;
  h: number;
  /** Altura de la base sobre el suelo de su casilla (negativo = hundido). */
  minY: number;
  /** Huella de referencia (casillas). */
  cell: [number, number];
}

interface Entry {
  cat: string;
  name: string;
  key: string;
  group: THREE.Object3D;
  cell: [number, number];
  baseY: number;
}

/** Zonas de la página: centro (x, z) y zoom de la cámara isométrica. */
const ZONES: Record<string, { x: number; z: number; zoom: number }> = {
  todo: { x: 16, z: 13, zoom: 0.62 },
  transporte: { x: 8, z: 3.2, zoom: 2.1 },
  personas: { x: 8, z: 7.2, zoom: 2.6 },
  torretas: { x: 7, z: 10.5, zoom: 3.4 },
  edificios: { x: 13, z: 16.5, zoom: 1.6 },
  huellas: { x: 17, z: 23.5, zoom: 1.5 },
  decoracion: { x: 10, z: 30, zoom: 2.4 },
};

/** Caja envolvente sólo de las mallas visibles (las cintas llevan una pieza oculta para el modo sin agrupar). */
function visibleBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    box.union(new THREE.Box3().setFromObject(m));
  });
  return box;
}

export async function startScaleGallery(host: HTMLElement): Promise<void> {
  const world = createFlatWorld(48, 40);
  const game = new Game({ world, noWaves: true });
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-9999px;width:64px;height:64px';
  document.body.appendChild(stage);
  const view = new View3D(stage, game, OPT_OFF);
  await view.init();
  const factory = view as unknown as {
    makeBuilding(b: Building, sig: string): { group: THREE.Group };
    makeChar(model: string, scale: number, key: string, tint: number | null): { group: THREE.Group };
  };
  const mk = (kind: BuildKind | 'core', sig: string, dir = 0) => {
    const fake = { id: -1, kind, x: 0, y: 0, w: 1, d: 1, dir, built: true, hp: 1, maxHp: 1, progress: 1 } as unknown as Building;
    return factory.makeBuilding(fake, sig).group;
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfd8de);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.9));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(18, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -34;
  sc.right = sc.top = 34;
  sc.far = 90;
  sun.target.position.set(16, 0, 14);
  scene.add(sun, sun.target);

  // ---------- suelo con casillas visibles ----------
  const W = 48;
  const H = 40;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa9d18a, roughness: 1 }));
  ground.position.set(W / 2, 0, H / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(Math.max(W, H), Math.max(W, H), 0x4f7a3a, 0x7aa65e);
  grid.position.set(W / 2, 0.01, H / 2);
  grid.scale.set(W / Math.max(W, H), 1, H / Math.max(W, H));
  scene.add(grid);
  const major = new THREE.GridHelper(Math.max(W, H), Math.max(W, H) / 5, 0x2f5a22, 0x2f5a22);
  major.position.set(W / 2, 0.015, H / 2);
  major.scale.set(W / Math.max(W, H), 1, H / Math.max(W, H));
  scene.add(major);

  // ---------- etiquetas ----------
  const labels = new THREE.Group();
  scene.add(labels);
  const label = (text: string, x: number, y: number, z: number, size = 0.5) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#1d2330';
    g.font = 'bold 26px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34, 244);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(size * 4, size, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 10;
    labels.add(sp);
  };

  const entries: Entry[] = [];
  const put = (cat: string, name: string, group: THREE.Object3D, x: number, z: number, opts: { y?: number; cell?: [number, number]; label?: boolean; lift?: number; key?: string } = {}) => {
    const cell = opts.cell ?? [1, 1];
    group.position.set(x + cell[0] / 2, opts.y ?? 0, z + cell[1] / 2);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(group);
    entries.push({ cat, name, key: opts.key ?? name, group, cell, baseY: opts.y ?? 0 });
    if (opts.label !== false) label(name, x + cell[0] / 2, (opts.lift ?? 2.1) + (opts.y ?? 0), z + cell[1] / 2, 0.3);
    return group;
  };
  /** Marco de una huella de referencia (casillas) con altura objetivo. */
  const footprint = (x: number, z: number, w: number, d: number, color = 0x1b6ca8) => {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.04, d)), new THREE.LineBasicMaterial({ color }));
    e.position.set(x + w / 2, 0.04, z + d / 2);
    scene.add(e);
  };
  const block = (x: number, z: number, w: number, h: number, d = 1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x9b8a6a, roughness: 1 }));
    m.position.set(x + w / 2, h / 2, z + d / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };

  // ---------- Transporte (z = 3) ----------
  const Z0 = 3;
  label('TRANSPORTE', 1.5, 0.3, Z0 - 1.5, 0.5);
  put('cinta', 'cinta recta', mk('belt', 'belt|0|1|s0----'), 2, Z0, { key: 'belt' });
  put('cinta', 'cinta recta', mk('belt', 'belt|0|1|s0----'), 3, Z0, { label: false, key: 'belt' });
  put('cinta', 'cinta recta', mk('belt', 'belt|0|1|s0----'), 4, Z0, { label: false, key: 'belt' });
  put('cinta', 'curva', mk('belt', 'belt|0|1|s0-i--'), 6, Z0, { key: 'belt_curve' });
  put('cinta', 'cinta rápida', mk('belt_fast', 'belt_fast|0|1|s0----'), 8, Z0, { key: 'belt_fast' });
  // Rampa: una cinta que sube un nivel hasta un bloque de LEVEL_H.
  block(11, Z0, 3, LEVEL_H);
  put('cinta', 'rampa (sube 1)', mk('belt', 'belt|0|1|s1----'), 10, Z0, { key: 'belt_ramp' });
  put('cinta', 'cinta (nivel 1)', mk('belt', 'belt|0|1|s0----'), 11, Z0, { y: LEVEL_H, label: false, key: 'belt' });
  put('cinta', 'cinta (nivel 1)', mk('belt', 'belt|0|1|s0----'), 12, Z0, { y: LEVEL_H, label: false, key: 'belt' });
  put('cinta', 'ascensor', mk('elevator', 'elevator|0|1|'), 14, Z0, { key: 'elevator' });
  block(15, Z0, 2, CONFIG.elevator.maxRise * LEVEL_H);
  put('cinta', 'cinta (nivel 4)', mk('belt', 'belt|0|1|s0----'), 15, Z0, { y: CONFIG.elevator.maxRise * LEVEL_H, label: false, key: 'belt' });
  // Tuberías.
  put('tubería', 'tubería recta', mk('pipeline', 'pipeline|0|1|qp-p-'), 18, Z0, { key: 'pipeline' });
  put('tubería', 'tubería recta', mk('pipeline', 'pipeline|0|1|qp-p-'), 19, Z0, { label: false, key: 'pipeline' });
  put('tubería', 'tubería curva', mk('pipeline', 'pipeline|0|1|qpp--'), 20, Z0, { key: 'pipeline_curve' });
  put('tubería', 'tubería T', mk('pipeline', 'pipeline|0|1|qppp-'), 22, Z0, { key: 'pipeline_t' });
  put('poste', 'poste', mk('pole', 'pole|0|1|'), 24, Z0, { key: 'pole' });
  // Objetos transportados sobre una cinta recta (z = 5): uno por forma.
  label('OBJETOS SOBRE LA CINTA', 4.5, 0.3, 4.3, 0.42);
  ITEM_SHAPES.forEach((shape, i) => {
    put('cinta', 'cinta (objetos)', mk('belt', 'belt|0|1|s0----'), 2 + i, 5, { label: false, key: 'belt' });
    const m = new THREE.Mesh(ITEM_GEO[shape].geo, new THREE.MeshStandardMaterial({ color: 0xd9a35a, roughness: 1 }));
    m.position.set(2 + i + 0.5, ITEM_GEO[shape].y, 5.5);
    m.castShadow = true;
    scene.add(m);
    entries.push({ cat: 'objeto', name: `objeto ${shape}`, key: `item_${shape}`, group: m, cell: [1, 1], baseY: 0 });
  });

  // ---------- Personas y enemigos (z = 8) ----------
  label('PERSONAS Y ENEMIGOS', 5, 0.3, 7.3, 0.45);
  (Object.keys(ROLE_LOOK) as NpcRole[]).forEach((r, i) => {
    const look = ROLE_LOOK[r];
    put('persona', `NPC ${r}`, factory.makeChar(look.model, look.scale * CHAR_SCALE * aspectF(`npc_${r}`), r, look.tint).group, 2 + i * 1.5, 8, { lift: 1.5, key: `npc_${r}` });
  });
  (Object.keys(ENEMY_MODEL) as EnemyKind[]).forEach((e, i) => {
    const def = ENEMY_MODEL[e];
    put('enemigo', `enemigo ${e}`, factory.makeChar(def.model, def.scale * CHAR_SCALE * aspectF(`enemy_${e}`), e, null).group, 11 + i * 1.5, 8, { lift: 1.9 + def.lift, y: def.lift, key: `enemy_${e}` });
  });

  // ---------- Torretas (z = 11) ----------
  label('TORRETAS (1×1 hoy)', 3.5, 0.3, 10.3, 0.45);
  (Object.keys(CONFIG.turrets) as TurretKind[]).forEach((t, i) => {
    put('torreta', t.replace('turret_', 'torreta '), mk(t, `${t}|0|1|L1|D0`), 2 + i * 2, 11, { lift: 1.9, key: t });
    footprint(2 + i * 2, 11, 1, 1);
  });

  // ---------- Edificios (z = 14), cada uno con su huella actual (1×1) ----------
  label('EDIFICIOS (modelo actual en su casilla 1×1)', 12, 0.3, 13.3, 0.45);
  const buildings = BUILD_KINDS.filter((k) => !k.startsWith('turret_') && !k.startsWith('wall_') && !['belt', 'belt_fast', 'pipeline', 'pole', 'elevator'].includes(k));
  buildings.forEach((k, i) => {
    const x = 2 + (i % 10) * 3;
    const z = 14 + Math.floor(i / 10) * 3.5;
    put('edificio', game.def(k).name, mk(k, `${k}|0|1|`), x, z, { lift: 2.4, key: k });
    footprint(x, z, 1, 1);
  });
  put('edificio', 'núcleo (2×2)', mk('core', 'core|0|1|'), 36, 14, { cell: [2, 2], lift: 3.2, key: 'core' });
  footprint(36, 14, 2, 2);

  // ---------- Huellas propuestas (z = 22) ----------
  label('HUELLAS PROPUESTAS (marco azul) con el modelo actual', 14, 0.3, 21.2, 0.45);
  let fx = 2;
  for (const [k, f] of Object.entries(CONFIG.scale.footprints) as [BuildKind, [number, number]][]) {
    if (k === ('core' as string)) continue;
    put('huella', `${game.def(k).name} ${f[0]}×${f[1]}`, mk(k, `${k}|0|1|`), fx, 22, { cell: f, lift: 3, key: k });
    footprint(fx, 22, f[0], f[1]);
    fx += f[0] + 1;
  }

  // ---------- Decoración y muros (z = 29) ----------
  label('DECORACIÓN, MUROS', 6, 0.3, 28.3, 0.45);
  const decor: [string, string, number][] = [
    ['árbol', TERRAIN.trees[0], 1],
    ['roble', TERRAIN.trees[1], 1],
    ['pino', TERRAIN.trees[2], 0.95],
    ['árbol grueso', TERRAIN.trees[3], 1.15],
    ['pino grande', TERRAIN.trees[4], 1.25],
    ['roca', TERRAIN.rocks[0], 0.8],
    ['roca alta', TERRAIN.rocks[3], 0.75],
    ['arbusto', TERRAIN.small[0], 1.2],
  ];
  decor.forEach(([n, model, s], i) => put('decoración', n, instance(model, undefined, s * aspectF(model.replace('nature/', ''))), 2 + i * 2.2, 29, { lift: 3.2, key: model.replace('nature/', '') }));
  (['wall_wood', 'wall_stone', 'wall_metal', 'wall_gate'] as BuildKind[]).forEach((k, i) => put('muro', game.def(k).name, mk(k, `${k}|0|1|----`), 21 + i * 2, 29, { lift: 2, key: k }));
  put('persona', 'NPC (referencia junto al árbol)', factory.makeChar(NPC_MODEL, ROLE_LOOK.constructor.scale * CHAR_SCALE * aspectF('npc_constructor'), 'ref', null).group, 4.1, 30.4, { lift: 1.5, key: 'npc_constructor' });
  // Cubo de 1×1×1 casilla de referencia.
  const cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xd62828 }));
  cube.position.set(30.5, 0.5, 30.5);
  scene.add(cube);
  label('cubo 1×1×1', 30.5, 1.7, 30.5, 0.4);

  // ---------- cajas de los tamaños objetivo (naranja) ----------
  const targetBoxes = new THREE.Group();
  scene.add(targetBoxes);
  for (const e of entries) {
    const t = CONFIG.scale.targets[e.key];
    if (!t || e.cat === 'huella') continue;
    e.group.updateMatrixWorld(true);
    const bb = visibleBox(e.group);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const linear = /^(belt|pipeline)/.test(e.key);
    const w0 = t.w ?? (e.cat === 'edificio' || e.cat === 'torreta' ? CONFIG.scale.fill * Math.max(...e.cell) : undefined);
    const k = w0 !== undefined && t.h === undefined ? w0 / Math.max(size.x, size.z) : t.h !== undefined && w0 === undefined ? t.h / size.y : 1;
    const ww = w0 ?? Math.max(size.x, size.z) * k;
    const hh = t.h ?? size.y * k;
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(linear ? 1 : ww, hh, ww)), new THREE.LineBasicMaterial({ color: 0xff7a00 }));
    const base = e.cat === 'objeto' ? bb.min.y : e.baseY;
    box.position.set(c.x, base + hh / 2, c.z);
    targetBoxes.add(box);
  }

  // ---------- cámaras ----------
  const rig = new CameraRig();
  rig.yaw = BASE_YAW;
  const iso = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const persp = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  persp.position.set(10, 12, 18);
  const controls = new OrbitControls(persp, renderer.domElement);
  controls.target.set(8, 0.5, 7);
  let mode: 'iso' | 'orbit' = 'iso';
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
  };
  const render = () => {
    resize();
    const w = host.clientWidth;
    const h = host.clientHeight;
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
  const focus = (zone: string) => {
    const z = ZONES[zone] ?? ZONES.todo;
    rig.x = z.x;
    rig.z = z.z;
    rig.zoom = z.zoom;
    controls.target.set(z.x, 0.5, z.z);
    persp.position.set(z.x + 8 / z.zoom + 4, 7 / z.zoom + 3, z.z + 10 / z.zoom + 4);
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
    rig.zoom = Math.min(6, Math.max(0.3, rig.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  }, { passive: false });
  let dragging = false;
  renderer.domElement.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (dragging && mode === 'iso') rig.drag(e.movementX, e.movementY);
  });

  const report = (): ScaleRow[] =>
    entries.map((e) => {
      e.group.updateMatrixWorld(true);
      const b = visibleBox(e.group);
      const s = b.getSize(new THREE.Vector3());
      return { cat: e.cat, name: e.name, key: e.key, w: +s.x.toFixed(3), d: +s.z.toFixed(3), h: +s.y.toFixed(3), minY: +(b.min.y - e.baseY).toFixed(3), cell: e.cell };
    });

  (window as unknown as { __esc: unknown }).__esc = {
    mode: (m: 'iso' | 'orbit') => {
      mode = m;
      document.querySelectorAll('#bar [data-mode]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.mode === m));
      render();
    },
    focus,
    labels: (on: boolean) => {
      labels.visible = on;
      render();
    },
    targets: (on: boolean) => {
      targetBoxes.visible = on;
      render();
    },
    yaw: (steps: number) => {
      rig.yaw = BASE_YAW + (steps * Math.PI) / 2;
      render();
    },
    report,
    dump: (key: string) => {
      const e = entries.find((x) => x.key === key)!;
      const out: unknown[] = [];
      e.group.updateMatrixWorld(true);
      e.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const b = new THREE.Box3().setFromObject(m);
        out.push([m.name || m.type, +b.min.y.toFixed(3), +b.max.y.toFixed(3), +(b.max.x - b.min.x).toFixed(2), +(b.max.z - b.min.z).toFixed(2)]);
      });
      return out;
    },
    raw: (id: string) => {
      const sc = gltf(id).scene;
      sc.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(sc);
      return [+b.min.x.toFixed(3), +b.min.y.toFixed(3), +b.min.z.toFixed(3), +b.max.x.toFixed(3), +b.max.y.toFixed(3), +b.max.z.toFixed(3)];
    },
    native: (id: string) => {
      const b = new THREE.Box3().setFromObject(instance(id, undefined, 1));
      const v = b.getSize(new THREE.Vector3());
      return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    },
    render,
    pitch: PITCH,
  };
  const bar = document.getElementById('bar')!;
  bar.innerHTML =
    '<b>Escala</b>' +
    '<span class="grp"><button data-mode="iso" class="on">Isométrica</button><button data-mode="orbit">Orbital</button></span>' +
    `<span class="grp">${Object.keys(ZONES).map((z) => `<button data-zone="${z}">${z}</button>`).join('')}</span>` +
    '<span class="grp"><button data-act="labels" class="on">Etiquetas</button><button data-act="targets" class="on">Objetivos</button><button data-act="yaw">Girar 90°</button></span>';
  let yawSteps = 0;
  bar.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button');
    if (!t) return;
    const api = (window as unknown as { __esc: { mode: (m: string) => void; focus: (z: string) => void; labels: (b: boolean) => void; yaw: (n: number) => void } }).__esc;
    if (t.dataset.mode) api.mode(t.dataset.mode);
    else if (t.dataset.zone) api.focus(t.dataset.zone);
    else if (t.dataset.act === 'labels') {
      t.classList.toggle('on');
      api.labels(t.classList.contains('on'));
    } else if (t.dataset.act === 'targets') {
      t.classList.toggle('on');
      (window as unknown as { __esc: { targets: (b: boolean) => void } }).__esc.targets(t.classList.contains('on'));
    } else if (t.dataset.act === 'yaw') api.yaw(++yawSteps);
  });
  void tint;
}
