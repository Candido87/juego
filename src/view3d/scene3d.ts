/**
 * Vista 3D del juego: lee el MISMO `Game` (sin duplicar lógica) y lo dibuja con Three.js.
 * Cámara ortográfica isométrica, terreno instanciado, edificios, cintas, tuberías, NPCs, enemigos y torretas.
 */
import * as THREE from 'three';
import { CONFIG } from '../game/config';
import { Building, Enemy, Game } from '../game/game';
import { DX, DY, Dir, BuildKind, EnemyKind, ItemId, TurretKind, WallKind } from '../game/types';
import { heightAt, heightAtPoint } from '../game/world';
import { ROLE_LOOK, TURRET_COLOR, TurretState, carried, enemyLook, npcAnim, smokeSources, turretLook, turretState } from './actors';
import { BUILDING_PARTS, CHAR_SCALE, ENEMY_MODEL, TURRET_GUN, allModels } from './catalog';
import { Effects } from './effects3d';
import { CameraRig } from './camera';
import { HOLES, OutlinePass, patchMaterial } from './fx';
import { animations, instance, preload, tint } from './loader';
import { WALL_KINDS, isWallKind, wallDamage } from '../view/muros';
import { Overlay } from './overlay3d';
import { LEVEL_H, pickBox, pickTile3D } from './pick';
import { armsFor, beltPiece, maskOf, quarterYaw, yawToDir } from './pieces';
import { Terrain, buildTerrain } from './terrain';

type Tile = { x: number; y: number };

/** Interruptores de optimización (para medir con y sin ellos: `?opt=0` los apaga todos). */
export interface ViewOptions {
  /** Une en InstancedMesh los edificios estáticos (cintas, tuberías, muros, casas...). */
  batch: boolean;
  /** No anima ni actualiza personajes fuera de la cámara y baja la animación de los lejanos. */
  cull: boolean;
  /** Lado en casillas de cada trozo de terreno (0 = un solo trozo). */
  chunk: number;
  shadows: boolean;
  /** Contorno oscuro en siluetas y escalones. */
  outline: boolean;
}
export const OPT_ON: ViewOptions = { batch: true, cull: true, chunk: 32, shadows: true, outline: true };
export const OPT_OFF: ViewOptions = { batch: false, cull: false, chunk: 0, shadows: true, outline: false };
/** Grosor de las tuberías respecto al modelo (1 = ocupa la casilla entera). */
const PIPE_T = 0.7;
const FAST_TINT = 0xbfe0ff;
const HUB_GEO = new THREE.SphereGeometry(0.5, 8, 6);
const HUB_MAT = new THREE.MeshStandardMaterial({ color: 0x5f5d78, flatShading: true, roughness: 1, metalness: 0 });
patchMaterial(HUB_MAT);
/** Aspecto de cada muro: alto, color del cuerpo y de la albardilla. Son cajas macizas (los modelos del pack eran barandillas). */
const WALL_STYLE: Record<WallKind, { h: number; color: number; cap: number }> = {
  wall_wood: { h: 0.7, color: 0xa8713f, cap: 0x7d4f2a },
  wall_stone: { h: 0.95, color: 0xa9afb6, cap: 0x858c95 },
  wall_metal: { h: 1.2, color: 0x7f93ad, cap: 0xd0d8e4 },
};
const WALL_W = 0.36;
const GATE_COLOR = 0xb9824a;
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const wallMats = new Map<number, THREE.MeshStandardMaterial>();
/** Material de muro por color (compartido, para que se agrupen en instancias). */
function wallMat(color: number): THREE.MeshStandardMaterial {
  let m = wallMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
    patchMaterial(m);
    wallMats.set(color, m);
  }
  return m;
}
/** Lo que cuenta como vecino de muralla (la puerta se une a los muros). */
const WALL_LINK: string[] = [...WALL_KINDS, 'wall_gate'];
/** Oscurece un color (y lo enrojece un poco con el daño). */
function shade(hex: number, f: number, dmg: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * (f + dmg * 0.04)));
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}
/** Piezas sueltas de las torretas (anillos de nivel y accesorios de cada tipo). */
const RING_GEO = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 14);
const RING_STEP = 0.09;
const CYL_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const GEM_GEO = new THREE.OctahedronGeometry(0.5, 0);
const glowMats = new Map<number, THREE.MeshBasicMaterial>();
/** Material que brilla solo (lentes y cristales). */
function glowMat(color: number): THREE.MeshBasicMaterial {
  let m = glowMats.get(color);
  if (!m) glowMats.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}
/** Tinte de la torreta que no puede disparar y del enemigo ralentizado. */
const OFF_TINT = 0x8f94a6;
const SLOW_TINT = 0x8fd0ff;
const CARRY_GEO = new THREE.BoxGeometry(0.2, 0.2, 0.2);
/** Segundos que dura la caída de un personaje al morir y máximo de caídas a la vez. */
const DIE_TIME = 0.9;
const MAX_DYING = 60;
const MAX_ITEMS = 8192;
const MAX_MARKERS = 2048;
/** Radio (en casillas) del agujero de transparencia y margen de profundidad (unidades de mundo) para no tramar lo que está en la propia casilla. */
const HOLE_RADIUS = 0.95;
const HOLE_MARGIN = 1.25;
const NPC_MARK = new THREE.Color(0x6fd3ff);
const ENEMY_MARK = new THREE.Color(0xff5a5a);
/** Personajes con esqueleto a la vez (el resto va instanciado). */
const ANIMATED_BUDGET = 250;
const MAX_LOD = 4096;

/** Giro Y (rad) del modelo de cinta/tubería para cada dirección del juego (0:+x 1:+z 2:-x 3:-z). Ajustado con la galería. */
export const FLOW_YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

const ITEM_COLOR: Record<string, number> = {
  iron_ore: 0x9db4d6, copper_ore: 0xe0894a, coal: 0x333340, stone: 0xcfcab8, wood: 0x9a6a3a,
  iron_plate: 0xc8d4e4, copper_plate: 0xf0a060, gear: 0xaaaaaa, ammo: 0xf0d050, circuit: 0x40c060,
  brick: 0xc86040, oil: 0x222230, gasoline: 0xf0c020, sulfur: 0xf0e04a, food: 0xe05050,
};

interface BView {
  group: THREE.Group;
  sig: string;
  spin: THREE.Object3D[];
  bob: THREE.Object3D[];
  pivot?: THREE.Group;
  gun?: THREE.Object3D;
  yaw: number;
  recoil: number;
  /** Torreta: inclinación del cañón (cae cuando no puede disparar), estado y materiales originales del cabezal. */
  pitch: number;
  state?: TurretState;
  skin?: Skin;
  item?: THREE.Mesh;
  baseY: number;
  /** Altura del modelo (para elegirlo por su cuerpo). */
  height: number;
  /** Mallas del edificio en espacio de mundo, para agruparlas cuando es estático. */
  statics?: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }[];
}

