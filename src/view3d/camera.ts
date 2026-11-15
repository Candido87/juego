/**
 * Cámara isométrica ortográfica (matemática pura, sin Three ni DOM).
 * Elevación 30° (la losa se ve 2:1, igual que la vista 2D), giro en pasos de 90°.
 * Mundo: x → +x del juego, z → +y del juego, y → altura.
 */
export const PITCH = Math.PI / 6;
export const BASE_YAW = Math.PI / 4;
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 4;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class CameraRig {
  /** Punto del suelo al que mira (x, z). */
  x = 0;
  z = 0;
  /** Paso de giro entero (cada uno = 90°). */
  step = 0;
  /** Ángulo actual (se acerca al objetivo de `step`). */
  yaw = BASE_YAW;
  zoom = 1;
  /** Píxeles por unidad de mundo con zoom 1. */
  readonly ppu: number;
  constructor(ppu = 48) {
    this.ppu = ppu;
  }

  get targetYaw(): number {
    return BASE_YAW + (this.step * Math.PI) / 2;
  }

  rotate(dir: 1 | -1): void {
    this.step += dir;
  }

  /** Paso normalizado 0..3 (para tablas por orientación). */
  get quarter(): number {
    return ((this.step % 4) + 4) % 4;
  }

  setZoom(z: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  /**
   * Zoom hacia el cursor: (sx, sy) son píxeles desde el centro de la pantalla (sy hacia abajo).
   * El punto del suelo bajo el cursor se queda quieto.
   */
  zoomAt(factor: number, sx: number, sy: number): void {
    const s0 = this.ppu * this.zoom;
    this.setZoom(this.zoom * factor);
    const s1 = this.ppu * this.zoom;
    const k = 1 / s0 - 1 / s1;
    const r = this.right();
    const f = this.forward();
    const fy = -sy / Math.sin(PITCH);
    this.x += (r.x * sx + f.x * fy) * k;
    this.z += (r.z * sx + f.z * fy) * k;
  }

  /** Vector de "derecha" de la pantalla sobre el suelo. */
  right(): Vec3 {
    return { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
  }
  /** Vector de "arriba" de la pantalla sobre el suelo (alejándose de la cámara). */
  forward(): Vec3 {
    return { x: -Math.sin(this.yaw), y: 0, z: -Math.cos(this.yaw) };
  }

  /** Arrastre: el mundo sigue al cursor (dx, dy en píxeles de pantalla). */
  drag(dx: number, dy: number): void {
    const s = this.ppu * this.zoom;
    const r = this.right();
    const f = this.forward();
    this.x += -r.x * (dx / s) + f.x * (dy / (s * Math.sin(PITCH)));
    this.z += -r.z * (dx / s) + f.z * (dy / (s * Math.sin(PITCH)));
  }

  /** Movimiento con teclas: (sx, sy) en {-1,0,1}, sy>0 = hacia arriba de la pantalla. */
  move(sx: number, sy: number, speed: number, dt: number): void {
    const r = this.right();
    const f = this.forward();
    const k = (speed * dt) / this.zoom;
    this.x += (r.x * sx + f.x * sy) * k;
    this.z += (r.z * sx + f.z * sy) * k;
  }

  /** Acerca `yaw` a su objetivo por el camino corto. */
  update(dt: number): void {
    const diff = this.targetYaw - this.yaw;
    const k = 1 - Math.exp(-dt * 10);
    this.yaw = Math.abs(diff) < 1e-4 ? this.targetYaw : this.yaw + diff * k;
  }

  /** Posición de la cámara para una distancia dada (la ortográfica sólo necesita dirección). */
  position(dist = 80): Vec3 {
    return {
      x: this.x + dist * Math.cos(PITCH) * Math.sin(this.yaw),
      y: dist * Math.sin(PITCH),
      z: this.z + dist * Math.cos(PITCH) * Math.cos(this.yaw),
    };
  }

  /** Mitad del alto visible (unidades de mundo) para una ventana de `heightPx`. */
  halfHeight(heightPx: number): number {
    return heightPx / 2 / (this.ppu * this.zoom);
  }
}
