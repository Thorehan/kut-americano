import Phaser from 'phaser';
import { CONTRACTS, GameMode, RANDOM_MAX_REPEAT, RANDOM_WEIGHTS, RuleOrder, normalizeCode } from '@kut/core';
import type { OnlineController } from '../controller';
import { connection } from '../net/connection';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { header, panel, popIn, star8, txt } from '../ui/text';
import { IconName, icon } from '../ui/icons';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import { haptic, sfx } from '../sfx';
import { KP, VIDEO_REWARD, grant, levelOf, onlineLockLeft, profile, videosLeft, xpForLevel } from '../profile';
import { fmt, showDailyPopup, showGain } from '../ui/rewards';
import { playRewardedVideo } from '../ui/videoAd';
import { showBubble } from '../view/SeatView';
import type { PreviewSpec } from '../preview';

export interface TableData {
  mode: GameMode;
  /** Online oyunda sunucuya bağlı kontrolcü. */
  online?: OnlineController;
  /** Kısa öğretici eli ('okey': okeyle bitiş örneği). */
  tutorial?: boolean | 'okey';
  /** Bitiş ekranı önizlemesi (?onizleme). */
  preview?: PreviewSpec;
  ruleOrder?: RuleOrder;
  seed?: number;
  startRound?: number;
}

/** URL parametreleri (deneme için): ?el=10 → 10. elden başla, ?seed=42 → sabit dağıtım, ?mod=rastgele */
function urlOptions(): Partial<TableData> {
  const q = new URLSearchParams(location.search);
  const el = Number(q.get('el'));
  const seed = Number(q.get('seed'));
  return {
    startRound: el >= 1 && el <= CONTRACTS.length ? el - 1 : undefined,
    seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
  };
}

function urlRuleOrder(): RuleOrder | null {
  const m = new URLSearchParams(location.search).get('mod');
  return m === 'random' || m === 'rastgele' ? 'random' : m === 'klasik' || m === 'classic' ? 'classic' : null;
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* depolama yok */
  }
}

const VERSION = 'v0.5 · deneme sürümü';

/** Ana ekran: telefon için büyük dokunma alanları, tek bakışta oyun seçimi. */
export class MenuScene extends Phaser.Scene {
  private ruleOrder: RuleOrder = 'classic';
  private lastMode: GameMode = 'solo';
  private segClassic!: Button;
  private segRandom!: Button;
  private segHint!: Phaser.GameObjects.Text;
  private quickSub!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    createTextures(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());
    this.overlay = null;

    this.ruleOrder = urlRuleOrder() ?? (load('kut-rule-order') === 'random' ? 'random' : 'classic');
    this.lastMode = load('kut-last-mode') === 'team' ? 'team' : 'solo';

    this.buildTopBar();
    this.buildHero();
    this.buildPlayArea();
    this.buildSideCards();
    this.buildDock();
    txt(this, GAME_W - 14, 708, VERSION, 11, 'rgba(255,255,255,0.3)', 800).setOrigin(1, 1);

    this.renderOrder();

    const pen = this.registry.get('leavePenalty') as { kp: number; min: number } | undefined;
    if (pen) {
      this.registry.remove('leavePenalty');
      this.time.delayedCall(450, () =>
        showBubble(this, GAME_W / 2, 250, `Maçtan çıkış cezası: −${pen.kp} ${KP} · ${pen.min} dk online oyun yok`, UI.red, false),
      );
    }

