import Phaser from 'phaser';
import { GameScene } from './view/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1d2330',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true },
  scene: [GameScene],
});
