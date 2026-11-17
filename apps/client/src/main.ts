import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { TableScene } from './scenes/TableScene';
import { GAME_H, GAME_W } from './layout';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0d3b2a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  scene: [MenuScene, TableScene],
});

// Geliştirme sırasında konsoldan erişim için (prod build'de yok).
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
