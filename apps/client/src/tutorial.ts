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
    // Botlara işe yaramaz (işlek olmayan) taşlar ver
    const safe = (t: Tile) => !t.joker && !(t.color === 'red' && t.value <= 5) && t.value !== 9;
    const filler = pool.filter(safe);
    const rest = pool.filter((t) => !safe(t));
    bot1.hand = filler.splice(0, 8);
    s.players[2].hand = filler.splice(0, 14);
    s.players[3].hand = filler.splice(0, 14);
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
  const id = lastGot.get(seat);
  const tile = hand.find((t) => t.id === id) ?? hand[hand.length - 1];
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
  rulePanel(): SpotRect;
  selected(): Set<number>;
  stagedCount(): number;
}

interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
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
    if (this.level <= 0 || !spots.length) return;
    const pulse = 0.5 + 0.5 * Math.sin((this.scene.time.now / 1000) * 4);
    for (const s of spots) {
      this.rings.lineStyle(3, UI.gold, (0.45 + 0.45 * pulse) * this.level);
      this.rings.strokeEllipse(s.x, s.y, s.rx * 2 + 6 + pulse * 6, s.ry * 2 + 6 + pulse * 6);
    }
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
  text: string;
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
}

const find = (s: GameState, spec: string) =>
  s.players[0].hand.find((t) => (spec === 'J' ? t.joker : !t.joker && t.color === C[spec[0]] && t.value === Number(spec.slice(1))));
const has = (s: GameState, spec: string) => !!find(s, spec);
const myAction = (s: GameState) => s.phase === 'action' && s.current === 0;
const over = (s: GameState) => s.phase === 'roundOver' || s.phase === 'gameOver';

const BASIC: Step[] = [
  {
    title: 'Hoş geldin!',
    text: "Küt'te her elin bir kuralı var (sol üstte). Bu elin kuralı 3'lü Küt: aynı sayıdan 3 farklı renk taş. Rakiplerden Bot 1 kuralını çoktan açmış.",
    info: true,
    target: 'rule',
    done: () => false,
  },
  {
    title: '1 · Kuralı aç',
    text: "Işıklı üç 7'ye dokunarak seç. Sonra hepsini birlikte kendi alanına sürükle (ya da Per Ekle) → Kuralı Aç.",
    tiles: ['r7', 'b7', 'k7'],
    target: 'lay',
    done: (s) => s.players[0].opened,
  },
  {
    title: '2 · Taş at',
    text: "Kural açıldı! Açtığın sırada fazlalıklar inmez. Siyah 1'i seç → Taş At (ya da atma yerine sürükle).",
    tiles: ['k1'],
    target: 'discard',
    done: (s) => !myAction(s),
  },
  {
    title: 'Rakipler oynuyor…',
    text: 'Sıra sırayla döner. Her oyuncu çeker, oynar ve bir taş atar.',
    done: (s) => s.phase === 'draw' && s.current === 0,
  },
  {
    title: '3 · Taş çek',
    text: 'Sıra sende: masanın ortasındaki desteye dokun.',
    target: 'deck',
    done: (s) => myAction(s),
  },
  {
    title: '4 · Per diz',
    text: 'Sarı 4-5-6 bir seri. Üçünü seç, birlikte kendi alanına sürükle (ya da Per Ekle) → Yere Koy.',
    tiles: ['y4', 'y5', 'y6'],
    target: 'lay',
    done: (s) => s.melds.some((m) => m.owner === 0 && m.kind === 'seri' && m.color === 'yellow' && m.value === 4),
  },
  {
    title: '5 · İşle',
    text: "Kırmızı 4, Bot 1'in 1-2-3 serisine eklenebilir. Böyle taşlara İŞLEK denir; yere atan +50 ceza yer! Kırmızı 4'ü seç → ışıklı seriye dokun ya da sürükle.",
    tiles: ['r4'],
    melds: [901],
    target: 'meld',
    done: (s) => !has(s, 'r4'),
  },
  {
    title: '6 · Okeyi al',
    text: "Bot 1'in 4'lü kütünde okey eksik rengin, yani mavi 9'un yerini tutuyor. Mavi 9'u seç → küte dokun: okey senin olur, Bot 1'e +50.",
    tiles: ['b9'],
    melds: [902],
    target: 'meld',
    done: (s) => has(s, 'J'),
  },
  {
    title: '7 · Okeyle diz',
    text: 'Okey istediğin taşın yerine geçer: okey + sarı 12 + sarı 13 bir seri. Üçünü seç, birlikte sürükle → Yere Koy.',
    tiles: ['J', 'y12', 'y13'],
    target: 'lay',
    done: (s) => s.players[0].hand.length <= 1 || over(s),
  },
  {
    title: '8 · Bitir!',
    text: 'Elinde tek taş kaldı. Son taş yana atılmaz, ortaya vurulur: Bitir! İstersen önce okeyle bitmenin bir örneğini gör.',
    tiles: ['k2'],
    target: 'center',
    offerExample: true,
    done: over,
  },
];

