import Phaser from 'phaser';
import { CONTRACTS, GameMode } from '@kut/core';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { panel, txt } from '../ui/text';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import { sfx } from '../sfx';

export interface TableData {
  mode: GameMode;
  seed?: number;
  startRound?: number;
}

/** URL parametreleri (deneme için): ?el=10 → 10. elden başla, ?seed=42 → sabit dağıtım */
function urlOptions(): Partial<TableData> {
  const q = new URLSearchParams(location.search);
  const el = Number(q.get('el'));
  const seed = Number(q.get('seed'));
  return {
    startRound: el >= 1 && el <= CONTRACTS.length ? el - 1 : undefined,
    seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
  };
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    createTextures(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());

    // dekoratif taşlar: küt dizilimi + okey
    const deco = ['tile-red-7', 'tile-yellow-7', 'tile-blue-7', 'tile-joker', 'tile-black-7'];
    deco.forEach((k, i) => {
      const img = this.add
        .image(GAME_W / 2 - 152 + i * 76, -80, k)
        .setScale(0.62)
        .setAngle((i - 2) * 5);
      this.tweens.add({ targets: img, y: 150 + Math.abs(i - 2) * 6, duration: 620, delay: 120 + i * 90, ease: 'Back.easeOut' });
    });

    const title = txt(this, GAME_W / 2, 250, 'KÜT', 76, UI.goldHex, 900).setOrigin(0.5).setShadow(0, 5, 'rgba(0,0,0,0.5)', 10);
    title.setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 500, delay: 500 });
    txt(this, GAME_W / 2, 302, 'AMERİKANO OKEY', 18, UI.cream, 900, { letterSpacing: 6 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5);

    const go = (mode: GameMode) => this.scene.start('table', { mode, ...urlOptions() } satisfies TableData);
    new Button(this, GAME_W / 2 - 165, 372, 300, 70, 'Tekli Oyun\n1 kişi + 3 bot', () => go('solo'), UI.green, 20);
    new Button(this, GAME_W / 2 + 165, 372, 300, 70, "Takım Oyunu\n2'ye 2 · karşın ortağın", () => go('team'), UI.blue, 20);

    // kurallar kartı
    const g = this.add.graphics();
    panel(g, GAME_W / 2 - 330, 432, 660, 232, 18, UI.panel, 0.9, UI.gold, 0.5);
    txt(this, GAME_W / 2, 446, '11 EL · HER ELİN KURALI', 14, UI.goldHex, 900).setOrigin(0.5, 0);
    const lines = CONTRACTS.map((c, i) => `${i + 1}.  ${c.name}`);
    const style = { lineSpacing: 7 };
    txt(this, GAME_W / 2 - 300, 476, lines.slice(0, 6).join('\n'), 16, UI.cream, 800, style);
    txt(this, GAME_W / 2 + 20, 476, lines.slice(6).join('\n'), 16, UI.cream, 800, style);
    txt(
      this,
      GAME_W / 2,
      690,
      'Küt: aynı sayı, farklı renk  ·  Seri: aynı renk, ardışık (başa sarma yok)  ·  Okey: sahte okey simgeli taş',
      13,
      UI.muted,
      700,
    ).setOrigin(0.5);
  }
}
