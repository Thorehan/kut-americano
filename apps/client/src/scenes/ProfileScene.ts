import Phaser from 'phaser';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import {
  AVATARS,
  AVATAR_COLORS,
  BADGES,
  KP,
  THEMES,
  ThemeItem,
  VIDEO_DAILY_LIMIT,
  VIDEO_REWARD,
  buyTheme,
  dailyAvailable,
  equipTheme,
  grant,
  levelOf,
  profile,
  saveProfile,
  videosLeft,
  xpForLevel,
} from '../profile';
import { haptic, sfx } from '../sfx';
import { createTextures, createThemePreviews } from '../textures';
import { Button } from '../ui/Button';
import { promptText } from '../ui/htmlPrompt';
import { fmt, showDailyPopup, showGain } from '../ui/rewards';
import { panel, star8, txt } from '../ui/text';
import { playRewardedVideo } from '../ui/videoAd';
import { IconName, icon } from '../ui/icons';
import { creamTile, groove, kpPill, sectionTitle } from '../ui/hud';
import { showBubble } from '../view/SeatView';

const TABS: { label: string; ic: IconName }[] = [
  { label: 'Profil', ic: 'user' },
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
};

const DARK = '#123c41';
const SOFT = '#4d6b68';

interface ProfileData {
  tab?: number;
  /** Yeniden başlatma sonrası gösterilecek kısa bildirim (ör. tema açıldı). */
  toast?: string;
}

