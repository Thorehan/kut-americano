import Phaser from 'phaser';
import { FONT, RENDER_SCALE, TEXT_RES } from '../layout';
import { sfx } from '../sfx';

/**
 * "Kahvehane premium" buton: pirinç çerçeve içinde emaye (ya da ahşap) yüz, gerçek degrade,
 * üstte ışık, altta gölge. Görünüm, boyut+renk+durum başına bir kez çizilip doku olarak saklanır.
 */

interface Finish {
  top: string;
  bottom: string;
  wood?: boolean;
  text: string;
}

/** Eski düz renk kodlarını malzemelere eşler (çağıran kodlar değişmeden yeni görünümü alır). */
const FINISHES: Record<number, Finish> = {
  0x2e9a5c: { top: '#3f9a63', bottom: '#1d5535', text: '#fff6e0' }, // yeşil emaye (ana)
  0x2f8f57: { top: '#3f9a63', bottom: '#1d5535', text: '#fff6e0' },
  0x2d68b8: { top: '#3a74b8', bottom: '#173c6b', text: '#fff6e0' }, // çini laciverti
  0xc0453a: { top: '#c24a4f', bottom: '#7a1f26', text: '#fff6e0' }, // nar kırmızısı
  0x31574a: { top: '#8a5a30', bottom: '#4e2c12', wood: true, text: '#fff6e0' }, // ceviz (ikincil)
  0x8a6420: { top: '#a8742c', bottom: '#5e3a0e', text: '#fff6e0' }, // bakır
  0x5b3f8f: { top: '#7a5ab0', bottom: '#43296e', text: '#fff6e0' }, // mor emaye
  0xf5c451: { top: '#fbe39a', bottom: '#c99a3a', text: '#2a1a05' }, // seçili: parlak pirinç
};

