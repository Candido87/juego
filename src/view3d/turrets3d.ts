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
 * El misil no existe en la lógica del juego: su modelo sólo se ve en la galería (`GALLERY_ONLY`).
 */
import * as THREE from 'three';
import type { TurretKind } from '../game/types';
import { patchMaterial } from './fx';

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
  /** Luz roja de aviso en la base: parpadea cuando la torreta no puede disparar (sin munición ni energía). */
  alarm: THREE.Object3D;
  /** Piezas que laten (cristales) mientras la torreta está lista; apagada, se encogen. */
  pulse: THREE.Object3D[];
  /** Brillos puntuales (lentes, cristales, pilotos) en coordenadas de `head`; sólo lucen con la torreta lista. */
  halos: TurretHalo[];
}

export interface TurretHalo {
  x: number;
  y: number;
  z: number;
  size: number;
  color: number;
  /** Se enciende y se apaga (pilotos de aviso). */
  blink?: boolean;
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
function makeBase(accent: number, level: number): { base: THREE.Group; neck: number; alarm: THREE.Object3D } {
  const acc = solid(accent);
  const base = new THREE.Group();
  put(base, bevelBox(0.92, 0.08, 0.92, 0.03), solid(STEEL_DARK), 0, 0, 0);
  // Franja de acento ancha y gruesa: es lo que da el color del tipo a zoom alejado.
  put(base, bevelBox(0.9, 0.034, 0.9, 0.008), acc, 0, 0.07, 0);
  put(base, bevelBox(0.78, 0.06, 0.78, 0.025), solid(STEEL), 0, 0.08, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(base, post(0.032, 0.03, 6), solid(STEEL_LIGHT), sx * 0.32, 0.14, sz * 0.32);
  put(base, post(0.15, 0.17, 10), solid(STEEL_DARK), 0, 0.14, 0);
  put(base, post(0.17, 0.03, 10), solid(STEEL), 0, 0.2, 0);
  put(base, post(0.235, 0.04, 12), solid(GUNMETAL), 0, 0.31, 0);
  if (level >= 3) {
    for (const [x, z] of [[0, 0.34], [0, -0.34], [0.34, 0], [-0.34, 0]]) put(base, bevelBox(0.13, 0.09, 0.13, 0.02), solid(STEEL), x, 0.14, z);
  }
  // Luz de aviso (oculta salvo cuando la torreta no puede disparar), detrás del pedestal.
  const alarm = new THREE.Group();
  put(alarm, post(0.03, 0.05, 6), solid(STEEL_DARK), 0, 0, 0);
  put(alarm, new THREE.SphereGeometry(0.04, 8, 6), glow(0xff3030), 0, 0.07, 0);
  alarm.position.set(0, 0.14, -0.34);
  alarm.visible = false;
  base.add(alarm);
  return { base, neck: 0.35, alarm };
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
  const { base, neck, alarm } = makeBase(accent, level);

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
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: L, y: 0.1 }, height: neck + 0.38, alarm, pulse: [], halos: [{ x: 0.2, y: 0.185, z: 0.14, size: 0.07, color: 0x7be3ff }] };
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
  const { base, neck, alarm } = makeBase(CYAN, level);
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
  const crystal = put(head, cone(cr, ch, 6), glow(CYAN), 0, 0.295, 0);
  const core = put(head, cone(cr * 0.45, ch * 0.8, 6), glow(0xd8fbff), 0, 0.3, 0);
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
  const halos: TurretHalo[] = [
    { x: 0, y: 0.3 + ch * 0.55, z: 0, size: 0.22, color: CYAN },
    { x: 0, y: 0.1, z: L + 0.02, size: 0.12, color: CYAN },
  ];
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: L + 0.015, y: 0.1 }, height: neck + 0.3 + ch, alarm, pulse: [crystal, core], halos };
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
  const { base, neck, alarm } = makeBase(FIRE, level);
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
  const halos: TurretHalo[] = [
    { x: 0, y: 0.26, z: 0.33, size: 0.07, color: 0xffd166 },
    { x: -0.07, y: 0.235, z: 0.1, size: 0.05, color: 0xff3030, blink: true },
    { x: 0.07, y: 0.235, z: 0.1, size: 0.05, color: 0xff3030, blink: true },
  ];
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: 0.8 + ext, y: 0.1 }, height: neck + 0.52, alarm, pulse: [], halos };
}

