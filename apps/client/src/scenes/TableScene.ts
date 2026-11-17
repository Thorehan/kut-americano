import Phaser from 'phaser';
import {
  Action,
  FINISH_NAMES,
  GameEvent,
  Meld,
  Tile,
  addPosition,
  asCift,
  asKut,
  asSeri,
  compareByColor,
  compareByValue,
  findContractMelds,
  findFullPartition,
  findPairPartition,
  teamOf,
} from '@kut/core';
import { Controller } from '../controller';
import { COLORS_UI, DISCARD_POS, FONT, GAME_H, GAME_W, POS, RACK, SEAT_PANEL } from '../layout';
import { TILE_H, TILE_W, createTextures, tileKey } from '../textures';
import { Button } from '../ui/Button';
import type { TableData } from './MenuScene';

type Obj = Phaser.GameObjects.GameObject;
type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

const SLOT_COUNT = RACK.cols * RACK.rows;
const DISCARD_SCALE = 0.42;
const CLAIM_SECONDS = 8;

const st = (size: number, color: string = COLORS_UI.cream, bold = false): TextStyle => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color,
  fontStyle: bold ? 'bold' : 'normal',
});

type OverlayKind = 'none' | 'claim' | 'round' | 'scores' | 'final';

export class TableScene extends Phaser.Scene {
  private ctrl!: Controller;
  private mode!: TableData;
  private slots: (number | null)[] = [];
  private selected = new Set<number>();
  private staged: number[][] = [];
  private dynObjs: Obj[] = [];
  private rackObjs: Obj[] = [];
  private overlayObjs: Obj[] = [];
  private overlayTimers: (Phaser.Tweens.Tween | Phaser.Time.TimerEvent)[] = [];
  private overlayKind: OverlayKind = 'none';
  private meldHits: { id: number; rect: Phaser.Geom.Rectangle }[] = [];
  private buttons!: Record<'group' | 'lay' | 'cancel' | 'discard' | 'hint' | 'sort' | 'scores' | 'menu', Button>;
  private hintText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private dragging = false;
  private renderQueued = false;
  private renderPending = false;
  private rackDirty = true;
  private roundShown = 0;
  private sortBy: 'seri' | 'kut' = 'seri';

  constructor() {
    super('table');
  }

