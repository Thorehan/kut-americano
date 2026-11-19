import Phaser from 'phaser';
import { CONTRACTS, GameMode, RANDOM_MAX_REPEAT, RANDOM_WEIGHTS, RuleOrder, normalizeCode } from '@kut/core';
import type { OnlineController } from '../controller';
import { connection } from '../net/connection';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { panel, txt } from '../ui/text';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import { haptic, sfx } from '../sfx';
import { KP, VIDEO_REWARD, grant, levelOf, profile, videosLeft, xpForLevel } from '../profile';
import { fmt, showDailyPopup, showGain } from '../ui/rewards';
import { playRewardedVideo } from '../ui/videoAd';
import { showBubble } from '../view/SeatView';

export interface TableData {
  mode: GameMode;
  /** Online oyunda sunucuya bağlı kontrolcü. */
  online?: OnlineController;
  /** Kısa öğretici eli. */
  tutorial?: boolean;
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

interface CardSpec {
  x: number;
  title: string;
  sub: string;
  color: number;
  tiles: string[];
  locked?: string;
  onTap: () => void;
}

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
    this.buildRuleToggle();
    this.buildQuickPlay();
    this.buildModeCards();
    txt(this, GAME_W / 2, 704, VERSION, 12, 'rgba(255,255,255,0.35)', 800).setOrigin(0.5, 1);

    this.renderOrder();

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

  private buildTopBar() {
    const p = profile();
    const lvl = levelOf(p.xp);
    // profil çipi → profil ekranı
    const g = this.add.graphics();
    panel(g, 16, 12, 270, 56, 28, UI.panel, 0.9, UI.stroke, 1);
    const av = this.add.graphics();
    av.fillStyle(p.color, 1);
    av.fillCircle(44, 40, 21);
    av.lineStyle(2, 0xffffff, 0.7);
    av.strokeCircle(44, 40, 21);
    txt(this, 44, 41, p.avatar, 22, '#fff', 900).setOrigin(0.5);
    txt(this, 74, 19, p.name, 16, '#fff', 900);
    txt(this, 74, 40, `Seviye ${lvl}`, 12, UI.goldHex, 900);
    const xb = this.add.graphics();
    const frac = (p.xp - xpForLevel(lvl)) / (xpForLevel(lvl + 1) - xpForLevel(lvl));
    xb.fillStyle(0x000000, 0.35);
    xb.fillRoundedRect(140, 45, 130, 8, 4);
    xb.fillStyle(UI.gold, 1);
    xb.fillRoundedRect(140, 45, Math.max(6, 130 * frac), 8, 4);
    this.add.zone(151, 40, 270, 56).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('profile', { tab: 0 }));

