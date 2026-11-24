import Phaser from 'phaser';
import { Action, Color, Game, GameState, Tile, asKut, asSeri } from '@kut/core';
import { GAME_H, GAME_W, UI } from './layout';
import { haptic, sfx } from './sfx';
import { award } from './profile';
import { showBadge } from './ui/rewards';
import { Button } from './ui/Button';
import { panel, txt } from './ui/text';

/**
 * Kısa öğretici (~2 dk): hazır dağıtılmış bir 3'lü Küt eli. Oyuncu sırasıyla
 * kuralı açar, taş atar, çeker, per dizer, işler, okeyi alır ve son taşla biter.
 * Her adımda ekran kararır; seçilecek taş ve gidilecek yer yuvarlak ışıkla gösterilir.
 * Karartma dokunmayı engellemez: oyuncu yine istediği gibi oynayabilir.
 * Son adımda isteğe bağlı "okeyle bitiş" örneği açılır (stage 'okey').
 */

export type TutorialStage = 'basic' | 'okey';

const C: Record<string, Color> = { r: 'red', y: 'yellow', b: 'blue', k: 'black' };
/** Öğretici kutusunun üst kenarı ve genişliği (kural panelinin altında, destenin üstünde). */
const BOX_TOP = 84;
/** Üst köşelerdeki atılan taş yığınları (x≈206 ve x≈1074) açıkta kalsın diye dar. */
const BOX_W = 760;

/** Öğretici eli: taşlar gerçek taş setinden seçilir (id'ler benzersiz kalsın). */
export function setupTutorialGame(game: Game, stage: TutorialStage = 'basic') {
  const s = game.state;
  const pool: Tile[] = [...s.deck, ...s.players.flatMap((p) => p.hand)];
  const take = (spec: string): Tile => {
    const i = pool.findIndex((t) => (spec === 'J' ? t.joker : !t.joker && t.color === C[spec[0]] && t.value === Number(spec.slice(1))));
    if (i < 0) throw new Error('öğretici taşı yok: ' + spec);
    return pool.splice(i, 1)[0];
  };
  const many = (spec: string) => spec.split(' ').map(take);
  const me = s.players[0];
  const bot1 = s.players[1];

  if (stage === 'okey') {
    // Okeyle bitiş örneği: elde okey + mavi 6 + sarı 11. İkisi işlenir, okey ortaya vurulur.
    me.hand = many('J b6 y11');
    me.opened = true;
    me.openedThisTurn = false;
    s.melds = [
      { ...asKut(many('r7 b7 k7'))!, id: 921, owner: 0 },
      { ...asSeri(many('y4 y5 y6'))!, id: 922, owner: 0 },
      { ...asSeri(many('r1 r2 r3 r4'))!, id: 901, owner: 1 },
      { ...asSeri(many('b3 b4 b5'))!, id: 911, owner: 1 },
      { ...asSeri(many('y8 y9 y10'))!, id: 912, owner: 3 },
    ];
    for (const seat of [1, 3]) s.players[seat].opened = true;
    const safe = (t: Tile) => !t.joker && !(t.color === 'blue' && (t.value === 2 || t.value === 6)) && !(t.color === 'yellow' && (t.value === 7 || t.value === 11)) && !(t.color === 'red' && t.value === 5);
    const filler = pool.filter(safe);
    const rest = pool.filter((t) => !safe(t));
    bot1.hand = filler.splice(0, 6);
    s.players[2].hand = filler.splice(0, 8);
    s.players[3].hand = filler.splice(0, 8);
    s.deck = [...rest, ...filler];
    s.extraTile = me.hand[1];
    s.turnJokers = 1;
  } else {
    me.hand = many('r7 b7 k7 y4 y5 y6 r4 b9 y12 y13 k1');
    me.opened = false;
    // Bot 1 kuralını açmış: kırmızı 1-2-3 serisi ve okeyli 9 kütü yerde.
    bot1.opened = true;
    const seri = asSeri(many('r1 r2 r3'))!;
    const kut = asKut(many('y9 k9 r9 J'))!;
    s.melds = [
      { ...seri, id: 901, owner: 1 },
      { ...kut, id: 902, owner: 1 },
    ];
    const deckTop = take('k2'); // oyuncunun çekeceği taş
    const side = take('k11'); // Bot 3'ün oyuncuya atacağı, işe yaramayan yan taş
    // Botlara işe yaramaz (işlek olmayan) taşlar ver
    const safe = (t: Tile) => !t.joker && !(t.color === 'red' && t.value <= 5) && t.value !== 9 && !(t.color === 'yellow' && (t.value === 3 || t.value === 7 || t.value === 11));
    const filler = pool.filter(safe);
    const rest = pool.filter((t) => !safe(t));
    bot1.hand = filler.splice(0, 8);
    s.players[2].hand = filler.splice(0, 14);
    s.players[3].hand = [...filler.splice(0, 13), side];
    s.deck = [...rest, ...filler, deckTop]; // pop() → en sondaki çekilir
    s.extraTile = me.hand[me.hand.length - 1];
    s.turnJokers = 0;
  }
  s.starter = 0;
  s.current = 0;
  s.phase = 'action';
  s.pendingDiscard = null;
  s.claim = null;
}

