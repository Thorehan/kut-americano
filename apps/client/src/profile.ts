/**
 * Oyuncu profili: isim, avatar, Küt Puanı (KP), XP/seviye, istatistikler, rozetler,
 * temalar, günlük ödül ve video sınırları. Şimdilik cihazda (localStorage) saklanır.
 * KP sadece kazanılır; satılmaz, gerçek paraya çevrilmez.
 */

/** Küt Puanı kısaltması (simge emoji değil, çizilmiş "coin" dokusu — her cihazda aynı görünür). */
export const KP = 'KP';

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  roundsPlayed: number;
  roundsWon: number;
  okeyFinishes: number;
  jokersTaken: number;
  islekPenalties: number;
  onlineGames: number;
  bestScore: number | null;
}

export interface Profile {
  name: string;
  avatar: string;
  color: number;
  kp: number;
  xp: number;
  stats: Stats;
  badges: string[];
  ownedThemes: string[];
  tileTheme: string;
  feltTheme: string;
  daily: { last: string; streak: number };
  videos: { day: string; count: number };
}

export const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🐻', '🐼', '🐸', '🦉', '🐙', '🦄', '🐢', '🐝', '😎', '🤠', '👑', '🎩'];
export const AVATAR_COLORS = [0x3b8fe6, 0xd9534f, 0x8e5bd6, 0xe0962a, 0x2e9a5c, 0x1fb5b0, 0xe05d9a, 0x5b6b7a];

export interface ThemeItem {
  id: string;
  kind: 'tile' | 'felt';
  name: string;
  price: number;
}

export const THEMES: ThemeItem[] = [
  { id: 'tile-klasik', kind: 'tile', name: 'Klasik', price: 0 },
  { id: 'tile-gece', kind: 'tile', name: 'Gece', price: 1000 },
  { id: 'tile-mermer', kind: 'tile', name: 'Mermer', price: 1500 },
  { id: 'tile-altin', kind: 'tile', name: 'Altın', price: 3000 },
  { id: 'felt-yesil', kind: 'felt', name: 'Yeşil Çuha', price: 0 },
  { id: 'felt-lacivert', kind: 'felt', name: 'Lacivert', price: 800 },
  { id: 'felt-bordo', kind: 'felt', name: 'Bordo', price: 800 },
  { id: 'felt-mor', kind: 'felt', name: 'Mor', price: 800 },
];

export interface Badge {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
}

export const BADGES: Badge[] = [
  { id: 'tutorial', name: 'İlk Adım', desc: 'Öğreticiyi bitir', icon: '🎓', reward: 300 },
  { id: 'firstWin', name: 'İlk Zafer', desc: 'Bir oyunu birinci bitir', icon: '🏆', reward: 300 },
  { id: 'roundWin', name: 'Bitirici', desc: 'Bir eli bitir', icon: '✅', reward: 100 },
  { id: 'okeyFinish', name: 'Okeyci', desc: 'Okey ile bitir', icon: '🃏', reward: 200 },
  { id: 'jokerThief', name: 'Okey Avcısı', desc: 'Rakibin okeyini al', icon: '🦅', reward: 200 },
  { id: 'online', name: 'Masada', desc: 'Bir online oyunu bitir', icon: '🌐', reward: 200 },
  { id: 'games10', name: 'Müdavim', desc: '10 oyun bitir', icon: '☕', reward: 300 },
  { id: 'video', name: 'Destekçi', desc: 'Bir ödüllü video izle', icon: '🎬', reward: 100 },
];

export const DAILY_REWARDS = [100, 150, 200, 250, 300, 400, 500];
export const VIDEO_REWARD = 100;
export const VIDEO_DAILY_LIMIT = 5;
export const ROUND_WIN_KP = 25;
export const ROUND_WIN_OKEY_KP = 50;
export const PLACE_KP = [300, 150, 75, 25];
export const PLACE_XP = [100, 50, 25, 10];

