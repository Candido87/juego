// Comprueba en la vista real (cargar vista3d.html?opt=0 y ejecutar este código) que la base de cada edificio colocado sobre
// terrenos de distintas alturas coincide con la superficie de su casilla. Devuelve un JSON con una fila por edificio.
//   CAP_URL="http://localhost:5199/vista3d.html?opt=0" CAP_OUT=x.png CAP_JS="$(cat tools/verificar-bases.js)" npx electron tools/captura.cjs
(async () => {
  const { game: g, view } = window.__v3;
  const w = g.world;
  const H = (x, y) => w.height[y * w.w + x];
  const kinds = ['belt', 'belt_fast', 'pipeline', 'storage', 'factory', 'farm', 'workshop', 'laboratory', 'house', 'pole', 'generator', 'solar', 'turbine', 'accumulator', 'feeder', 'elevator', 'turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost', 'wall_wood', 'wall_stone', 'wall_metal', 'wall_gate'];
  const ore = (k) => (k === 'drill' ? 1 : k === 'pump' ? 6 : 0);
  const placed = [];
  // Casillas libres agrupadas por altura (se reparten los tipos entre alturas distintas).
  const byH = {};
  for (let y = 2; y < w.h - 2; y++) for (let x = 2; x < w.w - 2; x++) {
    if (g.buildingAt(x, y) || w.ore[y * w.w + x] !== 0) continue;
    const h = H(x, y);
    (byH[h] = byH[h] || []).push([x, y]);
  }
  const heights = Object.keys(byH).map(Number).sort();
  let i = 0;
  for (const k of kinds) {
    g.unlockedBuildings.add(k);
    for (const h of heights) {
      const list = byH[h];
      for (let tries = 0; tries < 400 && list.length; tries++) {
        const [x, y] = list[(i * 37 + tries * 11) % list.length];
        if (g.buildingAt(x, y) || !g.canPlace(k, x, y).ok) continue;
        const b = g.place(k, x, y, 0);
        if (b) { g.completeBuilding(b); placed.push({ id: b.id, kind: k, x, y, h }); i++; }
        break;
      }
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
  const rows = [];
  const THREE_Box = view.scene.constructor && null;
  for (const p of placed) {
    const v = view.buildings.get(p.id);
    if (!v) continue;
    v.group.updateMatrixWorld(true);
    let min = Infinity;
    // En las torretas se mide sólo la base fija: la cabeza gira y se inclina al apuntar y su caja envolvente varía.
    (v.rig ? v.rig.base : v.group).traverse((o) => {
      if (!o.isMesh || o.userData.plinth) return;
      for (let q = o; q; q = q.parent) if (q.visible === false) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      min = Math.min(min, bb.min.y);
    });
    const expected = H(p.x, p.y) * 0.5 + 0.004;
    rows.push({ kind: p.kind, h: p.h, minY: +min.toFixed(3), expected: +expected.toFixed(3), delta: +(min - expected).toFixed(3) });
  }
  return JSON.stringify(rows);
})()
