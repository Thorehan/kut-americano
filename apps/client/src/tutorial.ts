import Phaser from 'phaser';
import { Action, Color, Game, GameState, Tile, asKut, asSeri } from '@kut/core';
import { GAME_W, UI } from './layout';
import { haptic, sfx } from './sfx';
import { Button } from './ui/Button';
import { panel, txt } from './ui/text';

/**
 * Kısa öğretici (~2 dk): hazır dağıtılmış bir 3'lü Küt eli. Oyuncu sırasıyla
 * kuralı açar, taş atar, çeker, per dizer, işler, okeyi alır ve son taşla biter.
 * Yardım modu açıktır: işlek taşlar parlar, işlek atmadan önce uyarılır.
 */

const C: Record<string, Color> = { r: 'red', y: 'yellow', b: 'blue', k: 'black' };

/** Öğretici eli: taşlar gerçek taş setinden seçilir (id'ler benzersiz kalsın). */
export function setupTutorialGame(game: Game) {
  const s = game.state;
  const pool: Tile[] = [...s.deck, ...s.players.flatMap((p) => p.hand)];
  const take = (spec: string): Tile => {
    const i = pool.findIndex((t) => (spec === 'J' ? t.joker : !t.joker && t.color === C[spec[0]] && t.value === Number(spec.slice(1))));
    if (i < 0) throw new Error('öğretici taşı yok: ' + spec);
    return pool.splice(i, 1)[0];
  };
  const many = (spec: string) => spec.split(' ').map(take);

  const me = s.players[0];
  me.hand = many('r7 b7 k7 y4 y5 y6 r4 b9 y12 y13 k1');
  me.opened = false;

  // Bot 1 kuralını açmış: kırmızı 1-2-3 serisi ve okeyli 9 kütü yerde.
  const bot1 = s.players[1];
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
  s.starter = 0;
  s.current = 0;
  s.phase = 'action';
  s.pendingDiscard = null;
  s.claim = null;
  s.turnJokers = 0;
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

// ------------------------------------------------------------------ adımlar

interface Step {
  title: string;
  text: string;
  /** Parlatılacak ıstaka taşları (renk+sayı) ve perler. */
  tiles?: string[];
  melds?: number[];
  done: (s: GameState) => boolean;
  /** Sadece bilgi: "Devam" ile geçilir. */
  info?: boolean;
}

const has = (s: GameState, spec: string) =>
  s.players[0].hand.some((t) => (spec === 'J' ? t.joker : !t.joker && t.color === C[spec[0]] && t.value === Number(spec.slice(1))));
const myAction = (s: GameState) => s.phase === 'action' && s.current === 0;

const STEPS: Step[] = [
  {
    title: 'Hoş geldin!',
    text: "Küt'te her elin bir kuralı var. Bu elin kuralı 3'lü Küt: aynı sayıdan 3 farklı renk taş. Rakiplerden Bot 1 kuralını çoktan açmış.",
    info: true,
    done: () => false,
  },
  {
    title: '1 · Kuralı aç',
    text: "Üç 7'ye dokunarak seç, sonra Per Ekle → Kuralı Aç.",
    tiles: ['r7', 'b7', 'k7'],
    done: (s) => s.players[0].opened,
  },
  {
    title: '2 · Taş at',
    text: 'Kural açıldı! Açtığın sırada fazlalıklar inmez. Siyah 1\'i seç → Taş At.',
    tiles: ['k1'],
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
    done: (s) => myAction(s),
  },
  {
    title: '4 · Per diz',
    text: 'Sarı 4-5-6 bir seri. Üçünü seç → Per Ekle → Yere Koy.',
    tiles: ['y4', 'y5', 'y6'],
    done: (s) => s.melds.some((m) => m.owner === 0 && m.kind === 'seri' && m.color === 'yellow' && m.value === 4),
  },
  {
    title: '5 · İşle',
    text: 'Kırmızı 4, Bot 1\'in 1-2-3 serisine eklenebilir. Böyle taşlara İŞLEK denir; yere atan +50 ceza yer! Kırmızı 4\'ü seç → o seriye dokun.',
    tiles: ['r4'],
    melds: [901],
    done: (s) => !has(s, 'r4'),
  },
  {
    title: '6 · Okeyi al',
    text: "Bot 1'in 4'lü kütünde okey eksik rengin, yani mavi 9'un yerini tutuyor. Mavi 9'u seç → küte dokun: okey senin olur, Bot 1'e +50. (3'lü kütte okeyin rengi belli olmadığından alınamaz.)",
    tiles: ['b9'],
    melds: [902],
    done: (s) => has(s, 'J'),
  },
  {
    title: '7 · Okeyle diz',
    text: 'Okey istediğin taşın yerine geçer: okey + sarı 12 + sarı 13 bir seri. Üçünü seç → Per Ekle → Yere Koy.',
    tiles: ['J', 'y12', 'y13'],
    done: (s) => s.players[0].hand.length <= 1 || s.phase === 'roundOver',
  },
  {
    title: '8 · Bitir!',
    text: 'Elinde tek taş kaldı. Son taş yana atılmaz, ortaya vurulur: Bitir!',
    done: (s) => s.phase === 'roundOver' || s.phase === 'gameOver',
  },
];

/** Öğretici panelini çizer, adımları durumdan izler, hedef taşları parlatır. */
export class TutorialRunner {
  highlights = new Set<number>();
  meldHighlights = new Set<number>();
  private step = 0;
  private box: Phaser.GameObjects.Container;
  private titleT: Phaser.GameObjects.Text;
  private bodyT: Phaser.GameObjects.Text;
  private countT: Phaser.GameObjects.Text;
  private next: Button;
  private finished = false;

  constructor(
    private scene: Phaser.Scene,
    private getState: () => GameState,
    private onExit: (action: 'play' | 'menu') => void,
  ) {
    const x = GAME_W / 2;
    const y = 122;
    this.box = scene.add.container(x, y).setDepth(3200);
    const g = scene.add.graphics();
    panel(g, -400, -46, 800, 92, 18, 0x10372a, 0.97, UI.gold, 1);
    this.titleT = txt(scene, -380, -34, '', 18, UI.goldHex, 900);
    this.bodyT = txt(scene, -380, -8, '', 15, '#ffffff', 700, { wordWrap: { width: 600 }, lineSpacing: 3 });
    this.countT = txt(scene, 380, -34, '', 12, UI.muted, 800).setOrigin(1, 0);
    this.next = new Button(scene, 320, 14, 120, 44, 'Devam', () => this.advance(), UI.green, 17);
    this.box.add([g, this.titleT, this.bodyT, this.countT, this.next]);
    this.box.setAlpha(0).setScale(0.95);
    scene.tweens.add({ targets: this.box, alpha: 1, scale: 1, delay: 2700, duration: 260, ease: 'Back.easeOut' });
    this.render();
  }

  private advance() {
    if (this.step < STEPS.length - 1) this.step++;
    sfx.select();
    this.render();
  }

  /** Her çizimde çağrılır: tamamlanan adımları geçer. */
  update() {
    if (this.finished) return;
    const s = this.getState();
    let moved = false;
    while (this.step < STEPS.length - 1 && !STEPS[this.step].info && STEPS[this.step].done(s)) {
      this.step++;
      moved = true;
    }
    if (moved) {
      sfx.pop();
      haptic(12);
      this.scene.tweens.add({ targets: this.box, scale: { from: 1.04, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    }
    this.render();
  }

  private render() {
    const st = STEPS[this.step];
    this.titleT.setText(st.title);
    this.bodyT.setText(st.text);
    this.countT.setText(`Öğretici · ${this.step + 1}/${STEPS.length}`);
    this.next.setVisible(!!st.info);
    const s = this.getState();
    this.highlights.clear();
    for (const spec of st.tiles ?? []) {
      const t = s.players[0].hand.find((x) => (spec === 'J' ? x.joker : !x.joker && x.color === C[spec[0]] && x.value === Number(spec.slice(1))));
      if (t) this.highlights.add(t.id);
    }
    this.meldHighlights = new Set(st.melds ?? []);
  }

  /** El bitti: tebrik ve çıkış seçenekleri. */
  complete() {
    this.finished = true;
    this.highlights.clear();
    this.meldHighlights.clear();
    this.box.destroy();
    const sc = this.scene;
    const c = sc.add.container(0, 0).setDepth(4000);
    c.add(sc.add.rectangle(0, 0, GAME_W, 720, 0x000000, 0.6).setOrigin(0).setInteractive());
    const g = sc.add.graphics();
    panel(g, GAME_W / 2 - 330, 170, 660, 380, 24, 0x0c2c21, 0.98, UI.gold, 1);
    c.add(g);
    c.add(txt(sc, GAME_W / 2, 200, 'Tebrikler, eli bitirdin! 🎉', 32, UI.goldHex, 900).setOrigin(0.5, 0));
    c.add(
      txt(
        sc,
        GAME_W / 2,
        258,
        [
          'Kuralı açtın, per dizdin, işledin, okeyi aldın ve son taşla bittin.',
          '',
          'Gerçek oyunda ipucu yok: işlenebilir taşlar parlamaz ve',
          'işlek taşı atarsan uyarı gelmez, doğrudan +50 ceza yersin.',
        ].join('\n'),
        17,
        UI.cream,
        700,
        { align: 'center', lineSpacing: 6 },
      ).setOrigin(0.5, 0),
    );
    c.add(new Button(sc, GAME_W / 2 - 135, 480, 240, 62, 'Gerçek Oyuna Başla', () => this.onExit('play'), UI.green, 18));
    c.add(new Button(sc, GAME_W / 2 + 135, 480, 240, 62, 'Ana Menü', () => this.onExit('menu'), UI.slate, 18));
    sfx.win();
    c.setAlpha(0);
    sc.tweens.add({ targets: c, alpha: 1, duration: 220 });
  }
}
