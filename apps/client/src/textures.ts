import Phaser from 'phaser';
import { COLORS, Color, Tile } from '@kut/core';
import { FONT, GAME_H, GAME_W } from './layout';

/** Taş dokuları 2x çözünürlükte çizilir, ekranda küçültülerek gösterilir. */
export const TILE_W = 104;
export const TILE_H = 144;

export const COLOR_HEX: Record<Color, string> = {
  red: '#c8312b',
  yellow: '#d39200',
  blue: '#1d5fb8',
  black: '#1f1f1f',
};

export function tileKey(t: Tile): string {
  return t.joker ? 'tile-joker' : `tile-${t.color}-${t.value}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function tileFace(ctx: CanvasRenderingContext2D) {
  const w = TILE_W;
  const h = TILE_H;
  // gölge / kalınlık
  roundRect(ctx, 3, 8, w - 6, h - 9, 14);
  ctx.fillStyle = '#a8946a';
  ctx.fill();
  // yüz
  roundRect(ctx, 3, 2, w - 6, h - 12, 14);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fffdf6');
  g.addColorStop(1, '#efe3c4');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#b8a57a';
  ctx.stroke();
}

function drawRosette(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.22, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#fffdf6';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('tile-back')) return;

  for (const color of COLORS) {
    for (let v = 1; v <= 13; v++) {
      canvas(scene, `tile-${color}-${v}`, TILE_W, TILE_H, (ctx) => {
        tileFace(ctx);
        ctx.fillStyle = COLOR_HEX[color];
        ctx.font = `bold ${v >= 10 ? 58 : 66}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), TILE_W / 2, 58);
        // küçük damla simgesi
        ctx.beginPath();
        ctx.arc(TILE_W / 2, 106, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(TILE_W / 2 - 3, 103, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      });
    }
  }

  // Okey = sahte okey simgeli taş
  canvas(scene, 'tile-joker', TILE_W, TILE_H, (ctx) => {
    tileFace(ctx);
    drawRosette(ctx, TILE_W / 2, 60, 40, '#1e8a4c');
    ctx.fillStyle = '#1e8a4c';
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OKEY', TILE_W / 2, 114);
  });

  canvas(scene, 'tile-back', TILE_W, TILE_H, (ctx) => {
    roundRect(ctx, 3, 8, TILE_W - 6, TILE_H - 9, 14);
    ctx.fillStyle = '#123f33';
    ctx.fill();
    roundRect(ctx, 3, 2, TILE_W - 6, TILE_H - 12, 14);
    const g = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
    g.addColorStop(0, '#2f7a63');
    g.addColorStop(1, '#1c5a48');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    roundRect(ctx, 14, 13, TILE_W - 28, TILE_H - 36, 9);
    ctx.stroke();
    drawRosette(ctx, TILE_W / 2, TILE_H / 2 - 6, 26, 'rgba(255,255,255,0.35)');
  });

  // çuha masa
  canvas(scene, 'felt', GAME_W, GAME_H, (ctx) => {
    const g = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2 - 40, 80, GAME_W / 2, GAME_H / 2, GAME_W * 0.7);
    g.addColorStop(0, '#1f7a52');
    g.addColorStop(0.6, '#145c3d');
    g.addColorStop(1, '#0a3425');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    // hafif doku
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = i % 2 ? '#000' : '#fff';
      ctx.fillRect(Math.random() * GAME_W, Math.random() * GAME_H, 2, 2);
    }
    ctx.globalAlpha = 1;
  });

  // ahşap ıstaka
  canvas(scene, 'rack', 904, 160, (ctx) => {
    roundRect(ctx, 0, 0, 904, 160, 18);
    const g = ctx.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, '#9a6434');
    g.addColorStop(1, '#6b3f1d');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#2b1505';
    for (let y = 6; y < 160; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(300, y + 4, 600, y - 4, 904, y + 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // raflar
    for (const y of [78, 154]) {
      ctx.fillStyle = '#4a2a10';
      ctx.fillRect(12, y, 880, 5);
    }
  });
}
