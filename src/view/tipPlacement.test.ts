import { describe, expect, it } from 'vitest';
import { Rect, intersects, placeTip } from './tipPlacement';

const inside = (r: { x: number; y: number }, s: { w: number; h: number }, v: { w: number; h: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + s.w <= v.w && r.y + s.h <= v.h;

describe('colocación de tooltips', () => {
  const size = { w: 260, h: 180 };

  it('encima del menú: no tapa el botón ni el resto del panel', () => {
    const view = { w: 1280, h: 800 };
    const panel: Rect = { x: 300, y: 740, w: 680, h: 50 };
    const anchor: Rect = { x: 500, y: 746, w: 90, h: 28 };
    const p = placeTip(anchor, panel, size, view, 'above');
    expect(p.y + size.h).toBeLessThanOrEqual(panel.y);
    expect(intersects({ ...p, ...size }, anchor)).toBe(false);
    expect(intersects({ ...p, ...size }, panel)).toBe(false);
    expect(inside(p, size, view)).toBe(true);
  });

  it('nunca se sale de la pantalla, ni en los bordes ni en ventanas pequeñas', () => {
    for (const view of [{ w: 1280, h: 800 }, { w: 800, h: 600 }, { w: 480, h: 320 }]) {
      for (const ax of [0, 40, view.w / 2, view.w - 100]) {
        for (const mode of ['above', 'side', 'below'] as const) {
          const anchor: Rect = { x: ax, y: view.h - 40, w: 90, h: 28 };
          const panel: Rect = { x: Math.max(0, ax - 20), y: view.h - 50, w: 200, h: 50 };
          const p = placeTip(anchor, panel, size, view, mode);
          expect(inside(p, size, view), `${view.w}x${view.h} ${mode} x=${ax}`).toBe(true);
        }
      }
    }
  });

  it('no tapa el elemento señalado en ninguna combinación', () => {
    const view = { w: 1024, h: 700 };
    for (const mode of ['above', 'side', 'below'] as const) {
      for (const ay of [10, 200, 350, 650]) {
        for (const ax of [5, 300, 900]) {
          const anchor: Rect = { x: ax, y: ay, w: 150, h: 24 };
          const panel: Rect = { x: ax - 4, y: ay - 30, w: 170, h: 300 };
          const p = placeTip(anchor, panel, size, view, mode);
          expect(intersects({ ...p, ...size }, anchor), `${mode} ${ax},${ay}`).toBe(false);
        }
      }
    }
  });

  it('almacén (lateral): a la derecha del panel, y a la izquierda si no cabe', () => {
    const view = { w: 1000, h: 700 };
    const panel: Rect = { x: 8, y: 90, w: 170, h: 400 };
    const anchor: Rect = { x: 14, y: 200, w: 158, h: 20 };
    const p = placeTip(anchor, panel, size, view, 'side');
    expect(p.x).toBeGreaterThanOrEqual(panel.x + panel.w);
    const panelR: Rect = { x: 900, y: 90, w: 90, h: 400 };
    const q = placeTip({ x: 905, y: 200, w: 80, h: 20 }, panelR, size, view, 'side');
    expect(q.x + size.w).toBeLessThanOrEqual(panelR.x);
  });

  it('HUD (debajo del panel): si no cabe debajo, va encima', () => {
    const view = { w: 1000, h: 300 };
    const panel: Rect = { x: 8, y: 150, w: 600, h: 120 };
    const anchor: Rect = { x: 20, y: 160, w: 80, h: 18 };
    const p = placeTip(anchor, panel, size, view, 'below');
    expect(intersects({ ...p, ...size }, anchor)).toBe(false);
    expect(inside(p, size, view)).toBe(true);
  });
});