const OKEY: Step[] = [
  {
    title: 'Örnek · Okeyi saklamak',
    text: 'Okeyi yere koymayıp elde tutmaya "okeyi saklamak" denir. Son taşın okey olursa okeyle bitersin: puanlar ×2! Elinde okey, mavi 6 ve sarı 11 var.',
    info: true,
    done: () => false,
  },
  {
    title: "1 · Sarı 11'i işle",
    text: "Sarı 11, Bot 3'ün sarı 8-9-10 serisinin sonuna eklenir. Seç → ışıklı seriye dokun ya da sürükle.",
    tiles: ['y11'],
    melds: [912],
    target: 'meld',
    done: (s) => !has(s, 'y11'),
  },
  {
    title: "2 · Mavi 6'yı işle",
    text: "Mavi 6, Bot 1'in mavi 3-4-5 serisine eklenir. Seç → ışıklı seriye dokun ya da sürükle.",
    tiles: ['b6'],
    melds: [911],
    target: 'meld',
    done: (s) => !has(s, 'b6'),
  },
  {
    title: '3 · Okeyle bit!',
    text: 'Elinde sadece okey kaldı. Ortaya vur → OKEYLE BİTTİN, puanlar ×2. (İstersen okeyi işleyip normal de bitebilirsin.)',
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
  private titleT: Phaser.GameObjects.Text;
  private bodyT: Phaser.GameObjects.Text;
  private countT: Phaser.GameObjects.Text;
  private next: Button;
  private example: Button;
  private finished = false;
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
    const x = GAME_W / 2;
    const y = 122;
    this.box = scene.add.container(x, y).setDepth(3200);
    const g = scene.add.graphics();
    panel(g, -400, -46, 800, 92, 18, 0x10372a, 0.97, UI.gold, 1);
    this.titleT = txt(scene, -380, -34, '', 18, UI.goldHex, 900);
    this.bodyT = txt(scene, -380, -8, '', 15, '#ffffff', 700, { wordWrap: { width: 600 }, lineSpacing: 3 });
    this.countT = txt(scene, 380, -34, '', 12, UI.muted, 800).setOrigin(1, 0);
    this.next = new Button(scene, 320, 14, 120, 44, 'Devam', () => this.advance(), UI.green, 17);
    this.example = new Button(scene, 310, 14, 140, 44, 'Okeyle Bitiş', () => this.onExit('example'), UI.amber, 15);
    this.box.add([g, this.titleT, this.bodyT, this.countT, this.next, this.example]);
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
    this.titleT.setText(st.title);
    this.bodyT.setText(st.text);
    this.countT.setText(`${this.stage === 'okey' ? 'Örnek' : 'Öğretici'} · ${this.step + 1}/${this.steps.length}`);
    this.next.setVisible(!!st.info);
    this.example.setVisible(!!st.offerExample);
    this.bodyT.setWordWrapWidth(st.offerExample ? 570 : 600);
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
    if (st.target === 'rule') return [around(c.rulePanel(), 6)];
    if (st.target === 'deck') return myDrawPhase(s) ? [dot(c.deck(), 72)] : [];
    if (!myAction(s) || !st.target) return [];

    const ids = [...this.highlights];
    const sel = c.selected();
    const allSel = ids.length > 0 && ids.every((id) => sel.has(id));
    // her taşa ayrı yuvarlak ışık (yan yana olanlar birleşip tek alan gibi görünür)
    const tileSpots = (): Ellipse[] =>
      ids
        .map((id) => c.tilePos(id))
        .filter((p): p is { x: number; y: number } => !!p)
        .map((p) => ({ x: p.x, y: p.y, rx: 34, ry: 44 }));

    if (st.target === 'lay') {
      if (c.stagedCount() > 0) {
        out.push(around(c.button('lay'), 6), around(c.myZone(), -10));
        return out;
      }
      out.push(...tileSpots());
      if (allSel) out.push(around(c.myZone(), -10), around(c.button('group'), 6));
      return out;
    }
    if (st.target === 'meld') {
      out.push(...tileSpots());
      if (allSel)
        for (const id of st.melds ?? []) {
          const r = c.meld(id);
          if (r) out.push(around(r, 10));
        }
      return out;
    }
    if (st.target === 'discard') {
      out.push(...tileSpots());
      if (allSel) out.push(dot(c.discardSpot(), 52), around(c.button('discard'), 6));
      return out;
    }
    if (st.target === 'center') {
      out.push(...tileSpots(), dot(c.deck(), 72), around(c.button('discard'), 6));
      return out;
    }
    return out;
  }

  private drawSpots() {
    this.spot.draw(this.spots());
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