// ---------- torreta de hielo ----------
export const ICE = 0x9be7ff;
const ICE_MID = 0x6fc9ff;
const FROST_WHITE = 0xe9fbff;
const FROST_BODY = 0x5d7a99;

/**
 * Torreta de hielo. Cuerpo azul acero con franja blanco hielo; **racimo de cristales azules** (4, 5 y 6) detrás, de distinta
 * altura e inclinación; **tubos de refrigerante** blancos con abrazaderas del racimo a la boca; boca ancha de acero con
 * escarcha (carámbanos alrededor) y un resplandor blanco dentro. Nivel 2: blindaje y boca más larga. Nivel 3: boca doble.
 */
function frostRig(level: number): TurretRig {
  const acc = solid(FROST_WHITE);
  const { base, neck, alarm } = makeBase(FROST_WHITE, level);
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = neck;
  put(head, octo(0.3, 0.28, 0.15), solid(FROST_BODY), 0, 0, 0);
  put(head, octo(0.305, 0.305, 0.02), acc, 0, 0.085, 0);
  put(head, octo(0.22, 0.17, 0.08), solid(0x8fb0cc), 0, 0.15, 0);
  // Racimo de cristales: pirámides facetadas de distinta altura e inclinación, alternando dos azules.
  const crystals: [number, number, number, number, number][] = [
    [0.0, -0.1, 0.46, 0.085, 0],
    [-0.14, -0.04, 0.34, 0.07, 0.22],
    [0.14, -0.05, 0.36, 0.07, -0.22],
    [-0.07, -0.18, 0.3, 0.06, 0.12],
    [0.1, -0.2, 0.27, 0.055, -0.15],
    [-0.2, 0.06, 0.22, 0.05, 0.3],
  ];
  const shards: THREE.Object3D[] = [];
  crystals.slice(0, 3 + level).forEach(([x, z, h, r, tilt], i) => {
    shards.push(put(head, cone(r, h, 5), glow(i % 2 ? ICE_MID : ICE), x, 0.2, z, [tilt * 0.6, 0.4 * i, tilt]));
  });
  put(head, octo(0.19, 0.17, 0.04), solid(STEEL_DARK), 0, 0.19, -0.08);
  // Tubos de refrigerante del racimo a la boca, con abrazaderas.
  for (const sx of [-1, 1]) {
    put(head, tube(0.022, 0.5), solid(FROST_WHITE), sx * 0.13, 0.2, 0.12);
    for (const z of [-0.06, 0.1, 0.26]) put(head, tube(0.032, 0.025), solid(STEEL_DARK), sx * 0.13, 0.2, z);
  }
  if (level >= 2) for (const sx of [-1, 1]) put(head, bevelBox(0.045, 0.17, 0.32, 0.012), solid(STEEL_DARK), sx * 0.285, 0.0, 0.04);
  const nb = level >= 3 ? 2 : 1;
  put(head, bevelBox(nb === 2 ? 0.46 : 0.3, 0.13, 0.1, 0.02), solid(STEEL_DARK), 0, 0.03, 0.27);
  const gun = new THREE.Group();
  head.add(gun);
  const ext = level >= 2 ? 0.07 : 0;
  for (let i = 0; i < nb; i++) {
    const x = nb === 2 ? (i - 0.5) * 0.25 : 0;
    const r = nb === 2 ? 0.11 : 0.15;
    put(gun, tube(0.085, 0.3), solid(STEEL), x, 0.1, 0.36);
    put(gun, tube(0.1, 0.03), acc, x, 0.1, 0.54);
    put(gun, flare(0.08, r, 0.2 + ext), solid(0xaec9d8), x, 0.1, 0.66 + ext / 2);
    put(gun, tube(r - 0.02, 0.02), glow(FROST_WHITE), x, 0.1, 0.76 + ext);
    // Carámbanos alrededor de la boca.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      put(gun, cone(0.022, 0.1, 4), glow(ICE), x + Math.cos(a) * (r + 0.005), 0.1 + Math.sin(a) * (r + 0.005), 0.74 + ext, [Math.PI / 2, 0, 0]);
    }
  }
  const root = new THREE.Group();
  root.add(base, head);
  const halos: TurretHalo[] = [
    { x: 0, y: 0.42, z: -0.1, size: 0.2, color: ICE },
    { x: 0, y: 0.1, z: 0.78 + ext, size: 0.13, color: FROST_WHITE },
  ];
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd: 0.78 + ext, y: 0.1 }, height: neck + 0.5 + 0.02 * level, alarm, pulse: shards, halos };
}