/** Öğreticide botlar sade oynar: yan taşı alıp aynısını atar, istemez, açmaz. */
export function tutorialBotAction(game: Game, seat: number, lastGot: Map<number, number>): Action {
  const s = game.state;
  if (s.phase === 'claim') return { type: 'claim', want: false };
  if (s.phase === 'draw') return s.pendingDiscard ? { type: 'takeDiscard' } : { type: 'drawDeck' };
  const hand = s.players[seat].hand;
  // Bot 3 oyuncuya işe yaramayan siyah 11'i atar (öğretici "yan taşı alma" adımı için)
  const scripted = seat === 3 ? hand.find((t) => !t.joker && t.color === 'black' && t.value === 11) : undefined;
  const id = lastGot.get(seat);
  const tile = scripted ?? hand.find((t) => t.id === id) ?? hand[hand.length - 1];
  return { type: 'discard', tileId: tile.id };
}

// ------------------------------------------------------------------ ışık (spot)

export interface SpotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Masa sahnesinin öğreticiye verdiği konumlar (dünya koordinatı). */
export interface SpotCtx {
  tilePos(id: number): { x: number; y: number } | null;
  button(name: 'group' | 'lay' | 'discard'): SpotRect;
  meld(id: number): SpotRect | null;
  myZone(): SpotRect;
  deck(): { x: number; y: number };
  discardSpot(): { x: number; y: number };
  /** Sana atılan yan taşın yeri (sol alt). */
  sideSpot(): { x: number; y: number };
  rulePanel(): SpotRect;
  selected(): Set<number>;
  stagedCount(): number;
}

interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Işığın üstündeki kısa etiket ("Seç", "Buraya sürükle"…). */
  label?: string;
  /** 'no': yapılmayacak olanı gösterir (kırmızı halka). */
  tone?: 'no';
  /** Etiketin yeri (varsayılan: üstte, yer yoksa altta). */
  labelPos?: 'right' | 'below';
}

/** Ekranı karartır, verilen alanları yumuşak kenarlı yuvarlak ışıkla açar. Dokunmayı engellemez. */
class Spotlight {
  /** Karartma yarım çözünürlüklü bir canvas'ta çizilir (yumuşak kenarlı delikler için). */
  private static readonly RES = 0.5;
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private rings: Phaser.GameObjects.Graphics;
  private level = 0;
  private lastKey = '';

  constructor(private scene: Phaser.Scene) {
    const R = Spotlight.RES;
    if (scene.textures.exists('spot-dim')) scene.textures.remove('spot-dim');
    this.tex = scene.textures.createCanvas('spot-dim', GAME_W * R, GAME_H * R)!;
    this.img = scene.add.image(0, 0, 'spot-dim').setOrigin(0).setScale(1 / R).setDepth(1500);
    this.rings = scene.add.graphics().setDepth(1501);
  }

