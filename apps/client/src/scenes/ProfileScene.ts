import Phaser from 'phaser';
import { CONTRACTS } from '@kut/core';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import {
  AVATARS,
  AVATAR_COLORS,
  BADGES,
  DAILY_REWARDS,
  KP,
  THEMES,
  ThemeItem,
  ThemeKind,
  VIDEO_DAILY_LIMIT,
  VIDEO_REWARD,
  buyTheme,
  dailyAvailable,
  equipTheme,
  grant,
  levelOf,
  profile,
  saveProfile,
  themeSlot,
  videosLeft,
  xpForLevel,
} from '../profile';
import { claimTask, claimableCount, refreshTasks, taskDef } from '../progress';
import { haptic, sfx } from '../sfx';
import { createTextures, createThemePreviews } from '../textures';
import { Button } from '../ui/Button';
import { promptText } from '../ui/htmlPrompt';
import { fmt, showBadge, showDailyPopup, showGain } from '../ui/rewards';
import { panel, star8, txt } from '../ui/text';
import { playRewardedVideo } from '../ui/videoAd';
import { IconName, icon } from '../ui/icons';
import { avatar, creamTile, groove, kpPill, sectionTitle } from '../ui/hud';
import { showBubble } from '../view/SeatView';
import type { TableData } from './MenuScene';

/** Sekme sırası (menü ve diğer ekranlar buna göre açar). */
export const PROFILE_TAB = { profil: 0, gorevler: 1, rozetler: 2, magaza: 3 } as const;

const TABS: { label: string; ic: IconName }[] = [
  { label: 'Profil', ic: 'user' },
  { label: 'Görevler', ic: 'check' },
  { label: 'Rozetler', ic: 'trophy' },
  { label: 'Mağaza', ic: 'shop' },
];

/** Rozet ikonları (emoji yerine çizili ikon; okey bitişi için okey taşı). */
const BADGE_ICON: Record<string, IconName | 'joker'> = {
  tutorial: 'cap',
  firstWin: 'trophy',
  roundWin: 'star',
  okeyFinish: 'joker',
  jokerThief: 'bolt',
  online: 'globe',
  games10: 'list',
  video: 'video',
  ciftOkey: 'joker',
  eldenBitme: 'bolt',
  ciftEli: 'star',
  teamWin: 'team',
  shortWin: 'bolt',
  cleanGame: 'check',
  jokerThief5: 'bolt',
  wins10: 'trophy',
  games50: 'list',
  allRules: 'book',
  streak7: 'gift',
  level5: 'star',
  level10: 'star',
  collector: 'shop',
  tasks10: 'check',
};

const SHOP_KINDS: { kind: ThemeKind; label: string }[] = [
  { kind: 'tile', label: 'Taşlar' },
  { kind: 'felt', label: 'Masa' },
  { kind: 'back', label: 'Taş Arkası' },
  { kind: 'frame', label: 'Çerçeve' },
];

const DARK = '#123c41';
const SOFT = '#4d6b68';
const BADGES_PER_PAGE = 8;

interface ProfileData {
  tab?: number;
  /** Mağazada açık alt sekme. */
  shopKind?: ThemeKind;
  /** Yeniden başlatma sonrası gösterilecek kısa bildirim (ör. tema açıldı). */
  toast?: string;
}

/** Profil · görevler · rozetler · mağaza. */
export class ProfileScene extends Phaser.Scene {
  private tab = 0;
  private body: Phaser.GameObjects.Container | null = null;
  private kp!: { set(v: number): void };
  private tabBtns: Button[] = [];
  private taskDot!: Phaser.GameObjects.Container;
  private sheet: Phaser.GameObjects.Container | null = null;
  private profileSub: 'genel' | 'kurallar' | 'gorunum' = 'genel';
  private badgePage = 0;
  private shopKind: ThemeKind = 'tile';

  constructor() {
    super('profile');
  }

  create(data: ProfileData) {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    this.cameras.main.fadeIn(160, 7, 29, 21);
    createTextures(this);
    createThemePreviews(this);
    refreshTasks();
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());
    this.tab = data?.tab ?? 0;
    this.shopKind = data?.shopKind ?? 'tile';
    this.body = null;
    this.sheet = null;
    this.tabBtns = [];
    this.badgePage = 0;

