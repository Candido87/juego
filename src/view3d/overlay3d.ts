/**
 * Ayudas visuales sobre el mapa: cables entre postes, alcance de postes y torretas, flechas de puertos de
 * entrada/salida e iconos de estado sobre los edificios. Sólo lee el juego.
 */
import * as THREE from 'three';
import { CONFIG } from '../game/config';
import type { Building, Game } from '../game/game';
import { isElectric } from '../game/power';
import { isLineTool, previewLine, EndState } from '../game/conectar';
import { pipeConflicts, pipeJoinConflict } from '../game/tuberias';
import { Port, PortFlow, PortState, hasPorts, ports, portsWithStatus } from '../game/puertos';
import type { BuildKind, BuildingKind, Dir, TurretKind } from '../game/types';
import { heightAt, inBounds } from '../game/world';
import { ITEM_COLORS } from '../view/itemColors';
import { LEVEL_H } from './pick';
import { yawToDir } from './pieces';
import { STATUS_STYLE, StatusIcon, statusIcon, statusKey } from './status';

type Tile = { x: number; y: number };

/** Ayudas de la guía de inicio o del tutorial sobre el mapa (las calcula la interfaz, ver `guia.ts`). */
export interface GuideAids {
  /** Casilla recomendada: flecha que rebota y marco. */
  mark?: Tile | null;
  /** Ruta de ejemplo con el sentido de la cinta o tubería. */
  route?: { x: number; y: number; dir: Dir }[] | null;
  /** La ruta es de líquido (tubería). */
  liquid?: boolean;
  /** Casilla del problema detectado. */
  diag?: Tile | null;
  /** Flechas de entrada/salida de los edificios de estos tipos. */
  portKinds?: BuildKind[];
  /** Alcance de todos los postes. */
  poleRange?: boolean;
}

/** Herramienta Conectar: modo activo, salida elegida y ruta de la vista previa. */
export interface ConnectAids {
  from: Port | null;
  route: { x: number; y: number; dir: Dir }[] | null;
  liquid: boolean;
}

export interface OverlayState {
  connect?: ConnectAids | null;
  guide?: GuideAids | null;
  selectedId: number | null;
  hoverBuildingId: number | null;
  /** Edificio que se está colocando (null si no hay herramienta de construcción). */
  tool: BuildKind | null;
  dir: Dir;
  hover: Tile | null;
  time: number;
  dt: number;
}

const SOLID = 0xffd166;
const LIQUID = 0x6fd3ff;
/** Color de cada tipo de flujo en los conectores (iguales a los de la interfaz: sólido naranja, petróleo marrón, gasolina amarilla). */
export const FLOW_COLOR: Record<PortFlow, number> = { solid: 0xe0872a, oil: 0x8a5a2b, gasoline: 0xf2e040 };
/** Color de la luz de cada estado de puerto. */
export const PORT_LIGHT: Record<PortState, number> = { free: 0xcfd6e2, connected: 0x2ee27a, error: 0xff3b3b, blocked: 0xff9a1f };
const TONE = { bad: '#ff6b6b', warn: '#ffd166' };

/** Triángulo plano que apunta a +x (se gira hacia la dirección del flujo). */
function arrowGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0.34, 0, 0, -0.2, 0, 0.24, -0.2, 0, -0.24], 3));
  g.computeVertexNormals();
  return g;
}

