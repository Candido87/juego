/**
 * Vista 3D del juego: lee el MISMO `Game` (sin duplicar lógica) y lo dibuja con Three.js.
 * Cámara ortográfica isométrica, terreno instanciado, edificios, cintas, tuberías, NPCs, enemigos y torretas.
 */
import * as THREE from 'three';
import { CONFIG } from '../game/config';
import { Building, Enemy, Game } from '../game/game';
import { DX, DY, Dir, BuildKind, TurretKind } from '../game/types';
import { heightAt, heightAtPoint } from '../game/world';
import { BUILDING_PARTS, CHAR_SCALE, ENEMY_MODEL, NPC_MODEL, TURRET_GUN, allModels } from './catalog';
import { CameraRig } from './camera';
import { animations, instance, preload, tint } from './loader';
import { LEVEL_H, pickTile3D } from './pick';
import { Terrain, buildTerrain } from './terrain';

type Tile = { x: number; y: number };

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
  item?: THREE.Mesh;
  baseY: number;
}

interface CView {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction | null;
  idle: THREE.AnimationAction | null;
  moving: boolean;
  tx: number;
  tz: number;
  yaw: number;
}

const angleLerp = (a: number, b: number, k: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export class View3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  readonly rig = new CameraRig();
  terrain!: Terrain;
  hover: Tile | null = null;
  selected: Tile | null = null;
  /** Modo construcción (lo pone la interfaz). */
  buildKind: BuildKind | null = null;
  buildDir: Dir = 0;
  onSelect: (t: Tile | null) => void = () => {};
  onPlace: (kind: BuildKind, x: number, y: number) => void = () => {};
  private buildings = new Map<number, BView>();
  private npcs = new Map<number, CView>();
  private enemies = new Map<number, CView>();
  private tracers: { line: THREE.Line; life: number }[] = [];
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

  constructor(private host: HTMLElement, readonly game: Game) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x9fd0e8);
    this.scene.fog = new THREE.Fog(0x9fd0e8, 140, 300);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.7));
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.castShadow = true;
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

    const c = game.core;
    this.rig.x = c.x + 1;
    this.rig.z = c.y + 1;
    this.rig.zoom = 1.1;
    this.bindInput();
  }

  async init(onProgress?: (d: number, t: number) => void): Promise<void> {
    await preload(allModels(), onProgress);
    this.terrain = buildTerrain(this.game.world, this.game.core, 7);
    this.terrain.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.receiveShadow = true;
    });
    this.scene.add(this.terrain.group);
  }

  // ---------- entrada ----------
  private bindInput(): void {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; moved: boolean; button: number } | null = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (down.moved || Math.hypot(dx, dy) > 4) {
          down.moved = true;
          this.rig.drag(e.movementX, e.movementY);
        }
      }
      this.hover = this.pick(e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      if (down && !down.moved) {
        const t = this.pick(e.clientX, e.clientY);
        if (down.button === 2) this.buildKind = null;
        else if (this.buildKind && t) this.onPlace(this.buildKind, t.x, t.y);
        else {
          this.selected = t;
          this.onSelect(t);
        }
      }
      down = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.rig.setZoom(this.rig.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'q') this.rig.rotate(-1);
      else if (k === 'e') this.rig.rotate(1);
      else if (k === 'r') this.buildDir = (((this.buildDir + 1) % 4) as Dir);
      else if (k === 'escape') this.buildKind = null;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private pick(cx: number, cy: number): Tile | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const o = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(this.camera);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld);
    const w = this.game.world;
    return pickTile3D(o, d, { w: w.w, h: w.h, levelAt: (x, y) => heightAt(w, x, y) }, 600);
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
    if (b.kind === 'belt' || b.kind === 'belt_fast') {
      for (let d = 0; d < 4; d++) {
        const n = this.isKind(b.x + DX[d], b.y + DY[d], ['belt', 'belt_fast']);
        s += n && n.dir === (d + 2) % 4 ? 'i' : '-';
      }
    } else if (b.kind === 'pipeline') {
      for (let d = 0; d < 4; d++) s += this.pipeLinked(b.x + DX[d], b.y + DY[d]) ? 'p' : '-';
    } else if (b.kind.startsWith('wall_')) {
      for (let d = 0; d < 4; d++) s += this.isKind(b.x + DX[d], b.y + DY[d], ['wall_wood', 'wall_stone', 'wall_metal']) ? 'w' : '-';
    }
    return s;
  }

  private pipeLinked(x: number, y: number): boolean {
    return !!this.isKind(x, y, ['pipeline', 'pump', 'refinery', 'generator', 'turbine', 'turret_fire']);
  }

  private makeBuilding(b: Building, sig: string): BView {
    const group = new THREE.Group();
    const view: BView = { group, sig, spin: [], bob: [], yaw: 0, recoil: 0, baseY: 0 };
    const kind = b.kind;
    let top = 0;
    const parts = BUILDING_PARTS[kind];
    let special: { model: string; yaw: number } | null = null;
    if (kind === 'belt' || kind === 'belt_fast') {
      const flags = sig.slice(-4);
      const behind = flags[(b.dir + 2) % 4] === 'i';
      const sideL = flags[(b.dir + 3) % 4] === 'i';
      const sideR = flags[(b.dir + 1) % 4] === 'i';
      if (!behind && (sideL !== sideR)) special = { model: 'factory/conveyor-corner', yaw: FLOW_YAW[b.dir] + (sideR ? Math.PI / 2 : 0) };
    } else if (kind === 'pipeline') {
      const m = [...sig.slice(-4)].map((c) => c === 'p');
      const n = m.filter(Boolean).length;
      if (n >= 3) special = { model: n === 4 ? 'factory/pipe-large-cross' : 'factory/pipe-large-junction', yaw: n === 3 ? FLOW_YAW[(m.findIndex((v, i) => !v && true) + 2) % 4] : 0 };
      else if (n === 2 && m[0] === m[2]) special = null;
      else if (n === 2) {
        const first = m.findIndex((v, i) => v && m[(i + 1) % 4]);
        special = { model: 'factory/pipe-large-curve', yaw: FLOW_YAW[first] };
      }
    }
    parts.forEach((p, i) => {
      const model = i === 0 && special ? special.model : p.model;
      const o = instance(model, p.fit);
      if (p.tint) tint(o, p.tint);
      let yaw = 0;
      if (kind === 'belt' || kind === 'belt_fast') yaw = special && i === 0 ? special.yaw : FLOW_YAW[b.dir];
      else if (kind === 'pipeline') {
        const m = sig.slice(-4);
        yaw = special && i === 0 ? special.yaw : m[1] === 'p' || m[3] === 'p' ? Math.PI / 2 : 0;
      } else if (kind.startsWith('wall_')) {
        const m = sig.slice(-4);
        yaw = m[0] === 'w' || m[2] === 'w' ? Math.PI / 2 : 0;
      }
      o.rotation.y = yaw;
      if (p.sy) o.scale.y = p.sy;
      o.position.set(p.dx ?? 0, p.stack ? top : 0, p.dz ?? 0);
      top = Math.max(top, o.position.y + (new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y));
      if (p.spin) view.spin.push(o);
      if (p.bob) view.bob.push(o);
      group.add(o);
    });
    // Torreta: cañón sobre un pivote que gira hacia el objetivo.
    if (kind in CONFIG.turrets) {
      const g = TURRET_GUN[kind as TurretKind];
      const pivot = new THREE.Group();
      pivot.position.y = top * 0.85;
      const gun = instance(g.model, g.fit);
      gun.position.set(0, 0.05, 0.15);
      pivot.add(gun);
      group.add(pivot);
      view.pivot = pivot;
      view.gun = gun;
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
        (m.material as THREE.Material).transparent = true;
        (m.material as THREE.Material).opacity = 0.55;
      });
    }
    // Objeto transportado por la cinta.
    if (kind === 'belt' || kind === 'belt_fast') {
      const it = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      it.visible = false;
      group.add(it);
      view.item = it;
    }
    return view;
  }

  private syncBuildings(dt: number): void {
    const seen = new Set<number>();
    for (const b of this.game.buildings.values()) {
      seen.add(b.id);
      const sig = this.signature(b);
      let v = this.buildings.get(b.id);
      if (!v || v.sig !== sig) {
        if (v) this.scene.remove(v.group);
        else this.terrain.hideDecor(b.x, b.y);
        const old = v;
        v = this.makeBuilding(b, sig);
        if (old) v.yaw = old.yaw;
        this.buildings.set(b.id, v);
        this.scene.add(v.group);
      }
      const base = this.levelTop(b);
      v.group.position.set(b.x + b.w / 2, base, b.y + b.d / 2);
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
        this.buildings.delete(id);
      }
    }
  }

  private aimTurret(b: Building, v: BView, dt: number): void {
    const kind = b.kind as TurretKind;
    const range = this.game.turretRange(kind);
    let best: Enemy | null = null;
    let bd = range;
    const cx = b.x + 0.5;
    const cy = b.y + 0.5;
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
    v.pivot!.rotation.y = v.yaw;
    v.recoil = Math.max(0, v.recoil - dt * 4);
    v.gun!.position.z = 0.15 - v.recoil * 0.12;
  }

  // ---------- personajes ----------
  private makeChar(model: string, scale: number): CView {
    const group = instance(model, undefined, scale);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    const root = group.children[0];
    const mixer = new THREE.AnimationMixer(root);
    const clips = animations(model);
    const find = (n: string) => clips.find((c) => c.name === n);
    const w = find('walk');
    const i = find('idle');
    const walk = w ? mixer.clipAction(w) : null;
    const idle = i ? mixer.clipAction(i) : null;
    (idle ?? walk)?.play();
    return { group, mixer, walk, idle, moving: false, tx: 0, tz: 0, yaw: 0 };
  }

  private moveChar(v: CView, x: number, z: number, y: number, dt: number, sprint = false): void {
    const dx = x - v.group.position.x;
    const dz = z - v.group.position.z;
    const moving = Math.hypot(dx, dz) > dt * 0.4 && v.group.position.lengthSq() > 0;
    if (moving) v.yaw = angleLerp(v.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
    v.group.rotation.y = v.yaw;
    v.group.position.set(x, y, z);
    if (moving !== v.moving) {
      v.moving = moving;
      const on = moving ? v.walk : v.idle;
      const off = moving ? v.idle : v.walk;
      if (on) on.reset().fadeIn(0.15).play();
      if (off) off.fadeOut(0.15);
    }
    if (v.walk && moving) v.walk.timeScale = sprint ? 1.4 : 1;
    v.mixer.update(dt);
  }

  private syncChars(dt: number): void {
    const w = this.game.world;
    const seenN = new Set<number>();
    for (const n of this.game.npcs) {
      seenN.add(n.id);
      let v = this.npcs.get(n.id);
      if (!v) {
        v = this.makeChar(NPC_MODEL, 0.9 * CHAR_SCALE);
        v.group.position.set(n.x, 0, n.y);
        this.npcs.set(n.id, v);
        this.scene.add(v.group);
      }
      this.moveChar(v, n.x, n.y, heightAtPoint(w, n.x, n.y) * LEVEL_H, dt);
    }
    for (const [id, v] of this.npcs) if (!seenN.has(id)) (this.scene.remove(v.group), this.npcs.delete(id));
    const seenE = new Set<number>();
    for (const e of this.game.enemies) {
      if (e.hp <= 0) continue;
      seenE.add(e.id);
      let v = this.enemies.get(e.id);
      const def = ENEMY_MODEL[e.kind];
      if (!v) {
        v = this.makeChar(def.model, def.scale * CHAR_SCALE);
        v.group.position.set(e.x, 0, e.y);
        this.enemies.set(e.id, v);
        this.scene.add(v.group);
      }
      this.moveChar(v, e.x, e.y, heightAtPoint(w, e.x, e.y) * LEVEL_H + def.lift, dt, e.kind === 'runner');
    }
    for (const [id, v] of this.enemies) if (!seenE.has(id)) (this.scene.remove(v.group), this.enemies.delete(id));
  }

  // ---------- eventos, resaltado y fantasma ----------
  private handleEvents(): void {
    for (const ev of this.game.drainEvents()) {
      if (ev.type !== 'shot') continue;
      const v = this.buildings.get(ev.towerId);
      if (v) {
        v.recoil = 1;
        v.yaw = Math.atan2(ev.toX - ev.fromX, ev.toY - ev.fromY);
      }
      const y0 = heightAtPoint(this.game.world, ev.fromX, ev.fromY) * LEVEL_H + 0.9;
      const col = ev.kind === 'turret_laser' ? 0x60d0ff : ev.kind === 'turret_fire' ? 0xff8030 : ev.kind === 'turret_frost' ? 0xb0f0ff : 0xffe070;
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ev.fromX, y0, ev.fromY), new THREE.Vector3(ev.toX, y0 - 0.3, ev.toY)]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true }));
      this.scene.add(line);
      this.tracers.push({ line, life: 0.14 });
    }
    this.tracers = this.tracers.filter((t) => {
      t.life -= 1 / 60;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        return false;
      }
      return true;
    });
  }

  private updateHighlights(): void {
    const w = this.game.world;
    const set = (g: THREE.Object3D, t: Tile | null) => {
      g.visible = !!t;
      if (t) g.position.set(t.x + 0.5, heightAt(w, t.x, t.y) * LEVEL_H + 0.05, t.y + 0.5);
    };
    set(this.hoverMesh, this.hover);
    set(this.selMesh, this.selected);
    const quad = this.hoverMesh.children[0] as THREE.Mesh;
    const mat = quad.material as THREE.MeshBasicMaterial;
    mat.color.setHex(0xffffff);
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
    this.syncBuildings(dt);
    this.syncChars(dt);
    this.handleEvents();
    this.updateHighlights();
    this.renderer.render(this.scene, this.camera);
  }

  counts(): { buildings: number; npcs: number; enemies: number } {
    return { buildings: this.buildings.size, npcs: this.npcs.size, enemies: this.enemies.size };
  }
}