function hex(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function shade(c: string, f: number): string {
  const n = parseInt(c.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function finishFor(color: number): Finish {
  return FINISHES[color] ?? { top: shade(hex(color), 1.15), bottom: shade(hex(color), 0.62), text: '#fff6e0' };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Butonun dokusunu (bir kez) çizer ve anahtarını döndürür. */
function buttonTexture(scene: Phaser.Scene, w: number, h: number, color: number, hover: boolean): string {
  const key = `btn-${w}x${h}-${color.toString(16)}-${hover ? 'h' : 'n'}`;
  if (scene.textures.exists(key)) return key;
  const S = RENDER_SCALE * 1.4; // keskin kenar için büyük çiz
  const pad = 8;
  const W = Math.ceil((w + pad * 2) * S);
  const H = Math.ceil((h + pad * 2) * S);
  const tex = scene.textures.createCanvas(key, W, H);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(S, S);
  ctx.translate(pad, pad);
  const f = finishFor(color);
  const r = Math.min(14, h / 2.6);

  // gölge
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  rr(ctx, 0, 0, w, h, r);
  ctx.fillStyle = '#3a2808';
  ctx.fill();
  ctx.restore();

  // pirinç çerçeve
  rr(ctx, 0, 0, w, h, r);
  const brass = ctx.createLinearGradient(0, 0, 0, h);
  brass.addColorStop(0, '#f6dc8f');
  brass.addColorStop(0.45, '#c9a24a');
  brass.addColorStop(1, '#7a5a1c');
  ctx.fillStyle = brass;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(60,40,8,0.9)';
  ctx.stroke();

  // emaye / ahşap yüz
  const b = 3.2;
  rr(ctx, b, b, w - b * 2, h - b * 2, Math.max(2, r - b));
  const face = ctx.createLinearGradient(0, b, 0, h - b);
  face.addColorStop(0, hover ? shade(f.top, 1.12) : f.top);
  face.addColorStop(1, hover ? shade(f.bottom, 1.12) : f.bottom);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (f.wood) {
    // ahşap damarı
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#1e0f04';
    ctx.lineWidth = 1;
    for (let yy = b + 3; yy < h; yy += 4.5) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(w * 0.3, yy + 2, w * 0.7, yy - 2, w, yy + 1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // üst parlama
  const gloss = ctx.createLinearGradient(0, b, 0, h * 0.55);
  gloss.addColorStop(0, 'rgba(255,255,255,0.32)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h * 0.55);
  // alt iç gölge
  const inner = ctx.createLinearGradient(0, h * 0.7, 0, h);
  inner.addColorStop(0, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = inner;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
  ctx.restore();
  // ince iç pirinç çizgi
  rr(ctx, b + 0.6, b + 0.6, w - b * 2 - 1.2, h - b * 2 - 1.2, Math.max(2, r - b));
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,236,180,0.35)';
  ctx.stroke();
  tex.refresh();
  return key;
}

/** Pirinç çerçeveli, basınca çöken, devre dışıyken soluk buton. İsteğe bağlı ikon alır. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image | null = null;
  private enabled = true;
  private hover = false;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private labelColorFixed: string | null = null;

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
    this.bg = scene.add.image(0, 0, buttonTexture(scene, bw, bh, color, false));
    this.label = scene.add
      .text(0, -1, text, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        fontStyle: '800',
        color: finishFor(color).text,
        align: 'center',
        resolution: TEXT_RES,
      })
      .setOrigin(0.5)
      .setShadow(0, 2, 'rgba(20,10,0,0.6)', 2);
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
      this.scene.tweens.add({ targets: this, scale: 0.94, y: this.y + 2, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
      this.onClick();
    });
    this.draw();
    scene.add.existing(this);
  }

  /** Yazının soluna küçük bir ikon (ör. üretilmiş pirinç ikonlar). Doku yoksa sessizce atlanır. */
  setIcon(key: string, size = 28): this {
    if (!this.scene.textures.exists(key)) return this;
    this.icon?.destroy();
    this.icon = this.scene.add.image(0, 0, key);
    this.icon.setScale(size / Math.max(this.icon.width, this.icon.height));
    this.add(this.icon);
    const gap = 8;
    const total = size + gap + this.label.width;
    this.icon.setX(-total / 2 + size / 2);
    this.label.setX(-total / 2 + size + gap + this.label.width / 2);
    return this;
  }

  setEnabled(v: boolean): this {
    if (this.enabled !== v) {
      this.enabled = v;
      this.setAlpha(v ? 1 : 0.42);
      this.draw();
      if (!v) this.setPulse(false);
    }
    return this;
  }

  setLabel(t: string): this {
    if (this.label.text !== t) {
      this.label.setText(t);
      if (this.icon) this.setIcon(this.icon.texture.key, this.icon.displayHeight);
    }
    return this;
  }

  setColor(c: number): this {
    if (this.color !== c) {
      this.color = c;
      if (!this.labelColorFixed) this.label.setColor(finishFor(c).text);
      this.draw();
    }
    return this;
  }

  /** Yazı rengini sabitle (açık zeminlerde koyu yazı için). */
  setLabelColor(css: string): this {
    this.labelColorFixed = css;
    this.label.setColor(css);
    this.label.setShadow(0, css === '#ffffff' || css === '#fff6e0' ? 2 : 0, 'rgba(20,10,0,0.6)', 2);
    return this;
  }

  /** Seçili / seçili değil görünümü (segmentli düğmeler, sekmeler). */
  setSelected(on: boolean, offColor: number): this {
    this.labelColorFixed = null;
    this.setColor(on ? 0xf5c451 : offColor);
    this.label.setColor(finishFor(on ? 0xf5c451 : offColor).text);
    this.label.setShadow(0, on ? 0 : 2, 'rgba(20,10,0,0.6)', 2);
    return this;
  }

  /** Önerilen hamle butonunu hafifçe nabız gibi atar. */
  setPulse(on: boolean): this {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({ targets: this, scale: 1.06, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!on && this.pulseTween) {
      this.pulseTween.remove();
      this.pulseTween = null;
      this.setScale(1);
    }
    return this;
  }

  private draw() {
    const key = buttonTexture(this.scene, this.bw, this.bh, this.color, this.hover && this.enabled);
    this.bg.setTexture(key);
    this.bg.setScale(1 / (RENDER_SCALE * 1.4));
  }
}
