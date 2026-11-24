import { CONTRACTS } from '@kut/core';
import { Badge, Gain, TaskProgress, award, grant, levelOf, profile, saveProfile, thisWeek, today } from './profile';

/**
 * İlerleme: görevler (günlük kolay / haftalık zor) ve sayaçla açılan rozetler.
 * Oyun olayları record() ile gelir; aynı olay görevi ilerletir, rozet koşullarına bakılır.
 */

export type ProgressKey =
  | 'roundPlayed'
  | 'roundWon'
  | 'opened'
  | 'meldLaid'
  | 'tileAdded'
  | 'gameDone'
  | 'gameWon'
  | 'video'
  | 'okeyFinish'
  | 'jokerTaken'
  | 'eldenBitmeWin'
  | 'ciftEliWin';

export interface TaskDef {
  id: string;
  text: string;
  key: ProgressKey;
  target: number;
  reward: number;
  weekly?: boolean;
}

/** Günlük: kolay, bir-iki oyunda biter. */
export const DAILY_TASKS: TaskDef[] = [
  { id: 'd-rounds3', text: '3 el oyna', key: 'roundPlayed', target: 3, reward: 60 },
  { id: 'd-win1', text: '1 el bitir', key: 'roundWon', target: 1, reward: 80 },
  { id: 'd-open2', text: '2 elde kuralı aç', key: 'opened', target: 2, reward: 60 },
  { id: 'd-meld4', text: '4 kez per diz', key: 'meldLaid', target: 4, reward: 60 },
  { id: 'd-add4', text: '4 taş işle', key: 'tileAdded', target: 4, reward: 60 },
  { id: 'd-game1', text: '1 oyun bitir', key: 'gameDone', target: 1, reward: 100 },
  { id: 'd-video1', text: '1 ödüllü video izle', key: 'video', target: 1, reward: 50 },
];

/** Haftalık: zor olanlar (ör. okeyle bitmek). */
export const WEEKLY_TASKS: TaskDef[] = [
  { id: 'w-okey', text: 'Okeyle bit', key: 'okeyFinish', target: 1, reward: 400, weekly: true },
  { id: 'w-games5', text: '5 oyun bitir', key: 'gameDone', target: 5, reward: 500, weekly: true },
  { id: 'w-wins2', text: '2 oyunu birinci bitir', key: 'gameWon', target: 2, reward: 600, weekly: true },
  { id: 'w-swap3', text: 'Rakipten 3 okey al', key: 'jokerTaken', target: 3, reward: 400, weekly: true },
  { id: 'w-rounds25', text: '25 el oyna', key: 'roundPlayed', target: 25, reward: 400, weekly: true },
  { id: 'w-elden', text: "Elden Bitme'yi sen bitir", key: 'eldenBitmeWin', target: 1, reward: 500, weekly: true },
  { id: 'w-cift', text: "Çift Eli'ni sen bitir", key: 'ciftEliWin', target: 1, reward: 500, weekly: true },
];

const ALL = [...DAILY_TASKS, ...WEEKLY_TASKS];
export const taskDef = (id: string) => ALL.find((t) => t.id === id);

/** Tarihten türetilen sıra: o gün/hafta herkes için aynı 3 görev. */
function pick(pool: TaskDef[], key: string, n = 3): TaskProgress[] {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n).map((t) => ({ id: t.id, progress: 0, claimed: false }));
}

/** Gün / hafta değiştiyse görevleri yeniler. */
export function refreshTasks() {
  const p = profile();
  let changed = false;
  if (p.tasks.day !== today()) {
    p.tasks.day = today();
    p.tasks.daily = pick(DAILY_TASKS, 'g' + p.tasks.day);
    changed = true;
  }
  if (p.tasks.week !== thisWeek()) {
    p.tasks.week = thisWeek();
    p.tasks.weekly = pick(WEEKLY_TASKS, 'h' + p.tasks.week);
    changed = true;
  }
  if (changed) saveProfile();
}

/** Bir olayı görevlere işler; bu olayla yeni tamamlanan görevleri döndürür. */
export function record(key: ProgressKey, n = 1): TaskDef[] {
  refreshTasks();
  const p = profile();
  const done: TaskDef[] = [];
  for (const t of [...p.tasks.daily, ...p.tasks.weekly]) {
    const d = taskDef(t.id);
    if (!d || d.key !== key || t.claimed || t.progress >= d.target) continue;
    t.progress = Math.min(d.target, t.progress + n);
    if (t.progress >= d.target) done.push(d);
  }
  saveProfile();
  return done;
}

/** Alınmayı bekleyen (tamamlanmış) görev sayısı — menüde rozet olarak gösterilir. */
export function claimableCount(): number {
  refreshTasks();
  const p = profile();
  return [...p.tasks.daily, ...p.tasks.weekly].filter((t) => {
    const d = taskDef(t.id);
    return d && !t.claimed && t.progress >= d.target;
  }).length;
}

/** Tamamlanan görevin ödülünü al. */
export function claimTask(id: string): { gain: Gain; badges: Badge[] } | null {
  const p = profile();
  const t = [...p.tasks.daily, ...p.tasks.weekly].find((x) => x.id === id);
  const d = taskDef(id);
  if (!t || !d || t.claimed || t.progress < d.target) return null;
  t.claimed = true;
  p.stats.tasksDone++;
  const gain = grant(d.reward, d.weekly ? 60 : 20);
  return { gain, badges: checkBadges() };
}

/** Sayaçla açılan rozetler (her ilerlemeden sonra çağrılabilir; yeni kazanılanları döndürür). */
export function checkBadges(): Badge[] {
  const p = profile();
  const s = p.stats;
  const lvl = levelOf(p.xp);
  const conds: [string, boolean][] = [
    ['jokerThief5', s.jokersTaken >= 5],
    ['wins10', s.gamesWon >= 10],
    ['games10', s.gamesPlayed >= 10],
    ['games50', s.gamesPlayed >= 50],
    ['allRules', CONTRACTS.every((c) => (s.perContract[c.name]?.won ?? 0) > 0)],
    ['streak7', p.daily.streak >= 7],
    ['level5', lvl >= 5],
    ['level10', lvl >= 10],
    ['collector', s.themesBought >= 1],
    ['tasks10', s.tasksDone >= 10],
  ];
  return conds
    .filter(([, ok]) => ok)
    .map(([id]) => award(id))
    .filter((b): b is Badge => !!b);
}

/** Kural istatistiği satırı (yoksa oluşturur). */
export function contractStat(name: string) {
  const s = profile().stats;
  s.perContract[name] ??= { played: 0, opened: 0, won: 0 };
  return s.perContract[name];
}
