/**
 * Página de desarrollo (Fase 0 de Sketch Town): dibuja piezas del pack reescaladas a la losa del juego (64×32)
 * para comprobar a ojo si encajan. No forma parte del juego.
 *
 * Medidas del pack (PNG 256×352): la cara superior es un rombo 2:1 de 232×116 px (centro en 128,187) y el bloque tiene
 * ≈103 px de grosor lateral. Escala = 64 / 232 = 0,276 → cara superior de 64×32 y grosor ≈ 28 px.
 */
import { HALF_H, HALF_W } from '../game/iso';
import { SKETCH_SCALE, SKETCH_TOP_CENTER } from './sketch';

const BASE = '/assets/sketch-town/Tiles/';
const EXP = '/assets/sketch-town-expansion/Tiles/';

interface Piece {
  name: string;
  rot?: 'N' | 'E' | 'S' | 'W';
  x: number;
  y: number;
  /** Alturas (niveles de 16 px) sobre el suelo. */
  z?: number;
  exp?: boolean;
}

const grass = (x: number, y: number, name = 'grass_center', rot: Piece['rot'] = 'N', z = 0): Piece => ({ name, rot, x, y, z });

/** Escena de prueba: 4 zonas (terreno con agua, rampas, muros y decoración). */
function scene(): Piece[] {
  const p: Piece[] = [];
  // A) Terreno 6×6: hierba, tierra y un lago con orilla.
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) {
      if (x >= 4 && y <= 1) p.push({ name: 'water_center', x, y });
      else if (x >= 4 || (y <= 1 && x === 3)) p.push({ name: 'grass_water', rot: 'S', x, y });
      else if (y >= 4 && x <= 1) p.push({ name: 'dirt_center', x, y });
      else p.push(grass(x, y));
    }
  // B) Rampas: las cuatro orientaciones sobre un escalón.
  (['N', 'E', 'S', 'W'] as const).forEach((r, i) => p.push({ name: 'grass_slope', rot: r, x: 8 + i, y: 0 }));
  (['N', 'E', 'S', 'W'] as const).forEach((r, i) => p.push({ name: 'grass_slopeConvex', rot: r, x: 8 + i, y: 1 }));
  (['N', 'E', 'S', 'W'] as const).forEach((r, i) => p.push({ name: 'grass_slopeConcave', rot: r, x: 8 + i, y: 2 }));
  // C) Murallas y torres.
  (['N', 'E', 'S', 'W'] as const).forEach((r, i) => p.push({ name: 'castle_wall', rot: r, x: 8 + i, y: 4 }));
  (['N', 'E', 'S', 'W'] as const).forEach((r, i) => p.push({ name: 'castle_corner', rot: r, x: 8 + i, y: 5 }));
  p.push({ name: 'castle_bend', rot: 'N', x: 8, y: 6 }, { name: 'castle_center', rot: 'N', x: 9, y: 6 }, { name: 'castle_end', rot: 'N', x: 10, y: 6, exp: true });
  p.push({ name: 'castle_tower', rot: 'N', x: 11, y: 6 }, { name: 'castle_gate', rot: 'N', x: 12, y: 6 });
  // D) Decoración y casa.
  const deco: Piece[] = [
    { name: 'tree_single', x: 0, y: 8 },
    { name: 'tree_multiple', x: 1, y: 8 },
    { name: 'tree_pine', x: 2, y: 8, exp: true },
    { name: 'tree_pineLarge', x: 3, y: 8, exp: true },
    { name: 'rocks_grass', x: 4, y: 8 },
    { name: 'rocks_dirt', x: 5, y: 8 },
    { name: 'well', x: 6, y: 8, exp: true },
    { name: 'fence_wood', x: 7, y: 8, exp: true },
    { name: 'furrow_cropWheat', x: 8, y: 8, exp: true },
    { name: 'cliff', x: 9, y: 8, exp: true },
    { name: 'cliff_corner', x: 10, y: 8, exp: true },
  ];
  for (const d of deco) {
    p.push(grass(d.x, d.y));
    p.push({ ...d, rot: 'N', z: 0 });
  }
  p.push(grass(12, 8), { name: 'building_center', x: 12, y: 8 }, { name: 'roof_gableBrown', x: 12, y: 8, z: 1.35 });
  return p;
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function load(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

async function draw() {
  const zoom = Number((document.getElementById('zoom') as HTMLInputElement).value);
  const cv = document.getElementById('c') as HTMLCanvasElement;
  const q = new URLSearchParams(location.search);
  const W = Number(q.get('w') ?? 1096);
  const H = Number(q.get('h') ?? 520);
  cv.width = W * zoom;
  cv.height = H * zoom;
  cv.style.width = `${W * zoom}px`;
  cv.style.height = `${H * zoom}px`;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(zoom, zoom);
  const origin = { x: Number(q.get('ox') ?? 360), y: Number(q.get('oy') ?? 60) };
  const pieces = scene().sort((a, b) => a.x + a.y - (b.x + b.y) || (a.z ?? 0) - (b.z ?? 0));
  const s = SKETCH_SCALE;
  for (const pc of pieces) {
    const img = await load(`${pc.exp ? EXP : BASE}${pc.name}_${pc.rot ?? 'N'}.png`);
    if (!img) {
      // Pieza que no está en el pack base: se prueba en la expansión.
      const alt = await load(`${EXP}${pc.name}_${pc.rot ?? 'N'}.png`);
      if (!alt) continue;
      drawPiece(ctx, alt, pc, origin, s);
      continue;
    }
    drawPiece(ctx, img, pc, origin, s);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawPiece(ctx: CanvasRenderingContext2D, img: HTMLImageElement, pc: Piece, o: { x: number; y: number }, s: number) {
  // Centro de la cara superior de la casilla en pantalla.
  const cx = o.x + (pc.x - pc.y) * HALF_W;
  const cy = o.y + (pc.x + pc.y) * HALF_H + HALF_H - (pc.z ?? 0) * 16;
  ctx.drawImage(img, cx - SKETCH_TOP_CENTER.x * s, cy - SKETCH_TOP_CENTER.y * s, img.width * s, img.height * s);
}

document.getElementById('zoom')!.addEventListener('input', () => void draw());
void draw();
