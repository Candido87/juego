import { describe, expect, it } from 'vitest';
import { CONFIG } from '../game/config';
import { BUILD_KINDS, NPC_ROLES } from '../game/types';
import { BILLBOARDS, JOB_ICONS, ROLE_ICONS, TILE_COUNT, TOOL_ICONS, TOP_TEXTURES, frameRect, rotationFor } from './sprites';

describe('mapa de sprites (Kenney Tiny Factory)', () => {
  const frames = [
    ...Object.values(TOP_TEXTURES).map((t) => t!.frame),
    ...Object.values(BILLBOARDS),
    ...Object.values(TOOL_ICONS),
    ...Object.values(ROLE_ICONS),
    ...Object.values(JOB_ICONS),
  ];

  it('todas las casillas existen en la hoja', () => {
    for (const f of frames) {
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(TILE_COUNT);
    }
  });

  it('cada rol de NPC tiene sprite de pie e icono', () => {
    for (const r of NPC_ROLES) {
      expect(BILLBOARDS[`npc_${r}`]).toBeDefined();
      expect(ROLE_ICONS[r]).toBeDefined();
    }
  });

  it('las texturas de cara superior son de edificios que existen', () => {
    for (const k of Object.keys(TOP_TEXTURES)) expect(k === 'core' || (BUILD_KINDS as readonly string[]).includes(k)).toBe(true);
    for (const k of Object.keys(TOOL_ICONS)) expect(CONFIG.buildings[k as keyof typeof CONFIG.buildings]).toBeDefined();
  });

  it('las cintas giran para apuntar a cada dirección', () => {
    expect([0, 1, 2, 3].map(rotationFor)).toEqual([1, 2, 3, 0]);
  });

  it('el índice de casilla se convierte a su rectángulo', () => {
    expect(frameRect(0)).toEqual({ x: 0, y: 0, w: 16, h: 16 });
    expect(frameRect(13)).toEqual({ x: 16, y: 16, w: 16, h: 16 });
  });
});