  draw(spots: Ellipse[]) {
    // karartma yavaşça gelip gider
    const want = spots.length ? 1 : 0;
    this.level += (want - this.level) * 0.18;
    if (Math.abs(want - this.level) < 0.01) this.level = want;
    if (spots.length) this.last = spots;
    const shown = spots.length ? spots : this.last;
    this.paint(this.level > 0 ? shown : []);
    this.rings.clear();
    this.labels.forEach((l) => l.setVisible(false));
    if (this.level <= 0 || !spots.length) return;
    const pulse = 0.5 + 0.5 * Math.sin((this.scene.time.now / 1000) * 4);
    let li = 0;
    for (const s of spots) {
      const color = s.tone === 'no' ? 0xe0574a : UI.gold;
      this.rings.lineStyle(3, color, (0.45 + 0.45 * pulse) * this.level);
      this.rings.strokeEllipse(s.x, s.y, s.rx * 2 + 6 + pulse * 6, s.ry * 2 + 6 + pulse * 6);
      if (!s.label) continue;
      const l = this.label(li++);
      l.setText(s.label)
        .setBackgroundColor(s.tone === 'no' ? '#c0392b' : '#f2c14e')
        .setColor(s.tone === 'no' ? '#ffffff' : '#2a1d02')
        .setAlpha(this.level)
        .setVisible(true);
      // üstte yer yoksa altına yaz (ya da istenirse sağına)
      const above = s.y - s.ry - 10 - pulse * 3;
      if (s.labelPos === 'right') l.setOrigin(0, 0.5).setPosition(s.x + s.rx + 10 + pulse * 3, s.y);
      else if (s.labelPos === 'below' || above - l.height < 6) l.setOrigin(0.5, 0).setPosition(s.x, s.y + s.ry + 10 + pulse * 3);
      else l.setOrigin(0.5, 1).setPosition(s.x, above);
    }
  }

  private labels: Phaser.GameObjects.Text[] = [];

  private label(i: number) {
    while (this.labels.length <= i) {
      this.labels.push(
        txt(this.scene, 0, 0, '', 14, '#2a1d02', 900, { padding: { x: 9, y: 4 } })
          .setDepth(1502)
          .setVisible(false),
      );
    }
    return this.labels[i];
  }

  private last: Ellipse[] = [];

  /** Sadece değişince yeniden çizer (taşlar kayarken her kare, dururken hiç). */
  private paint(spots: Ellipse[]) {
    const key = `${this.level.toFixed(2)}|${spots.map((s) => `${s.x | 0},${s.y | 0},${s.rx | 0},${s.ry | 0}`).join(';')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const R = Spotlight.RES;
    const ctx = this.tex.getContext();
    const W = GAME_W * R;
    const H = GAME_H * R;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (this.level > 0) {
      ctx.fillStyle = `rgba(0,0,0,${0.6 * this.level})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      for (const s of spots) {
        // yumuşak kenar: elipsin %80'i tam açık, dışa doğru 1.2 katına kadar yavaşça kararır
        ctx.save();
        ctx.translate(s.x * R, s.y * R);
        ctx.scale(s.rx * R, s.ry * R);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.2);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.8 / 1.2, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    this.tex.refresh();
  }

  destroy() {
    this.img.destroy();
    this.rings.destroy();
    this.labels.forEach((l) => l.destroy());
    this.scene.textures.remove('spot-dim');
  }
}

const around = (r: SpotRect, pad = 14): Ellipse => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2,
  rx: (r.w / 2 + pad) * 1.12,
  ry: (r.h / 2 + pad) * 1.12,
});
const dot = (p: { x: number; y: number }, r: number): Ellipse => ({ x: p.x, y: p.y, rx: r, ry: r });

// ------------------------------------------------------------------ adımlar

type Target = 'lay' | 'meld' | 'discard' | 'center' | 'deck' | 'rule';

interface Step {
  title: string;
  /** Ne yapıyoruz. */
  text: string;
  /** Neden yapıyoruz. */
  why: string;
  /** Seçilecek ıstaka taşları (renk+sayı; J = okey). */
  tiles?: string[];
  melds?: number[];
  /** Taşlar seçildikten sonra gidilecek yer. */
  target?: Target;
  done: (s: GameState) => boolean;
  /** Sadece bilgi: "Devam" ile geçilir. */
  info?: boolean;
  /** Son adım: "okeyle bitiş örneği" seçeneği sunulur. */
  offerExample?: boolean;
  /** Bilgi adımında gösterilen taşın etiketi. */
  spotLabel?: string;
}