const iconCache = new Map<string, THREE.Texture>();
/** Textura del icono de estado: disco oscuro con borde de color y un símbolo, o un cuadro del color del objeto que se fabrica. */
function iconTexture(s: StatusIcon): THREE.Texture {
  const key = statusKey(s);
  let t = iconCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(32, 32, 27, 0, Math.PI * 2);
  g.fillStyle = 'rgba(20,24,32,0.92)';
  g.fill();
  g.lineWidth = 5;
  if (s.type === 'producing') {
    g.strokeStyle = '#7dff8a';
    g.stroke();
    g.fillStyle = `#${ITEM_COLORS[s.item].toString(16).padStart(6, '0')}`;
    g.fillRect(20, 20, 24, 24);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.strokeRect(20, 20, 24, 24);
  } else {
    const st = STATUS_STYLE[s.type];
    g.strokeStyle = TONE[st.tone];
    g.stroke();
    g.fillStyle = TONE[st.tone];
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(st.glyph, 32, 34);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(key, t);
  return t;
}

export class Overlay {
  readonly group = new THREE.Group();
  private wires = new THREE.Group();
  private wiresGrid: unknown = null;
  private arrows: THREE.Mesh[] = [];
  private arrowN = 0;
  private ranges: THREE.Mesh[] = [];
  private rangeN = 0;
  private ring: THREE.LineLoop;
  private icons = new Map<number, { sprite: THREE.Sprite; key: string }>();
  private iconTimer = 0;
  private arrowGeo = arrowGeometry();
  private lamps: THREE.Mesh[] = [];
  private lampN = 0;
  private mixAt = -1;
  private mixTiles: { x: number; y: number }[] = [];
  private lampGeo = new THREE.CircleGeometry(0.1, 14).rotateX(-Math.PI / 2);
  private rangeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** Flecha que rebota sobre la casilla que recomienda la guía (cono apuntando hacia abajo). */
  private marker: THREE.Mesh;
  /** Contadores para pruebas y PARIDAD. */
  readonly stats = { wires: 0, arrows: 0, ranges: 0, icons: 0 };

  /** `baseOf` = altura del suelo bajo el edificio; `heightOf` = altura de su modelo. */
  constructor(private game: Game, private baseOf: (b: Building) => number, private heightOf: (b: Building) => number) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) pts.push(new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2), 0, Math.sin((i / 64) * Math.PI * 2)));
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6fd3ff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95 }));
    this.marker.renderOrder = 23;
    this.marker.visible = false;
    this.group.add(this.wires, this.ring, this.marker);
  }

  private ground(x: number, y: number): number {
    return heightAt(this.game.world, x, y) * LEVEL_H;
  }

  // ---------- cables ----------
  private syncWires(): void {
    const grid = this.game.grid;
    if (grid === this.wiresGrid) return;
    this.wiresGrid = grid;
    for (const c of [...this.wires.children]) {
      this.wires.remove(c);
      (c as THREE.Line).geometry.dispose();
    }
    const mat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
    for (const [a, b] of grid.wires) {
      const pa = this.game.buildings.get(a);
      const pb = this.game.buildings.get(b);
      if (!pa || !pb) continue;
      const A = new THREE.Vector3(pa.x + 0.5, this.baseOf(pa) + this.heightOf(pa) * 0.95, pa.y + 0.5);
      const B = new THREE.Vector3(pb.x + 0.5, this.baseOf(pb) + this.heightOf(pb) * 0.95, pb.y + 0.5);
      const sag = 0.12 + A.distanceTo(B) * 0.05;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const p = A.clone().lerp(B, t);
        p.y -= sag * 4 * t * (1 - t);
        pts.push(p);
      }
      this.wires.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    this.stats.wires = this.wires.children.length;
  }

  // ---------- flechas de puertos ----------
  private arrow(x: number, y: number, dir: Dir, color: number, filled: boolean, alpha: number): void {
    if (!inBounds(this.game.world, x, y)) return;
    let m = this.arrows[this.arrowN];
    if (!m) {
      m = new THREE.Mesh(this.arrowGeo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 21;
      this.arrows.push(m);
      this.group.add(m);
    }
    this.arrowN++;
    m.visible = true;
    m.position.set(x + 0.5, this.ground(x, y) + 0.12, y + 0.5);
    m.rotation.y = yawToDir(dir);
    m.scale.setScalar(filled ? 1 : 0.8);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = (filled ? 0.95 : 0.5) * alpha;
  }

  /** Luz de estado del puerto, pegada al borde del edificio (verde conectado, rojo error, naranja bloqueado, gris libre). */
  private lamp(p: Port, state: PortState, pulse: number): void {
    if (!inBounds(this.game.world, p.x, p.y)) return;
    let m = this.lamps[this.lampN];
    if (!m) {
      m = new THREE.Mesh(this.lampGeo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      m.renderOrder = 22;
      this.lamps.push(m);
      this.group.add(m);
    }
    this.lampN++;
    m.visible = true;
    const dx = [1, 0, -1, 0][p.side];
    const dz = [0, 1, 0, -1][p.side];
    m.position.set(p.x + 0.5 - dx * 0.4, this.ground(p.x, p.y) + 0.16, p.y + 0.5 - dz * 0.4);
    const bad = state === 'error' || state === 'blocked';
    m.scale.setScalar(bad ? 1.2 + 0.25 * pulse : state === 'free' ? 0.8 : 1);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(PORT_LIGHT[state]);
    mat.opacity = state === 'free' ? 0.55 : 0.95;
  }

  /** Marca de un extremo de la pieza que se va a colocar: verde correcto, rojo incompatible, naranja abierto. */
  private endMark(x: number, y: number, dir: Dir, head: boolean, state: EndState, pulse: number): void {
    if (!inBounds(this.game.world, x, y)) return;
    let m = this.lamps[this.lampN];
    if (!m) {
      m = new THREE.Mesh(this.lampGeo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      m.renderOrder = 22;
      this.lamps.push(m);
      this.group.add(m);
    }
    this.lampN++;
    m.visible = true;
    const k = head ? 0.42 : -0.42;
    m.position.set(x + 0.5 + [1, 0, -1, 0][dir] * k, this.ground(x, y) + 0.3, y + 0.5 + [0, 1, 0, -1][dir] * k);
    m.scale.setScalar(state === 'error' ? 1.8 + 0.4 * pulse : 1.6);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(state === 'ok' ? 0x2ee27a : state === 'error' ? 0xff3b3b : 0xffa733);
    mat.opacity = 0.95;
  }

  /** Conector de un puerto: flecha del color de su flujo (salida llena que se aleja, entrada tenue que apunta al edificio) y luz de estado. */
  private portMark(p: Port, state: PortState, alpha: number, pulse: number, showArrow: boolean): void {
    if (showArrow) this.arrow(p.x, p.y, p.dir, FLOW_COLOR[p.flow], p.io === 'out', alpha * (p.io === 'out' ? pulse : 1));
    this.lamp(p, state, pulse);
  }

  /** Puertos de un edificio colocado con su estado real. `emph` = resaltados (seleccionado, ratón encima, guía): todas las flechas. */
  private portsOfBuilding(b: Building, alpha: number, pulse: number, emph: boolean): void {
    for (const { port, status } of portsWithStatus(this.game, b)) {
      this.portMark(port, status.state, emph ? alpha : 0.5, pulse, emph || status.state !== 'connected');
    }
  }

  /** Con una cinta o tubería elegida: los puertos libres del mismo medio parpadean suave (también los de la guía y la selección). */
  private compatiblePorts(medium: 'solid' | 'liquid', pulse: number): void {
    for (const b of this.game.buildings.values()) {
      if (!b.built) continue;
      for (const { port, status } of portsWithStatus(this.game, b)) {
        if (port.medium === medium && status.state === 'free') this.arrow(port.x, port.y, port.dir, FLOW_COLOR[port.flow], port.io === 'out', 0.55 + 0.45 * pulse);
      }
    }
  }

  /** Puertos de un edificio que aún no existe (herramienta de construcción): todos libres. */
  private portsOf(kind: BuildingKind, x: number, y: number, dir: Dir, alpha: number, pulse: number): void {
    for (const p of ports(kind, x, y, dir)) this.portMark(p, 'free', alpha, pulse, true);
  }

  // ---------- alcances ----------
  private range(cx: number, cz: number, y: number, size: number, color: number, opacity: number): void {
    let m = this.ranges[this.rangeN];
    if (!m) {
      m = new THREE.Mesh(this.rangeGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.renderOrder = 5;
      this.ranges.push(m);
      this.group.add(m);
    }
    this.rangeN++;
    m.visible = true;
    m.position.set(cx, y + 0.045, cz);
    m.scale.set(size, 1, size);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = opacity;
  }

  // ---------- iconos de estado ----------
  private syncIcons(time: number, refresh: boolean): void {
    if (refresh) {
      const seen = new Set<number>();
      for (const b of this.game.buildings.values()) {
        const s = statusIcon(this.game, b);
        if (!s) continue;
        seen.add(b.id);
        const key = statusKey(s);
        let e = this.icons.get(b.id);
        if (!e) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
          sprite.renderOrder = 22;
          this.group.add(sprite);
          this.icons.set(b.id, (e = { sprite, key: '' }));
        }
        if (e.key !== key) {
          e.key = key;
          e.sprite.material.map = iconTexture(s);
          e.sprite.material.needsUpdate = true;
        }
      }
      for (const [id, e] of this.icons) {
        if (seen.has(id)) continue;
        this.group.remove(e.sprite);
        e.sprite.material.dispose();
        this.icons.delete(id);
      }
      this.stats.icons = this.icons.size;
    }
    for (const [id, e] of this.icons) {
      const b = this.game.buildings.get(id);
      if (!b) continue;
      const good = e.key.startsWith('producing');
      const size = good ? 0.42 : 0.56;
      e.sprite.scale.set(size, size, 1);
      e.sprite.material.opacity = good ? 0.9 : 1;
      e.sprite.position.set(b.x + b.w / 2, this.baseOf(b) + this.heightOf(b) + 0.4 + (good ? Math.abs(Math.sin(time * 3)) * 0.06 : 0), b.y + b.d / 2);
    }
  }

  /** Ayudas de la guía: ruta de ejemplo, casilla del problema, puertos y alcance de postes de los pasos, y la flecha que rebota. */
  private guideAids(s: OverlayState, pulse: number): void {
    const a = s.guide;
    const g = this.game;
    this.marker.visible = false;
    if (!a) return;
    if (a.portKinds) for (const b of g.buildings.values()) if (b.built && a.portKinds.includes(b.kind as BuildKind)) this.portsOfBuilding(b, 0.9, pulse, true);
    if (a.poleRange) for (const p of g.buildings.values()) if (p.kind === 'pole' && p.built) this.range(p.x + 0.5, p.y + 0.5, this.ground(p.x, p.y), 2 * CONFIG.power.supplyRadius + 1, 0xffe066, 0.13);
    if (a.route) {
      const col = a.liquid ? LIQUID : SOLID;
      const k = 0.55 + 0.25 * Math.sin(s.time * 4);
      for (const r of a.route) {
        this.range(r.x + 0.5, r.y + 0.5, this.ground(r.x, r.y), 0.96, col, 0.22 * k);
        this.arrow(r.x, r.y, r.dir, col, true, k);
      }
    }
    if (a.diag) this.range(a.diag.x + 0.5, a.diag.y + 0.5, this.ground(a.diag.x, a.diag.y), 1.15, 0xff5555, 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(s.time * 6)));
    if (a.mark) {
      const t = a.mark;
      this.range(t.x + 0.5, t.y + 0.5, this.ground(t.x, t.y), 1.1, 0xffd166, 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(s.time * 5)));
      this.marker.visible = true;
      this.marker.position.set(t.x + 0.5, this.ground(t.x, t.y) + 1.25 + Math.abs(Math.sin(s.time * 4)) * 0.3, t.y + 0.5);
      this.marker.rotation.y = s.time * 1.5;
    }
  }

  update(s: OverlayState): void {
    const g = this.game;
    this.syncWires();
    this.arrowN = 0;
    this.lampN = 0;
    this.rangeN = 0;
    this.ring.visible = false;
    const pulse = 0.75 + 0.25 * Math.sin(s.time * 5);
    const sel = s.selectedId !== null ? g.buildings.get(s.selectedId) : undefined;
    const R = CONFIG.power.supplyRadius;
    const poleRange = (x: number, y: number, strong: boolean) => this.range(x + 0.5, y + 0.5, this.ground(x, y), 2 * R + 1, 0xffe066, strong ? 0.24 : 0.13);
    const turretRing = (x: number, y: number, r: number, color: number) => {
      this.ring.visible = true;
      this.ring.position.set(x + 0.5, this.ground(x, y) + 0.1, y + 0.5);
      this.ring.scale.set(r, 1, r);
      (this.ring.material as THREE.LineBasicMaterial).color.setHex(color);
    };

    if (sel) {
      this.portsOfBuilding(sel, 1, pulse, true);
      if (sel.kind === 'pole') poleRange(sel.x, sel.y, true);
      if (sel.kind in CONFIG.turrets) turretRing(sel.x, sel.y, g.turretRange(sel.kind as TurretKind), 0x6fd3ff);
    }
    const hb = s.tool === null && s.hoverBuildingId !== null ? g.buildings.get(s.hoverBuildingId) : undefined;
    if (hb && hb !== sel && hb.built) this.portsOfBuilding(hb, 0.8, pulse, true);
    // Todos los demás conectores se ven siempre: la luz de estado y, si no están conectados, su flecha tenue.
    for (const b of g.buildings.values()) if (b.built && b !== sel && b !== hb && hasPorts(b.kind)) this.portsOfBuilding(b, 1, pulse, false);

    if (s.tool) {
      // Al colocar un poste o algo eléctrico se ve hasta dónde llega cada poste.
      if (s.tool === 'pole' || isElectric(s.tool)) for (const p of g.buildings.values()) if (p.kind === 'pole' && p.built) poleRange(p.x, p.y, false);
      if (s.hover) {
        const ok = g.canPlace(s.tool, s.hover.x, s.hover.y).ok;
        this.portsOf(s.tool, s.hover.x, s.hover.y, s.dir, 0.9, pulse);
        if (s.tool === 'pole') poleRange(s.hover.x, s.hover.y, true);
        if (s.tool in CONFIG.turrets) turretRing(s.hover.x, s.hover.y, g.turretRange(s.tool as TurretKind), ok ? 0x7dff8a : 0xff5555);
      }
    }
    if (s.connect) {
      const c = s.connect;
      // Sin salida elegida: todas las salidas libres; con salida elegida: las entradas libres del mismo medio.
      for (const b of g.buildings.values()) {
        if (!b.built) continue;
        for (const { port, status } of portsWithStatus(g, b)) {
          if (status.state !== 'free' || g.buildingAt(port.x, port.y)) continue;
          if (!c.from ? port.io === 'out' : port.io === 'in' && port.medium === c.from.medium) this.arrow(port.x, port.y, port.dir, FLOW_COLOR[port.flow], port.io === 'out', 0.6 + 0.4 * pulse);
        }
      }
      if (c.from) this.range(c.from.x + 0.5, c.from.y + 0.5, this.ground(c.from.x, c.from.y), 1.1, 0xffffff, 0.35 + 0.3 * pulse);
      if (c.route) {
        const col = c.from ? FLOW_COLOR[c.from.flow] : SOLID;
        for (const r of c.route) {
          this.range(r.x + 0.5, r.y + 0.5, this.ground(r.x, r.y), 0.96, 0x2ee27a, 0.28);
          this.arrow(r.x, r.y, r.dir, col, true, 0.9);
        }
      }
    }
    if (isLineTool(s.tool)) {
      this.compatiblePorts(s.tool === 'pipeline' ? 'liquid' : 'solid', pulse);
      if (s.hover) {
        const pv = previewLine(g, s.tool, s.hover.x, s.hover.y, s.dir);
        const mix = s.tool === 'pipeline' && pipeJoinConflict(g, s.hover.x, s.hover.y, s.dir);
        this.endMark(s.hover.x, s.hover.y, s.dir, true, mix ? 'error' : pv.head.state, pulse);
        this.endMark(s.hover.x, s.hover.y, s.dir, false, mix ? 'error' : pv.tail.state, pulse);
      }
    }
    // Redes de tuberías que mezclan líquidos: sus tramos late en rojo (se recalcula unas veces por segundo).
    if (s.time - this.mixAt > 0.5) {
      this.mixAt = s.time;
      this.mixTiles = pipeConflicts(g).flatMap((c) => c.net.pipes.map((p) => ({ x: p.x, y: p.y })));
    }
    for (const t of this.mixTiles) this.range(t.x + 0.5, t.y + 0.5, this.ground(t.x, t.y), 0.96, 0xff3b3b, 0.25 + 0.3 * pulse);
    this.guideAids(s, pulse);
    for (let i = this.arrowN; i < this.arrows.length; i++) this.arrows[i].visible = false;
    for (let i = this.lampN; i < this.lamps.length; i++) this.lamps[i].visible = false;
    for (let i = this.rangeN; i < this.ranges.length; i++) this.ranges[i].visible = false;
    this.stats.arrows = this.arrowN;
    this.stats.ranges = this.rangeN;

    this.iconTimer -= s.dt;
    const refresh = this.iconTimer <= 0;
    if (refresh) this.iconTimer = 0.25;
    this.syncIcons(s.time, refresh);
  }
}
