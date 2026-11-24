/**
 * Uygulama ikonu ve açılış ekranı üretici (geliştirme aracı, oyuna dahil değil).
 *
 *   npm run dev -w @kut/client         → http://localhost:5173/tools/icons.html   (önizleme)
 *   node apps/client/tools/save-icons.cjs  + sayfayı ?kaydet ile aç             (dosyalara yazar)
 *
 * Tasarım: gece turkuazı zemin + soluk çini yıldız deseni; ortada hafif eğik krem okey taşı,
 * üstünde renkli "KÜT" (K kırmızı · Ü mavi · T siyah), altında safran çini yıldızı.
 * Açılış ekranı: aynı zemin, ortada menüdeki K-Ü-T taş logosu.
 */
import '@fontsource/nunito/900.css';

const FONT = 'Nunito, "Segoe UI", Arial, sans-serif';
const C = { red: '#d0352b', blue: '#1f63c4', black: '#1d1d1f', saffron: '#ffc845', saffronDark: '#bd6d06', ink: '#06191b' };

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function star(c: Ctx, cx: number, cy: number, r: number, inner = 0.62) {
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** Gece turkuazı zemin + çini yıldız kafesi + ortada safran parıltı. */
function background(c: Ctx, w: number, h: number, pattern = true) {
  const m = Math.max(w, h);
  const g = c.createRadialGradient(w / 2, h / 2, m * 0.05, w / 2, h / 2, m * 0.75);
  g.addColorStop(0, '#1f6b70');
  g.addColorStop(0.55, '#0f3e43');
  g.addColorStop(1, '#061d20');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  if (pattern) {
    const cell = Math.min(w, h) / 3.4;
    const r = cell * 0.27;
    c.save();
    c.strokeStyle = 'rgba(255,244,220,0.07)';
    c.lineWidth = Math.max(1, Math.min(w, h) / 220);
    for (let gy = -1; gy <= h / (cell * 0.75) + 1; gy++) {
      for (let gx = -1; gx <= w / cell + 1; gx++) {
        const cx = gx * cell + (gy % 2 ? cell / 2 : 0) + ((w % cell) / 2);
        const cy = gy * cell * 0.75 + ((h % (cell * 0.75)) / 2);
        star(c, cx, cy, r);
        c.stroke();
        c.beginPath();
        c.moveTo(cx + r, cy);
        c.lineTo(cx + cell / 2, cy - r * 0.45);
        c.lineTo(cx + cell - r, cy);
        c.lineTo(cx + cell / 2, cy + r * 0.45);
        c.closePath();
        c.stroke();
      }
    }
    c.restore();
  }
  const glow = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5);
  glow.addColorStop(0, 'rgba(255,200,69,0.22)');
  glow.addColorStop(1, 'rgba(255,200,69,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
}

interface TileOpts {
  letters: [string, string][];
  /** Tek renk (Android 13 temalı ikon): beyaz siluet, yazı ve yıldız oyuk. */
  mono?: boolean;
  shadow?: boolean;
}

/** Krem okey taşı: (cx, cy) merkez, w genişlik, açı derece. */
function tile(c: Ctx, cx: number, cy: number, w: number, angle: number, o: TileOpts) {
  const h = w * 1.38;
  const r = w * 0.14;
  const t = w * 0.075; // kalınlık
  c.save();
  c.translate(cx, cy);
  c.rotate((angle * Math.PI) / 180);
  const x = -w / 2;
  const y = -h / 2;
  if (o.mono) {
    c.fillStyle = '#ffffff';
    rr(c, x, y, w, h, r);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
  } else {
    if (o.shadow !== false) {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.45)';
      c.shadowBlur = w * 0.16;
      c.shadowOffsetY = w * 0.06;
      rr(c, x, y, w, h, r);
      c.fillStyle = C.ink;
      c.fill();
      c.restore();
    }
    // koyu dış hat
    rr(c, x - w * 0.025, y - w * 0.025, w * 1.05, h + w * 0.05, r * 1.15);
    c.fillStyle = C.ink;
    c.fill();
    // gövde kalınlığı
    rr(c, x, y, w, h, r);
    c.fillStyle = '#b39a6a';
    c.fill();
    // yüz
    rr(c, x, y, w, h - t, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fffdf7');
    g.addColorStop(0.7, '#f6edd6');
    g.addColorStop(1, '#ecdfbf');
    c.fillStyle = g;
    c.fill();
    // üst parlama
    rr(c, x + w * 0.08, y + w * 0.05, w * 0.84, w * 0.13, w * 0.065);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fill();
  }
  // harfler (yanyana, ölçülerek ortalanır)
  const fs = o.letters.length > 1 ? w * 0.41 : w * 0.66;
  c.font = `900 ${fs}px ${FONT}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const gap = o.letters.length > 1 ? -w * 0.01 : 0;
  const widths = o.letters.map(([ch]) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (o.letters.length - 1);
  let tx = -total / 2;
  const ty = y + h * (o.letters.length > 1 ? 0.4 : 0.42);
  o.letters.forEach(([ch, col], i) => {
    c.fillStyle = o.mono ? '#000' : col;
    c.fillText(ch, tx, ty);
    tx += widths[i] + gap;
  });
  // okey damlasının yerinde çini yıldızı
  const sy = y + h * 0.75;
  const sr = w * 0.13;
  if (o.mono) {
    star(c, 0, sy, sr, 0.68);
    c.fill();
  } else {
    star(c, 0, sy + sr * 0.12, sr * 1.12, 0.68);
    c.fillStyle = C.ink;
    c.fill();
    star(c, 0, sy + sr * 0.1, sr, 0.68);
    c.fillStyle = C.saffronDark;
    c.fill();
    star(c, 0, sy - sr * 0.04, sr, 0.68);
    c.fillStyle = C.saffron;
    c.fill();
  }
  c.restore();
}

const KUT: [string, string][] = [
  ['K', C.red],
  ['Ü', C.blue],
  ['T', C.black],
];

// ------------------------------------------------------------ görseller

type Draw = (c: Ctx, w: number, h: number) => void;

/** Tam kare ikon (Play 512, iOS 1024): kenara kadar zemin, ortada taş. */
const iconSquare: Draw = (c, w) => {
  background(c, w, w);
  tile(c, w / 2, w * 0.5, w * 0.5, -6, { letters: KUT });
};

/** Eski Android ikonu (Android 7): yuvarlatılmış kare. */
const iconLegacy: Draw = (c, w) => {
  c.save();
  rr(c, w * 0.04, w * 0.04, w * 0.92, w * 0.92, w * 0.2);
  c.clip();
  background(c, w, w);
  c.restore();
  tile(c, w / 2, w * 0.5, w * 0.48, -6, { letters: KUT });
};

/** Eski Android yuvarlak ikon. */
const iconRound: Draw = (c, w) => {
  c.save();
  c.beginPath();
  c.arc(w / 2, w / 2, w * 0.46, 0, Math.PI * 2);
  c.clip();
  background(c, w, w);
  c.restore();
  tile(c, w / 2, w * 0.5, w * 0.44, -6, { letters: KUT });
};

/** Uyarlanabilir ikon ön planı (108 dp tuval, içerik 66 dp güvenli dairede). */
const adaptiveFg: Draw = (c, w) => {
  tile(c, w / 2, w * 0.5, w * (38 / 108), -6, { letters: KUT });
};

/** Uyarlanabilir ikon arka planı. */
const adaptiveBg: Draw = (c, w) => background(c, w, w);

/** Android 13 temalı ikon (tek renk siluet). */
const adaptiveMono: Draw = (c, w) => {
  tile(c, w / 2, w * 0.5, w * (38 / 108), -6, { letters: KUT, mono: true });
};

/** Açılış ekranı: zemin + K-Ü-T taş logosu (menüdeki gibi üç taş). */
const splash: Draw = (c, w, h) => {
  background(c, w, h);
  const tw = Math.min(w, h) * 0.2;
  const cy = h / 2;
  const step = tw * 1.12;
  KUT.forEach(([ch, col], i) => {
    tile(c, w / 2 + (i - 1) * step, cy + Math.abs(i - 1) * tw * 0.06, tw, (i - 1) * 5, { letters: [[ch, col]] });
  });
};

interface Job {
  path: string;
  w: number;
  h: number;
  draw: Draw;
}

const RES = 'android/app/src/main/res';
const DENS: [string, number][] = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];
const SPLASH: [string, number, number][] = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];

const jobs: Job[] = [
  { path: '../../store/icon-512.png', w: 512, h: 512, draw: iconSquare },
  { path: '../../store/icon-1024.png', w: 1024, h: 1024, draw: iconSquare },
];
for (const [d, k] of DENS) {
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher.png`, w: 48 * k, h: 48 * k, draw: iconLegacy });
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher_round.png`, w: 48 * k, h: 48 * k, draw: iconRound });
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, w: 108 * k, h: 108 * k, draw: adaptiveFg });
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher_background.png`, w: 108 * k, h: 108 * k, draw: adaptiveBg });
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher_monochrome.png`, w: 108 * k, h: 108 * k, draw: adaptiveMono });
}
for (const [dir, w, h] of SPLASH) jobs.push({ path: `${RES}/${dir}/splash.png`, w, h, draw: splash });

async function run() {
  await document.fonts.load(`900 64px Nunito`);
  const save = new URLSearchParams(location.search).has('kaydet');
  const out = document.getElementById('out')!;
  const status = document.getElementById('status')!;
  let saved = 0;
  for (const j of jobs) {
    const cv = document.createElement('canvas');
    cv.width = j.w;
    cv.height = j.h;
    const c = cv.getContext('2d')!;
    j.draw(c, j.w, j.h);
    const url = cv.toDataURL('image/png');
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = url;
    const cap = document.createElement('figcaption');
    cap.textContent = `${j.path.replace(RES + '/', '')} · ${j.w}×${j.h}`;
    fig.append(img, cap);
    out.append(fig);
    if (save) {
      const r = await fetch('http://127.0.0.1:5199/save', { method: 'POST', body: JSON.stringify({ path: j.path, data: url }) });
      if (r.ok) saved++;
    }
  }
  status.textContent = save ? `${saved}/${jobs.length} dosya kaydedildi.` : `${jobs.length} görsel çizildi (kaydetmek için ?kaydet).`;
  (window as unknown as { __iconsDone: boolean }).__iconsDone = true;
}

void run();
