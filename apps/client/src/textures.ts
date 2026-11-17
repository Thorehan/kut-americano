import Phaser from 'phaser';
import { COLORS, Color, Tile } from '@kut/core';
import { FONT, GAME_H, GAME_W, RACK, RENDER_SCALE, TABLE } from './layout';

/** Taş dokuları büyük çizilir, ekranda küçültülerek gösterilir (keskinlik için). */
export const TILE_W = 104;
export const TILE_H = 144;

export const COLOR_HEX: Record<Color, string> = {
  red: '#d0352b',
  yellow: '#d89a00',
  blue: '#1f63c4',
  black: '#1d1d1f',
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
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function tileBody(ctx: CanvasRenderingContext2D) {
  const w = TILE_W;
  const h = TILE_H;
  // gövde kalınlığı
  roundRect(ctx, 4, 9, w - 8, h - 11, 14);
  ctx.fillStyle = '#b39a6a';
  ctx.fill();
  // yüz
  roundRect(ctx, 4, 3, w - 8, h - 14, 14);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fffdf7');
  g.addColorStop(0.7, '#f6edd6');
  g.addColorStop(1, '#ecdfbf');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(140,115,70,0.55)';
  ctx.stroke();
  // üst parlama
  roundRect(ctx, 10, 7, w - 20, 18, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function drawRosette(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, center = '#fffdf7') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.56, r * 0.22, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = center;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('tile-back')) return;

  for (const color of COLORS) {
    for (let v = 1; v <= 13; v++) {
      canvas(scene, `tile-${color}-${v}`, TILE_W, TILE_H, (ctx) => {
        tileBody(ctx);
        ctx.fillStyle = COLOR_HEX[color];
        ctx.font = `900 ${v >= 10 ? 62 : 72}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), TILE_W / 2, 60);
        // okey taşı simgesi (küçük damla)
        ctx.beginPath();
        ctx.arc(TILE_W / 2, 108, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(TILE_W / 2 - 3, 105, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fill();
      });
    }
  }

  // Okey = sahte okey simgeli taş
  canvas(scene, 'tile-joker', TILE_W, TILE_H, (ctx) => {
    tileBody(ctx);
    drawRosette(ctx, TILE_W / 2, 60, 42, '#18924f');
    ctx.fillStyle = '#18924f';
    ctx.font = `900 19px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OKEY', TILE_W / 2, 115);
  });

  canvas(scene, 'tile-back', TILE_W, TILE_H, (ctx) => {
    roundRect(ctx, 4, 9, TILE_W - 8, TILE_H - 11, 14);
    ctx.fillStyle = '#0f3a2e';
    ctx.fill();
    roundRect(ctx, 4, 3, TILE_W - 8, TILE_H - 14, 14);
    const g = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
    g.addColorStop(0, '#2f8a6c');
    g.addColorStop(1, '#1b5a47');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    roundRect(ctx, 15, 14, TILE_W - 30, TILE_H - 38, 9);
    ctx.stroke();
    drawRosette(ctx, TILE_W / 2, TILE_H / 2 - 6, 24, 'rgba(255,255,255,0.32)', 'rgba(0,0,0,0)');
  });

  // Gölge (sürüklenen / uçan taşın altında)
  canvas(scene, 'tile-shadow', TILE_W + 24, TILE_H + 24, (ctx) => {
    ctx.filter = 'blur(8px)';
    roundRect(ctx, 14, 16, TILE_W - 4, TILE_H - 8, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
  });

  const S = RENDER_SCALE;

  // Arka plan + masa
  canvas(scene, 'table-bg', GAME_W * S, GAME_H * S, (ctx) => {
    ctx.scale(S, S);
    const bg = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 100, GAME_W / 2, GAME_H / 2, GAME_W * 0.75);
    bg.addColorStop(0, '#123a2c');
    bg.addColorStop(1, '#071d15');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    const { x, y, w, h, r } = TABLE;
    // ahşap kenar
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, x - 12, y - 12, w + 24, h + 24, r + 12);
    const wood = ctx.createLinearGradient(0, y - 12, 0, y + h + 12);
    wood.addColorStop(0, '#7a4a22');
    wood.addColorStop(0.5, '#5c3416');
    wood.addColorStop(1, '#45260f');
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.restore();
    // çuha
    roundRect(ctx, x, y, w, h, r);
    const felt = ctx.createRadialGradient(GAME_W / 2, y + h / 2, 40, GAME_W / 2, y + h / 2, w * 0.62);
    felt.addColorStop(0, '#27935f');
    felt.addColorStop(0.65, '#1b7349');
    felt.addColorStop(1, '#125536');
    ctx.fillStyle = felt;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.045;
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = i % 2 ? '#000' : '#fff';
      ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    // iç gölge
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, r - 4);
    ctx.stroke();
    ctx.restore();
    // ince altın çizgi
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(245,196,81,0.28)';
    roundRect(ctx, x + 10, y + 10, w - 20, h - 20, r - 8);
    ctx.stroke();
    // orta deste yuvası
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(GAME_W / 2, 286, 62, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Menü arka planı: koyu çuha + yumuşak ışık
  canvas(scene, 'menu-bg', GAME_W * S, GAME_H * S, (ctx) => {
    ctx.scale(S, S);
    const bg = ctx.createRadialGradient(GAME_W / 2, 220, 60, GAME_W / 2, GAME_H / 2, GAME_W * 0.8);
    bg.addColorStop(0, '#22845a');
    bg.addColorStop(0.45, '#135437');
    bg.addColorStop(1, '#061a12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.globalAlpha = 0.04;
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = i % 2 ? '#000' : '#fff';
      ctx.fillRect(Math.random() * GAME_W, Math.random() * GAME_H, 1.5, 1.5);
    }
  });

  // Ahşap ıstaka
  const B = RACK.board;
  canvas(scene, 'rack', B.w * S, B.h * S, (ctx) => {
    ctx.scale(S, S);
    roundRect(ctx, 0, 0, B.w, B.h, 20);
    const g = ctx.createLinearGradient(0, 0, 0, B.h);
    g.addColorStop(0, '#a56b38');
    g.addColorStop(1, '#6a3c1b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = '#2b1505';
    for (let yy = 4; yy < B.h; yy += 6) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(B.w * 0.33, yy + 4, B.w * 0.66, yy - 4, B.w, yy + 2);
      ctx.stroke();
    }
    ctx.restore();
    // raflar
    for (const ry of RACK.rowY) {
      const shelfY = ry - B.y + 44;
      const sg = ctx.createLinearGradient(0, shelfY, 0, shelfY + 9);
      sg.addColorStop(0, '#3e220c');
      sg.addColorStop(1, '#2a1607');
      ctx.fillStyle = sg;
      roundRect(ctx, 10, shelfY, B.w - 20, 9, 4);
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,220,170,0.25)';
    roundRect(ctx, 1, 1, B.w - 2, B.h - 2, 20);
    ctx.stroke();
  });
}
