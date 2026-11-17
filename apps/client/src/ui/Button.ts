import Phaser from 'phaser';
import { FONT } from '../layout';

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private hover = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private bw: number,
    private bh: number,
    text: string,
    private onClick: () => void,
    private color = 0x2f8f57,
    fontSize = 18,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: `${fontSize}px`, fontStyle: 'bold', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
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
    });
    this.on('pointerdown', () => {
      if (this.enabled) this.onClick();
    });
    this.draw();
    scene.add.existing(this);
  }

  setEnabled(v: boolean): this {
    if (this.enabled !== v) {
      this.enabled = v;
      this.setAlpha(v ? 1 : 0.38);
      this.draw();
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

  private draw() {
    const { bw: w, bh: h } = this;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, 12);
    g.fillStyle(this.color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    if (this.hover && this.enabled) {
      g.fillStyle(0xffffff, 0.14);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    }
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
  }
}