const find = (s: GameState, spec: string) =>
  s.players[0].hand.find((t) => (spec === 'J' ? t.joker : !t.joker && t.color === C[spec[0]] && t.value === Number(spec.slice(1))));
const has = (s: GameState, spec: string) => !!find(s, spec);
const myAction = (s: GameState) => s.phase === 'action' && s.current === 0;
const over = (s: GameState) => s.phase === 'roundOver' || s.phase === 'gameOver';

const BASIC: Step[] = [
  {
    title: 'Hoş geldin!',
    text: "Amaç: elindeki taşları perlere dizip eli ilk bitiren olmak. Her elin bir kuralı var (sol üstte); bu elin kuralı 3'lü Küt: aynı sayıdan 3 farklı renk taş.",
    why: 'El bitince elinde kalan her taş sana ceza puanı yazar; en az puanla oyunu bitiren kazanır. O yüzden taşlarını bir an önce yere indirmek istersin.',
    info: true,
    target: 'rule',
    done: () => false,
  },
  {
    title: '1 · Kuralı aç',
    text: "Işıklı üç 7'yi seç. İki yol var: birlikte kendi alanına sürükleyip bırak (kural hemen açılır) ya da Per Ekle → Kuralı Aç butonlarına bas.",
    why: "Kural açılmadan hiçbir per yere inmez, işleme de yapamazsın. Kırmızı-mavi-siyah 7 aynı sayıda 3 farklı renk: tam 3'lü Küt, kuralı karşılıyor.",
    tiles: ['r7', 'b7', 'k7'],
    target: 'lay',
    done: (s) => s.players[0].opened,
  },
  {
    title: '2 · Taş at',
    text: "Her sıra bir taş atarak biter. Siyah 1'i seç → Taş At (ya da atma yerine sürükle).",
    why: "Siyah 1 hiçbir perine uymuyor ve yerde işlenecek yeri de yok: elindeki en gereksiz taş o. Sarı 4-5-6 gibi işe yarayanları elde tut. (Açtığın sırada fazlalıklar inmez, sonraki sırayı bekle.)",
    tiles: ['k1'],
    target: 'discard',
    done: (s) => !myAction(s),
  },
  {
    title: 'Rakipler oynuyor…',
    text: 'Sıra sırayla döner: her oyuncu çeker, oynar ve bir taş atar.',
    why: 'Bir oyuncunun attığı taş, sıradaki oyuncunun "yan taşı" olur: isterse onu alır, istemezse ortadan çeker. Sana yan taşı Bot 3 atacak.',
    done: (s) => s.phase === 'draw' && s.current === 0,
  },
  {
    title: '3 · Yan taşı alma, ortadan çek',
    text: 'Bot 3 siyah 11 attı (sol altta, senin yan taşın). Almıyoruz: ortadaki desteye dokun.',
    why: 'Siyah 11 hiçbir perine uymuyor; işine yaramayan taşı alırsan elin kalabalıklaşır. Ortaya dokununca önce diğerlerine "yan taşı istiyor musun?" diye sorulur (isteyen, ortadaki üst taşla birlikte alır), sonra sen ortadan çekersin.',
    target: 'deck',
    done: (s) => myAction(s),
  },
  {
    title: '4 · Per diz',
    text: 'Kimse yan taşı istemedi, ortadan siyah 2 geldi. Sarı 4-5-6\'yı seç; kendi alanına sürükleyip bırak (hemen iner) ya da Per Ekle → Yere Koy.',
    why: 'Kuralı açtığın için artık başka perleri de yere dizebilirsin. Aynı renk ardışık 3 taş bir seri; yere inen taş el bitince sana ceza yazmaz.',
    tiles: ['y4', 'y5', 'y6'],
    target: 'lay',
    done: (s) => s.melds.some((m) => m.owner === 0 && m.kind === 'seri' && m.color === 'yellow' && m.value === 4),
  },
  {
    title: '5 · İşle',
    text: "Kırmızı 4'ü seç → Bot 1'in kırmızı 1-2-3 serisine dokun ya da sürükle.",
    why: 'Kırmızı 4 tek başına per olamaz ama o serinin sonuna uyar; işlersen elin bir taş daha azalır. Yerdeki bir pere uyan taşa İŞLEK denir: onu yere atsaydın +50 ceza yerdin.',
    tiles: ['r4'],
    melds: [901],
    target: 'meld',
    done: (s) => !has(s, 'r4'),
  },
  {
    title: '6 · Okeyi al',
    text: "Mavi 9'u seç → Bot 1'in 9 kütüne dokun: okey senin olur.",
    why: "Okey her taşın yerine geçer, elde çok değerli. O kütte okey eksik rengi, yani mavi 9'u tutuyor; gerçek mavi 9 sende. Değiştirince okeyi alırsın, okeyini kaptıran Bot 1'e +50 ceza.",
    tiles: ['b9'],
    melds: [902],
    target: 'meld',
    done: (s) => has(s, 'J'),
  },
  {
    title: '7 · Okeyle diz',
    text: 'Okey + sarı 12 + sarı 13\'ü seç; sürükleyip kendi alanına bırak ya da Per Ekle → Yere Koy.',
    why: 'Sarı 12-13 tek başına per değil; okeyi sarı 11 yerine kullanınca 11-12-13 serisi olur ve elinde tek taş kalır. (Okeyi saklamak da bir yol: sonda örneğini gösteriyoruz.)',
    tiles: ['J', 'y12', 'y13'],
    target: 'lay',
    done: (s) => s.players[0].hand.length <= 1 || over(s),
  },
  {
    title: '8 · Bitir!',
    text: 'Son taşı (siyah 2) ortaya vur: Bitir! İstersen önce okeyle bitmenin örneğini gör.',
    why: 'Son taş yana atılmaz, ortaya vurulur ve el biter. Senin elinde taş kalmadığı için ceza yazılmaz; rakiplerin elinde kalan taşlar onlara ceza olur.',
    tiles: ['k2'],
    target: 'center',
    offerExample: true,
    done: over,
  },
];

