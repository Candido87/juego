/**
 * Galería de torretas (página de desarrollo `galeria-torretas.html`): todos los tipos y niveles en una parrilla, con cámara
 * orbital, estados (normal, apagada, en obra, dañada), disparo con sus efectos y vistas preestablecidas (4 giros y zoom alejado).
 * Usa el mismo constructor (`turrets3d.ts`), la misma luz y el mismo contorno que el juego.
 *
 * Para automatizar capturas: `window.__gal` (`view(giro, zoom)`, `state(nombre)`, `fire()`, `aim(grados | null)`).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from '../game/config';
import { TURRET_COLOR } from './actors';
import { allModels } from './catalog';
import { PITCH } from './camera';
import { Effects } from './effects3d';
import { OutlinePass, patchMaterial } from './fx';
import { preload, tint } from './loader';
import { BULLET_ACCENT, GALLERY_ONLY, MODEL_KINDS, TurretModelKind, TurretRig, buildTurret } from './turrets3d';

type TurretKind = TurretModelKind;
const ALL_KINDS: TurretKind[] = MODEL_KINDS;
// Filtros por dirección: `?tipo=turret_bullet`, `?nivel=2` y `?limpio=1` (sin botones ni etiquetas, para capturas).
const query = new URLSearchParams(location.search);
const KINDS = ALL_KINDS.filter((k) => !query.get('tipo') || query.get('tipo') === k);
const LEVELS = [1, 2, 3].filter((l) => !query.get('nivel') || Number(query.get('nivel')) === l);
const CLEAN = query.get('limpio') === '1';
const NAMES: Record<TurretKind, string> = { turret_bullet: 'Balas', turret_laser: 'Láser', turret_fire: 'Lanzallamas', turret_frost: 'Hielo', turret_missile: 'Misil (sólo galería)' };
const STATES = ['normal', 'apagada', 'en obra', 'dañada'] as const;
type State = (typeof STATES)[number];
const SPACING = 1.75;
const OFF_TINT = 0x8f94a6;

interface Cell {
  kind: TurretKind;
  level: number;
  rig: TurretRig;
  recoil: number;
  x: number;
  z: number;
}

async function main(): Promise<void> {
  const host = document.getElementById('v')!;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const outline = new OutlinePass(renderer);
  outline.setSamples(4);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd0e8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.7));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const target = new THREE.Vector3(((LEVELS.length - 1) * SPACING) / 2, 0.3, ((KINDS.length - 1) * SPACING) / 2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minZoom = 0.3;
  controls.maxZoom = 6;
  /** Pone la cámara en un giro (grados) con la misma inclinación que el juego; `zoom` 1 = parrilla entera. */
  const setView = (deg: number, zoom: number, at: THREE.Vector3 = target): void => {
    const a = (deg * Math.PI) / 180;
    controls.target.copy(at);
    camera.position.set(at.x + 60 * Math.cos(PITCH) * Math.sin(a), at.y + 60 * Math.sin(PITCH), at.z + 60 * Math.cos(PITCH) * Math.cos(a));
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
  };

  // Suelo: una losa verde por casilla, para ver la escala real de cada torreta.
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x7cc04a, flatShading: true, roughness: 1, metalness: 0 });
  patchMaterial(tileMat);
  const ground = new THREE.Group();
  scene.add(ground);
  const tileGeo = new THREE.BoxGeometry(SPACING * 0.98, 0.2, SPACING * 0.98).translate(0, -0.1, 0);
  const fx = new Effects();
  scene.add(fx.group);

  await preload(allModels());

  let cells: Cell[] = [];
  const holder = new THREE.Group();
  scene.add(holder);
  let state: State = 'normal';
  let aim: number | null = null;
  let t = 0;

  const build = (): void => {
    holder.clear();
    ground.clear();
    cells = [];
    KINDS.forEach((kind, r) => {
      LEVELS.forEach((level, c) => {
        const x = c * SPACING;
        const z = r * SPACING;
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(x, 0, z);
        tile.receiveShadow = true;
        ground.add(tile);
        const rig = buildTurret(kind, level);
        rig.root.position.set(x, 0, z);
        rig.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = m.receiveShadow = true;
        });
        if (state === 'apagada') {
          tint(rig.head, OFF_TINT);
          rig.head.rotation.x = 0.5;
        }
        if (state === 'en obra') {
          rig.root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.material = (m.material as THREE.Material).clone();
            patchMaterial(m.material as THREE.Material);
            (m.material as THREE.Material).transparent = true;
            (m.material as THREE.Material).opacity = 0.55;
          });
          rig.root.scale.y = 0.6;
        }
        holder.add(rig.root);
        cells.push({ kind, level, rig, recoil: 0, x, z });
      });
    });
    syncButtons();
  };

  const fire = (): void => {
    for (const c of cells) {
      c.recoil = 1;
      const yaw = c.rig.head.rotation.y;
      const mu = c.rig.muzzle;
      const from = new THREE.Vector3(c.x + Math.sin(yaw) * mu.fwd, c.rig.head.position.y + mu.y, c.z + Math.cos(yaw) * mu.fwd);
      const to = new THREE.Vector3(c.x + Math.sin(yaw) * 4.2, 0.5, c.z + Math.cos(yaw) * 4.2);
      // El misil no existe en la lógica: sin efecto propio hasta el hito 5.
      if (c.kind !== 'turret_missile') fx.shot(c.kind, from, to, CONFIG.turrets[c.kind].area);
    }
  };

  // ---------- botones ----------
  const bar = document.getElementById('bar')!;
  const grp = (title: string, html: string) => `<span class="grp"><b>${title}</b>${html}</span>`;
  const btn = (id: string, label: string) => `<button data-b="${id}">${label}</button>`;
  bar.innerHTML =
    grp('Galería de torretas 3D', '') +
    grp('Estado', STATES.map((s) => btn(`state:${s}`, s)).join('')) +
    grp('Giro de cámara', [45, 135, 225, 315].map((a, i) => btn(`view:${a}`, `${i + 1}`)).join('')) +
    grp('Zoom', btn('zoom:1', 'Parrilla') + btn('zoom:0.5', 'Alejado') + btn('zoom:3', 'Cerca')) +
    grp('Disparo', btn('fire', 'Disparar') + btn('auto', 'Auto') + btn('aim', 'Apuntar'));
  const syncButtons = (): void => {
    bar.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => b.classList.toggle('on', b.dataset.b === `state:${state}` || (b.dataset.b === 'auto' && auto) || (b.dataset.b === 'aim' && aim !== null)));
  };
  let auto = false;
  bar.addEventListener('click', (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-b]')?.dataset.b;
    if (!id) return;
    const [k, v] = id.split(':');
    if (k === 'state') {
      state = v as State;
      build();
    } else if (k === 'view') setView(Number(v), camera.zoom, controls.target.clone());
    else if (k === 'zoom') setView(45, Number(v), target);
    else if (k === 'fire') fire();
    else if (k === 'auto') auto = !auto;
    else if (k === 'aim') aim = aim === null ? 0 : null;
    syncButtons();
  });

  // Etiquetas de fila y de columna.
  const labels: { el: HTMLElement; p: THREE.Vector3 }[] = [];
  const label = (text: string, p: THREE.Vector3): void => {
    const el = document.createElement('div');
    el.className = 'lab';
    el.textContent = text;
    document.body.appendChild(el);
    labels.push({ el, p });
  };
  KINDS.forEach((k, r) => label(`${NAMES[k]}${GALLERY_ONLY.includes(k) ? '' : ' ★'}`, new THREE.Vector3(-0.9, 0, r * SPACING)));
  LEVELS.forEach((l, c) => label(`nivel ${l}`, new THREE.Vector3(c * SPACING, 0, -0.95)));

  // ---------- bucle ----------
  let w = 0;
  let h = 0;
  const draw = (): void => {
    const nw = host.clientWidth;
    const nh = host.clientHeight;
    if (nw && nh && (nw !== w || nh !== h)) {
      w = nw;
      h = nh;
      renderer.setSize(w, h);
      const half = 5.2;
      const aspect = w / h;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    }
    const dt = 1 / 60;
    t += dt;
    if (auto && Math.floor(t * 1.2) !== Math.floor((t - dt) * 1.2)) fire();
    for (const c of cells) {
      // Apunta: barrido lento, o fijo si se pide.
      const yaw = aim !== null ? (aim * Math.PI) / 180 : state === 'apagada' ? 0.6 : Math.sin(t * 0.5 + c.x) * 0.9;
      c.rig.head.rotation.y = yaw;
      c.recoil = Math.max(0, c.recoil - dt * 4);
      c.rig.gun.position.z = c.rig.gunRest - c.recoil * 0.1;
      if (state === 'dañada' && Math.random() < 0.35) fx.smoke(c.x, c.rig.height * 0.7, c.z, 0x26262b, 0.22);
      if (state === 'normal' || state === 'dañada') {
        const mu = c.rig.muzzle;
        const my = c.rig.head.position.y + mu.y;
        const mx = c.x + Math.sin(yaw) * mu.fwd;
        const mz = c.z + Math.cos(yaw) * mu.fwd;
        if (c.kind === 'turret_laser') fx.glow(mx, my, mz, 0.13 + 0.04 * Math.sin(t * 5 + c.x), TURRET_COLOR[c.kind]);
        else if (c.kind === 'turret_frost') fx.glow(mx, my, mz, 0.15 + 0.04 * Math.sin(t * 3 + c.x), TURRET_COLOR[c.kind]);
        else if (c.kind === 'turret_fire' && Math.random() < dt * 14) fx.flame(mx, my - 0.03, mz, 0.07);
      }
    }
    controls.update();
    camera.updateMatrixWorld();
    fx.begin(camera);
    fx.update(dt, camera);
    outline.render(scene, camera);
    for (const l of labels) {
      const v = l.p.clone().project(camera);
      l.el.style.left = `${((v.x + 1) / 2) * w}px`;
      l.el.style.top = `${((1 - v.y) / 2) * h + 4}px`;
    }
  };
  const frame = (): void => {
    draw();
    requestAnimationFrame(frame);
  };

  if (CLEAN) {
    bar.style.display = 'none';
    document.getElementById('msg')!.style.display = 'none';
    labels.forEach((l) => (l.el.style.display = 'none'));
  }
  build();
  setView(45, 1);
  (window as unknown as { __gal: unknown }).__gal = {
    view: (deg: number, zoom = 1, x?: number, z?: number) => setView(deg, zoom, x === undefined ? target : new THREE.Vector3(x, 0.3, z)),
    state: (s: State) => ((state = s), build()),
    fire,
    aim: (deg: number | null) => ((aim = deg), syncButtons()),
    /** Centra la cámara en una torreta (tipo 0-3, nivel 1-3) con zoom. */
    focus: (kind: number, level: number, deg = 45, zoom = 3.2) => {
      const r = Math.max(0, KINDS.indexOf(ALL_KINDS[kind]));
      const c = Math.max(0, LEVELS.indexOf(level));
      setView(deg, zoom, new THREE.Vector3(c * SPACING, 0.3, r * SPACING));
    },
    accent: BULLET_ACCENT,
    /** Dibuja un fotograma ya (para las capturas con la ventana oculta). */
    render: draw,
    info: () => ({ zoom: camera.zoom, target: controls.target.toArray(), pos: camera.position.toArray(), size: [w, h] }),
  };
  requestAnimationFrame(frame);
}
main();
