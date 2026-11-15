/**
 * Modelos 3D de las torretas (sólo capa visual). Cada torreta es un conjunto de piezas con jerarquía:
 *
 *   root
 *   ├─ base  (fija)   placa, pedestal, aro giratorio, remaches, refuerzos
 *   └─ head  (gira)   cuerpo con chaflanes y paneles, accesorios, y dentro `gun`
 *        └─ gun       el arma (culata, camisa, tubo, boca): es lo único que retrocede al disparar
 *
 * Adelante es +z local. El juego hace girar `head` hacia el objetivo y desliza `gun` para el retroceso.
 * Las piezas están hechas con primitivas achaflanadas y, donde el pack de Kenney da algo mejor, con sus modelos.
 * Los tipos aún no rediseñados (`legacyRig`) conservan el aspecto anterior hasta su hito.
 */
import * as THREE from 'three';
import type { TurretKind } from '../game/types';
import { TURRET_COLOR } from './actors';
import { BUILDING_PARTS, TURRET_GUN } from './catalog';
import { patchMaterial } from './fx';
import { instance, tint } from './loader';

export interface TurretRig {
  root: THREE.Group;
  base: THREE.Group;
  /** Torreta giratoria: su `position.y` ya es la altura del cuello. */
  head: THREE.Group;
  /** El arma, que retrocede deslizándose en z desde `gunRest`. */
  gun: THREE.Object3D;
  gunRest: number;
  /** Boca del cañón respecto al eje de giro: distancia hacia delante (casillas) y altura sobre `head`. */
  muzzle: { fwd: number; y: number };
  /** Altura total sobre el suelo (para barras e iconos). */
  height: number;
}

// ---------- paleta ----------
const STEEL = 0x7b8594;
const STEEL_DARK = 0x4c5461;
const STEEL_LIGHT = 0xa7b2c1;
const GUNMETAL = 0x2f343d;
const BRASS = 0xe6b84a;
const OLIVE = 0x65754a;
/** Color de acento de las balas según el nivel: latón, naranja, rojo. */
export const BULLET_ACCENT = [0xe6b84a, 0xf08a3c, 0xd94a4a] as const;

