import Phaser from 'phaser';
import { FONT, TEXT_RES, UI } from '../layout';

export type Weight = 600 | 700 | 800 | 900;

/** Keskin (yüksek çözünürlüklü) yazı. */
export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  color: string = UI.cream,
  weight: Weight = 700,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    fontStyle: String(weight),
    resolution: TEXT_RES,
    ...extra,
  });
}

export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 14, fill = UI.panel, alpha = 0.92, stroke = UI.stroke, strokeAlpha = 0.9) {
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(x, y + 3, w, h, r);
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(2, stroke, strokeAlpha);
  g.strokeRoundedRect(x, y, w, h, r);
}
