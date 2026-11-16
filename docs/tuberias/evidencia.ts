import { Game } from '../../src/game/game';
import { pipeNetworks } from '../../src/game/tuberias';
import { createFlatWorld } from '../../src/game/world';
const mk = () => {
  const g = new Game({ world: createFlatWorld(20, 20), noWaves: true });
  g.unlockedBuildings.add('pipeline');
  const put = (x: number, y: number, d: 0 | 1 | 2 | 3) => { const b = g.place('pipeline', x, y, d)!; g.completeBuilding(b); };
  return { g, put };
};
// 1) Dos tuberías contiguas en paralelo (las dos hacia +x): la vista las dibuja unidas (vecinas), la lógica NO las une.
let { g, put } = mk(); put(3, 3, 0); put(3, 4, 0);
console.log('paralelas:', 'redes lógicas =', pipeNetworks(g).length, '(la vista dibuja un codo/T entre ellas)');
// 2) Espalda con espalda (A hacia -x y la vecina B hacia +x, se alejan): la vista las une, la lógica no (ninguna vierte en la otra).
({ g, put } = mk()); put(3, 3, 2); put(4, 3, 0);
console.log('espalda con espalda (se alejan):', 'redes lógicas =', pipeNetworks(g).length);
// 3) Cadena normal (las dos hacia +x, una tras otra): se unen.
({ g, put } = mk()); put(3, 3, 0); put(4, 3, 0);
console.log('en fila:', 'redes lógicas =', pipeNetworks(g).length);
// 4) Un lado: la tubería B está a un lado de A y apunta a A (entra por el costado): se unen (esto la vista sí lo dibuja).
({ g, put } = mk()); put(3, 3, 0); put(3, 4, 3);
console.log('entra de lado:', 'redes lógicas =', pipeNetworks(g).length);