const OKEY: Step[] = [
  {
    title: 'Örnek · Okeyi saklamak',
    text: 'Okeyi yere koymayıp elde tutmaya "okeyi saklamak" denir. Elinde okey, mavi 6 ve sarı 11 var.',
    why: 'Son taşın okey olursa OKEYLE bitersin: o eldeki tüm puanlar ×2. Riski de var: el başkası bitirirse elinde kalan okey sana +50 ek ceza yazar.',
    info: true,
    tiles: ['J'],
    spotLabel: 'Okeyi elde tut',
    done: () => false,
  },
  {
    title: "1 · Sarı 11'i işle",
    text: "Sarı 11'i seç → Bot 3'ün sarı 8-9-10 serisine dokun ya da sürükle.",
    why: 'Okeyle bitmek için elinde okeyden başka taş kalmamalı. Sarı 11 o serinin sonuna uyuyor, işleyerek elinden çıkarıyoruz.',
    tiles: ['y11'],
    melds: [912],
    target: 'meld',
    done: (s) => !has(s, 'y11'),
  },
  {
    title: "2 · Mavi 6'yı işle",
    text: "Mavi 6'yı seç → Bot 1'in mavi 3-4-5 serisine dokun ya da sürükle.",
    why: 'Mavi 6 da o serinin sonuna uyuyor. Bunu da işleyince elinde sadece okey kalacak.',
    tiles: ['b6'],
    melds: [911],
    target: 'meld',
    done: (s) => !has(s, 'b6'),
  },
  {
    title: '3 · Okeyle bit!',
    text: 'Elinde sadece okey kaldı: ortaya vur → OKEYLE BİTTİN.',
    why: 'Okeyi bir pere işleyip başka bir taşla da bitebilirdin ama o normal bitiş (×1) olurdu. Okeyi son taş olarak vurmak puanları ×2 yapar.',
    tiles: ['J'],
    target: 'center',
    done: over,
  },
];

