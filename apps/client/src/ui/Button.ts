import Phaser from 'phaser';
import { FONT, TEXT_RES } from '../layout';
import { sfx } from '../sfx';

/** Yuvarlak köşeli, basınca çöken, devre dışıyken soluk buton. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private hover = false;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private bw: number,
    private bh: number,
    text: string,
    private onClick: () => void,
    private color = 0x2e9a5c,
    fontSize = 18,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, -1, text, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        fontStyle: '800',
        color: '#ffffff',
        align: 'center',
        resolution: TEXT_RES,
      })
      .setOrigin(0.5)
      .setShadow(0, 2, 'rgba(0,0,0,0.35)', 2);
    this.add([this.bg, this.label]);
    this.setSize(bw, bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => {
      this.hover = true;
      this.draw();
    });
    this.on('pointerout', () => {
      this.hover = false;
      this.draw();
      this.scene.tweens.add({ targets: this, scale: 1, duration: 90 });
    });
    this.on('pointerdown', () => {
      if (!this.enabled) {
        sfx.error();
        this.scene.tweens.add({ targets: this, x: this.x + 4, duration: 40, yoyo: true, repeat: 1 });
        return;
      }
      sfx.select();
      this.scene.tweens.add({ targets: this, scale: 0.93, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
      this.onClick();
    });
    this.draw();
    scene.add.existing(this);
  }

  setEnabled(v: boolean): this {
    if (this.enabled !== v) {
      this.enabled = v;
      this.setAlpha(v ? 1 : 0.35);
      this.draw();
      if (!v) this.setPulse(false);
    }
    return this;
  }

  setLabel(t: string): this {
    if (this.label.text !== t) this.label.setText(t);
    return this;
  }

  setColor(c: number): this {
    if (this.color !== c) {
      this.color = c;
      this.draw();
    }
    return this;
  }

  /** Önerilen hamle butonunu hafifçe nabız gibi atar. */
  setPulse(on: boolean): this {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({ targets: this, scale: 1.06, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!on && this.pulseTween) {
      this.pulseTween.remove();
      this.pulseTween = null;
      this.setScale(1);
    }
    return this;
  }

  private draw() {
    const { bw: w, bh: h } = this;
    const g = this.bg;
    const r = Math.min(16, h / 2);
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r);
    g.fillStyle(this.color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, this.hover && this.enabled ? 0.2 : 0.1);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h / 2 - 3, { tl: r - 3, tr: r - 3, bl: 4, br: 4 });
    g.lineStyle(2, 0xffffff, 0.22);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }
}
