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
/** Cono (o pirámide de `seg` lados) de radio `r` y altura `h` apoyado en y = 0. */
function cone(r: number, h: number, seg = 6): THREE.BufferGeometry {
  return cached(`co${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0));
}
/** Tronco de cono tumbado a lo largo de z (radio `rBack` atrás y `rFront` delante), centrado en el origen. */
function flare(rBack: number, rFront: number, len: number, seg = 10): THREE.BufferGeometry {
  return cached(`fl${rBack}|${rFront}|${len}|${seg}`, () => new THREE.CylinderGeometry(rFront, rBack, len, seg).rotateX(Math.PI / 2));
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

/**
 * Base común de todas las torretas: dos placas achaflanadas con franja del color de acento del tipo, remaches, pedestal,
 * plato y aro giratorio (y refuerzos a los cuatro lados en el nivel 3). `neck` es la altura a la que va la torreta giratoria.
 */
function makeBase(accent: number, level: number): { base: THREE.Group; neck: number } {
  const acc = solid(accent);
  const base = new THREE.Group();
  put(base, bevelBox(0.92, 0.08, 0.92, 0.03), solid(STEEL_DARK), 0, 0, 0);
  put(base, bevelBox(0.86, 0.018, 0.86, 0.006), acc, 0, 0.07, 0);
  put(base, bevelBox(0.78, 0.06, 0.78, 0.025), solid(STEEL), 0, 0.08, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(base, post(0.032, 0.03, 6), solid(STEEL_LIGHT), sx * 0.32, 0.14, sz * 0.32);
  put(base, post(0.15, 0.17, 10), solid(STEEL_DARK), 0, 0.14, 0);
  put(base, post(0.17, 0.03, 10), solid(STEEL), 0, 0.2, 0);
  put(base, post(0.235, 0.04, 12), solid(GUNMETAL), 0, 0.31, 0);
  if (level >= 3) {
    for (const [x, z] of [[0, 0.34], [0, -0.34], [0.34, 0], [-0.34, 0]]) put(base, bevelBox(0.13, 0.09, 0.13, 0.02), solid(STEEL), x, 0.14, z);
  }
  return { base, neck: 0.35 };
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
  const { base, neck } = makeBase(accent, level);

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

// ---------- torreta láser ----------
export const CYAN = 0x45e0ff;
export const COPPER = 0xc8793a;
const NAVY = 0x44506b;

/**
 * Torreta láser. Chasis esbelto azul acero con franja cian; cristal de energía alto y brillante sobre un engarce; aletas
 * disipadoras detrás; cables del cristal al cañón; cañón largo y fino con bobinas de cobre y lente cian en la boca.
 * Nivel 2: blindaje lateral, cristal mayor y cañón más largo. Nivel 3: cañón doble y aletas extra.
 */
function laserRig(level: number): TurretRig {
  const acc = solid(CYAN);
  const { base, neck } = makeBase(CYAN, level);
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = neck;
  put(head, octo(0.28, 0.26, 0.15), solid(level >= 3 ? 0x37425a : NAVY), 0, 0, 0);
  put(head, octo(0.285, 0.285, 0.02), acc, 0, 0.085, 0);
  put(head, octo(0.21, 0.14, 0.11), solid(0x667599), 0, 0.15, 0);
  // Cristal de energía: engarce de acero, punta facetada y núcleo casi blanco.
  const ch = 0.3 + 0.07 * level;
  const cr = 0.07 + 0.012 * level;
  put(head, octo(0.12, 0.1, 0.035), solid(STEEL_DARK), 0, 0.26, 0);
  put(head, cone(cr, ch, 6), glow(CYAN), 0, 0.295, 0);
  put(head, cone(cr * 0.45, ch * 0.8, 6), glow(0xd8fbff), 0, 0.3, 0);
  // Aletas disipadoras detrás del cuerpo.
  const fins = 3 + level;
  for (let i = 0; i < fins; i++) put(head, bevelBox(0.32, 0.22, 0.03, 0.007), solid(i % 2 ? STEEL : STEEL_LIGHT), 0, 0.02, -0.3 - i * 0.048);
  // Cables del cristal al cañón.
  for (const sx of [-1, 1]) put(head, bevelBox(0.016, 0.016, 0.34, 0.004), solid(GUNMETAL), sx * 0.09, 0.2, 0.14, [-0.3, 0, 0]);
  if (level >= 2) for (const sx of [-1, 1]) put(head, bevelBox(0.045, 0.17, 0.34, 0.012), solid(STEEL_DARK), sx * 0.27, 0.0, 0.0);
  // Cuna y cañón(es): carcasa trasera, alma fina, bobinas de cobre, anillo de boca y lente.
  const nb = level >= 3 ? 2 : 1;
  put(head, bevelBox(nb === 2 ? 0.46 : 0.3, 0.13, 0.1, 0.02), solid(STEEL_DARK), 0, 0.03, 0.27);
  const gun = new THREE.Group();
  head.add(gun);
  const L = [0.88, 0.94, 1.0][level - 1];
  for (let i = 0; i < nb; i++) {
    const x = nb === 2 ? (i - 0.5) * 0.2 : 0;
    put(gun, tube(0.085, 0.26), solid(GUNMETAL), x, 0.1, 0.3);
    put(gun, tube(0.092, 0.025), acc, x, 0.1, 0.38);
    put(gun, tube(0.04, L - 0.4), solid(STEEL_LIGHT), x, 0.1, (0.4 + L) / 2);
    for (let k = 0; k < 3 + level; k++) put(gun, tube(0.068, 0.05), solid(COPPER), x, 0.1, 0.46 + k * 0.085);
    put(gun, tube(0.062, 0.035), solid(STEEL_DARK), x, 0.1, L - 0.035);
    put(gun, tube(0.045, 0.03), glow(CYAN), x, 0.1, L);
  }
  const root = new THREE.Group();
  root.add(base, head);
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: L + 0.015, y: 0.1 }, height: neck + 0.3 + ch };
}

// ---------- lanzallamas ----------
export const FIRE = 0xff7b2e;
export const TANK_RED = 0xb5452f;
const ASH = 0x34343b;

/**
 * Lanzallamas. Cuerpo negro con franja naranja; depósitos de combustible cilíndricos, altos y rojizos, con abrazaderas y
 * tapa; tuberías hasta la boquilla; boquilla abocinada con brasa; pilotos rojos y llama piloto. Nivel 2: blindaje y boquilla
 * más larga. Nivel 3: tercer depósito, más alto, y boquilla doble.
 */
function fireRig(level: number): TurretRig {
  const acc = solid(FIRE);
  const { base, neck } = makeBase(FIRE, level);
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = neck;
  put(head, octo(0.3, 0.28, 0.15), solid(ASH), 0, 0, 0);
  put(head, octo(0.305, 0.305, 0.02), acc, 0, 0.085, 0);
  put(head, octo(0.22, 0.17, 0.07), solid(0x4a4a52), 0, 0.15, 0);
  // Depósitos de combustible con abrazaderas, tapa y válvula.
  const tanks: [number, number, number][] = [[-0.2, -0.13, 0.34 + 0.02 * level], [0.2, -0.13, 0.34 + 0.02 * level]];
  if (level >= 3) tanks.push([0, -0.27, 0.48]);
  for (const [x, z, h] of tanks) {
    put(head, post(0.105, h, 10), solid(TANK_RED), x, 0.0, z);
    for (const y of [0.09, h - 0.1]) put(head, post(0.113, 0.03, 10), solid(STEEL_DARK), x, y, z);
    put(head, post(0.07, 0.04, 10), solid(STEEL), x, h, z);
    put(head, post(0.03, 0.06, 6), solid(GUNMETAL), x, h + 0.04, z);
    // Indicador de nivel: ventanilla naranja en el frente del depósito.
    put(head, bevelBox(0.03, 0.15, 0.012, 0.003), glow(FIRE), x, 0.1, z + 0.105);
  }
  // Tuberías de los depósitos a la boquilla.
  for (const sx of [-1, 1]) put(head, tube(0.022, 0.46), solid(STEEL_DARK), sx * 0.13, 0.15, 0.1);
  // Pilotos rojos y llama piloto.
  for (const sx of [-1, 1]) put(head, bevelBox(0.03, 0.03, 0.03, 0.005), glow(0xff3030), sx * 0.07, 0.22, 0.1);
  put(head, cone(0.025, 0.07, 5), glow(0xffd166), 0, 0.22, 0.33);
  if (level >= 2) for (const sx of [-1, 1]) put(head, bevelBox(0.045, 0.17, 0.3, 0.012), solid(STEEL_DARK), sx * 0.285, 0.0, 0.04);
  // Boquilla(s): carcasa, brida de acento, abocinado negro y brasa dentro.
  const nb = level >= 3 ? 2 : 1;
  put(head, bevelBox(nb === 2 ? 0.46 : 0.3, 0.13, 0.1, 0.02), solid(STEEL_DARK), 0, 0.03, 0.27);
  const gun = new THREE.Group();
  head.add(gun);
  const ext = level >= 2 ? 0.08 : 0;
  for (let i = 0; i < nb; i++) {
    const x = nb === 2 ? (i - 0.5) * 0.24 : 0;
    const r = nb === 2 ? 0.1 : 0.13;
    put(gun, tube(0.08, 0.3), solid(GUNMETAL), x, 0.1, 0.36);
    put(gun, tube(0.1, 0.03), acc, x, 0.1, 0.54);
    put(gun, flare(0.075, r, 0.22 + ext), solid(0x2b2523), x, 0.1, 0.67 + ext / 2);
    put(gun, tube(r - 0.015, 0.02), glow(FIRE), x, 0.1, 0.78 + ext);
  }
  const root = new THREE.Group();
  root.add(base, head);
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: 0.8 + ext, y: 0.1 }, height: neck + 0.52 };
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
export const REDESIGNED: TurretKind[] = ['turret_bullet', 'turret_laser', 'turret_fire'];

/** Modelo completo de una torreta de ese tipo y nivel (1-3). */
export function buildTurret(kind: TurretKind, level: number): TurretRig {
  const lv = Math.max(1, Math.min(3, Math.round(level)));
  if (kind === 'turret_bullet') return bulletRig(lv);
  if (kind === 'turret_laser') return laserRig(lv);
  if (kind === 'turret_fire') return fireRig(lv);
  return legacyRig(kind, lv);
}