/** Öğretici panelini çizer, adımları durumdan izler, hedef taşları ve yerleri ışıkla gösterir. */
export class TutorialRunner {
  highlights = new Set<number>();
  meldHighlights = new Set<number>();
  private step = 0;
  private steps: Step[];
  private box: Phaser.GameObjects.Container;
  private boxBg: Phaser.GameObjects.Graphics;
  private titleT: Phaser.GameObjects.Text;
  private bodyT: Phaser.GameObjects.Text;
  private whyLabel: Phaser.GameObjects.Text;
  private whyT: Phaser.GameObjects.Text;
  private countT: Phaser.GameObjects.Text;
  private next: Button;
  private example: Button;
  private finished = false;
  private rendered = -1;
  private spot: Spotlight;
  private visibleAt: number;

  constructor(
    private scene: Phaser.Scene,
    private getState: () => GameState,
    private ctx: SpotCtx,
    private stage: TutorialStage,
    private onExit: (action: 'play' | 'menu' | 'example' | 'again') => void,
  ) {
    this.steps = stage === 'okey' ? OKEY : BASIC;
    // Kutu: başlık · ne yapıyoruz (beyaz) · Neden? (krem). Yüksekliği metne göre ayarlanır.
    this.box = scene.add.container(GAME_W / 2, BOX_TOP).setDepth(3200);
    this.boxBg = scene.add.graphics();
    this.titleT = txt(scene, -BOX_W / 2 + 20, 11, '', 18, UI.goldHex, 900);
    this.bodyT = txt(scene, -BOX_W / 2 + 20, 38, '', 15, '#ffffff', 800, { wordWrap: { width: 680 }, lineSpacing: 3 });
    this.whyLabel = txt(scene, -BOX_W / 2 + 20, 0, 'Neden?', 14, UI.goldHex, 900);
    this.whyT = txt(scene, -BOX_W / 2 + 84, 0, '', 14, UI.cream, 700, { wordWrap: { width: 616 }, lineSpacing: 3 });
    this.countT = txt(scene, BOX_W / 2 - 20, 13, '', 12, UI.muted, 800).setOrigin(1, 0);
    this.next = new Button(scene, BOX_W / 2 - 85, 0, 130, 46, 'Devam', () => this.advance(), UI.green, 17);
    this.example = new Button(scene, BOX_W / 2 - 85, 0, 140, 46, 'Okeyle Bitiş', () => this.onExit('example'), UI.amber, 15);
    this.box.add([this.boxBg, this.titleT, this.bodyT, this.whyLabel, this.whyT, this.countT, this.next, this.example]);
    this.box.setAlpha(0).setScale(0.95);
    this.visibleAt = scene.time.now + 2700;
    scene.tweens.add({ targets: this.box, alpha: 1, scale: 1, delay: 2700, duration: 260, ease: 'Back.easeOut' });
    this.spot = new Spotlight(scene);
    const tick = () => this.drawSpots();
    scene.events.on('update', tick);
    scene.events.once('shutdown', () => scene.events.off('update', tick));
    this.render();
  }

  private advance() {
    if (this.step < this.steps.length - 1) this.step++;
    sfx.select();
    this.render();
  }