/** Mallas de un objeto con sus materiales originales (para teñirlo y devolverlo a su color). */
interface Skin {
  meshes: THREE.Mesh[];
  base: (THREE.Material | THREE.Material[])[];
  tinted: number | null;
}
function skinOf(obj: THREE.Object3D): Skin {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) meshes.push(m);
  });
  return { meshes, base: meshes.map((m) => m.material), tinted: null };
}
function setTint(obj: THREE.Object3D, skin: Skin, color: number | null): void {
  if (skin.tinted === color) return;
  skin.meshes.forEach((m, i) => (m.material = skin.base[i]));
  skin.tinted = color;
  if (color !== null) tint(obj, color);
}

type AnimName = 'walk' | 'idle' | 'work' | 'attack' | 'die';
interface CView {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  acts: Record<AnimName, THREE.AnimationAction | null>;
  anim: AnimName;
  moving: boolean;
  /** Segundos que lleva quieto. */
  still: number;
  yaw: number;
  height: number;
  skin: Skin;
  /** Rol o tipo con el que se creó (si cambia, se rehace). */
  key: string;
  carry?: THREE.Mesh;
  carryItem: ItemId | null;
}

const angleLerp = (a: number, b: number, k: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export class View3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 320);
  readonly rig = new CameraRig();
  terrain!: Terrain;
  hover: Tile | null = null;
  /** Edificio bajo el cursor: el de la casilla o, si está vacía, el que se ve en ese punto de la pantalla. */
  hoverBuildingId: number | null = null;
  private bodyPick: number | null = null;
  /** Modo construcción (lo pone la interfaz). */
  buildKind: BuildKind | null = null;
  buildDir: Dir = 0;
  /** Herramienta Quitar activa (resalta en rojo). */
  removeMode = false;
  /** Edificio seleccionado (lo pone la interfaz): se marca su huella entera. */
  selectedId: number | null = null;
  /** Clic sin arrastrar: casilla (o null) y botón del ratón. */
  onClick: (t: Tile | null, button: number) => void = () => {};
  /** Botón izquierdo abajo; si devuelve true empieza a "pintar" en vez de mover la cámara. */
  onDown: (t: Tile | null, ev: PointerEvent) => boolean = () => false;
  onPaint: (t: Tile) => void = () => {};
  /** Avisos de eventos del juego para la interfaz. */
  onMessage: (text: string) => void = () => {};
  private buildings = new Map<number, BView>();
  private npcs = new Map<number, CView>();
  private enemies = new Map<number, CView>();
  private dying: { v: CView; t: number }[] = [];
  private deadNpcs = new Set<number>();
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
  /** Humo, disparos, explosiones y barras de vida. */
  readonly fx = new Effects();
  /** La partida está en pausa: personajes y partículas se congelan (lo pone la interfaz). */
  simPaused = false;
  private hoverMesh: THREE.Group;
  private selMesh: THREE.LineSegments;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private keys = new Set<string>();
  private lastW = 0;
  private lastH = 0;
  private time = 0;
  private sun: THREE.DirectionalLight;
  fps = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private batchGroup: THREE.Group | null = null;
  private batchDirty = false;
  private batchAge = 0;
  private belts: Building[] = [];
  private itemMesh: THREE.InstancedMesh | null = null;
  private frustum = new THREE.Frustum();
  readonly outline: OutlinePass;
  readonly overlay: Overlay;
  /** Marcas que sólo se ven cuando un personaje queda tapado (profundidad invertida). */
  private markers: THREE.InstancedMesh;
  private markerN = 0;
  private lod = new Map<EnemyKind, { meshes: THREE.InstancedMesh[]; locals: THREE.Matrix4[] }>();
  private toCamera = new THREE.Vector3();
  private frameNo = 0;
  private inView = 0;
  private inViewNext = 0;
  /** Contadores para la interfaz y las mediciones. */
  readonly stats = { batched: 0, loose: 0, rebuilds: 0, charsAnimated: 0, charsSkipped: 0, lodChars: 0 };

  constructor(private host: HTMLElement, readonly game: Game, readonly opts: ViewOptions = OPT_ON) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.info.autoReset = false;
    this.outline = new OutlinePass(this.renderer);
    this.outline.enabled = opts.outline;
    this.markers = new THREE.InstancedMesh(new THREE.CircleGeometry(0.17, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthFunc: THREE.GreaterDepth, depthWrite: false }), MAX_MARKERS);
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 10;
    this.scene.add(this.markers);
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x9fd0e8);
    this.scene.fog = new THREE.Fog(0x9fd0e8, 140, 300);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.7));
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.castShadow = opts.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -26;
    sc.right = sc.top = 26;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    // Casilla bajo el ratón y casilla seleccionada.
    this.hoverMesh = new THREE.Group();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.hoverMesh.add(quad);
    this.hoverMesh.visible = false;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.04, 1));
    this.selMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffd23c }));
    this.selMesh.scale.set(1.04, 1, 1.04);
    this.selMesh.visible = false;
    this.scene.add(this.hoverMesh, this.selMesh);

    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff }), MAX_ITEMS);
    im.count = 0;
    im.frustumCulled = false;
    this.itemMesh = im;
    this.scene.add(im);

    this.overlay = new Overlay(game, (b) => this.levelTop(b), (b) => this.buildings.get(b.id)?.height ?? 1);
    this.scene.add(this.overlay.group);
    this.scene.add(this.fx.group);

    const c = game.core;
    this.rig.x = c.x + 1;
    this.rig.z = c.y + 1;
    this.rig.zoom = 1.1;
    this.bindInput();
  }

  async init(onProgress?: (d: number, t: number) => void): Promise<void> {
    await preload(allModels(), onProgress);
    this.terrain = buildTerrain(this.game.world, this.game.core, 7, this.opts.chunk);
    this.terrain.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.receiveShadow = true;
    });
    this.scene.add(this.terrain.group);
  }

  // ---------- entrada ----------
  private bindInput(): void {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; moved: boolean; button: number; painting: boolean } | null = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      this.hover = this.pick(e.clientX, e.clientY);
      const painting = e.button === 0 && this.onDown(this.hover, e);
      down = { x: e.clientX, y: e.clientY, moved: false, button: e.button, painting };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.hover = this.pick(e.clientX, e.clientY);
      if (!down) return;
      if (down.painting) {
        if (this.hover) this.onPaint(this.hover);
        return;
      }
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (down.moved || Math.hypot(dx, dy) > 6) {
        down.moved = true;
        this.rig.drag(e.movementX, e.movementY);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (down && !down.moved && !down.painting) this.onClick(this.pick(e.clientX, e.clientY), down.button);
      down = null;
    });
    el.addEventListener('pointerleave', () => {
      if (!down) this.hover = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.rig.zoomAt(e.deltaY < 0 ? 1.14 : 0.88, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    }, { passive: false });
    const typing = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
    window.addEventListener('keydown', (e) => {
      if (!typing(e)) this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private pick(cx: number, cy: number): Tile | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const o = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(this.camera);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld);
    const w = this.game.world;
    const tile = pickTile3D(o, d, { w: w.w, h: w.h, levelAt: (x, y) => heightAt(w, x, y) }, 600);
    const onTile = tile ? this.game.buildingAt(tile.x, tile.y) : undefined;
    this.bodyPick = null;
    if (!onTile) {
      const boxes = [];
      for (const [id, bv] of this.buildings) {
        const b = this.game.buildings.get(id);
        if (!b || bv.height < 0.6) continue;
        const base = this.levelTop(b);
        boxes.push({ id, minX: b.x + 0.1, minY: base, minZ: b.y + 0.1, maxX: b.x + b.w - 0.1, maxY: base + bv.height, maxZ: b.y + b.d - 0.1 });
      }
      this.bodyPick = pickBox(o, d, boxes);
    }
    this.hoverBuildingId = onTile?.id ?? this.bodyPick;
    return tile;
  }

  // ---------- edificios ----------
  private levelTop(b: Building): number {
    let m = 0;
    for (let y = 0; y < b.d; y++) for (let x = 0; x < b.w; x++) m = Math.max(m, heightAt(this.game.world, b.x + x, b.y + y));
    return m * LEVEL_H;
  }

  private isKind(x: number, y: number, kinds: string[]): Building | null {
    const b = this.game.buildingAt(x, y);
    return b && kinds.includes(b.kind) ? b : null;
  }

  /** Firma que cambia cuando hay que reconstruir el modelo (orientación, vecinos, estado). */
  private signature(b: Building): string {
    let s = `${b.kind}|${b.dir}|${b.built ? 1 : 0}`;
    if (isWallKind(b.kind)) s += `|d${wallDamage(b.hp, b.maxHp)}`;
    if (b.kind in CONFIG.turrets) s += `|L${this.game.turretLevel[b.kind as TurretKind]}`;
    if (b.kind === 'belt' || b.kind === 'belt_fast') {
      for (let d = 0; d < 4; d++) {
        const n = this.isKind(b.x + DX[d], b.y + DY[d], ['belt', 'belt_fast']);
        s += n && n.dir === (d + 2) % 4 ? 'i' : '-';
      }
    } else if (b.kind === 'pipeline') {
      for (let d = 0; d < 4; d++) s += this.pipeLinked(b.x + DX[d], b.y + DY[d]) ? 'p' : '-';
    } else if (isWallKind(b.kind)) {
      for (let d = 0; d < 4; d++) s += this.isKind(b.x + DX[d], b.y + DY[d], WALL_LINK) ? 'w' : '-';
    } else if (b.kind === 'wall_gate') {
      for (let d = 0; d < 4; d++) s += this.isKind(b.x + DX[d], b.y + DY[d], WALL_LINK) ? 'w' : '-';
    }
    return s;
  }

  private pipeLinked(x: number, y: number): boolean {
    return !!this.isKind(x, y, ['pipeline', 'pump', 'refinery', 'generator', 'turbine', 'turret_fire']);
  }

  private makeBuilding(b: Building, sig: string): BView {
    const group = new THREE.Group();
    const view: BView = { group, sig, spin: [], bob: [], yaw: 0, recoil: 0, pitch: 0, baseY: 0, height: 0 };
    const kind = b.kind;
    let top = 0;
    const parts = BUILDING_PARTS[kind];
    const flags = sig.slice(-4);
    const on = (c: string) => [0, 1, 2, 3].filter((d) => flags[d] === c);
    if (kind === 'belt' || kind === 'belt_fast') {
      // Cinta: recta, curva, empalme en T o cruce según por dónde le entran otras cintas.
      const pc = beltPiece(b.dir, on('i'));
      const o = instance(pc.piece === 'straight' ? parts[0].model : pc.model, 1);
      if (kind === 'belt_fast' && pc.piece !== 'straight') tint(o, FAST_TINT);
      o.rotation.y = quarterYaw(pc.k);
      group.add(o);
      top = 0.4;
    } else if (kind === 'pipeline') {
      // Tubería: tramo recto, o medios tramos hacia cada vecino con un codo central.
      const a = armsFor(maskOf(on('p')), (b.dir % 2) as 0 | 1);
      const seg = (d: number, half: boolean) => {
        const holder = new THREE.Group();
        holder.rotation.y = yawToDir(d);
        const o = instance('factory/pipe-large', 1);
        o.scale.set(half ? 0.5 : 1, PIPE_T, PIPE_T);
        o.position.x = half ? 0.25 : 0;
        holder.add(o);
        group.add(holder);
      };
      if (a.straightAxis !== null) seg(a.straightAxis, false);
      else {
        a.arms.forEach((d) => seg(d, true));
        const hub = new THREE.Mesh(HUB_GEO, HUB_MAT);
        hub.position.y = PIPE_T * 0.5;
        hub.scale.setScalar(PIPE_T);
        group.add(hub);
      }
      top = PIPE_T;
    } else if (isWallKind(kind)) {
      // Muro macizo: medios tramos hacia cada vecino y un poste central (esquina, T, cruz, extremo o suelto). El daño lo baja y lo oscurece.
      const st = WALL_STYLE[kind];
      const dmg = b.built ? wallDamage(b.hp, b.maxHp) : 0;
      const h = st.h * [1, 0.8, 0.58][dmg];
      const mat = wallMat(shade(st.color, [1, 0.78, 0.56][dmg], dmg));
      const cap = wallMat(shade(st.cap, [1, 0.78, 0.56][dmg], dmg));
      const a = armsFor(maskOf(on('w')), 0, true);
      // Caja de ancho (x) `wide`, largo (z) `len` desplazada `off` hacia +z, girada `yaw`; con una albardilla encima.
      const slab = (yaw: number, len: number, off: number, wide: number, tall: number) => {
        const holder = new THREE.Group();
        holder.rotation.y = yaw;
        const body = new THREE.Mesh(BOX_GEO, mat);
        body.scale.set(wide, tall, len);
        body.position.set(0, tall / 2, off);
        const top2 = new THREE.Mesh(BOX_GEO, cap);
        top2.scale.set(wide + 0.08, 0.08, len + (len < 0.5 ? 0.08 : 0));
        top2.position.set(0, tall + 0.04, off);
        holder.add(body, top2);
        group.add(holder);
        top = Math.max(top, tall + 0.08);
      };
      // La caja va a lo largo de z; el giro lleva +z hacia la dirección d.
      const yawZ = (d: number) => Math.atan2(DX[d], DY[d]);
      if (a.straightAxis !== null) slab(a.straightAxis === 0 ? Math.PI / 2 : 0, 1, 0, WALL_W, h);
      else {
        a.arms.forEach((d) => slab(yawZ(d), 0.5, 0.25, WALL_W, h));
        if (a.hub) slab(0, WALL_W + 0.16, 0, WALL_W + 0.16, h * 1.16);
      }
    } else if (kind === 'wall_gate') {
      // Puerta: dos jambas altas y un dintel en el eje de la muralla, con dos hojas abiertas (se ve el hueco).
      const w = on('w');
      const axisX = w.includes(0) || w.includes(2) || (!w.length && b.dir % 2 === 0);
      const holder = new THREE.Group();
      holder.rotation.y = axisX ? Math.PI / 2 : 0;
      const mat = wallMat(GATE_COLOR);
      const dark = wallMat(shade(GATE_COLOR, 0.7, 0));
      const box = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, yaw = 0) => {
        const o = new THREE.Mesh(BOX_GEO, m);
        o.scale.set(sx, sy, sz);
        o.position.set(x, y, z);
        o.rotation.y = yaw;
        holder.add(o);
      };
      for (const side of [-1, 1]) {
        box(mat, WALL_W + 0.1, 1.3, 0.2, 0, 0.65, side * 0.4);
        box(dark, 0.07, 0.85, 0.34, 0.2, 0.43, side * 0.3, side * 0.9);
      }
      box(dark, WALL_W + 0.16, 0.14, 1, 0, 1.37, 0);
      group.add(holder);
      top = 1.45;
    } else {
      parts.forEach((p) => {
        const o = instance(p.model, p.fit);
        if (p.tint) tint(o, p.tint);
        if (p.sy) o.scale.y = p.sy;
        o.position.set(p.dx ?? 0, p.stack ? top : 0, p.dz ?? 0);
        top = Math.max(top, o.position.y + new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y);
        if (p.spin) view.spin.push(o);
        if (p.bob) view.bob.push(o);
        group.add(o);
      });
    }
    view.height = top;
    // Torreta: cañón sobre un pivote que gira hacia el objetivo. Cada nivel añade un anillo de su color y agranda el cañón;
    // cada tipo lleva un accesorio propio (caja de munición, lente, depósito o cristal).
    if (kind in CONFIG.turrets) {
      const tk = kind as TurretKind;
      const g = TURRET_GUN[tk];
      const look = turretLook(this.game, tk);
      const col = TURRET_COLOR[tk];
      const neck = top * 0.85;
      for (let i = 0; i < look.rings; i++) {
        const ring = new THREE.Mesh(RING_GEO, wallMat(col));
        ring.position.y = neck + 0.035 + i * RING_STEP;
        group.add(ring);
      }
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YXZ';
      pivot.position.y = neck + look.rings * RING_STEP;
      const gun = instance(g.model, g.fit * look.gunScale);
      gun.position.set(0, 0.05, 0.15);
      pivot.add(gun);
      const extra = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
        const o = new THREE.Mesh(geo, mat);
        o.scale.set(sx, sy, sz);
        o.position.set(x, y, z);
        pivot.add(o);
      };
      if (tk === 'turret_bullet') extra(BOX_GEO, wallMat(0x5d6b3a), 0.16, 0.2, 0.28, 0.2, 0.1, -0.04);
      else if (tk === 'turret_laser') extra(HUB_GEO, glowMat(col), 0.17, 0.17, 0.17, 0, 0.24, -0.06);
      else if (tk === 'turret_fire') extra(CYL_GEO, wallMat(0xc0392b), 0.2, 0.3, 0.2, 0, 0.12, -0.24);
      else extra(GEM_GEO, glowMat(0xcff6ff), 0.18, 0.3, 0.18, 0, 0.3, -0.04);
      group.add(pivot);
      view.pivot = pivot;
      view.gun = gun;
      view.skin = skinOf(pivot);
      view.height = top + look.rings * RING_STEP + 0.25;
    }
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    if (!b.built) {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = (m.material as THREE.Material).clone();
        patchMaterial(m.material as THREE.Material);
        (m.material as THREE.Material).transparent = true;
        (m.material as THREE.Material).opacity = 0.55;
      });
    }
    // Objeto transportado por la cinta.
    if (!this.opts.batch && (kind === 'belt' || kind === 'belt_fast')) {
      const it = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      it.visible = false;
      group.add(it);
      view.item = it;
    }
    return view;
  }

  private syncBuildings(dt: number): void {
    const seen = new Set<number>();
    const batch = this.opts.batch;
    this.belts.length = 0;
    let loose = 0;
    for (const b of this.game.buildings.values()) {
      seen.add(b.id);
      const sig = this.signature(b);
      let v = this.buildings.get(b.id);
      if (!v || v.sig !== sig) {
        if (v) {
          this.scene.remove(v.group);
          if (v.statics) this.batchDirty = true;
        } else this.terrain.hideDecor(b.x, b.y);
        const old = v;
        v = this.makeBuilding(b, sig);
        if (old) v.yaw = old.yaw;
        this.buildings.set(b.id, v);
        v.group.position.set(b.x + b.w / 2, this.levelTop(b), b.y + b.d / 2);
        if (batch && b.built && !v.pivot && !v.spin.length && !v.bob.length) {
          // Estático: se agrupa con los demás en InstancedMesh (no entra en la escena por separado).
          v.group.updateMatrixWorld(true);
          v.statics = [];
          v.group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) v!.statics!.push({ geo: m.geometry, mat: m.material, matrix: m.matrixWorld.clone() });
          });
          this.batchDirty = true;
        } else this.scene.add(v.group);
      }
      if (b.kind === 'belt' || b.kind === 'belt_fast') if (batch && b.built) this.belts.push(b);
      if (v.statics) continue;
      loose++;
      v.group.position.set(b.x + b.w / 2, this.levelTop(b), b.y + b.d / 2);
      v.group.scale.y = b.built ? 1 : 0.35 + 0.65 * Math.min(1, b.progress);
      for (const s of v.spin) s.rotation.y += dt * (b.running || b.built ? 1.5 : 0);
      for (const o of v.bob) o.position.y += Math.sin(this.time * 6) * 0.004 * (b.built ? 1 : 0);
      if (v.item) {
        const m = v.item.material as THREE.MeshStandardMaterial;
        if (b.item && b.built) {
          v.item.visible = true;
          m.color.setHex(ITEM_COLOR[b.item] ?? 0xffffff);
          const t = Math.min(1, Math.max(0, b.beltProgress)) - 0.5;
          v.item.position.set(DX[b.dir] * t, 0.45, DY[b.dir] * t);
        } else v.item.visible = false;
      }
      if (v.pivot) this.aimTurret(b, v, dt);
    }
    for (const [id, v] of this.buildings) {
      if (!seen.has(id)) {
        this.scene.remove(v.group);
        if (v.statics) this.batchDirty = true;
        this.buildings.delete(id);
      }
    }
    this.stats.loose = loose;
    this.stats.batched = this.buildings.size - loose;
    if (batch) {
      this.batchAge += dt;
      if (this.batchDirty && this.batchAge > 0.3) this.rebuildBatch();
      this.syncItems();
    }
  }

  /** Reagrupa todas las mallas de los edificios estáticos: un InstancedMesh por (malla, material, trozo de 16x16). */
  private rebuildBatch(): void {
    this.batchDirty = false;
    this.batchAge = 0;
    this.stats.rebuilds++;
    if (this.batchGroup) {
      this.scene.remove(this.batchGroup);
      for (const c of this.batchGroup.children) (c as THREE.InstancedMesh).dispose();
    }
    const groups = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; mats: THREE.Matrix4[] }>();
    const pos = new THREE.Vector3();
    for (const view of this.buildings.values()) {
      for (const s of view.statics ?? []) {
        pos.setFromMatrixPosition(s.matrix);
        const mid = Array.isArray(s.mat) ? s.mat.map((m) => m.uuid).join('+') : s.mat.uuid;
        const key = `${s.geo.uuid}|${mid}|${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { geo: s.geo, mat: s.mat, mats: [] }));
        g.mats.push(s.matrix);
      }
    }
    const out = new THREE.Group();
    for (const g of groups.values()) {
      const im = new THREE.InstancedMesh(g.geo, g.mat, g.mats.length);
      g.mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      out.add(im);
    }
    this.batchGroup = out;
    this.scene.add(out);
  }

  /** Objetos sobre las cintas: un solo InstancedMesh con color por instancia. */
  private syncItems(): void {
    const im = this.itemMesh!;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const b of this.belts) {
      if (!b.item || n >= MAX_ITEMS) continue;
      const t = Math.min(1, Math.max(0, b.beltProgress)) - 0.5;
      m.makeTranslation(b.x + 0.5 + DX[b.dir] * t, this.levelTop(b) + 0.45, b.y + 0.5 + DY[b.dir] * t);
      im.setMatrixAt(n, m);
      im.setColorAt(n, c.setHex(ITEM_COLOR[b.item] ?? 0xffffff));
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  private aimTurret(b: Building, v: BView, dt: number): void {
    const kind = b.kind as TurretKind;
    const pivot = v.pivot!;
    if (!b.built) {
      pivot.rotation.set(0, v.yaw, 0);
      return;
    }
    const state = turretState(this.game, b);
    const ready = state === 'ready';
    if (v.state !== state) {
      // Sin munición o sin energía: cabezal apagado (gris) y caído.
      v.state = state;
      if (v.skin) setTint(pivot, v.skin, ready ? null : OFF_TINT);
    }
    const cx = b.x + 0.5;
    const cy = b.y + 0.5;
    if (ready) {
      const range = this.game.turretRange(kind);
      let best: Enemy | null = null;
      let bd = range;
      for (const e of this.game.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) v.yaw = angleLerp(v.yaw, Math.atan2(best.x - cx, best.y - cy), 1 - Math.exp(-dt * 12));
      else v.yaw += dt * 0.25;
    }
    v.pitch += ((ready ? 0 : 0.5) - v.pitch) * (1 - Math.exp(-dt * 5));
    pivot.rotation.set(v.pitch, v.yaw, 0);
    v.recoil = Math.max(0, v.recoil - dt * 4);
    v.gun!.position.z = 0.15 - v.recoil * 0.12;
    if (!ready) return;
    // Lista para disparar: brillo en la boca (láser y hielo) o llama piloto (fuego).
    const mx = cx + Math.sin(v.yaw) * 0.42;
    const mz = cy + Math.cos(v.yaw) * 0.42;
    const my = v.group.position.y + pivot.position.y + 0.12;
    if (kind === 'turret_laser') this.fx.glow(mx, my, mz, 0.13 + 0.04 * Math.sin(this.time * 5 + b.id), TURRET_COLOR[kind]);
    else if (kind === 'turret_frost') this.fx.glow(mx, my, mz, 0.15 + 0.04 * Math.sin(this.time * 3 + b.id), TURRET_COLOR[kind]);
    else if (kind === 'turret_fire' && Math.random() < dt * 14) this.fx.flame(mx, my - 0.03, mz, 0.07);
  }

  // ---------- personajes ----------
  private makeChar(model: string, scale: number, key: string, tintColor: number | null = null): CView {
    const group = instance(model, undefined, scale);
    if (tintColor !== null) tint(group, tintColor);
    const skin = skinOf(group);
    for (const m of skin.meshes) m.castShadow = true;
    const height = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y;
    const mixer = new THREE.AnimationMixer(group.children[0]);
    const clips = animations(model);
    const act = (n: string) => {
      const c = clips.find((cl) => cl.name === n);
      return c ? mixer.clipAction(c) : null;
    };
    const acts = { walk: act('walk'), idle: act('idle'), work: act('interact-right'), attack: act('attack-melee-right'), die: act('die') };
    (acts.idle ?? acts.walk)?.play();
    return { group, mixer, acts, anim: 'idle', moving: false, still: 0, yaw: 0, height, skin, key, carryItem: null };
  }

  /** Cambia de animación con un fundido corto. */
  private setAnim(v: CView, name: AnimName): void {
    if (v.anim === name) return;
    const on = v.acts[name] ?? v.acts.idle;
    const off = v.acts[v.anim] ?? v.acts.idle;
    v.anim = name;
    if (off && off !== on) off.fadeOut(0.15);
    if (!on) return;
    on.reset().fadeIn(0.15).play();
    if (name === 'die') {
      on.setLoop(THREE.LoopOnce, 1);
      on.clampWhenFinished = true;
    }
  }

  /** Coloca y orienta un personaje. Devuelve false si queda fuera de cámara (entonces no se anima). */
  private placeChar(v: CView, x: number, z: number, y: number, dt: number): boolean {
    this.sphere.center.set(x, y + 0.5, z);
    const visible = !this.opts.cull || this.frustum.intersectsSphere(this.sphere);
    v.group.visible = visible;
    if (!visible) {
      v.group.position.set(x, y, z);
      this.stats.charsSkipped++;
      return false;
    }
    if (dt > 0) {
      const dx = x - v.group.position.x;
      const dz = z - v.group.position.z;
      const moving = Math.hypot(dx, dz) > dt * 0.08 && v.group.position.lengthSq() > 0;
      if (moving) v.yaw = angleLerp(v.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
      v.moving = moving;
      v.still = moving ? 0 : v.still + dt;
    }
    v.group.rotation.y = v.yaw;
    v.group.position.set(x, y, z);
    return true;
  }

  /** Avanza la animación; con muchos personajes a la vista se actualiza a la mitad de frecuencia. */
  private tickChar(v: CView, dt: number): void {
    if (!this.opts.cull || this.inView < 150 || (this.frameNo + v.group.id) % 2 === 0) {
      v.mixer.update(this.opts.cull && this.inView >= 150 ? dt * 2 : dt);
      this.stats.charsAnimated++;
    }
    this.inViewNext++;
  }

  /** Enseña lo que lleva el NPC: una caja del color del objeto, delante del pecho. */
  private syncCarry(v: CView, item: ItemId | null): void {
    if (v.carryItem === item) return;
    v.carryItem = item;
    if (!item) {
      if (v.carry) v.carry.visible = false;
      return;
    }
    if (!v.carry) {
      v.carry = new THREE.Mesh(CARRY_GEO, new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
      v.carry.position.set(0, v.height * 0.5, v.height * 0.28);
      v.carry.castShadow = true;
      v.group.add(v.carry);
    }
    v.carry.visible = true;
    (v.carry.material as THREE.MeshStandardMaterial).color.setHex(ITEM_COLOR[item] ?? 0xd8c8a0);
  }

  /** Retira un personaje: si ha muerto a la vista, cae al suelo antes de desaparecer. */
  private dropChar(v: CView, died: boolean): void {
    if (died && v.group.visible && v.acts.die && this.dying.length < MAX_DYING) {
      if (v.carry) v.carry.visible = false;
      setTint(v.group, v.skin, null);
      this.setAnim(v, 'die');
      this.dying.push({ v, t: DIE_TIME });
    } else this.scene.remove(v.group);
  }

  private syncChars(dt: number): void {
    const w = this.game.world;
    const fx = this.fx;
    const seenN = new Set<number>();
    for (const n of this.game.npcs) {
      seenN.add(n.id);
      const look = ROLE_LOOK[n.role];
      let v = this.npcs.get(n.id);
      if (v && v.key !== n.role) {
        this.scene.remove(v.group);
        v = undefined;
      }
      if (!v) {
        v = this.makeChar(look.model, look.scale * CHAR_SCALE, n.role, look.tint);
        v.group.position.set(n.x, 0, n.y);
        this.npcs.set(n.id, v);
        this.scene.add(v.group);
      }
      const ny = heightAtPoint(w, n.x, n.y) * LEVEL_H;
      if (this.placeChar(v, n.x, n.y, ny, dt)) {
        this.setAnim(v, npcAnim(n, v.moving, v.still));
        this.syncCarry(v, carried(n));
        this.tickChar(v, dt);
        if (n.hp < n.maxHp) fx.bar(n.x, ny + v.height + 0.22, n.y, n.hp / n.maxHp, 0.5);
      }
      this.mark(n.x, ny, n.y, NPC_MARK);
    }
    for (const [id, v] of this.npcs) {
      if (seenN.has(id)) continue;
      this.npcs.delete(id);
      this.dropChar(v, this.deadNpcs.has(id));
    }
    const seenE = new Set<number>();
    // Presupuesto de personajes animados (esqueleto): los más cercanos al centro de la cámara. El resto se dibuja
    // como malla instanciada en su pose base (sin esqueleto), que cuesta unas pocas llamadas en total.
    const alive = this.game.enemies.filter((en) => en.hp > 0);
    const budget = this.opts.cull ? ANIMATED_BUDGET : Infinity;
    let animated = alive;
    if (alive.length > budget) {
      const rx = this.rig.x;
      const rz = this.rig.z;
      animated = [...alive].sort((a, b) => (a.x - rx) ** 2 + (a.y - rz) ** 2 - ((b.x - rx) ** 2 + (b.y - rz) ** 2)).slice(0, budget);
    }
    const anim = new Set(animated);
    const aliveIds = new Set<number>();
    for (const lod of this.lod.values()) for (const im of lod.meshes) im.count = 0;
    this.stats.lodChars = 0;
    for (const en of alive) {
      aliveIds.add(en.id);
      const def = ENEMY_MODEL[en.kind];
      const y = heightAtPoint(w, en.x, en.y) * LEVEL_H + def.lift;
      let visible = false;
      let tall = 0.9;
      if (anim.has(en)) {
        seenE.add(en.id);
        let v = this.enemies.get(en.id);
        if (!v) {
          v = this.makeChar(def.model, def.scale * CHAR_SCALE, en.kind);
          v.group.position.set(en.x, 0, en.y);
          this.enemies.set(en.id, v);
          this.scene.add(v.group);
        }
        visible = this.placeChar(v, en.x, en.y, y, dt);
        tall = v.height;
        if (visible) {
          // Estados: atacando (parado ante un obstáculo), ralentizado (azulado y lento) y ardiendo (llamas, más abajo).
          const look = enemyLook(en, v.moving, v.still);
          this.setAnim(v, look.anim);
          if (v.acts.walk) v.acts.walk.timeScale = look.pace;
          setTint(v.group, v.skin, look.slowed ? SLOW_TINT : null);
          this.tickChar(v, dt);
        }
      } else {
        this.sphere.center.set(en.x, y + 0.5, en.y);
        visible = this.frustum.intersectsSphere(this.sphere);
        if (visible) this.drawLod(en.kind, en.x, y, en.y, en.id);
      }
      if (!visible) continue;
      this.mark(en.x, y, en.y, ENEMY_MARK);
      if (en.hp < en.maxHp) fx.bar(en.x, y + tall + 0.2, en.y, en.hp / en.maxHp, en.kind === 'tank' ? 0.8 : 0.5);
      if (dt <= 0) continue;
      if (en.burnTimer > 0 && Math.random() < dt * 14) {
        fx.flame(en.x, y + tall * (0.3 + Math.random() * 0.5), en.y, 0.3);
        if (Math.random() < 0.25) fx.smoke(en.x, y + tall, en.y, 0x3a3a40, 0.1);
      }
      if (en.slowTimer > 0 && Math.random() < dt * 4) {
        fx.pool.spawn({ kind: 0, x: en.x + (Math.random() - 0.5) * 0.4, y: y + tall * 0.8, z: en.y + (Math.random() - 0.5) * 0.4, vy: -0.5, max: 0.6, s0: 0.07, s1: 0.03, color: 0xe8fbff });
      }
    }
    for (const lod of this.lod.values()) for (const im of lod.meshes) im.instanceMatrix.needsUpdate = true;
    for (const [id, v] of this.enemies) {
      if (seenE.has(id)) continue;
      this.enemies.delete(id);
      // Si sigue vivo es que ha salido del presupuesto de animados (pasa a instancia), no que haya muerto.
      this.dropChar(v, !aliveIds.has(id));
    }
    // Caídas en curso.
    this.dying = this.dying.filter((d) => {
      d.t -= dt;
      d.v.mixer.update(dt);
      if (d.t < 0.25) d.v.group.scale.setScalar(Math.max(0.01, d.t / 0.25));
      if (d.t > 0) return true;
      this.scene.remove(d.v.group);
      return false;
    });
  }

  /** Dibuja un enemigo lejano como instancia estática (pose base, giro según su id). */
  private drawLod(kind: EnemyKind, x: number, y: number, z: number, id: number): void {
    let lod = this.lod.get(kind);
    if (!lod) {
      const def = ENEMY_MODEL[kind];
      const g = instance(def.model, undefined, def.scale * CHAR_SCALE);
      g.updateMatrixWorld(true);
      const meshes: THREE.InstancedMesh[] = [];
      const locals: THREE.Matrix4[] = [];
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const im = new THREE.InstancedMesh(m.geometry, m.material, MAX_LOD);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = true;
        this.scene.add(im);
        meshes.push(im);
        locals.push(m.matrixWorld.clone());
      });
      lod = { meshes, locals };
      this.lod.set(kind, lod);
    }
    const n = lod.meshes[0].count;
    if (n >= MAX_LOD) return;
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (id * 2.399) % 6.283), new THREE.Vector3(1, 1, 1));
    lod.meshes.forEach((im, i) => {
      im.setMatrixAt(n, base.clone().multiply(lod!.locals[i]));
      im.count = n + 1;
    });
    this.stats.lodChars++;
  }

  // ---------- eventos, resaltado y fantasma ----------
  private handleEvents(): void {
    const w = this.game.world;
    const fx = this.fx;
    const ground = (x: number, y: number) => heightAtPoint(w, x, y) * LEVEL_H;
    this.deadNpcs.clear();
    for (const ev of this.game.drainEvents()) {
      if (ev.type === 'npcDied') {
        this.onMessage('¡Un NPC ha muerto!');
        this.deadNpcs.add(ev.id);
        fx.pop(ev.x, ground(ev.x, ev.y) + 0.6, ev.y, 0xff5555, 0.7);
      } else if (ev.type === 'npcArrived') this.onMessage('Ha llegado una persona nueva a la colonia');
      else if (ev.type === 'npcLeft') this.onMessage('Alguien se ha marchado por el hambre');
      else if (ev.type === 'wave') this.onMessage(`¡Oleada ${ev.wave}!`);
      else if (ev.type === 'researched') this.onMessage('Investigación completada');
      else if (ev.type === 'kill') fx.pop(ev.x, ground(ev.x, ev.y) + 0.6, ev.y, 0xffd166, 0.6);
      else if (ev.type === 'destroyed') fx.explosion(ev.x + 0.5, ground(ev.x + 0.5, ev.y + 0.5), ev.y + 0.5, 1);
      else if (ev.type === 'coreHit') {
        const c = this.game.core;
        const h = this.buildings.get(c.id)?.height ?? 1.5;
        fx.pop(c.x + c.w / 2, this.levelTop(c) + h * 0.6, c.y + c.d / 2, 0xff4040, 1.1);
      }
      if (ev.type !== 'shot') continue;
      const v = this.buildings.get(ev.towerId);
      const yaw = Math.atan2(ev.toX - ev.fromX, ev.toY - ev.fromY);
      if (v) {
        v.recoil = 1;
        v.yaw = yaw;
      }
      // Sale de la boca del cañón y llega a media altura del objetivo (más arriba si vuela).
      const y0 = v?.pivot ? v.group.position.y + v.pivot.position.y + 0.12 : ground(ev.fromX, ev.fromY) + 0.9;
      let lift = 0;
      for (const en of this.game.enemies) {
        if (Math.abs(en.x - ev.toX) < 0.05 && Math.abs(en.y - ev.toY) < 0.05) {
          lift = ENEMY_MODEL[en.kind].lift;
          break;
        }
      }
      const from = new THREE.Vector3(ev.fromX + Math.sin(yaw) * 0.42, y0, ev.fromY + Math.cos(yaw) * 0.42);
      const to = new THREE.Vector3(ev.toX, ground(ev.toX, ev.toY) + lift + 0.5, ev.toY);
      fx.shot(ev.kind, from, to, CONFIG.turrets[ev.kind].area);
    }
  }

  /** Humo de chimeneas y de edificios dañados, y barras de vida de los edificios tocados. */
  private syncBuildingFx(dt: number): void {
    for (const b of this.game.buildings.values()) {
      if (!b.built) continue;
      const hurt = b.hp < b.maxHp && !isWallKind(b.kind);
      const src = smokeSources(b);
      if (!hurt && !src.length) continue;
      const cx = b.x + b.w / 2;
      const cz = b.y + b.d / 2;
      const base = this.levelTop(b);
      this.sphere.center.set(cx, base + 1, cz);
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const h = this.buildings.get(b.id)?.height ?? 1;
      if (hurt) this.fx.bar(cx, base + h + 0.82, cz, b.hp / b.maxHp, 0.5 + 0.2 * b.w, 0xff9f43);
      if (dt <= 0) continue;
      for (const s of src) {
        if (Math.random() >= s.rate * dt) continue;
        this.fx.smoke(cx + s.dx, base + (s.fromTop ? h : h * 0.6), cz + s.dz, s.color, s.size);
        if (s.sparks && Math.random() < 0.6) this.fx.flame(cx, base + h * 0.5, cz, 0.18);
      }
    }
  }

  /** Coloca los agujeros de transparencia: A = casilla bajo el cursor, B = edificio seleccionado. */
  private updateHoles(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const unit = this.rig.ppu * this.rig.zoom * this.renderer.getPixelRatio();
    const range = this.camera.far - this.camera.near;
    const set = (h: THREE.Vector4, p: THREE.Vector3 | null, extra = 0) => {
      const margin = (HOLE_MARGIN + extra) / range;
      if (!p) return void h.set(0, 0, 0, 0);
      p.project(this.camera);
      h.set((p.x * 0.5 + 0.5) * size.x, (p.y * 0.5 + 0.5) * size.y, (HOLE_RADIUS + extra * 0.5) * unit, p.z * 0.5 + 0.5 - margin);
    };
    const w = this.game.world;
    const t = this.hover;
    // Sin herramienta, apuntar al cuerpo de un edificio lo elige (no se trama). Con herramienta, se trama para construir detrás.
    const placing = !!this.buildKind || this.removeMode;
    const peek = t && !this.game.buildingAt(t.x, t.y) && (placing || this.bodyPick === null);
    set(HOLES.a.value, t && peek ? new THREE.Vector3(t.x + 0.5, heightAt(w, t.x, t.y) * LEVEL_H + 0.35, t.y + 0.5) : null);
    const sb = this.selectedId !== null ? this.game.buildings.get(this.selectedId) : undefined;
    // Un edificio grande necesita más margen para no tramarse a sí mismo.
    set(HOLES.b.value, sb ? new THREE.Vector3(sb.x + sb.w / 2, this.levelTop(sb) + (this.buildings.get(sb.id)?.height ?? 1) * 0.5, sb.y + sb.d / 2) : null, sb ? Math.max(sb.w, sb.d) - 1 : 0);
  }

  /** Añade la marca de "tapado" de un personaje: un disco hacia la cámara, adelantado para no chocar con su propio cuerpo. */
  private mark(x: number, y: number, z: number, color: THREE.Color): void {
    if (this.markerN >= MAX_MARKERS) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.55, z).addScaledVector(this.toCamera, 0.7), this.camera.quaternion, new THREE.Vector3(1, 1, 1));
    this.markers.setMatrixAt(this.markerN, m);
    this.markers.setColorAt(this.markerN, color);
    this.markerN++;
  }

  private updateHighlights(): void {
    const w = this.game.world;
    const set = (g: THREE.Object3D, t: Tile | null) => {
      g.visible = !!t;
      if (t) g.position.set(t.x + 0.5, heightAt(w, t.x, t.y) * LEVEL_H + 0.05, t.y + 0.5);
    };
    set(this.hoverMesh, this.hover);
    const sb = this.selectedId !== null ? this.game.buildings.get(this.selectedId) : undefined;
    this.selMesh.visible = !!sb;
    if (sb) {
      this.selMesh.position.set(sb.x + sb.w / 2, this.levelTop(sb) + 0.05, sb.y + sb.d / 2);
      this.selMesh.scale.set(sb.w * 1.04, 1, sb.d * 1.04);
    }
    const quad = this.hoverMesh.children[0] as THREE.Mesh;
    const mat = quad.material as THREE.MeshBasicMaterial;
    mat.color.setHex(0xffffff);
    if (this.removeMode && this.hover) {
      const rb = this.game.buildingAt(this.hover.x, this.hover.y);
      mat.color.setHex(rb && rb.kind !== 'core' ? 0xff5555 : 0x888888);
      if (rb) {
        this.hoverMesh.position.set(rb.x + rb.w / 2, this.levelTop(rb) + 0.06, rb.y + rb.d / 2);
        this.hoverMesh.scale.set(rb.w, 1, rb.d);
      }
    } else this.hoverMesh.scale.set(1, 1, 1);
    // Fantasma de construcción.
    const key = this.buildKind && this.hover ? `${this.buildKind}|${this.buildDir}` : '';
    if (key !== this.ghostKey) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostKey = key;
      if (key) {
        const fake = { kind: this.buildKind, dir: this.buildDir, built: false, x: 0, y: 0, w: 1, d: 1, progress: 1 } as unknown as Building;
        const v = this.makeBuilding(fake, `${this.buildKind}|${this.buildDir}|0----`);
        this.ghost = v.group;
        this.scene.add(this.ghost);
      }
    }
    if (this.ghost) {
      this.ghost.visible = !!this.hover;
      if (this.hover) {
        this.ghost.position.set(this.hover.x + 0.5, heightAt(w, this.hover.x, this.hover.y) * LEVEL_H, this.hover.y + 0.5);
        const ok = this.game.canPlace(this.buildKind!, this.hover.x, this.hover.y).ok;
        mat.color.setHex(ok ? 0x70ff90 : 0xff6060);
      }
    }
  }

  // ---------- bucle ----------
  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h || (w === this.lastW && h === this.lastH)) return;
    this.lastW = w;
    this.lastH = h;
    this.renderer.setSize(w, h);
  }

  setOutline(on: boolean): void {
    this.opts.outline = on;
    this.outline.enabled = on;
  }

  /** Enciende o apaga las sombras (las más caras de la escena). */
  setShadows(on: boolean): void {
    this.opts.shadows = on;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) for (const mt of Array.isArray(m) ? m : [m]) mt.needsUpdate = true;
    });
  }

  /** Estadísticas del renderizador (para medir rendimiento). */
  info(): { calls: number; triangles: number; fps: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, fps: this.fps };
  }

  frame(dt: number): void {
    this.resize();
    if (!this.lastW) return;
    this.time += dt;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    const k = this.keys;
    this.rig.move((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0), (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0), 14, dt);
    this.rig.update(dt);
    const hh = this.rig.halfHeight(this.lastH);
    const aspect = this.lastW / this.lastH;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.left = -hh * aspect;
    this.camera.right = hh * aspect;
    this.camera.updateProjectionMatrix();
    const p = this.rig.position(100);
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.lookAt(this.rig.x, 0, this.rig.z);
    this.camera.updateMatrixWorld();
    this.sun.position.set(this.rig.x + 25, 50, this.rig.z + 15);
    this.sun.target.position.set(this.rig.x, 0, this.rig.z);
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    this.frameNo++;
    this.markerN = 0;
    this.toCamera.set(0, 0, 1).transformDirection(this.camera.matrixWorld);
    this.stats.charsAnimated = 0;
    this.stats.charsSkipped = 0;
    this.inView = this.inViewNext;
    this.inViewNext = 0;
    // Con la partida en pausa, personajes y partículas se quedan quietos.
    const sdt = this.simPaused ? 0 : dt;
    this.fx.begin(this.camera);
    this.handleEvents();
    this.syncBuildings(dt);
    this.syncChars(sdt);
    this.syncBuildingFx(sdt);
    this.updateHighlights();
    this.overlay.update({ selectedId: this.selectedId, hoverBuildingId: this.hoverBuildingId, tool: this.buildKind, dir: this.buildDir, hover: this.hover, time: this.time, dt });
    this.fx.update(sdt, this.camera);
    this.updateHoles();
    this.markers.count = this.markerN;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    this.renderer.info.reset();
    this.outline.render(this.scene, this.camera);
  }

  counts(): { buildings: number; npcs: number; enemies: number } {
    return { buildings: this.buildings.size, npcs: this.npcs.size, enemies: this.enemies.size };
  }
}
