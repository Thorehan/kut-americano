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

/**
 * "Kahvehane premium" panel: koyu ceviz zemin, koyu dış hat + pirinç çerçeve + ince iç çizgi,
 * büyük panellerde köşelerde pirinç perçin. Vurgu rengi (stroke) çerçeveye yansır.
 */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 14, fill = UI.panel, alpha = 0.92, stroke = UI.stroke, strokeAlpha = 0.9) {
  const rr = Math.min(r, 12, h / 2);
  // gölge
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 1, y + 4, w, h, rr);
  // zemin
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, rr);
  // üst yarıda hafif ışık (deri/ahşap parlaması)
  g.fillStyle(0xffffff, 0.04);
  g.fillRoundedRect(x + 3, y + 3, w - 6, Math.max(4, h * 0.42), { tl: Math.max(1, rr - 3), tr: Math.max(1, rr - 3), bl: 2, br: 2 });
  // koyu dış hat + çerçeve + iç ince pirinç çizgi
  g.lineStyle(4, 0x1a0e04, 0.9);
  g.strokeRoundedRect(x, y, w, h, rr);
  g.lineStyle(2, stroke, strokeAlpha);
  g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, rr);
  if (w > 120 && h > 70) {
    g.lineStyle(1, 0xf6dc8f, 0.22 * strokeAlpha);
    g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, Math.max(1, rr - 4));
    // köşe perçinleri
    for (const [cx, cy] of [
      [x + 9, y + 9],
      [x + w - 9, y + 9],
      [x + 9, y + h - 9],
      [x + w - 9, y + h - 9],
    ]) {
      g.fillStyle(0x5c4210, 1);
      g.fillCircle(cx, cy + 0.6, 3.2);
      g.fillStyle(0xd9b45e, 1);
      g.fillCircle(cx, cy, 2.6);
      g.fillStyle(0xfff0c0, 0.8);
      g.fillCircle(cx - 0.8, cy - 0.8, 0.9);
    }
  }
}