// ---------- piezas ----------
const solids = new Map<number, THREE.MeshStandardMaterial>();
/** Material de metal pintado (compartido por color: así se agrupan y se tiñen igual). */
function solid(color: number): THREE.MeshStandardMaterial {
  let m = solids.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.08 });
    patchMaterial(m);
    solids.set(color, m);
  }
  return m;
}
const glows = new Map<number, THREE.MeshBasicMaterial>();
/** Material que brilla solo (lentes, cristales, pilotos). */
function glow(color: number): THREE.MeshBasicMaterial {
  let m = glows.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    patchMaterial(m);
    glows.set(color, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}

/** Caja de `w` (x) por `h` (y) por `d` (z) con las aristas biseladas `b`; apoyada en y = 0 y centrada en x y z. */
export function bevelBox(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  return cached(`bb${w}|${h}|${d}|${b}`, () => {
    const hw = w / 2 - b;
    const hd = d / 2 - b;
    const shape = new THREE.Shape([new THREE.Vector2(-hw, -hd), new THREE.Vector2(hw, -hd), new THREE.Vector2(hw, hd), new THREE.Vector2(-hw, hd)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1 });
    // La extrusión crece en +z con el bisel por fuera: se tumba para que crezca en +y y se apoya en el suelo.
    g.rotateX(-Math.PI / 2);
    g.translate(0, b, 0);
    return g;
  });
}
/** Cilindro vertical de radio `r` y altura `h` apoyado en y = 0. */
function post(r: number, h: number, seg = 10): THREE.BufferGeometry {
  return cached(`po${r}|${h}|${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg).translate(0, h / 2, 0));
}
/** Prisma octogonal (o cúpula si `rTop` es menor que `rBot`) con los lados alineados con los ejes, apoyado en y = 0. */
function octo(rBot: number, rTop: number, h: number): THREE.BufferGeometry {
  return cached(`oc${rBot}|${rTop}|${h}`, () => new THREE.CylinderGeometry(rTop, rBot, h, 8).rotateY(Math.PI / 8).translate(0, h / 2, 0));
}
/** Cilindro tumbado a lo largo de z, centrado en el origen. */
function tube(r: number, len: number, seg = 10): THREE.BufferGeometry {
  return cached(`tu${r}|${len}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2));
}
/** Cilindro tumbado a lo largo de x, centrado en el origen. */
function roll(r: number, len: number, seg = 8): THREE.BufferGeometry {
  return cached(`ro${r}|${len}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2));
}

/** Pone una pieza en `parent`. */
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}

// ---------- torreta de balas ----------

/**
 * Torreta de balas. Base de acero con franja de latón y remaches; torreta con cuerpo de dos pisos, mirilla con lente,
 * rendijas de refrigeración y contrapeso; cañones múltiples (2, o 3 en nivel 3) con camisa, collares y freno de boca;
 * cajón de munición con cinta de balas hasta la recámara. Nivel 2: blindaje lateral y cañones más largos. Nivel 3: tercer
 * cañón, segundo cajón, refuerzos en la base y acento rojo.
 */
function bulletRig(level: number): TurretRig {
  const accent = BULLET_ACCENT[level - 1];
  const acc = solid(accent);
  const base = new THREE.Group();
  // --- base: dos placas achaflanadas con franja de color, remaches, pedestal y aro giratorio ---
  put(base, bevelBox(0.92, 0.08, 0.92, 0.03), solid(STEEL_DARK), 0, 0, 0);
  put(base, bevelBox(0.86, 0.018, 0.86, 0.006), acc, 0, 0.07, 0);
  put(base, bevelBox(0.78, 0.06, 0.78, 0.025), solid(STEEL), 0, 0.08, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(base, post(0.032, 0.03, 6), solid(STEEL_LIGHT), sx * 0.32, 0.14, sz * 0.32);
  put(base, post(0.15, 0.17, 10), solid(STEEL_DARK), 0, 0.14, 0);
  put(base, post(0.17, 0.03, 10), solid(STEEL), 0, 0.2, 0);
  put(base, post(0.235, 0.04, 12), solid(GUNMETAL), 0, 0.31, 0);
  if (level >= 3) {
    // Refuerzos a los cuatro lados.
    for (const [x, z] of [[0, 0.34], [0, -0.34], [0.34, 0], [-0.34, 0]]) put(base, bevelBox(0.13, 0.09, 0.13, 0.02), solid(STEEL), x, 0.14, z);
  }
  const neck = 0.35;

  // --- torreta giratoria ---
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = neck;
  const body = level >= 3 ? 0x5b6676 : STEEL;
  // Cuerpo octogonal, cúpula troncocónica encima y franja de acento entre los dos.
  put(head, octo(0.3, 0.285, 0.17), solid(body), 0, 0, 0);
  put(head, octo(0.305, 0.305, 0.022), acc, 0, 0.095, 0);
  put(head, octo(0.235, 0.15, 0.14), solid(STEEL_LIGHT), 0, 0.17, 0);
  // Rendijas de refrigeración en la tapa.
  for (const x of [-0.055, 0, 0.055]) put(head, bevelBox(0.02, 0.014, 0.16, 0.004), solid(GUNMETAL), x, 0.308, -0.01);
  // Mirilla lateral con lente.
  put(head, bevelBox(0.085, 0.085, 0.14, 0.015), solid(STEEL_DARK), 0.2, 0.16, 0.06);
  put(head, bevelBox(0.05, 0.04, 0.014, 0.004), glow(0x7be3ff), 0.2, 0.185, 0.134);
  // Contrapeso trasero y cuna de los cañones.
  put(head, bevelBox(0.36, 0.13, 0.12, 0.02), solid(GUNMETAL), 0, 0.03, -0.3);
  put(head, bevelBox(0.42, 0.15, 0.1, 0.02), solid(STEEL_DARK), 0, 0.02, 0.28);
  if (level >= 2) {
    // Placas de blindaje laterales.
    for (const sx of [-1, 1]) put(head, bevelBox(0.045, 0.17, 0.34, 0.012), solid(STEEL_DARK), sx * 0.285, 0.0, 0.02);
  }

  // --- cañones (grupo que retrocede) ---
  const gun = new THREE.Group();
  head.add(gun);
  const n = level >= 3 ? 3 : 2;
  const spacing = n === 3 ? 0.15 : 0.2;
  const L = level >= 2 ? 0.94 : 0.84;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * spacing;
    const y = 0.1 + (n === 3 && i === 1 ? 0.035 : 0);
    put(gun, tube(0.032, L - 0.48), solid(GUNMETAL), x, y, (0.48 + L) / 2);
    put(gun, tube(0.058, 0.3), solid(STEEL), x, y, 0.43);
    put(gun, tube(0.07, 0.028), solid(GUNMETAL), x, y, 0.3);
    put(gun, tube(0.07, 0.028), solid(GUNMETAL), x, y, 0.52);
    put(gun, tube(0.05, 0.1), solid(STEEL_DARK), x, y, L - 0.05);
    put(gun, tube(0.056, 0.018), acc, x, y, L - 0.11);
  }

  // --- cajón de munición con cinta de balas ---
  const side = (sx: number) => {
    put(head, bevelBox(0.17, 0.2, 0.24, 0.02), solid(OLIVE), sx * 0.34, 0.01, -0.03);
    put(head, bevelBox(0.18, 0.022, 0.22, 0.008), acc, sx * 0.34, 0.208, -0.03);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      put(head, roll(0.017, 0.05), solid(BRASS), sx * (0.34 - 0.2 * t), 0.23 - 0.1 * t + 0.035 * Math.sin(Math.PI * t), 0.0 + 0.27 * t);
    }
  };
  side(-1);
  if (level >= 3) side(1);

  const root = new THREE.Group();
  root.add(base, head);
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: L, y: 0.1 }, height: neck + 0.38 };
}

// ---------- tipos aún sin rediseñar (aspecto anterior) ----------
const RING_GEO = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 14);
const RING_STEP = 0.09;
const CYL_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const GEM_GEO = new THREE.OctahedronGeometry(0.5, 0);
const HUB_GEO = new THREE.SphereGeometry(0.5, 8, 6);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

function legacyRig(kind: TurretKind, level: number): TurretRig {
  const base = new THREE.Group();
  let top = 0;
  for (const p of BUILDING_PARTS[kind]) {
    if (!p.model) continue;
    const o = instance(p.model, p.fit);
    if (p.tint) tint(o, p.tint);
    base.add(o);
    top = Math.max(top, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y);
  }
  const col = TURRET_COLOR[kind];
  const rings = level - 1;
  const neck = top * 0.85;
  for (let i = 0; i < rings; i++) put(base, RING_GEO, solid(col), 0, neck + 0.035 + i * RING_STEP, 0);
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = neck + rings * RING_STEP;
  const g = TURRET_GUN[kind];
  const gun = instance(g.model, g.fit * (1 + 0.14 * (level - 1)));
  gun.position.set(0, 0.05, 0.15);
  head.add(gun);
  const extra = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const o = put(head, geo, mat, x, y, z);
    o.scale.set(sx, sy, sz);
  };
  if (kind === 'turret_bullet') extra(BOX_GEO, solid(0x5d6b3a), 0.16, 0.2, 0.28, 0.2, 0.1, -0.04);
  else if (kind === 'turret_laser') extra(HUB_GEO, glow(col), 0.17, 0.17, 0.17, 0, 0.24, -0.06);
  else if (kind === 'turret_fire') extra(CYL_GEO, solid(0xc0392b), 0.2, 0.3, 0.2, 0, 0.12, -0.24);
  else extra(GEM_GEO, glow(0xcff6ff), 0.18, 0.3, 0.18, 0, 0.3, -0.04);
  const root = new THREE.Group();
  root.add(base, head);
  return { root, base, head, gun, gunRest: 0.15, muzzle: { fwd: 0.42, y: 0.12 }, height: top + rings * RING_STEP + 0.25 };
}

/** Tipos con modelo propio (el resto usa el aspecto anterior hasta su hito). */
export const REDESIGNED: TurretKind[] = ['turret_bullet'];

/** Modelo completo de una torreta de ese tipo y nivel (1-3). */
export function buildTurret(kind: TurretKind, level: number): TurretRig {
  const lv = Math.max(1, Math.min(3, Math.round(level)));
  return kind === 'turret_bullet' ? bulletRig(lv) : legacyRig(kind, lv);
}
