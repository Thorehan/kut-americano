/**
 * Dünya koordinatları 1280×720 tasarım alanıdır. Tuval RENDER_SCALE kat büyük çizilir ve
 * kamera yakınlaştırmasıyla bu alana oturtulur → yazılar ve taşlar telefonda da keskin kalır.
 */
export const GAME_W = 1280;
export const GAME_H = 720;
export const RENDER_SCALE = 1.5;
export const TEXT_RES = 2;

export const FONT = 'Nunito, "Segoe UI", Roboto, Arial, sans-serif';

/**
 * "Çini" teması: gece turkuazı zemin, safran vurgu, krem yazı. Butonların malzemeleri
 * ui/Button.ts'de; buradaki renk kodları buton renk anahtarı olarak da kullanılır.
 */
export const UI = {
  bg: 0x0a2a2e,
  panel: 0x113a3f,
  panelHi: 0x1c5158,
  stroke: 0x4cc0b2,
  gold: 0xffc845,
  goldHex: '#ffc845',
  cream: '#fff4dc',
  muted: '#a9d2cb',
  white: '#ffffff',
  green: 0x2e9a5c,
  greenHex: '#7ee2a0',
  red: 0xc0453a,
  redHex: '#ff9c8f',
  blue: 0x2d68b8,
  amber: 0x8a6420,
  slate: 0x31574a,
  teamA: 0x3b8fe6,
  teamB: 0xe8743b,
};

/** Masa (çuha) alanı. */
export const TABLE = { x: 150, y: 76, w: 980, h: 424, r: 46 };

/** Orta deste — her zaman masanın tam ortasında. */
export const DECK = { x: 640, y: 286 };

/** Istaka: 2 sıra × 15 yuva */
export const RACK = {
  cols: 15,
  rows: 2,
  slotW: 60,
  x0: 24,
  rowY: [572, 660],
  board: { x: 12, y: 516, w: 924, h: 198 },
  scale: 0.56,
};

export const BTN = { cols: [1032, 1190], rows: [551, 613, 675], w: 150, h: 54 };

/** Koltuklar: 0 = sen (alt), 1 = sağ, 2 = üst, 3 = sol. Sıra: 0 → 1 → 2 → 3. */
export const SEAT_ANCHOR = [
  { x: 474, y: 600 },
  { x: 1206, y: 286 },
  { x: 640, y: 40 },
  { x: 74, y: 286 },
];

/** Atılan taşlar, sıradaki oyuncuya bakan köşede durur. */
export const DISCARD_POS = [
  { x: 1074, y: 444 },
  { x: 1074, y: 130 },
  { x: 206, y: 130 },
  { x: 206, y: 444 },
];
export const DISCARD_SCALE = 0.44;

export interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Her oyuncunun açtığı perler kendi önündeki alanda durur. */
export const MELD_ZONES: Zone[] = [
  { x0: 268, x1: 1012, y0: 398, y1: 490 },
  { x0: 808, x1: 1122, y0: 178, y1: 396 },
  { x0: 268, x1: 1012, y0: 84, y1: 176 },
  { x0: 158, x1: 472, y0: 178, y1: 396 },
];

export const STATUS = { x: 640, y: 503 };