  /** Her çizimde çağrılır: tamamlanan adımları geçer. */
  update() {
    if (this.finished) return;
    const s = this.getState();
    let moved = false;
    while (this.step < this.steps.length - 1 && !this.steps[this.step].info && this.steps[this.step].done(s)) {
      this.step++;
      moved = true;
    }
    if (moved) {
      sfx.select();
      haptic(12);
      this.scene.tweens.add({ targets: this.box, scale: { from: 1.04, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    }
    this.render();
  }

  private render() {
    const st = this.steps[this.step];
    if (this.rendered !== this.step) {
      this.rendered = this.step;
      const button = !!st.info || !!st.offerExample;
      this.titleT.setText(st.title);
      this.bodyT.setWordWrapWidth(button ? BOX_W - 210 : BOX_W - 40).setText(st.text);
      this.whyT.setWordWrapWidth(button ? BOX_W - 274 : BOX_W - 104).setText(st.why);
      this.countT.setText(`${this.stage === 'okey' ? 'Örnek' : 'Öğretici'} · ${this.step + 1}/${this.steps.length}`);
      const whyY = 38 + this.bodyT.height + 8;
      this.whyLabel.setY(whyY);
      this.whyT.setY(whyY);
      const h = whyY + this.whyT.height + 14;
      this.boxBg.clear();
      panel(this.boxBg, -BOX_W / 2, 0, BOX_W, h, 18, 0x10372a, 0.84, UI.gold, 1);
      this.boxBg.fillStyle(0xffffff, 0.06);
      this.boxBg.fillRoundedRect(-BOX_W / 2 + 10, whyY - 5, button ? BOX_W - 180 : BOX_W - 20, this.whyT.height + 10, 10);
      this.next.setVisible(!!st.info).setY(h / 2 + 8);
      this.example.setVisible(!!st.offerExample).setY(h / 2 + 8);
    }
    const s = this.getState();
    this.highlights.clear();
    for (const spec of st.tiles ?? []) {
      const t = find(s, spec);
      if (t) this.highlights.add(t.id);
    }
    this.meldHighlights = new Set(st.melds ?? []);
  }

  /** Bu adımda ışıkla gösterilecek yerler: önce seçilecek taşlar, seçilince gidilecek yer. */
  private spots(): Ellipse[] {
    if (this.finished || this.scene.time.now < this.visibleAt) return [];
    const s = this.getState();
    const st = this.steps[this.step];
    const c = this.ctx;
    const out: Ellipse[] = [];
    const lbl = (e: Ellipse, label: string, tone?: 'no'): Ellipse => ({ ...e, label, tone });
    // deste kutunun hemen altında: etiketi altına yaz
    const deckSpot = (label: string): Ellipse => ({ ...lbl(dot(c.deck(), 72), label), labelPos: 'below' });
    if (st.target === 'rule') return [{ ...lbl(around(c.rulePanel(), 6), '← Bu elin kuralı'), labelPos: 'right' }];
    if (st.target === 'deck') {
      if (!myDrawPhase(s)) return [];
      out.push(deckSpot('Buradan çek'));
      if (s.pendingDiscard) out.push(lbl(dot(c.sideSpot(), 48), 'Almıyoruz ✗', 'no'));
      return out;
    }
    // bilgi adımı: sadece anlatılan taşı göster
    if (st.info && st.tiles) {
      return [...this.highlights]
        .map((id) => c.tilePos(id))
        .filter((p): p is { x: number; y: number } => !!p)
        .map((p, i) => ({ x: p.x, y: p.y, rx: 34, ry: 44, label: i === 0 ? st.spotLabel : undefined }));
    }
    if (!myAction(s) || !st.target) return [];

    const ids = [...this.highlights];
    const sel = c.selected();
    const allSel = ids.length > 0 && ids.every((id) => sel.has(id));
    // her taşa ayrı yuvarlak ışık (yan yana olanlar birleşip tek alan gibi görünür); etiket ilk taşta
    const tileSpots = (label?: string): Ellipse[] =>
      ids
        .map((id) => c.tilePos(id))
        .filter((p): p is { x: number; y: number } => !!p)
        .map((p, i) => ({ x: p.x, y: p.y, rx: 34, ry: 44, label: i === 0 ? label : undefined }));
    const pick = allSel ? undefined : ids.length > 1 ? 'Hepsini seç' : 'Seç';

    if (st.target === 'lay') {
      if (c.stagedCount() > 0) {
        out.push(lbl(around(c.button('lay'), 6), 'Şimdi bas'), around(c.myZone(), -10));
        return out;
      }
      out.push(...tileSpots(pick));
      if (allSel) out.push(lbl(around(c.myZone(), -10), 'Sürükle, bırak'), lbl(around(c.button('group'), 6), 'ya da butonla'));
      return out;
    }
    if (st.target === 'meld') {
      out.push(...tileSpots(pick));
      if (allSel)
        for (const id of st.melds ?? []) {
          const r = c.meld(id);
          if (r) out.push(lbl(around(r, 10), 'Buraya işle'));
        }
      return out;
    }
    if (st.target === 'discard') {
      out.push(...tileSpots(pick));
      if (allSel) out.push(lbl(dot(c.discardSpot(), 52), 'Buraya at'), around(c.button('discard'), 6));
      return out;
    }
    if (st.target === 'center') {
      out.push(...tileSpots(), deckSpot('Ortaya vur'), around(c.button('discard'), 6));
      return out;
    }
    return out;
  }

  private drawSpots() {
    this.spot.draw(this.spots());
    // Rakipler oynarken kutu soluklaşır: atılan taşlar ve hamleler rahat görünsün
    if (!this.finished && this.scene.time.now > this.visibleAt + 300) {
      const s = this.getState();
      const st = this.steps[this.step];
      const mine = st.info || ((s.phase === 'draw' || s.phase === 'action') && s.current === 0) || over(s);
      const want = mine ? 1 : 0.4;
      this.box.setAlpha(this.box.alpha + (want - this.box.alpha) * 0.12);
    }
  }

  /** El bitti: tebrik ve çıkış seçenekleri. */
  complete() {
    this.finished = true;
    const s = this.getState();
    const h = s.history[s.history.length - 1];
    const okeyFinish = !!h && (h.finishType === 'okey' || h.finishType === 'ciftOkey');
    const badge = award('tutorial');
    if (badge) this.scene.time.delayedCall(900, () => showBadge(this.scene, badge));
    this.highlights.clear();
    this.meldHighlights.clear();
    this.box.destroy();
    this.spot.destroy();
    const sc = this.scene;
    const c = sc.add.container(0, 0).setDepth(4000);
    c.add(sc.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive());
    const g = sc.add.graphics();
    panel(g, GAME_W / 2 - 330, 170, 660, 380, 24, 0x0c2c21, 0.98, UI.gold, 1);
    c.add(g);
    const title =
      this.stage === 'okey' ? (okeyFinish ? 'Okeyle bittin! ×2 🎉' : 'Normal bittin! 🎉') : 'Tebrikler, eli bitirdin! 🎉';
    const lines =
      this.stage === 'okey'
        ? okeyFinish
          ? ['Okeyi sakladın, işlek taşları işledin ve son taş olarak', 'okeyi ortaya vurdun: bu eldeki tüm puanlar ×2.', '', 'Elde iki okey kalırsa ikisini birden vurmak ÇİFT OKEY: ×4!']
          : ['Okeyi işleyip normal bittin, bu da olur.', 'Okeyi saklayıp son taş olarak vursaydın puanlar ×2 olurdu.', '', 'Elde iki okey kalırsa ikisini birden vurmak ÇİFT OKEY: ×4!']
        : [
            'Kuralı açtın, per dizdin, işledin, okeyi aldın ve son taşla bittin.',
            '',
            'Gerçek oyunda ipucu yok: işlenebilir taşlar parlamaz ve',
            'işlek taşı atarsan uyarı gelmez, doğrudan +50 ceza yersin.',
          ];
    c.add(txt(sc, GAME_W / 2, 200, title, 32, UI.goldHex, 900).setOrigin(0.5, 0));
    c.add(txt(sc, GAME_W / 2, 258, lines.join('\n'), 17, UI.cream, 700, { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0));
    if (this.stage === 'okey') {
      c.add(new Button(sc, GAME_W / 2 - 220, 480, 200, 62, 'Gerçek Oyun', () => this.onExit('play'), UI.green, 18));
      c.add(new Button(sc, GAME_W / 2, 480, 200, 62, 'Tekrar Dene', () => this.onExit('again'), UI.amber, 18));
      c.add(new Button(sc, GAME_W / 2 + 220, 480, 200, 62, 'Ana Menü', () => this.onExit('menu'), UI.slate, 18));
    } else {
      c.add(new Button(sc, GAME_W / 2 - 220, 480, 200, 62, 'Gerçek Oyun', () => this.onExit('play'), UI.green, 18));
      c.add(new Button(sc, GAME_W / 2, 480, 200, 62, 'Okeyle Bitiş', () => this.onExit('example'), UI.amber, 18));
      c.add(new Button(sc, GAME_W / 2 + 220, 480, 200, 62, 'Ana Menü', () => this.onExit('menu'), UI.slate, 18));
    }
    sfx.win();
    c.setAlpha(0);
    sc.tweens.add({ targets: c, alpha: 1, duration: 220 });
  }
}

const myDrawPhase = (s: GameState) => s.phase === 'draw' && s.current === 0;