// ---------- torreta de misiles (sólo galería) ----------
const MIL_GREEN = 0x56703f;
const MIL_DARK = 0x3d5030;
const MIL_ACCENT = 0xb5c95a;
const WARHEAD = 0xc0392b;

/**
 * Torreta de misiles. Base de acero con franja verde militar; cuerpo verde con rejilla; **rack de tubos inclinados** hacia
 * arriba, con las **cabezas rojas** de los misiles asomando y una banda blanca; antena con plato. Tubos: 2, 4 y 6
 * (nivel 3: tres columnas); nivel 2 añade blindaje y nivel 3 el plato de radar. La lógica no tiene este tipo de torreta.
 */
function missileRig(level: number): TurretRig {
  const acc = solid(MIL_ACCENT);
  const { base, neck, alarm } = makeBase(MIL_ACCENT, level);
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.y = neck;
  put(head, octo(0.3, 0.28, 0.15), solid(MIL_GREEN), 0, 0, 0);
  put(head, octo(0.305, 0.305, 0.02), acc, 0, 0.085, 0);
  put(head, octo(0.22, 0.2, 0.06), solid(MIL_DARK), 0, 0.15, -0.04);
  // Rejilla de ventilación trasera.
  for (const i of [0, 1, 2]) put(head, bevelBox(0.2, 0.014, 0.02, 0.004), solid(GUNMETAL), 0, 0.2 + i * 0.0, -0.18 - i * 0.03);
  // Antena con plato (nivel 3: plato de radar más grande).
  put(head, post(0.012, 0.3, 6), solid(STEEL_LIGHT), -0.2, 0.15, -0.14);
  put(head, post(level >= 3 ? 0.09 : 0.05, 0.015, 10), solid(STEEL), -0.2, 0.44, -0.14);
  put(head, post(0.014, 0.05, 6), glow(0xff3030), -0.2, 0.455, -0.14);
  if (level >= 2) for (const sx of [-1, 1]) put(head, bevelBox(0.045, 0.17, 0.3, 0.012), solid(MIL_DARK), sx * 0.285, 0.0, 0.04);
  // Soportes del rack.
  for (const sx of [-1, 1]) put(head, bevelBox(0.05, 0.2, 0.18, 0.012), solid(STEEL_DARK), sx * 0.15 * (level >= 3 ? 1.5 : 1), 0.1, 0.06);
  // Rack: caja inclinada con tubos y cabezas de misil.
  const gun = new THREE.Group();
  head.add(gun);
  const rack = new THREE.Group();
  rack.position.set(0, 0.24, 0.08);
  rack.rotation.x = -0.5;
  gun.add(rack);
  const cols = level >= 3 ? 3 : level >= 2 ? 2 : 2;
  const rows = level >= 2 ? 2 : 1;
  const pitch = 0.16;
  const w = cols * pitch + 0.06;
  const h = rows * pitch + 0.06;
  put(rack, bevelBox(w, h, 0.5, 0.03), solid(MIL_DARK), 0, -h / 2, 0.25);
  const TL = 0.62;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * pitch;
      const y = -h / 2 + (r - (rows - 1) / 2) * pitch;
      put(rack, tube(0.068, TL), solid(STEEL_DARK), x, y, TL / 2 - 0.02);
      put(rack, tube(0.075, 0.03), acc, x, y, TL - 0.05);
      put(rack, tube(0.055, 0.03), solid(0xf0f0f0), x, y, TL - 0.12);
      put(rack, cone(0.052, 0.13, 8), solid(WARHEAD), x, y, TL - 0.04, [Math.PI / 2, 0, 0]);
    }
  }
  // La boca está en el extremo del rack, ya inclinado.
  const fwd = 0.08 + TL * Math.cos(0.5);
  const my = 0.24 + TL * Math.sin(0.5) - h / 2;
  const root = new THREE.Group();
  root.add(base, head);
  const halos: TurretHalo[] = [{ x: -0.2, y: 0.47, z: -0.14, size: 0.08, color: 0xff3030, blink: true }];
  return { root, base, head, gun, gunRest: 0, muzzle: { fwd, y: my }, height: neck + my + 0.1, alarm, pulse: [], halos };
}

