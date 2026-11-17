import Phaser from 'phaser';
import { CONTRACTS, GameMode } from '@kut/core';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { COLORS_UI, FONT, GAME_W } from '../layout';

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
    createTextures(this);
    this.add.image(0, 0, 'felt').setOrigin(0);

    // dekoratif taşlar
    const deco = ['tile-red-7', 'tile-yellow-7', 'tile-blue-7', 'tile-joker', 'tile-black-7'];
    deco.forEach((k, i) => {
      this.add
        .image(GAME_W / 2 - 160 + i * 80, 150, k)
        .setScale(0.62)
        .setAngle((i - 2) * 6);
    });

    this.add
      .text(GAME_W / 2, 255, 'KÜT', { fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: COLORS_UI.goldText })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000', 8, true, true);
    this.add
      .text(GAME_W / 2, 312, 'Amerikano Okey · Deneme Sürümü', { fontFamily: FONT, fontSize: '24px', color: COLORS_UI.cream })
      .setOrigin(0.5);

    const go = (mode: GameMode) => this.scene.start('table', { mode, ...urlOptions() } satisfies TableData);
    new Button(this, GAME_W / 2 - 170, 390, 300, 64, 'Tekli Oyun\n1 kişi + 3 bot', () => go('solo'), COLORS_UI.green, 20);
    new Button(this, GAME_W / 2 + 170, 390, 300, 64, "Takım Oyunu\n2'ye 2 (karşın ortağın)", () => go('team'), COLORS_UI.blue, 20);

    const lines = CONTRACTS.map((c, i) => `${i + 1}. ${c.name}`);
    const col1 = lines.slice(0, 6).join('\n');
    const col2 = lines.slice(6).join('\n');
    const style = { fontFamily: FONT, fontSize: '17px', color: COLORS_UI.cream, lineSpacing: 6 };
    this.add.text(GAME_W / 2, 455, '11 El · Her elin kuralı', { ...style, color: COLORS_UI.goldText, fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.add.text(GAME_W / 2 - 230, 488, col1, style);
    this.add.text(GAME_W / 2 + 40, 488, col2, style);
    this.add
      .text(
        GAME_W / 2,
        690,
        'Küt: aynı sayı farklı renk · Seri: aynı renk ardışık (başa sarma yok) · Okey: sahte okey simgeli taş',
        { fontFamily: FONT, fontSize: '15px', color: COLORS_UI.muted },
      )
      .setOrigin(0.5);
  }
}
