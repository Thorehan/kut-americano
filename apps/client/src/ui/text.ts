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

/** Panelin üst kenarına oturan safran başlık şeridi (kenarları çini yıldızlı). */
export function header(scene: Phaser.Scene, cx: number, top: number, title: string, color = UI.gold): Phaser.GameObjects.Container {
  const c = scene.add.container(cx, top);
  const label = txt(scene, 0, 0, title, 22, '#ffffff', 900).setOrigin(0.5).setStroke('#7a4a00', 6);
  const w = Math.max(200, label.width + 80);
  const g = scene.add.graphics();
  g.fillStyle(0x06191b, 1);
  g.fillRoundedRect(-w / 2 - 2, -24, w + 4, 48, 22);
  g.fillStyle(0xbd6d06, 1);
  g.fillRoundedRect(-w / 2, -22, w, 44, 20);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -22, w, 38, 20);
  g.fillStyle(0xffffff, 0.35);
  g.fillRoundedRect(-w / 2 + 10, -18, w - 20, 12, 6);
  g.fillStyle(0xffffff, 0.8);
  star8(g, -w / 2 + 22, -3, 7);
  star8(g, w / 2 - 22, -3, 7);
  label.setY(-3);
  c.add([g, label]);
  return c;
}

/** Pencereyi ortadan hafif büyüyerek açar (container 0,0'da, tam ekran). */
export function popIn(scene: Phaser.Scene, c: Phaser.GameObjects.Container, w = 1280, h = 720) {
  c.setAlpha(0).setScale(0.92).setPosition((w / 2) * 0.08, (h / 2) * 0.08);
  scene.tweens.add({ targets: c, alpha: 1, scale: 1, x: 0, y: 0, duration: 220, ease: 'Back.easeOut' });
}

/** 8 köşeli çini yıldızı (Graphics). */
export function star8(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, inner = 0.62) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  g.fillPoints(pts, true);
}

/** Eski koyu dolgu renklerini temanın panel tonuna çeker (çağıran kodlar değişmeden). */
const FILL_MAP: Record<number, number> = {
  0x24170c: UI.panel,
  0x3a2414: UI.panelHi,
  0x0c2c21: 0x0f3337,
  0x10372a: 0x123c41,
};

/**
 * "Çini" panel: gece turkuazı zemin, yumuşak köşe, kalın koyu dış hat + renkli kenar,
 * üstte ışık bandı. Büyük panellerin üst köşelerinde küçük çini yıldızları.
 */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 14, fill = UI.panel, alpha = 0.92, stroke = UI.stroke, strokeAlpha = 0.9) {
  const rr = Math.min(Math.max(r, 12), 20, h / 2);
  const f = FILL_MAP[fill] ?? fill;
  // gölge
  g.fillStyle(0x000000, 0.32);
  g.fillRoundedRect(x, y + 5, w, h, rr);
  // zemin
  g.fillStyle(f, alpha);
  g.fillRoundedRect(x, y, w, h, rr);
  // koyu dış hat + renkli kenar (çizgi: saydam zeminde alttan renk sızmasın)
  g.lineStyle(4, 0x06191b, Math.min(1, alpha + 0.1));
  g.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, rr + 1);
  g.lineStyle(2.5, stroke, strokeAlpha);
  g.strokeRoundedRect(x + 1.25, y + 1.25, w - 2.5, h - 2.5, Math.max(2, rr - 1.25));
  // üstte ışık bandı
  g.fillStyle(0xffffff, 0.06);
  g.fillRoundedRect(x + 5, y + 5, w - 10, Math.max(4, Math.min(h * 0.38, 60)), { tl: Math.max(1, rr - 5), tr: Math.max(1, rr - 5), bl: 4, br: 4 });
  if (w > 160 && h > 110) {
    g.fillStyle(stroke, 0.55 * strokeAlpha);
    star8(g, x + 16, y + 16, 5.5);
    star8(g, x + w - 16, y + 16, 5.5);
  }
}
