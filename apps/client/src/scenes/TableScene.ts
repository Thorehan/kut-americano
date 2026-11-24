import Phaser from 'phaser';
import {
  Action,
  FINISH_BONUS,
  FINISH_MULT,
  FINISH_NAMES,
  RoundResult,
  GameEvent,
  Tile,
  CONTRACTS,
  ISLEK_PENALTY,
  OKEY_SWAP_PENALTY,
  addPosition,
  jokerSwapIndex,
  withTile,
  Meld,
  asCift,
  asKut,
  asSeri,
  compareByColor,
  compareByValue,
  findContractMelds,
  findFullPartition,
  findGreedyMelds,
  findPairPartition,
  teamOf,
} from '@kut/core';
import { GameController, LocalController } from '../controller';
import { connection } from '../net/connection';
import {
  BTN,
  DECK,
  DISCARD_POS,
  DISCARD_SCALE,
  GAME_H,
  GAME_W,
  MELD_ZONES,
  RACK,
  RENDER_SCALE,
  SEAT_ANCHOR,
  STATUS,
  TABLE,
  UI,
  Zone,
} from '../layout';
import { haptic, sfx } from '../sfx';
import { TILE_H, TILE_W, createTextures, tileKey } from '../textures';
import { Button } from '../ui/Button';
import { panel, txt } from '../ui/text';
import { SeatView, showBubble } from '../view/SeatView';
import { Origin, Point, Target, TileKind, TileLayer } from '../view/TileLayer';
import type { TableData } from './MenuScene';
import { SpotCtx, TutorialRunner } from '../tutorial';
import {
  Badge,
  Gain,
  KP,
  PLACE_KP,
  PLACE_XP,
  ROUND_WIN_KP,
  ROUND_WIN_OKEY_KP,
  award,
  grant,
  leavePenalty,
  profile,
  recordLeave,
  saveProfile,
} from '../profile';
import { fmt, showBadge, showGain } from '../ui/rewards';
import { icon } from '../ui/icons';
import { playRewardedVideo } from '../ui/videoAd';

type Obj = Phaser.GameObjects.GameObject;
type Rect = Phaser.Geom.Rectangle;

const SLOT_COUNT = RACK.cols * RACK.rows;
const CLAIM_SECONDS = 8;
const ZONE_SCALES = [0.4, 0.36, 0.32, 0.28, 0.25, 0.22, 0.19, 0.16, 0.14];
type OverlayKind = 'none' | 'claim' | 'round' | 'scores' | 'final' | 'menu';

export class TableScene extends Phaser.Scene {
  private ctrl!: GameController;
  /** Bir önceki çizimde alınabilir olan yan taş (gizli ele giderken uçacağı yeri bulmak için). */
  private lastFresh: { id: number; from: number } | null = null;
  private turnStartedAt = 0;
  private mode!: TableData;
  private tiles!: TileLayer;
  private seats: SeatView[] = [];
  private slots: (number | null)[] = [];
  private selected = new Set<number>();
  private staged: number[][] = [];
  private sortBy: 'seri' | 'kut' = 'seri';

  private zoneGfx!: Phaser.GameObjects.Graphics;
  private rackGlow!: Phaser.GameObjects.Graphics;
  private deckGlow!: Phaser.GameObjects.Graphics;
  private deckTop!: Phaser.GameObjects.Image;
  private deckBacks: Phaser.GameObjects.Image[] = [];
  private deckCount!: Phaser.GameObjects.Text;
  private ruleChip!: Phaser.GameObjects.Text;
  private ruleName!: Phaser.GameObjects.Text;
  private ruleDesc!: Phaser.GameObjects.Text;
  private ruleExtra!: Phaser.GameObjects.Image;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusT!: Phaser.GameObjects.Text;
  private statusBox!: Phaser.GameObjects.Container;
  private errorUntil = 0;
  private meChipBg!: Phaser.GameObjects.Graphics;
  private meChipT!: Phaser.GameObjects.Text;
  private buttons!: Record<'group' | 'lay' | 'cancel' | 'discard' | 'hint' | 'sort' | 'scores' | 'menu', Button>;

  private meldHits: { id: number; rect: Rect }[] = [];
  private stagedHits: { gi: number; rect: Rect }[] = [];
  private actor = -1;
  private dealing = false;
  private dragging = false;
  /** Birlikte sürüklenen seçili taşlar (ıstaka sırasıyla) ve elle tutulanın sırası. */
  private groupDrag: { ids: number[]; lead: number } | null = null;
  private wasMyTurn = false;
  private islekConfirm = -1;
  /**
   * Yardım modu (sadece öğreticide): işlek taşlar parlar, işlenebilir perler
   * çerçevelenir, işlek atmadan önce uyarılır. Normal oyunda kapalı — işlek atan ceza yer.
   */
  private assist = false;
  private tutorial: TutorialRunner | null = null;
  /** Rastgele modda kural çarkı dönerken kural gizli kalır. */
  private spinning = false;
  /** El sonu ekranının gecikmesi (okeyle bitişte kutlama bitene kadar). */
  private resultDelay = 1100;
  /** Oyun sonu ödülü (video ile 2 katlanabilir). */
  private finalGain: { kp: number; xp: number; doubled: boolean } | null = null;

  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: OverlayKind = 'none';
  private overlayTimers: (Phaser.Tweens.Tween | Phaser.Time.TimerEvent)[] = [];
  private roundShown = 0;

  constructor() {
    super('table');
  }

  init(data: TableData) {
    this.mode = data;
    this.assist = !!data.tutorial;
    this.tutorial = null;
    this.seats = [];
    this.slots = new Array(SLOT_COUNT).fill(null);
    this.selected = new Set();
    this.staged = [];
    this.sortBy = 'seri';
    this.deckBacks = [];
    this.meldHits = [];
    this.stagedHits = [];
    this.actor = -1;
    this.dealing = false;
    this.dragging = false;
    this.groupDrag = null;
    this.wasMyTurn = false;
    this.spinning = false;
    this.finalGain = null;
    this.islekConfirm = -1;
    this.overlay = null;
    this.overlayKind = 'none';
    this.overlayTimers = [];
    this.roundShown = 0;
    this.errorUntil = 0;
  }

  private get s() {
    return this.ctrl.game.state;
  }
  private get me() {
    return this.ctrl.game.state.players[0];
  }
  private get myAction() {
    return this.s.phase === 'action' && this.s.current === 0;
  }
  private get myDraw() {
    return this.s.phase === 'draw' && this.s.current === 0;
  }

  // ================================================================ kurulum

