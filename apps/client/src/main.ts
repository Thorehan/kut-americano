import Phaser from 'phaser';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import { MenuScene } from './scenes/MenuScene';
import { TableScene } from './scenes/TableScene';
import { GAME_H, GAME_W, RENDER_SCALE } from './layout';

/** Yazı tipi yüklenmeden taş dokuları çizilmesin (sayılar yanlış fontla çıkmasın). */
async function loadFonts() {
  const wait = Promise.all(['700', '800', '900'].map((w) => document.fonts.load(`${w} 32px Nunito`)));
  await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]);
}

void loadFonts().then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: GAME_W * RENDER_SCALE,
    height: GAME_H * RENDER_SCALE,
    backgroundColor: '#071d15',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    input: { activePointers: 2 },
    scene: [MenuScene, TableScene],
  });
  // Geliştirme sırasında konsoldan erişim için (prod build'de yok).
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
});
