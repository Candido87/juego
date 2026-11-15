/**
 * Efectos de la vista 3D: humo, fuego, fogonazos, explosiones, proyectiles, rayos y barras de vida.
 * Todo va en unas pocas mallas instanciadas (una llamada de dibujo por tipo), sin transparencias que ordenar:
 * las bocanadas son poliedros opacos que se encogen al morir y los brillos son aditivos.
 */
import * as THREE from 'three';
import type { TurretKind } from '../game/types';
import { TURRET_COLOR } from './actors';
import { ParticlePool, particleSize } from './particles';

const MAX_PARTICLES = 2400;
const MAX_BOLTS = 256;
const MAX_BARS = 1024;
const MAX_RINGS = 96;
const Z = new THREE.Vector3(0, 0, 1);

interface Bolt {
  /** Origen y destino. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  life: number;
  max: number;
  color: number;
  thick: number;
  /** true = proyectil corto que viaja de a hacia b; false = rayo entero que se afina. */
  travel: boolean;
  /** Al llegar (sólo proyectiles): chispa de impacto. */
  spark: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Effects {
  readonly group = new THREE.Group();
  readonly pool = new ParticlePool(MAX_PARTICLES);
  private puffs: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private boltMesh: THREE.InstancedMesh;
  private barBack: THREE.InstancedMesh;
  private barFill: THREE.InstancedMesh;
  private bolts: Bolt[] = [];
  private barN = 0;
  /** Brillos de un solo fotograma (luces piloto de las torretas). */
  private flashes: { x: number; y: number; z: number; s: number; color: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private d = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private right = new THREE.Vector3();
  private camQ = new THREE.Quaternion();
  readonly stats = { puffs: 0, glows: 0, bolts: 0, bars: 0 };

  constructor() {
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, order = 0) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = order;
      // Color por instancia desde el principio (si no, el material se compila sin él).
      im.setColorAt(0, this.c.setHex(0xffffff));
      this.group.add(im);
      return im;
    };
    const additive = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9, fog: false });
    this.puffs = inst(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, metalness: 0 }), MAX_PARTICLES);
    this.glows = inst(new THREE.IcosahedronGeometry(0.5, 1), additive(), MAX_PARTICLES, 5);
    this.rings = inst(new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2), additive(), MAX_RINGS, 5);
    (this.rings.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    this.boltMesh = inst(new THREE.BoxGeometry(1, 1, 1), additive(), MAX_BOLTS, 6);
    const barMat = (color: number) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, fog: false });
    this.barBack = inst(new THREE.PlaneGeometry(1, 1), barMat(0x1b1d24), MAX_BARS, 20);
    this.barFill = inst(new THREE.PlaneGeometry(1, 1), barMat(0xffffff), MAX_BARS, 21);
  }

  // ---------- emisores ----------
  /** Una bocanada de humo que sube y se abre. */
  smoke(x: number, y: number, z: number, color: number, size = 0.22): void {
    this.pool.spawn({ kind: 0, x: x + rnd(-0.05, 0.05), y, z: z + rnd(-0.05, 0.05), vx: rnd(-0.12, 0.12) + 0.18, vy: rnd(0.55, 0.9), vz: rnd(-0.12, 0.12), max: rnd(1.3, 1.9), s0: size * 0.6, s1: size * 2, color, drag: 0.5 });
  }

  /** Chispa o llama pequeña. */
  spark(x: number, y: number, z: number, color: number, speed = 1.6, size = 0.1): void {
    this.pool.spawn({ kind: 1, x, y, z, vx: rnd(-1, 1) * speed, vy: rnd(0.2, 1.3) * speed, vz: rnd(-1, 1) * speed, max: rnd(0.25, 0.5), s0: size, s1: size * 0.3, color, gravity: -5 });
  }

  /** Llama que sube (enemigo ardiendo, luz piloto, edificio muy dañado). */
  flame(x: number, y: number, z: number, size = 0.18): void {
    this.pool.spawn({ kind: 1, x: x + rnd(-0.12, 0.12), y, z: z + rnd(-0.12, 0.12), vy: rnd(0.6, 1.1), max: rnd(0.3, 0.5), s0: size, s1: size * 0.25, color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040 });
  }

  /** Destello breve (muerte de un enemigo, impacto). */
  pop(x: number, y: number, z: number, color: number, size = 0.5): void {
    this.pool.spawn({ kind: 1, x, y, z, max: 0.22, s0: size * 0.5, s1: size * 1.5, color });
    for (let i = 0; i < 5; i++) this.spark(x, y, z, color, 1.5, 0.09);
  }

  /** Anillo que se abre en el suelo. */
  ring(x: number, y: number, z: number, r0: number, r1: number, color: number, time = 0.4): void {
    this.pool.spawn({ kind: 2, x, y, z, max: time, s0: r0, s1: r1, color });
  }

  /** Explosión: bola de fuego, humo negro, escombros y onda en el suelo. */
  explosion(x: number, y: number, z: number, size = 1): void {
    this.pool.spawn({ kind: 1, x, y: y + 0.3, z, max: 0.3, s0: 0.5 * size, s1: 1.9 * size, color: 0xffb040 });
    this.pool.spawn({ kind: 1, x, y: y + 0.3, z, max: 0.18, s0: 0.4 * size, s1: 1.2 * size, color: 0xffffff });
    this.ring(x, y + 0.06, z, 0.3 * size, 1.7 * size, 0xffc060, 0.35);
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.5, 1.6) * size;
      this.pool.spawn({ kind: 0, x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rnd(0.8, 2.2), vz: Math.sin(a) * sp, max: rnd(0.8, 1.4), s0: 0.25 * size, s1: 0.65 * size, color: i % 3 ? 0x2c2c33 : 0x55555f, drag: 1.6 });
    }
    for (let i = 0; i < 8; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(1.2, 2.6) * size;
      this.pool.spawn({ kind: 0, x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rnd(2.5, 4.5), vz: Math.sin(a) * sp, max: rnd(0.7, 1), s0: 0.11, s1: 0.09, color: 0x6b5a4a, gravity: -11 });
    }
    for (let i = 0; i < 10; i++) this.spark(x, y + 0.3, z, 0xffd070, 3 * size, 0.1);
  }

  /** Brillo de un solo fotograma (hay que pedirlo cada fotograma). */
  glow(x: number, y: number, z: number, size: number, color: number): void {
    this.flashes.push({ x, y, z, s: size, color });
  }

  /** Disparo de una torreta: cada tipo tiene su proyectil. `area` es el radio de efecto en el objetivo (0 = un solo blanco). */
  shot(kind: TurretKind, from: THREE.Vector3, to: THREE.Vector3, area: number): void {
    const col = TURRET_COLOR[kind];
    const dir = this.v.copy(to).sub(from);
    const len = Math.max(0.001, dir.length());
    dir.divideScalar(len);
    if (kind === 'turret_bullet') {
      // Bala trazadora rápida, fogonazo en la boca y chispa al impactar.
      this.pool.spawn({ kind: 1, x: from.x, y: from.y, z: from.z, max: 0.07, s0: 0.34, s1: 0.12, color: 0xfff0a0 });
      this.pool.spawn({ kind: 0, x: from.x, y: from.y, z: from.z, vx: dir.x * 0.5, vy: 0.3, vz: dir.z * 0.5, max: 0.45, s0: 0.06, s1: 0.18, color: 0xc8c8c8 });
      this.bolts.push({ a: from.clone(), b: to.clone(), life: Math.min(0.16, len / 38), max: Math.min(0.16, len / 38), color: col, thick: 0.07, travel: true, spark: true });
    } else if (kind === 'turret_laser') {
      // Rayo continuo que se afina: núcleo blanco dentro de un haz de color.
      this.bolts.push({ a: from.clone(), b: to.clone(), life: 0.2, max: 0.2, color: col, thick: 0.13, travel: false, spark: false });
      this.bolts.push({ a: from.clone(), b: to.clone(), life: 0.12, max: 0.12, color: 0xffffff, thick: 0.05, travel: false, spark: false });
      this.pool.spawn({ kind: 1, x: from.x, y: from.y, z: from.z, max: 0.12, s0: 0.3, s1: 0.1, color: col });
      this.pool.spawn({ kind: 1, x: to.x, y: to.y, z: to.z, max: 0.2, s0: 0.25, s1: 0.5, color: col });
      for (let i = 0; i < 3; i++) this.spark(to.x, to.y, to.z, col, 1.4, 0.07);
    } else if (kind === 'turret_fire') {
      // Chorro de llamas que se abre hacia el objetivo y deja humo.
      for (let i = 0; i < 9; i++) {
        const sp = len / rnd(0.22, 0.34);
        this.pool.spawn({ kind: 1, x: from.x, y: from.y, z: from.z, vx: dir.x * sp + rnd(-0.7, 0.7), vy: dir.y * sp + rnd(-0.2, 0.6), vz: dir.z * sp + rnd(-0.7, 0.7), max: rnd(0.24, 0.36), s0: 0.12, s1: 0.5, color: i % 3 === 0 ? 0xffd050 : i % 3 === 1 ? 0xff8a20 : 0xff4a10 });
      }
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, Math.PI * 2);
        const r = rnd(0, area);
        this.flame(to.x + Math.cos(a) * r, to.y - 0.3, to.z + Math.sin(a) * r, 0.3);
      }
      this.smoke(to.x, to.y, to.z, 0x3a3a40, 0.16);
    } else {
      // Pulso de hielo: haz pálido, anillo que se abre en el área y esquirlas.
      this.bolts.push({ a: from.clone(), b: to.clone(), life: 0.22, max: 0.22, color: col, thick: 0.16, travel: false, spark: false });
      this.ring(to.x, to.y - 0.42, to.z, 0.2, Math.max(0.6, area), col, 0.45);
      this.ring(to.x, to.y - 0.42, to.z, 0.1, Math.max(0.4, area * 0.6), 0xffffff, 0.3);
      for (let i = 0; i < 7; i++) {
        const a = rnd(0, Math.PI * 2);
        this.pool.spawn({ kind: 0, x: to.x, y: to.y - 0.2, z: to.z, vx: Math.cos(a) * rnd(0.8, 2), vy: rnd(0.8, 2), vz: Math.sin(a) * rnd(0.8, 2), max: rnd(0.4, 0.7), s0: 0.1, s1: 0.04, color: 0xe8fbff, gravity: -6 });
      }
    }
  }

  /** Barra de vida sobre un punto del mundo (hay que pedirla cada fotograma). */
  bar(x: number, y: number, z: number, frac: number, width = 0.6, color?: number): void {
    if (this.barN >= MAX_BARS) return;
    const f = Math.min(1, Math.max(0, frac));
    const h = 0.085;
    this.v.set(x, y, z);
    this.m.compose(this.v, this.camQ, this.s.set(width + 0.05, h + 0.05, 1));
    this.barBack.setMatrixAt(this.barN, this.m);
    // El relleno se ancla a la izquierda (desplazado sobre el eje derecho de la cámara).
    this.v.addScaledVector(this.right, (-(1 - f) * width) / 2);
    this.m.compose(this.v, this.camQ, this.s.set(Math.max(0.001, width * f), h, 1));
    this.barFill.setMatrixAt(this.barN, this.m);
    this.barFill.setColorAt(this.barN, this.c.setHex(color ?? (f > 0.6 ? 0x5fd35f : f > 0.3 ? 0xffc23c : 0xff5040)));
    this.barN++;
  }

  // ---------- fotograma ----------
  /** Avanza y vuelca todo a las mallas. Llamar una vez por fotograma, después de pedir barras y brillos. */
  update(dt: number, camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.camQ);
    this.pool.step(dt);
    let np = 0;
    let ng = 0;
    let nr = 0;
    for (const p of this.pool.list) {
      const size = particleSize(p);
      if (p.kind === 2) {
        if (nr >= MAX_RINGS) continue;
        this.m.makeScale(size, 1, size).setPosition(p.x, p.y, p.z);
        this.rings.setMatrixAt(nr, this.m);
        // Los anillos se apagan oscureciéndose (son aditivos).
        this.rings.setColorAt(nr, this.c.setHex(p.color).multiplyScalar(Math.min(1, (p.life / p.max) * 1.6)));
        nr++;
        continue;
      }
      this.m.makeScale(size, size, size).setPosition(p.x, p.y, p.z);
      if (p.kind === 0) {
        this.puffs.setMatrixAt(np, this.m);
        this.puffs.setColorAt(np, this.c.setHex(p.color));
        np++;
      } else {
        this.glows.setMatrixAt(ng, this.m);
        this.glows.setColorAt(ng, this.c.setHex(p.color));
        ng++;
      }
    }
    for (const f of this.flashes) {
      if (ng >= MAX_PARTICLES) break;
      this.m.makeScale(f.s, f.s, f.s).setPosition(f.x, f.y, f.z);
      this.glows.setMatrixAt(ng, this.m);
      this.glows.setColorAt(ng, this.c.setHex(f.color));
      ng++;
    }
    this.flashes.length = 0;
    // Proyectiles y rayos: cajas alargadas orientadas de origen a destino.
    let nb = 0;
    this.bolts = this.bolts.filter((b) => {
      b.life -= dt;
      if (b.life <= 0) {
        if (b.spark) this.pop(b.b.x, b.b.y, b.b.z, b.color, 0.3);
        return false;
      }
      if (nb >= MAX_BOLTS) return true;
      const k = 1 - b.life / b.max;
      const dir = this.d.copy(b.b).sub(b.a);
      const len = dir.length();
      this.q.setFromUnitVectors(Z, dir.divideScalar(Math.max(len, 0.001)));
      if (b.travel) {
        const seg = Math.min(0.55, len);
        this.s.set(b.thick, b.thick, seg);
        this.v.copy(b.a).addScaledVector(dir, Math.max(seg / 2, k * len - seg / 2));
      } else {
        const t = b.thick * (1 - k);
        this.s.set(t, t, len);
        this.v.copy(b.a).addScaledVector(dir, len / 2);
      }
      this.m.compose(this.v, this.q, this.s);
      this.boltMesh.setMatrixAt(nb, this.m);
      this.boltMesh.setColorAt(nb, this.c.setHex(b.color));
      nb++;
      return true;
    });
    const flush = (im: THREE.InstancedMesh, n: number) => {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    };
    flush(this.puffs, np);
    flush(this.glows, ng);
    flush(this.rings, nr);
    flush(this.boltMesh, nb);
    flush(this.barBack, this.barN);
    flush(this.barFill, this.barN);
    this.stats.puffs = np;
    this.stats.glows = ng;
    this.stats.bolts = nb;
    this.stats.bars = this.barN;
    this.barN = 0;
  }

  /** Prepara las barras del fotograma: hay que llamarlo antes de pedirlas (fija el eje derecho de la cámara). */
  begin(camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.camQ);
    this.right.set(1, 0, 0).applyQuaternion(this.camQ);
  }
}
