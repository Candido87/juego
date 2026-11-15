import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../public/assets/ui-pack');

describe('UI Pack', () => {
  it('todos los archivos que usa la hoja de estilos existen', () => {
    const css = readFileSync(resolve(dir, 'ui-pack.css'), 'utf8');
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(8);
    for (const u of urls) expect(existsSync(resolve(dir, u)), u).toBe(true);
  });
  it('la página del juego enlaza la hoja de estilos', () => {
    const html = readFileSync(resolve(__dirname, '../../vista3d.html'), 'utf8');
    for (const f of ['ui-pack.css', 'ds/ds.css', 'ds/game.css']) expect(html).toContain(`assets/ui-pack/${f}`);
  });
  it('el sistema de diseño (ds.css y game.css) sólo usa archivos que existen', () => {
    for (const f of ['ds/ds.css', 'ds/game.css']) {
      const css = readFileSync(resolve(dir, f), 'utf8');
      const urls = [...css.matchAll(/url\('([^'#]+\.(?:png|ttf))'\)/g)].map((m) => m[1]);
      expect(urls.length).toBeGreaterThan(5);
      for (const u of urls) expect(existsSync(resolve(dir, 'ds', u)), `${f}: ${u}`).toBe(true);
    }
  });
});
