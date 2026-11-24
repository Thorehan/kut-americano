import Phaser from 'phaser';

/**
 * Kodla çizilen beyaz ikon seti (emoji her cihazda farklı görünür, bunlar her yerde aynı).
 * Her ikon 96×96 tuvalde, hafif gölgeli beyaz glif olarak çizilir; anahtar: `ic-<ad>`.
 */

export type IconName =
  | 'play'
  | 'gear'
  | 'shop'
  | 'user'
  | 'trophy'
  | 'book'
  | 'globe'
  | 'cap'
  | 'video'
  | 'plus'
  | 'sound'
  | 'mute'
  | 'close'
  | 'back'
  | 'dice'
  | 'list'
  | 'menu'
  | 'team'
  | 'star'
  | 'bolt'
  | 'exit';

export const icon = (n: IconName) => `ic-${n}`;

const S = 96;

type Draw = (c: CanvasRenderingContext2D) => void;

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function starPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner: number, n = 8) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

const ICONS: Record<IconName, Draw> = {
  play: (c) => {
    c.beginPath();
    c.moveTo(32, 20);
    c.quadraticCurveTo(28, 18, 28, 24);
    c.lineTo(28, 72);
    c.quadraticCurveTo(28, 78, 33, 75);
    c.lineTo(74, 51);
    c.quadraticCurveTo(78, 48, 74, 45);
    c.closePath();
    c.fill();
  },
  gear: (c) => {
    c.save();
    c.translate(48, 48);
    for (let i = 0; i < 8; i++) {
      c.rotate(Math.PI / 4);
      rr(c, -8, -38, 16, 18, 4);
      c.fill();
    }
    c.restore();
    c.beginPath();
    c.arc(48, 48, 27, 0, Math.PI * 2);
    c.arc(48, 48, 11, 0, Math.PI * 2, true);
    c.fill('evenodd');
  },
  shop: (c) => {
    // alışveriş çantası
    c.lineWidth = 7;
    c.beginPath();
    c.arc(48, 34, 14, Math.PI, 0);
    c.stroke();
    c.beginPath();
    c.moveTo(20, 34);
    c.lineTo(76, 34);
    c.lineTo(80, 80);
    c.quadraticCurveTo(80, 84, 76, 84);
    c.lineTo(20, 84);
    c.quadraticCurveTo(16, 84, 16, 80);
    c.closePath();
    c.fill();
  },
  user: (c) => {
    c.beginPath();
    c.arc(48, 32, 17, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(16, 84);
    c.quadraticCurveTo(16, 54, 48, 54);
    c.quadraticCurveTo(80, 54, 80, 84);
    c.closePath();
    c.fill();
  },
  team: (c) => {
    c.globalAlpha = 0.75;
    c.beginPath();
    c.arc(64, 30, 13, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(44, 74);
    c.quadraticCurveTo(46, 50, 64, 50);
    c.quadraticCurveTo(86, 50, 88, 74);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(36, 36, 15, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(8, 84);
    c.quadraticCurveTo(8, 56, 36, 56);
    c.quadraticCurveTo(64, 56, 64, 84);
    c.closePath();
    c.fill();
  },
  trophy: (c) => {
    c.beginPath();
    c.moveTo(28, 14);
    c.lineTo(68, 14);
    c.lineTo(66, 40);
    c.quadraticCurveTo(62, 58, 48, 60);
    c.quadraticCurveTo(34, 58, 30, 40);
    c.closePath();
    c.fill();
    c.lineWidth = 6;
    c.beginPath();
    c.arc(26, 30, 10, Math.PI * 0.5, Math.PI * 1.5);
    c.stroke();
    c.beginPath();
    c.arc(70, 30, 10, -Math.PI * 0.5, Math.PI * 0.5);
    c.stroke();
    c.fillRect(43, 58, 10, 14);
    rr(c, 28, 72, 40, 12, 4);
    c.fill();
  },
  book: (c) => {
    c.beginPath();
    c.moveTo(48, 26);
    c.quadraticCurveTo(32, 16, 12, 20);
    c.lineTo(12, 76);
    c.quadraticCurveTo(32, 72, 46, 82);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(50, 26);
    c.quadraticCurveTo(64, 16, 84, 20);
    c.lineTo(84, 76);
    c.quadraticCurveTo(64, 72, 50, 82);
    c.closePath();
    c.fill();
  },
  globe: (c) => {
    c.lineWidth = 6;
    c.beginPath();
    c.arc(48, 48, 32, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(48, 48, 14, 32, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(16, 48);
    c.lineTo(80, 48);
    c.moveTo(22, 32);
    c.lineTo(74, 32);
    c.moveTo(22, 64);
    c.lineTo(74, 64);
    c.stroke();
  },
  cap: (c) => {
    c.beginPath();
    c.moveTo(48, 18);
    c.lineTo(90, 38);
    c.lineTo(48, 58);
    c.lineTo(6, 38);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(24, 48);
    c.lineTo(24, 66);
    c.quadraticCurveTo(48, 82, 72, 66);
    c.lineTo(72, 48);
    c.lineTo(48, 60);
    c.closePath();
    c.fill();
    c.fillRect(80, 40, 5, 26);
    c.beginPath();
    c.arc(82.5, 70, 5, 0, Math.PI * 2);
    c.fill();
  },
  video: (c) => {
    rr(c, 8, 24, 58, 48, 10);
    c.fill();
    c.beginPath();
    c.moveTo(70, 42);
    c.lineTo(90, 28);
    c.lineTo(90, 68);
    c.lineTo(70, 54);
    c.closePath();
    c.fill();
  },
  plus: (c) => {
    rr(c, 40, 14, 16, 68, 6);
    c.fill();
    rr(c, 14, 40, 68, 16, 6);
    c.fill();
  },
  sound: (c) => {
    c.beginPath();
    c.moveTo(12, 36);
    c.lineTo(28, 36);
    c.lineTo(48, 18);
    c.lineTo(48, 78);
    c.lineTo(28, 60);
    c.lineTo(12, 60);
    c.closePath();
    c.fill();
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(52, 48, 14, -0.9, 0.9);
    c.stroke();
    c.beginPath();
    c.arc(52, 48, 28, -0.9, 0.9);
    c.stroke();
  },
  mute: (c) => {
    ICONS.sound(c);
    c.clearRect(56, 14, 40, 70);
    c.lineWidth = 8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(60, 34);
    c.lineTo(84, 62);
    c.moveTo(84, 34);
    c.lineTo(60, 62);
    c.stroke();
  },
  close: (c) => {
    c.lineWidth = 13;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(24, 24);
    c.lineTo(72, 72);
    c.moveTo(72, 24);
    c.lineTo(24, 72);
    c.stroke();
  },
  back: (c) => {
    c.lineWidth = 12;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(56, 18);
    c.lineTo(26, 48);
    c.lineTo(56, 78);
    c.moveTo(28, 48);
    c.lineTo(80, 48);
    c.stroke();
  },
  dice: (c) => {
    rr(c, 14, 14, 68, 68, 16);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [
      [32, 32],
      [64, 32],
      [48, 48],
      [32, 64],
      [64, 64],
    ]) {
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  },
  list: (c) => {
    // puan tablosu: üç sütunlu kürsü
    rr(c, 10, 46, 24, 38, 4);
    c.fill();
    rr(c, 36, 22, 24, 62, 4);
    c.fill();
    rr(c, 62, 58, 24, 26, 4);
    c.fill();
  },
  menu: (c) => {
    for (const y of [24, 44, 64]) {
      rr(c, 14, y, 68, 11, 5);
      c.fill();
    }
  },
  star: (c) => {
    starPath(c, 48, 48, 40, 0.62);
    c.fill();
  },
  bolt: (c) => {
    c.beginPath();
    c.moveTo(56, 8);
    c.lineTo(18, 54);
    c.lineTo(44, 54);
    c.lineTo(38, 88);
    c.lineTo(78, 40);
    c.lineTo(52, 40);
    c.closePath();
    c.fill();
  },
  exit: (c) => {
    c.lineWidth = 8;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(46, 16);
    c.lineTo(16, 16);
    c.lineTo(16, 80);
    c.lineTo(46, 80);
    c.stroke();
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(36, 48);
    c.lineTo(82, 48);
    c.moveTo(66, 32);
    c.lineTo(82, 48);
    c.lineTo(66, 64);
    c.stroke();
  },
};

/** Tüm ikon dokularını (bir kez) oluşturur. */
export function createIcons(scene: Phaser.Scene) {
  for (const name of Object.keys(ICONS) as IconName[]) {
    const key = icon(name);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, S, S);
    if (!tex) continue;
    const ctx = tex.getContext();
    // önce glifi ayrı bir tuvale çiz, sonra gölgeli olarak bas (destination-out kullanan ikonlar için)
    const tmp = document.createElement('canvas');
    tmp.width = S;
    tmp.height = S;
    const t = tmp.getContext('2d')!;
    t.fillStyle = '#ffffff';
    t.strokeStyle = '#ffffff';
    ICONS[name](t);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowOffsetY = 4;
    ctx.shadowBlur = 0;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    tex.refresh();
  }
}
