/**
 * Simula una partida completa sin gráficos con el bot.
 * El bot sigue la guía de inicio (cintas, energía con postes, bomba y tuberías, cadenas de producción) y, a la vez,
 * amplía defensa e industria con el bot sencillo.
 * Uso: npm run sim -- [semilla] [minutos]
 */
import { entries } from '../src/game/bag';
import { botTick } from '../src/game/bot';
import { Game } from '../src/game/game';
import { guiaBotTick } from '../src/game/guia-bot';
import { currentStep, newGuiaState, stepGuia } from '../src/game/guia-inicio';

const seed = Number(process.argv[2] ?? 7);
const minutes = Number(process.argv[3] ?? 10);
const game = new Game({ seed });
const guia = newGuiaState();
let lastWave = 0;

for (let t = 0; t < minutes * 60 && !game.gameOver; t += 0.5) {
  game.update(0.5);
  // La guía y el bot sencillo juegan a la vez: el primero abre cintas, energía y tuberías; el segundo amplía industria y defensa.
  guiaBotTick(game, guia);
  stepGuia(game, guia);
  botTick(game);
  if (game.wave !== lastWave) {
    lastWave = game.wave;
    const counts: Record<string, number> = {};
    for (const b of game.buildings.values()) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
    const npcs: Record<string, number> = Object.create(null);
    for (const n of game.npcs) npcs[n.role] = (npcs[n.role] ?? 0) + 1;
    console.log(
      `t=${game.time.toFixed(0)}s oleada ${game.wave} | núcleo ${game.coreHp} | bajas ${game.stats.kills} | ` +
        `NPCs ${JSON.stringify(npcs)} | edificios ${JSON.stringify(counts)}`,
    );
    const net = game.grid.nets[0];
    console.log(`   energía ${net ? `${net.production}/${net.demand}` : '0/0'} | cinta→${JSON.stringify(game.stats.beltTo)} | tubería→${JSON.stringify(game.stats.pipeTo)} | gasolina refinada ${game.stats.refined} | guía ${guia.completed.length} pasos (${currentStep(game, guia)?.id ?? 'completa'})`);
    console.log(`   almacén: ${entries(game.storage).map(([i, n]) => `${i}=${n}`).join(' ')}`);
  }
}
console.log(game.gameOver ? `Derrota en la oleada ${game.wave}` : `Sobrevive ${minutes} min (oleada ${game.wave})`);
