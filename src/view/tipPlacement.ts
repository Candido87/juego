/**
 * Colocación de tooltips (pura, sin DOM): decide dónde poner el panel para que
 * 1) nunca se salga de la pantalla,
 * 2) no tape el elemento sobre el que está el ratón,
 * 3) se coloque fuera del panel del menú (encima, al lado o debajo según el caso), no sobre otros botones.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type TipMode = 'above' | 'side' | 'below';

const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;
export const intersects = (a: Rect, b: Rect) => a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * @param anchor elemento señalado
 * @param panel panel que lo contiene (el tooltip se coloca fuera de él)
 * @param size tamaño del tooltip
 */
export function placeTip(anchor: Rect, panel: Rect, size: { w: number; h: number }, view: { w: number; h: number }, mode: TipMode, gap = 8, margin = 8): { x: number; y: number } {
  const maxX = Math.max(margin, view.w - size.w - margin);
  const maxY = Math.max(margin, view.h - size.h - margin);
  let x: number;
  let y: number;
  if (mode === 'side') {
    // A la derecha del panel; si no cabe, a la izquierda.
    x = right(panel) + gap;
    if (x + size.w > view.w - margin) x = panel.x - gap - size.w;
    y = anchor.y + anchor.h / 2 - size.h / 2;
  } else {
    x = anchor.x + anchor.w / 2 - size.w / 2;
    const above = panel.y - gap - size.h;
    const below = bottom(panel) + gap;
    if (mode === 'above') y = above >= margin ? above : below;
    else y = below + size.h <= view.h - margin ? below : above;
  }
  x = clamp(x, margin, maxX);
  y = clamp(y, margin, maxY);
  // Último recurso: si aun así tapa el elemento señalado, se desplaza en vertical hasta liberarlo.
  const tip: Rect = { x, y, w: size.w, h: size.h };
  if (intersects(tip, anchor)) {
    const up = anchor.y - gap - size.h;
    const down = bottom(anchor) + gap;
    if (up >= margin) y = up;
    else if (down <= maxY) y = down;
    else {
      // Pantalla muy pequeña: a un lado del elemento.
      const rx = right(anchor) + gap;
      x = rx <= maxX ? rx : clamp(anchor.x - gap - size.w, margin, maxX);
    }
  }
  return { x, y };
}