  create() {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    createTextures(this);
    this.add.image(0, 0, 'table-bg').setOrigin(0).setScale(1 / RENDER_SCALE).setDepth(-20);
    this.add.image(RACK.board.x, RACK.board.y, 'rack').setOrigin(0).setScale(1 / RENDER_SCALE).setDepth(-10);

    this.ctrl =
      this.mode.online ??
      new LocalController({
        mode: this.mode.mode,
        seed: this.mode.seed,
        startRound: this.mode.startRound,
        ruleOrder: this.mode.ruleOrder,
        tutorial: this.mode.tutorial,
        preview: this.mode.preview,
      });
    if (this.mode.tutorial) {
      const stage = this.mode.tutorial === 'okey' ? 'okey' : 'basic';
      this.tutorial = new TutorialRunner(this, () => this.s, this.spotCtx(), stage, (a) => {
        try {
          localStorage.setItem('kut-tutorial-done', '1');
        } catch {
          /* depolama yok */
        }
        if (a === 'play') this.scene.start('table', { mode: 'solo' });
        else if (a === 'example' || a === 'again') this.scene.start('table', { mode: 'solo', tutorial: 'okey' } satisfies TableData);
        else this.scene.start('menu');
      });
    }
    this.ctrl.onError((msg) => {
      this.showError(msg);
      this.sync();
    });
    if (this.ctrl.online) {
      // sıra sayacı ve bağlantı durumu için saniyede bir tazele
      this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateStatus() });
    }
    this.ctrl.onChange((ev) => this.onEvents(ev));
    this.events.once('shutdown', () => this.ctrl.destroy());

    this.tiles = new TileLayer(this, (id, kind) => this.onTileTap(id, kind));
    this.zoneGfx = this.add.graphics().setDepth(5);
    this.rackGlow = this.add.graphics().setDepth(-9);
    this.buildStaticTable();
    this.buildRulePanel();
    this.buildDeck();
    this.buildStatus();
    this.buildButtons();

    for (let seat = 1; seat < 4; seat++) {
      const a = SEAT_ANCHOR[seat];
      this.seats[seat] = new SeatView(this, seat, a.x, a.y, seat !== 2);
    }

    this.input.dragDistanceThreshold = 8;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Obj[]) => {
      sfx.unlock();
      if (over.length === 0) this.onTablePointer(p.worldX, p.worldY);
    });
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      this.dragging = true;
      const id = obj.getData('id') as number;
      // seçili birden çok taştan biri sürüklenirse hepsi birlikte gider (ıstakadaki sırasıyla)
      this.groupDrag = null;
      if (this.selected.has(id) && this.selected.size >= 2) {
        const order = this.slots.filter((x): x is number => x !== null && this.selected.has(x));
        this.groupDrag = { ids: order, lead: order.indexOf(id) };
      }
      for (const gid of this.groupDrag?.ids ?? [id]) {
        const img = this.tiles.get(gid);
        if (!img) continue;
        img.setData('dragged', true).setData('dragging', true);
        this.tweens.killTweensOf(img);
        img.setDepth(5000 + (gid === id ? 50 : 0));
        this.tweens.add({ targets: img, scale: RACK.scale * 1.12, duration: 90 });
      }
    });
    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      obj.setPosition(x, y);
      const gd = this.groupDrag;
      if (!gd) return;
      const step = RACK.slotW * 0.98;
      gd.ids.forEach((gid, i) => {
        if (i === gd.lead) return;
        this.tiles.get(gid)?.setPosition(x + (i - gd.lead) * step, y);
      });
    });
    this.input.on('dragend', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      this.dragging = false;
      const gd = this.groupDrag;
      this.groupDrag = null;
      for (const gid of gd?.ids ?? [obj.getData('id') as number]) this.tiles.get(gid)?.setData('dragging', false);
      if (gd) this.onGroupDrop(gd.ids, gd.lead, p.worldX, p.worldY);
      else this.onDrop(obj.getData('id') as number, p.worldX, p.worldY);
    });

    this.dealing = true;
    this.arrange('seri');
    this.showRoundBanner();
    this.dealBacks();
    this.sync();
    this.dealing = false;
    sfx.shuffle();
    this.ctrl.hold(this.bannerMs + 100);
    this.ctrl.start();
  }

  /** Öğreticinin ışık tutacağı yerler (canlı konumlar; her karede okunur). */
  private spotCtx(): SpotCtx {
    const rect = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x, y: r.y, w: r.width, h: r.height });
    return {
      tilePos: (id) => {
        const img = this.tiles?.get(id);
        return img && img.active ? { x: img.x, y: img.y } : null;
      },
      button: (name) => {
        const b = this.buttons[name];
        return { x: b.x - b.width / 2, y: b.y - b.height / 2, w: b.width, h: b.height };
      },
      meld: (id) => {
        const h = this.meldHits.find((m) => m.id === id);
        return h ? rect(h.rect) : null;
      },
      myZone: () => {
        const z = MELD_ZONES[0];
        return { x: z.x0, y: z.y0, w: z.x1 - z.x0, h: z.y1 - z.y0 };
      },
      deck: () => DECK,
      discardSpot: () => DISCARD_POS[0],
      sideSpot: () => DISCARD_POS[3],
      rulePanel: () => ({ x: 10, y: 8, w: 404, h: 72 }),
      selected: () => this.selected,
      stagedCount: () => this.staged.length,
    };
  }

  private buildStaticTable() {
    const g = this.add.graphics().setDepth(1);
    // atılan taş yuvaları
    DISCARD_POS.forEach((p) => {
      g.lineStyle(2, 0xffffff, 0.16);
      g.strokeRoundedRect(p.x - 26, p.y - 35, 52, 66, 9);
    });
    txt(this, DISCARD_POS[0].x, DISCARD_POS[0].y + 38, 'AT', 11, 'rgba(255,255,255,0.45)', 900).setOrigin(0.5, 0).setDepth(1);
    // perlerin yeri
    MELD_ZONES.forEach((z) => {
      g.fillStyle(0x000000, 0.07);
      g.fillRoundedRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0, 14);
    });
  }

  private buildRulePanel() {
    const c = this.add.container(10, 8).setDepth(60);
    const g = this.add.graphics();
    panel(g, 0, 0, 404, 72, 16, UI.panel, 0.94, UI.gold, 0.55);
    const chipBg = this.add.graphics();
    chipBg.fillStyle(UI.gold, 1);
    chipBg.fillRoundedRect(10, 9, 70, 22, 11);
    this.ruleChip = txt(this, 45, 20, '', 12, '#2a1d02', 900).setOrigin(0.5);
    this.ruleName = txt(this, 88, 6, '', 20, '#fff', 900);
    this.ruleDesc = txt(this, 12, 35, '', 12, UI.muted, 700, { wordWrap: { width: 340 }, lineSpacing: 1 });
    this.ruleExtra = this.add.image(380, 34, 'tile-back').setScale(0.29);
    c.add([g, chipBg, this.ruleChip, this.ruleName, this.ruleDesc, this.ruleExtra]);
  }

  private buildDeck() {
    this.deckGlow = this.add.graphics().setDepth(9);
    for (let i = 2; i >= 0; i--) {
      const img = this.add.image(DECK.x - i * 2.5, DECK.y - i * 2.5, 'tile-back').setScale(0.5).setDepth(10 + (2 - i));
      this.deckBacks.push(img);
    }
    this.deckTop = this.deckBacks[this.deckBacks.length - 1];
    this.deckCount = txt(this, DECK.x, DECK.y + 50, '', 15, '#fff', 900).setOrigin(0.5, 0).setDepth(12);
    const zone = this.add.zone(DECK.x, DECK.y, 90, 110).setInteractive({ useHandCursor: true }).setDepth(13);
    zone.on('pointerdown', () => {
      if (this.myDraw) this.humanAct({ type: 'drawDeck' });
    });
    zone.on('pointerover', () => this.myDraw && this.tweens.add({ targets: this.deckTop, y: DECK.y - 8, duration: 120 }));
    zone.on('pointerout', () => this.tweens.add({ targets: this.deckTop, y: DECK.y, duration: 120 }));
    const take = this.add.zone(DISCARD_POS[3].x, DISCARD_POS[3].y, 70, 86).setInteractive({ useHandCursor: true }).setDepth(400);
    take.on('pointerdown', () => {
      if (this.myDraw && this.s.pendingDiscard) this.humanAct({ type: 'takeDiscard' });
    });
  }

  private buildStatus() {
    this.statusBg = this.add.graphics();
    this.statusT = txt(this, 0, 0, '', 15, '#fff', 800).setOrigin(0.5);
    this.statusBox = this.add.container(STATUS.x, STATUS.y, [this.statusBg, this.statusT]).setDepth(70);
    this.meChipBg = this.add.graphics().setDepth(70);
    this.meChipT = txt(this, 0, STATUS.y, '', 13, '#fff', 800).setOrigin(0, 0.5).setDepth(71);
  }

  private buildButtons() {
    const [c0, c1] = BTN.cols;
    const [r0, r1, r2] = BTN.rows;
    const { w, h } = BTN;
    this.buttons = {
      group: new Button(this, c0, r0, w, h, 'Per Ekle', () => this.stageSelected(), UI.blue),
      lay: new Button(this, c1, r0, w, h, 'Kuralı Aç', () => this.layStaged(), UI.green),
      cancel: new Button(this, c0, r1, w, h, 'Geri Al', () => this.unstageAll(), UI.slate),
      discard: new Button(this, c1, r1, w, h, 'Taş At', () => this.discardSelected(), UI.red),
      hint: new Button(this, c0, r2, w, h, 'Öner', () => this.suggest(), UI.amber),
      sort: new Button(this, c1, r2, w, h, 'Küt Diz', () => this.toggleSort(), UI.amber),
      scores: new Button(this, 1156, 40, 54, 54, '', () => this.showScores(), UI.slate).setIcon(icon('list'), 28),
      menu: new Button(this, 1220, 40, 54, 54, '', () => this.showGameMenu(), UI.slate).setIcon(icon('menu'), 28),
    };
    Object.values(this.buttons).forEach((b) => b.setDepth(80));
  }

  // ================================================================ olaylar

  private onEvents(events: GameEvent[]) {
    for (const e of events) {
      if (!this.tutorial && !this.mode.preview) this.track(e);
      this.actor = e.seat;
      switch (e.type) {
        case 'roundStart':
          this.closeOverlay();
          this.tiles.clearAll(DECK);
          this.selected.clear();
          this.staged = [];
          this.slots.fill(null);
          this.dealing = true;
          this.arrange(this.sortBy);
          this.showRoundBanner();
          this.dealBacks();
          sfx.shuffle();
          this.ctrl.hold(this.bannerMs + 100);
          break;
        case 'drawDeck':
          if (e.seat !== 0) this.tiles.flyBack(DECK, this.anchor(e.seat));
          sfx.draw();
          break;
        case 'takeDiscard':
          sfx.draw();
          if (e.seat !== 0) this.bubble(e.seat, 'Yan taşı aldı', UI.panelHi, false);
          break;
        case 'pass':
          if (e.seat !== 0) this.bubble(e.seat, 'Yan taşı almadı', UI.panelHi, false);
          break;
        case 'claim':
          this.bubble(e.seat, 'İSTEDİ! +1', UI.gold);
          if (e.seat !== 0) this.tiles.flyBack(DECK, this.anchor(e.seat), 140);
          sfx.pop();
          haptic(20);
          break;
        case 'open':
          this.bubble(e.seat, 'KURALI AÇTI!', UI.green, false);
          sfx.chime();
          break;
        case 'lay':
          this.bubble(e.seat, 'Per dizdi', UI.panelHi, false);
          sfx.tok();
          break;
        case 'addToMeld':
          this.bubble(e.seat, 'İşledi', UI.panelHi, false);
          sfx.tok();
          break;
        case 'swapJoker':
          this.bubble(e.seat, 'OKEYİ ALDI!', UI.gold);
          if (e.target !== undefined && this.ctrl.game.isOpponent(e.seat, e.target)) {
            this.time.delayedCall(260, () => this.bubble(e.target!, `+${OKEY_SWAP_PENALTY} ceza`, UI.red, false));
          }
          sfx.swap();
          haptic(25);
          break;
        case 'okeyHeld':
          this.time.delayedCall(700, () => this.bubble(e.seat, 'Elinde okey kaldı! +50', UI.red, false));
          break;
        case 'islek':
          this.bubble(e.seat, `İŞLEK! Geri aldı +1 · +${ISLEK_PENALTY}`, UI.red, false);
          if (e.seat !== 0) this.tiles.flyBack(DECK, this.anchor(e.seat), 120);
          else this.selected.clear();
          sfx.error();
          haptic(30);
          break;
        case 'discard':
          sfx.tok();
          break;
        case 'roundEnd': {
          const winner = e.seat;
          const h = this.s.history[this.s.history.length - 1];
          const okey = winner >= 0 && !!h && (h.finishType === 'okey' || h.finishType === 'ciftOkey');
          if (okey) {
            const dbl = h!.finishType === 'ciftOkey';
            this.resultDelay = 250 + this.celebrationMs(dbl, !!h!.ciftEli);
            this.time.delayedCall(450, () => this.okeyCelebration(winner, dbl, h!.multiplier, !!h!.ciftEli));
          } else {
            this.resultDelay = 1100;
            // normal bitiş: müzik değil, son taşın masaya vurulma sesi
            const mine = winner === 0 || (this.s.mode === 'team' && winner >= 0 && teamOf(winner) === 0);
            if (winner >= 0) sfx.finish(mine);
            else sfx.lose();
          }
          if (winner >= 0) this.bubble(winner, 'BİTTİ!', UI.gold);
          break;
        }
      }
    }
    this.syncSlots();
    this.sync();
    this.dealing = false;
  }

  private humanAct(action: Action): boolean {
    sfx.unlock();
    const err = this.ctrl.act(action);
    if (err) this.showError(err);
    else this.errorUntil = 0; // başarılı hamle eski uyarıyı kaldırır
    this.sync();
    return !err;
  }

  private showError(msg: string) {
    this.errorUntil = this.time.now + 2600;
    this.setStatus(msg, 'error');
    sfx.error();
    haptic(40);
    this.tweens.add({ targets: this.statusBox, x: STATUS.x + 6, duration: 45, yoyo: true, repeat: 3, onComplete: () => this.statusBox.setX(STATUS.x) });
    this.time.delayedCall(2650, () => this.updateStatus());
  }

  private bubble(seat: number, text: string, color: number, dark = true) {
    if (seat < 0) return;
    if (seat === 0) showBubble(this, DECK.x, 382, text, color, dark);
    else this.seats[seat].bubble(text, color, dark);
  }

  private anchor(seat: number): Point {
    return SEAT_ANCHOR[seat];
  }

  private dealBacks() {
    for (let seat = 1; seat < 4; seat++) {
      for (let k = 0; k < 3; k++) this.tiles.flyBack(DECK, this.anchor(seat), k * 90 + seat * 40, 360);
    }
  }

  // ================================================================ ıstaka

  private slotPos(i: number) {
    const col = i % RACK.cols;
    const row = Math.floor(i / RACK.cols);
    return { x: RACK.x0 + col * RACK.slotW + RACK.slotW / 2, y: RACK.rowY[row] };
  }

  private slotAt(x: number, y: number): number | null {
    const b = RACK.board;
    if (x < b.x || x > b.x + b.w || y < b.y - 30 || y > b.y + b.h + 10) return null;
    const col = Phaser.Math.Clamp(Math.floor((x - RACK.x0) / RACK.slotW), 0, RACK.cols - 1);
    const row = y < (RACK.rowY[0] + RACK.rowY[1]) / 2 ? 0 : 1;
    return row * RACK.cols + col;
  }

  /** Taşları ıstakaya dizer (seri: renk-sayı, küt: sayı-renk); grupları satır sonunda bölmez. */
  private arrange(by: 'seri' | 'kut') {
    const hand = [...this.me.hand].sort(by === 'seri' ? compareByColor : compareByValue);
    const groups: Tile[][] = [];
    for (const t of hand) {
      const g = groups[groups.length - 1];
      const prev = g?.[g.length - 1];
      const same =
        prev &&
        prev.joker === t.joker &&
        (t.joker || (by === 'seri' ? prev.color === t.color && t.value - prev.value <= 1 : prev.value === t.value));
      if (same) g.push(t);
      else groups.push([t]);
    }
    const slots: (number | null)[] = new Array(SLOT_COUNT).fill(null);
    let row = 0;
    let col = 0;
    let ok = true;
    for (const g of groups) {
      if (col > 0 && col + g.length > RACK.cols && g.length <= RACK.cols) {
        row++;
        col = 0;
      }
      for (const t of g) {
        if (col >= RACK.cols) {
          row++;
          col = 0;
        }
        if (row >= RACK.rows) {
          ok = false;
          break;
        }
        slots[row * RACK.cols + col++] = t.id;
      }
      if (!ok) break;
      col++;
    }
    if (!ok) {
      slots.fill(null);
      hand.forEach((t, i) => (slots[i] = t.id));
    }
    this.slots = slots;
  }

  private syncSlots() {
    const hand = this.me.hand;
    const ids = new Set(hand.map((t) => t.id));
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = this.slots[i];
      if (id !== null && !ids.has(id)) this.slots[i] = null;
    }
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    this.staged = this.staged.map((g) => g.filter((id) => ids.has(id))).filter((g) => g.length > 0);
    const present = new Set(this.slots.filter((x): x is number => x !== null));
    for (const t of hand) {
      if (present.has(t.id)) continue;
      let last = -1;
      this.slots.forEach((x, i) => {
        if (x !== null) last = i;
      });
      let idx = this.slots.findIndex((x, i) => x === null && i > last);
      if (idx < 0) idx = this.slots.findIndex((x) => x === null);
      if (idx >= 0) this.slots[idx] = t.id;
    }
  }

  private moveToSlot(id: number, target: number) {
    const src = this.slots.indexOf(id);
    if (src < 0 || src === target) return;
    this.slots[src] = null;
    if (this.slots[target] === null) {
      this.slots[target] = id;
      return;
    }
    const rowStart = Math.floor(target / RACK.cols) * RACK.cols;
    const rowEnd = rowStart + RACK.cols - 1;
    let e = -1;
    for (let i = target + 1; i <= rowEnd; i++)
      if (this.slots[i] === null) {
        e = i;
        break;
      }
    if (e >= 0) {
      for (let i = e; i > target; i--) this.slots[i] = this.slots[i - 1];
      this.slots[target] = id;
      return;
    }
    for (let i = target - 1; i >= rowStart; i--)
      if (this.slots[i] === null) {
        e = i;
        break;
      }
    if (e >= 0) {
      for (let i = e; i < target; i++) this.slots[i] = this.slots[i + 1];
      this.slots[target] = id;
      return;
    }
    this.slots[src] = this.slots[target];
    this.slots[target] = id;
  }

  // ================================================================ etkileşim

  private onTileTap(id: number, kind: TileKind) {
    sfx.unlock();
    if (kind === 'rack') {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      sfx.select();
      this.sync();
    } else if (kind === 'staged') {
      const gi = this.staged.findIndex((g) => g.includes(id));
      if (gi >= 0) {
        this.staged.splice(gi, 1);
        sfx.select();
        this.sync();
      }
    }
  }

  private onTablePointer(x: number, y: number) {
    // iki okey seçiliyken ortaya / atma yerine dokunmak = çift okey
    if (this.myAction && this.doubleOkeyReady() && this.selected.size === 2 && this.isCenterDrop(x, y)) {
      this.humanAct({ type: 'finishDoubleOkey' });
      return;
    }
    if (!this.myAction || this.selected.size === 0) return;
    const hit = this.meldHits.find((h) => h.rect.contains(x, y));
    if (!hit) return;
    const sel = this.selectedSingle();
    if (sel) this.meldAction(sel.id, hit.id);
    else this.addGroupToMeld(this.slots.filter((x): x is number => x !== null && this.selected.has(x)), hit.id);
  }

  /** Masanın ortası (deste çevresi) ya da atma yeri. */
  private isCenterDrop(x: number, y: number) {
    return Phaser.Math.Distance.Between(x, y, DECK.x, DECK.y) < 130 || Phaser.Math.Distance.Between(x, y, DISCARD_POS[0].x, DISCARD_POS[0].y) < 80;
  }

  private onDrop(id: number, x: number, y: number) {
    const slot = this.slotAt(x, y);
    const dropped = this.tileById(id);
    const onMeld = this.meldHits.some((h) => h.rect.contains(x, y));
    if (slot !== null) {
      this.moveToSlot(id, slot);
      sfx.tok();
    } else if (
      this.doubleOkeyReady() &&
      dropped?.joker &&
      !onMeld &&
      x >= TABLE.x && x <= TABLE.x + TABLE.w && y >= TABLE.y && y <= TABLE.y + TABLE.h + 20
    ) {
      // elde sadece iki okey: biri masaya sürüklenince ikisi birden ortaya vurulur
      if (this.myAction) this.humanAct({ type: 'finishDoubleOkey' });
      else this.showError('Sıranı bekle.');
    } else if (
      Phaser.Math.Distance.Between(x, y, DISCARD_POS[0].x, DISCARD_POS[0].y) < 70 ||
      (this.me.hand.length === 1 && Phaser.Math.Distance.Between(x, y, DECK.x, DECK.y) < 80)
    ) {
      if (this.myAction) this.tryDiscard(id);
      else this.showError('Taş atmak için sıranı bekle.');
    } else {
      let hit = this.meldHits.find((h) => h.rect.contains(x, y));
      if (hit && dropped && this.inZone(MELD_ZONES[0], x, y) && !this.groupAddOrder([dropped], hit.id).order.length) hit = undefined;
      if (hit && this.myAction) this.meldAction(id, hit.id);
      else if (this.inZone(MELD_ZONES[0], x, y) && this.myAction) {
        // kendi alanına bırakılan taş → hazırlanan pere eklenir
        const last = this.staged[this.staged.length - 1];
        if (last && !this.groupValid(last.map((i) => this.tileById(i)!))) last.push(id);
        else this.staged.push([id]);
        this.selected.delete(id);
      }
    }
    this.sync();
  }

  /** Seçili birden çok taş birlikte bırakıldı: ıstakada blok halinde taşınır, kendi alanında per olur, pere işlenir. */
  private onGroupDrop(ids: number[], lead: number, x: number, y: number) {
    const slot = this.slotAt(x, y);
    let hit = this.meldHits.find((h) => h.rect.contains(x, y));
    const tiles = ids.map((id) => this.tileById(id)).filter((t): t is Tile => !!t);
    // kendi alanında bir perin üstüne denk geldi ama o pere uymuyorsa: yeni per olarak hazırla
    if (hit && this.inZone(MELD_ZONES[0], x, y) && !this.groupAddOrder(tiles, hit.id).order.length) hit = undefined;
    if (slot !== null) {
      this.placeBlock(ids, slot - lead);
      sfx.tok();
    } else if (this.doubleOkeyReady() && ids.length === 2 && tiles.every((t) => t.joker) && !hit && this.isOnTable(x, y)) {
      if (this.myAction) this.humanAct({ type: 'finishDoubleOkey' });
      else this.showError('Sıranı bekle.');
    } else if (hit) {
      if (this.myAction) this.addGroupToMeld(ids, hit.id);
      else this.showError('İşlemek için sıranı bekle.');
    } else if (this.inZone(MELD_ZONES[0], x, y)) {
      if (this.myAction) {
        this.staged.push(ids);
        this.selected.clear();
        sfx.tok();
      } else this.showError('Per dizmek için sıranı bekle.');
    } else if (Phaser.Math.Distance.Between(x, y, DISCARD_POS[0].x, DISCARD_POS[0].y) < 70) {
      this.showError('Bir seferde tek taş atılır.');
    }
    this.sync();
  }

  private isOnTable(x: number, y: number) {
    return x >= TABLE.x && x <= TABLE.x + TABLE.w && y >= TABLE.y && y <= TABLE.y + TABLE.h + 20;
  }

  /** Taşları ıstakada start'tan itibaren yan yana koyar; yer açmak için diğerlerini kaydırır. */
  private placeBlock(ids: number[], start: number) {
    const set = new Set(ids);
    this.slots = this.slots.map((x) => (x !== null && set.has(x) ? null : x));
    const row = Math.floor(Phaser.Math.Clamp(start, 0, SLOT_COUNT - 1) / RACK.cols);
    const rowStart = row * RACK.cols;
    const rowEnd = rowStart + RACK.cols - 1;
    let s = Phaser.Math.Clamp(start, rowStart, Math.max(rowStart, rowEnd - ids.length + 1));
    for (const id of ids) {
      const target = Math.min(s++, SLOT_COUNT - 1);
      if (this.slots[target] === null) {
        this.slots[target] = id;
        continue;
      }
      // sağa doğru ilk boşluğa kadar kaydır (aynı satırda), yoksa herhangi bir boşluğa koy
      const tr = Math.floor(target / RACK.cols);
      const end = tr * RACK.cols + RACK.cols - 1;
      let e = -1;
      for (let i = target + 1; i <= end; i++)
        if (this.slots[i] === null) {
          e = i;
          break;
        }
      if (e >= 0) {
        for (let i = e; i > target; i--) this.slots[i] = this.slots[i - 1];
        this.slots[target] = id;
      } else {
        const free = this.slots.indexOf(null);
        if (free >= 0) this.slots[free] = id;
      }
    }
  }

  /** Taşların bir pere hangi sırayla işlenebileceği (uca eklenebilene göre) ve artakalanlar. */
  private groupAddOrder(tiles: Tile[], meldId: number): { order: Tile[]; rest: Tile[] } {
    const found = this.s.melds.find((x) => x.id === meldId);
    if (!found) return { order: [], rest: tiles };
    let m: Meld = found;
    let rest = [...tiles];
    const order: Tile[] = [];
    let progress = true;
    while (rest.length && progress) {
      progress = false;
      for (const t of rest) {
        const next: Meld | null = withTile(m, t);
        if (next) {
          m = next;
          order.push(t);
          rest = rest.filter((x) => x !== t);
          progress = true;
          break;
        }
      }
    }
    // tek taş okeyin yerine de geçebilir
    if (!order.length && tiles.length === 1 && jokerSwapIndex(found, tiles[0]) !== null) return { order: tiles, rest: [] };
    return { order, rest };
  }

  /** Birden çok taşı aynı pere işler; uygun sırayı önceden hesaplar. */
  private addGroupToMeld(ids: number[], meldId: number) {
    if (!this.ctrl.game.canAddToMelds(0)) {
      this.showError(this.me.opened ? 'Kuralı bu sırada açtın — işleme sonraki sırada.' : 'İşlemek için önce kuralı açmalısın.');
      return;
    }
    const { order, rest } = this.groupAddOrder(ids.map((id) => this.tileById(id)).filter((t): t is Tile => !!t), meldId);
    if (ids.length === 1 || !order.length) {
      // tek taşsa okey alma da olabilir
      if (ids.length === 1) return this.meldAction(ids[0], meldId);
      this.showError('Bu taşlar bu pere işlenemez.');
      return;
    }
    for (const t of order) {
      const err = this.ctrl.act({ type: 'addToMeld', tileId: t.id, meldId });
      if (err) {
        this.showError(err);
        break;
      }
      this.selected.delete(t.id);
    }
    if (rest.length) this.showError(`${rest.length} taş bu pere uymadı, elinde kaldı.`);
    else this.errorUntil = 0;
    this.sync();
  }

  private inZone(z: Zone, x: number, y: number) {
    return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
  }

  private tileById(id: number): Tile | undefined {
    return this.me.hand.find((t) => t.id === id);
  }

  private selectedSingle(): Tile | null {
    if (this.selected.size !== 1) return null;
    return this.tileById([...this.selected][0]) ?? null;
  }

  private stageSelected() {
    if (this.selected.size < 1) return;
    const order = this.slots.filter((x): x is number => x !== null && this.selected.has(x));
    this.staged.push(order);
    this.selected.clear();
    this.sync();
  }

  private unstageAll() {
    this.staged = [];
    this.sync();
  }

  private layStaged() {
    if (!this.staged.length) return;
    this.humanAct({ type: 'lay', melds: this.staged });
  }

  private discardSelected() {
    // Son taşta seçim gerekmez: "Bitir!" o taşı ortaya vurur.
    if (this.doubleOkeyReady()) return this.humanAct({ type: 'finishDoubleOkey' });
    if (this.me.hand.length === 1) return this.tryDiscard(this.me.hand[0].id);
    if (this.selected.size !== 1) return;
    this.tryDiscard([...this.selected][0]);
  }

  /** Elde sadece iki okey kaldı mı (ikisi birden ortaya vurulabilir: çift okey). */
  private doubleOkeyReady() {
    const h = this.me.hand;
    return this.me.opened && h.length === 2 && h.every((t) => t.joker);
  }

  /** İşlek taş atılmadan önce bir kez uyarır (atarsa +50 ceza). */
  private tryDiscard(id: number) {
    const t = this.tileById(id);
    // Son taş her zaman ortaya vurulup biter (işlek uyarısı yok).
    if (this.assist && t && this.me.hand.length > 1 && this.ctrl.game.isIslek(t) && this.islekConfirm !== id) {
      this.islekConfirm = id;
      this.showError(`İşlek taş! Atarsan geri gelir + ortadan 1 taş, +${ISLEK_PENALTY} ceza, sıra geçer · yine de atmak için tekrar at`);
      return;
    }
    this.islekConfirm = -1;
    this.humanAct({ type: 'discard', tileId: id });
  }

  /** Taşı pere ver: okeyin yerine geçiyorsa okeyi al, değilse işle. */
  private meldAction(tileId: number, meldId: number) {
    const t = this.tileById(tileId);
    const m = this.s.melds.find((x) => x.id === meldId);
    if (t && m && jokerSwapIndex(m, t) !== null) this.humanAct({ type: 'swapJoker', tileId, meldId });
    else this.humanAct({ type: 'addToMeld', tileId, meldId });
  }

  private toggleSort() {
    this.sortBy = this.sortBy === 'seri' ? 'kut' : 'seri';
    this.arrange(this.sortBy);
    sfx.shuffle();
    this.sync();
  }

  private toggleSound() {
    sfx.setMuted(!sfx.muted);
    sfx.unlock();
  }

  /** İpucu: açılabilecek / dizilebilecek perleri hazırlık alanına koyar. */
  private suggest() {
    const c = this.ctrl.game.contract;
    const me = this.me;
    let melds: Tile[][] | null = null;
    if (c.mode === 'normal' && !me.opened) melds = findContractMelds(me.hand, c.reqs);
    else if (c.mode === 'normal' && !me.openedThisTurn) {
      const g = findGreedyMelds(me.hand, me.hand.filter((t) => t.joker).length);
      melds = g.length ? g : null;
    } else if (c.mode === 'eldenBitme') melds = findFullPartition(me.hand, 1)?.melds ?? null;
    else if (c.mode === 'ciftEli') melds = findPairPartition(me.hand, 7)?.melds ?? null;
    if (!melds || !melds.length) {
      this.showError(
        c.mode === 'normal' && me.openedThisTurn
          ? 'Kuralı bu sırada açtın — fazlalıklar sonraki sıranda iner.'
          : c.mode === 'normal' && me.opened
            ? 'Dizilecek yeni per yok — tek taş seçip parlayan pere işleyebilirsin.'
            : 'Şu an açılabilecek bir dizilim yok.',
      );
      return;
    }
    this.selected.clear();
    this.staged = melds.map((m) => m.map((t) => t.id));
    sfx.select();
    this.sync();
  }

  private layLabel() {
    const c = this.ctrl.game.contract;
    if (c.mode === 'eldenBitme') return 'Elden Bit';
    if (c.mode === 'ciftEli') return 'Çiftleri Aç';
    return this.me.opened ? 'Yere Koy' : 'Kuralı Aç';
  }

  private groupValid(tiles: Tile[]): boolean {
    if (tiles.some((t) => !t)) return false;
    if (this.ctrl.game.contract.mode === 'ciftEli') return !!asCift(tiles);
    return !!(asSeri(tiles) ?? asKut(tiles));
  }

  // ================================================================ çizim

  /** Tek giriş noktası: durumdan görünümü hesaplar, taşları hedeflerine kaydırır. */
  private sync() {
    if (!this.ctrl) return;
    this.tutorial?.update(); // öğretici adımı önce ilerlesin ki doğru taşlar parlasın
    const s = this.s;
    const targets = new Map<number, Target>();
    const byId = new Map<number, Tile>();
    s.players.forEach((p) => p.hand.forEach((t) => byId.set(t.id, t)));
    s.melds.forEach((m) => m.tiles.forEach((t) => byId.set(t.id, t)));

    // --- ıstaka
    const stagedIds = new Set(this.staged.flat());
    this.slots.forEach((id, i) => {
      if (id === null || stagedIds.has(id)) return;
      const t = byId.get(id);
      if (!t) return;
      const { x, y } = this.slotPos(i);
      const sel = this.selected.has(id);
      const focus = !sel && !!this.tutorial?.highlights.has(id);
      const hint = !sel && this.assist && this.ctrl.game.isIslek(t);
      targets.set(id, { tile: t, kind: 'rack', selected: sel, hint, focus, place: { x, y: sel ? y - 16 : y, scale: RACK.scale, depth: 200 + i } });
    });

    // --- atılan taşlar (her yığında en üstteki 2 taş)
    s.players.forEach((p, seat) => {
      const pile = p.discards;
      const pos = DISCARD_POS[seat];
      pile.slice(-2).forEach((t, k, arr) => {
        const top = k === arr.length - 1;
        const ang = ((t.id * 37) % 9) - 4;
        targets.set(t.id, {
          tile: t,
          kind: 'discard',
          place: { x: pos.x + (top ? 0 : 4), y: pos.y + (top ? 0 : -4), scale: DISCARD_SCALE, depth: 300 + k, angle: ang, alpha: top ? 1 : 0.85 },
        });
      });
    });

    // --- eli bitiren taş: masanın ortasına, destenin üstüne
    (s.finishTiles ?? []).forEach((t, k, arr) => {
      const off = arr.length > 1 ? (k - 0.5) * 30 : 0;
      targets.set(t.id, { tile: t, kind: 'discard', place: { x: DECK.x + off, y: DECK.y - 4, scale: 0.56, depth: 450 + k, angle: arr.length > 1 ? (k ? 9 : -9) : -8 } });
    });

    // --- perler + hazırlananlar
    this.zoneGfx.clear();
    this.meldHits = [];
    this.stagedHits = [];
    const sel = this.selectedSingle();
    const canAdd = this.myAction && this.ctrl.game.canAddToMelds(0);
    for (let seat = 0; seat < 4; seat++) {
      const melds = s.melds.filter((m) => m.owner === seat);
      const groups: { tiles: Tile[]; meldId?: number; staged?: number }[] = melds.map((m) => ({ tiles: m.tiles, meldId: m.id }));
      if (seat === 0) this.staged.forEach((g, gi) => groups.push({ tiles: g.map((id) => byId.get(id)!).filter(Boolean), staged: gi }));
      if (!groups.length) continue;
      const lay = this.layoutZone(MELD_ZONES[seat], groups.map((g) => g.tiles.length));
      groups.forEach((g, gi) => {
        const frame = lay.frames[gi];
        if (g.meldId !== undefined) {
          const m = melds[gi];
          const swap = this.assist && !!(sel && canAdd && jokerSwapIndex(m, sel) !== null);
          const target = swap || (this.assist && !!(sel && canAdd && addPosition(m, sel))) || !!this.tutorial?.meldHighlights.has(m.id);
          this.zoneGfx.fillStyle(0x000000, 0.2);
          this.zoneGfx.fillRoundedRect(frame.x, frame.y, frame.width, frame.height, 8);
          if (target) {
            this.zoneGfx.lineStyle(3, swap ? 0x6fe7ff : UI.gold, 1);
            this.zoneGfx.strokeRoundedRect(frame.x - 2, frame.y - 2, frame.width + 4, frame.height + 4, 10);
          }
          this.meldHits.push({ id: g.meldId, rect: frame });
          g.tiles.forEach((t, i) =>
            targets.set(t.id, { tile: t, kind: 'meld', place: { x: lay.pos[gi][i].x, y: lay.pos[gi][i].y, scale: lay.scale, depth: 100 + i } }),
          );
        } else {
          const valid = this.groupValid(g.tiles);
          this.zoneGfx.fillStyle(valid ? 0x5fd38a : 0xe0574a, 0.16);
          this.zoneGfx.fillRoundedRect(frame.x, frame.y, frame.width, frame.height, 8);
          this.zoneGfx.lineStyle(2.5, valid ? 0x5fd38a : 0xe0574a, 0.95);
          this.zoneGfx.strokeRoundedRect(frame.x, frame.y, frame.width, frame.height, 8);
          this.stagedHits.push({ gi: g.staged!, rect: frame });
          g.tiles.forEach((t, i) =>
            targets.set(t.id, {
              tile: t,
              kind: 'staged',
              place: { x: lay.pos[gi][i].x, y: lay.pos[gi][i].y - 3, scale: lay.scale, depth: 150 + i, alpha: 0.92 },
            }),
          );
        }
      });
    }

    // --- yan taş parlaması (alınabilir / istenebilir)
    const fresh = s.pendingDiscard ?? (s.claim ? { tile: s.claim.tile, from: s.claim.from } : null);
    const prevFresh = this.lastFresh;
    this.lastFresh = fresh ? { id: fresh.tile.id, from: fresh.from } : null;
    if (!fresh && prevFresh) this.lastFresh = prevFresh; // bu çizimde uçuş hedefi için bir kez daha kullanılır
    if (fresh) {
      const p = DISCARD_POS[fresh.from];
      const mine = this.myDraw && fresh.from === 3;
      this.zoneGfx.lineStyle(mine ? 4 : 2, mine ? UI.gold : 0xffffff, mine ? 1 : 0.45);
      this.zoneGfx.strokeRoundedRect(p.x - 29, p.y - 38, 58, 72, 10);
    }
    if (this.myAction) {
      const p = DISCARD_POS[0];
      this.zoneGfx.lineStyle(3, UI.gold, 0.8);
      this.zoneGfx.strokeRoundedRect(p.x - 29, p.y - 38, 58, 72, 10);
    }

    this.tiles.sync(
      targets,
      (t) => this.originFor(t),
      (id) => this.departFor(id),
    );

    this.updateHud();
  }

  private originFor(t: Target): Origin | null {
    if (t.kind === 'rack') {
      if (this.dealing) {
        const idx = this.slots.indexOf(t.tile.id);
        return { x: DECK.x, y: DECK.y, scale: 0.5, flip: true, delay: 120 + Math.max(0, idx) * 22 };
      }
      return { x: DECK.x, y: DECK.y, scale: 0.5, flip: true };
    }
    if (this.actor > 0) {
      const a = this.anchor(this.actor);
      return { x: a.x, y: a.y, scale: 0.28, flip: true };
    }
    return null;
  }

  private departFor(id: number): Point | null {
    const holder = this.s.players.findIndex((p) => p.hand.some((t) => t.id === id));
    if (holder > 0) return this.anchor(holder);
    // Online'da rakip eli gizli: alınan yan taş, alan oyuncuya uçsun.
    if (this.lastFresh?.id === id && this.actor > 0) return this.anchor(this.actor);
    return null;
  }

  /** Bir oyuncunun per alanına grupları yerleştirir; sığan en büyük ölçeği seçer. */
  private layoutZone(z: Zone, lens: number[]) {
    const zw = z.x1 - z.x0 - 12;
    const zh = z.y1 - z.y0 - 8;
    let chosen = ZONE_SCALES[ZONE_SCALES.length - 1];
    let rows: number[][] = [];
    for (const sc of ZONE_SCALES) {
      const step = (TILE_W - 8) * sc;
      const rowH = TILE_H * sc + 8;
      rows = [];
      let cur: number[] = [];
      let w = 0;
      lens.forEach((len, gi) => {
        const gw = len * step;
        if (cur.length && w + 10 + gw > zw) {
          rows.push(cur);
          cur = [];
          w = 0;
        }
        w += (cur.length ? 10 : 0) + gw;
        cur.push(gi);
      });
      if (cur.length) rows.push(cur);
      chosen = sc;
      if (rows.length * rowH <= zh) break;
    }
    const sc = chosen;
    const step = (TILE_W - 8) * sc;
    const th = TILE_H * sc;
    const rowH = th + 8;
    const totalH = rows.length * rowH - 8;
    const cx = (z.x0 + z.x1) / 2;
    const cy = (z.y0 + z.y1) / 2;
    const pos: { x: number; y: number }[][] = [];
    const frames: Rect[] = [];
    rows.forEach((row, ri) => {
      const rowW = row.reduce((a, gi) => a + lens[gi] * step, 0) + 10 * (row.length - 1);
      let x = cx - rowW / 2;
      const y = cy - totalH / 2 + ri * rowH + th / 2;
      for (const gi of row) {
        pos[gi] = [];
        for (let i = 0; i < lens[gi]; i++) pos[gi].push({ x: x + i * step + step / 2, y });
        frames[gi] = new Phaser.Geom.Rectangle(x - 4, y - th / 2 - 3, lens[gi] * step + 8, th + 4);
        x += lens[gi] * step + 10;
      }
    });
    return { scale: sc, pos, frames };
  }

  private updateHud() {
    const s = this.s;
    const g = this.ctrl.game;
    const c = g.contract;
    const me = this.me;

    // kural paneli
    this.ruleChip.setText(`${s.ruleOrder === 'random' ? '🎲 ' : 'EL '}${g.roundNumber}/${g.totalRounds}`);
    this.ruleName.setText(this.spinning ? 'Kural seçiliyor…' : c.name);
    this.ruleDesc.setText(this.spinning ? 'Rastgele mod: çark dönüyor' : c.description);
    if (s.extraTile) this.ruleExtra.setTexture(tileKey(s.extraTile));

    // rakipler
    for (let seat = 1; seat < 4; seat++) {
      const active = (s.phase === 'draw' || s.phase === 'action') && s.current === seat;
      const thinking =
        this.ctrl.presence[seat] === false && !s.players[seat].isBot
          ? '⚠ bağlantı koptu · bot oynuyor'
          : s.phase === 'claim' && s.claim!.queue[0] === seat
            ? 'yan taşı düşünüyor…'
            : '';
      this.seats[seat].update(s.players[seat], active, s.mode, thinking);
    }

    // deste
    this.deckCount.setText(`${s.deck.length}`);
    this.deckBacks.forEach((b, i) => b.setVisible(s.deck.length > 2 - i));
    this.deckGlow.clear();
    if (this.myDraw) {
      this.deckGlow.lineStyle(4, UI.gold, 1);
      this.deckGlow.strokeCircle(DECK.x, DECK.y, 58);
      this.deckGlow.fillStyle(UI.gold, 0.12);
      this.deckGlow.fillCircle(DECK.x, DECK.y, 58);
    }

    // sıra sende mi?
    const myTurn = (s.phase === 'draw' || s.phase === 'action') && s.current === 0;
    this.rackGlow.clear();
    if (myTurn) {
      const b = RACK.board;
      this.rackGlow.lineStyle(4, UI.gold, 0.9);
      this.rackGlow.strokeRoundedRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, 22);
    }
    if (myTurn && !this.wasMyTurn) this.turnStartedAt = Date.now();
    if (myTurn && !this.wasMyTurn && s.phase === 'draw') {
      sfx.turn();
      haptic(15);
    }
    this.wasMyTurn = myTurn;

    // benim çipim
    const lock = c.mode === 'normal' ? (me.opened ? 'Kural açık ✓' : 'Kural kapalı') : me.opened ? 'Açtın ✓' : c.mode === 'eldenBitme' ? 'Tek seferde bit' : '7 çift aç';
    const team = s.mode === 'team' ? ' · Takım A' : '';
    this.meChipT.setText(`${me.avatar ?? ''} Sen · ${me.score} puan${team}  ·  ${lock}`);
    const mw = this.meChipT.width + 24;
    const mx = Math.max(158, STATUS.x - 300 - mw);
    this.meChipT.setX(mx + 12);
    this.meChipBg.clear();
    this.meChipBg.fillStyle(me.opened ? 0x1e6b43 : UI.panel, 0.95);
    this.meChipBg.fillRoundedRect(mx, STATUS.y - 14, mw, 28, 14);
    this.meChipBg.lineStyle(2, me.opened ? 0x5fd38a : UI.stroke, 1);
    this.meChipBg.strokeRoundedRect(mx, STATUS.y - 14, mw, 28, 14);

    this.updateButtons();
    this.updateStatus();
    this.updateOverlays();
  }

  private setStatus(text: string, tone: 'info' | 'turn' | 'error') {
    this.statusT.setText(text);
    const w = Math.max(220, this.statusT.width + 36);
    const h = 32;
    const fill = tone === 'error' ? 0x8f2b22 : tone === 'turn' ? UI.gold : UI.panel;
    this.statusT.setColor(tone === 'turn' ? '#2a1d02' : '#ffffff');
    this.statusBg.clear();
    this.statusBg.fillStyle(0x000000, 0.35);
    this.statusBg.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, h / 2);
    this.statusBg.fillStyle(fill, 0.97);
    this.statusBg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.statusBg.lineStyle(2, tone === 'turn' ? 0xffe9a8 : UI.stroke, 1);
    this.statusBg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }

  private updateStatus() {
    if (this.time.now < this.errorUntil) return;
    if (this.spinning) {
      this.setStatus('🎲 Bu elin kuralı seçiliyor…', 'info');
      return;
    }
    const s = this.s;
    const me = this.me;
    const c = this.ctrl.game.contract;
    if (s.phase === 'draw' && s.current === 0) {
      this.setStatus((s.pendingDiscard ? 'Sıra sende · ortadan çek ya da soldaki taşı al' : 'Sıra sende · ortadan çek') + this.turnClock(), 'turn');
    } else if (s.phase === 'action' && s.current === 0) {
      let t: string;
      if (this.doubleOkeyReady()) t = 'Elinde iki okey kaldı! Ortaya sürükle ya da "Çift Okey!"';
      else if (me.hand.length === 1 && me.opened) t = me.hand[0].joker ? 'Son taş okey! Ortaya vur → okeyle bit' : 'Son taş! Ortaya vur ve bit → "Bitir!"';
      else if (c.mode !== 'normal') t = 'Tek seferde açabiliyorsan "Öner" · yoksa bir taş at';
      else if (!me.opened) t = `Sadece kuralı aç (${c.name}) ya da taş at`;
      else if (me.openedThisTurn) t = 'Kural açıldı! Fazlalıklar sonraki sırada · bir taş at';
      else t = 'Per diz · taş seçip pere dokunarak işle · taş at';
      this.setStatus(t + this.turnClock(), 'turn');
    } else if (s.phase === 'claim') {
      this.setStatus(
        s.claim!.queue[0] === 0
          ? 'Yan taşı istiyor musun?'
          : s.current === 0
            ? 'Yan taşı almadın · diğerlerine soruluyor, sonra ortadan çekeceksin…'
            : 'Yan taş isteniyor mu…',
        'info',
      );
    } else if (s.phase === 'draw' || s.phase === 'action') {
      this.setStatus(`${s.players[s.current].name} oynuyor…`, 'info');
    } else {
      this.setStatus('El bitti', 'info');
    }
  }

  private updateButtons() {
    const b = this.buttons;
    const c = this.ctrl.game.contract;
    const me = this.me;
    const stagedValid = this.staged.length > 0 && this.staged.every((g) => this.groupValid(g.map((id) => this.tileById(id)!)));
    b.group.setLabel(c.mode === 'ciftEli' ? 'Çift Ekle' : 'Per Ekle').setEnabled(this.selected.size >= 2);
    b.lay.setLabel(this.layLabel()).setEnabled(this.myAction && this.staged.length > 0 && !me.openedThisTurn);
    b.lay.setPulse(this.myAction && stagedValid && !me.openedThisTurn);
    b.cancel.setEnabled(this.staged.length > 0);
    const dbl = this.doubleOkeyReady();
    const lastTile = this.me.hand.length === 1 || dbl;
    b.discard
      .setLabel(dbl ? 'Çift Okey!' : lastTile ? 'Bitir!' : 'Taş At')
      .setColor(lastTile ? UI.green : UI.red)
      .setEnabled(this.myAction && (this.selected.size === 1 || lastTile));
    b.discard.setPulse(this.myAction && lastTile);
    b.sort.setLabel(this.sortBy === 'seri' ? 'Küt Diz' : 'Seri Diz');
    b.hint.setEnabled(this.s.phase !== 'roundOver' && this.s.phase !== 'gameOver');
  }

  // ================================================================ pencereler

  private closeOverlay() {
    this.overlayTimers.forEach((t) => (t instanceof Phaser.Tweens.Tween ? t.remove() : t.remove(false)));
    this.overlayTimers = [];
    if (this.overlay) {
      const o = this.overlay;
      this.tweens.add({ targets: o, alpha: 0, duration: 140, onComplete: () => o.destroy() });
    }
    this.overlay = null;
    this.overlayKind = 'none';
  }

  /** Ortalanmış pencere; dim=true ise arkayı karartır ve tıklamayı keser. */
  private openOverlay(kind: OverlayKind, w: number, h: number, dim: boolean, cy = GAME_H / 2): Phaser.GameObjects.Container {
    this.closeOverlay();
    const c = this.add.container(0, 0).setDepth(4000);
    if (dim) {
      const r = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive();
      c.add(r);
    }
    const g = this.add.graphics();
    panel(g, GAME_W / 2 - w / 2, cy - h / 2, w, h, 22, 0x0c2c21, 0.98, UI.gold, 0.9);
    c.add(g);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this.overlay = c;
    this.overlayKind = kind;
    return c;
  }

  private updateOverlays() {
    const s = this.s;
    if (s.phase === 'claim' && s.claim!.queue[0] === 0) {
      if (this.overlayKind !== 'claim') this.showClaimPrompt();
    } else if (this.overlayKind === 'claim') {
      this.closeOverlay();
    }
    if ((s.phase === 'roundOver' || s.phase === 'gameOver') && this.roundShown < s.history.length) {
      this.roundShown = s.history.length;
      this.time.delayedCall(this.resultDelay, () => (this.tutorial ? this.tutorial.complete() : this.showRoundResult()));
    }
  }

  private showClaimPrompt() {
    const s = this.s;
    const cl = s.claim!;
    const cx = GAME_W / 2;
    const cy = DECK.y;
    const c = this.openOverlay('claim', 470, 176, false, cy);
    c.add(this.add.image(cx - 170, cy - 2, tileKey(cl.tile)).setScale(0.66));
    c.add(txt(this, cx - 112, cy - 70, `${s.players[cl.from].name}'in taşı`, 20, '#fff', 900));
    c.add(txt(this, cx - 112, cy - 40, 'Sıradaki almadı. İstersen yan taşı\nortadan 1 taşla birlikte alırsın (+2 taş).', 14, UI.muted, 700));
    const answer = (want: boolean) => {
      if (this.overlayKind !== 'claim') return;
      this.closeOverlay();
      this.humanAct({ type: 'claim', want });
    };
    c.add(new Button(this, cx + 10, cy + 42, 130, 50, 'İSTE', () => answer(true), UI.green, 19));
    c.add(new Button(this, cx + 158, cy + 42, 130, 50, 'PAS', () => answer(false), UI.red, 19));
    const bar = this.add.graphics();
    c.add(bar);
    const prog = { v: 1 };
    const draw = () => {
      bar.clear();
      bar.fillStyle(0xffffff, 0.12);
      bar.fillRoundedRect(cx - 215, cy + 76, 430, 6, 3);
      bar.fillStyle(prog.v > 0.3 ? UI.gold : UI.red, 1);
      bar.fillRoundedRect(cx - 215, cy + 76, 430 * prog.v, 6, 3);
    };
    draw();
    c.setScale(0.92);
    c.setPosition((GAME_W / 2) * 0.08, cy * 0.08);
    this.tweens.add({ targets: c, scale: 1, x: 0, y: 0, duration: 220, ease: 'Back.easeOut' });
    sfx.pop();
    haptic(25);
    this.overlayTimers.push(
      this.tweens.add({ targets: prog, v: 0, duration: CLAIM_SECONDS * 1000, onUpdate: draw, onComplete: () => answer(false) }),
    );
  }

  /** El başı şeridinin ekranda kalma süresi (rastgele modda çark döndüğü için daha uzun). */
  private get bannerMs() {
    return this.s.ruleOrder === 'random' ? 3300 : 2500;
  }

  private showRoundBanner() {
    const s = this.s;
    const g = this.ctrl.game;
    const cy = DECK.y;
    const random = s.ruleOrder === 'random';
    const c = this.add.container(-GAME_W, 0).setDepth(3500);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.35);
    bg.fillRect(0, cy - 80, GAME_W, 166);
    bg.fillStyle(0x0c2c21, 0.97);
    bg.fillRect(0, cy - 84, GAME_W, 166);
    bg.lineStyle(3, UI.gold, 1);
    bg.lineBetween(0, cy - 84, GAME_W, cy - 84);
    bg.lineBetween(0, cy + 82, GAME_W, cy + 82);
    c.add(bg);
    c.add(txt(this, 300, cy - 68, `EL ${g.roundNumber} / ${g.totalRounds}${random ? '  ·  RASTGELE MOD' : ''}`, 16, UI.goldHex, 900));
    const nameT = txt(this, 300, cy - 46, g.contract.name, 40, '#fff', 900);
    const descT = txt(this, 300, cy + 6, g.contract.description, 16, UI.muted, 700, { wordWrap: { width: 520 } });
    c.add([nameT, descT]);
    if (random) this.spinContract(nameT, descT, g.contract.name);
    const note = g.contract.mode === 'normal' ? 'Açarken sadece kural iner · fazlalıklar sonraki sırada' : '';
    c.add(txt(this, 300, cy + 52, `Başlayan: ${s.players[s.starter].name}${note ? '   ·   ' + note : ''}`, 14, UI.cream, 800));
    if (s.extraTile) {
      c.add(txt(this, 950, cy - 68, 'FAZLALIK TAŞI', 12, UI.muted, 900).setOrigin(0.5, 0));
      c.add(this.add.image(950, cy + 12, tileKey(s.extraTile)).setScale(0.75));
    }
    this.tweens.add({ targets: c, x: 0, duration: 420, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: c, x: GAME_W, delay: this.bannerMs, duration: 380, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  /** Rastgele modda kural adı çark gibi döner, yavaşlayıp gerçek kurala oturur. */
  private spinContract(nameT: Phaser.GameObjects.Text, descT: Phaser.GameObjects.Text, finalName: string) {
    descT.setAlpha(0);
    nameT.setText('🎲 Kural seçiliyor…');
    this.spinning = true;
    this.updateHud();
    const names = CONTRACTS.map((c) => c.name);
    const steps = [70, 70, 75, 80, 90, 100, 115, 135, 160, 195, 240];
    let t = 420;
    let prev = '';
    steps.forEach((d, i) => {
      t += d;
      const last = i === steps.length - 1;
      this.time.delayedCall(t, () => {
        if (!nameT.active) {
          this.spinning = false;
          return;
        }
        if (last) {
          nameT.setText(finalName).setColor(UI.goldHex);
          this.spinning = false;
          this.updateHud();
          this.tweens.add({ targets: nameT, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
          this.tweens.add({ targets: descT, alpha: 1, duration: 250 });
          sfx.pop();
          return;
        }
        let n = names[Math.floor(Math.random() * names.length)];
        if (n === prev) n = names[(names.indexOf(n) + 1) % names.length];
        prev = n;
        nameT.setText(n);
        sfx.select();
      });
    });
  }

  private showRoundResult() {
    const s = this.s;
    const r = s.history[s.history.length - 1];
    if (!r) return;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('round', 780, 580, true);
    const title = r.winner === null ? 'El berabere bitti' : `${r.winner === 0 ? 'Sen' : s.players[r.winner].name} eli bitirdi!`;
    c.add(txt(this, cx, cy - 266, title, 32, UI.goldHex, 900).setOrigin(0.5, 0));
    const sub =
      r.winner === null ? `${r.contractName} · Ortada taş kalmadı` : `${r.contractName} · ${FINISH_NAMES[r.finishType!]}`;
    c.add(txt(this, cx, cy - 224, sub, 17, UI.cream, 700).setOrigin(0.5, 0));

    // --- çarpan şeridi: nasıl bitildi × hangi el = toplam çarpan
    const m = r.multiplier;
    if (r.winner !== null && r.finishType) {
      this.multiplierStrip(c, cx, cy - 172, r);
      const team = s.mode === 'team';
      const fin = FINISH_BONUS * m;
      const expl =
        m > 1
          ? `${team ? 'Bitiren takım' : 'Bitiren'}: ${FINISH_BONUS} × ${m} = ${fin}  ·  ${team ? 'Karşı takımın' : 'Diğerlerinin'} el cezası ×${m}`
          : `${team ? 'Bitiren takım' : 'Bitiren'}: ${FINISH_BONUS}  ·  Elde kalan taşlar olduğu gibi yazılır`;
      c.add(txt(this, cx, cy - 136, expl, 14, UI.muted, 800).setOrigin(0.5, 0));
    }

    const x0 = cx - 360;
    const head = [
      ['Oyuncu', x0],
      ['Elde kalan taşlar', x0 + 150],
      ['Ceza', x0 + 486],
      ['Bu el', x0 + 590],
      ['Toplam', x0 + 662],
    ] as const;
    head.forEach(([h, x]) => c.add(txt(this, x, cy - 104, h, 13, UI.muted, 900)));
    s.players.forEach((p, i) => {
      const y = cy - 70 + i * 52;
      const win = r.winner !== null && (s.mode === 'solo' ? i === r.winner : teamOf(i) === teamOf(r.winner));
      if (win) {
        const hl = this.add.graphics();
        hl.fillStyle(0x5fd38a, 0.12);
        hl.fillRoundedRect(x0 - 10, y - 20, 740, 42, 10);
        c.add(hl);
      }
      const team = s.mode === 'team' ? ` (${teamOf(i) === 0 ? 'A' : 'B'})` : '';
      c.add(txt(this, x0, y, p.name + team, 18, win ? UI.greenHex : '#fff', 900).setOrigin(0, 0.5));
      p.hand.slice(0, 15).forEach((t, k) => c.add(this.add.image(x0 + 160 + k * 21, y, tileKey(t)).setScale(0.2)));
      const ex = r.extras?.[i] ?? 0;
      const isWinner = i === r.winner;
      const base = isWinner ? `${FINISH_BONUS}` : `${r.penalties[i]}`;
      const pen = `${base}${m > 1 && (isWinner || r.penalties[i]) ? ` ×${m}` : ''}${ex ? ` +${ex}` : ''}`;
      c.add(txt(this, x0 + 486, y, pen, 16, ex ? UI.redHex : UI.cream, 800).setOrigin(0, 0.5));
      const d = r.deltas[i];
      c.add(txt(this, x0 + 590, y, `${d > 0 ? '+' : ''}${d}`, 18, d < 0 ? UI.greenHex : UI.redHex, 900).setOrigin(0, 0.5));
      c.add(txt(this, x0 + 662, y, `${p.score}`, 18, UI.goldHex, 900).setOrigin(0, 0.5));
    });
    const note =
      (s.mode === 'team' ? 'Takım puanı: karşı takım iki elin toplamını yazar.' : 'Puanlar ceza puanıdır.') +
      ' En düşük toplam kazanır. "+50": işlek / okey cezası (çarpılmaz).';
    c.add(txt(this, cx, cy + 142, note, 13, UI.muted, 700).setOrigin(0.5, 0));
    const last = s.phase === 'gameOver';
    if (this.mode.preview) {
      const pv = this.mode.preview;
      c.add(new Button(this, cx - 135, cy + 218, 240, 58, 'Tekrar Dene', () => this.scene.restart({ mode: 'solo', preview: pv }), UI.slate, 21));
      c.add(new Button(this, cx + 135, cy + 218, 240, 58, 'Önizlemeler', () => this.scene.start('preview'), UI.green, 21));
      return;
    }
    c.add(
      new Button(this, cx, cy + 218, 240, 58, last ? 'Sonuçlar' : 'Sonraki El', () => {
        if (last) this.showFinal();
        else this.humanAct({ type: 'nextRound' });
      }, UI.green, 21),
    );
  }

  /** "[okey taşları] Okey ile bitiş ×2 · Çift Eli ×2 = ×4" rozet şeridi. */
  private multiplierStrip(c: Phaser.GameObjects.Container, cx: number, y: number, r: RoundResult) {
    const ft = r.finishType!;
    const parts: { label: string; mult: number; jokers: number; color: number }[] = [
      { label: FINISH_NAMES[ft], mult: FINISH_MULT[ft], jokers: ft === 'ciftOkey' ? 2 : ft === 'okey' ? 1 : 0, color: ft === 'normal' ? UI.stroke : 0xf5c451 },
    ];
    if (r.ciftEli) parts.push({ label: 'Çift Eli', mult: 2, jokers: 0, color: 0xc28cf0 });
    const chipH = 44;
    const widths = parts.map((p) => 30 + p.jokers * 24 + p.label.length * 9.4 + 46);
    const opW = 34;
    const totalW = 94;
    const full = widths.reduce((a, b) => a + b, 0) + opW * parts.length + totalW;
    let x = cx - full / 2;
    const g = this.add.graphics();
    c.add(g);
    parts.forEach((p, i) => {
      if (i > 0) {
        c.add(txt(this, x + opW / 2 - opW, y, '·', 26, UI.muted, 900).setOrigin(0.5));
      }
      const w = widths[i];
      panel(g, x, y - chipH / 2, w, chipH, 12, UI.panelHi, 0.95, p.color, 1);
      let tx = x + 14;
      for (let k = 0; k < p.jokers; k++) {
        c.add(this.add.image(tx + 10 + k * 24, y, 'tile-joker').setScale(0.3).setAngle(k ? 6 : -6));
      }
      tx += p.jokers * 24 + (p.jokers ? 10 : 2);
      c.add(txt(this, tx, y, p.label, 16, UI.cream, 800).setOrigin(0, 0.5));
      c.add(txt(this, x + w - 12, y, `×${p.mult}`, 20, p.mult > 1 ? UI.goldHex : UI.muted, 900).setOrigin(1, 0.5));
      x += w + opW;
    });
    c.add(txt(this, x - opW / 2, y, '=', 24, UI.muted, 900).setOrigin(0.5));
    const m = r.multiplier;
    panel(g, x, y - chipH / 2 - 4, totalW, chipH + 8, 14, m > 1 ? 0x5a3a08 : UI.panel, 1, m > 1 ? 0xffd56b : UI.stroke, 1);
    const big = txt(this, x + totalW / 2, y, `×${m}`, 30, m > 1 ? '#ffd56b' : UI.cream, 900, { stroke: '#2a1700', strokeThickness: 5 }).setOrigin(0.5);
    c.add(big);
    if (m > 1) this.tweens.add({ targets: big, scale: { from: 1.6, to: 1 }, duration: 380, delay: 150, ease: 'Back.easeOut' });
  }

  // ================================================================ okeyle bitiş kutlaması

  /**
   * Okeyle bitiş kutlaması — dört kademe, her biri farklı görünür ve duyulur:
   *  okey            : altın ışınlar, dönerek büyüyen tek okey, fanfar (×2)
   *  çift okey       : iki okey iki yandan çarpışır, şok dalgası, harf harf başlık, altın yağmuru, gong + büyük fanfar (×4)
   *  + Çift Eli      : mor-altın kraliyet teması, çarpan damgası gözle görülür ikiye katlanır (×4 / ×8), ek patlamalar
   */
  private okeyCelebration(winner: number, double: boolean, mult: number, ciftEli = false) {
    const cx = GAME_W / 2;
    const cy = 300;
    const c = this.add.container(0, 0).setDepth(3800);
    const total = this.celebrationMs(double, ciftEli);
    const royal = ciftEli;
    const gold = 0xffd56b;
    const accent = royal ? 0xc28cf0 : 0xfff1c2;

    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, royal ? 0x12051f : 0x000000, 1).setOrigin(0).setAlpha(0);
    c.add(dim);
    this.tweens.add({ targets: dim, alpha: double ? 0.84 : 0.74, duration: 260 });

    // ışın huzmeleri: çift okeyde iki katman ters yönde döner
    const rayLayer = (n: number, colA: number, colB: number, alphaA: number, width: number) => {
      const g = this.add.graphics({ x: cx, y: cy });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.fillStyle(i % 2 ? colA : colB, i % 2 ? alphaA : alphaA * 0.6);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a - width) * 800, Math.sin(a - width) * 800);
        g.lineTo(Math.cos(a + width) * 800, Math.sin(a + width) * 800);
        g.closePath();
        g.fillPath();
      }
      g.setScale(0.1).setAlpha(0);
      c.add(g);
      return g;
    };
    const rays = rayLayer(18, gold, accent, 0.16, 0.09);
    this.tweens.add({ targets: rays, scale: 1, alpha: 1, duration: 420, delay: double ? 520 : 0, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: rays, angle: 60, duration: total, ease: 'Linear' });
    if (double) {
      const rays2 = rayLayer(12, royal ? 0xe9c8ff : 0xffe39a, gold, 0.12, 0.05);
      this.tweens.add({ targets: rays2, scale: 1.1, alpha: 1, duration: 520, delay: 560, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: rays2, angle: -80, duration: total, ease: 'Linear' });
    }

    // hale
    const halo = this.add.graphics({ x: cx, y: cy });
    halo.fillStyle(royal ? 0xb07ae0 : gold, 0.25);
    halo.fillCircle(0, 0, double ? 170 : 120);
    halo.fillStyle(0xffe9a8, 0.3);
    halo.fillCircle(0, 0, double ? 110 : 80);
    halo.setScale(0);
    c.add(halo);
    this.tweens.add({ targets: halo, scale: 1, duration: 500, delay: double ? 520 : 0, ease: 'Back.easeOut' });
    this.tweens.add({ targets: halo, scale: 1.12, duration: 700, delay: 1000, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });

    const burst = this.add.particles(0, 0, 'spark', {
      speed: { min: 180, max: 640 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 700, max: 1500 },
      scale: { start: 0.9, end: 0 },
      gravityY: 260,
      blendMode: 'ADD',
      tint: royal ? [0xffffff, 0xe0b8ff, 0xffd56b] : [0xffffff, 0xffe9a8, 0xffd56b],
      emitting: false,
    });
    burst.setDepth(3801);
    this.time.delayedCall(total + 200, () => burst.destroy());

    if (!double) {
      // --- tek okey: dönerek büyür
      const img = this.add.image(cx, cy, 'tile-joker').setScale(0).setAngle(-540);
      img.preFX?.addGlow(royal ? 0xd6a8ff : gold, 8, 0, false, 0.12, 18);
      c.add(img);
      this.tweens.add({ targets: img, scale: 1.3, angle: 0, duration: 750, delay: 120, ease: 'Back.easeOut' });
      this.tweens.add({ targets: img, y: cy - 10, duration: 900, delay: 900, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      this.time.delayedCall(520, () => {
        burst.explode(110, cx, cy);
        this.time.delayedCall(1300, () => burst.explode(60, cx + Phaser.Math.Between(-220, 220), cy - 80));
        this.cameras.main.flash(260, 255, 225, 140);
        this.cameras.main.shake(320, 0.004);
      });
      if (ciftEli) sfx.fanfareRoyal();
      else sfx.fanfare();
    } else {
      // --- çift okey: iki okey iki yandan hızla gelip ortada çarpışır, geri sekip yan yana durur
      for (const side of [-1, 1]) {
        const img = this.add.image(cx + side * 760, cy, 'tile-joker').setScale(1.15).setAngle(side * 30);
        img.preFX?.addGlow(royal ? 0xd6a8ff : gold, 10, 0, false, 0.12, 20);
        c.add(img);
        this.tweens.add({ targets: img, x: cx + side * 34, angle: side * 8, duration: 460, delay: 60, ease: 'Cubic.easeIn' });
        this.tweens.add({ targets: img, x: cx + side * 92, angle: side * 7, scale: 1.35, duration: 520, delay: 540, ease: 'Back.easeOut' });
        this.tweens.add({ targets: img, y: cy - 12, duration: 800, delay: 1200, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
      }
      sfx.doubleOkey(royal);
      this.time.delayedCall(520, () => {
        // şok dalgası halkaları
        for (let k = 0; k < 3; k++) {
          const ring = this.add.graphics({ x: cx, y: cy }).setDepth(3802);
          ring.lineStyle(10 - k * 2, k === 1 && royal ? 0xd6a8ff : 0xfff1c2, 0.9);
          ring.strokeCircle(0, 0, 40);
          ring.setScale(0.4);
          this.tweens.add({ targets: ring, scale: 9 + k * 3, alpha: 0, duration: 800 + k * 160, delay: k * 110, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        }
        burst.explode(200, cx, cy);
        this.cameras.main.flash(380, 255, 240, 190);
        this.cameras.main.shake(520, 0.012);
        haptic(90);
        // havai fişekler
        const fw = royal ? 6 : 4;
        for (let k = 0; k < fw; k++) {
          this.time.delayedCall(700 + k * 380, () => burst.explode(70, cx + Phaser.Math.Between(-470, 470), Phaser.Math.Between(90, 250)));
        }
      });
      // altın yağmuru
      this.time.delayedCall(900, () => {
        const rain = this.add.particles(0, -30, 'coin', {
          x: { min: 0, max: GAME_W },
          speedY: { min: 220, max: 420 },
          speedX: { min: -40, max: 40 },
          rotate: { min: 0, max: 360 },
          scale: { min: 0.22, max: 0.4 },
          lifespan: 2600,
          frequency: 45,
          quantity: royal ? 3 : 2,
        });
        rain.setDepth(3799);
        this.time.delayedCall(1900, () => rain.stop());
        this.time.delayedCall(total, () => rain.destroy());
      });
    }

    // --- başlık
    const name = this.s.players[winner]?.name ?? '';
    const titleY = cy + 132;
    const titleStr = double ? 'ÇİFT OKEY!' : 'OKEY İLE BİTTİ!';
    const titleStyle = { stroke: royal ? '#3b0f5c' : '#5a3a00', strokeThickness: double ? 12 : 10 };
    const titleColor = royal ? '#ffe28a' : '#ffd56b';
    if (double) {
      // harf harf damga gibi iner
      const size = 74;
      const probe = txt(this, 0, 0, titleStr, size, titleColor, 900, titleStyle);
      const fullW = probe.width;
      probe.destroy();
      let x = cx - fullW / 2;
      [...titleStr].forEach((ch, i) => {
        const l = txt(this, 0, titleY, ch, size, titleColor, 900, titleStyle).setOrigin(0, 0.5);
        const w = l.width;
        l.setX(x).setAlpha(0).setScale(2.4).setShadow(0, 6, 'rgba(0,0,0,0.6)', 12);
        c.add(l);
        this.tweens.add({ targets: l, alpha: 1, scale: 1, duration: 200, delay: 1000 + i * 70, ease: 'Cubic.easeIn' });
        this.tweens.add({ targets: l, y: titleY - 8, duration: 500, delay: 1700 + i * 60, yoyo: true, ease: 'Sine.easeInOut' });
        x += w - titleStyle.strokeThickness;
      });
    } else {
      const title = txt(this, cx, titleY, titleStr, 56, titleColor, 900, titleStyle).setOrigin(0.5).setScale(0).setShadow(0, 6, 'rgba(0,0,0,0.6)', 12);
      c.add(title);
      this.tweens.add({ targets: title, scale: 1, duration: 420, delay: 560, ease: 'Back.easeOut' });
    }
    const how = `${double ? 'Çift okey ×4' : 'Okey ×2'}${ciftEli ? ' · Çift Eli ×2' : ''}`;
    const sub = txt(this, cx, titleY + 62, `${winner === 0 ? 'Sen' : name} bitirdi · ${how} → cezalar ×${mult}`, 22, '#ffffff', 900).setOrigin(0.5).setAlpha(0);
    c.add(sub);
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: double ? 1800 : 900 });

    // --- çarpan damgası: Çift Eli'nde önce bitiş çarpanı basılır, sonra ikiye katlanır
    const baseMult = ciftEli ? mult / 2 : mult;
    const stampAt = double ? 1500 : 1150;
    const stamp = txt(this, cx + 330, cy - 80, `×${baseMult}`, double ? 96 : 84, '#ffd56b', 900, { stroke: '#5a3a00', strokeThickness: 12 })
      .setOrigin(0.5)
      .setAngle(-12)
      .setAlpha(0)
      .setShadow(0, 6, 'rgba(0,0,0,0.6)', 12);
    c.add(stamp);
    this.tweens.add({
      targets: stamp,
      alpha: 1,
      scale: { from: 3, to: 1 },
      duration: 320,
      delay: stampAt,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.cameras.main.shake(160, 0.006);
        sfx.stamp();
      },
    });

    if (ciftEli) {
      // mor kraliyet şeridi soldan süzülür; ardından damga ikiye katlanır
      const rib = this.add.container(-300, cy - 190);
      const rg = this.add.graphics();
      panel(rg, -150, -26, 300, 52, 12, 0x3b1f5c, 1, 0xc28cf0, 1);
      rib.add([rg, txt(this, 0, 0, 'ÇİFT ELİ · ×2', 26, '#f3dcff', 900).setOrigin(0.5)]);
      c.add(rib);
      this.tweens.add({ targets: rib, x: cx, duration: 520, delay: stampAt + 200, ease: 'Back.easeOut' });
      this.time.delayedCall(stampAt + 950, () => {
        if (!stamp.active) return;
        stamp.setText(`×${mult}`).setColor('#f6dcff').setStroke('#3b0f5c', 12);
        this.tweens.add({ targets: stamp, scale: { from: 2.2, to: 1.15 }, angle: { from: 8, to: -12 }, duration: 420, ease: 'Back.easeOut' });
        stamp.preFX?.addGlow(0xd6a8ff, 6, 0, false, 0.1, 14);
        burst.explode(double ? 140 : 90, cx + 330, cy - 80);
        this.cameras.main.flash(240, 220, 180, 255);
        this.cameras.main.shake(260, double ? 0.01 : 0.007);
        sfx.doubleUp();
        haptic(70);
      });
    }

    haptic(60);
    this.time.delayedCall(total - 500, () => this.tweens.add({ targets: c, alpha: 0, duration: 450, onComplete: () => c.destroy() }));
  }

  /** Kutlamanın süresi (sonuç penceresi bundan sonra açılır). */
  private celebrationMs(double: boolean, ciftEli: boolean) {
    return (double ? 5000 : 3900) + (ciftEli ? 1000 : 0);
  }

  // ================================================================ profil / ödüller

  /** Oyundaki olaylardan istatistik, XP, Küt Puanı ve rozet üretir. */
  private track(e: GameEvent) {
    const p = profile();
    const st = p.stats;
    const badges: (Badge | null)[] = [];
    if (e.type === 'roundEnd') {
      st.roundsPlayed++;
      const h = this.s.history[this.s.history.length - 1];
      const won = !!h && h.winner === 0;
      const okey = won && (h.finishType === 'okey' || h.finishType === 'ciftOkey');
      let g: Gain;
      if (won) {
        st.roundsWon++;
        if (okey) st.okeyFinishes++;
        g = grant(okey ? ROUND_WIN_OKEY_KP : ROUND_WIN_KP, 40);
        badges.push(award('roundWin'));
        if (okey) badges.push(award('okeyFinish'));
      } else {
        g = grant(0, 10);
      }
      this.time.delayedCall(okey ? 3600 : 400, () => showGain(this, g, GAME_W / 2, 200));
    } else if (e.type === 'swapJoker' && e.seat === 0 && e.target !== undefined && this.ctrl.game.isOpponent(0, e.target)) {
      st.jokersTaken++;
      badges.push(award('jokerThief'));
    } else if (e.type === 'islek' && e.seat === 0) {
      st.islekPenalties++;
    } else if (e.type === 'gameEnd') {
      const s = this.s;
      const my = s.players[0].score;
      const place = s.mode === 'team' ? (my <= s.players[1].score ? 0 : 2) : s.players.filter((x) => x.seat !== 0 && x.score < my).length;
      st.gamesPlayed++;
      if (place === 0) {
        st.gamesWon++;
        badges.push(award('firstWin'));
      }
      st.bestScore = st.bestScore === null ? my : Math.min(st.bestScore, my);
      if (this.ctrl.online) {
        st.onlineGames++;
        badges.push(award('online'));
      }
      if (st.gamesPlayed >= 10) badges.push(award('games10'));
      grant(PLACE_KP[place], PLACE_XP[place]);
      this.finalGain = { kp: PLACE_KP[place], xp: PLACE_XP[place], doubled: false };
    }
    saveProfile();
    badges.filter((b): b is Badge => !!b).forEach((b, i) => this.time.delayedCall(1500 + i * 2800, () => showBadge(this, b)));
  }

  private showFinal() {
    const s = this.s;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('final', 680, 500, true);
    type Entry = { name: string; score: number; mine: boolean };
    const entries: Entry[] =
      s.mode === 'solo'
        ? s.players.map((p) => ({ name: p.name, score: p.score, mine: p.seat === 0 }))
        : [0, 1].map((t) => ({
            name: `${t === 0 ? 'Takım A' : 'Takım B'} (${s.players.filter((p) => teamOf(p.seat) === t).map((p) => p.name).join(' + ')})`,
            score: s.players.find((p) => teamOf(p.seat) === t)!.score,
            mine: t === 0,
          }));
    entries.sort((a, b) => a.score - b.score);
    const won = entries[0].mine;
    if (won) sfx.win();
    c.add(txt(this, cx, cy - 190, won ? 'Kazandın!' : 'Oyun bitti', 40, UI.goldHex, 900).setOrigin(0.5, 0));
    entries.forEach((e, i) => {
      const y = cy - 104 + i * 50;
      c.add(txt(this, cx - 250, y, `${i + 1}.  ${e.name}`, 22, e.mine ? UI.goldHex : '#fff', 900));
      c.add(txt(this, cx + 250, y, `${e.score}`, 22, '#fff', 900).setOrigin(1, 0));
    });
    const fg = this.finalGain;
    if (fg) {
      const rt = txt(this, cx - 250, cy + 100, `Ödülün: +${fmt(fg.kp)} ${KP}   +${fg.xp} XP`, 20, UI.goldHex, 900).setOrigin(0, 0.5);
      c.add(rt);
      const dbl = new Button(this, cx + 170, cy + 100, 230, 52, `2 Kat Al · +${fmt(fg.kp)} ${KP}`, async () => {
        if (fg.doubled) return;
        const ok = await playRewardedVideo(this, `+${fmt(fg.kp)} ${KP}`);
        if (!ok) return;
        fg.doubled = true;
        showGain(this, grant(fg.kp));
        rt.setText(`Ödülün: +${fmt(fg.kp * 2)} ${KP}   +${fg.xp} XP  (2 kat ✓)`);
        dbl.setEnabled(false).setPulse(false);
      }, UI.green, 16);
      dbl.setIcon(icon('video'), 24).setEnabled(!fg.doubled).setPulse(!fg.doubled);
      c.add(dbl);
    }
    if (this.ctrl.online) {
      c.add(new Button(this, cx - 120, cy + 185, 210, 56, 'Lobiye Dön', () => this.scene.start('lobby', {}), UI.green, 20));
    } else {
      c.add(new Button(this, cx - 120, cy + 185, 210, 56, 'Yeni Oyun', () => this.scene.restart({ mode: this.mode.mode, ruleOrder: this.mode.ruleOrder }), UI.green, 20));
    }
    c.add(new Button(this, cx + 120, cy + 185, 210, 56, 'Menü', () => this.exitToMenu(), UI.slate, 20));
  }

  private showScores() {
    if (this.overlayKind === 'round' || this.overlayKind === 'final' || this.overlayKind === 'claim') return;
    if (this.overlayKind === 'scores') {
      this.closeOverlay();
      return;
    }
    const s = this.s;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('scores', 820, 580, true);
    c.add(txt(this, cx, cy - 262, 'Puan Tablosu', 28, UI.goldHex, 900).setOrigin(0.5, 0));
    const heads = s.mode === 'solo' ? s.players.map((p) => p.name) : ['Takım A', 'Takım B'];
    const seatsFor = s.mode === 'solo' ? [0, 1, 2, 3] : [0, 1];
    const x0 = cx - 380;
    const colX = (i: number) => cx - 40 + i * (s.mode === 'solo' ? 105 : 200);
    c.add(txt(this, x0, cy - 214, 'El', 14, UI.muted, 900));
    heads.forEach((h, i) => c.add(txt(this, colX(i), cy - 214, h, 14, UI.muted, 900)));
    s.history.forEach((r, ri) => {
      const y = cy - 186 + ri * 31;
      c.add(txt(this, x0, y, `${ri + 1}. ${r.contractName}`, 16, UI.cream, 700));
      seatsFor.forEach((seat, i) => {
        const d = r.deltas[seat];
        c.add(txt(this, colX(i), y, `${d > 0 ? '+' : ''}${d}`, 16, d < 0 ? UI.greenHex : '#fff', 800));
      });
    });
    const ty = cy - 186 + Math.max(s.history.length, 1) * 31 + 10;
    c.add(txt(this, x0, ty, 'Toplam', 17, UI.goldHex, 900));
    seatsFor.forEach((seat, i) => c.add(txt(this, colX(i), ty, `${s.players[seat].score}`, 17, UI.goldHex, 900)));
    c.add(new Button(this, cx, cy + 246, 180, 50, 'Kapat', () => this.closeOverlay(), UI.slate));
  }

  /** Online'da son 15 saniyede geri sayım (süre dolarsa sunucu otomatik oynar). */
  private turnClock(): string {
    if (!this.ctrl.online || !this.turnStartedAt) return '';
    const left = 45 - Math.floor((Date.now() - this.turnStartedAt) / 1000);
    return left <= 15 ? ` · ⏱ ${Math.max(0, left)} sn` : '';
  }

  /** Oyun içi küçük menü: ses, devam, maçtan çık (onaylı). */
  private showGameMenu() {
    if (this.overlayKind === 'round' || this.overlayKind === 'final' || this.overlayKind === 'claim') return;
    if (this.overlayKind === 'menu') {
      this.closeOverlay();
      return;
    }
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('menu', 400, 330, true);
    c.add(txt(this, cx, cy - 140, 'Menü', 28, UI.goldHex, 900).setOrigin(0.5, 0));
    const sound = new Button(this, cx, cy - 58, 300, 56, '', () => {
      this.toggleSound();
      label();
    }, UI.slate, 19);
    const label = () => sound.setLabel(sfx.muted ? '🔇  Ses: Kapalı' : '🔊  Ses: Açık');
    label();
    c.add(sound);
    c.add(new Button(this, cx, cy + 10, 300, 56, 'Oyuna Dön', () => this.closeOverlay(), UI.green, 19));
    c.add(new Button(this, cx, cy + 78, 300, 56, 'Maçtan Çık', () => this.confirmExit(), UI.red, 19));
    c.setScale(0.94).setPosition(cx * 0.06, cy * 0.06);
    this.tweens.add({ targets: c, scale: 1, x: 0, y: 0, duration: 200, ease: 'Back.easeOut' });
  }

  /** Online maç sürerken çıkan ceza alır; botlu oyunda, öğreticide ve oyun bitmişse ceza yok. */
  private get leaveIsPenalized() {
    return this.ctrl.online && this.s.phase !== 'gameOver';
  }

  private confirmExit() {
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('menu', 520, 330, true);
    c.add(txt(this, cx, cy - 140, 'Maçtan çıkmak istediğine emin misin?', 22, '#fff', 900).setOrigin(0.5, 0));
    let info: string;
    if (this.leaveIsPenalized) {
      const pen = leavePenalty();
      info = [
        'Masadan çıkarsan yerine bot oynar ve ceza alırsın:',
        `• ${pen.kp} ${KP} kesilir`,
        `• ${pen.min} dakika online oyuna giremezsin`,
        'Art arda çıkışlarda ceza büyür (1 → 5 → 10 dk).',
      ].join('\n');
    } else if (this.tutorial) {
      info = 'Öğreticiyi istediğin zaman ana menüden yeniden açabilirsin.';
    } else {
      info = 'Bu oyundaki ilerlemen kaybolur.\n(Botlu oyunda ceza yok.)';
    }
    c.add(txt(this, cx, cy - 92, info, 16, UI.cream, 700, { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0));
    c.add(new Button(this, cx - 120, cy + 110, 210, 56, 'Evet, Çık', () => this.leaveMatch(), UI.red, 19));
    c.add(new Button(this, cx + 120, cy + 110, 210, 56, 'Vazgeç', () => this.closeOverlay(), UI.slate, 19));
  }

  private leaveMatch() {
    if (this.leaveIsPenalized) {
      const pen = recordLeave();
      this.registry.set('leavePenalty', pen);
    }
    this.exitToMenu();
  }

  /** Menüye dön: online'da odadan çıkılır (koltuğu bot devralır). */
  private exitToMenu() {
    if (this.ctrl.online) connection.leave();
    this.scene.start('menu');
  }
}
