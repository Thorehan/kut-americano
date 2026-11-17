/** Sabit tasarım çözünürlüğü (Scale.FIT ile ekrana sığdırılır). */
export const GAME_W = 1280;
export const GAME_H = 720;

export const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const COLORS_UI = {
  panel: 0x0a2a1f,
  panelStroke: 0x3f7a5f,
  gold: 0xf2c14e,
  goldText: '#f2c14e',
  cream: '#f3e9cf',
  muted: '#a9c4b5',
  green: 0x2f8f57,
  red: 0xb23a32,
  blue: 0x2b5fa8,
  teamA: 0x2b7fd8,
  teamB: 0xd8562b,
};

/** Istaka: 2 sıra × 15 yuva */
export const RACK = {
  cols: 15,
  rows: 2,
  slotW: 56,
  x0: 44,
  rowY: [604, 680],
  board: { x: 22, y: 556, w: 904, h: 160 },
  scale: 0.5,
};

export const POS = {
  deck: { x: 210, y: 470 },
  myDiscard: { x: 950, y: 470 },
  stage: { x0: 290, x1: 880, y: 470 },
  meldArea: { x0: 196, x1: 1090, y0: 126, y1: 420 },
  myInfo: { x: 1135, y: 470 },
  hint: { x: 470, y: 534 },
  toast: { x: 640, y: 104 },
};

/** Koltuklar: 0 = sen (alt), 1 = sağ, 2 = üst, 3 = sol. Sıra saat yönünün tersine: 0 → 1 → 2 → 3. */
export const SEAT_PANEL = [
  { x: 0, y: 0 },
  { x: 1190, y: 300 },
  { x: 640, y: 44 },
  { x: 92, y: 300 },
];

/** Her oyuncunun attığı taşlar sağındaki (sıradaki) oyuncuya doğru durur. */
export const DISCARD_POS = [
  { x: 950, y: 470 },
  { x: 1180, y: 160 },
  { x: 100, y: 160 },
  { x: 92, y: 470 },
];
