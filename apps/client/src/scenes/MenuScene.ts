import Phaser from 'phaser';
import { CONTRACTS, GameMode, RANDOM_MAX_REPEAT, RANDOM_WEIGHTS, RuleOrder } from '@kut/core';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { panel, txt } from '../ui/text';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import { sfx } from '../sfx';

export interface TableData {
  mode: GameMode;
  ruleOrder?: RuleOrder;
  seed?: number;
  startRound?: number;
}

/** URL parametreleri (deneme için): ?el=10 → 10. elden başla, ?seed=42 → sabit dağıtım, ?mod=rastgele */
function urlOptions(): Partial<TableData> {
  const q = new URLSearchParams(location.search);
  const el = Number(q.get('el'));
  const seed = Number(q.get('seed'));
  return {
    startRound: el >= 1 && el <= CONTRACTS.length ? el - 1 : undefined,
    seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
  };
}

function urlRuleOrder(): RuleOrder | null {
  const m = new URLSearchParams(location.search).get('mod');
  return m === 'random' || m === 'rastgele' ? 'random' : m === 'klasik' || m === 'classic' ? 'classic' : null;
}

export class MenuScene extends Phaser.Scene {
  private ruleOrder: RuleOrder = 'classic';
  private segClassic!: Button;
  private segRandom!: Button;
  private cardTitle!: Phaser.GameObjects.Text;
  private col1!: Phaser.GameObjects.Text;
  private col2!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;

  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    createTextures(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());

    let saved: string | null = null;
    try {
      saved = localStorage.getItem('kut-rule-order');
    } catch {
      /* depolama yok */
    }
    this.ruleOrder = urlRuleOrder() ?? (saved === 'random' ? 'random' : 'classic');

    // dekoratif taşlar: küt dizilimi + okey
    const deco = ['tile-red-7', 'tile-yellow-7', 'tile-blue-7', 'tile-joker', 'tile-black-7'];
    deco.forEach((k, i) => {
      const img = this.add
        .image(GAME_W / 2 - 152 + i * 76, -80, k)
        .setScale(0.58)
        .setAngle((i - 2) * 5);
      this.tweens.add({ targets: img, y: 128 + Math.abs(i - 2) * 6, duration: 620, delay: 120 + i * 90, ease: 'Back.easeOut' });
    });

    const title = txt(this, GAME_W / 2, 226, 'KÜT', 70, UI.goldHex, 900).setOrigin(0.5).setShadow(0, 5, 'rgba(0,0,0,0.5)', 10);
    title.setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 500, delay: 500 });
    txt(this, GAME_W / 2, 274, 'AMERİKANO OKEY', 17, UI.cream, 900, { letterSpacing: 6 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5);

    // kural sırası seçimi (segmentli düğme)
    txt(this, GAME_W / 2 - 236, 318, 'KURALLAR', 12, UI.muted, 900).setOrigin(0, 0.5);
    this.segClassic = new Button(this, GAME_W / 2 - 60, 318, 190, 38, 'Sıralı (1 → 11)', () => this.setOrder('classic'), UI.slate, 15);
    this.segRandom = new Button(this, GAME_W / 2 + 140, 318, 190, 38, '🎲 Rastgele Mod', () => this.setOrder('random'), UI.slate, 15);

    const go = (mode: GameMode) => this.scene.start('table', { mode, ruleOrder: this.ruleOrder, ...urlOptions() } satisfies TableData);
    new Button(this, GAME_W / 2 - 165, 382, 300, 66, 'Tekli Oyun\n1 kişi + 3 bot', () => go('solo'), UI.green, 19);
    new Button(this, GAME_W / 2 + 165, 382, 300, 66, "Takım Oyunu\n2'ye 2 · karşın ortağın", () => go('team'), UI.blue, 19);

    // kurallar kartı
    const g = this.add.graphics();
    panel(g, GAME_W / 2 - 330, 432, 660, 242, 18, UI.panel, 0.9, UI.gold, 0.5);
    this.cardTitle = txt(this, GAME_W / 2, 446, '', 14, UI.goldHex, 900).setOrigin(0.5, 0);
    const style = { lineSpacing: 7 };
    this.col1 = txt(this, GAME_W / 2 - 300, 474, '', 16, UI.cream, 800, style);
    this.col2 = txt(this, GAME_W / 2 + 20, 474, '', 16, UI.cream, 800, style);
    this.note = txt(this, GAME_W / 2, 652, '', 12, UI.muted, 700).setOrigin(0.5, 0);
    txt(
      this,
      GAME_W / 2,
      696,
      'Küt: aynı sayı, farklı renk  ·  Seri: aynı renk, ardışık (başa sarma yok)  ·  Okey: sahte okey simgeli taş',
      13,
      UI.muted,
      700,
    ).setOrigin(0.5);

    this.renderOrder();
  }

  private setOrder(o: RuleOrder) {
    if (this.ruleOrder === o) return;
    this.ruleOrder = o;
    try {
      localStorage.setItem('kut-rule-order', o);
    } catch {
      /* depolama yok */
    }
    this.renderOrder();
    this.tweens.add({ targets: [this.col1, this.col2], alpha: { from: 0.2, to: 1 }, duration: 220 });
  }

  private renderOrder() {
    const random = this.ruleOrder === 'random';
    this.segClassic.setColor(random ? UI.slate : UI.amber);
    this.segRandom.setColor(random ? UI.amber : UI.slate);
    if (random) {
      this.cardTitle.setText('RASTGELE MOD · HER ELİN KURALI BU ORANLARLA ÇEKİLİR');
      const lines = CONTRACTS.map((c, i) => `%${String(RANDOM_WEIGHTS[i]).padStart(2, ' ')}   ${c.name}`);
      this.col1.setText(lines.slice(0, 6).join('\n'));
      this.col2.setText(lines.slice(6).join('\n'));
      this.note.setText(`İlk el dahil her el her kural olabilir · aynı kural art arda gelmez · bir oyunda en fazla ${RANDOM_MAX_REPEAT} kez`);
    } else {
      this.cardTitle.setText('11 EL · HER ELİN KURALI');
      const lines = CONTRACTS.map((c, i) => `${i + 1}.  ${c.name}`);
      this.col1.setText(lines.slice(0, 6).join('\n'));
      this.col2.setText(lines.slice(6).join('\n'));
      this.note.setText('Kurallar sırayla gelir · açarken sadece kural iner, fazlalıklar sonraki sırada');
    }
  }
}