// ---------- estados: daño, obra y animación ----------

/** Nivel de daño de una torreta según su vida: 0 intacta, 1 dañada (grietas y humo), 2 muy dañada (más grietas y un agujero). */
export function turretDamage(hp: number, maxHp: number): 0 | 1 | 2 {
  const f = maxHp > 0 ? hp / maxHp : 1;
  return f < 0.25 ? 2 : f < 0.5 ? 1 : 0;
}

const CRACK = 0x14151a;
/** Grietas y quemaduras sobre la base y la torreta; el nivel 2 añade más y un agujero en la cúpula. */
function addDamage(rig: TurretRig, damage: number): void {
  const dark = solid(CRACK);
  const soot = solid(0x26262b);
  // Base: dos grietas en la placa y una mancha de quemadura.
  put(rig.base, bevelBox(0.32, 0.006, 0.014, 0.002), dark, 0.12, 0.142, 0.22, [0, 0.5, 0]);
  put(rig.base, bevelBox(0.26, 0.006, 0.014, 0.002), dark, -0.22, 0.142, -0.1, [0, -0.7, 0]);
  put(rig.base, bevelBox(0.22, 0.005, 0.16, 0.002), soot, 0.26, 0.141, -0.24, [0, 0.4, 0]);
  // Torreta: grietas verticales en los costados y una en la cúpula.
  put(rig.head, bevelBox(0.014, 0.12, 0.014, 0.003), dark, 0.285, 0.04, 0.1, [0, 0, 0.1]);
  put(rig.head, bevelBox(0.014, 0.12, 0.014, 0.003), dark, -0.1, 0.04, 0.285, [0.12, 0, 0]);
  put(rig.head, bevelBox(0.14, 0.006, 0.012, 0.002), dark, 0.04, 0.312, 0.0, [0, 0.8, 0]);
  if (damage >= 2) {
    put(rig.base, bevelBox(0.3, 0.006, 0.014, 0.002), dark, -0.08, 0.142, 0.3, [0, -0.3, 0]);
    put(rig.head, bevelBox(0.014, 0.12, 0.014, 0.003), dark, -0.285, 0.04, -0.12, [0, 0, -0.15]);
    put(rig.head, bevelBox(0.014, 0.12, 0.014, 0.003), dark, 0.2, 0.04, -0.2, [0.1, 0, 0]);
    // Agujero en la cúpula y una chapa suelta.
    put(rig.head, post(0.045, 0.012, 7), dark, -0.09, 0.3, 0.04);
    put(rig.head, bevelBox(0.1, 0.012, 0.08, 0.003), soot, 0.1, 0.3, -0.06, [0.25, 0.4, 0.2]);
  }
}