    // Davet linki (?oda=ABCD) ya da yarım kalan online oda → lobiye git
    const invite = normalizeCode(new URLSearchParams(location.search).get('oda') ?? '');
    if (invite.length === 4 && !this.registry.get('inviteUsed')) {
      this.registry.set('inviteUsed', true);
      this.time.delayedCall(250, () => this.scene.start('lobby', { join: invite }));
      return;
    }
    if (connection.session) {
      this.time.delayedCall(250, () => this.scene.start('lobby', {}));
      return;
    }
    if (load('kut-seen-howto') !== '1') this.time.delayedCall(900, () => this.showHowTo());
    else this.time.delayedCall(900, () => showDailyPopup(this, () => this.refreshVideo()));
  }

  // ------------------------------------------------------------ üst çubuk

  private kpText!: Phaser.GameObjects.Text;
  private videoBtn!: Button;
  private videoBadge!: Phaser.GameObjects.Container;
  private videoBadgeT!: Phaser.GameObjects.Text;

  private buildTopBar() {
    const p = profile();
    const lvl = levelOf(p.xp);
    // profil çipi → profil ekranı (avatar + seviye yıldızı + isim + XP çubuğu)
    const g = this.add.graphics();
    panel(g, 16, 14, 292, 60, 30, UI.panel, 0.92, UI.stroke, 1);
    const av = this.add.graphics();
    av.fillStyle(0x06191b, 1);
    av.fillCircle(50, 44, 27);
    av.fillStyle(p.color, 1);
    av.fillCircle(50, 44, 24);
    av.fillStyle(0xffffff, 0.18);
    av.fillCircle(50, 37, 17);
    txt(this, 50, 45, p.avatar, 24, '#fff', 900).setOrigin(0.5);
    // seviye: safran çini yıldızı
    const st = this.add.graphics();
    st.fillStyle(0x06191b, 1);
    star8(st, 72, 64, 15, 0.7);
    st.fillStyle(UI.gold, 1);
    star8(st, 72, 64, 12.5, 0.7);
    txt(this, 72, 65, String(lvl), 12, '#5a3300', 900).setOrigin(0.5);
    txt(this, 92, 21, p.name, 20, '#fff', 900).setShadow(0, 2, 'rgba(0,0,0,0.35)', 0, true, false);
    const frac = (p.xp - xpForLevel(lvl)) / (xpForLevel(lvl + 1) - xpForLevel(lvl));
    const xb = this.add.graphics();
    xb.fillStyle(0x06191b, 0.85);
    xb.fillRoundedRect(92, 50, 198, 12, 6);
    xb.fillStyle(0x5fe08a, 1);
    xb.fillRoundedRect(94, 52, Math.max(8, 194 * frac), 8, 4);
    xb.fillStyle(0xffffff, 0.35);
    xb.fillRoundedRect(96, 53, Math.max(4, 190 * frac), 3, 2);
    this.add.zone(162, 44, 292, 60).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('profile', { tab: 0 }));

    // Küt Puanı: koyu hap + jeton + yeşil "+" (mağaza)
    const kg = this.add.graphics();
    kg.fillStyle(0x06191b, 0.9);
    kg.fillRoundedRect(328, 22, 206, 44, 22);
    kg.lineStyle(2, UI.gold, 0.55);
    kg.strokeRoundedRect(328, 22, 206, 44, 22);
    this.add.image(340, 44, 'coin').setScale(0.66);
    this.kpText = txt(this, 370, 44, fmt(p.kp), 25, '#ffffff', 900).setOrigin(0, 0.5).setStroke('#06191b', 4);
    this.add.zone(431, 44, 206, 44).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('profile', { tab: 2 }));
    new Button(this, 514, 44, 42, 42, '', () => this.scene.start('profile', { tab: 2 }), UI.green).setIcon(icon('plus'), 22);

    // ücretsiz KP (ödüllü video) + ayarlar
    this.videoBtn = new Button(this, 1100, 44, 176, 56, '', () => this.watchVideo(), UI.amber, 18).setIcon(icon('video'), 30);
    this.videoBadge = this.add.container(1180, 20);
    const bb = this.add.graphics();
    bb.fillStyle(0x06191b, 1);
    bb.fillCircle(0, 0, 13);
    bb.fillStyle(0xe8483c, 1);
    bb.fillCircle(0, 0, 11);
    this.videoBadgeT = txt(this, 0, 0.5, '', 12, '#fff', 900).setOrigin(0.5);
    this.videoBadge.add([bb, this.videoBadgeT]).setDepth(5);
    new Button(this, 1236, 44, 56, 56, '', () => this.showSettings(), UI.slate).setIcon(icon('gear'), 32);
    this.refreshVideo();
  }

  private refreshVideo() {
    const left = videosLeft();
    this.videoBtn.setLabel(left > 0 ? `+${VIDEO_REWARD}` : 'Yarın').setEnabled(left > 0);
    this.videoBadge.setVisible(left > 0);
    this.videoBadgeT.setText(String(left));
    this.kpText.setText(fmt(profile().kp));
  }

  // ------------------------------------------------------------ ayarlar

  private showSettings() {
    this.overlay?.destroy();
    const c = this.add.container(0, 0).setDepth(1000);
    this.overlay = c;
    c.add(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive());
    const W = 440;
    const H = 400;
    const x0 = GAME_W / 2 - W / 2;
    const y0 = GAME_H / 2 - H / 2;
    const g = this.add.graphics();
    panel(g, x0, y0, W, H, 22, UI.panel, 0.98, UI.stroke, 1);
    c.add(g);
    c.add(header(this, GAME_W / 2, y0, 'AYARLAR'));
    const close = () => {
      this.tweens.add({ targets: c, alpha: 0, duration: 120, onComplete: () => c.destroy() });
      this.overlay = null;
    };
    c.add(new Button(this, x0 + W - 8, y0 + 8, 46, 46, '', close, UI.red).setIcon(icon('close'), 22));
    const sound = new Button(this, GAME_W / 2, y0 + 110, 320, 60, '', () => {
      sfx.setMuted(!sfx.muted);
      sfx.unlock();
      paint();
    }, UI.slate, 20);
    const paint = () => sound.setLabel(sfx.muted ? 'Ses: Kapalı' : 'Ses: Açık').setIcon(icon(sfx.muted ? 'mute' : 'sound'), 30);
    paint();
    c.add(sound);
    c.add(new Button(this, GAME_W / 2, y0 + 190, 320, 60, 'Nasıl Oynanır', () => this.showHowTo(), UI.blue, 20).setIcon(icon('book'), 30));
    c.add(new Button(this, GAME_W / 2, y0 + 270, 320, 60, 'Öğreticiyi Oyna', () => this.startTutorial(), UI.amber, 20).setIcon(icon('cap'), 32));
    c.add(txt(this, GAME_W / 2, y0 + H - 34, VERSION, 13, UI.muted, 800).setOrigin(0.5));
    popIn(this, c);
  }

  private async watchVideo() {
    if (videosLeft() <= 0) return;
    const ok = await playRewardedVideo(this, `+${VIDEO_REWARD} ${KP}`);
    if (ok) showGain(this, grant(VIDEO_REWARD));
    this.refreshVideo();
  }

  // ------------------------------------------------------------ başlık

  private buildHero() {
    // Logo: K-Ü-T basılı üç büyük okey taşı; arkada yan yatmış bir okey. Sırayla masaya "küt" diye iner.
    const cy = 148;
    const joker = this.add.image(GAME_W / 2 + 142, cy - 4, 'tile-joker').setScale(0.5).setAngle(16).setAlpha(0);
    this.tweens.add({ targets: joker, alpha: 1, angle: 20, duration: 500, delay: 760, ease: 'Back.easeOut' });
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillEllipse(GAME_W / 2, cy + 64, 300, 26);
    ['logo-K', 'logo-Ü', 'logo-T'].forEach((k, i) => {
      const img = this.add
        .image(GAME_W / 2 + (i - 1) * 84, -120, k)
        .setScale(0.74)
        .setAngle((i - 1) * 5);
      this.tweens.add({
        targets: img,
        y: cy + Math.abs(i - 1) * 6,
        duration: 420,
        delay: 140 + i * 160,
        ease: 'Bounce.easeOut',
        onStart: () => this.time.delayedCall(260, () => sfx.tok()),
      });
      this.tweens.add({ targets: img, y: '+=3', duration: 1800 + i * 150, delay: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    // alt başlık: küçük turkuaz şerit
    const sub = this.add.container(GAME_W / 2, 236);
    const sg = this.add.graphics();
    sg.fillStyle(0x06191b, 0.9);
    sg.fillRoundedRect(-118, -17, 236, 34, 17);
    sg.lineStyle(2, UI.stroke, 0.8);
    sg.strokeRoundedRect(-118, -17, 236, 34, 17);
    sg.fillStyle(UI.gold, 1);
    star8(sg, -100, 0, 5);
    star8(sg, 100, 0, 5);
    sub.add([sg, txt(this, 0, 1, 'KURAL OKEY', 17, UI.cream, 900, { letterSpacing: 5 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5)]);
  }

  // ------------------------------------------------------------ oyna: mod + kural sırası + büyük buton

  private segSolo!: Button;
  private segTeam!: Button;

  private buildPlayArea() {
    const y = 300;
    // iki segmentli seçici: oyun modu ve kural sırası (koyu oluklar içinde)
    const g = this.add.graphics();
    for (const cx of [GAME_W / 2 - 166, GAME_W / 2 + 166]) {
      g.fillStyle(0x06191b, 0.75);
      g.fillRoundedRect(cx - 158, y - 34, 316, 68, 24);
      g.lineStyle(2, UI.stroke, 0.35);
      g.strokeRoundedRect(cx - 158, y - 34, 316, 68, 24);
    }
    const seg = (x: number, label: string, ic: IconName, fn: () => void) =>
      new Button(this, x, y, 150, 54, label, fn, UI.slate, 20).setIcon(icon(ic), 26);
    this.segSolo = seg(GAME_W / 2 - 243, 'Tekli', 'user', () => this.setMode('solo'));
    this.segTeam = seg(GAME_W / 2 - 89, 'Takım', 'team', () => this.setMode('team'));
    this.segClassic = seg(GAME_W / 2 + 89, 'Sıralı', 'list', () => this.setOrder('classic'));
    this.segRandom = seg(GAME_W / 2 + 243, 'Rastgele', 'dice', () => this.setOrder('random'));

    const play = new Button(this, GAME_W / 2, 412, 360, 104, 'OYNA', () => this.start(this.lastMode), UI.green, 44).setIcon(icon('play'), 50);
    this.tweens.add({ targets: play, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.quickSub = txt(this, GAME_W / 2, 474, '', 20, UI.cream, 900).setOrigin(0.5, 0);
    this.segHint = txt(this, GAME_W / 2, 504, '', 17, UI.muted, 800, { align: 'center', wordWrap: { width: 620 } }).setOrigin(0.5, 0);
    const info = new Button(this, GAME_W / 2 + 354, y, 44, 44, '?', () => this.showHowTo(this.ruleOrder === 'random' ? 3 : 1), UI.slate, 20);
    void info;
  }

  private setMode(m: GameMode) {
    if (this.lastMode === m) return;
    this.lastMode = m;
    save('kut-last-mode', m);
    this.renderOrder();
  }

  private setOrder(o: RuleOrder) {
    if (this.ruleOrder === o) return;
    this.ruleOrder = o;
    save('kut-rule-order', o);
    this.renderOrder();
  }

  private renderOrder() {
    const random = this.ruleOrder === 'random';
    const team = this.lastMode === 'team';
    this.segSolo.setSelected(!team, UI.slate);
    this.segTeam.setSelected(team, UI.slate);
    this.segClassic.setSelected(!random, UI.slate);
    this.segRandom.setSelected(random, UI.slate);
    this.quickSub.setText(team ? "2'ye 2 takım · karşındaki ortağın" : '1 kişi + 3 bot');
    this.segHint.setText(
      random
        ? 'Rastgele: her elin kuralı oranlarla çekilir · ilk el bile 5\'li seri olabilir'
        : `Sıralı: ${CONTRACTS.length} el · 3'lü küt → … → elden bitme → çift eli`,
    );
  }

  // ------------------------------------------------------------ yan kartlar (okey taşı biçiminde)

  private buildSideCards() {
    const online = connection.available;
    this.tileCard(156, 400, 'Online', 'Arkadaşlarınla\noda kur', 'globe', 0x8a55ec, online ? undefined : 'YAKINDA', 0, () => {
      const left = onlineLockLeft();
      if (left > 0) {
        const m = Math.floor(left / 60_000);
        const s = Math.ceil((left % 60_000) / 1000);
        showBubble(this, 156, 262, `Çıkış cezası: ${m > 0 ? `${m} dk ` : ''}${s} sn`, UI.red, false);
        sfx.error();
        return;
      }
      this.scene.start('lobby', {});
    });
    const done = load('kut-tutorial-done') === '1';
    this.tileCard(1124, 400, 'Öğretici', 'Adım adım\nöğren', 'cap', 0xffa928, undefined, 1, () => this.startTutorial(), done ? undefined : '2 DK');
  }

  /** Büyük okey taşı gibi görünen kart: krem yüz, alt kalınlık, renkli ikon yuvarlağı. */
  private tileCard(
    x: number,
    y: number,
    title: string,
    sub: string,
    ic: IconName,
    color: number,
    locked: string | undefined,
    i: number,
    onTap: () => void,
    badge?: string,
  ) {
    const w = 196;
    const h = 236;
    const c = this.add.container(x, y + 40).setAlpha(0);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2 + 2, -h / 2 + 10, w, h, 26);
    g.fillStyle(0x06191b, 1);
    g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 28);
    g.fillStyle(0xcdb98e, 1); // taşın kalınlığı
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 26);
    g.fillStyle(0xfff8ea, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h - 10, 26);
    g.fillStyle(0xffffff, 0.7);
    g.fillRoundedRect(-w / 2 + 10, -h / 2 + 8, w - 20, 16, 8);
    // ikon yuvarlağı
    g.fillStyle(0x06191b, 0.25);
    g.fillCircle(0, -40, 50);
    g.fillStyle(color, 1);
    g.fillCircle(0, -44, 46);
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(0, -58, 30);
    c.add(g);
    c.add(this.add.image(0, -44, icon(ic)).setScale(0.58));
    c.add(txt(this, 0, 26, title, 29, '#123c41', 900).setOrigin(0.5));
    c.add(txt(this, 0, 50, sub, 17, '#4d6b68', 800, { align: 'center', lineSpacing: 2 }).setOrigin(0.5, 0));
    const tag = locked ?? badge;
    if (tag) {
      const bg = this.add.graphics();
      bg.fillStyle(0x06191b, 1);
      bg.fillRoundedRect(w / 2 - 74, -h / 2 - 12, 82, 28, 14);
      bg.fillStyle(locked ? 0x8a9a98 : 0xe8483c, 1);
      bg.fillRoundedRect(w / 2 - 72, -h / 2 - 10, 78, 24, 12);
      c.add(bg);
      c.add(txt(this, w / 2 - 33, -h / 2 + 2, tag, 12, '#fff', 900).setOrigin(0.5));
    }
    if (locked) c.setAlpha(0.75);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: !locked });
    c.on('pointerdown', () => {
      if (locked) {
        sfx.error();
        showBubble(this, x, y - h / 2 - 22, 'Online sunucu henüz yayında değil', UI.gold);
        return;
      }
      sfx.select();
      this.tweens.add({ targets: c, scale: 0.94, duration: 70, yoyo: true, onComplete: () => onTap() });
    });
    this.tweens.add({ targets: c, alpha: locked ? 0.75 : 1, y, duration: 420, delay: 600 + i * 120, ease: 'Back.easeOut' });
    // hafif süzülme
    this.tweens.add({ targets: c, angle: i ? 1 : -1, duration: 2200, delay: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ------------------------------------------------------------ alt sekme çubuğu

  private buildDock() {
    const items: { label: string; ic: IconName; color: number; onTap: () => void }[] = [
      { label: 'Profil', ic: 'user', color: UI.blue, onTap: () => this.scene.start('profile', { tab: 0 }) },
      { label: 'Rozetler', ic: 'trophy', color: UI.amber, onTap: () => this.scene.start('profile', { tab: 1 }) },
      { label: 'Mağaza', ic: 'shop', color: 0x5b3f8f, onTap: () => this.scene.start('profile', { tab: 2 }) },
      { label: 'Kurallar', ic: 'book', color: UI.green, onTap: () => this.showHowTo() },
    ];
    const w = 560;
    const x0 = GAME_W / 2 - w / 2;
    const y = 656;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x0, y - 40 + 6, w, 84, 30);
    g.fillStyle(0x06191b, 0.92);
    g.fillRoundedRect(x0, y - 40, w, 84, 30);
    g.lineStyle(2, UI.stroke, 0.45);
    g.strokeRoundedRect(x0, y - 40, w, 84, 30);
    items.forEach((it, i) => {
      const cx = x0 + 70 + i * 140;
      new Button(this, cx, y - 8, 64, 58, '', it.onTap, it.color).setIcon(icon(it.ic), 32);
      txt(this, cx, y + 31, it.label, 16, UI.cream, 900).setOrigin(0.5);
    });
  }

  private startTutorial() {
    haptic(12);
    this.cameras.main.fadeOut(220, 7, 29, 21);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('table', { mode: 'solo', tutorial: true } satisfies TableData));
  }

  private start(mode: GameMode) {
    save('kut-last-mode', mode);
    haptic(12);
    this.cameras.main.fadeOut(220, 7, 29, 21);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('table', { mode, ruleOrder: this.ruleOrder, ...urlOptions() } satisfies TableData),
    );
  }

  // ------------------------------------------------------------ nasıl oynanır

  private showHowTo(page = 0) {
    save('kut-seen-howto', '1');
    this.overlay?.destroy();
    const c = this.add.container(0, 0).setDepth(1000);
    this.overlay = c;
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.65).setOrigin(0).setInteractive();
    c.add(dim);
    const W = 1000;
    const H = 640;
    const x0 = GAME_W / 2 - W / 2;
    const y0 = GAME_H / 2 - H / 2;
    const g = this.add.graphics();
    panel(g, x0, y0, W, H, 24, 0x0c2c21, 0.98, UI.gold, 0.9);
    c.add(g);
    c.add(header(this, GAME_W / 2, y0, 'NASIL OYNANIR'));

    const tabs = ['Temel', `Eller (${CONTRACTS.length})`, 'Kural & İşleme', 'Puan & Modlar'];
    const body = txt(this, x0 + 44, y0 + 130, '', 21, UI.cream, 700, { lineSpacing: 8, wordWrap: { width: W - 88 } });
    c.add(body);
    const tabBtns: Button[] = [];
    const pages = this.howToPages();
    const show = (p: number) => {
      body.setText(pages[p]).setFontSize(p === 1 ? 17 : 21).setLineSpacing(p === 1 ? 5 : 8);
      tabBtns.forEach((b, i) => b.setSelected(i === p, UI.slate));
      body.setAlpha(0);
      this.tweens.add({ targets: body, alpha: 1, duration: 160 });
    };
    tabs.forEach((t, i) => {
      const b = new Button(this, GAME_W / 2 + (i - 1.5) * 232, y0 + 92, 220, 50, t, () => show(i), UI.slate, 17);
      tabBtns.push(b);
      c.add(b);
    });
    c.add(
      new Button(this, GAME_W / 2 - 130, y0 + H - 46, 230, 58, 'Anladım', () => {
        this.tweens.add({ targets: c, alpha: 0, duration: 140, onComplete: () => c.destroy() });
        this.overlay = null;
      }, UI.slate, 20),
    );
    c.add(
      new Button(this, GAME_W / 2 + 130, y0 + H - 46, 230, 58, 'Öğreticiyi Oyna', () => this.startTutorial(), UI.green, 18).setIcon(icon('cap'), 28),
    );
    show(page);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  private howToPages(): string[] {
    const odds = CONTRACTS.map((k, i) => `${k.name} %${RANDOM_WEIGHTS[i]}`).join(' · ');
    return [
      [
        '•  Taşlar: 4 renk, 1–13, her taştan iki tane + sahte okey simgeli 2 okey (joker).',
        '•  Küt: aynı sayı, farklı renk (kırmızı 7 · sarı 7 · mavi 7).',
        '•  Seri: aynı renk, ardışık (mavi 4-5-6). Başa sarma yok: 12-13-1 olmaz.',
        '•  Herkese 14 taş; başlayana 15. Başlayanın fazlalık taşı herkese gösterilir.',
        '•  Sıran gelince ortadaki desteden ya da soldakinin attığı taştan çek, oyna, bir taş at.',
        '•  İstek: sıradaki yan taşı almazsa diğerleri ortadaki üst taşla birlikte isteyebilir; sıradaki sonra ortadan çeker.',
      ].join('\n'),
      CONTRACTS.map((k, i) => `${String(i + 1).padStart(2, '\u2007')}.  ${k.name} — ${k.description}`).join('\n'),
      [
        '•  Her elin bir kuralı var (ör. 3\'lü küt). Kuralı açmadan per dizemez, işleyemez, bitemezsin.',
        '•  Kuralı açtığın sırada sadece kural iner; fazlalıklar sonraki sırada.',
        '•  Sonraki sıralarında per dizer, yerdeki perlere taş işlersin; bitebiliyorsan bitersin.',
        '•  Okeyi al: yerdeki okeyin yerini tutan taşı koy, okey senin olur, perin sahibine +50.',
        '•  İşlek taş (pere işlenebilen ya da okeyin yerini tutan) mavi parlar. Atarsan geri gelir, ortadan 1 taş daha çekersin, +50 ceza yersin ve sıra geçer.',
        '•  Son taşın kalınca onu ortaya vur ve bit ("Bitir!"); son taş işlek olsa da ceza yok.',
      ].join('\n'),
      [
        '•  Biten −50. Diğerleri elde kalanı yazar: 1–9 kendi sayısı, 10 ve üstü 10, okey 25.',
        '•  Okey ile bitiş ×2 (−100), çift okey ×4 (−200). Çift Eli\'nde her şey ayrıca ×2.',
        '•  Takım: karşılıklı oturanlar ortaktır; karşı takım iki elin toplamını yazar.',
        `•  ${CONTRACTS.length} el sonunda en düşük toplam puan kazanır.`,
        `•  Sıralı mod: kurallar 1→${CONTRACTS.length}. Rastgele mod: her el oranlarla çekilir, aynı kural art arda gelmez, en fazla ${RANDOM_MAX_REPEAT} kez gelir.`,
        `•  Oranlar: ${odds}`,
      ].join('\n'),
    ];
  }
}
