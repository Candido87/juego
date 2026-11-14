/**
 * Comprobación de solapes entre paneles (para pegar en la consola del navegador o ejecutar con javascript_tool).
 * Devuelve los pares de paneles visibles que se solapan y los que se salen de la ventana.
 * Se excluyen las capas a propósito superpuestas (ayuda, tooltip, mensaje, fin de partida, árbol).
 */
(() => {
  const SKIP = new Set(['tip', 'msg', 'over', 'tech', 'help']);
  const panels = [...document.querySelectorAll('.panel')]
    .filter((el) => !SKIP.has(el.id))
    .map((el) => ({ id: el.id || el.className, r: el.getBoundingClientRect(), shown: getComputedStyle(el).display !== 'none' }))
    .filter((p) => p.shown && p.r.width > 0 && p.r.height > 0);
  const overlaps = [];
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i].r;
      const b = panels[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1) overlaps.push(`${panels[i].id} × ${panels[j].id} (${Math.round(w)}×${Math.round(h)} px)`);
    }
  }
  const outside = panels
    .filter((p) => p.r.left < -1 || p.r.top < -1 || p.r.right > innerWidth + 1 || p.r.bottom > innerHeight + 1)
    .map((p) => `${p.id} sale de la ventana`);
  return { window: `${innerWidth}x${innerHeight}`, paneles: panels.map((p) => p.id), overlaps, outside };
})();