/** Profil · rozetler · mağaza (temalar, Küt Puanı, ödüllü video, günlük ödül). */
export class ProfileScene extends Phaser.Scene {
  private tab = 0;
  private body: Phaser.GameObjects.Container | null = null;
  private kp!: { set(v: number): void };
  private tabBtns: Button[] = [];
  private sheet: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('profile');
  }

  create(data: ProfileData) {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    this.cameras.main.fadeIn(160, 7, 29, 21);
    createTextures(this);
    createThemePreviews(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());
    this.tab = data?.tab ?? 0;
    this.body = null;
    this.sheet = null;
    this.tabBtns = [];

    // üst çubuk: geri · sekmeler (oluk içinde) · KP
    new Button(this, 48, 44, 56, 56, '', () => this.scene.start('menu'), UI.slate).setIcon(icon('back'), 30);
    const g = this.add.graphics();
    groove(g, GAME_W / 2 - 304, 12, 608, 64, 24);
    TABS.forEach((t, i) => {
      const b = new Button(this, GAME_W / 2 + (i - 1) * 198, 44, 190, 52, t.label, () => this.show(i), UI.slate, 20).setIcon(icon(t.ic), 26);
      this.tabBtns.push(b);
    });
    this.kp = kpPill(this, GAME_W - 226, 44, profile().kp, () => this.show(2), () => this.show(2));
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

  private show(i: number, animate = true) {
    if (animate && i === this.tab && this.body) return;
    const dir = i >= this.tab ? 1 : -1;
    this.tab = i;
    this.tabBtns.forEach((b, j) => b.setSelected(j === i, UI.slate));
    this.body?.destroy();
    this.body = this.add.container(0, 0);
    this.kp.set(profile().kp);
    if (i === 0) this.renderProfile(this.body);
    else if (i === 1) this.renderBadges(this.body);
    else this.renderShop(this.body);
    if (animate) {
      this.body.setAlpha(0).setX(24 * dir);
      this.tweens.add({ targets: this.body, alpha: 1, x: 0, duration: 180, ease: 'Cubic.easeOut' });
    }
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
    av.fillStyle(0x06191b, 1);
    av.fillCircle(cx, 212, 78);
    av.fillStyle(p.color, 1);
    av.fillCircle(cx, 212, 72);
    av.fillStyle(0xffffff, 0.2);
    av.fillCircle(cx, 190, 50);
    // seviye yıldızı
    av.fillStyle(0x06191b, 1);
    star8(av, cx + 56, 266, 30, 0.72);
    av.fillStyle(0xbd6d06, 1);
    star8(av, cx + 56, 268, 27, 0.72);
    av.fillStyle(UI.gold, 1);
    star8(av, cx + 56, 265, 27, 0.72);
    c.add(av);
    c.add(txt(this, cx, 214, p.avatar, 70, '#fff', 900).setOrigin(0.5));
    c.add(txt(this, cx + 56, 265, String(lvl), 20, '#5a3300', 900).setOrigin(0.5));

    const name = txt(this, cx, 330, p.name, 30, DARK, 900).setOrigin(0.5);
    c.add(name);
    c.add(
      new Button(this, Math.min(410, cx + name.width / 2 + 34), 330, 46, 46, '', async () => {
        const v = await promptText({ title: 'Oyuncu adın', value: p.name, maxLength: 16, okLabel: 'Kaydet' });
        if (!v) return;
        p.name = v.slice(0, 16);
        saveProfile();
        this.show(0, false);
      }, UI.amber).setIcon(icon('edit'), 22),
    );

    const need = xpForLevel(lvl + 1) - xpForLevel(lvl);
    const have = p.xp - xpForLevel(lvl);
    c.add(txt(this, 72, 384, `Seviye ${lvl}`, 22, DARK, 900).setOrigin(0, 0.5));
    c.add(txt(this, 408, 384, `${have} / ${need} XP`, 17, SOFT, 900).setOrigin(1, 0.5));
    const xb = this.add.graphics();
    xb.fillStyle(0x06191b, 0.9);
    xb.fillRoundedRect(70, 404, 340, 22, 11);
    xb.fillStyle(0x21a957, 1);
    xb.fillRoundedRect(73, 407, Math.max(14, (334 * have) / need), 16, 8);
    xb.fillStyle(0xffffff, 0.35);
    xb.fillRoundedRect(76, 409, Math.max(8, (328 * have) / need), 5, 3);
    c.add(xb);
    c.add(txt(this, cx, 442, `Sonraki seviyede +${fmt(100 * (lvl + 1))} ${KP}`, 16, SOFT, 800).setOrigin(0.5, 0));

    const note = this.add.graphics();
    note.fillStyle(0x123c41, 0.08);
    note.fillRoundedRect(64, 520, 352, 136, 16);
    c.add(note);
    c.add(
      txt(this, cx, 588, 'Avatarın ve rengin online odalarda diğer oyunculara da görünür.\n\nProfil şimdilik bu cihazda saklanır.', 16, SOFT, 800, {
        align: 'center',
        wordWrap: { width: 320 },
      }).setOrigin(0.5),
    );

    // istatistikler: küçük taşlar
    const sp = this.add.graphics();
    panel(sp, 470, 98, 770, 262, 22, UI.panel, 0.9, UI.stroke, 1);
    c.add(sp);
    c.add(sectionTitle(this, 494, 128, 'İSTATİSTİK'));
    const s = p.stats;
    const rate = s.gamesPlayed ? Math.round((100 * s.gamesWon) / s.gamesPlayed) : 0;
    const stats: [string, string][] = [
      [`${s.gamesPlayed}`, 'Oyun'],
      [`${s.gamesWon}`, `Birincilik · %${rate}`],
      [`${s.roundsWon}/${s.roundsPlayed}`, 'Bitirilen el'],
      [`${s.okeyFinishes}`, 'Okeyle bitiş'],
      [`${s.jokersTaken}`, 'Alınan okey'],
      [`${s.islekPenalties}`, 'İşlek cezası'],
      [`${s.onlineGames}`, 'Online oyun'],
      [s.bestScore === null ? '—' : `${s.bestScore}`, 'En iyi skor'],
    ];
    const tg = this.add.graphics();
    c.add(tg);
    stats.forEach(([v, k], i) => {
      const x = 490 + (i % 4) * 184;
      const y = 152 + Math.floor(i / 4) * 102;
      creamTile(tg, x, y, 168, 90, 16, 6);
      c.add(txt(this, x + 84, y + 32, v, 30, DARK, 900).setOrigin(0.5));
      c.add(txt(this, x + 84, y + 64, k, 15, SOFT, 900).setOrigin(0.5));
    });

    // görünüm: avatar ve renk
    const ap = this.add.graphics();
    panel(ap, 470, 378, 770, 312, 22, UI.panel, 0.9, UI.stroke, 1);
    c.add(ap);
    c.add(sectionTitle(this, 494, 408, 'GÖRÜNÜM'));
    AVATARS.forEach((a, i) => {
      const x = 534 + (i % 8) * 86;
      const y = 466 + Math.floor(i / 8) * 80;
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
            this.show(0, false);
          }),
      );
    });
    AVATAR_COLORS.forEach((col, i) => {
      const x = 534 + i * 86;
      const y = 640;
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
            this.show(0, false);
          }),
      );
    });
  }

  // ---------------------------------------------------------------- rozetler

  private renderBadges(c: Phaser.GameObjects.Container) {
    const p = profile();
    const got = p.badges.length;
    // ilerleme
    const pg = this.add.graphics();
    groove(pg, GAME_W / 2 - 250, 104, 500, 30, 15, 0.85);
    pg.fillStyle(UI.gold, 1);
    if (got) pg.fillRoundedRect(GAME_W / 2 - 246, 108, Math.max(22, (492 * got) / BADGES.length), 22, 11);
    c.add(pg);
    c.add(txt(this, GAME_W / 2, 119, `${got} / ${BADGES.length} rozet`, 17, '#ffffff', 900).setOrigin(0.5).setStroke('#06191b', 4));
    if (!got) {
      // boş durum: ne yapılacağını söyle
      c.add(txt(this, GAME_W / 2 - 270, 119, 'Henüz rozetin yok', 17, UI.cream, 900).setOrigin(1, 0.5));
      c.add(
        new Button(this, GAME_W / 2 + 360, 119, 200, 46, 'Öğreticiyle başla', () => this.scene.start('table', { mode: 'solo', tutorial: true }), UI.amber, 16).setIcon(
          icon('cap'),
          24,
        ),
      );
    }

    BADGES.forEach((b, i) => {
      const w = 272;
      const h = 252;
      const x = 52 + (i % 4) * (w + 22);
      const y = 156 + Math.floor(i / 4) * (h + 18);
      const earned = p.badges.includes(b.id);
      const g = this.add.graphics();
      panel(g, x, y, w, h, 22, earned ? 0x123c41 : UI.panel, earned ? 0.95 : 0.75, earned ? UI.gold : 0x2c5a5f, 1);
      // madalyon: çini yıldızı
      const mx = x + w / 2;
      const my = y + 78;
      g.fillStyle(0x06191b, 1);
      star8(g, mx, my + 3, 60, 0.74);
      if (earned) {
        g.fillStyle(0xbd6d06, 1);
        star8(g, mx, my + 3, 56, 0.74);
        g.fillStyle(UI.gold, 1);
        star8(g, mx, my, 56, 0.74);
        g.fillStyle(0xffffff, 0.3);
        g.fillCircle(mx, my - 14, 22);
      } else {
        g.fillStyle(0x2a4d51, 1);
        star8(g, mx, my, 56, 0.74);
      }
      c.add(g);
      const ic = BADGE_ICON[b.id] ?? 'star';
      const img =
        ic === 'joker'
          ? this.add.image(mx, my, 'tile-joker').setScale(0.42)
          : this.add.image(mx, my, icon(ic)).setScale(0.52);
      if (!earned) img.setAlpha(0.35);
      c.add(img);
      if (!earned) {
        const lk = this.add.graphics();
        lk.fillStyle(0x06191b, 1);
        lk.fillCircle(mx + 40, my + 36, 18);
        lk.fillStyle(0x3d5f63, 1);
        lk.fillCircle(mx + 40, my + 36, 15);
        c.add(lk);
        c.add(this.add.image(mx + 40, my + 35, icon('lock')).setScale(0.22));
      }
      c.add(txt(this, mx, y + 152, b.name, 21, earned ? UI.goldHex : '#ffffff', 900).setOrigin(0.5));
      c.add(txt(this, mx, y + 178, b.desc, 15, UI.muted, 800, { align: 'center', wordWrap: { width: w - 30 } }).setOrigin(0.5, 0));
      // alt etiket
      const chip = this.add.graphics();
      const cw = 150;
      chip.fillStyle(0x06191b, 1);
      chip.fillRoundedRect(mx - cw / 2 - 2, y + h - 44, cw + 4, 34, 17);
      chip.fillStyle(earned ? 0x21a957 : 0x184a50, 1);
      chip.fillRoundedRect(mx - cw / 2, y + h - 42, cw, 30, 15);
      c.add(chip);
      if (earned) {
        c.add(this.add.image(mx - 48, y + h - 27, icon('check')).setScale(0.22));
        c.add(txt(this, mx + 10, y + h - 27, 'Kazanıldı', 15, '#fff', 900).setOrigin(0.5));
      } else {
        c.add(this.add.image(mx - 44, y + h - 27, 'coin').setScale(0.36));
        c.add(txt(this, mx + 10, y + h - 27, `+${fmt(b.reward)} ${KP}`, 15, UI.goldHex, 900).setOrigin(0.5));
      }
    });
  }

  // ---------------------------------------------------------------- mağaza

  private renderShop(c: Phaser.GameObjects.Container) {
    const p = profile();
    // bakiye ve kazanma yolları
    const g = this.add.graphics();
    panel(g, 40, 96, 1200, 92, 22, UI.panel, 0.92, UI.gold, 0.8);
    c.add(g);
    c.add(this.add.image(90, 142, 'coin').setScale(0.9));
    c.add(txt(this, 128, 124, 'KÜT PUANIN', 14, UI.muted, 900));
    c.add(txt(this, 128, 150, fmt(p.kp), 34, '#ffffff', 900).setOrigin(0, 0.5).setStroke('#06191b', 5));
    c.add(
      txt(this, 330, 142, 'Oynayarak, günlük ödülle ve video izleyerek kazanılır.\nGerçek parayla satılmaz; temaları açmak için harcanır.', 16, UI.cream, 800, {
        lineSpacing: 5,
      }).setOrigin(0, 0.5),
    );
    const daily = dailyAvailable();
    const db = new Button(this, 912, 142, 190, 62, daily ? 'Günlük' : 'Yarın', () => showDailyPopup(this, () => this.show(2, false)), UI.amber, 19).setIcon(
      icon('gift'),
      28,
    );
    db.setEnabled(!!daily);
    c.add(db);
    const left = videosLeft();
    const vb = new Button(this, 1124, 142, 210, 62, left > 0 ? `+${VIDEO_REWARD} · ${left}/${VIDEO_DAILY_LIMIT}` : 'Yarın', async () => {
      const ok = await playRewardedVideo(this, `+${VIDEO_REWARD} ${KP}`);
      if (ok) showGain(this, grant(VIDEO_REWARD));
      this.show(2, false);
    }, UI.green, 19);
    vb.setIcon(icon('video'), 28).setEnabled(left > 0);
    c.add(vb);

    c.add(sectionTitle(this, 46, 214, 'TAŞ TEMALARI'));
    c.add(sectionTitle(this, 46, 464, 'MASA RENKLERİ'));
    THEMES.filter((t) => t.kind === 'tile').forEach((t, i) => this.themeCard(c, t, 40 + i * 306, 232));
    THEMES.filter((t) => t.kind === 'felt').forEach((t, i) => this.themeCard(c, t, 40 + i * 306, 482));
  }

  private themeCard(c: Phaser.GameObjects.Container, t: ThemeItem, x: number, y: number) {
    const p = profile();
    const w = 282;
    const h = 210;
    const owned = p.ownedThemes.includes(t.id);
    const using = t.kind === 'tile' ? p.tileTheme === t.id : p.feltTheme === t.id;
    const g = this.add.graphics();
    panel(g, x, y, w, h, 20, UI.panel, 0.92, using ? UI.gold : UI.stroke, 1);
    // önizleme penceresi
    g.fillStyle(0x06191b, 0.85);
    g.fillRoundedRect(x + 12, y + 12, w - 24, 98, 14);
    c.add(g);
    const px = x + w / 2;
    const py = y + 61;
    if (t.kind === 'tile') {
      [-46, 0, 46].forEach((dx, k) => c.add(this.add.image(px + dx, py + Math.abs(k - 1) * 3, `preview-${t.id}`).setScale(0.44).setAngle((k - 1) * 6)));
    } else {
      c.add(this.add.image(px, py, `preview-${t.id}`).setScale(0.78));
    }
    if (using) {
      const tag = this.add.graphics();
      tag.fillStyle(0x06191b, 1);
      tag.fillCircle(x + w - 26, y + 26, 17);
      tag.fillStyle(UI.gold, 1);
      tag.fillCircle(x + w - 26, y + 26, 14);
      c.add(tag);
      c.add(this.add.image(x + w - 26, y + 26, icon('check')).setScale(0.2).setTint(0x5a3300));
    }
    c.add(txt(this, x + 18, y + 132, t.name, 21, '#ffffff', 900).setOrigin(0, 0.5));
    const priceText = owned ? 'Senin' : t.price === 0 ? 'Ücretsiz' : `${fmt(t.price)}`;
    const pt = txt(this, x + w - 18, y + 132, priceText, 18, owned ? UI.muted : UI.goldHex, 900).setOrigin(1, 0.5);
    c.add(pt);
    if (!owned && t.price > 0) c.add(this.add.image(pt.x - pt.width - 16, y + 132, 'coin').setScale(0.36));

    const poor = !owned && p.kp < t.price;
    const label = using ? 'Kullanılıyor' : owned ? 'Kullan' : poor ? `${fmt(t.price - p.kp)} ${KP} eksik` : 'Aç';
    const btn = new Button(this, x + w / 2, y + h - 34, w - 28, 48, label, () => {
      if (using) return;
      if (owned) {
        equipTheme(t.id);
        sfx.select();
        this.scene.restart({ tab: 2, toast: `${t.name} kullanılıyor` } satisfies ProfileData); // dokular yeni temayla çizilsin
        return;
      }
      if (poor) {
        sfx.error();
        haptic(30);
        showBubble(this, x + w / 2, y - 6, `${fmt(t.price - p.kp)} ${KP} daha gerekli · video ve günlük ödülle kazanabilirsin`, UI.gold);
        return;
      }
      this.confirmBuy(t);
    }, using ? 0xf5c451 : owned ? UI.blue : poor ? UI.slate : UI.green, 18);
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
    const close = () => {
      this.tweens.add({ targets: sheet, y: GAME_H, duration: 180, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: dim, alpha: 0, duration: 180, onComplete: () => c.destroy() });
      this.sheet = null;
    };
    dim.on('pointerdown', close);
    c.add(dim);
    const sheet = this.add.container(0, GAME_H);
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
    // önizleme
    const pv = this.add.graphics();
    pv.fillStyle(0x06191b, 0.85);
    pv.fillRoundedRect(x0 + 28, y0 + 40, 210, 150, 16);
    sheet.add(pv);
    if (t.kind === 'tile') {
      [-52, 0, 52].forEach((dx, k) => sheet.add(this.add.image(x0 + 133 + dx, y0 + 115, `preview-${t.id}`).setScale(0.5).setAngle((k - 1) * 6)));
    } else {
      sheet.add(this.add.image(x0 + 133, y0 + 115, `preview-${t.id}`).setScale(1));
    }
    sheet.add(txt(this, x0 + 262, y0 + 52, `${t.name}`, 30, '#ffffff', 900));
    sheet.add(txt(this, x0 + 262, y0 + 92, t.kind === 'tile' ? 'Taş teması' : 'Masa rengi', 17, UI.muted, 800));
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
        this.scene.restart({ tab: 2, toast: `${t.name} açıldı ve kullanılıyor!` } satisfies ProfileData);
      }, UI.green, 22).setIcon(icon('check'), 26),
    );
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 180 });
    this.tweens.add({ targets: sheet, y: 0, duration: 260, ease: 'Back.easeOut' });
  }
}
