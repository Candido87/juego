/**
 * Vista 3D del juego: lee el MISMO `Game` (sin duplicar lógica) y lo dibuja con Three.js.
 * Cámara ortográfica isométrica, terreno instanciado, edificios, cintas, tuberías, NPCs, enemigos y torretas.
 */
import * as THREE from 'three';
import { CONFIG } from '../game/config';
import { Building, Enemy, Game } from '../game/game';
import { BUILD_KINDS, DX, DY, Dir, BuildKind, EnemyKind, ItemId, TurretKind, WallKind } from '../game/types';
import { heightAt, heightAtPoint } from '../game/world';
import { ROLE_LOOK, TURRET_COLOR, TurretState, carried, enemyLook, npcAnim, smokeSources, turretLook, turretState } from './actors';
import { BUILDING_PARTS, CHAR_SCALE, ENEMY_MODEL, allModels } from './catalog';
import { AirFleet, dropsBomb } from './aereos3d';
import { maskOf as connMask, pipeConnections, planFor } from '../game/conexiones';
import { Effects } from './effects3d';
import { CameraRig } from './camera';
import { HOLES, OutlinePass, patchMaterial } from './fx';
import { animations, instance, preload, tint } from './loader';
import { WALL_KINDS, isWallKind, wallDamage } from '../view/muros';
import { ConnectAids, GuideAids, Overlay } from './overlay3d';
import { LEVEL_H, pickBox, pickTile3D } from './pick';
import { slopeLower, tileSurface } from './relieve';
import { CINTA_PIEZAS, aspectF, aspectSy, escalaPieza } from './aspectos';
import { ITEM_SHAPES, ItemShape, armsFor, beltConnectors, beltItemPose, coneSpots, rampCenter, rampItemLift, rampSlope, beltPiece, itemShape, maskOf, quarterYaw, yawToDir } from './pieces';
import { ITEM_COLORS } from '../view/itemColors';
import { beltStopped } from './status';
import { ThreatMarks } from './threat3d';
import { QUALITY, QualityPreset } from './quality';
import { techNode } from '../game/tecnologia';
import { TurretRig, animateRig, buildTurret, scaffold, turretDamage } from './turrets3d';
import { BeltFlow, BeltInfo } from './beltflow';
import { powerMult } from '../game/power';
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
  /** Semilla del mapa: de ella salen las zonas de terreno y la decoración (por defecto 7). */
  seed?: number;
}
export const OPT_ON: ViewOptions = { batch: true, cull: true, chunk: 32, shadows: true, outline: true };
export const OPT_OFF: ViewOptions = { batch: false, cull: false, chunk: 0, shadows: true, outline: false };
/** Grosor de las tuberías respecto al modelo (1 = ocupa la casilla entera). */
/** Grosor de la tubería (la cinta ocupa casi toda la casilla; la tubería es más fina y lleva bridas en las juntas). */
const PIPE_T = CONFIG.scale.pipeDiameter;
/** Elevación del tubo para que las bridas (más anchas) apoyen en el suelo: radio de la brida menos radio del tubo. */
const PIPE_LIFT = Math.max(0, (CONFIG.scale.pipeFlange - CONFIG.scale.pipeDiameter) / 2);
/** Tinte de la tubería según el líquido que lleva (sin líquido: sin tinte). */
const PIPE_LIQUID_TINT: Record<string, number> = { oil: 0x6b4a2a, gasoline: 0xe3cf3a };
const FAST_TINT = 0xbfe0ff;
/** Altura de la cara superior de una cinta sobre su casilla (donde va la textura de dirección). */
const BELT_TOP = CONFIG.scale.beltHeight;
/** Cinta parada por falta de energía: se ve apagada. */
const BELT_OFF_TINT = 0xa4a9b8;
/** Segundos de temblor de cámara cuando golpean el núcleo. */
const SHAKE_TIME = 0.14;
/** Geometría de cada forma de objeto sobre las cintas y altura de su centro sobre la cinta. */
export /** Cada objeto descansa sobre la superficie de la cinta: `y` = alto de la cinta + la mitad de su propia altura (lado máximo 0,15–0,25). */
const rests = (half: number) => CONFIG.scale.beltHeight + half;
export const ITEM_GEO: Record<ItemShape, { geo: THREE.BufferGeometry; y: number }> = {
  lump: { geo: new THREE.DodecahedronGeometry(0.11, 0), y: rests(0.11) },
  log: { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.25, 8).rotateZ(Math.PI / 2), y: rests(0.055) },
  slab: { geo: new THREE.BoxGeometry(0.25, 0.06, 0.18), y: rests(0.03) },
  disc: { geo: new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12), y: rests(0.03) },
  shell: { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.18, 8), y: rests(0.09) },
  crate: { geo: new THREE.BoxGeometry(0.2, 0.16, 0.2), y: rests(0.08) },
};
/** Piezas del Factory Kit del ascensor: tolva de carga/descarga y cinta de barras (aspectos.ts documenta el mapeo). */
const ELEVATOR_PARTS = { tolva: 'factory/hopper-square', cinta: 'factory/conveyor-sides' } as const;
const CONNECTOR_GEO = new THREE.BoxGeometry(0.06, CONFIG.scale.beltHeight + 0.06, CONFIG.scale.beltWidth + 0.14);
const CONNECTOR_MAT = new THREE.MeshStandardMaterial({ color: 0xffb347, flatShading: true, roughness: 0.7 });
const RAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xc9cdd9, flatShading: true, roughness: 0.9 });
const RAIL_OFF_MAT = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, flatShading: true, roughness: 1 });
const BELT_HUB_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3b4d, flatShading: true, roughness: 1 });
patchMaterial(RAIL_MAT);
patchMaterial(RAIL_OFF_MAT);
patchMaterial(BELT_HUB_MAT);
const HUB_GEO = new THREE.SphereGeometry(0.5, 8, 6);
const HUB_MAT = new THREE.MeshStandardMaterial({ color: 0x5f5d78, flatShading: true, roughness: 1, metalness: 0 });
patchMaterial(HUB_MAT);
const PIPE_CONNECTOR_GEO = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12).rotateZ(Math.PI / 2);
const FLANGE_GEO = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 10).rotateZ(Math.PI / 2);
const FLANGE_MAT = new THREE.MeshStandardMaterial({ color: 0xaeb0c8, flatShading: true, roughness: 0.8, metalness: 0.1 });
patchMaterial(FLANGE_MAT);
/** Las bridas toman el color del líquido (petróleo marrón, gasolina amarilla): se ve de un vistazo qué lleva cada tubería. */
const FLANGE_BY_LIQUID: Record<string, THREE.Material> = {};
for (const [k, c] of Object.entries({ oil: 0x9a6330, gasoline: 0xf2e040 })) {
  const m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.7, metalness: 0.1 });
  patchMaterial(m);
  FLANGE_BY_LIQUID[k] = m;
}
/** Aspecto de cada muro: alto, color del cuerpo y de la albardilla. Son cajas macizas (los modelos del pack eran barandillas). */
const WALL_STYLE: Record<WallKind, { h: number; color: number; cap: number }> = {
  wall_wood: { h: 0.7, color: 0xa8713f, cap: 0x7d4f2a },
  wall_stone: { h: 0.95, color: 0xa9afb6, cap: 0x858c95 },
  wall_metal: { h: 1.2, color: 0x7f93ad, cap: 0xd0d8e4 },
};
const WALL_W = 0.36;
const GATE_COLOR = 0xb9824a;
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const PLINTH_MAT = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, flatShading: true, roughness: 1 });
patchMaterial(PLINTH_MAT);
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
/** Piezas simples de los edificios hechos con figuras (poste, batería...). */
const CYL_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const glowMats = new Map<number, THREE.MeshBasicMaterial>();
/** Material que brilla solo (franjas y pilotos). */
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
  /** Torreta: z de reposo del arma y boca del cañón (distancia hacia delante y altura sobre el pivote). */
  gunRest?: number;
  /** Torreta: el modelo entero (para animar cristales, luces y brillos). */
  rig?: TurretRig;
  muzzle?: { fwd: number; y: number };
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
  private air = new AirFleet(this.scene);
  private dying: { v: CView; t: number }[] = [];
  private deadNpcs = new Set<number>();
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
  /** Humo, disparos, explosiones y barras de vida. */
  readonly fx = new Effects();
  /** La partida está en pausa: personajes y partículas se congelan (lo pone la interfaz). */
  simPaused = false;
  /** Ayudas de la guía sobre el mapa (las pone la interfaz cada fotograma). */
  guide: GuideAids | null = null;
  /** Herramienta Conectar (null = no activa). */
  connect: ConnectAids | null = null;
  private hoverMesh: THREE.Group;
  private selMesh: THREE.LineSegments;
  private cones = new Map<number, THREE.Group[]>();
  private denied: THREE.Group | null = null;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private ghostMats: THREE.MeshStandardMaterial[] = [];
  private keys = new Set<string>();
  private lastW = 0;
  private lastH = 0;
  private time = 0;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  /** Vista de logística (L): mapa atenuado y puertos y conexiones resaltados. */
  logistics = false;
  fps = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private batchGroup: THREE.Group | null = null;
  /** Textura de dirección animada de las cintas. */
  readonly flow = new BeltFlow();
  private flowInfos: BeltInfo[] = [];
  private batchDirty = false;
  private fadeAt = -1;
  private faded = new Set<string>();
  private batchAge = 0;
  private belts: Building[] = [];
  private itemMeshes = new Map<ItemShape, THREE.InstancedMesh>();
  private threat: ThreatMarks;
  /** Piloto rojo en el borde de cada cinta parada por falta de energía. */
  private beltLamps: THREE.InstancedMesh;
  private shake = 0;
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
  /** Nivel de calidad aplicado (ver `setQuality`). */
  quality: QualityPreset = QUALITY.high;

  constructor(private host: HTMLElement, readonly game: Game, readonly opts: ViewOptions = OPT_ON) {
    // El suavizado de bordes lo pone el pase de contorno (según la calidad), no el lienzo: así se cambia sin recargar.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.info.autoReset = false;
    this.outline = new OutlinePass(this.renderer);
    this.outline.enabled = opts.outline;
    this.markers = new THREE.InstancedMesh(new THREE.CircleGeometry(0.17, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthFunc: THREE.GreaterDepth, depthWrite: false }), MAX_MARKERS);
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 10;
    this.scene.add(this.markers);
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x9fd0e8);
    this.scene.fog = new THREE.Fog(0x9fd0e8, 140, 300);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.7);
    this.scene.add(this.hemi);
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

    // Objetos sobre las cintas: una malla instanciada por forma (terrón, tronco, losa, disco, cilindro, caja).
    const itemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9, metalness: 0 });
    for (const shape of ITEM_SHAPES) {
      const im = new THREE.InstancedMesh(ITEM_GEO[shape].geo, itemMat, MAX_ITEMS);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = true;
      im.setColorAt(0, new THREE.Color(0xffffff));
      this.itemMeshes.set(shape, im);
      this.scene.add(im);
    }
    this.beltLamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.07, 0.13), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), MAX_ITEMS);
    this.beltLamps.count = 0;
    this.beltLamps.frustumCulled = false;
    this.scene.add(this.beltLamps);
    this.threat = new ThreatMarks(game);
    this.scene.add(this.threat.group);

    this.overlay = new Overlay(game, (b) => this.levelTop(b), (b) => this.buildings.get(b.id)?.height ?? 1);
    this.scene.add(this.overlay.group);
    this.scene.add(this.fx.group);
    this.scene.add(this.flow.group);

    const c = game.core;
    this.rig.x = c.x + 1;
    this.rig.z = c.y + 1;
    this.rig.zoom = 1.1;
    this.bindInput();
  }

  async init(onProgress?: (d: number, t: number) => void): Promise<void> {
    await preload(allModels(), onProgress);
    this.terrain = buildTerrain(this.game.world, this.game.core, this.opts.seed ?? 7, this.opts.chunk, this.game.spawns);
    this.terrain.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.receiveShadow = true;
    });
    this.scene.add(this.terrain.group);
  }

  /**
   * Miniaturas de los modelos para el menú de construcción: dibuja cada edificio aparte, en la misma perspectiva del
   * juego y con fondo transparente, y devuelve una imagen (data URL) por tipo. Llamar después de `init`.
   */
  thumbnails(size = 72, kinds: readonly BuildKind[] = BUILD_KINDS): Partial<Record<BuildKind, string>> {
    const out: Partial<Record<BuildKind, string>> = {};
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(3, 6, 2);
    scene.add(sun);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
    const buf = new Uint8Array(size * size * 4);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return out;
    const img = ctx.createImageData(size, size);
    // La textura guarda color lineal: se pasa a sRGB (y se deshace el premultiplicado de los bordes suavizados).
    const srgb = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      srgb[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
    }
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const shadows = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    r.setClearColor(0x000000, 0);
    HOLES.a.value.set(0, 0, 0, 0);
    HOLES.b.value.set(0, 0, 0, 0);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    const dir = new THREE.Vector3(1, 0.82, 1).normalize();
    for (const kind of kinds) {
      const fake = { id: -1, kind, x: 0, y: 0, w: 1, d: 1, dir: 0, built: true, hp: 1, maxHp: 1 } as unknown as Building;
      const v = this.makeBuilding(fake, `${kind}|0|1|----`);
      scene.add(v.group);
      box.setFromObject(v.group).getCenter(center);
      const half = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.3) * 0.92;
      cam.left = cam.bottom = -half;
      cam.right = cam.top = half;
      cam.position.copy(center).addScaledVector(dir, 20);
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      r.setRenderTarget(rt);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s = ((size - 1 - y) * size + x) * 4;
          const d = (y * size + x) * 4;
          const a = buf[s + 3];
          const k = a > 0 ? 255 / a : 0;
          for (let c = 0; c < 3; c++) img.data[d + c] = srgb[Math.min(255, Math.round(buf[s + c] * k))];
          img.data[d + 3] = a;
        }
      }
      ctx.putImageData(img, 0, 0);
      out[kind] = canvas.toDataURL();
      scene.remove(v.group);
    }
    r.setRenderTarget(null);
    r.setClearColor(prevColor, prevAlpha);
    r.shadowMap.enabled = shadows;
    rt.dispose();
    return out;
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
    // La base descansa sobre la superficie más alta de su huella, con un margen mínimo contra el parpadeo (ver relieve.ts).
    let m = 0;
    for (let y = 0; y < b.d; y++) for (let x = 0; x < b.w; x++) m = Math.max(m, tileSurface(this.game.world, b.x + x, b.y + y));
    return m + CONFIG.scale.groundMargin;
  }

  private isKind(x: number, y: number, kinds: string[]): Building | null {
    const b = this.game.buildingAt(x, y);
    return b && kinds.includes(b.kind) ? b : null;
  }

  /** Firma que cambia cuando hay que reconstruir el modelo (orientación, vecinos, estado). */
  private signature(b: Building): string {
    let s = `${b.kind}|${b.dir}|${b.built ? 1 : 0}`;
    if (isWallKind(b.kind)) s += `|d${wallDamage(b.hp, b.maxHp)}`;
    if (b.kind in CONFIG.turrets) s += `|L${this.game.turretLevel[b.kind as TurretKind]}|D${turretDamage(b.hp, b.maxHp)}`;
    if (b.kind === 'belt' || b.kind === 'belt_fast') {
      if (beltStopped(b)) s += '|off';
      s += `|s${this.beltSlope(b)}`;
      const fb = this.game.buildingAt(b.x + DX[b.dir], b.y + DY[b.dir]);
      const bb = this.game.buildingAt(b.x + DX[(b.dir + 2) % 4], b.y + DY[(b.dir + 2) % 4]);
      s += `|c${fb && !this.isBeltKind(fb) ? 'f' : '-'}${bb && !this.isBeltKind(bb) ? 'b' : '-'}`;
      for (let d = 0; d < 4; d++) {
        const n = this.isKind(b.x + DX[d], b.y + DY[d], ['belt', 'belt_fast']);
        s += n && n.dir === (d + 2) % 4 ? 'i' : '-';
      }
    } else if (b.kind === 'elevator') {
      s += '|e' + Math.max(-CONFIG.elevator.maxRise, Math.min(CONFIG.elevator.maxRise, this.game.slopeAhead(b)));
    } else if (b.kind === 'pipeline') {
      s += `|q${Object.keys(b.inv).find((k) => (b.inv[k as ItemId] ?? 0) > 0) ?? ''}`;
      // Conexiones con la MISMA regla que la lógica de redes (conexiones.ts): lados con unión y, de ellos, los que dan a una máquina (conector físico).
      const pc = pipeConnections(this.game, b);
      s += '|k';
      for (let d = 0; d < 4; d++) s += pc.machines & (1 << d) ? 'k' : '-';
      for (let d = 0; d < 4; d++) s += pc.mask & (1 << d) ? 'p' : '-';
    } else if (isWallKind(b.kind)) {
      for (let d = 0; d < 4; d++) s += this.isKind(b.x + DX[d], b.y + DY[d], WALL_LINK) ? 'w' : '-';
    } else if (b.kind === 'wall_gate') {
      for (let d = 0; d < 4; d++) s += this.isKind(b.x + DX[d], b.y + DY[d], WALL_LINK) ? 'w' : '-';
    }
    return s;
  }

  private isBeltKind(b: Building): boolean {
    return b.kind === 'belt' || b.kind === 'belt_fast';
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
      // Cinta del Factory Kit de Kenney a la medida de CONFIG.scale (0,65 × 0,18, 1 de largo): pieza recta con laterales estirada
      // (aspectos.ts: CINTA_PIEZAS). Recta = un tramo entero; curva, T o cruce = medio tramo hacia cada lado abierto y, en el
      // centro, la pieza de cruce a escala. La rapida usa la variante de franja naranja.
      const sc = CONFIG.scale;
      const set = CINTA_PIEZAS[kind === 'belt_fast' ? 'rapida' : 'normal'];
      const off = sig.includes('|off');
      const piece = (model: string, len: number, cx: number): THREE.Group => {
        const holder = new THREE.Group();
        const o = instance(model, undefined, 1);
        if (off) tint(o, BELT_OFF_TINT);
        const [sx, sy, sz] = escalaPieza(model, sc.beltWidth, sc.beltHeight);
        o.scale.set(len * sx, sy, sz);
        o.position.x = cx;
        holder.add(o);
        return holder;
      };
      const incoming = on('i');
      const only = incoming.every((d) => d === (b.dir + 2) % 4);
      const slope = Number(/\|s(-?\d)/.exec(sig)?.[1] ?? 0);
      if (only) {
        const holder = piece(set.recta, 1, 0);
        holder.rotation.set(0, yawToDir(b.dir), slope * Math.atan(LEVEL_H), 'XYZ');
        // Rampa: la pieza se inclina para unir los dos niveles (sube LEVEL_H a lo largo de la casilla).
        holder.position.y = rampCenter(slope, LEVEL_H);
        group.add(holder);
      } else {
        const arms = new Set<number>([b.dir, ...incoming]);
        for (const d of arms) {
          const holder = piece(set.recta, 0.5, 0.25);
          holder.rotation.y = yawToDir(d);
          group.add(holder);
        }
        group.add(piece(set.hub, 1, 0));
      }
      // Conectores físicos: placa de brida en el borde de la casilla que da a un edificio (puerto de entrada o de salida).
      const cf = /\|c(.)(.)/.exec(sig);
      for (const d of beltConnectors(b.dir, incoming, cf?.[1] === 'f', cf?.[2] === 'b')) {
        const plate = new THREE.Mesh(CONNECTOR_GEO, CONNECTOR_MAT);
        plate.position.set(0.47, sc.beltHeight / 2 + 0.01, 0);
        const h = new THREE.Group();
        h.rotation.y = yawToDir(d);
        h.add(plate);
        group.add(h);
      }
      top = sc.beltHeight;
    } else if (kind === 'elevator') {
      // Ascensor de cintas con piezas del Factory Kit: tolva de entrada, cinta de barras inclinada hasta la altura de salida,
      // tolva de salida y un poste. El desnivel (en niveles) viene de la firma (`|e<n>`): sube (n>0) o baja (n<0) hasta la casilla de delante.
      const sc = CONFIG.scale;
      const rise = Number(/\|e(-?\d)/.exec(sig)?.[1] ?? 0);
      const s = rise * LEVEL_H;
      const run = 0.7;
      const len = Math.hypot(run, s);
      const root = new THREE.Group();
      root.rotation.y = yawToDir(b.dir);
      const hop = (x: number, y: number) => {
        const h = instance(ELEVATOR_PARTS.tolva, 0.46, 1);
        h.position.set(x, y, 0);
        root.add(h);
      };
      hop(-0.38, 0);
      hop(0.38, s);
      const tilt = new THREE.Group();
      const belt = instance(ELEVATOR_PARTS.cinta, undefined, 1);
      const [ex, ey, ez] = escalaPieza(ELEVATOR_PARTS.cinta, sc.beltWidth, sc.beltHeight);
      belt.scale.set(len * ex, ey, ez);
      tilt.add(belt);
      tilt.position.set(0, s / 2 + 0.2, 0);
      tilt.rotation.z = Math.atan2(s, run);
      root.add(tilt);
      for (const [px, py] of [[-0.3, 0], [0.3, s]] as const) {
        const ph = Math.max(Math.abs(py), 0.2) + 0.2;
        const post = new THREE.Mesh(BOX_GEO, FLANGE_MAT);
        post.scale.set(0.1, ph, 0.1);
        post.position.set(px, py + 0.2 - ph / 2, 0.34);
        root.add(post);
        const post2 = post.clone();
        post2.position.z = -0.34;
        root.add(post2);
      }
      group.add(root);
      top = Math.max(0, s) + 0.45;
    } else if (kind === 'pipeline') {
      // Tubería: tramo recto, o medios tramos hacia cada vecino con un codo central.
      // Pieza y giro: tabla única de conexiones (conexiones.ts). Tramo aislado y extremo llevan tapa; recta, un tubo entero;
      // curva, T y cruce, medios tubos hacia cada lado abierto con una pieza central.
      const plan = planFor(connMask(on('p')));
      const liquid = /\|q(\w*)/.exec(sig)?.[1] ?? '';
      const flangeMat = FLANGE_BY_LIQUID[liquid] ?? FLANGE_MAT;
      // Tubo de largo `len` centrado en `cx` a lo largo de la dirección d, con bridas (o tapas) en las posiciones `flanges`.
      const tube = (d: number, len: number, cx: number, flanges: number[]) => {
        const holder = new THREE.Group();
        holder.rotation.y = yawToDir(d);
        const o = instance('factory/pipe-large', 1);
        o.scale.set(len, PIPE_T, PIPE_T);
        o.position.x = cx;
        if (PIPE_LIQUID_TINT[liquid]) tint(o, PIPE_LIQUID_TINT[liquid]);
        holder.add(o);
        for (const sx of flanges) {
          const fl = new THREE.Mesh(FLANGE_GEO, flangeMat);
          fl.position.set(sx, PIPE_T * 0.5, 0);
          fl.scale.set(1, CONFIG.scale.pipeFlange, CONFIG.scale.pipeFlange);
          holder.add(fl);
        }
        holder.position.y = PIPE_LIFT;
        group.add(holder);
      };
      // Anillo de conexión pegado a la máquina vecina (donde el tubo "encaja").
      const kf = /\|k([k-]{4})/.exec(sig)?.[1] ?? '----';
      for (let d = 0; d < 4; d++) {
        if (kf[d] !== 'k') continue;
        const ring = new THREE.Mesh(PIPE_CONNECTOR_GEO, CONNECTOR_MAT);
        const r = CONFIG.scale.pipeFlange * 1.25;
        ring.scale.set(1, r, r);
        ring.position.set(0.45, 0, 0);
        const h = new THREE.Group();
        h.rotation.y = yawToDir(d);
        h.position.y = PIPE_LIFT + PIPE_T * 0.5;
        h.add(ring);
        group.add(h);
      }
      if (plan.piece === 'isolated') tube(b.dir % 2, 0.5, 0, [0.22, -0.22]);
      else if (plan.piece === 'end') tube(plan.open[0], 0.5, 0.25, [0.47, 0.0]);
      else if (plan.piece === 'straight') tube(plan.open[0] % 2, 1, 0, [0.47, -0.47]);
      else {
        for (const d of plan.open) tube(d, 0.5, 0.25, [0.47]);
        const hub = new THREE.Mesh(HUB_GEO, HUB_MAT);
        hub.position.y = PIPE_T * 0.5 + PIPE_LIFT;
        hub.scale.setScalar(PIPE_T);
        group.add(hub);
      }
      // Soporte pequeño: las bridas (más gruesas que el tubo) descansan sobre el suelo sin hundirse.
      const saddle = new THREE.Mesh(BOX_GEO, FLANGE_MAT);
      saddle.scale.set(0.2, PIPE_LIFT + 0.01, 0.26);
      saddle.position.y = (PIPE_LIFT + 0.01) / 2;
      group.add(saddle);
      top = PIPE_T + PIPE_LIFT;
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
    } else if (kind in CONFIG.turrets) {
      // Torreta: base fija y torreta giratoria con su arma (ver `turrets3d.ts`). El juego gira `pivot` hacia el objetivo y
      // desliza `gun` para el retroceso.
      const rig = buildTurret(kind as TurretKind, turretLook(this.game, kind as TurretKind).level, b.built ? turretDamage(b.hp, b.maxHp) : 0);
      group.add(rig.root);
      // En obra: andamio alrededor.
      if (!b.built) group.add(scaffold(rig.height + 0.05));
      view.rig = rig;
      view.pivot = rig.head;
      view.gun = rig.gun;
      view.gunRest = rig.gunRest;
      view.muzzle = rig.muzzle;
      view.skin = skinOf(rig.head);
      top = rig.height;
    } else {
      parts.forEach((p) => {
        if (!p.model) {
          // Figura simple: caja o cilindro del tamaño y color indicados.
          const [sx, sy, sz] = p.size ?? [0.5, 0.5, 0.5];
          const mesh = new THREE.Mesh(p.prim === 'cyl' ? CYL_GEO : BOX_GEO, p.glow ? glowMat(p.color ?? 0xffffff) : wallMat(p.color ?? 0xffffff));
          const y0 = p.y ?? (p.stack ? top : 0);
          mesh.scale.set(sx, sy, sz);
          mesh.position.set(p.dx ?? 0, y0 + sy / 2, p.dz ?? 0);
          top = Math.max(top, y0 + sy);
          group.add(mesh);
          return;
        }
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
    // Registro de aspectos: factor de escala del modelo (aspectos.ts).
    const af = aspectF(kind);
    const asy = aspectSy(kind);
    if (af !== 1 || asy !== 1) group.scale.set(af, af * asy, af);
    view.height = top * af * asy;
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

  /**
   * Árboles que tapan: los que quedan entre la cámara y una cinta, tubería o edificio (hasta donde alcanza su altura en la
   * vista isométrica) se vuelven semitransparentes (`CONFIG.scale.tree.fade`). Se recalcula unas veces por segundo.
   */
  private fadeTrees(): void {
    if (this.time - this.fadeAt < 0.25) return;
    this.fadeAt = this.time;
    const yaw = this.rig.yaw;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const near = new Set<string>();
    const reach = CONFIG.scale.tree.maxHeight / Math.tan(Math.PI / 6);
    for (const b of this.game.buildings.values()) {
      for (let k = 0.6; k <= Math.min(reach, 2.4); k += 0.6) {
        for (const lat of [-0.5, 0, 0.5]) {
          const x = Math.floor(b.x + b.w / 2 + dx * k - dz * lat);
          const y = Math.floor(b.y + b.d / 2 + dz * k + dx * lat);
          near.add(`${x},${y}`);
        }
      }
    }
    for (const [x, y] of this.terrain.treeTiles()) {
      const k = `${x},${y}`;
      const hide = near.has(k) && !this.game.buildingAt(x, y);
      const was = this.faded.has(k);
      if (hide === was) continue;
      this.terrain.setFade(x, y, hide ? CONFIG.scale.tree.fade : 1);
      if (hide) this.faded.add(k);
      else this.faded.delete(k);
    }
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
        } else for (let yy = 0; yy < b.d; yy++) for (let xx = 0; xx < b.w; xx++) this.terrain.hideDecor(b.x + xx, b.y + yy);
        const old = v;
        v = this.makeBuilding(b, sig);
        if (old) v.yaw = old.yaw;
        this.buildings.set(b.id, v);
        v.group.position.set(b.x + b.w / 2, this.levelTop(b), b.y + b.d / 2);
        // Sobre una rampa de terreno la base queda en el borde alto: un zócalo de roca rellena el hueco por el lado bajo.
        if (b.w === 1 && b.d === 1 && slopeLower(this.game.world, b.x, b.y) !== null) {
          const plinth = new THREE.Mesh(BOX_GEO, PLINTH_MAT);
          const kf = aspectF(b.kind);
          const ky = kf * aspectSy(b.kind);
          plinth.scale.set(0.98 / kf, LEVEL_H / ky, 0.98 / kf);
          plinth.position.y = -LEVEL_H / 2 / ky;
          plinth.userData.plinth = true;
          v.group.add(plinth);
        }
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
      this.syncFlow(dt);
    }
  }

  /** Rampa de la cinta (ver `rampSlope`): sólo la cinta de abajo se inclina; la de arriba va llana. */
  private beltSlope(b: Building): number {
    const f = this.game.buildingAt(b.x + DX[b.dir], b.y + DY[b.dir]);
    const k = this.game.buildingAt(b.x - DX[b.dir], b.y - DY[b.dir]);
    const w = this.game.world;
    const h = heightAt(w, b.x, b.y);
    const aheadBelt = !!f && this.isBeltKind(f);
    const backFeeds = !!k && this.isBeltKind(k) && k.dir === b.dir;
    return rampSlope(aheadBelt, aheadBelt ? heightAt(w, f!.x, f!.y) - h : 0, backFeeds, backFeeds ? heightAt(w, k!.x, k!.y) - h : 0);
  }

  /** Datos de cada cinta para la capa de dirección: entradas (de la firma del modelo), velocidad real y altura. */
  private syncFlow(dt: number): void {
    const infos = this.flowInfos;
    infos.length = this.belts.length;
    for (let i = 0; i < this.belts.length; i++) {
      const b = this.belts[i];
      const flags = this.buildings.get(b.id)?.sig.slice(-4) ?? '----';
      const fast = b.kind === 'belt_fast';
      let info = infos[i];
      if (!info) info = infos[i] = { id: 0, x: 0, z: 0, top: 0, dir: 0, incoming: [], fast: false, speed: 0, slope: 0 };
      info.id = b.id;
      info.x = b.x;
      info.z = b.y;
      info.top = this.levelTop(b) + BELT_TOP;
      info.dir = b.dir;
      info.fast = fast;
      info.speed = (fast ? CONFIG.belt.fastSpeed : CONFIG.belt.speed) * powerMult(b);
      info.slope = this.beltSlope(b);
      info.incoming.length = 0;
      for (let d = 0; d < 4; d++) if (flags[d] === 'i') info.incoming.push(d);
    }
    this.flow.sync(infos, this.simPaused ? 0 : dt);
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
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (const im of this.itemMeshes.values()) im.count = 0;
    let lamps = 0;
    const tilt = new THREE.Matrix4();
    for (let i = 0; i < this.belts.length; i++) {
      const b = this.belts[i];
      // Entradas y rampa de la capa de dirección (misma cinta, mismo índice); si aún no se ha sincronizado, recta y llana.
      const info = this.flowInfos[i]?.id === b.id ? this.flowInfos[i] : undefined;
      const slope = info?.slope ?? 0;
      if (beltStopped(b) && lamps < MAX_ITEMS) {
        // El piloto va en el borde derecho de la cinta según su sentido (y a media altura de la rampa).
        m.makeTranslation(b.x + 0.5 - DY[b.dir] * 0.36, this.levelTop(b) + BELT_TOP + 0.1 + rampCenter(slope, LEVEL_H), b.y + 0.5 + DX[b.dir] * 0.36);
        this.beltLamps.setMatrixAt(lamps++, m);
      }
      if (!b.item) continue;
      const shape = itemShape(b.item);
      const im = this.itemMeshes.get(shape)!;
      const n = im.count;
      if (n >= MAX_ITEMS) continue;
      // Troncos y losas van a lo largo del recorrido: recto, en curva (entrada lateral) o subiendo la cuesta.
      const pose = beltItemPose(b.dir, info?.incoming ?? [], b.beltProgress);
      const p = Math.min(1, Math.max(0, b.beltProgress));
      m.makeRotationY(pose.yaw);
      if (slope !== 0) m.multiply(tilt.makeRotationZ(slope * Math.atan(LEVEL_H)));
      m.setPosition(b.x + 0.5 + pose.x, this.levelTop(b) + ITEM_GEO[shape].y + rampItemLift(slope, p, LEVEL_H), b.y + 0.5 + pose.z);
      im.setMatrixAt(n, m);
      im.setColorAt(n, c.setHex(ITEM_COLOR[b.item] ?? ITEM_COLORS[b.item] ?? 0xffffff));
      im.count = n + 1;
    }
    this.beltLamps.count = lamps;
    this.beltLamps.instanceMatrix.needsUpdate = true;
    // Parpadeo lento para que se vea que es un aviso.
    (this.beltLamps.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(this.time * 4) > -0.3 ? 0xff3b30 : 0x7a1a16);
    for (const im of this.itemMeshes.values()) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
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
    v.gun!.position.z = (v.gunRest ?? 0.15) - v.recoil * 0.1;
    // Cristales que laten, brillos, pilotos y luz roja de aviso.
    if (v.rig) animateRig(v.rig, this.time + b.id, ready, (x, y, z, s, c) => this.fx.glow(x, y, z, s, c));
    if (!ready) return;
    // Lista para disparar: brillo en la boca (láser y hielo) o llama piloto (fuego).
    const mu = v.muzzle ?? { fwd: 0.42, y: 0.12 };
    const mx = cx + Math.sin(v.yaw) * mu.fwd;
    const mz = cy + Math.cos(v.yaw) * mu.fwd;
    const my = v.group.position.y + pivot.position.y + mu.y;
    if (kind === 'turret_fire' && Math.random() < dt * 14) this.fx.flame(mx, my - 0.03, mz, 0.07);
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
        v = this.makeChar(look.model, look.scale * CHAR_SCALE * aspectF(`npc_${n.role}`), n.role, look.tint);
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
    const budget = this.opts.cull ? this.quality.animated : Infinity;
    let animated = alive;
    if (alive.length > budget) {
      const rx = this.rig.x;
      const rz = this.rig.z;
      animated = [...alive].sort((a, b) => (a.x - rx) ** 2 + (a.y - rz) ** 2 - ((b.x - rx) ** 2 + (b.y - rz) ** 2)).slice(0, budget);
    }
    const anim = new Set(animated);
    const aliveIds = new Set<number>();
    const aliveIdsAir = new Set<number>();
    for (const lod of this.lod.values()) for (const im of lod.meshes) im.count = 0;
    this.stats.lodChars = 0;
    for (const en of alive) {
      aliveIds.add(en.id);
      const def = ENEMY_MODEL[en.kind];
      const y = heightAtPoint(w, en.x, en.y) * LEVEL_H + def.lift;
      let visible = false;
      let tall = 0.9;
      if (en.flying && this.air.has(en.kind)) {
        // Aeronave propia (AIR7): sin esqueleto, con sombra; no entra en el presupuesto de personajes animados.
        const ground = heightAtPoint(w, en.x, en.y) * LEVEL_H;
        this.sphere.center.set(en.x, ground + 1.5, en.y);
        visible = this.frustum.intersectsSphere(this.sphere);
        if (visible) {
          tall = this.air.place(en.id, en.kind, en.x, en.y, ground, this.time, dt);
          // Bombardero sobre su objetivo: suelta bombas que caen y explotan en el suelo dentro del radio de bombardeo.
          const bombing = en.kind === 'bomber' && en.attacking !== null && dt > 0;
          if (dropsBomb(bombing, dt, 3, Math.random())) {
            const r = (CONFIG.enemies.bomber.bombRadius ?? 1.5) * Math.random();
            const a = Math.random() * Math.PI * 2;
            const bx = en.x + Math.cos(a) * r;
            const bz = en.y + Math.sin(a) * r;
            const gy = heightAtPoint(w, bx, bz) * LEVEL_H;
            fx.pool.spawn({ kind: 0, x: en.x, y: ground + tall, z: en.y, vy: -3, max: 0.45, s0: 0.1, s1: 0.1, color: 0x25262b, gravity: -9 });
            fx.pop(bx, gy + 0.2, bz, 0xff9a3a, 0.7);
            fx.smoke(bx, gy + 0.3, bz, 0x3a3a40, 0.3);
          }
        }
        aliveIdsAir.add(en.id);
      } else if (anim.has(en)) {
        seenE.add(en.id);
        let v = this.enemies.get(en.id);
        if (!v) {
          v = this.makeChar(def.model, def.scale * CHAR_SCALE * aspectF(`enemy_${en.kind}`), en.kind);
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
    this.air.prune(aliveIdsAir);
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
      const g = instance(def.model, undefined, def.scale * CHAR_SCALE * aspectF(`enemy_${kind}`));
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
      else if (ev.type === 'researched') this.onMessage(`Investigado: ${techNode(ev.id).name}`);
      else if (ev.type === 'kill') fx.pop(ev.x, ground(ev.x, ev.y) + 0.6, ev.y, 0xffd166, 0.6);
      else if (ev.type === 'destroyed') fx.explosion(ev.x + 0.5, ground(ev.x + 0.5, ev.y + 0.5), ev.y + 0.5, 1);
      else if (ev.type === 'coreHit') {
        const c = this.game.core;
        const h = this.buildings.get(c.id)?.height ?? 1.5;
        fx.pop(c.x + c.w / 2, this.levelTop(c) + h * 0.6, c.y + c.d / 2, 0xff4040, 1.1);
        this.shake = SHAKE_TIME;
      }
      if (ev.type !== 'shot') continue;
      const v = this.buildings.get(ev.towerId);
      const yaw = Math.atan2(ev.toX - ev.fromX, ev.toY - ev.fromY);
      if (v) {
        v.recoil = 1;
        v.yaw = yaw;
      }
      // Sale de la boca del cañón y llega a media altura del objetivo (más arriba si vuela).
      const mu = v?.muzzle ?? { fwd: 0.42, y: 0.12 };
      const y0 = v?.pivot ? v.group.position.y + v.pivot.position.y + mu.y : ground(ev.fromX, ev.fromY) + 0.9;
      let lift = 0;
      for (const en of this.game.enemies) {
        if (Math.abs(en.x - ev.toX) < 0.05 && Math.abs(en.y - ev.toY) < 0.05) {
          lift = ENEMY_MODEL[en.kind].lift;
          break;
        }
      }
      const from = new THREE.Vector3(ev.fromX + Math.sin(yaw) * mu.fwd, y0, ev.fromY + Math.cos(yaw) * mu.fwd);
      const to = new THREE.Vector3(ev.toX, ground(ev.toX, ev.toY) + lift + 0.5, ev.toY);
      fx.shot(ev.kind, from, to, CONFIG.turrets[ev.kind].area);
    }
  }

  /** Humo de chimeneas y de edificios dañados, y barras de vida de los edificios tocados. */
  private syncBuildingFx(dt: number): void {
    this.syncCones();
    for (const b of this.game.buildings.values()) {
      if (!b.built) {
        // Obra en curso: barra azul de progreso sobre el edificio a medio levantar.
        this.sphere.center.set(b.x + b.w / 2, this.levelTop(b) + 1, b.y + b.d / 2);
        if (this.frustum.intersectsSphere(this.sphere)) this.fx.bar(b.x + b.w / 2, this.levelTop(b) + (this.buildings.get(b.id)?.height ?? 1) + 0.45, b.y + b.d / 2, b.progress, 0.5 + 0.2 * b.w, 0x6fd3ff);
        continue;
      }
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

  /** Conos del kit en las esquinas de las obras en curso; se quitan al terminar o al desmontar la obra. */
  private syncCones(): void {
    const seen = new Set<number>();
    for (const b of this.game.buildings.values()) {
      if (b.built) continue;
      seen.add(b.id);
      let list = this.cones.get(b.id);
      const spots = coneSpots(b.w, b.d);
      if (!list) {
        list = spots.map(() => {
          const c = instance('factory/cone', 0.2);
          this.scene.add(c);
          return c;
        });
        this.cones.set(b.id, list);
      }
      const y = this.levelTop(b);
      list.forEach((c, i) => c.position.set(b.x + b.w / 2 + spots[i].dx, y, b.y + b.d / 2 + spots[i].dz));
    }
    for (const [id, list] of this.cones) {
      if (seen.has(id)) continue;
      for (const c of list) this.scene.remove(c);
      this.cones.delete(id);
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
    // Las cintas toman la forma que tendrán al colocarse (curva, T, conectores...) según sus vecinas.
    const isBelt = this.buildKind === 'belt' || this.buildKind === 'belt_fast';
    const fake = this.buildKind && this.hover ? ({ kind: this.buildKind, dir: this.buildDir, built: false, x: this.hover.x, y: this.hover.y, w: 1, d: 1, progress: 1, inv: {}, hp: 1, maxHp: 1 } as unknown as Building) : null;
    const ghostSig = fake ? (isBelt ? this.signature(fake) : `${this.buildKind}|${this.buildDir}|0----`) : '';
    const key = fake ? ghostSig : '';
    if (key !== this.ghostKey) {
      if (this.ghost) this.scene.remove(this.ghost);
      for (const m of this.ghostMats) m.dispose();
      this.ghostMats = [];
      this.ghost = null;
      this.ghostKey = key;
      if (key) {
        const v = this.makeBuilding(fake!, ghostSig);
        this.ghost = v.group;
        this.ghostMats = [];
        // Vista previa translúcida: materiales propios para poder teñirlos de verde o rojo.
        this.ghost.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
            const c = x.clone() as THREE.MeshStandardMaterial;
            c.transparent = true;
            c.opacity = 0.6;
            c.depthWrite = false;
            this.ghostMats.push(c);
            return c;
          });
          m.material = Array.isArray(m.material) ? mats : mats[0];
          m.castShadow = false;
        });
        this.scene.add(this.ghost);
      }
    }
    if (this.denied && (!this.hover || !this.ghost)) this.denied.visible = false;
    if (this.ghost) {
      this.ghost.visible = !!this.hover;
      if (this.hover) {
        this.ghost.position.set(this.hover.x + 0.5, tileSurface(w, this.hover.x, this.hover.y) + CONFIG.scale.groundMargin, this.hover.y + 0.5);
        const ok = this.game.canPlace(this.buildKind!, this.hover.x, this.hover.y).ok;
        mat.color.setHex(ok ? 0x70ff90 : 0xff6060);
        // Casilla prohibida: aspa del kit pegada al suelo, en rojo.
        if (!this.denied) {
          this.denied = instance('factory/indicator-special-cross', 0.8);
          this.denied.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) { m.material = new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }); m.renderOrder = 6; }
          });
          this.scene.add(this.denied);
        }
        this.denied.visible = !ok;
        this.denied.position.set(this.hover.x + 0.5, tileSurface(w, this.hover.x, this.hover.y) + CONFIG.scale.groundMargin + 0.01, this.hover.y + 0.5);
        for (const m of this.ghostMats) if (m.emissive) m.emissive.setHex(ok ? 0x1f7a3a : 0x8a1f1f);
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

  /** Aplica un nivel de calidad en caliente: resolución, suavizado, mapa de sombras, partículas y personajes animados. */
  setQuality(q: QualityPreset): void {
    const prev = this.quality;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    if (this.lastW) this.renderer.setSize(this.lastW, this.lastH);
    this.outline.setSamples(q.samples);
    this.fx.pool.density = q.particles;
    if (prev.shadowMap !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.refreshMaterials();
    }
  }

  private refreshMaterials(): void {
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) for (const mt of Array.isArray(m) ? m : [m]) mt.needsUpdate = true;
    });
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
    this.refreshMaterials();
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
    // Temblor al golpear el núcleo: sacudida corta en el plano de la pantalla, que se apaga sola.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a = hh * 0.014 * (this.shake / SHAKE_TIME);
      this.camera.translateX((Math.random() * 2 - 1) * a);
      this.camera.translateY((Math.random() * 2 - 1) * a);
    }
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
    this.fadeTrees();
    this.syncChars(sdt);
    this.syncBuildingFx(sdt);
    this.updateHighlights();
    this.threat.update();
    const dim = this.logistics ? 0.4 : 1;
    this.hemi.intensity = 1.7 * dim;
    this.sun.intensity = 2.4 * dim;
    this.overlay.update({ logistics: this.logistics, connect: this.connect, guide: this.guide, selectedId: this.selectedId, hoverBuildingId: this.hoverBuildingId, tool: this.buildKind, dir: this.buildDir, hover: this.hover, time: this.time, dt });
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