    // Küt Puanı çipi + video
    const kg = this.add.graphics();
    panel(kg, 298, 12, 190, 56, 28, UI.panel, 0.9, UI.gold, 0.8);
    this.add.image(328, 40, 'coin').setScale(0.5);
    this.kpText = txt(this, 350, 40, fmt(p.kp), 21, UI.goldHex, 900).setOrigin(0, 0.5);
    this.add.zone(393, 40, 190, 56).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('profile', { tab: 2 }));
    this.videoBtn = new Button(this, 572, 40, 150, 56, '', () => this.watchVideo(), UI.green, 15);
    this.refreshVideo();

    const soundBtn = new Button(this, 1012, 40, 120, 56, sfx.muted ? 'Ses ✗' : 'Ses ✓', () => {
      sfx.setMuted(!sfx.muted);
      sfx.unlock();
      soundBtn.setLabel(sfx.muted ? 'Ses ✗' : 'Ses ✓');
    }, UI.slate, 16);
    new Button(this, 1150, 40, 140, 56, 'Nasıl Oynanır', () => this.showHowTo(), UI.amber, 15);
    new Button(this, 872, 40, 140, 56, 'Mağaza', () => this.scene.start('profile', { tab: 2 }), 0x5b3f8f, 16);
  }

  private refreshVideo() {
    const left = videosLeft();
    this.videoBtn.setLabel(left > 0 ? `🎬 +${VIDEO_REWARD} ${KP}
${left}/5 bugün` : '🎬 Yarın').setEnabled(left > 0);
    this.kpText.setText(fmt(profile().kp));
  }

  private async watchVideo() {
    if (videosLeft() <= 0) return;
    const ok = await playRewardedVideo(this, `+${VIDEO_REWARD} ${KP}`);
    if (ok) showGain(this, grant(VIDEO_REWARD));
    this.refreshVideo();
  }

  // ------------------------------------------------------------ başlık

  private buildHero() {
    const deco = ['tile-red-7', 'tile-yellow-7', 'tile-blue-7', 'tile-joker', 'tile-black-7'];
    deco.forEach((k, i) => {
      const img = this.add
        .image(GAME_W / 2 - 128 + i * 64, -80, k)
        .setScale(0.5)
        .setAngle((i - 2) * 6);
      this.tweens.add({ targets: img, y: 122 + Math.abs(i - 2) * 6, duration: 620, delay: 120 + i * 90, ease: 'Back.easeOut' });
      // hafif süzülme
      this.tweens.add({ targets: img, y: '+=4', duration: 1600 + i * 120, delay: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const title = txt(this, GAME_W / 2, 200, 'KÜT', 64, UI.goldHex, 900).setOrigin(0.5).setShadow(0, 5, 'rgba(0,0,0,0.5)', 10);
    title.setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 500, delay: 550, ease: 'Back.easeOut' });
    txt(this, GAME_W / 2, 242, 'KURAL OKEY', 15, UI.cream, 900, { letterSpacing: 6 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5);
  }

  // ------------------------------------------------------------ kural sırası

  private buildRuleToggle() {
    const y = 296;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(GAME_W / 2 - 214, y - 30, 428, 60, 30);
    this.segClassic = new Button(this, GAME_W / 2 - 106, y, 204, 48, 'Sıralı Kurallar', () => this.setOrder('classic'), UI.slate, 16);
    this.segRandom = new Button(this, GAME_W / 2 + 106, y, 204, 48, '🎲 Rastgele Mod', () => this.setOrder('random'), UI.slate, 16);
    this.segHint = txt(this, GAME_W / 2, y + 38, '', 14, UI.muted, 800).setOrigin(0.5, 0);
    const info = new Button(this, GAME_W / 2 + 244, y, 44, 44, '?', () => this.showHowTo(this.ruleOrder === 'random' ? 2 : 1), UI.slate, 18);
    void info;
  }

  private setOrder(o: RuleOrder) {
    if (this.ruleOrder === o) return;
    this.ruleOrder = o;
    save('kut-rule-order', o);
    this.renderOrder();
  }

  private renderOrder() {
    const random = this.ruleOrder === 'random';
    this.segClassic.setSelected(!random, UI.slate);
    this.segRandom.setSelected(random, UI.slate);
    this.segHint.setText(
      random ? `Her elin kuralı oranlarla çekilir · ilk el bile 5'li seri olabilir` : '11 el, kurallar sırayla: 3\'lü küt → … → çift eli',
    );
    this.quickSub?.setText(`${this.lastMode === 'team' ? 'Takım' : 'Tekli'} · ${random ? 'Rastgele' : 'Sıralı'}`);
  }

  // ------------------------------------------------------------ hızlı oyun

  private buildQuickPlay() {
    const y = 400;
    const btn = new Button(this, GAME_W / 2, y, 380, 84, 'HIZLI OYUN  ▶', () => this.start(this.lastMode), UI.green, 26);
    this.tweens.add({ targets: btn, scale: 1.035, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.quickSub = txt(this, GAME_W / 2, y + 50, '', 15, UI.cream, 800).setOrigin(0.5, 0);

    // Öğretici: kısa, rehberli tek el
    const done = load('kut-tutorial-done') === '1';
    new Button(this, GAME_W / 2 + 320, y, 200, 64, '🎓 Öğretici', () => this.startTutorial(), UI.amber, 18);
    if (!done) {
      const bg = this.add.graphics();
      bg.fillStyle(UI.gold, 1);
      bg.fillRoundedRect(GAME_W / 2 + 320 + 48, y - 44, 56, 20, 10);
      txt(this, GAME_W / 2 + 320 + 76, y - 34, '2 DK', 11, '#2a1d02', 900).setOrigin(0.5);
    }
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

  // ------------------------------------------------------------ mod kartları

  private buildModeCards() {
    const specs: CardSpec[] = [
      { x: 330, title: 'Tekli', sub: '1 kişi + 3 bot', color: UI.green, tiles: ['tile-red-5', 'tile-red-6', 'tile-red-7'], onTap: () => this.start('solo') },
      {
        x: 640,
        title: 'Takım',
        sub: "2'ye 2 · karşın ortağın",
        color: UI.blue,
        tiles: ['tile-blue-9', 'tile-yellow-9', 'tile-black-9'],
        onTap: () => this.start('team'),
      },
      {
        x: 950,
        title: 'Online Oda',
        sub: 'Arkadaşlarınla oda kodu',
        color: 0x7a4bb8,
        tiles: ['tile-back', 'tile-joker', 'tile-back'],
        locked: connection.available ? undefined : 'SUNUCU YOK',
        onTap: () => this.scene.start('lobby', {}),
      },
    ];
    specs.forEach((sp, i) => this.modeCard(sp, i));
  }

  private modeCard(sp: CardSpec, i: number) {
    const w = 290;
    const h = 150;
    const y = 586;
    const c = this.add.container(sp.x, y + 40).setAlpha(0);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 22);
    g.fillStyle(sp.color, sp.locked ? 0.55 : 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4, { tl: 18, tr: 18, bl: 6, br: 6 });
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    c.add(g);
    sp.tiles.forEach((k, j) => c.add(this.add.image(-w / 2 + 52 + j * 30, 2, k).setScale(0.36).setAngle((j - 1) * 7)));
    c.add(txt(this, -w / 2 + 140, -26, sp.title, 26, '#fff', 900).setShadow(0, 2, 'rgba(0,0,0,0.3)', 2));
    c.add(txt(this, -w / 2 + 140, 10, sp.sub, 15, 'rgba(255,255,255,0.9)', 800, { wordWrap: { width: 140 } }));
    if (sp.locked) {
      const bg = this.add.graphics();
      bg.fillStyle(UI.gold, 1);
      bg.fillRoundedRect(w / 2 - 92, -h / 2 + 12, 80, 22, 11);
      c.add(bg);
      c.add(txt(this, w / 2 - 52, -h / 2 + 23, sp.locked, 11, '#2a1d02', 900).setOrigin(0.5));
    }
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: !sp.locked });
    c.on('pointerdown', () => {
      if (sp.locked) {
        sfx.error();
        showBubble(this, sp.x, y - h / 2 - 18, 'Online sunucu henüz yayında değil', UI.gold);
        return;
      }
      sfx.select();
      this.tweens.add({ targets: c, scale: 0.95, duration: 70, yoyo: true, onComplete: () => sp.onTap() });
    });
    this.tweens.add({ targets: c, alpha: 1, y, duration: 420, delay: 700 + i * 110, ease: 'Back.easeOut' });
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
    c.add(txt(this, GAME_W / 2, y0 + 22, 'NASIL OYNANIR', 24, UI.goldHex, 900).setOrigin(0.5, 0));

    const tabs = ['Temel', 'Kural & İşleme', 'Puan & Modlar'];
    const body = txt(this, x0 + 44, y0 + 130, '', 21, UI.cream, 700, { lineSpacing: 8, wordWrap: { width: W - 88 } });
    c.add(body);
    const tabBtns: Button[] = [];
    const pages = this.howToPages();
    const show = (p: number) => {
      body.setText(pages[p]);
      tabBtns.forEach((b, i) => b.setSelected(i === p, UI.slate));
      body.setAlpha(0);
      this.tweens.add({ targets: body, alpha: 1, duration: 160 });
    };
    tabs.forEach((t, i) => {
      const b = new Button(this, GAME_W / 2 + (i - 1) * 230, y0 + 92, 216, 50, t, () => show(i), UI.slate, 17);
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
      new Button(this, GAME_W / 2 + 130, y0 + H - 46, 230, 58, '🎓 Öğreticiyi Oyna', () => this.startTutorial(), UI.green, 18),
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
        '•  İstek: sıradaki oyuncu yan taşı almazsa diğerleri ortadan 1 taşla birlikte isteyebilir.',
      ].join('\n'),
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
        '•  11 el sonunda en düşük toplam puan kazanır.',
        `•  Sıralı mod: kurallar 1→11. Rastgele mod: her el oranlarla çekilir, aynı kural art arda gelmez, en fazla ${RANDOM_MAX_REPEAT} kez gelir.`,
        `•  Oranlar: ${odds}`,
      ].join('\n'),
    ];
  }
}
