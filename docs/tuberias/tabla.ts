import { armsFor, dirsOf } from '../../src/view3d/pieces';
const N = ['E(+x)', 'S(+y)', 'O(-x)', 'N(-y)'];
const rows: string[] = ['| máscara | vecinos conectados | pieza esperada | lo que se dibuja hoy | ¿coincide? |', '|---|---|---|---|---|'];
for (let m = 0; m < 16; m++) {
  const d = dirsOf(m);
  const n = d.length;
  const opp = n === 2 && (d[0] + 2) % 4 === d[1];
  const exp = n === 0 ? 'tramo aislado: tubo corto con tapa' : n === 1 ? 'extremo: medio tubo hacia el vecino + tapa' : opp ? 'recta' : n === 2 ? 'curva (codo)' : n === 3 ? 'T' : 'cruce';
  const a = armsFor(m, 0);
  const got = a.straightAxis !== null ? `tubo ENTERO eje ${a.straightAxis === 0 ? 'x' : 'z'} (brida abierta en las dos puntas)` : `${a.arms.length} medios tubos + esfera central`;
  const ok = n === 0 || n === 1 ? 'NO (punta abierta sin tapa)' : opp ? 'sí' : 'sí en conexiones; el codo es una esfera, no la pieza bend';
  rows.push(`| ${m.toString(2).padStart(4, '0')} | ${d.map((x) => N[x]).join(' ') || '—'} | ${exp} | ${got} | ${ok} |`);
}
console.log(rows.join('\n'));
