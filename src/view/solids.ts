/**
 * Mini-renderizador de sólidos (sin Phaser): extruye polígonos convexos, los gira alrededor de un eje vertical
 * y los pinta en isométrico con sombreado por cara, contorno oscuro y orden de dibujado por profundidad.
 * Lo usan las torretas (base fija + cabeza que gira a N rumbos) y la galería de desarrollo.
 *
 * Coordenadas del modelo: x,y en casillas (la huella ocupa 0..1), z en píxeles. Adelante = +x local.
 */
import { HALF_H, HALF_W } from '../game/iso';

export interface V2 {
  x: number;
  y: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Sólido: polígono convexo `foot` extruido de z0 a z1; la tapa puede ser más pequeña (`taper`) para biselar. */
export interface Solid {
  foot: V2[];
  z0: number;
  z1: number;
  color: number;
  /** Escala de la tapa respecto al centro de la huella (1 = prisma recto). */
  taper?: number;
  /** Brillo propio: 0 = normal; >0 aclara (luces, cristales). */
  glow?: number;
  /** Sin contorno (detalles diminutos). */
  noEdge?: boolean;
  /** Fuerza el orden de dibujado (mayor = más tarde). */
  order?: number;
}

export interface Face {
  pts: V3[];
  color: number;
  normal: V3;
  depth: number;
}

// ------------------------------------------------------------------ formas

/** Rectángulo centrado en (cx,cy) de w (eje x) por d (eje y). */
export function rect(cx: number, cy: number, w: number, d: number): V2[] {
  return [
    { x: cx - w / 2, y: cy - d / 2 },
    { x: cx + w / 2, y: cy - d / 2 },
    { x: cx + w / 2, y: cy + d / 2 },
    { x: cx - w / 2, y: cy + d / 2 },
  ];
}

/** Rectángulo con las esquinas cortadas (chaflán `c`, en casillas). */
export function chamfer(cx: number, cy: number, w: number, d: number, c: number): V2[] {
  const hx = w / 2;
  const hy = d / 2;
  return [
    { x: cx - hx + c, y: cy - hy },
    { x: cx + hx - c, y: cy - hy },
    { x: cx + hx, y: cy - hy + c },
    { x: cx + hx, y: cy + hy - c },
    { x: cx + hx - c, y: cy + hy },
    { x: cx - hx + c, y: cy + hy },
    { x: cx - hx, y: cy + hy - c },
    { x: cx - hx, y: cy - hy + c },
  ];
}

/** Polígono regular de `n` lados (cilindro) de radio r. */
export function cyl(cx: number, cy: number, r: number, n = 10): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

// ------------------------------------------------------------------ geometría

const LIGHT = norm({ x: 0.25, y: 0.55, z: 0.8 });

function norm(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function shadeColor(c: number, f: number): number {
  const r = Math.max(0, Math.min(255, (((c >> 16) & 255) * f) | 0));
  const g = Math.max(0, Math.min(255, (((c >> 8) & 255) * f) | 0));
  const b = Math.max(0, Math.min(255, ((c & 255) * f) | 0));
  return (r << 16) | (g << 8) | b;
}

/** Gira un punto de la huella `yaw` radianes alrededor del centro (0.5, 0.5). */
export function rotate(p: V2, yaw: number): V2 {
  const dx = p.x - 0.5;
  const dy = p.y - 0.5;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: 0.5 + dx * c - dy * s, y: 0.5 + dx * s + dy * c };
}

/** Luminosidad de una cara según su normal (0.45 a 1.25): arriba claro, izquierda media, derecha oscura. */
export function lightFactor(n: V3): number {
  const d = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
  return 0.45 + 0.8 * d;
}

/** Caras visibles (cara oculta descartada) de un sólido ya girado `yaw`. */
export function solidFaces(s: Solid, yaw: number): Face[] {
  const foot = s.foot.map((p) => rotate(p, yaw));
  const n = foot.length;
  let cx = 0;
  let cy = 0;
  for (const p of foot) {
    cx += p.x / n;
    cy += p.y / n;
  }
  const k = s.taper ?? 1;
  const top = foot.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  const faces: Face[] = [];
  const glow = s.glow ?? 0;
  const base = (f: number) => shadeColor(s.color, Math.min(1.6, f + glow));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pts: V3[] = [
      { ...foot[i], z: s.z0 },
      { ...foot[j], z: s.z0 },
      { ...top[j], z: s.z1 },
      { ...top[i], z: s.z1 },
    ];
    const a = pts[0];
    const b = pts[1];
    const d = pts[3];
    const u = { x: b.x - a.x, y: b.y - a.y, z: 0 };
    const w = { x: d.x - a.x, y: d.y - a.y, z: (d.z - a.z) / HALF_W / 2 };
    // Normal hacia fuera (la huella se recorre en sentido antihorario en x→y).
    const nn = norm({ x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x });
    const out = nn;
    // Visible si mira hacia la cámara (que está hacia +x +y y arriba).
    if (out.x + out.y + out.z * 1.1 <= 0.001) continue;
    faces.push({ pts, color: base(lightFactor(out)), normal: out, depth: (a.x + b.x) / 2 + (a.y + b.y) / 2 });
  }
  const tp: V3[] = top.map((p) => ({ ...p, z: s.z1 }));
  faces.push({ pts: tp, color: base(lightFactor({ x: 0, y: 0, z: 1 })), normal: { x: 0, y: 0, z: 1 }, depth: cx + cy + 10 });
  return faces;
}

/** Orden de dibujado de los sólidos: más lejos de la cámara primero. */
export function sortSolids(solids: Solid[], yaw: number): Solid[] {
  const key = (s: Solid) => {
    let cx = 0;
    let cy = 0;
    for (const p of s.foot) {
      const r = rotate(p, yaw);
      cx += r.x / s.foot.length;
      cy += r.y / s.foot.length;
    }
    return (s.order ?? 0) * 1000 + (cx + cy) * 100 + (s.z0 + s.z1) / 2;
  };
  return [...solids].sort((a, b) => key(a) - key(b));
}

export interface Projector {
  /** Posición en el lienzo de la esquina (0,0,0) de la casilla. */
  ox: number;
  oy: number;
}

export function project(pr: Projector, p: V3): V2 {
  return { x: pr.ox + (p.x - p.y) * HALF_W, y: pr.oy + (p.x + p.y) * HALF_H - p.z };
}

/** Dibuja los sólidos en un contexto 2D. */
export function drawSolids(ctx: CanvasRenderingContext2D, pr: Projector, solids: Solid[], yaw: number, edge = 0x10141a): void {
  ctx.lineJoin = 'round';
  for (const s of sortSolids(solids, yaw)) {
    const faces = solidFaces(s, yaw).sort((a, b) => a.depth - b.depth);
    // Tapa siempre al final (la última cara añadida tiene normal z); las laterales por profundidad.
    faces.sort((a, b) => (a.normal.z === 1 ? 1 : 0) - (b.normal.z === 1 ? 1 : 0));
    for (const f of faces) {
      ctx.beginPath();
      f.pts.forEach((p, i) => {
        const q = project(pr, p);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = hex(f.color);
      ctx.fill();
      if (!s.noEdge) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = hex(edge, 0.55);
        ctx.stroke();
      }
    }
  }
}

export function hex(c: number, a = 1): string {
  return a === 1 ? `#${c.toString(16).padStart(6, '0')}` : `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}
