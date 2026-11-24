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
  ciftOkeyFinishes: number;
  eldenBitmeWins: number;
  ciftEliWins: number;
  teamWins: number;
  tasksDone: number;
  themesBought: number;
  /** Kural bazında: oynanan el, kuralı açtığın el, bitirdiğin el (anahtar: kural adı). */
  perContract: Record<string, ContractStat>;
}

export interface ContractStat {
  played: number;
  opened: number;
  won: number;
}

/** Bir görevin bugünkü / bu haftaki ilerlemesi. */
export interface TaskProgress {
  id: string;
  progress: number;
  claimed: boolean;
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
  /** Taş arkası deseni ve avatar çerçevesi (kozmetik). */
  backTheme: string;
  frame: string;
  /** Günlük (her gün) ve haftalık (pazartesi) görevler. */
  tasks: { day: string; daily: TaskProgress[]; week: string; weekly: TaskProgress[] };
  daily: { last: string; streak: number };
  videos: { day: string; count: number };
  /** Online maçtan çıkış cezaları: art arda çıkışlarda ceza büyür, 24 saat temiz kalınca sıfırlanır. */
  leaves: { count: number; last: number; lockUntil: number };
}

export const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🐻', '🐼', '🐸', '🦉', '🐙', '🦄', '🐢', '🐝', '😎', '🤠', '👑', '🎩'];
export const AVATAR_COLORS = [0x3b8fe6, 0xd9534f, 0x8e5bd6, 0xe0962a, 0x2e9a5c, 0x1fb5b0, 0xe05d9a, 0x5b6b7a];

export type ThemeKind = 'tile' | 'felt' | 'back' | 'frame';

export interface ThemeItem {
  id: string;
  kind: ThemeKind;
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
  { id: 'back-cini', kind: 'back', name: 'Çini', price: 0 },
  { id: 'back-lacivert', kind: 'back', name: 'İznik Mavisi', price: 600 },
  { id: 'back-nar', kind: 'back', name: 'Nar', price: 600 },
  { id: 'back-altin', kind: 'back', name: 'Altın Yıldız', price: 1500 },
  { id: 'frame-yok', kind: 'frame', name: 'Sade', price: 0 },
  { id: 'frame-cini', kind: 'frame', name: 'Çini Halka', price: 500 },
  { id: 'frame-lale', kind: 'frame', name: 'Lale', price: 900 },
  { id: 'frame-altin', kind: 'frame', name: 'Altın Yıldız', price: 2000 },
];

/** Profilde temanın tutulduğu alan. */
export function themeSlot(kind: ThemeKind): 'tileTheme' | 'feltTheme' | 'backTheme' | 'frame' {
  return kind === 'tile' ? 'tileTheme' : kind === 'felt' ? 'feltTheme' : kind === 'back' ? 'backTheme' : 'frame';
}

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
  { id: 'ciftOkey', name: 'Çifte Kavrulmuş', desc: 'Çift okeyle bit', icon: '🃏', reward: 500 },
  { id: 'eldenBitme', name: 'Tek Hamle', desc: "Elden Bitme'yi sen bitir", icon: '⚡', reward: 400 },
  { id: 'ciftEli', name: 'Çiftçi', desc: "Çift Eli'ni sen bitir", icon: '✳', reward: 400 },
  { id: 'teamWin', name: 'Ortaklık', desc: 'Takım oyununu kazan', icon: '🤝', reward: 300 },
  { id: 'shortWin', name: 'Çabuk El', desc: 'Kısa oyunu birinci bitir', icon: '⚡', reward: 200 },
  { id: 'cleanGame', name: 'Temiz Masa', desc: 'Bir oyunu hiç işlek cezası almadan bitir', icon: '✔', reward: 300 },
  { id: 'jokerThief5', name: 'Okey Kartalı', desc: 'Rakiplerden toplam 5 okey al', icon: '🦅', reward: 400 },
  { id: 'wins10', name: 'Usta', desc: '10 oyunu birinci bitir', icon: '🏆', reward: 600 },
  { id: 'games50', name: 'Kahvehane Demirbaşı', desc: '50 oyun bitir', icon: '☕', reward: 800 },
  { id: 'allRules', name: 'Kural Hocası', desc: 'Her kuralda en az bir el bitir', icon: '📖', reward: 1000 },
  { id: 'streak7', name: 'Sadık Oyuncu', desc: '7 gün üst üste giriş yap', icon: '📅', reward: 500 },
  { id: 'level5', name: 'Yükselen', desc: '5. seviyeye ulaş', icon: '⭐', reward: 300 },
  { id: 'level10', name: 'Kıdemli', desc: '10. seviyeye ulaş', icon: '⭐', reward: 800 },
  { id: 'collector', name: 'Koleksiyoncu', desc: 'Mağazadan bir tema aç', icon: '🛍', reward: 200 },
  { id: 'tasks10', name: 'Görev Adamı', desc: '10 görev tamamla', icon: '✔', reward: 400 },
];

