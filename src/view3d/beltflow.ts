/**
 * Textura de dirección de las cintas: una capa de chevrones (Pattern Pack Lines, `pattern_0029`) sobre cada cinta que se
 * desplaza en el sentido de la marcha a la velocidad real de la cinta. Sin energía se para y se oscurece.
 *
 * Todas las cintas comparten un único uniforme de fase (`uFlow`); cada instancia lleva su velocidad relativa (`aSpeed`:
 * 0 parada, 1 normal, 2 rápida, o lo que dé la energía) y su color. Dos mallas instanciadas (tramos enteros y medios tramos
 * de curvas y empalmes), así que el coste es de dos llamadas de dibujo sea cual sea el número de cintas.
 */
import * as THREE from 'three';
import { CONFIG } from '../game/config';
import type { Dir } from '../game/types';
import { beltFlowQuads } from './pieces';
import { LEVEL_H } from './pick';

/** Inclinación de una rampa de 1 nivel: sube LEVEL_H a lo largo de una casilla. */
const RAMP_ANGLE = Math.atan(LEVEL_H);

/**
 * Longitud (casillas) que ocupa la imagen entera a lo largo del flujo, y ancho de la capa. La imagen (256 px) trae cuatro
 * chevrones `>` por tira en u (apuntan a +u) y dos en v: se enseña un chevrón a lo ancho de la cinta (v de 0 a 0,5).
 */
export const FLOW_TILE = 1.2;
const WIDTH = CONFIG.scale.beltLane;
const MAX = 8192;
export const FLOW_COLOR = { normal: 0xbfeaff, fast: 0xffe9a0, stopped: 0x2f3540 };

export interface BeltInfo {
  id: number;
  /** Casilla y altura de la cara superior de la cinta. */
  x: number;
  z: number;
  top: number;
  dir: Dir;
  /** Direcciones de las vecinas que la alimentan. */
  incoming: number[];
  fast: boolean;
  /** Velocidad real en casillas por segundo (0 si está parada por falta de energía). */
  speed: number;
  /** Rampa: +1 sube hacia delante, -1 baja, 0 llano. */
  slope?: number;
}

/** Plano horizontal de `len` × WIDTH cuya textura corre a lo largo de +x con los chevrones apuntando a +x (como la imagen). */
function flowGeometry(len: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, WIDTH).rotateX(-Math.PI / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // El plano tumbado mira hacia arriba con v creciendo hacia -z: se mantiene; v de 0 a 0,5 deja un solo chevrón a lo ancho.
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / FLOW_TILE), uv.getY(i) * 0.5);
  uv.needsUpdate = true;
  return g;
}

/** Giro Y que lleva +x del plano a la dirección d. */
const yawOf = (d: number) => -(d * Math.PI) / 2;

export class BeltFlow {
  readonly group = new THREE.Group();
  /** Fase compartida por todas las cintas (la única que cambia cada fotograma). */
  readonly phase = { value: 0 };
  readonly stats = { full: 0, half: 0, moving: 0, stopped: 0 };
  private full: THREE.InstancedMesh;
  private half: THREE.InstancedMesh;
  private fullSpeed: THREE.InstancedBufferAttribute;
  private halfSpeed: THREE.InstancedBufferAttribute;
  private topo = new Map<number, string>();
  private state = new Map<number, string>();
  private tex: THREE.Texture;