/** Andamio de madera alrededor de una torreta en obra (cuatro postes, dos pisos de travesaños y dos diagonales). */
export function scaffold(height: number): THREE.Group {
  const g = new THREE.Group();
  const wood = solid(0xb98a52);
  const h = Math.max(0.5, height);
  const half = 0.47;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, post(0.02, h, 6), wood, sx * half, 0, sz * half);
  for (const y of [0.22, h * 0.7]) {
    for (const s of [-1, 1]) {
      put(g, bevelBox(half * 2, 0.025, 0.025, 0.006), wood, 0, y, s * half);
      put(g, bevelBox(0.025, 0.025, half * 2, 0.006), wood, s * half, y, 0);
    }
  }
  const len = Math.hypot(half * 2, h * 0.7 - 0.22);
  const ang = Math.atan2(h * 0.7 - 0.22, half * 2);
  put(g, bevelBox(0.02, 0.02, len, 0.005), wood, half, 0.22 + (h * 0.7 - 0.22) / 2, 0, [-ang, 0, 0]);
  put(g, bevelBox(len, 0.02, 0.02, 0.005), wood, 0, 0.22 + (h * 0.7 - 0.22) / 2, half, [0, 0, ang]);
  return g;
}

/**
 * Anima lo que no es el giro ni el retroceso: cristales que laten, brillos y pilotos que parpadean y la luz roja de aviso.
 * `ready` = la torreta puede disparar. `emit` pinta un brillo de un fotograma en una posición del mundo.
 */
export function animateRig(rig: TurretRig, t: number, ready: boolean, emit: (x: number, y: number, z: number, size: number, color: number) => void): void {
  rig.alarm.visible = !ready && Math.sin(t * 7) > 0;
  const k = ready ? 1 + 0.07 * Math.sin(t * 4) : 0.8;
  for (const p of rig.pulse) p.scale.set(k, 1 + (k - 1) * 2, k);
  if (!ready) return;
  rig.head.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  for (const h of rig.halos) {
    if (h.blink && Math.sin(t * 5 + h.x * 20) < 0) continue;
    v.set(h.x, h.y, h.z).applyMatrix4(rig.head.matrixWorld);
    emit(v.x, v.y, v.z, h.size * (1 + 0.15 * Math.sin(t * 3 + h.y * 9)), h.color);
  }
}

/** Tipos de torreta que se pueden dibujar: los del juego más el misil, que de momento sólo sale en la galería. */
export type TurretModelKind = TurretKind | 'turret_missile';
export const MODEL_KINDS: TurretModelKind[] = ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost', 'turret_missile'];
/** Tipos con modelo propio (todos). */
export const REDESIGNED: TurretModelKind[] = MODEL_KINDS;
/** Modelos que existen sólo para la galería: la lógica no tiene ese tipo de torreta (no se puede colocar en partida). */
export const GALLERY_ONLY: TurretModelKind[] = [];

/** Modelo completo de una torreta de ese tipo y nivel (1-3). */
/** Apoya la torreta en y = 0: si alguna pieza de la base baja del suelo (placas, patas), se sube todo el conjunto lo que sobre. */
function groundRig(rig: TurretRig): void {
  rig.root.updateMatrixWorld(true);
  const min = new THREE.Box3().setFromObject(rig.root).min.y;
  if (Math.abs(min) < 1e-4) return;
  for (const c of rig.root.children) c.position.y -= min;
  rig.height -= min;
}

export function buildTurret(kind: TurretModelKind, level: number, damage = 0): TurretRig {
  const lv = Math.max(1, Math.min(3, Math.round(level)));
  const rig = kind === 'turret_bullet' ? bulletRig(lv) : kind === 'turret_laser' ? laserRig(lv) : kind === 'turret_fire' ? fireRig(lv) : kind === 'turret_frost' ? frostRig(lv) : missileRig(lv);
  groundRig(rig);
  if (damage > 0) addDamage(rig, damage);
  return rig;
}