export const DAILY_REWARDS = [100, 150, 200, 250, 300, 400, 500];
export const VIDEO_REWARD = 100;
export const VIDEO_DAILY_LIMIT = 5;
export const ROUND_WIN_KP = 25;
export const ROUND_WIN_OKEY_KP = 50;
export const PLACE_KP = [300, 150, 75, 25];
export const PLACE_XP = [100, 50, 25, 10];

const KEY = 'kut-profile';

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Haftanın anahtarı: o haftanın pazartesi günü (görevler pazartesi yenilenir). */
export function thisWeek(): string {
  const d = new Date();
  const back = (d.getDay() + 6) % 7; // pazartesi = 0
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `${m.getFullYear()}-${m.getMonth() + 1}-${m.getDate()}`;
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
    stats: {
      gamesPlayed: 0,
      gamesWon: 0,
      roundsPlayed: 0,
      roundsWon: 0,
      okeyFinishes: 0,
      jokersTaken: 0,
      islekPenalties: 0,
      onlineGames: 0,
      bestScore: null,
      ciftOkeyFinishes: 0,
      eldenBitmeWins: 0,
      ciftEliWins: 0,
      teamWins: 0,
      tasksDone: 0,
      themesBought: 0,
      perContract: {},
    },
    badges: [],
    ownedThemes: ['tile-klasik', 'felt-yesil', 'back-cini', 'frame-yok'],
    tileTheme: 'tile-klasik',
    feltTheme: 'felt-yesil',
    backTheme: 'back-cini',
    frame: 'frame-yok',
    tasks: { day: '', daily: [], week: '', weekly: [] },
    daily: { last: '', streak: 0 },
    videos: { day: '', count: 0 },
    leaves: { count: 0, last: 0, lockUntil: 0 },
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
      cache = {
        ...base,
        ...p,
        stats: { ...base.stats, ...p.stats, perContract: { ...p.stats?.perContract } },
        daily: { ...base.daily, ...p.daily },
        videos: { ...base.videos, ...p.videos },
        leaves: { ...base.leaves, ...p.leaves },
        tasks: { ...base.tasks, ...p.tasks },
        // eski kayıtlarda yeni ücretsiz kozmetikler yok
        ownedThemes: [...new Set([...base.ownedThemes, ...(p.ownedThemes ?? [])])],
      };
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

// ------------------------------------------------------------------ maçtan çıkış cezası

/** Art arda çıkışlarda: 1., 2., 3.+ çıkış. KP kesintisi ve online kilidi (dakika). */
export const LEAVE_KP = [100, 250, 500];
export const LEAVE_LOCK_MIN = [1, 5, 10];
/** Bu kadar süre maç terk etmeyen oyuncunun ceza basamağı sıfırlanır. */
const LEAVE_RESET_MS = 24 * 3_600_000;

function leaveStep(): number {
  const l = profile().leaves;
  const count = Date.now() - l.last > LEAVE_RESET_MS ? 0 : l.count;
  return Math.min(count, LEAVE_KP.length - 1);
}

/** Şimdi çıkarsa alacağı ceza (onay sorusunda gösterilir). */
export function leavePenalty(): { kp: number; min: number } {
  const i = leaveStep();
  return { kp: Math.min(LEAVE_KP[i], profile().kp), min: LEAVE_LOCK_MIN[i] };
}

/** Online maçı terk etti: KP kesilir (sıfırın altına inmez), online oyun bir süre kilitlenir. */
export function recordLeave(): { kp: number; min: number } {
  const pen = leavePenalty();
  const p = profile();
  const i = leaveStep();
  p.kp -= pen.kp;
  p.leaves = { count: i + 1, last: Date.now(), lockUntil: Date.now() + pen.min * 60_000 };
  saveProfile();
  return pen;
}

/** Online kilidinin kalan süresi (ms); 0 = serbest. */
export function onlineLockLeft(): number {
  return Math.max(0, profile().leaves.lockUntil - Date.now());
}

// ------------------------------------------------------------------ temalar

export function buyTheme(id: string): 'ok' | 'owned' | 'poor' {
  const p = profile();
  const t = THEMES.find((x) => x.id === id);
  if (!t) return 'poor';
  if (p.ownedThemes.includes(id)) return 'owned';
  if (!spend(t.price)) return 'poor';
  p.ownedThemes.push(id);
  p.stats.themesBought++;
  equipTheme(id);
  return 'ok';
}

export function equipTheme(id: string) {
  const p = profile();
  const t = THEMES.find((x) => x.id === id);
  if (!t || !p.ownedThemes.includes(id)) return;
  p[themeSlot(t.kind)] = id;
  saveProfile();
}
