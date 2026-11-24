import Phaser from 'phaser';
import { UI } from '../layout';
import { Button } from './Button';
import { icon } from './icons';
import { txt } from './text';
import { fmt } from './rewards';

/**
 * Ekranlar arasında ortak "Çini" parçaları: KP hapı, krem taş kart, koyu oluk.
 * Hepsi Graphics/metin; doku üretmez, ucuzdur.
 */

/** Koyu hap + jeton + miktar (+ isteğe bağlı yeşil "+" butonu). */
export function kpPill(scene: Phaser.Scene, x: number, y: number, value: number, onTap?: () => void, onPlus?: () => void) {
  const w = 206;
  const g = scene.add.graphics();
  g.fillStyle(0x06191b, 0.9);
  g.fillRoundedRect(x, y - 22, w, 44, 22);
  g.lineStyle(2, UI.gold, 0.55);
  g.strokeRoundedRect(x, y - 22, w, 44, 22);
  const coin = scene.add.image(x + 12, y, 'coin').setScale(0.66);
  const t = txt(scene, x + 42, y, fmt(value), 25, '#ffffff', 900).setOrigin(0, 0.5).setStroke('#06191b', 4);
  if (onTap) scene.add.zone(x + w / 2, y, w, 44).setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
  const plus = onPlus ? new Button(scene, x + w - 20, y, 42, 42, '', onPlus, UI.green).setIcon(icon('plus'), 22) : null;
  return {
    objects: [g, coin, t, ...(plus ? [plus] : [])] as Phaser.GameObjects.GameObject[],
    set(v: number) {
      t.setText(fmt(v));
    },
  };
}

/** Krem okey taşı yüzü: koyu dış hat, alt kalınlık, üstte ışık. */
export function creamTile(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 22, depth = 8) {
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x + 2, y + depth + 2, w, h, r);
  g.fillStyle(0x06191b, 1);
  g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, r + 2);
  g.fillStyle(0xcdb98e, 1);
  g.fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xfff8ea, 1);
  g.fillRoundedRect(x, y, w, h - depth, r);
  g.fillStyle(0xffffff, 0.7);
  g.fillRoundedRect(x + 10, y + 6, w - 20, Math.min(14, h * 0.12), 7);
}

/** Koyu oluk (segmentli seçicilerin, listelerin zemini). */
export function groove(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 22, alpha = 0.75) {
  g.fillStyle(0x06191b, alpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(2, UI.stroke, 0.35);
  g.strokeRoundedRect(x, y, w, h, r);
}

function starPts(cx: number, cy: number, r: number, inner = 0.62) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  return pts;
}

/**
 * Avatar: renkli daire + seçili çerçeve (kozmetik). Çerçeve dairenin etrafına çizilir;
 * emoji ayrıca eklenir (dönen metin nesnesi).
 */
export function avatar(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, emoji: string, frame = 'frame-yok') {
  const w = Math.max(3, r * 0.12);
  if (frame === 'frame-altin') {
    g.fillStyle(0x06191b, 1);
    g.fillPoints(starPts(x, y + r + w * 0.2, r * 0.42), true);
    g.fillStyle(UI.gold, 1);
    g.fillPoints(starPts(x, y + r, r * 0.36), true);
    g.fillStyle(0x06191b, 1);
    g.fillCircle(x, y, r + w * 2.4);
    g.fillStyle(0xbd6d06, 1);
    g.fillCircle(x, y, r + w * 2);
    g.fillStyle(UI.gold, 1);
    g.fillCircle(x, y, r + w * 1.6);
    g.fillStyle(0xfff1b0, 1);
    g.fillCircle(x, y, r + w * 0.7);
  } else if (frame === 'frame-cini') {
    g.fillStyle(0x06191b, 1);
    g.fillCircle(x, y, r + w * 2);
    g.fillStyle(0x4cc0b2, 1);
    g.fillCircle(x, y, r + w * 1.5);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillPoints(starPts(x + Math.cos(a) * (r + w * 0.75), y + Math.sin(a) * (r + w * 0.75), w * 0.8, 0.55), true);
    }
  } else if (frame === 'frame-lale') {
    // üstte üç lale yaprağı
    g.fillStyle(0x06191b, 1);
    for (const dx of [-0.45, 0, 0.45]) g.fillEllipse(x + dx * r, y - r - w * 0.6, r * 0.46, r * 0.62);
    g.fillStyle(0xe8483c, 1);
    for (const dx of [-0.45, 0, 0.45]) g.fillEllipse(x + dx * r, y - r - w * 0.4, r * 0.36, r * 0.52);
    g.fillStyle(0x06191b, 1);
    g.fillCircle(x, y, r + w * 1.8);
    g.fillStyle(0xe8483c, 1);
    g.fillCircle(x, y, r + w * 1.3);
    g.fillStyle(0x21a957, 1);
    g.fillCircle(x, y, r + w * 0.55);
  } else {
    g.fillStyle(0x06191b, 1);
    g.fillCircle(x, y, r + w);
  }
  g.fillStyle(color, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.2);
  g.fillCircle(x, y - r * 0.28, r * 0.66);
  return txt(scene, x, y + 1, emoji, Math.round(r * 1.05), '#fff', 900).setOrigin(0.5);
}

/** Bölüm başlığı: safran küçük yıldız + büyük harf etiket. */
export function sectionTitle(scene: Phaser.Scene, x: number, y: number, title: string) {
  const g = scene.add.graphics();
  g.fillStyle(UI.gold, 1);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? 7 : 4.4;
    pts.push(new Phaser.Math.Vector2(x + 7 + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  g.fillPoints(pts, true);
  const t = txt(scene, x + 22, y, title, 17, UI.goldHex, 900, { letterSpacing: 2 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0, 0.5);
  return [g, t] as Phaser.GameObjects.GameObject[];
}