const KEY = 'kut-profile';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function yesterday(): string {
  const d = new Date(Date.now() - 86_400_000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function defaults(): Profile {
  let name = 'Oyuncu';
  try {
    name = localStorage.getItem('kut-name') || `Oyuncu ${100 + Math.floor(Math.random() * 900)}`;
  } catch {
    /* depolama yok */
  }
  return {
    name,
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    color: AVATAR_COLORS[0],
    kp: 0,
    xp: 0,
    stats: { gamesPlayed: 0, gamesWon: 0, roundsPlayed: 0, roundsWon: 0, okeyFinishes: 0, jokersTaken: 0, islekPenalties: 0, onlineGames: 0, bestScore: null },
    badges: [],
    ownedThemes: ['tile-klasik', 'felt-yesil'],
    tileTheme: 'tile-klasik',
    feltTheme: 'felt-yesil',
    daily: { last: '', streak: 0 },
    videos: { day: '', count: 0 },
  };
}

let cache: Profile | null = null;
type Listener = (p: Profile) => void;
const listeners = new Set<Listener>();

export function profile(): Profile {
  if (cache) return cache;
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      cache = { ...base, ...p, stats: { ...base.stats, ...p.stats }, daily: { ...base.daily, ...p.daily }, videos: { ...base.videos, ...p.videos } };
    }
  } catch {
    /* bozuk kayıt: varsayılan */
  }
  cache ??= base;
  return cache;
}

export function saveProfile() {
  const p = profile();
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    localStorage.setItem('kut-name', p.name); // lobi ve eski kod yolu için
  } catch {
    /* depolama yok */
  }
  for (const l of listeners) l(p);
}

export function onProfile(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ------------------------------------------------------------------ seviye

/** Seviye n için gereken toplam XP: 100·(n-1)·n/2 → 0, 100, 300, 600, 1000… */
export function xpForLevel(n: number): number {
  return (100 * (n - 1) * n) / 2;
}

export function levelOf(xp: number): number {
  let n = 1;
  while (xpForLevel(n + 1) <= xp) n++;
  return n;
}

export interface Gain {
  kp: number;
  xp: number;
  levelUp?: number;
  badges: Badge[];
}

/** KP/XP ekle; seviye atlarsa seviye ödülünü de verir. */
export function grant(kp: number, xp = 0): Gain {
  const p = profile();
  const before = levelOf(p.xp);
  p.kp += kp;
  p.xp += xp;
  const after = levelOf(p.xp);
  const g: Gain = { kp, xp, badges: [] };
  if (after > before) {
    let bonus = 0;
    for (let l = before + 1; l <= after; l++) bonus += 100 * l;
    p.kp += bonus;
    g.kp += bonus;
    g.levelUp = after;
  }
  saveProfile();
  return g;
}

export function spend(kp: number): boolean {
  const p = profile();
  if (p.kp < kp) return false;
  p.kp -= kp;
  saveProfile();
  return true;
}

/** Rozeti ver (daha önce yoksa) ve ödülünü ekle. */
export function award(id: string): Badge | null {
  const p = profile();
  if (p.badges.includes(id)) return null;
  const b = BADGES.find((x) => x.id === id);
  if (!b) return null;
  p.badges.push(id);
  p.kp += b.reward;
  saveProfile();
  return b;
}

// ------------------------------------------------------------------ günlük ödül / video

export function dailyAvailable(): { amount: number; day: number } | null {
  const p = profile();
  if (p.daily.last === today()) return null;
  const streak = p.daily.last === yesterday() ? p.daily.streak + 1 : 1;
  const day = ((streak - 1) % DAILY_REWARDS.length) + 1;
  return { amount: DAILY_REWARDS[day - 1], day };
}

export function claimDaily(multiplier = 1): Gain | null {
  const d = dailyAvailable();
  if (!d) return null;
  const p = profile();
  p.daily = { last: today(), streak: p.daily.last === yesterday() ? p.daily.streak + 1 : 1 };
  return grant(d.amount * multiplier);
}

export function videosLeft(): number {
  const p = profile();
  return p.videos.day === today() ? Math.max(0, VIDEO_DAILY_LIMIT - p.videos.count) : VIDEO_DAILY_LIMIT;
}

export function countVideo() {
  const p = profile();
  if (p.videos.day !== today()) p.videos = { day: today(), count: 0 };
  p.videos.count++;
  saveProfile();
}

// ------------------------------------------------------------------ temalar

export function buyTheme(id: string): 'ok' | 'owned' | 'poor' {
  const p = profile();
  const t = THEMES.find((x) => x.id === id);
  if (!t) return 'poor';
  if (p.ownedThemes.includes(id)) return 'owned';
  if (!spend(t.price)) return 'poor';
  p.ownedThemes.push(id);
  equipTheme(id);
  return 'ok';
}

export function equipTheme(id: string) {
  const p = profile();
  const t = THEMES.find((x) => x.id === id);
  if (!t || !p.ownedThemes.includes(id)) return;
  if (t.kind === 'tile') p.tileTheme = id;
  else p.feltTheme = id;
  saveProfile();
}
