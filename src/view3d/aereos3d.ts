/**
 * Aeronaves enemigas en 3D (AIR7): modelos propios del Space Kit de Kenney, sin esqueleto. Cada una gira hacia donde vuela,
 * se alabea al virar, flota con un balanceo suave y proyecta una sombra en el suelo (la altura se lee mejor con ella).
 * La parte de decisión (rumbo, alabeo, cuándo cae una bomba) es pura y tiene test.
 */
import * as THREE from 'three';
import { instance, tint } from './loader';
import { AIR_MODEL } from './catalog';
import type { EnemyKind } from '../game/types';

/** Giro Y de Three que apunta el morro (+z del modelo) hacia el desplazamiento (dx, dz) del plano; null si no se mueve. */
export function airYaw(dx: number, dz: number): number | null {
  return Math.abs(dx) + Math.abs(dz) < 1e-5 ? null : Math.atan2(dx, dz);
}

/** Diferencia angular más corta entre dos giros, en (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Alabeo (giro sobre el eje de avance) en función de la velocidad de giro: se inclina hacia el lado al que vira, con tope. */
export function bankFor(yawRate: number, max = 0.5): number {
  return Math.max(-max, Math.min(max, -yawRate * 0.25));
}

/** ¿Suelta una bomba este fotograma? Sólo un bombardero sobre su objetivo, con tasa media `rate` bombas por segundo. */
export function dropsBomb(bombing: boolean, dt: number, rate: number, roll: number): boolean {
  return bombing && roll < Math.min(1, rate * dt);
}

interface Craft {
  group: THREE.Group;
  shadow: THREE.Mesh;
  yaw: number;
  roll: number;
  lastX: number;
  lastZ: number;
}

const SHADOW_GEO = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

/** Todas las aeronaves en pantalla (una por enemigo aéreo vivo). */
export class AirFleet {
  private crafts = new Map<number, Craft>();
  constructor(private scene: THREE.Scene) {}

  has(kind: EnemyKind): boolean {
    return !!AIR_MODEL[kind];
  }

  /** Coloca (creando si hace falta) la aeronave del enemigo `id`. `ground` es la altura del suelo bajo ella. Devuelve su altura total sobre el suelo. */
  place(id: number, kind: EnemyKind, x: number, z: number, ground: number, time: number, dt: number): number {
    const def = AIR_MODEL[kind]!;
    let c = this.crafts.get(id);
    if (!c) {
      const group = new THREE.Group();
      const model = instance(def.model, def.fit);
      tint(model, def.tint);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      group.add(model);
      const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
      shadow.scale.set(def.fit * 0.9, 1, def.fit * 0.9);
      this.scene.add(group);
      this.scene.add(shadow);
      c = { group, shadow, yaw: 0, roll: 0, lastX: x, lastZ: z };
      this.crafts.set(id, c);
    }
    const want = airYaw(x - c.lastX, z - c.lastZ);
    if (want !== null && dt > 0) {
      const d = angleDelta(c.yaw, want);
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 3);
      c.yaw += step;
      c.roll += (bankFor(step / dt) - c.roll) * Math.min(1, dt * 6);
      c.lastX = x;
      c.lastZ = z;
    } else if (want === null) c.roll *= 0.9;
    const bob = Math.sin(time * 2.2 + id) * 0.05;
    const y = ground + def.lift + bob;
    c.group.position.set(x, y, z);
    c.group.rotation.set(Math.sin(time * 1.7 + id) * 0.03, c.yaw, c.roll, 'YXZ');
    c.shadow.position.set(x, ground + 0.02, z);
    // La sombra se desvanece y crece un poco cuanto más alto vuela.
    return def.lift + (def.fit * 0.4);
  }

  /** Quita las aeronaves cuyo enemigo ya no existe (devuelve las que han caído, para efectos). */
  prune(alive: Set<number>): { id: number; x: number; y: number; z: number }[] {
    const gone: { id: number; x: number; y: number; z: number }[] = [];
    for (const [id, c] of this.crafts) {
      if (alive.has(id)) continue;
      gone.push({ id, x: c.group.position.x, y: c.group.position.y, z: c.group.position.z });
      this.scene.remove(c.group);
      this.scene.remove(c.shadow);
      this.crafts.delete(id);
    }
    return gone;
  }

  get count(): number {
    return this.crafts.size;
  }
}
