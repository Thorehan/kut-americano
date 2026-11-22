import Phaser from 'phaser';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import { PREVIEWS, PreviewSpec } from '../preview';
import { sfx } from '../sfx';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { panel, txt } from '../ui/text';
import type { TableData } from './MenuScene';

/** ?onizleme → bitiş türlerini ve çarpanları denemek için hazır eller. */
export class PreviewScene extends Phaser.Scene {
  constructor() {
    super('preview');
  }

  create() {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    createTextures(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());

    const cx = GAME_W / 2;
    txt(this, cx, 52, 'Bitiş Ekranları · Önizleme', 38, UI.goldHex, 900).setOrigin(0.5, 0);
    txt(this, cx, 104, 'Bir el seç · son hamleyi sen yap · kutlamayı ve el sonu puan ekranını gör', 17, UI.muted, 800).setOrigin(0.5, 0);

    const rows: [string, PreviewSpec[]][] = [
      ['Normal eller (1–10)', PREVIEWS.filter((p) => !p.ciftEli)],
      ['Çift Eli (11. el · tüm çarpanlar ×2)', PREVIEWS.filter((p) => p.ciftEli)],
    ];
    rows.forEach(([label, list], r) => {
      const y = 170 + r * 230;
      const g = this.add.graphics();
      panel(g, 90, y, GAME_W - 180, 200, 16, UI.panel, 0.9, r ? 0xc28cf0 : UI.stroke, 1);
      txt(this, 120, y + 18, label, 20, r ? '#e7cfff' : UI.cream, 900);
      list.forEach((p, i) => {
        const bx = cx + (i - 1) * 370;
        const by = y + 104;
        const color = p.mult >= 4 ? UI.amber : p.mult > 1 ? UI.blue : UI.slate;
        new Button(this, bx, by, 320, 66, `${p.title}  ×${p.mult}`, () => this.open(p), color, 20);
        txt(this, bx, by + 46, p.how, 14, UI.muted, 700).setOrigin(0.5, 0);
      });
    });

    new Button(this, cx, GAME_H - 56, 240, 54, 'Ana Menü', () => this.scene.start('menu'), UI.green, 20);
  }

  private open(p: PreviewSpec) {
    sfx.select();
    this.scene.start('table', { mode: 'solo', preview: p } satisfies TableData);
  }
}