  init(data: TableData) {
    this.mode = data;
    this.slots = new Array(SLOT_COUNT).fill(null);
    this.selected = new Set();
    this.staged = [];
    this.dynObjs = [];
    this.rackObjs = [];
    this.overlayObjs = [];
    this.overlayTimers = [];
    this.overlayKind = 'none';
    this.meldHits = [];
    this.dragging = false;
    this.renderQueued = false;
    this.renderPending = false;
    this.rackDirty = true;
    this.roundShown = 0;
    this.sortBy = 'seri';
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

  create() {
    createTextures(this);
    this.add.image(0, 0, 'felt').setOrigin(0).setDepth(-10);
    this.add.image(RACK.board.x, RACK.board.y, 'rack').setOrigin(0).setDepth(-5);

    this.ctrl = new Controller({ mode: this.mode.mode, seed: this.mode.seed, startRound: this.mode.startRound });
    this.ctrl.onChange((ev) => this.onEvents(ev));
    this.events.once('shutdown', () => this.ctrl.destroy());

    const bx = [1068, 1202];
    const by = [590, 644, 698];
    const W = 126;
    const H = 46;
    this.buttons = {
      group: new Button(this, bx[0], by[0], W, H, 'Per Ekle', () => this.stageSelected(), COLORS_UI.blue),
      lay: new Button(this, bx[1], by[0], W, H, 'Kuralı Aç', () => this.laystaged(), COLORS_UI.green),
      cancel: new Button(this, bx[0], by[1], W, H, 'Geri Al', () => this.unstageAll(), 0x5b6b63),
      discard: new Button(this, bx[1], by[1], W, H, 'Taş At', () => this.discardSelected(), COLORS_UI.red),
      hint: new Button(this, bx[0], by[2], W, H, 'Öner', () => this.suggest(), 0x7a5a1e),
      sort: new Button(this, bx[1], by[2], W, H, 'Küt Diz', () => this.toggleSort(), 0x7a5a1e),
      scores: new Button(this, 1200, 30, 130, 40, 'Puanlar', () => this.showScores(), 0x34594a, 16),
      menu: new Button(this, 1062, 30, 110, 40, 'Menü', () => this.scene.start('menu'), 0x34594a, 16),
    };
    Object.values(this.buttons).forEach((b) => b.setDepth(20));

    this.hintText = this.add.text(POS.hint.x, POS.hint.y, '', st(16, COLORS_UI.goldText, true)).setOrigin(0.5).setDepth(20);
    this.toastText = this.add
      .text(POS.toast.x, POS.toast.y, '', { ...st(17, '#ffffff', true), backgroundColor: '#0a2a1fee', padding: { x: 14, y: 7 } })
      .setOrigin(0.5)
      .setDepth(700)
      .setAlpha(0);

    this.input.dragDistanceThreshold = 8;
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      this.dragging = true;
      obj.setData('dragged', true);
      obj.setDepth(500);
    });
    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      obj.setPosition(x, y);
    });
    this.input.on('dragend', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      this.dragging = false;
      this.onDrop(obj.getData('id') as number, p.worldX, p.worldY);
    });

    this.arrange('seri');
    this.showRoundBanner();
    this.requestRender();
    this.ctrl.start();
  }

  // ------------------------------------------------------------ olaylar

  private onEvents(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'roundStart') {
        this.selected.clear();
        this.staged = [];
        this.slots.fill(null);
        this.arrange(this.sortBy);
        this.showRoundBanner();
      } else if (e.type === 'claim' || e.type === 'open' || e.type === 'roundEnd') {
        this.toast(e.text);
      } else if ((e.type === 'takeDiscard' || e.type === 'lay' || e.type === 'addToMeld') && e.seat !== 0) {
        this.toast(e.text);
      }
    }
    this.syncSlots();
    this.requestRender();
  }

  private humanAct(action: Action): boolean {
    const err = this.ctrl.act(action);
    if (err) this.toast(err, true);
    this.rackDirty = true;
    this.requestRender();
    return !err;
  }

  private toast(text: string, error = false) {
    this.toastText
      .setText(text)
      .setBackgroundColor(error ? '#7a1f1aee' : '#0a2a1fee')
      .setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: error ? 3200 : 2400, duration: 500 });
  }

  // ------------------------------------------------------------ ıstaka

  private slotPos(i: number) {
    const col = i % RACK.cols;
    const row = Math.floor(i / RACK.cols);
    return { x: RACK.x0 + col * RACK.slotW + RACK.slotW / 2, y: RACK.rowY[row] };
  }

  private slotAt(x: number, y: number): number | null {
    const b = RACK.board;
    if (x < b.x || x > b.x + b.w || y < b.y - 24 || y > b.y + b.h + 10) return null;
    const col = Phaser.Math.Clamp(Math.floor((x - RACK.x0) / RACK.slotW), 0, RACK.cols - 1);
    const row = y < (RACK.rowY[0] + RACK.rowY[1]) / 2 ? 0 : 1;
    return row * RACK.cols + col;
  }

  /** Eldeki taşları ıstakaya dizer (seri: renk-sayı, küt: sayı-renk), grupları satır sonunda bölmeden. */
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
    this.rackDirty = true;
  }

  /** Motor ile ıstakayı eşitler: çıkan taşları siler, gelen taşları sona ekler. */
  private syncSlots() {
    const hand = this.me.hand;
    const ids = new Set(hand.map((t) => t.id));
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = this.slots[i];
      if (id !== null && !ids.has(id)) {
        this.slots[i] = null;
        this.rackDirty = true;
      }
    }
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    const before = this.staged.length;
    this.staged = this.staged.map((g) => g.filter((id) => ids.has(id))).filter((g) => g.length > 0);
    if (before !== this.staged.length) this.rackDirty = true;

    const present = new Set(this.slots.filter((x): x is number => x !== null));
    for (const t of hand) {
      if (present.has(t.id)) continue;
      let last = -1;
      this.slots.forEach((x, i) => {
        if (x !== null) last = i;
      });
      let idx = this.slots.findIndex((x, i) => x === null && i > last);
      if (idx < 0) idx = this.slots.findIndex((x) => x === null);
      if (idx < 0) continue;
      this.slots[idx] = t.id;
      this.rackDirty = true;
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

  private onDrop(id: number, x: number, y: number) {
    const slot = this.slotAt(x, y);
    if (slot !== null) {
      this.moveToSlot(id, slot);
    } else if (Phaser.Math.Distance.Between(x, y, POS.myDiscard.x, POS.myDiscard.y) < 70 && this.myAction) {
      this.humanAct({ type: 'discard', tileId: id });
    } else {
      const hit = this.meldHits.find((h) => h.rect.contains(x, y));
      if (hit && this.myAction) this.humanAct({ type: 'addToMeld', tileId: id, meldId: hit.id });
    }
    this.rackDirty = true;
    this.requestRender();
  }

  private toggleSelect(id: number) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.rackDirty = true;
    this.requestRender();
  }

  // ------------------------------------------------------------ butonlar

  private stageSelected() {
    if (this.selected.size < 1) return;
    const order = this.slots.filter((x): x is number => x !== null && this.selected.has(x));
    this.staged.push(order);
    this.selected.clear();
    this.rackDirty = true;
    this.requestRender();
  }

  private unstageAll() {
    this.staged = [];
    this.rackDirty = true;
    this.requestRender();
  }

  private laystaged() {
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
    this.requestRender();
  }

  /** İpucu: açılabilecek perleri hazırlık alanına koyar. */
  private suggest() {
    const g = this.ctrl.game;
    const c = g.contract;
    const hand = this.me.hand;
    let melds: Tile[][] | null = null;
    if (c.mode === 'normal' && !this.me.opened) melds = findContractMelds(hand, c.reqs);
    else if (c.mode === 'eldenBitme') melds = findFullPartition(hand, 1)?.melds ?? null;
    else if (c.mode === 'ciftEli') melds = findPairPartition(hand, 7)?.melds ?? null;
    if (!melds || melds.length === 0) {
      this.toast(
      c.mode === 'normal' && this.me.opened
        ? this.me.openedThisTurn
          ? 'Kuralı bu sırada açtın — fazlalıklar sonraki sıranda iner.'
          : 'Kural açık — perlerini seçip "Per Ekle" ile diz.'
        : 'Şu an açılabilecek bir dizilim yok.',
    );
      return;
    }
    this.selected.clear();
    this.staged = melds.map((m) => m.map((t) => t.id));
    this.rackDirty = true;
    this.requestRender();
    this.toast(this.myAction ? 'Öneri hazırlandı — onaylamak için "' + this.layLabel() + '"' : 'Öneri hazırlandı — sıran gelince aç.');
  }

  private layLabel() {
    const c = this.ctrl.game.contract;
    if (c.mode === 'eldenBitme') return 'Elden Bit';
    if (c.mode === 'ciftEli') return 'Çiftleri Aç';
    return this.me.opened ? 'Yere Koy' : 'Kuralı Aç';
  }

  // ------------------------------------------------------------ çizim

  private requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.time.delayedCall(0, () => {
      this.renderQueued = false;
      if (this.dragging) {
        this.renderPending = true;
        return;
      }
      this.renderPending = false;
      this.renderAll();
    });
  }

  private renderAll() {
    if (!this.ctrl) return;
    this.renderTable();
    if (this.rackDirty) {
      this.renderRack();
      this.rackDirty = false;
    }
    this.updateButtons();
    this.updateHint();
    this.updateOverlays();
  }

  private renderTable() {
    this.dynObjs.forEach((o) => o.destroy());
    this.dynObjs = [];
    this.meldHits = [];
    const add = <T extends Obj>(o: T): T => {
      this.dynObjs.push(o);
      return o;
    };
    const s = this.s;
    const g = this.ctrl.game;
    const c = g.contract;

    // --- Kural paneli
    const panel = add(this.add.graphics());
    panel.fillStyle(COLORS_UI.panel, 0.9);
    panel.fillRoundedRect(12, 8, 380, 106, 14);
    panel.lineStyle(2, COLORS_UI.gold, 0.8);
    panel.strokeRoundedRect(12, 8, 380, 106, 14);
    add(this.add.text(26, 15, `EL ${g.roundNumber} / ${g.totalRounds}  ·  BU ELİN KURALI`, st(13, COLORS_UI.goldText, true)));
    add(this.add.text(26, 33, c.name, st(25, '#ffffff', true)));
    add(this.add.text(26, 70, c.description, { ...st(13, COLORS_UI.muted), wordWrap: { width: 290 } }));
    if (s.extraTile) {
      add(this.add.text(350, 15, 'Fazlalık', st(11, COLORS_UI.muted)).setOrigin(0.5, 0));
      add(this.add.image(350, 66, tileKey(s.extraTile)).setScale(0.4));
    }

    // --- Oyuncular
    for (let seat = 1; seat < 4; seat++) this.drawSeatPanel(seat, add);
    this.drawMyInfo(add);

    // --- Deste
    const dk = POS.deck;
    for (let i = 2; i >= 0; i--) {
      if (s.deck.length > i) add(this.add.image(dk.x - i * 2, dk.y - i * 2, 'tile-back').setScale(DISCARD_SCALE));
    }
    add(this.add.text(dk.x, dk.y + 38, `Ortada ${s.deck.length}`, st(13, COLORS_UI.cream, true)).setOrigin(0.5, 0));
    if (this.myDraw && s.deck.length) {
      const glow = add(this.add.graphics());
      glow.lineStyle(4, COLORS_UI.gold, 1);
      glow.strokeRoundedRect(dk.x - 28, dk.y - 36, 52, 66, 8);
      const z = add(this.add.zone(dk.x, dk.y, 60, 74).setInteractive({ useHandCursor: true }));
      z.on('pointerdown', () => this.humanAct({ type: 'drawDeck' }));
    }

    // --- Atılan taşlar
    const takeable = s.pendingDiscard ?? (s.claim ? { tile: s.claim.tile, from: s.claim.from } : null);
    for (let seat = 0; seat < 4; seat++) {
      const pos = DISCARD_POS[seat];
      const pile = s.players[seat].discards;
      const ph = add(this.add.graphics());
      ph.lineStyle(2, 0xffffff, 0.18);
      ph.strokeRoundedRect(pos.x - 25, pos.y - 33, 50, 64, 8);
      if (seat === 0) {
        if (this.myAction) {
          ph.lineStyle(3, COLORS_UI.gold, 0.9);
          ph.strokeRoundedRect(pos.x - 25, pos.y - 33, 50, 64, 8);
        }
        add(this.add.text(pos.x, pos.y + 38, 'Taş at', st(13, COLORS_UI.muted)).setOrigin(0.5, 0));
      }
      if (seat === 3) add(this.add.text(pos.x, pos.y + 38, 'Soldan al', st(13, COLORS_UI.muted)).setOrigin(0.5, 0));
      if (!pile.length) continue;
      if (pile.length > 1) add(this.add.image(pos.x + 4, pos.y - 4, tileKey(pile[pile.length - 2])).setScale(DISCARD_SCALE).setTint(0x999999));
      const top = pile[pile.length - 1];
      add(this.add.image(pos.x, pos.y, tileKey(top)).setScale(DISCARD_SCALE));
      if (pile.length > 2) add(this.add.text(pos.x + 22, pos.y - 34, `${pile.length}`, st(11, COLORS_UI.muted)).setOrigin(0, 0.5));
      const fresh = takeable && takeable.from === seat && takeable.tile === top;
      if (fresh) {
        const glow = add(this.add.graphics());
        glow.lineStyle(3, this.myDraw && seat === 3 ? COLORS_UI.gold : 0xffffff, this.myDraw && seat === 3 ? 1 : 0.5);
        glow.strokeRoundedRect(pos.x - 26, pos.y - 34, 52, 66, 8);
        if (this.myDraw && seat === 3) {
          const z = add(this.add.zone(pos.x, pos.y, 60, 74).setInteractive({ useHandCursor: true }));
          z.on('pointerdown', () => this.humanAct({ type: 'takeDiscard' }));
        }
      }
    }

    this.drawMelds(add);
    this.drawStaging(add);
  }

  private seatPanelBox(seat: number, add: <T extends Obj>(o: T) => T, x: number, y: number, w: number, h: number) {
    const s = this.s;
    const active =
      (s.phase === 'draw' || s.phase === 'action' || s.phase === 'claim') && s.current === seat;
    const g = add(this.add.graphics());
    g.fillStyle(COLORS_UI.panel, 0.88);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    g.lineStyle(active ? 4 : 2, active ? COLORS_UI.gold : COLORS_UI.panelStroke, 1);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    if (s.mode === 'team') {
      g.fillStyle(teamOf(seat) === 0 ? COLORS_UI.teamA : COLORS_UI.teamB, 1);
      g.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 8, 6, h - 16, 3);
    }
  }

  private drawSeatPanel(seat: number, add: <T extends Obj>(o: T) => T) {
    const s = this.s;
    const p = s.players[seat];
    const { x, y } = SEAT_PANEL[seat];
    const w = 168;
    const h = 84;
    this.seatPanelBox(seat, add, x, y, w, h);
    add(this.add.text(x - w / 2 + 18, y - 32, p.name, st(17, '#ffffff', true)));
    add(this.add.image(x - w / 2 + 26, y + 2, 'tile-back').setScale(0.2));
    add(this.add.text(x - w / 2 + 40, y + 2, `${p.hand.length} taş`, st(14)).setOrigin(0, 0.5));
    const badge = p.opened ? 'AÇTI ✓' : 'Açmadı';
    add(this.add.text(x + w / 2 - 10, y + 2, badge, st(13, p.opened ? '#7ee2a0' : COLORS_UI.muted, p.opened)).setOrigin(1, 0.5));
    const teamLabel = s.mode === 'team' ? (teamOf(seat) === 0 ? 'Takım A' : 'Takım B') + ' · ' : '';
    add(this.add.text(x - w / 2 + 18, y + 18, `${teamLabel}Puan ${p.score}`, st(13, COLORS_UI.goldText)));
    if (s.phase === 'claim' && s.claim!.queue[0] === seat) {
      add(this.add.text(x, y + h / 2 + 4, 'yan taşı düşünüyor…', st(12, COLORS_UI.muted)).setOrigin(0.5, 0));
    }
  }

  private drawMyInfo(add: <T extends Obj>(o: T) => T) {
    const s = this.s;
    const me = this.me;
    const { x, y } = POS.myInfo;
    const w = 236;
    const h = 66;
    this.seatPanelBox(0, add, x, y, w, h);
    const teamLabel = s.mode === 'team' ? (teamOf(0) === 0 ? 'Takım A · ' : 'Takım B · ') : '';
    add(this.add.text(x - w / 2 + 18, y - 24, `${me.name}  ·  ${teamLabel}Puan ${me.score}`, st(15, '#ffffff', true)));
    const c = this.ctrl.game.contract;
    const lock =
      c.mode === 'normal'
        ? me.opened
          ? '🔓 Kural açık'
          : '🔒 Kural kapalı'
        : me.opened
          ? '✓ Açtın'
          : c.mode === 'eldenBitme'
            ? 'Tek seferde bit'
            : 'Çiftleri tek seferde aç';
    add(this.add.text(x - w / 2 + 18, y + 4, lock, st(14, me.opened ? '#7ee2a0' : '#ffb3a8', true)));
    add(this.add.text(x + w / 2 - 12, y + 4, `${me.hand.length} taş`, st(13, COLORS_UI.muted)).setOrigin(1, 0));
  }

  private selectedSingle(): Tile | null {
    if (this.selected.size !== 1) return null;
    const id = [...this.selected][0];
    return this.me.hand.find((t) => t.id === id) ?? null;
  }

  private layoutMelds(owners: number[], scale: number, force: boolean) {
    const area = POS.meldArea;
    const tw = TILE_W * scale;
    const th = TILE_H * scale;
    const labelW = 70;
    let y = area.y0;
    const items: { meld: Meld; x: number; y: number }[] = [];
    const labels: { seat: number; x: number; y: number }[] = [];
    for (const o of owners) {
      labels.push({ seat: o, x: area.x0, y: y + th / 2 + 4 });
      let x = area.x0 + labelW;
      for (const m of this.s.melds.filter((m) => m.owner === o)) {
        const w = m.tiles.length * tw + 8;
        if (x + w > area.x1 && x > area.x0 + labelW) {
          x = area.x0 + labelW;
          y += th + 12;
        }
        items.push({ meld: m, x: x + 4, y: y + 4 });
        x += w + 10;
      }
      y += th + 20;
    }
    if (!force && y > area.y1) return null;
    return { items, labels };
  }

  private drawMelds(add: <T extends Obj>(o: T) => T) {
    const s = this.s;
    const area = POS.meldArea;
    if (!s.melds.length) {
      add(
        this.add
          .text((area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2, 'Yere açılan perler burada görünür', st(18, 'rgba(255,255,255,0.25)'))
          .setOrigin(0.5),
      );
      return;
    }
    const owners = [0, 1, 2, 3].filter((o) => s.melds.some((m) => m.owner === o));
    let scale = 0.32;
    let layout = null;
    for (const sc of [0.32, 0.28, 0.24, 0.2, 0.17]) {
      layout = this.layoutMelds(owners, sc, false);
      if (layout) {
        scale = sc;
        break;
      }
    }
    if (!layout) {
      scale = 0.15;
      layout = this.layoutMelds(owners, scale, true)!;
    }
    const tw = TILE_W * scale;
    const th = TILE_H * scale;
    const sel = this.selectedSingle();
    const canAdd = this.myAction && this.ctrl.game.canAddToMelds(0);

    for (const l of layout.labels) {
      const p = s.players[l.seat];
      add(this.add.text(l.x, l.y, p.name, st(14, l.seat === 0 ? COLORS_UI.goldText : COLORS_UI.cream, true)).setOrigin(0, 0.5));
    }
    for (const it of layout.items) {
      const m = it.meld;
      const w = m.tiles.length * tw + 8;
      const h = th + 8;
      const rx = it.x - 4;
      const ry = it.y - 4;
      const target = !!(sel && canAdd && addPosition(m, sel));
      const g = add(this.add.graphics());
      g.fillStyle(0x000000, 0.22);
      g.fillRoundedRect(rx, ry, w, h, 8);
      if (target) {
        g.lineStyle(3, COLORS_UI.gold, 1);
        g.strokeRoundedRect(rx, ry, w, h, 8);
      }
      m.tiles.forEach((t, i) => add(this.add.image(it.x + i * tw + tw / 2, it.y + th / 2, tileKey(t)).setScale(scale)));
      this.meldHits.push({ id: m.id, rect: new Phaser.Geom.Rectangle(rx, ry, w, h) });
      if (target) {
        const z = add(this.add.zone(rx + w / 2, ry + h / 2, w, h).setInteractive({ useHandCursor: true }));
        z.on('pointerdown', () => this.humanAct({ type: 'addToMeld', tileId: sel!.id, meldId: m.id }));
      }
    }
  }

  private groupValid(tiles: Tile[]): boolean {
    if (this.ctrl.game.contract.mode === 'ciftEli') return !!asCift(tiles);
    return !!(asSeri(tiles) ?? asKut(tiles));
  }

  private drawStaging(add: <T extends Obj>(o: T) => T) {
    if (!this.staged.length) return;
    const area = POS.stage;
    const byId = new Map(this.me.hand.map((t) => [t.id, t]));
    const groups = this.staged.map((g) => g.map((id) => byId.get(id)!).filter(Boolean));
    const count = groups.reduce((n, g) => n + g.length, 0);
    let scale = 0.34;
    const avail = area.x1 - area.x0 - groups.length * 14;
    if (count * TILE_W * scale > avail) scale = avail / (count * TILE_W);
    const tw = TILE_W * scale;
    const th = TILE_H * scale;
    add(this.add.text(area.x0, area.y - th / 2 - 20, 'Hazırlanan perler (geri almak için dokun)', st(12, COLORS_UI.muted)));
    let x = area.x0;
    groups.forEach((g, gi) => {
      const w = g.length * tw + 8;
      const valid = this.groupValid(g);
      const bg = add(this.add.graphics());
      bg.fillStyle(0x000000, 0.3);
      bg.fillRoundedRect(x, area.y - th / 2 - 4, w, th + 8, 8);
      bg.lineStyle(3, valid ? 0x5fd38a : 0xe0574a, 1);
      bg.strokeRoundedRect(x, area.y - th / 2 - 4, w, th + 8, 8);
      g.forEach((t, i) => add(this.add.image(x + 4 + i * tw + tw / 2, area.y, tileKey(t)).setScale(scale)));
      const z = add(this.add.zone(x + w / 2, area.y, w, th + 8).setInteractive({ useHandCursor: true }));
      z.on('pointerdown', () => {
        this.staged.splice(gi, 1);
        this.rackDirty = true;
        this.requestRender();
      });
      x += w + 14;
    });
  }

  private renderRack() {
    this.rackObjs.forEach((o) => o.destroy());
    this.rackObjs = [];
    const byId = new Map(this.me.hand.map((t) => [t.id, t]));
    const stagedIds = new Set(this.staged.flat());
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = this.slots[i];
      if (id === null || stagedIds.has(id)) continue;
      const t = byId.get(id);
      if (!t) continue;
      const { x, y } = this.slotPos(i);
      const sel = this.selected.has(id);
      const ty = sel ? y - 14 : y;
      if (sel) {
        const glow = this.add.graphics().setDepth(9);
        glow.fillStyle(COLORS_UI.gold, 0.9);
        glow.fillRoundedRect(x - 29, ty - 39, 58, 78, 9);
        this.rackObjs.push(glow);
      }
      const img = this.add.image(x, ty, tileKey(t)).setScale(RACK.scale).setDepth(10);
      img.setData('id', id);
      img.setInteractive({ draggable: true, useHandCursor: true });
      img.on('pointerup', () => {
        if (img.getData('dragged')) {
          img.setData('dragged', false);
          return;
        }
        this.toggleSelect(id);
      });
      this.rackObjs.push(img);
    }
  }

  private updateButtons() {
    const b = this.buttons;
    const c = this.ctrl.game.contract;
    b.group.setLabel(c.mode === 'ciftEli' ? 'Çift Ekle' : 'Per Ekle').setEnabled(this.selected.size >= 2);
    b.lay.setLabel(this.layLabel()).setEnabled(this.myAction && this.staged.length > 0 && !this.me.openedThisTurn);
    b.cancel.setEnabled(this.staged.length > 0);
    b.discard.setEnabled(this.myAction && this.selected.size === 1);
    b.sort.setLabel(this.sortBy === 'seri' ? 'Küt Diz' : 'Seri Diz');
    const playing = this.s.phase !== 'roundOver' && this.s.phase !== 'gameOver';
    b.hint.setEnabled(playing);
  }

  private updateHint() {
    const s = this.s;
    const me = this.me;
    const c = this.ctrl.game.contract;
    let text = '';
    if (s.phase === 'draw' && s.current === 0) {
      text = s.pendingDiscard ? 'Sıra sende: ortadan çek ya da soldaki taşı al' : 'Sıra sende: ortadan çek';
    } else if (s.phase === 'action' && s.current === 0) {
      if (c.mode !== 'normal') text = 'Elini tek seferde açabilirsen "Öner"e bas · yoksa bir taş at';
      else if (!me.opened) text = `Sadece kuralı aç (${c.name}) ya da bir taş at`;
      else if (me.openedThisTurn) text = 'Kural açıldı · fazlalıkların sonraki sıranda iner — şimdi bir taş at';
      else text = 'Per diz · taş işle (taşı seç → yanan pere dokun) · taş at';
    } else if (s.phase === 'claim') {
      text = s.claim!.queue[0] === 0 ? 'Yan taşı istiyor musun?' : 'Yan taş isteniyor mu…';
    } else if (s.phase === 'draw' || s.phase === 'action') {
      text = `${s.players[s.current].name} oynuyor…`;
    }
    this.hintText.setText(text);
  }

  // ------------------------------------------------------------ katmanlar

  private clearOverlay() {
    this.overlayTimers.forEach((t) => (t instanceof Phaser.Tweens.Tween ? t.remove() : t.remove(false)));
    this.overlayTimers = [];
    this.overlayObjs.forEach((o) => o.destroy());
    this.overlayObjs = [];
    this.overlayKind = 'none';
  }

  private addOverlay<T extends Obj>(o: T): T {
    this.overlayObjs.push(o);
    return o;
  }

  private updateOverlays() {
    const s = this.s;
    if (s.phase === 'claim' && s.claim!.queue[0] === 0) {
      if (this.overlayKind !== 'claim') this.showClaimPrompt();
    } else if (this.overlayKind === 'claim') {
      this.clearOverlay();
    }
    if ((s.phase === 'roundOver' || s.phase === 'gameOver') && this.roundShown < s.history.length) {
      this.roundShown = s.history.length;
      this.time.delayedCall(700, () => this.showRoundResult());
    }
  }

  private panel(x: number, y: number, w: number, h: number, depth: number, dim = false) {
    if (dim) {
      const r = this.addOverlay(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.55).setOrigin(0).setDepth(depth));
      r.setInteractive();
    }
    const g = this.addOverlay(this.add.graphics().setDepth(depth));
    g.fillStyle(0x0a2a1f, 0.97);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    g.lineStyle(3, COLORS_UI.gold, 0.9);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
  }

  private showClaimPrompt() {
    this.clearOverlay();
    this.overlayKind = 'claim';
    const s = this.s;
    const c = s.claim!;
    const cx = 640;
    const cy = 300;
    const D = 900;
    this.panel(cx, cy, 500, 180, D);
    this.addOverlay(this.add.image(cx - 180, cy - 4, tileKey(c.tile)).setScale(0.62).setDepth(D));
    this.addOverlay(this.add.text(cx - 120, cy - 70, `${s.players[c.from].name}'in attığı taşı istiyor musun?`, st(18, '#ffffff', true)).setDepth(D));
    this.addOverlay(
      this.add
        .text(cx - 120, cy - 40, 'Sıradaki oyuncu almadı. İstersen yan taşı\nortadan 1 taş ile birlikte alırsın (+2 taş).', st(14, COLORS_UI.muted))
        .setDepth(D),
    );
    const answer = (want: boolean) => {
      if (this.overlayKind !== 'claim') return;
      this.clearOverlay();
      this.humanAct({ type: 'claim', want });
    };
    this.addOverlay(new Button(this, cx + 10, cy + 40, 130, 48, 'İSTE', () => answer(true), COLORS_UI.green).setDepth(D + 1));
    this.addOverlay(new Button(this, cx + 160, cy + 40, 130, 48, 'PAS', () => answer(false), COLORS_UI.red).setDepth(D + 1));
    const bar = this.addOverlay(this.add.graphics().setDepth(D + 1));
    const prog = { v: 1 };
    const draw = () => {
      bar.clear();
      bar.fillStyle(0xffffff, 0.15);
      bar.fillRoundedRect(cx - 230, cy + 74, 460, 6, 3);
      bar.fillStyle(COLORS_UI.gold, 1);
      bar.fillRoundedRect(cx - 230, cy + 74, 460 * prog.v, 6, 3);
    };
    draw();
    this.overlayTimers.push(
      this.tweens.add({ targets: prog, v: 0, duration: CLAIM_SECONDS * 1000, onUpdate: draw, onComplete: () => answer(false) }),
    );
  }

  private showRoundBanner() {
    const s = this.s;
    const g = this.ctrl.game;
    const cx = 640;
    const cy = 290;
    const objs: Obj[] = [];
    const bg = this.add.graphics().setDepth(800);
    bg.fillStyle(0x0a2a1f, 0.95);
    bg.fillRoundedRect(cx - 280, cy - 85, 560, 170, 18);
    bg.lineStyle(3, COLORS_UI.gold, 1);
    bg.strokeRoundedRect(cx - 280, cy - 85, 560, 170, 18);
    objs.push(bg);
    objs.push(this.add.text(cx - 250, cy - 70, `EL ${g.roundNumber} / ${g.totalRounds}`, st(16, COLORS_UI.goldText, true)).setDepth(800));
    objs.push(this.add.text(cx - 250, cy - 46, g.contract.name, st(34, '#ffffff', true)).setDepth(800));
    objs.push(this.add.text(cx - 250, cy + 2, g.contract.description, { ...st(15, COLORS_UI.muted), wordWrap: { width: 380 } }).setDepth(800));
    objs.push(
      this.add.text(cx - 250, cy + 46, `Başlayan: ${s.players[s.starter].name}`, st(16, COLORS_UI.cream, true)).setDepth(800),
    );
    if (g.contract.mode === 'normal') {
      objs.push(
        this.add
          .text(cx - 250, cy + 66, 'Açarken sadece kural iner; fazlalıklar sonraki sırada.', st(13, COLORS_UI.goldText))
          .setDepth(800),
      );
    }
    if (s.extraTile) {
      objs.push(this.add.text(cx + 210, cy - 70, 'Fazlalık taşı', st(13, COLORS_UI.muted)).setOrigin(0.5, 0).setDepth(800));
      objs.push(this.add.image(cx + 210, cy + 10, tileKey(s.extraTile)).setScale(0.7).setDepth(800));
    }
    this.tweens.add({
      targets: objs,
      alpha: 0,
      delay: 2600,
      duration: 500,
      onComplete: () => objs.forEach((o) => o.destroy()),
    });
  }

  private showRoundResult() {
    const s = this.s;
    const r = s.history[s.history.length - 1];
    if (!r) return;
    this.clearOverlay();
    this.overlayKind = 'round';
    const cx = 640;
    const cy = 340;
    const D = 950;
    this.panel(cx, cy, 700, 430, D, true);
    const title = r.winner === null ? 'El berabere bitti' : `${s.players[r.winner].name} eli bitirdi!`;
    this.addOverlay(this.add.text(cx, cy - 185, title, st(30, COLORS_UI.goldText, true)).setOrigin(0.5).setDepth(D));
    const sub =
      r.winner === null
        ? `${r.contractName} · Ortada taş kalmadı`
        : `${r.contractName} · ${FINISH_NAMES[r.finishType!]}${r.multiplier > 1 ? ` · ×${r.multiplier}` : ''}`;
    this.addOverlay(this.add.text(cx, cy - 148, sub, st(17, COLORS_UI.cream)).setOrigin(0.5).setDepth(D));

    const cols = [cx - 300, cx - 20, cx + 110, cx + 240];
    const head = ['Oyuncu', 'Elde kalan', 'Bu el', 'Toplam'];
    head.forEach((h, i) => this.addOverlay(this.add.text(cols[i], cy - 110, h, st(15, COLORS_UI.muted, true)).setDepth(D)));
    const rows =
      s.mode === 'solo'
        ? s.players.map((p, i) => ({ name: p.name, pen: `${r.penalties[i]}`, delta: r.deltas[i], total: p.score, win: i === r.winner }))
        : [0, 1].map((t) => {
            const seats = [0, 1, 2, 3].filter((i) => teamOf(i) === t);
            return {
              name: `${t === 0 ? 'Takım A' : 'Takım B'} (${seats.map((i) => s.players[i].name).join(' + ')})`,
              pen: seats.map((i) => r.penalties[i]).join(' + '),
              delta: r.deltas[seats[0]],
              total: s.players[seats[0]].score,
              win: r.winner !== null && teamOf(r.winner) === t,
            };
          });
    rows.forEach((row, ri) => {
      const y = cy - 76 + ri * 40;
      const color = row.win ? '#7ee2a0' : '#ffffff';
      this.addOverlay(this.add.text(cols[0], y, row.name, st(18, color, true)).setDepth(D));
      this.addOverlay(this.add.text(cols[1], y, row.pen, st(18, COLORS_UI.cream)).setDepth(D));
      this.addOverlay(this.add.text(cols[2], y, `${row.delta > 0 ? '+' : ''}${row.delta}`, st(18, row.delta < 0 ? '#7ee2a0' : '#ffb3a8', true)).setDepth(D));
      this.addOverlay(this.add.text(cols[3], y, `${row.total}`, st(18, COLORS_UI.goldText, true)).setDepth(D));
    });
    this.addOverlay(
      this.add.text(cx, cy + 112, 'Puanlar ceza puanıdır: en düşük toplam kazanır.', st(14, COLORS_UI.muted)).setOrigin(0.5).setDepth(D),
    );
    const last = s.phase === 'gameOver';
    this.addOverlay(
      new Button(this, cx, cy + 166, 220, 54, last ? 'Sonuçlar' : 'Sonraki El', () => {
        this.clearOverlay();
        if (last) this.showFinal();
        else this.humanAct({ type: 'nextRound' });
      }, COLORS_UI.green, 20).setDepth(D + 1),
    );
  }

  private showFinal() {
    const s = this.s;
    this.clearOverlay();
    this.overlayKind = 'final';
    const cx = 640;
    const cy = 340;
    const D = 950;
    this.panel(cx, cy, 620, 420, D, true);
    type Entry = { name: string; score: number; mine: boolean };
    const entries: Entry[] =
      s.mode === 'solo'
        ? s.players.map((p) => ({ name: p.name, score: p.score, mine: p.seat === 0 }))
        : [0, 1].map((t) => ({
            name: `${t === 0 ? 'Takım A' : 'Takım B'} (${s.players.filter((p) => teamOf(p.seat) === t).map((p) => p.name).join(' + ')})`,
            score: s.players.find((p) => teamOf(p.seat) === t)!.score,
            mine: t === teamOf(0),
          }));
    entries.sort((a, b) => a.score - b.score);
    const won = entries[0].mine;
    this.addOverlay(this.add.text(cx, cy - 170, won ? 'Kazandın! 🎉' : 'Oyun bitti', st(36, COLORS_UI.goldText, true)).setOrigin(0.5).setDepth(D));
    entries.forEach((e, i) => {
      const y = cy - 105 + i * 46;
      this.addOverlay(this.add.text(cx - 250, y, `${i + 1}.  ${e.name}`, st(21, e.mine ? COLORS_UI.goldText : '#ffffff', true)).setDepth(D));
      this.addOverlay(this.add.text(cx + 250, y, `${e.score}`, st(21, '#ffffff', true)).setOrigin(1, 0).setDepth(D));
    });
    this.addOverlay(
      new Button(this, cx - 120, cy + 160, 210, 54, 'Yeni Oyun', () => this.scene.restart({ mode: this.mode.mode }), COLORS_UI.green, 20).setDepth(D + 1),
    );
    this.addOverlay(new Button(this, cx + 120, cy + 160, 210, 54, 'Menü', () => this.scene.start('menu'), 0x34594a, 20).setDepth(D + 1));
  }

  private showScores() {
    if (this.overlayKind === 'round' || this.overlayKind === 'final') return;
    if (this.overlayKind === 'scores') {
      this.clearOverlay();
      return;
    }
    if (this.overlayKind === 'claim') return;
    const s = this.s;
    this.clearOverlay();
    this.overlayKind = 'scores';
    const cx = 640;
    const cy = 340;
    const D = 950;
    this.panel(cx, cy, 820, 560, D, true);
    this.addOverlay(this.add.text(cx, cy - 250, 'Puan Tablosu', st(26, COLORS_UI.goldText, true)).setOrigin(0.5).setDepth(D));
    const heads =
      s.mode === 'solo' ? s.players.map((p) => p.name) : ['Takım A', 'Takım B'];
    const seatsFor = s.mode === 'solo' ? [0, 1, 2, 3] : [0, 1];
    const x0 = cx - 380;
    const colX = (i: number) => cx - 60 + i * (s.mode === 'solo' ? 110 : 200);
    this.addOverlay(this.add.text(x0, cy - 210, 'El', st(14, COLORS_UI.muted, true)).setDepth(D));
    heads.forEach((h, i) => this.addOverlay(this.add.text(colX(i), cy - 210, h, st(14, COLORS_UI.muted, true)).setDepth(D)));
    s.history.forEach((r, ri) => {
      const y = cy - 182 + ri * 30;
      this.addOverlay(this.add.text(x0, y, `${ri + 1}. ${r.contractName}`, st(15)).setDepth(D));
      seatsFor.forEach((seat, i) => {
        const d = r.deltas[seat];
        this.addOverlay(this.add.text(colX(i), y, `${d > 0 ? '+' : ''}${d}`, st(15, d < 0 ? '#7ee2a0' : '#ffffff')).setDepth(D));
      });
    });
    const ty = cy - 182 + Math.max(s.history.length, 1) * 30 + 10;
    this.addOverlay(this.add.text(x0, ty, 'Toplam', st(16, COLORS_UI.goldText, true)).setDepth(D));
    seatsFor.forEach((seat, i) =>
      this.addOverlay(this.add.text(colX(i), ty, `${s.players[seat].score}`, st(16, COLORS_UI.goldText, true)).setDepth(D)),
    );
    this.addOverlay(new Button(this, cx, cy + 240, 180, 48, 'Kapat', () => this.clearOverlay(), 0x34594a).setDepth(D + 1));
  }

  update() {
    if (this.renderPending && !this.dragging) {
      this.renderPending = false;
      this.requestRender();
    }
  }
}
