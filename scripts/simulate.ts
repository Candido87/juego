/**
 * Simula una partida completa sin gráficos con el bot.
 * Uso: npm run sim -- [semilla] [minutos]
 */
import { entries } from '../src/game/bag';
import { botTick } from '../src/game/bot';
import { Game } from '../src/game/game';

const seed = Number(process.argv[2] ?? 7);
const minutes = Number(process.argv[3] ?? 10);
const game = new Game({ seed });
let lastWave = 0;

for (let t = 0; t < minutes * 60 && !game.gameOver; t += 0.5) {
  game.update(0.5);
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
    console.log(`   almacén: ${entries(game.storage).map(([i, n]) => `${i}=${n}`).join(' ')}`);
  }
}
console.log(game.gameOver ? `Derrota en la oleada ${game.wave}` : `Sobrevive ${minutes} min (oleada ${game.wave})`);
