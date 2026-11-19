import Phaser from 'phaser';
import { COLORS, Color, Tile } from '@kut/core';
import { FONT, GAME_H, GAME_W, RACK, RENDER_SCALE, TABLE } from './layout';
import { profile } from './profile';

/** Taş yüzü temaları (profilde KP ile açılır). */
interface TileStyle {
  body: string;
  face: [string, string, string];
  stroke: string;
  shine: number;
  colors: Record<Color, string>;
  okey: string;
  vein?: string;
}

const BASE_COLORS: Record<Color, string> = { red: '#d0352b', yellow: '#d89a00', blue: '#1f63c4', black: '#1d1d1f' };

export const TILE_STYLES: Record<string, TileStyle> = {
  'tile-klasik': { body: '#b39a6a', face: ['#fffdf7', '#f6edd6', '#ecdfbf'], stroke: 'rgba(140,115,70,0.55)', shine: 0.55, colors: BASE_COLORS, okey: '#18924f' },
  'tile-gece': {
    body: '#0b0f14',
    face: ['#33404e', '#26313d', '#1c242d'],
    stroke: 'rgba(255,255,255,0.18)',
    shine: 0.1,
    colors: { red: '#ff6b5e', yellow: '#ffc93d', blue: '#62b0ff', black: '#eef2f6' },
    okey: '#3ddc84',
  },
  'tile-mermer': {
    body: '#8f99a3',
    face: ['#ffffff', '#f3f5f7', '#e4e8ec'],
    stroke: 'rgba(90,100,110,0.45)',
    shine: 0.6,
    colors: BASE_COLORS,
    okey: '#18924f',
    vein: 'rgba(120,130,140,0.22)',
  },
  'tile-altin': {
    body: '#9c7417',
    face: ['#fff2bf', '#f4d576', '#e2b84a'],
    stroke: 'rgba(120,80,0,0.6)',
    shine: 0.5,
    colors: { red: '#b8231a', yellow: '#7a4b00', blue: '#16489a', black: '#2a1d02' },
    okey: '#0f6e3a',
  },
};

/** Masa çuhası renkleri: [orta, ara, kenar]. */
export const FELT_STYLES: Record<string, [string, string, string]> = {
  'felt-yesil': ['#27935f', '#1b7349', '#125536'],
  'felt-lacivert': ['#2f6bb0', '#1f4c84', '#13315a'],
  'felt-bordo': ['#a83a4a', '#7a2333', '#4d1220'],
  'felt-mor': ['#7a4cb5', '#58338a', '#371f5a'],
};

let style: TileStyle = TILE_STYLES['tile-klasik'];

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
  ctx.fillStyle = style.body;
  ctx.fill();
  // yüz
  roundRect(ctx, 4, 3, w - 8, h - 14, 14);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, style.face[0]);
  g.addColorStop(0.7, style.face[1]);
  g.addColorStop(1, style.face[2]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = style.stroke;
  ctx.stroke();
  if (style.vein) {
    // mermer damarları (her taşta aynı desen — sabit tohum)
    ctx.save();
    roundRect(ctx, 4, 3, w - 8, h - 14, 14);
    ctx.clip();
    ctx.strokeStyle = style.vein;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(4, 20 + i * 32);
      ctx.bezierCurveTo(40, 10 + i * 30, 60, 50 + i * 25, w - 4, 30 + i * 30);
      ctx.stroke();
    }
    ctx.restore();
  }
  // üst parlama
  roundRect(ctx, 10, 7, w - 20, 18, 9);
  ctx.fillStyle = `rgba(255,255,255,${style.shine})`;
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

/** Çizili dokuların hangi temayla çizildiği; tema değişince yeniden çizilir. */
let drawnSig = '';

export function createTextures(scene: Phaser.Scene) {
  const p = profile();
  const sig = `${p.tileTheme}|${p.feltTheme}`;
  if (scene.textures.exists('tile-back') && sig === drawnSig) return;
  drawnSig = sig;
  style = TILE_STYLES[p.tileTheme] ?? TILE_STYLES['tile-klasik'];
  const felt = FELT_STYLES[p.feltTheme] ?? FELT_STYLES['felt-yesil'];

  for (const color of COLORS) {
    for (let v = 1; v <= 13; v++) {
      canvas(scene, `tile-${color}-${v}`, TILE_W, TILE_H, (ctx) => {
        tileBody(ctx);
        ctx.fillStyle = style.colors[color];
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
    drawRosette(ctx, TILE_W / 2, 60, 42, style.okey, style.face[0]);
    ctx.fillStyle = style.okey;
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

  // Küt Puanı jetonu
  canvas(scene, 'coin', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(24, 22, 4, 32, 32, 30);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.55, '#f5c451');
    g.addColorStop(1, '#b8860b');
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8a6200';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(32, 32, 21, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(138,98,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#7a5200';
    ctx.font = `900 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', 32, 34);
  });

  // Kıvılcım (okeyle bitiş kutlaması)
  canvas(scene, 'spark', 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,214,102,0.95)');
    g.addColorStop(1, 'rgba(255,170,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
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
    const feltG = ctx.createRadialGradient(GAME_W / 2, y + h / 2, 40, GAME_W / 2, y + h / 2, w * 0.62);
    feltG.addColorStop(0, felt[0]);
    feltG.addColorStop(0.65, felt[1]);
    feltG.addColorStop(1, felt[2]);
    ctx.fillStyle = feltG;
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

/** Mağaza önizlemeleri: her taş teması için kırmızı 7, her masa rengi için bir çuha parçası. */
export function createThemePreviews(scene: Phaser.Scene) {
  for (const [id, st] of Object.entries(TILE_STYLES)) {
    const key = `preview-${id}`;
    if (scene.textures.exists(key)) continue;
    canvas(scene, key, TILE_W, TILE_H, (ctx) => {
      const prev = style;
      style = st;
      tileBody(ctx);
      ctx.fillStyle = st.colors.red;
      ctx.font = `900 72px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('7', TILE_W / 2, 60);
      ctx.beginPath();
      ctx.arc(TILE_W / 2, 108, 9.5, 0, Math.PI * 2);
      ctx.fill();
      style = prev;
    });
  }
  for (const [id, f] of Object.entries(FELT_STYLES)) {
    const key = `preview-${id}`;
    if (scene.textures.exists(key)) continue;
    canvas(scene, key, 200, 120, (ctx) => {
      roundRect(ctx, 0, 0, 200, 120, 16);
      ctx.fillStyle = '#5c3416';
      ctx.fill();
      roundRect(ctx, 8, 8, 184, 104, 12);
      const g = ctx.createRadialGradient(100, 60, 10, 100, 60, 110);
      g.addColorStop(0, f[0]);
      g.addColorStop(0.65, f[1]);
      g.addColorStop(1, f[2]);
      ctx.fillStyle = g;
      ctx.fill();
    });
  }
}
