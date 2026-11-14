import Phaser from 'phaser';
import { GameScene } from './view/GameScene';

/** WebGL falla si el lienzo se crea con tamaño 0 (pestaña oculta): esperar a tener tamaño. */
function start() {
  if (window.innerWidth === 0 || window.innerHeight === 0) {
    requestAnimationFrame(start);
    return;
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#1d2330',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true },
    scene: [GameScene],
  });
  if (import.meta.env.DEV) (window as unknown as { __phaser: Phaser.Game }).__phaser = game;
}
start();
