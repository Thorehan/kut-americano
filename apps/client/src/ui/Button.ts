import Phaser from 'phaser';
import { FONT, RENDER_SCALE, TEXT_RES } from '../layout';
import { sfx } from '../sfx';

/**
 * "Çini" buton: mobil oyunlardaki gibi kalın, basılabilir görünen şeker buton — parlak yüz,
 * altta koyu "dudak" (derinlik), üstte ışık bandı, köşede küçük çini yıldızı. Yazı beyaz ve
 * koyu konturlu. Görünüm, boyut+renk+durum başına bir kez çizilip doku olarak saklanır.
 */

interface Finish {
  top: string;
  bottom: string;
  /** Alt dudak (derinlik) ve yazı konturu. */
  lip: string;
  text: string;
}

/** Eski renk kodlarını yeni malzemelere eşler (çağıran kodlar değişmeden yeni görünümü alır). */
const FINISHES: Record<number, Finish> = {
  0x2e9a5c: { top: '#5fe08a', bottom: '#21a957', lip: '#11743a', text: '#ffffff' }, // yeşil: ana eylem
  0x2f8f57: { top: '#5fe08a', bottom: '#21a957', lip: '#11743a', text: '#ffffff' },
  0x2d68b8: { top: '#5cc0ff', bottom: '#2384e0', lip: '#14589e', text: '#ffffff' }, // çini mavisi
  0xc0453a: { top: '#ff8a7a', bottom: '#e8483c', lip: '#a52a22', text: '#ffffff' }, // nar
  0x31574a: { top: '#3d8f94', bottom: '#256a70', lip: '#123f43', text: '#ffffff' }, // turkuaz cam (ikincil)
  0x8a6420: { top: '#ffd76a', bottom: '#ffa928', lip: '#bd6d06', text: '#ffffff' }, // safran
  0x5b3f8f: { top: '#c39bff', bottom: '#8a55ec', lip: '#5a2fb0', text: '#ffffff' }, // lale moru
  0x7a4bb8: { top: '#c39bff', bottom: '#8a55ec', lip: '#5a2fb0', text: '#ffffff' },
  0xf5c451: { top: '#fff1b0', bottom: '#ffc845', lip: '#c58a0c', text: '#5a3300' }, // seçili: parlak safran
};

/** Butonun alt "dudağı" (basılabilirlik derinliği). */
const LIP = 5;

function hex(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function shade(c: string, f: number): string {
  const n = parseInt(c.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function finishFor(color: number): Finish {
  return FINISHES[color] ?? { top: shade(hex(color), 1.3), bottom: hex(color), lip: shade(hex(color), 0.55), text: '#ffffff' };
}

/** Küçük 8 köşeli çini yıldızı (iki iç içe kare). */
function star8(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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
  const r = Math.min(18, h * 0.34);
  const lip = Math.min(LIP, h * 0.1);
  const fh = h - lip; // yüz yüksekliği

  // yumuşak gölge
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  rr(ctx, 0, 0, w, h, r);
  ctx.fillStyle = f.lip;
  ctx.fill();
  ctx.restore();

  // koyu dış hat + alt dudak
  rr(ctx, 0, 0, w, h, r);
  ctx.fillStyle = f.lip;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(10,20,22,0.55)';
  ctx.stroke();

  // yüz
  rr(ctx, 1.5, 1.5, w - 3, fh - 1.5, Math.max(2, r - 1.5));
  const face = ctx.createLinearGradient(0, 0, 0, fh);
  face.addColorStop(0, hover ? shade(f.top, 1.07) : f.top);
  face.addColorStop(1, hover ? shade(f.bottom, 1.07) : f.bottom);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // üst ışık bandı (yumuşak, yuvarlak)
  rr(ctx, 6, 4, w - 12, fh * 0.42, Math.max(2, r - 5));
  const gloss = ctx.createLinearGradient(0, 4, 0, 4 + fh * 0.42);
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
  gloss.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = gloss;
  ctx.fill();
  // köşede soluk çini yıldızı (imza detay)
  if (w >= 90 && h >= 40) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    star8(ctx, w - fh * 0.34, fh * 0.62, fh * 0.26);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // ince iç ışık çizgisi
  rr(ctx, 3, 3, w - 6, fh - 4, Math.max(2, r - 3));
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
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
      .text(0, -Math.min(LIP, bh * 0.1) / 2 - 0.5, text, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        fontStyle: '900',
        color: finishFor(color).text,
        align: 'center',
        resolution: TEXT_RES,
      })
      .setOrigin(0.5);
    this.styleLabel();
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

  /** Yazı konturu ve gölgesi: koyu dudak renginde kalın kontur (mobil oyun yazısı). */
  private styleLabel() {
    const f = finishFor(this.color);
    const dark = this.labelColorFixed ? this.labelColorFixed !== '#ffffff' : f.text !== '#ffffff';
    if (dark) this.label.setStroke('#000000', 0).setShadow(0, 1, 'rgba(255,255,255,0.4)', 0);
    else this.label.setStroke(f.lip, Math.max(3, Math.round(Number.parseInt(String(this.label.style.fontSize), 10) / 5))).setShadow(0, 2, 'rgba(0,0,0,0.35)', 0, true, false);
  }

  /** Yazının soluna ikon; yazı boşsa ikon ortalanır. Doku yoksa sessizce atlanır. */
  setIcon(key: string, size = 28): this {
    if (!this.scene.textures.exists(key)) return this;
    this.icon?.destroy();
    this.icon = this.scene.add.image(0, this.label.y, key);
    this.icon.setScale(size / Math.max(this.icon.width, this.icon.height));
    this.add(this.icon);
    this.iconSize = size;
    this.layoutIcon();
    return this;
  }

  private iconSize = 0;

  private layoutIcon() {
    if (!this.icon) return;
    const size = this.iconSize;
    if (!this.label.text) {
      this.icon.setX(0);
      return;
    }
    const gap = 8;
    const total = size + gap + this.label.width;
    this.icon.setX(-total / 2 + size / 2);
    this.label.setX(-total / 2 + size + gap + this.label.width / 2);
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
      if (this.icon) {
        this.label.setX(0);
        this.layoutIcon();
      }
    }
    return this;
  }

  setColor(c: number): this {
    if (this.color !== c) {
      this.color = c;
      if (!this.labelColorFixed) this.label.setColor(finishFor(c).text);
      this.styleLabel();
      this.draw();
    }
    return this;
  }

  /** Yazı rengini sabitle (açık zeminlerde koyu yazı için). */
  setLabelColor(css: string): this {
    this.labelColorFixed = css === '#fff6e0' ? '#ffffff' : css;
    this.label.setColor(this.labelColorFixed);
    this.styleLabel();
    return this;
  }

  /** Seçili / seçili değil görünümü (segmentli düğmeler, sekmeler). */
  setSelected(on: boolean, offColor: number): this {
    this.labelColorFixed = null;
    this.setColor(on ? 0xf5c451 : offColor);
    this.label.setColor(finishFor(on ? 0xf5c451 : offColor).text);
    this.styleLabel();
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
