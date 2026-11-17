import Phaser from 'phaser';
import {
  Action,
  FINISH_NAMES,
  GameEvent,
  Tile,
  addPosition,
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
import { Controller } from '../controller';
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

type Obj = Phaser.GameObjects.GameObject;
type Rect = Phaser.Geom.Rectangle;

const SLOT_COUNT = RACK.cols * RACK.rows;
const CLAIM_SECONDS = 8;
const ZONE_SCALES = [0.4, 0.36, 0.32, 0.28, 0.25, 0.22, 0.19, 0.16, 0.14];
type OverlayKind = 'none' | 'claim' | 'round' | 'scores' | 'final';

export class TableScene extends Phaser.Scene {
  private ctrl!: Controller;
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
  private buttons!: Record<'group' | 'lay' | 'cancel' | 'discard' | 'hint' | 'sort' | 'sound' | 'scores' | 'menu', Button>;

  private meldHits: { id: number; rect: Rect }[] = [];
  private stagedHits: { gi: number; rect: Rect }[] = [];
  private actor = -1;
  private dealing = false;
  private dragging = false;
  private wasMyTurn = false;

  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: OverlayKind = 'none';
  private overlayTimers: (Phaser.Tweens.Tween | Phaser.Time.TimerEvent)[] = [];
  private roundShown = 0;

  constructor() {
    super('table');
  }

  init(data: TableData) {
    this.mode = data;
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
    this.wasMyTurn = false;
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

    this.ctrl = new Controller({ mode: this.mode.mode, seed: this.mode.seed, startRound: this.mode.startRound });
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
      obj.setData('dragged', true).setData('dragging', true);
      this.tweens.killTweensOf(obj);
      obj.setDepth(5000);
      this.tweens.add({ targets: obj, scale: RACK.scale * 1.12, duration: 90 });
    });
    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      obj.setPosition(x, y);
    });
    this.input.on('dragend', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      this.dragging = false;
      obj.setData('dragging', false);
      this.onDrop(obj.getData('id') as number, p.worldX, p.worldY);
    });

    this.dealing = true;
    this.arrange('seri');
    this.showRoundBanner();
    this.dealBacks();
    this.sync();
    this.dealing = false;
    sfx.shuffle();
    this.ctrl.hold(2600);
    this.ctrl.start();
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
    panel(g, 0, 0, 362, 62, 16, UI.panel, 0.94, UI.gold, 0.55);
    const chipBg = this.add.graphics();
    chipBg.fillStyle(UI.gold, 1);
    chipBg.fillRoundedRect(10, 9, 70, 22, 11);
    this.ruleChip = txt(this, 45, 20, '', 12, '#2a1d02', 900).setOrigin(0.5);
    this.ruleName = txt(this, 88, 6, '', 20, '#fff', 900);
    this.ruleDesc = txt(this, 12, 37, '', 12, UI.muted, 700, { wordWrap: { width: 300 } });
    this.ruleExtra = this.add.image(340, 31, 'tile-back').setScale(0.29);
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
      sound: new Button(this, 1066, 34, 64, 38, sfx.muted ? 'Ses ✗' : 'Ses', () => this.toggleSound(), UI.slate, 14),
      scores: new Button(this, 1138, 34, 68, 38, 'Puan', () => this.showScores(), UI.slate, 14),
      menu: new Button(this, 1212, 34, 68, 38, 'Menü', () => this.scene.start('menu'), UI.slate, 14),
    };
    Object.values(this.buttons).forEach((b) => b.setDepth(80));
  }

  // ================================================================ olaylar

  private onEvents(events: GameEvent[]) {
    for (const e of events) {
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
          this.ctrl.hold(2600);
          break;
        case 'drawDeck':
          if (e.seat !== 0) this.tiles.flyBack(DECK, this.anchor(e.seat));
          sfx.draw();
          break;
        case 'takeDiscard':
          sfx.draw();
          if (e.seat !== 0) this.bubble(e.seat, 'Yan taşı aldı', UI.panelHi, false);
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
        case 'discard':
          sfx.tok();
          break;
        case 'roundEnd': {
          const winner = e.seat;
          if (winner === 0 || (this.s.mode === 'team' && winner >= 0 && teamOf(winner) === 0)) sfx.win();
          else sfx.lose();
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
    const sel = this.selectedSingle();
    if (!sel || !this.myAction) return;
    const hit = this.meldHits.find((h) => h.rect.contains(x, y));
    if (hit) this.humanAct({ type: 'addToMeld', tileId: sel.id, meldId: hit.id });
  }

  private onDrop(id: number, x: number, y: number) {
    const slot = this.slotAt(x, y);
    if (slot !== null) {
      this.moveToSlot(id, slot);
      sfx.tok();
    } else if (Phaser.Math.Distance.Between(x, y, DISCARD_POS[0].x, DISCARD_POS[0].y) < 70) {
      if (this.myAction) this.humanAct({ type: 'discard', tileId: id });
      else this.showError('Taş atmak için sıranı bekle.');
    } else {
      const hit = this.meldHits.find((h) => h.rect.contains(x, y));
      if (hit && this.myAction) this.humanAct({ type: 'addToMeld', tileId: id, meldId: hit.id });
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
    if (this.selected.size !== 1) return;
    this.humanAct({ type: 'discard', tileId: [...this.selected][0] });
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
    this.buttons.sound.setLabel(sfx.muted ? 'Ses ✗' : 'Ses');
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
      targets.set(id, { tile: t, kind: 'rack', selected: sel, place: { x, y: sel ? y - 16 : y, scale: RACK.scale, depth: 200 + i } });
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
          const target = !!(sel && canAdd && addPosition(m, sel));
          this.zoneGfx.fillStyle(0x000000, 0.2);
          this.zoneGfx.fillRoundedRect(frame.x, frame.y, frame.width, frame.height, 8);
          if (target) {
            this.zoneGfx.lineStyle(3, UI.gold, 1);
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
    this.ruleChip.setText(`EL ${g.roundNumber}/${g.totalRounds}`);
    this.ruleName.setText(c.name);
    this.ruleDesc.setText(c.description);
    if (s.extraTile) this.ruleExtra.setTexture(tileKey(s.extraTile));

    // rakipler
    for (let seat = 1; seat < 4; seat++) {
      const active = (s.phase === 'draw' || s.phase === 'action') && s.current === seat;
      const thinking = s.phase === 'claim' && s.claim!.queue[0] === seat ? 'yan taşı düşünüyor…' : '';
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
    if (myTurn && !this.wasMyTurn && s.phase === 'draw') {
      sfx.turn();
      haptic(15);
    }
    this.wasMyTurn = myTurn;

    // benim çipim
    const lock = c.mode === 'normal' ? (me.opened ? 'Kural açık ✓' : 'Kural kapalı') : me.opened ? 'Açtın ✓' : c.mode === 'eldenBitme' ? 'Tek seferde bit' : '7 çift aç';
    const team = s.mode === 'team' ? ' · Takım A' : '';
    this.meChipT.setText(`Sen · ${me.score} puan${team}  ·  ${lock}`);
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
    const s = this.s;
    const me = this.me;
    const c = this.ctrl.game.contract;
    if (s.phase === 'draw' && s.current === 0) {
      this.setStatus(s.pendingDiscard ? 'Sıra sende · ortadan çek ya da soldaki taşı al' : 'Sıra sende · ortadan çek', 'turn');
    } else if (s.phase === 'action' && s.current === 0) {
      let t: string;
      if (c.mode !== 'normal') t = 'Tek seferde açabiliyorsan "Öner" · yoksa bir taş at';
      else if (!me.opened) t = `Sadece kuralı aç (${c.name}) ya da taş at`;
      else if (me.openedThisTurn) t = 'Kural açıldı! Fazlalıklar sonraki sırada · taş at';
      else t = 'Per diz · taş seçip parlayan pere işle · taş at';
      this.setStatus(t, 'turn');
    } else if (s.phase === 'claim') {
      this.setStatus(s.claim!.queue[0] === 0 ? 'Yan taşı istiyor musun?' : 'Yan taş isteniyor mu…', 'info');
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
    b.discard.setEnabled(this.myAction && this.selected.size === 1);
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
      this.time.delayedCall(1100, () => this.showRoundResult());
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

  private showRoundBanner() {
    const s = this.s;
    const g = this.ctrl.game;
    const cy = DECK.y;
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
    c.add(txt(this, 300, cy - 68, `EL ${g.roundNumber} / ${g.totalRounds}`, 16, UI.goldHex, 900));
    c.add(txt(this, 300, cy - 46, g.contract.name, 40, '#fff', 900));
    c.add(txt(this, 300, cy + 6, g.contract.description, 16, UI.muted, 700, { wordWrap: { width: 520 } }));
    const note = g.contract.mode === 'normal' ? 'Açarken sadece kural iner · fazlalıklar sonraki sırada' : '';
    c.add(txt(this, 300, cy + 52, `Başlayan: ${s.players[s.starter].name}${note ? '   ·   ' + note : ''}`, 14, UI.cream, 800));
    if (s.extraTile) {
      c.add(txt(this, 950, cy - 68, 'FAZLALIK TAŞI', 12, UI.muted, 900).setOrigin(0.5, 0));
      c.add(this.add.image(950, cy + 12, tileKey(s.extraTile)).setScale(0.75));
    }
    this.tweens.add({ targets: c, x: 0, duration: 420, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: c, x: GAME_W, delay: 2500, duration: 380, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  private showRoundResult() {
    const s = this.s;
    const r = s.history[s.history.length - 1];
    if (!r) return;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('round', 760, 500, true);
    const title = r.winner === null ? 'El berabere bitti' : `${s.players[r.winner].name} eli bitirdi!`;
    c.add(txt(this, cx, cy - 222, title, 32, UI.goldHex, 900).setOrigin(0.5, 0));
    const sub =
      r.winner === null
        ? `${r.contractName} · Ortada taş kalmadı`
        : `${r.contractName} · ${FINISH_NAMES[r.finishType!]}${r.multiplier > 1 ? ` · ×${r.multiplier}` : ''}`;
    c.add(txt(this, cx, cy - 178, sub, 17, UI.cream, 700).setOrigin(0.5, 0));

    const x0 = cx - 350;
    const head = [
      ['Oyuncu', x0],
      ['Elde kalan taşlar', x0 + 150],
      ['Ceza', x0 + 500],
      ['Bu el', x0 + 570],
      ['Toplam', x0 + 640],
    ] as const;
    head.forEach(([h, x]) => c.add(txt(this, x, cy - 140, h, 13, UI.muted, 900)));
    s.players.forEach((p, i) => {
      const y = cy - 104 + i * 54;
      const win = r.winner !== null && (s.mode === 'solo' ? i === r.winner : teamOf(i) === teamOf(r.winner));
      if (win) {
        const hl = this.add.graphics();
        hl.fillStyle(0x5fd38a, 0.12);
        hl.fillRoundedRect(x0 - 10, y - 20, 720, 44, 10);
        c.add(hl);
      }
      const team = s.mode === 'team' ? ` (${teamOf(i) === 0 ? 'A' : 'B'})` : '';
      c.add(txt(this, x0, y, p.name + team, 18, win ? UI.greenHex : '#fff', 900).setOrigin(0, 0.5));
      p.hand.slice(0, 16).forEach((t, k) => c.add(this.add.image(x0 + 160 + k * 21, y, tileKey(t)).setScale(0.2)));
      c.add(txt(this, x0 + 500, y, `${r.penalties[i]}`, 17, UI.cream, 800).setOrigin(0, 0.5));
      const d = r.deltas[i];
      c.add(txt(this, x0 + 570, y, `${d > 0 ? '+' : ''}${d}`, 18, d < 0 ? UI.greenHex : UI.redHex, 900).setOrigin(0, 0.5));
      c.add(txt(this, x0 + 640, y, `${p.score}`, 18, UI.goldHex, 900).setOrigin(0, 0.5));
    });
    c.add(
      txt(this, cx, cy + 122, s.mode === 'team' ? 'Takım puanı: karşı takım iki elin toplamını yazar. En düşük toplam kazanır.' : 'Puanlar ceza puanıdır: en düşük toplam kazanır.', 13, UI.muted, 700).setOrigin(0.5, 0),
    );
    const last = s.phase === 'gameOver';
    c.add(
      new Button(this, cx, cy + 190, 240, 58, last ? 'Sonuçlar' : 'Sonraki El', () => {
        if (last) this.showFinal();
        else this.humanAct({ type: 'nextRound' });
      }, UI.green, 21),
    );
  }

  private showFinal() {
    const s = this.s;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.openOverlay('final', 640, 440, true);
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
    c.add(new Button(this, cx - 120, cy + 160, 210, 56, 'Yeni Oyun', () => this.scene.restart({ mode: this.mode.mode }), UI.green, 20));
    c.add(new Button(this, cx + 120, cy + 160, 210, 56, 'Menü', () => this.scene.start('menu'), UI.slate, 20));
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
}