    // üst çubuk: geri · sekmeler (oluk içinde) · KP
    new Button(this, 48, 44, 56, 56, '', () => this.scene.start('menu'), UI.slate).setIcon(icon('back'), 30);
    const g = this.add.graphics();
    const tw = 168;
    groove(g, GAME_W / 2 - 2 * (tw + 6) - 8 - 60, 12, 4 * (tw + 6) + 16, 64, 24);
    TABS.forEach((t, i) => {
      const b = new Button(this, GAME_W / 2 - 60 + (i - 1.5) * (tw + 6), 44, tw, 52, t.label, () => this.show(i), UI.slate, 19).setIcon(icon(t.ic), 24);
      this.tabBtns.push(b);
    });
    // Görevler sekmesinde alınacak ödül sayısı
    const gx = GAME_W / 2 - 60 + (1 - 1.5) * (tw + 6) + tw / 2 - 8;
    this.taskDot = this.add.container(gx, 20).setDepth(5);
    this.kp = kpPill(this, GAME_W - 226, 44, profile().kp, () => this.show(PROFILE_TAB.magaza), () => this.show(PROFILE_TAB.magaza));
    this.show(this.tab, false);
    if (data?.toast) this.time.delayedCall(250, () => showBubble(this, GAME_W / 2, 104, data.toast!, UI.green, false));
  }

  /** Android geri tuşu: satın alma sayfası açıksa kapanır, yoksa ana menüye döner. */
  onBack(): boolean {
    if (this.sheet) {
      this.sheet.destroy();
      this.sheet = null;
    } else this.scene.start('menu');
    return true;
  }

  private refreshTaskDot() {
    this.taskDot.removeAll(true);
    const n = claimableCount();
    if (!n) return;
    const g = this.add.graphics();
    g.fillStyle(0x06191b, 1);
    g.fillCircle(0, 0, 13);
    g.fillStyle(0xe8483c, 1);
    g.fillCircle(0, 0, 11);
    this.taskDot.add([g, txt(this, 0, 0.5, String(n), 12, '#fff', 900).setOrigin(0.5)]);
  }

  private show(i: number, animate = true) {
    if (animate && i === this.tab && this.body) return;
    const dir = i >= this.tab ? 1 : -1;
    this.tab = i;
    this.tabBtns.forEach((b, j) => b.setSelected(j === i, UI.slate));
    this.body?.destroy();
    this.body = this.add.container(0, 0);
    this.kp.set(profile().kp);
    this.refreshTaskDot();
    if (i === PROFILE_TAB.profil) this.renderProfile(this.body);
    else if (i === PROFILE_TAB.gorevler) this.renderTasks(this.body);
    else if (i === PROFILE_TAB.rozetler) this.renderBadges(this.body);
    else this.renderShop(this.body);
    if (animate) {
      this.body.setAlpha(0).setX(24 * dir);
      this.tweens.add({ targets: this.body, alpha: 1, x: 0, duration: 180, ease: 'Cubic.easeOut' });
    }
  }

  /** Aynı sekmeyi yeniden çizer (alt sekme değişimi, ödül alma). */
  private redraw() {
    const t = this.tab;
    this.tab = -1;
    this.show(t, false);
  }

  /** Koyu oluk içinde alt sekmeler (segmentli seçici). */
  private subTabs<T extends string>(c: Phaser.GameObjects.Container, cx: number, y: number, items: { key: T; label: string }[], cur: T, onPick: (k: T) => void, bw = 150) {
    const g = this.add.graphics();
    const w = items.length * (bw + 6) + 14;
    groove(g, cx - w / 2, y - 30, w, 60, 22);
    c.add(g);
    items.forEach((it, i) => {
      const b = new Button(this, cx - w / 2 + 7 + bw / 2 + i * (bw + 6) + 3, y, bw, 46, it.label, () => onPick(it.key), UI.slate, 17);
      b.setSelected(it.key === cur, UI.slate);
      c.add(b);
    });
  }

  // ---------------------------------------------------------------- profil

  private renderProfile(c: Phaser.GameObjects.Container) {
    const p = profile();
    const lvl = levelOf(p.xp);

    // oyuncu kartı: büyük krem taş
    const card = this.add.graphics();
    creamTile(card, 40, 98, 400, 592, 28, 10);
    c.add(card);
    const cx = 240;
    const av = this.add.graphics();
    c.add(av);
    c.add(avatar(this, av, cx, 212, 70, p.color, p.avatar, p.frame));
    // seviye yıldızı
    const lv = this.add.graphics();
    lv.fillStyle(0x06191b, 1);
    star8(lv, cx + 60, 268, 30, 0.72);
    lv.fillStyle(0xbd6d06, 1);
    star8(lv, cx + 60, 270, 27, 0.72);
    lv.fillStyle(UI.gold, 1);
    star8(lv, cx + 60, 267, 27, 0.72);
    c.add(lv);
    c.add(txt(this, cx + 60, 267, String(lvl), 20, '#5a3300', 900).setOrigin(0.5));

    const name = txt(this, cx, 334, p.name, 30, DARK, 900).setOrigin(0.5);
    c.add(name);
    c.add(
      new Button(this, Math.min(410, cx + name.width / 2 + 34), 334, 46, 46, '', async () => {
        const v = await promptText({ title: 'Oyuncu adın', value: p.name, maxLength: 16, okLabel: 'Kaydet' });
        if (!v) return;
        p.name = v.slice(0, 16);
        saveProfile();
        this.redraw();
      }, UI.amber).setIcon(icon('edit'), 22),
    );

    const need = xpForLevel(lvl + 1) - xpForLevel(lvl);
    const have = p.xp - xpForLevel(lvl);
    c.add(txt(this, 72, 388, `Seviye ${lvl}`, 22, DARK, 900).setOrigin(0, 0.5));
    c.add(txt(this, 408, 388, `${have} / ${need} XP`, 17, SOFT, 900).setOrigin(1, 0.5));
    const xb = this.add.graphics();
    xb.fillStyle(0x06191b, 0.9);
    xb.fillRoundedRect(70, 408, 340, 22, 11);
    xb.fillStyle(0x21a957, 1);
    xb.fillRoundedRect(73, 411, Math.max(14, (334 * have) / need), 16, 8);
    xb.fillStyle(0xffffff, 0.35);
    xb.fillRoundedRect(76, 413, Math.max(8, (328 * have) / need), 5, 3);
    c.add(xb);
    c.add(txt(this, cx, 446, `Sonraki seviyede +${fmt(100 * (lvl + 1))} ${KP}`, 16, SOFT, 800).setOrigin(0.5, 0));

    const note = this.add.graphics();
    note.fillStyle(0x123c41, 0.08);
    note.fillRoundedRect(64, 520, 352, 136, 16);
    c.add(note);
    c.add(
      txt(this, cx, 588, 'Avatarın, rengin ve çerçeven online odalarda diğer oyunculara da görünür.\n\nProfil şimdilik bu cihazda saklanır.', 16, SOFT, 800, {
        align: 'center',
        wordWrap: { width: 320 },
      }).setOrigin(0.5),
    );

    // sağ taraf: Genel · Kurallar · Görünüm
    const sp = this.add.graphics();
    panel(sp, 470, 98, 770, 592, 22, UI.panel, 0.9, UI.stroke, 1);
    c.add(sp);
    this.subTabs(
      c,
      855,
      140,
      [
        { key: 'genel', label: 'Genel' },
        { key: 'kurallar', label: 'Kurallar' },
        { key: 'gorunum', label: 'Görünüm' },
      ],
      this.profileSub,
      (k) => {
        this.profileSub = k;
        this.redraw();
      },
    );
    if (this.profileSub === 'genel') this.renderGeneral(c);
    else if (this.profileSub === 'kurallar') this.renderRuleStats(c);
    else this.renderLooks(c);
  }

  private renderGeneral(c: Phaser.GameObjects.Container) {
    const s = profile().stats;
    const rate = s.gamesPlayed ? Math.round((100 * s.gamesWon) / s.gamesPlayed) : 0;
    const stats: [string, string][] = [
      [`${s.gamesPlayed}`, 'Oyun'],
      [`${s.gamesWon}`, `Birincilik · %${rate}`],
      [`${s.roundsWon}/${s.roundsPlayed}`, 'Bitirilen el'],
      [s.bestScore === null ? '—' : `${s.bestScore}`, 'En iyi skor'],
      [`${s.okeyFinishes}`, 'Okeyle bitiş'],
      [`${s.ciftOkeyFinishes}`, 'Çift okey'],
      [`${s.jokersTaken}`, 'Alınan okey'],
      [`${s.islekPenalties}`, 'İşlek cezası'],
      [`${s.eldenBitmeWins}`, 'Elden bitme'],
      [`${s.ciftEliWins}`, 'Çift Eli'],
      [`${s.onlineGames}`, 'Online oyun'],
      [`${s.tasksDone}`, 'Görev'],
    ];
    const tg = this.add.graphics();
    c.add(tg);
    stats.forEach(([v, k], i) => {
      const x = 490 + (i % 4) * 184;
      const y = 196 + Math.floor(i / 4) * 160;
      creamTile(tg, x, y, 168, 138, 18, 8);
      c.add(txt(this, x + 84, y + 54, v, 34, DARK, 900).setOrigin(0.5));
      c.add(txt(this, x + 84, y + 100, k, 16, SOFT, 900).setOrigin(0.5));
    });
  }

  /** Kural bazında istatistik: her kuralda oynanan, açılan, bitirilen el. */
  private renderRuleStats(c: Phaser.GameObjects.Container) {
    const per = profile().stats.perContract;
    const x0 = 492;
    const cols = [x0 + 16, x0 + 400, x0 + 500, x0 + 600, x0 + 690];
    const hy = 190;
    [['Kural', 0], ['Oynadın', 1], ['Açtın', 2], ['Bitirdin', 3], ['Oran', 4]].forEach(([h, i]) =>
      c.add(txt(this, cols[i as number], hy, h as string, 15, UI.muted, 900).setOrigin(i ? 0.5 : 0, 0.5)),
    );
    const g = this.add.graphics();
    c.add(g);
    const rowH = 31;
    let any = false;
    CONTRACTS.forEach((k, i) => {
      const y = 222 + i * rowH;
      const st = per[k.name] ?? { played: 0, opened: 0, won: 0 };
      if (st.played) any = true;
      g.fillStyle(0x06191b, i % 2 ? 0.3 : 0.55);
      g.fillRoundedRect(x0, y - rowH / 2 + 1, 726, rowH - 2, 10);
      c.add(txt(this, cols[0], y, `${i + 1}. ${k.name}`, 16, st.played ? UI.cream : UI.muted, 800).setOrigin(0, 0.5));
      c.add(txt(this, cols[1], y, `${st.played}`, 16, '#fff', 900).setOrigin(0.5));
      c.add(txt(this, cols[2], y, `${st.opened}`, 16, '#fff', 900).setOrigin(0.5));
      c.add(txt(this, cols[3], y, `${st.won}`, 16, st.won ? UI.goldHex : '#fff', 900).setOrigin(0.5));
      c.add(txt(this, cols[4], y, st.played ? `%${Math.round((100 * st.won) / st.played)}` : '—', 16, UI.muted, 900).setOrigin(0.5));
    });
    if (!any) c.add(txt(this, 855, 690 - 22, 'Henüz el oynamadın — oynadıkça burası dolar.', 15, UI.muted, 800).setOrigin(0.5));
  }

  private renderLooks(c: Phaser.GameObjects.Container) {
    const p = profile();
    c.add(sectionTitle(this, 494, 200, 'AVATAR'));
    AVATARS.forEach((a, i) => {
      const x = 534 + (i % 8) * 86;
      const y = 256 + Math.floor(i / 8) * 82;
      const sel = a === p.avatar;
      const bg = this.add.graphics();
      bg.fillStyle(0x06191b, 1);
      bg.fillRoundedRect(x - 35, y - 35, 70, 70, 18);
      bg.fillStyle(sel ? UI.gold : 0x1c5158, 1);
      bg.fillRoundedRect(x - 32, y - 32, 64, 64, 16);
      if (sel) {
        bg.fillStyle(0xffffff, 0.35);
        bg.fillRoundedRect(x - 26, y - 28, 52, 12, 6);
      }
      c.add(bg);
      c.add(txt(this, x, y + 1, a, 34, '#fff', 900).setOrigin(0.5));
      c.add(
        this.add
          .zone(x, y, 70, 70)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            if (sel) return;
            p.avatar = a;
            saveProfile();
            sfx.select();
            this.redraw();
          }),
      );
    });
    c.add(sectionTitle(this, 494, 452, 'RENK'));
    AVATAR_COLORS.forEach((col, i) => {
      const x = 534 + i * 86;
      const y = 506;
      const sel = col === p.color;
      const g2 = this.add.graphics();
      g2.fillStyle(0x06191b, 1);
      g2.fillCircle(x, y, sel ? 30 : 26);
      if (sel) {
        g2.fillStyle(0xffffff, 1);
        g2.fillCircle(x, y, 28);
      }
      g2.fillStyle(col, 1);
      g2.fillCircle(x, y, 23);
      g2.fillStyle(0xffffff, 0.25);
      g2.fillCircle(x, y - 7, 13);
      c.add(g2);
      if (sel) c.add(this.add.image(x, y, icon('check')).setScale(0.3));
      c.add(
        this.add
          .zone(x, y, 64, 64)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            if (sel) return;
            p.color = col;
            saveProfile();
            sfx.select();
            this.redraw();
          }),
      );
    });
    c.add(txt(this, 855, 600, 'Çerçeve ve taş arkası desenleri Mağaza\'da.', 16, UI.muted, 800).setOrigin(0.5));
    c.add(
      new Button(this, 855, 646, 240, 50, 'Mağazaya git', () => {
        this.shopKind = 'frame';
        this.show(PROFILE_TAB.magaza);
      }, 0x5b3f8f, 18).setIcon(icon('shop'), 24),
    );
  }

  // ---------------------------------------------------------------- görevler

  private renderTasks(c: Phaser.GameObjects.Container) {
    const p = profile();
    // sol: günlük + haftalık görevler
    const endOfDay = new Date();
    endOfDay.setHours(24, 0, 0, 0);
    const hrs = Math.max(1, Math.ceil((endOfDay.getTime() - Date.now()) / 3_600_000));
    const dow = (new Date().getDay() + 6) % 7;
    c.add(sectionTitle(this, 46, 112, 'GÜNLÜK GÖREVLER'));
    c.add(txt(this, 820, 112, `${hrs} saat sonra yenilenir`, 15, UI.muted, 800).setOrigin(1, 0.5));
    p.tasks.daily.forEach((t, i) => this.taskRow(c, t.id, 40, 134 + i * 86));
    c.add(sectionTitle(this, 46, 408, 'HAFTALIK GÖREVLER'));
    c.add(txt(this, 820, 408, `${7 - dow} gün sonra yenilenir`, 15, UI.muted, 800).setOrigin(1, 0.5));
    p.tasks.weekly.forEach((t, i) => this.taskRow(c, t.id, 40, 430 + i * 86));

    // sağ: 7 günlük giriş takvimi + ödüllü video
    const g = this.add.graphics();
    panel(g, 846, 98, 394, 300, 22, UI.panel, 0.9, UI.gold, 0.8);
    panel(g, 846, 416, 394, 274, 22, UI.panel, 0.9, UI.stroke, 1);
    c.add(g);
    c.add(sectionTitle(this, 868, 128, '7 GÜNLÜK GİRİŞ'));
    const d = dailyAvailable();
    const streakDay = d ? d.day : ((p.daily.streak - 1) % DAILY_REWARDS.length) + 1;
    DAILY_REWARDS.forEach((amt, i) => {
      const x = 878 + (i % 4) * 88;
      const y = 166 + Math.floor(i / 4) * 92;
      const past = i + 1 < streakDay || (!d && i + 1 === streakDay);
      const now = !!d && i + 1 === streakDay;
      const bg = this.add.graphics();
      bg.fillStyle(0x06191b, 1);
      bg.fillRoundedRect(x - 2, y - 2, 80, 84, 14);
      bg.fillStyle(now ? UI.gold : past ? 0x21a957 : 0x184a50, 1);
      bg.fillRoundedRect(x, y, 76, 80, 12);
      c.add(bg);
      c.add(txt(this, x + 38, y + 16, `${i + 1}. gün`, 13, now ? '#5a3300' : UI.muted, 900).setOrigin(0.5));
      if (past) c.add(this.add.image(x + 38, y + 44, icon('check')).setScale(0.32));
      else c.add(this.add.image(x + 38, y + 44, 'coin').setScale(0.42));
      c.add(txt(this, x + 38, y + 68, fmt(amt), 14, now ? '#5a3300' : '#fff', 900).setOrigin(0.5));
    });
    const db = new Button(this, 1150, 348, 150, 52, d ? 'Al' : 'Yarın', () => showDailyPopup(this, () => this.redraw()), UI.amber, 19).setIcon(icon('gift'), 24);
    db.setEnabled(!!d);
    c.add(db);
    c.add(txt(this, 868, 348, `Seri: ${p.daily.streak} gün`, 17, UI.cream, 900).setOrigin(0, 0.5));

    c.add(sectionTitle(this, 868, 446, 'ÖDÜLLÜ VİDEO'));
    const left = videosLeft();
    c.add(
      txt(this, 1043, 520, `Her video +${VIDEO_REWARD} ${KP}\nBugün kalan: ${left}/${VIDEO_DAILY_LIMIT}`, 18, UI.cream, 800, { align: 'center', lineSpacing: 6 }).setOrigin(0.5),
    );
    const vb = new Button(this, 1043, 620, 260, 62, left > 0 ? `İzle · +${VIDEO_REWARD}` : 'Yarın', async () => {
      const ok = await playRewardedVideo(this, `+${VIDEO_REWARD} ${KP}`);
      if (ok) showGain(this, grant(VIDEO_REWARD));
      this.redraw();
    }, UI.green, 20).setIcon(icon('video'), 28);
    vb.setEnabled(left > 0);
    c.add(vb);
  }

  private taskRow(c: Phaser.GameObjects.Container, id: string, x: number, y: number) {
    const p = profile();
    const t = [...p.tasks.daily, ...p.tasks.weekly].find((q) => q.id === id);
    const d = taskDef(id);
    if (!t || !d) return;
    const w = 780;
    const h = 74;
    const done = t.progress >= d.target;
    const g = this.add.graphics();
    panel(g, x, y, w, h, 18, t.claimed ? 0x0d2c30 : UI.panel, 0.9, done && !t.claimed ? UI.gold : UI.stroke, done && !t.claimed ? 1 : 0.5);
    // ikon
    g.fillStyle(0x06191b, 1);
    g.fillCircle(x + 40, y + h / 2, 24);
    g.fillStyle(d.weekly ? 0x8a55ec : 0x2384e0, 1);
    g.fillCircle(x + 40, y + h / 2, 21);
    // ilerleme çubuğu
    const bx = x + 80;
    const bw = 380;
    g.fillStyle(0x06191b, 0.9);
    g.fillRoundedRect(bx, y + 44, bw, 16, 8);
    g.fillStyle(done ? 0x21a957 : UI.gold, 1);
    if (t.progress) g.fillRoundedRect(bx + 2, y + 46, Math.max(12, (bw - 4) * Math.min(1, t.progress / d.target)), 12, 6);
    c.add(g);
    c.add(this.add.image(x + 40, y + h / 2, icon(d.weekly ? 'star' : 'check')).setScale(0.3));
    c.add(txt(this, bx, y + 22, d.text, 19, t.claimed ? UI.muted : '#ffffff', 900).setOrigin(0, 0.5));
    c.add(txt(this, bx + bw + 12, y + 52, `${t.progress}/${d.target}`, 15, UI.muted, 900).setOrigin(0, 0.5));
    // ödül
    c.add(this.add.image(x + 560, y + h / 2, 'coin').setScale(0.42));
    c.add(txt(this, x + 580, y + h / 2, `+${fmt(d.reward)}`, 18, UI.goldHex, 900).setOrigin(0, 0.5));
    if (t.claimed) {
      c.add(txt(this, x + w - 80, y + h / 2, 'Alındı ✓', 17, UI.greenHex, 900).setOrigin(0.5));
    } else {
      const b = new Button(this, x + w - 80, y + h / 2, 120, 48, done ? 'Al' : 'Devam', () => {
        const r = claimTask(id);
        if (!r) return;
        sfx.win();
        haptic(25);
        showGain(this, r.gain);
        r.badges.forEach((bd, i) => this.time.delayedCall(1200 + i * 2600, () => showBadge(this, bd)));
        this.redraw();
      }, done ? UI.green : UI.slate, 18);
      b.setEnabled(done);
      if (done) b.setPulse(true);
      c.add(b);
    }
  }

  // ---------------------------------------------------------------- rozetler

  private renderBadges(c: Phaser.GameObjects.Container) {
    const p = profile();
    const got = p.badges.length;
    const pages = Math.ceil(BADGES.length / BADGES_PER_PAGE);
    this.badgePage = Math.min(this.badgePage, pages - 1);
    // ilerleme
    const pg = this.add.graphics();
    groove(pg, GAME_W / 2 - 250, 104, 500, 30, 15, 0.85);
    pg.fillStyle(UI.gold, 1);
    if (got) pg.fillRoundedRect(GAME_W / 2 - 246, 108, Math.max(22, (492 * got) / BADGES.length), 22, 11);
    c.add(pg);
    c.add(txt(this, GAME_W / 2, 119, `${got} / ${BADGES.length} rozet`, 17, '#ffffff', 900).setOrigin(0.5).setStroke('#06191b', 4));
    if (!got) {
      c.add(txt(this, GAME_W / 2 - 270, 119, 'Henüz rozetin yok', 17, UI.cream, 900).setOrigin(1, 0.5));
      c.add(
        new Button(this, GAME_W / 2 + 360, 119, 200, 46, 'Öğreticiyle başla', () => this.scene.start('table', { mode: 'solo', tutorial: true } satisfies TableData), UI.amber, 16).setIcon(
          icon('cap'),
          24,
        ),
      );
    }

    const list = BADGES.slice(this.badgePage * BADGES_PER_PAGE, (this.badgePage + 1) * BADGES_PER_PAGE);
    list.forEach((b, i) => {
      const w = 272;
      const h = 236;
      const x = 52 + (i % 4) * (w + 22);
      const y = 150 + Math.floor(i / 4) * (h + 14);
      const earned = p.badges.includes(b.id);
      const g = this.add.graphics();
      panel(g, x, y, w, h, 22, earned ? 0x123c41 : UI.panel, earned ? 0.95 : 0.75, earned ? UI.gold : 0x2c5a5f, 1);
      const mx = x + w / 2;
      const my = y + 72;
      g.fillStyle(0x06191b, 1);
      star8(g, mx, my + 3, 56, 0.74);
      if (earned) {
        g.fillStyle(0xbd6d06, 1);
        star8(g, mx, my + 3, 52, 0.74);
        g.fillStyle(UI.gold, 1);
        star8(g, mx, my, 52, 0.74);
        g.fillStyle(0xffffff, 0.3);
        g.fillCircle(mx, my - 13, 20);
      } else {
        g.fillStyle(0x2a4d51, 1);
        star8(g, mx, my, 52, 0.74);
      }
      c.add(g);
      const ic = BADGE_ICON[b.id] ?? 'star';
      const img = ic === 'joker' ? this.add.image(mx, my, 'tile-joker').setScale(0.38) : this.add.image(mx, my, icon(ic)).setScale(0.48);
      if (!earned) img.setAlpha(0.35);
      c.add(img);
      if (!earned) {
        const lk = this.add.graphics();
        lk.fillStyle(0x06191b, 1);
        lk.fillCircle(mx + 38, my + 34, 17);
        lk.fillStyle(0x3d5f63, 1);
        lk.fillCircle(mx + 38, my + 34, 14);
        c.add(lk);
        c.add(this.add.image(mx + 38, my + 33, icon('lock')).setScale(0.2));
      }
      c.add(txt(this, mx, y + 142, b.name, 20, earned ? UI.goldHex : '#ffffff', 900).setOrigin(0.5));
      c.add(txt(this, mx, y + 160, b.desc, 14, UI.muted, 800, { align: 'center', wordWrap: { width: w - 24 }, lineSpacing: -1 }).setOrigin(0.5, 0));
      const chip = this.add.graphics();
      const cw = 150;
      chip.fillStyle(0x06191b, 1);
      chip.fillRoundedRect(mx - cw / 2 - 2, y + h - 42, cw + 4, 32, 16);
      chip.fillStyle(earned ? 0x21a957 : 0x184a50, 1);
      chip.fillRoundedRect(mx - cw / 2, y + h - 40, cw, 28, 14);
      c.add(chip);
      if (earned) {
        c.add(this.add.image(mx - 48, y + h - 26, icon('check')).setScale(0.22));
        c.add(txt(this, mx + 10, y + h - 26, 'Kazanıldı', 15, '#fff', 900).setOrigin(0.5));
      } else {
        c.add(this.add.image(mx - 44, y + h - 26, 'coin').setScale(0.34));
        c.add(txt(this, mx + 10, y + h - 26, `+${fmt(b.reward)} ${KP}`, 15, UI.goldHex, 900).setOrigin(0.5));
      }
    });

    // sayfalar: oklar + noktalar + yana kaydırma
    if (pages > 1) {
      const y = 670;
      const go = (d: number) => {
        const n = Phaser.Math.Clamp(this.badgePage + d, 0, pages - 1);
        if (n === this.badgePage) return;
        this.badgePage = n;
        sfx.select();
        this.redraw();
      };
      const prev = new Button(this, GAME_W / 2 - 110, y, 52, 44, '', () => go(-1), UI.slate).setIcon(icon('back'), 22);
      const next = new Button(this, GAME_W / 2 + 110, y, 52, 44, '', () => go(1), UI.slate).setIcon(icon('play'), 22);
      prev.setEnabled(this.badgePage > 0);
      next.setEnabled(this.badgePage < pages - 1);
      c.add([prev, next]);
      const dots = this.add.graphics();
      for (let i = 0; i < pages; i++) {
        dots.fillStyle(i === this.badgePage ? UI.gold : 0x3d5f63, 1);
        dots.fillCircle(GAME_W / 2 + (i - (pages - 1) / 2) * 24, y, i === this.badgePage ? 8 : 6);
      }
      c.add(dots);
      // yana kaydırma hareketi
      const swipe = this.add.zone(GAME_W / 2, 400, 1200, 520).setInteractive();
      let sx = 0;
      swipe.on('pointerdown', (pt: Phaser.Input.Pointer) => (sx = pt.worldX));
      swipe.on('pointerup', (pt: Phaser.Input.Pointer) => {
        const dx = pt.worldX - sx;
        if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
      });
      c.addAt(swipe, 0);
    }
  }

  // ---------------------------------------------------------------- mağaza

  private renderShop(c: Phaser.GameObjects.Container) {
    const p = profile();
    const g = this.add.graphics();
    panel(g, 40, 96, 1200, 92, 22, UI.panel, 0.92, UI.gold, 0.8);
    c.add(g);
    c.add(this.add.image(90, 142, 'coin').setScale(0.9));
    c.add(txt(this, 128, 124, 'KÜT PUANIN', 14, UI.muted, 900));
    c.add(txt(this, 128, 150, fmt(p.kp), 34, '#ffffff', 900).setOrigin(0, 0.5).setStroke('#06191b', 5));
    c.add(
      txt(this, 330, 142, 'Oynayarak, görevlerle, günlük ödülle ve video izleyerek kazanılır.\nGerçek parayla satılmaz; temaları açmak için harcanır.', 16, UI.cream, 800, {
        lineSpacing: 5,
      }).setOrigin(0, 0.5),
    );
    const left = videosLeft();
    const vb = new Button(this, 1124, 142, 210, 62, left > 0 ? `+${VIDEO_REWARD} · ${left}/${VIDEO_DAILY_LIMIT}` : 'Yarın', async () => {
      const ok = await playRewardedVideo(this, `+${VIDEO_REWARD} ${KP}`);
      if (ok) showGain(this, grant(VIDEO_REWARD));
      this.redraw();
    }, UI.green, 19);
    vb.setIcon(icon('video'), 28).setEnabled(left > 0);
    c.add(vb);

    this.subTabs(
      c,
      GAME_W / 2,
      232,
      SHOP_KINDS.map((k) => ({ key: k.kind, label: k.label })),
      this.shopKind,
      (k) => {
        this.shopKind = k;
        this.redraw();
      },
      170,
    );
    THEMES.filter((t) => t.kind === this.shopKind).forEach((t, i) => this.themeCard(c, t, 40 + i * 306, 288));
    c.add(txt(this, GAME_W / 2, 684, 'Seçtiğin tema hemen kullanılır; açtıkların her zaman senin.', 15, UI.muted, 800).setOrigin(0.5));
  }

  /** Temanın önizlemesi (kart penceresi ve onay sayfası). */
  private preview(c: Phaser.GameObjects.Container, t: ThemeItem, px: number, py: number, k = 1) {
    const p = profile();
    if (t.kind === 'tile' || t.kind === 'back') {
      [-50, 0, 50].forEach((dx, i) =>
        c.add(this.add.image(px + dx * k, py + Math.abs(i - 1) * 3, `preview-${t.id}`).setScale(0.5 * k).setAngle((i - 1) * 6)),
      );
    } else if (t.kind === 'felt') {
      c.add(this.add.image(px, py, `preview-${t.id}`).setScale(0.95 * k));
    } else {
      const g = this.add.graphics();
      c.add(g);
      c.add(avatar(this, g, px, py + 4, 46 * k, p.color, p.avatar, t.id));
    }
  }

  private themeCard(c: Phaser.GameObjects.Container, t: ThemeItem, x: number, y: number) {
    const p = profile();
    const w = 282;
    const h = 370;
    const owned = p.ownedThemes.includes(t.id);
    const using = p[themeSlot(t.kind)] === t.id;
    const g = this.add.graphics();
    panel(g, x, y, w, h, 20, UI.panel, 0.92, using ? UI.gold : UI.stroke, 1);
    g.fillStyle(0x06191b, 0.85);
    g.fillRoundedRect(x + 12, y + 12, w - 24, 200, 16);
    c.add(g);
    this.preview(c, t, x + w / 2, y + 112, 1.2);
    if (using) {
      const tag = this.add.graphics();
      tag.fillStyle(0x06191b, 1);
      tag.fillCircle(x + w - 28, y + 28, 18);
      tag.fillStyle(UI.gold, 1);
      tag.fillCircle(x + w - 28, y + 28, 15);
      c.add(tag);
      c.add(this.add.image(x + w - 28, y + 28, icon('check')).setScale(0.21).setTint(0x5a3300));
    }
    c.add(txt(this, x + 18, y + 246, t.name, 22, '#ffffff', 900).setOrigin(0, 0.5));
    const priceText = owned ? 'Senin' : t.price === 0 ? 'Ücretsiz' : `${fmt(t.price)}`;
    const pt = txt(this, x + w - 18, y + 246, priceText, 19, owned ? UI.muted : UI.goldHex, 900).setOrigin(1, 0.5);
    c.add(pt);
    if (!owned && t.price > 0) c.add(this.add.image(pt.x - pt.width - 16, y + 246, 'coin').setScale(0.38));

    const poor = !owned && p.kp < t.price;
    const label = using ? 'Kullanılıyor' : owned ? 'Kullan' : poor ? `${fmt(t.price - p.kp)} ${KP} eksik` : 'Aç';
    const btn = new Button(this, x + w / 2, y + h - 40, w - 28, 54, label, () => {
      if (using) return;
      if (owned) {
        equipTheme(t.id);
        sfx.select();
        this.scene.restart({ tab: PROFILE_TAB.magaza, shopKind: t.kind, toast: `${t.name} kullanılıyor` } satisfies ProfileData);
        return;
      }
      if (poor) {
        sfx.error();
        haptic(30);
        showBubble(this, x + w / 2, y - 6, `${fmt(t.price - p.kp)} ${KP} daha gerekli · görevler, video ve günlük ödülle kazanabilirsin`, UI.gold);
        return;
      }
      this.confirmBuy(t);
    }, using ? 0xf5c451 : owned ? UI.blue : poor ? UI.slate : UI.green, 19);
    if (using) btn.setIcon(icon('check'), 22);
    else if (poor) btn.setIcon(icon('lock'), 20);
    c.add(btn);
  }

  /** Satın alma onayı: alttan açılan sayfa (KP harcayan her işlem onaylı). */
  private confirmBuy(t: ThemeItem) {
    this.sheet?.destroy();
    const p = profile();
    const c = this.add.container(0, 0).setDepth(2000);
    this.sheet = c;
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.55).setOrigin(0).setInteractive();
    const sheet = this.add.container(0, GAME_H);
    const close = () => {
      this.tweens.add({ targets: sheet, y: GAME_H, duration: 180, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: dim, alpha: 0, duration: 180, onComplete: () => c.destroy() });
      this.sheet = null;
    };
    dim.on('pointerdown', close);
    c.add(dim);
    c.add(sheet);
    const W = 640;
    const H = 300;
    const x0 = GAME_W / 2 - W / 2;
    const y0 = GAME_H - H;
    const g = this.add.graphics();
    g.fillStyle(0x06191b, 1);
    g.fillRoundedRect(x0 - 3, y0 - 3, W + 6, H + 40, 30);
    g.fillStyle(UI.stroke, 1);
    g.fillRoundedRect(x0 - 1, y0 - 1, W + 2, H + 40, 29);
    g.fillStyle(0x0f3337, 1);
    g.fillRoundedRect(x0 + 2, y0 + 2, W - 4, H + 40, 27);
    g.fillStyle(0xffffff, 0.3);
    g.fillRoundedRect(GAME_W / 2 - 34, y0 + 12, 68, 7, 4); // tutamaç
    sheet.add(g);
    const pv = this.add.graphics();
    pv.fillStyle(0x06191b, 0.85);
    pv.fillRoundedRect(x0 + 28, y0 + 40, 210, 150, 16);
    sheet.add(pv);
    this.preview(sheet, t, x0 + 133, y0 + 115, 0.9);
    const kindName = SHOP_KINDS.find((k) => k.kind === t.kind)?.label ?? '';
    sheet.add(txt(this, x0 + 262, y0 + 52, `${t.name}`, 30, '#ffffff', 900));
    sheet.add(txt(this, x0 + 262, y0 + 92, kindName, 17, UI.muted, 800));
    sheet.add(this.add.image(x0 + 276, y0 + 144, 'coin').setScale(0.5));
    sheet.add(txt(this, x0 + 298, y0 + 144, `${fmt(t.price)} ${KP} harcanacak`, 20, UI.goldHex, 900).setOrigin(0, 0.5));
    sheet.add(txt(this, x0 + 262, y0 + 172, `Kalan: ${fmt(p.kp - t.price)} ${KP} · açınca hemen kullanılır`, 16, UI.cream, 800));
    sheet.add(new Button(this, GAME_W / 2 - 150, y0 + 240, 270, 60, 'Vazgeç', close, UI.slate, 20));
    sheet.add(
      new Button(this, GAME_W / 2 + 150, y0 + 240, 270, 60, 'Aç', () => {
        const r = buyTheme(t.id);
        if (r !== 'ok') {
          sfx.error();
          close();
          return;
        }
        sfx.win();
        haptic(25);
        this.scene.restart({ tab: PROFILE_TAB.magaza, shopKind: t.kind, toast: `${t.name} açıldı ve kullanılıyor!` } satisfies ProfileData);
      }, UI.green, 22).setIcon(icon('check'), 26),
    );
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 180 });
    this.tweens.add({ targets: sheet, y: 0, duration: 260, ease: 'Back.easeOut' });
  }
}