  /** `tex`: la textura de chevrones (por defecto se carga `pattern_0029.png`; los tests pasan una vacía). */
  constructor(tex?: THREE.Texture) {
    this.tex = tex ?? new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/belts/pattern_0029.png`);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const phase = this.phase;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlow = phase;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float uFlow;\nattribute float aSpeed;\nvoid main() {')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.x -= uFlow * aSpeed;\n#endif');
    };
    mat.customProgramCacheKey = () => 'beltflow';
    const make = (len: number) => {
      const im = new THREE.InstancedMesh(flowGeometry(len), mat, MAX);
      const sp = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
      im.geometry.setAttribute('aSpeed', sp);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 2;
      im.setColorAt(0, new THREE.Color(0xffffff));
      this.group.add(im);
      return { im, sp };
    };
    const f = make(0.96);
    const h = make(0.5);
    this.full = f.im;
    this.fullSpeed = f.sp;
    this.half = h.im;
    this.halfSpeed = h.sp;
  }

  private static colorOf(b: BeltInfo): number {
    return b.speed <= 0 ? FLOW_COLOR.stopped : b.fast ? FLOW_COLOR.fast : FLOW_COLOR.normal;
  }

  /** Actualiza la capa: avanza la fase `dt` segundos (0 en pausa) y rehace lo que haya cambiado. */
  sync(belts: BeltInfo[], dt: number): void {
    this.phase.value += (dt * CONFIG.belt.speed) / FLOW_TILE;
    // ¿Ha cambiado la forma (cintas nuevas, quitadas, giradas o con otras entradas)?
    let rebuild = belts.length !== this.topo.size;
    if (!rebuild) {
      for (const b of belts) {
        if (this.topo.get(b.id) !== `${b.x},${b.z},${b.dir},${b.incoming.join('')},${b.top},${(b.slope ?? 0)}`) {
          rebuild = true;
          break;
        }
      }
    }
    if (rebuild) this.rebuild(belts);
    // Velocidad y color: sólo cuando cambia el estado de una cinta (energía, tipo).
    let dirty = false;
    for (const b of belts) {
      const key = `${b.fast ? 1 : 0}|${b.speed.toFixed(2)}`;
      if (this.state.get(b.id) === key && !rebuild) continue;
      this.state.set(b.id, key);
      this.paint(b);
      dirty = true;
    }
    if (dirty || rebuild) {
      for (const sp of [this.fullSpeed, this.halfSpeed]) sp.needsUpdate = true;
      if (this.full.instanceColor) this.full.instanceColor.needsUpdate = true;
      if (this.half.instanceColor) this.half.instanceColor.needsUpdate = true;
      let moving = 0;
      for (const b of belts) if (b.speed > 0) moving++;
      this.stats.moving = moving;
      this.stats.stopped = belts.length - moving;
    }
  }

  private index = new Map<number, { mesh: 0 | 1; index: number }[]>();

  private rebuild(belts: BeltInfo[]): void {
    this.topo.clear();
    this.index.clear();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const tilt = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    let nf = 0;
    let nh = 0;
    for (const b of belts) {
      this.topo.set(b.id, `${b.x},${b.z},${b.dir},${b.incoming.join('')},${b.top},${(b.slope ?? 0)}`);
      const list: { mesh: 0 | 1; index: number }[] = [];
      for (const qd of beltFlowQuads(b.dir, b.incoming)) {
        if ((qd.half ? nh : nf) >= MAX) continue;
        q.setFromAxisAngle(up, yawOf(qd.flow));
        const ramp = (b.slope ?? 0) !== 0 && !qd.half && qd.flow === b.dir;
        if (ramp) q.multiply(tilt.setFromAxisAngle(zAxis, (b.slope ?? 0) * RAMP_ANGLE));
        pos.set(b.x + 0.5 + qd.dx, b.top + 0.02 + (ramp ? ((b.slope ?? 0) * LEVEL_H) / 2 : 0), b.z + 0.5 + qd.dz);
        m.compose(pos, q, one);
        if (qd.half) {
          this.half.setMatrixAt(nh, m);
          list.push({ mesh: 1, index: nh++ });
        } else {
          this.full.setMatrixAt(nf, m);
          list.push({ mesh: 0, index: nf++ });
        }
      }
      this.index.set(b.id, list);
    }
    this.full.count = nf;
    this.half.count = nh;
    this.full.instanceMatrix.needsUpdate = true;
    this.half.instanceMatrix.needsUpdate = true;
    this.stats.full = nf;
    this.stats.half = nh;
    // Las cintas quitadas ya no tienen estado.
    for (const id of [...this.state.keys()]) if (!this.topo.has(id)) this.state.delete(id);
  }

  private paint(b: BeltInfo): void {
    const c = new THREE.Color(BeltFlow.colorOf(b));
    const k = CONFIG.belt.speed;
    const speed = b.speed / k;
    for (const it of this.index.get(b.id) ?? []) {
      const im = it.mesh === 0 ? this.full : this.half;
      const sp = it.mesh === 0 ? this.fullSpeed : this.halfSpeed;
      im.setColorAt(it.index, c);
      sp.setX(it.index, speed);
    }
  }
}
