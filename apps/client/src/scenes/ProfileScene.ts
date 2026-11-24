import Phaser from 'phaser';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import {
  AVATARS,
  AVATAR_COLORS,
  BADGES,
  KP,
  THEMES,
  VIDEO_REWARD,
  buyTheme,
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
import { fmt, showGain } from '../ui/rewards';
import { panel, txt } from '../ui/text';
import { playRewardedVideo } from '../ui/videoAd';
import { icon } from '../ui/icons';
import { showBubble } from '../view/SeatView';

const TABS = ['Profil', 'Rozetler', 'Mağaza'];

/** Profil · rozetler · mağaza (temalar, Küt Puanı, ödüllü video). */
export class ProfileScene extends Phaser.Scene {
  private tab = 0;
  private body: Phaser.GameObjects.Container | null = null;
  private kpT!: Phaser.GameObjects.Text;
  private tabBtns: Button[] = [];

  constructor() {
    super('profile');
  }

  create(data: { tab?: number }) {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    this.cameras.main.fadeIn(160, 7, 29, 21);
    createTextures(this);
    createThemePreviews(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());
    this.tab = data?.tab ?? 0;
    this.body = null;
    this.tabBtns = [];

    new Button(this, 48, 44, 56, 56, '', () => this.scene.start('menu'), UI.slate).setIcon(icon('back'), 30);
    const kg = this.add.graphics();
    panel(kg, GAME_W - 226, 12, 210, 56, 28, UI.panel, 0.9, UI.gold, 0.8);
    this.add.image(GAME_W - 196, 40, 'coin').setScale(0.5);
    this.kpT = txt(this, GAME_W - 172, 40, '', 21, UI.goldHex, 900).setOrigin(0, 0.5);
    TABS.forEach((t, i) => {
      const b = new Button(this, GAME_W / 2 + (i - 1) * 200, 40, 184, 54, t, () => this.show(i), UI.slate, 18);
      this.tabBtns.push(b);
    });
    this.show(this.tab);
  }

  private refreshKp() {
    this.kpT.setText(`${fmt(profile().kp)} KP`);
  }

  private show(i: number) {
    this.tab = i;
    this.tabBtns.forEach((b, j) => b.setSelected(j === i, UI.slate));
    this.body?.destroy();
    this.body = this.add.container(0, 0);
    this.refreshKp();
    if (i === 0) this.renderProfile(this.body);
    else if (i === 1) this.renderBadges(this.body);
    else this.renderShop(this.body);
  }

  // ---------------------------------------------------------------- profil

  private renderProfile(c: Phaser.GameObjects.Container) {
    const p = profile();
    const lvl = levelOf(p.xp);
    const g = this.add.graphics();
    panel(g, 40, 90, 520, 600, 24, UI.panel, 0.92, UI.stroke, 1);
    panel(g, 580, 90, 660, 600, 24, UI.panel, 0.92, UI.stroke, 1);
    c.add(g);

    // büyük avatar
    const av = this.add.graphics();
    av.fillStyle(p.color, 1);
    av.fillCircle(300, 190, 62);
    av.lineStyle(4, 0xffffff, 0.8);
    av.strokeCircle(300, 190, 62);
    c.add(av);
    c.add(txt(this, 300, 192, p.avatar, 62, '#fff', 900).setOrigin(0.5));
    c.add(txt(this, 300, 268, p.name, 28, '#fff', 900).setOrigin(0.5, 0));
    c.add(
      new Button(this, 300, 330, 180, 46, 'İsmi Değiştir', async () => {
        const v = await promptText({ title: 'Oyuncu adın', value: p.name, maxLength: 16, okLabel: 'Kaydet' });
        if (!v) return;
        p.name = v.slice(0, 16);
        saveProfile();
        this.show(0);
      }, UI.amber, 15),
    );

    // seviye
    c.add(txt(this, 80, 378, `Seviye ${lvl}`, 22, UI.goldHex, 900));
    const need = xpForLevel(lvl + 1) - xpForLevel(lvl);
    const have = p.xp - xpForLevel(lvl);
    c.add(txt(this, 520, 382, `${have} / ${need} XP`, 14, UI.muted, 800).setOrigin(1, 0));
    const xb = this.add.graphics();
    xb.fillStyle(0x000000, 0.35);
    xb.fillRoundedRect(80, 414, 440, 14, 7);
    xb.fillStyle(UI.gold, 1);
    xb.fillRoundedRect(80, 414, Math.max(10, (440 * have) / need), 14, 7);
    c.add(xb);

    // istatistikler
    const s = p.stats;
    const rate = s.gamesPlayed ? Math.round((100 * s.gamesWon) / s.gamesPlayed) : 0;
    const rows: [string, string][] = [
      ['Oynanan oyun', `${s.gamesPlayed}`],
      ['Birincilik', `${s.gamesWon} (%${rate})`],
      ['Bitirilen el', `${s.roundsWon} / ${s.roundsPlayed}`],
      ['Okey ile bitiş', `${s.okeyFinishes}`],
      ['Alınan okey', `${s.jokersTaken}`],
      ['İşlek cezası', `${s.islekPenalties}`],
      ['Online oyun', `${s.onlineGames}`],
      ['En iyi skor', s.bestScore === null ? '—' : `${s.bestScore}`],
    ];
    rows.forEach(([k, v], i) => {
      const x = 80 + (i % 2) * 230;
      const y = 452 + Math.floor(i / 2) * 54;
      c.add(txt(this, x, y, k, 13, UI.muted, 800));
      c.add(txt(this, x, y + 18, v, 20, '#fff', 900));
    });

    // avatar seçimi
    c.add(txt(this, 610, 110, 'AVATAR', 14, UI.muted, 900));
    AVATARS.forEach((a, i) => {
      const x = 650 + (i % 8) * 72;
      const y = 170 + Math.floor(i / 8) * 76;
      const sel = a === p.avatar;
      const bg = this.add.graphics();
      bg.fillStyle(sel ? UI.gold : 0x000000, sel ? 1 : 0.25);
      bg.fillRoundedRect(x - 30, y - 30, 60, 60, 14);
      c.add(bg);
      c.add(txt(this, x, y + 1, a, 32, '#fff', 900).setOrigin(0.5));
      c.add(
        this.add
          .zone(x, y, 60, 60)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            p.avatar = a;
            saveProfile();
            sfx.select();
            this.show(0);
          }),
      );
    });
    c.add(txt(this, 610, 340, 'RENK', 14, UI.muted, 900));
    AVATAR_COLORS.forEach((col, i) => {
      const x = 650 + i * 72;
      const y = 396;
      const g2 = this.add.graphics();
      g2.fillStyle(col, 1);
      g2.fillCircle(x, y, 24);
      if (col === p.color) {
        g2.lineStyle(4, 0xffffff, 1);
        g2.strokeCircle(x, y, 28);
      }
      c.add(g2);
      c.add(
        this.add
          .zone(x, y, 56, 56)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            p.color = col;
            saveProfile();
            sfx.select();
            this.show(0);
          }),
      );
    });
    c.add(
      txt(
        this,
        910,
        470,
        'Avatarın ve rengin online odalarda\ndiğer oyunculara da görünür.\n\nProfil şimdilik bu cihazda saklanır;\nhesap ve bulut kaydı ileride gelecek.',
        16,
        UI.cream,
        700,
        { align: 'center', lineSpacing: 6 },
      ).setOrigin(0.5, 0),
    );
  }

  // ---------------------------------------------------------------- rozetler

  private renderBadges(c: Phaser.GameObjects.Container) {
    const p = profile();
    c.add(txt(this, GAME_W / 2, 92, `${p.badges.length} / ${BADGES.length} rozet`, 18, UI.cream, 900).setOrigin(0.5, 0));
    BADGES.forEach((b, i) => {
      const x = 180 + (i % 4) * 306;
      const y = 250 + Math.floor(i / 4) * 230;
      const got = p.badges.includes(b.id);
      const g = this.add.graphics();
      panel(g, x - 140, y - 100, 280, 200, 22, got ? 0x1e5a3d : UI.panel, 0.95, got ? UI.gold : UI.stroke, 1);
      c.add(g);
      c.add(txt(this, x, y - 52, b.icon, 54, '#fff', 900).setOrigin(0.5).setAlpha(got ? 1 : 0.3));
      c.add(txt(this, x, y + 4, b.name, 20, got ? UI.goldHex : '#fff', 900).setOrigin(0.5, 0));
      c.add(txt(this, x, y + 34, b.desc, 14, UI.muted, 800).setOrigin(0.5, 0));
      c.add(txt(this, x, y + 62, got ? 'Kazanıldı ✓' : `+${fmt(b.reward)} ${KP}`, 15, got ? UI.greenHex : UI.cream, 900).setOrigin(0.5, 0));
    });
  }

  // ---------------------------------------------------------------- mağaza

  private renderShop(c: Phaser.GameObjects.Container) {
    const p = profile();
    // Küt Puanı ve video
    const g = this.add.graphics();
    panel(g, 40, 90, 1200, 108, 22, 0x14402f, 0.95, UI.gold, 0.7);
    c.add(g);
    c.add(txt(this, 70, 108, 'KÜT PUANI', 14, UI.muted, 900));
    c.add(this.add.image(92, 152, 'coin').setScale(0.7));
    c.add(txt(this, 122, 130, fmt(p.kp), 34, UI.goldHex, 900));
    c.add(
      txt(this, 330, 112, 'Oynayarak, günlük ödülle ve video izleyerek kazanılır.\nSatılmaz; temaları açmak için harcanır.', 15, UI.cream, 700, { lineSpacing: 5 }),
    );
    const left = videosLeft();
    const vb = new Button(this, 1080, 144, 250, 64, left > 0 ? `Video İzle · +${VIDEO_REWARD} ${KP}` : 'Yarın tekrar', async () => {
      const ok = await playRewardedVideo(this, `+${VIDEO_REWARD} ${KP}`);
      if (ok) showGain(this, grant(VIDEO_REWARD));
      this.show(2);
    }, UI.green, 17);
    vb.setIcon(icon('video'), 28).setEnabled(left > 0);
    c.add(vb);
    c.add(txt(this, 1080, 182, `bugün kalan: ${left}/5`, 12, UI.muted, 800).setOrigin(0.5, 0));

    const section = (title: string, y: number) => c.add(txt(this, 70, y, title, 16, UI.goldHex, 900));
    section('TAŞ TEMALARI', 220);
    section('MASA RENKLERİ', 462);
    const tiles = THEMES.filter((t) => t.kind === 'tile');
    const felts = THEMES.filter((t) => t.kind === 'felt');
    tiles.forEach((t, i) => this.themeCard(c, t.id, t.name, t.price, 190 + i * 300, 340, 'tile'));
    felts.forEach((t, i) => this.themeCard(c, t.id, t.name, t.price, 190 + i * 300, 585, 'felt'));
  }

  private themeCard(c: Phaser.GameObjects.Container, id: string, name: string, price: number, x: number, y: number, kind: 'tile' | 'felt') {
    const p = profile();
    const owned = p.ownedThemes.includes(id);
    const using = kind === 'tile' ? p.tileTheme === id : p.feltTheme === id;
    const h = kind === 'tile' ? 200 : 170;
    const g = this.add.graphics();
    panel(g, x - 135, y - h / 2, 270, h, 20, UI.panel, 0.95, using ? UI.gold : UI.stroke, 1);
    c.add(g);
    if (kind === 'tile') {
      [-34, 0, 34].forEach((dx, k) => c.add(this.add.image(x - 50 + dx, y - 22, `preview-${id}`).setScale(0.42).setAngle((k - 1) * 6)));
    } else {
      c.add(this.add.image(x - 50, y - 18, `preview-${id}`).setScale(0.62));
    }
    c.add(txt(this, x + 20, y - h / 2 + 26, name, 19, '#fff', 900));
    c.add(txt(this, x + 20, y - h / 2 + 54, price === 0 ? 'Ücretsiz' : `${fmt(price)} ${KP}`, 15, UI.goldHex, 900));
    const label = using ? 'Kullanılıyor' : owned ? 'Kullan' : 'Aç';
    const btn = new Button(this, x + 66, y + h / 2 - 34, 110, 44, label, () => {
      if (using) return;
      if (owned) {
        equipTheme(id);
        sfx.select();
        this.scene.restart({ tab: 2 }); // dokular yeni temayla çizilsin
        return;
      }
      const r = buyTheme(id);
      if (r === 'poor') {
        sfx.error();
        haptic(30);
        showBubble(this, x, y - h / 2 - 10, `${fmt(price - p.kp)} ${KP} daha gerekli`, UI.gold);
        return;
      }
      sfx.win();
      this.scene.restart({ tab: 2 });
    }, using ? UI.slate : owned ? UI.blue : UI.green, 15);
    btn.setEnabled(!using);
    c.add(btn);
  }
}
