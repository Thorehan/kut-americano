import { CONTRACTS, Contract, Requirement, RuleOrder, randomContractOrder } from './contracts';
import { Meld, MeldShape, addPosition, asCift, asKut, asSeri, jokerSwapIndex, withJokerSwapped, withTile, MELD_NAMES } from './melds';
import { mulberry32, shuffle } from './rng';
import { Tile, createTileSet, tileName, tilePenalty } from './tiles';

export const SEATS = 4;
export const HAND_SIZE = 14;
export const FINISH_BONUS = -50;
/** Rakibin perindeki okeyi alınan oyuncuya yazılan ceza. */
export const OKEY_SWAP_PENALTY = 50;
/** İşlek taşı (okeyin yerine geçebilecek taşı) yere atan oyuncuya yazılan ceza. */
export const ISLEK_PENALTY = 50;
/** El bittiğinde elinde okey kalan oyuncuya okey başına yazılan ek ceza (taş değeri 25'e ek). */
export const OKEY_HELD_PENALTY = 50;

export type GameMode = 'solo' | 'team';
export type Phase = 'draw' | 'claim' | 'action' | 'roundOver' | 'gameOver';
export type FinishType = 'normal' | 'okey' | 'ciftOkey';

export const FINISH_NAMES: Record<FinishType, string> = {
  normal: 'Normal bitiş',
  okey: 'Okey ile bitiş',
  ciftOkey: 'Çift okey ile bitiş',
};
const FINISH_MULT: Record<FinishType, number> = { normal: 1, okey: 2, ciftOkey: 4 };

export interface PlayerState {
  seat: number;
  name: string;
  isBot: boolean;
  /** Profil avatarı (emoji) ve rengi — sadece görünüm. */
  avatar?: string;
  color?: number;
  hand: Tile[];
  /** Bu elin kuralı açıldı mı (kural kilidi). */
  opened: boolean;
  /** Kural bu sırada mı açıldı (bu sırada işleme yapılamaz). */
  openedThisTurn: boolean;
  discards: Tile[];
  /** Toplam puan. Takım modunda iki takım arkadaşında aynı (takım puanı). */
  score: number;
}

export interface PendingDiscard {
  tile: Tile;
  from: number;
}

export interface ClaimState {
  tile: Tile;
  from: number;
  /** Sırayla sorulacak oyuncular (sıra yönüne göre en yakın önce). */
  queue: number[];
}

export interface RoundResult {
  roundIndex: number;
  contractName: string;
  winner: number | null;
  finishType: FinishType | null;
  multiplier: number;
  /** Her oyuncunun elinde kalan taşların ham ceza toplamı. */
  penalties: number[];
  /** Okeyi alınma / işlek atma gibi el içinde yazılan ek cezalar (koltuk bazında, çarpansız). */
  extras: number[];
  /** Bu elde her koltuğa yazılan puan. */
  deltas: number[];
}

export interface GameState {
  mode: GameMode;
  seed: number;
  jokerCount: number;
  /** Kural sırası: klasik (1→11) ya da rastgele. */
  ruleOrder: RuleOrder;
  /** Her elin kuralı (CONTRACTS indeksleri), roundIndex ile okunur. */
  contractOrder: number[];
  firstRound: number;
  lastRound: number;
  roundIndex: number;
  players: PlayerState[];
  deck: Tile[];
  melds: Meld[];
  starter: number;
  current: number;
  phase: Phase;
  /** Başlayanın 15. taşı — herkese gösterilir. */
  extraTile: Tile | null;
  /** Az önce atılan, sıradakinin alabileceği yan taş. */
  pendingDiscard: PendingDiscard | null;
  claim: ClaimState | null;
  /** Sıra başında eldeki okey sayısı (çift okey bitişi için). */
  turnJokers: number;
  /** Bu el içinde yazılan ek cezalar (okeyi alınma, işlek atma). */
  extraPenalties: number[];
  /** Eli bitiren son taş: yana değil ortaya vurulur. */
  finishTile: Tile | null;
  history: RoundResult[];
  log: GameEvent[];
}

export type Action =
  | { type: 'drawDeck' }
  | { type: 'takeDiscard' }
  | { type: 'claim'; want: boolean }
  | { type: 'lay'; melds: number[][] }
  | { type: 'addToMeld'; tileId: number; meldId: number }
  /** Yerdeki perde okeyin tuttuğu taşı koyup okeyi almak. */
  | { type: 'swapJoker'; tileId: number; meldId: number }
  | { type: 'discard'; tileId: number }
  | { type: 'nextRound' };

export type GameEventType =
  | 'roundStart'
  | 'drawDeck'
  | 'takeDiscard'
  | 'claim'
  | 'open'
  | 'lay'
  | 'addToMeld'
  | 'swapJoker'
  | 'islek'
  | 'okeyHeld'
  | 'discard'
  | 'roundEnd'
  | 'gameEnd';

export interface GameEvent {
  type: GameEventType;
  seat: number;
  text: string;
  tile?: Tile;
  /** Olaydan etkilenen diğer oyuncu (ör. okeyi alınan). */
  target?: number;
}

export type ActResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export class RuleError extends Error {}

export interface GameOptions {
  mode?: GameMode;
  names?: string[];
  bots?: boolean[];
  /** Koltuk başına avatar/renk (görünüm). */
  profiles?: { avatar?: string; color?: number }[];
  seed?: number;
  jokerCount?: number;
  /** İlk oynanacak el (0 tabanlı) — deneme için ör. 9 = Elden Bitme. */
  startRound?: number;
  /** Son oynanacak el (0 tabanlı, dahil). */
  endRound?: number;
  /** 'random': her elin kuralı oranlarla rastgele seçilir. */
  ruleOrder?: RuleOrder;
}

export function teamOf(seat: number): number {
  return seat % 2;
}

/** Açılış grupları kontratı sağlıyor mu? Sağlıyorsa her grubun yorumunu döndürür. */
export function matchContract(groups: Tile[][], reqs: readonly Requirement[]): MeldShape[] | null {
  const options = groups.map((g) => [asKut(g), asSeri(g)].filter((x): x is MeldShape => x !== null));
  if (options.some((o) => o.length === 0)) return null;
  const chosen: (MeldShape | null)[] = groups.map(() => null);
  const rec = (ri: number): boolean => {
    if (ri === reqs.length) return true;
    const r = reqs[ri];
    for (let gi = 0; gi < groups.length; gi++) {
      if (chosen[gi]) continue;
      const sh = options[gi].find((o) => o.kind === r.kind && o.tiles.length === r.size);
      if (!sh) continue;
      chosen[gi] = sh;
      if (rec(ri + 1)) return true;
      chosen[gi] = null;
    }
    return false;
  };
  if (!rec(0)) return null;
  return groups.map((_, i) => chosen[i] ?? options[i][0]);
}

export class Game {
  state: GameState;
  private rand: () => number;
  private nextMeldId = 1;

  /**
   * Sadece okumak için: sunucudan gelen görünümden (viewFor) bir Game kabuğu kurar.
   * contract, canAddToMelds, isIslek gibi sorgular çalışır; act() kullanılmamalıdır.
   */
  static fromState(state: GameState): Game {
    const g = Object.create(Game.prototype) as Game;
    g.state = state;
    return g;
  }

  constructor(opts: GameOptions = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rand = mulberry32(seed);
    const names = opts.names ?? ['Sen', 'Bot 1', 'Bot 2', 'Bot 3'];
    const bots = opts.bots ?? [false, true, true, true];
    const firstRound = Math.max(0, Math.min(opts.startRound ?? 0, CONTRACTS.length - 1));
    const lastRound = Math.max(firstRound, Math.min(opts.endRound ?? CONTRACTS.length - 1, CONTRACTS.length - 1));
    this.state = {
      mode: opts.mode ?? 'solo',
      seed,
      jokerCount: opts.jokerCount ?? 2,
      ruleOrder: opts.ruleOrder ?? 'classic',
      contractOrder: opts.ruleOrder === 'random' ? randomContractOrder(this.rand) : CONTRACTS.map((_, i) => i),
      firstRound,
      lastRound,
      roundIndex: firstRound,
      players: names.slice(0, SEATS).map((name, seat) => ({
        seat,
        name,
        isBot: bots[seat] ?? true,
        avatar: opts.profiles?.[seat]?.avatar,
        color: opts.profiles?.[seat]?.color,
        hand: [],
        opened: false,
        openedThisTurn: false,
        discards: [],
        score: 0,
      })),
      deck: [],
      melds: [],
      starter: 0,
      current: 0,
      phase: 'action',
      extraTile: null,
      pendingDiscard: null,
      claim: null,
      turnJokers: 0,
      extraPenalties: [0, 0, 0, 0],
      finishTile: null,
      history: [],
      log: [],
    };
    this.state.log.push(...this.startRound());
  }

  get contract(): Contract {
    return CONTRACTS[this.state.contractOrder[this.state.roundIndex]];
  }

  get roundNumber(): number {
    return this.state.roundIndex - this.state.firstRound + 1;
  }

  get totalRounds(): number {
    return this.state.lastRound - this.state.firstRound + 1;
  }

  act(seat: number, action: Action): ActResult {
    try {
      const events = this.apply(seat, action);
      this.state.log.push(...events);
      if (this.state.log.length > 60) this.state.log.splice(0, this.state.log.length - 60);
      return { ok: true, events };
    } catch (e) {
      if (e instanceof RuleError) return { ok: false, error: e.message };
      throw e;
    }
  }

  /** İşleme yapabilir mi (kural açık, açtığı sıra değil, normal el). */
  /**
   * İşlek taş: yerdeki herhangi bir pere işlenebilen (uca eklenebilen) ya da bir
   * perdeki okeyin yerine geçebilen taş. Atan +50 ceza yer.
   */
  isIslek(tile: Tile): boolean {
    return !tile.joker && this.state.melds.some((m) => jokerSwapIndex(m, tile) !== null || addPosition(m, tile) !== null);
  }

  /** Bu taş yerdeki bir perde okeyin yerine geçebilir mi? */
  canSwapJoker(tile: Tile): boolean {
    return !tile.joker && this.state.melds.some((m) => jokerSwapIndex(m, tile) !== null);
  }

  /** Okeyi alınınca ceza yazılacak mı? (rakibin peri ise evet; kendi/ortağının ise hayır) */
  isOpponent(a: number, b: number): boolean {
    if (a === b) return false;
    return this.state.mode === 'solo' || teamOf(a) !== teamOf(b);
  }

  canAddToMelds(seat: number): boolean {
    const p = this.state.players[seat];
    return this.contract.mode === 'normal' && p.opened && !p.openedThisTurn;
  }

  // ------------------------------------------------------------------

  private apply(seat: number, a: Action): GameEvent[] {
    const s = this.state;
    if (a.type === 'nextRound') {
      if (s.phase !== 'roundOver') throw new RuleError('El henüz bitmedi.');
      s.roundIndex++;
      return this.startRound();
    }
    if (s.phase === 'roundOver' || s.phase === 'gameOver') throw new RuleError('El bitti.');
    if (s.phase === 'claim') {
      if (a.type !== 'claim') throw new RuleError('Yan taş isteği bekleniyor.');
      if (s.claim!.queue[0] !== seat) throw new RuleError('İstek sırası sende değil.');
      return this.doClaim(seat, a.want);
    }
    if (a.type === 'claim') throw new RuleError('Şu an istek yapılamaz.');
    if (seat !== s.current) throw new RuleError('Sıra sende değil.');

    if (s.phase === 'draw') {
      if (a.type === 'drawDeck') return this.doDrawDeck(seat);
      if (a.type === 'takeDiscard') return this.doTakeDiscard(seat);
      throw new RuleError('Önce ortadan çek ya da yan taşı al.');
    }
    switch (a.type) {
      case 'lay':
        return this.doLay(seat, a.melds);
      case 'swapJoker':
        return this.doSwapJoker(seat, a.tileId, a.meldId);
      case 'addToMeld':
        return this.doAddToMeld(seat, a.tileId, a.meldId);
      case 'discard':
        return this.doDiscard(seat, a.tileId);
      default:
        throw new RuleError('Taş çekme zamanı değil.');
    }
  }

  private startRound(): GameEvent[] {
    const s = this.state;
    s.deck = shuffle(createTileSet(s.jokerCount), this.rand);
    s.starter = (s.roundIndex - s.firstRound) % SEATS;
    for (const p of s.players) {
      p.hand = [];
      p.opened = false;
      p.openedThisTurn = false;
      p.discards = [];
    }
    for (let i = 0; i < HAND_SIZE; i++) for (const p of s.players) p.hand.push(s.deck.pop()!);
    const extra = s.deck.pop()!;
    s.players[s.starter].hand.push(extra);
    s.extraTile = extra;
    s.melds = [];
    s.extraPenalties = [0, 0, 0, 0];
    s.finishTile = null;
    s.pendingDiscard = null;
    s.claim = null;
    s.current = s.starter;
    this.enterAction(s.starter);
    const starter = s.players[s.starter];
    return [
      {
        type: 'roundStart',
        seat: s.starter,
        tile: extra,
        text: `El ${this.roundNumber}: ${this.contract.name}. Başlayan ${starter.name}, fazlalık taşı ${tileName(extra)}.`,
      },
    ];
  }

  private enterAction(seat: number) {
    const s = this.state;
    s.phase = 'action';
    s.players[seat].openedThisTurn = false;
    s.turnJokers = s.players[seat].hand.filter((t) => t.joker).length;
  }

  private doDrawDeck(seat: number): GameEvent[] {
    const s = this.state;
    const p = s.players[seat];
    const tile = s.deck.pop();
    if (!tile) throw new RuleError('Ortada taş kalmadı.');
    p.hand.push(tile);
    const events: GameEvent[] = [{ type: 'drawDeck', seat, text: `${p.name} ortadan çekti.` }];
    const pd = s.pendingDiscard;
    s.pendingDiscard = null;
    if (pd && s.deck.length > 0) {
      const queue: number[] = [];
      for (let k = 1; k < SEATS; k++) {
        const q = (seat + k) % SEATS;
        if (q !== pd.from) queue.push(q);
      }
      s.claim = { tile: pd.tile, from: pd.from, queue };
      s.phase = 'claim';
    } else {
      this.enterAction(seat);
    }
    return events;
  }

  private takeFromDiscards(pd: PendingDiscard) {
    const pile = this.state.players[pd.from].discards;
    const idx = pile.lastIndexOf(pd.tile);
    if (idx >= 0) pile.splice(idx, 1);
  }

  private doTakeDiscard(seat: number): GameEvent[] {
    const s = this.state;
    const pd = s.pendingDiscard;
    if (!pd) throw new RuleError('Alınacak yan taş yok.');
    this.takeFromDiscards(pd);
    s.players[seat].hand.push(pd.tile);
    s.pendingDiscard = null;
    this.enterAction(seat);
    return [
      { type: 'takeDiscard', seat, tile: pd.tile, text: `${s.players[seat].name} yan taşı aldı (${tileName(pd.tile)}).` },
    ];
  }

  private doClaim(seat: number, want: boolean): GameEvent[] {
    const s = this.state;
    const c = s.claim!;
    if (!want) {
      c.queue.shift();
      if (c.queue.length === 0) {
        s.claim = null;
        this.enterAction(s.current);
      }
      return [];
    }
    const p = s.players[seat];
    this.takeFromDiscards({ tile: c.tile, from: c.from });
    p.hand.push(c.tile);
    const extra = s.deck.pop();
    if (extra) p.hand.push(extra);
    s.claim = null;
    this.enterAction(s.current);
    return [
      {
        type: 'claim',
        seat,
        tile: c.tile,
        text: `${p.name} ${s.players[c.from].name}'in taşını istedi: ${tileName(c.tile)} + ortadan 1 taş.`,
      },
    ];
  }

  private doLay(seat: number, groups: number[][]): GameEvent[] {
    const s = this.state;
    const p = s.players[seat];
    const c = this.contract;
    if (!groups.length || groups.some((g) => g.length === 0)) throw new RuleError('Dizilecek per yok.');
    const byId = new Map(p.hand.map((t) => [t.id, t]));
    const seen = new Set<number>();
    const tileGroups = groups.map((g) =>
      g.map((id) => {
        const t = byId.get(id);
        if (!t) throw new RuleError('Bu taş elinde değil.');
        if (seen.has(id)) throw new RuleError('Bir taş iki pere konamaz.');
        seen.add(id);
        return t;
      }),
    );
    const remaining = p.hand.length - seen.size;
    let shapes: MeldShape[];

    if (c.mode === 'normal') {
      if (!p.opened) {
        // Açılış sırasında yalnızca kural yere iner; fazlalık per/taş o sırada inemez.
        if (tileGroups.length !== c.reqs.length) {
          throw new RuleError(`Açılışta sadece kural (${c.name}) yere iner; diğer perlerini sonraki sıranda dizebilirsin.`);
        }
        const m = matchContract(tileGroups, c.reqs);
        if (!m) throw new RuleError(`Kural sağlanmadı: ${c.name}. ${c.description} (fazlalık taş o sırada inemez)`);
        shapes = m;
      } else if (p.openedThisTurn) {
        throw new RuleError('Kuralı açtığın sırada başka per dizilmez; sonraki sıranda dizebilirsin.');
      } else {
        shapes = tileGroups.map((g) => {
          const sh = asSeri(g) ?? asKut(g);
          if (!sh) throw new RuleError('Geçersiz per: küt ya da seri olmalı.');
          return sh;
        });
      }
    } else if (c.mode === 'eldenBitme') {
      if (remaining > 1) throw new RuleError('Elden bitmede tüm taşlar tek seferde dizilmeli (en fazla 1 taş atılır).');
      shapes = tileGroups.map((g) => {
        const sh = asSeri(g) ?? asKut(g);
        if (!sh) throw new RuleError('Geçersiz per: küt ya da seri olmalı.');
        return sh;
      });
    } else {
      if (remaining > 1) throw new RuleError('Çift elinde tüm çiftler tek seferde açılmalı (en fazla 1 taş atılır).');
      shapes = tileGroups.map((g) => {
        const sh = asCift(g);
        if (!sh) throw new RuleError('Geçersiz çift: aynı renk ve aynı sayı olmalı.');
        return sh;
      });
      if (shapes.length < 7) throw new RuleError('Çift elinde en az 7 çift gerekli.');
    }

    const wasOpened = p.opened;
    p.hand = p.hand.filter((t) => !seen.has(t.id));
    for (const sh of shapes) s.melds.push({ ...sh, id: this.nextMeldId++, owner: seat });
    const desc = shapes.map((sh) => `${sh.tiles.length}'lü ${MELD_NAMES[sh.kind].toLowerCase()}`).join(', ');
    const events: GameEvent[] = [];
    if (!wasOpened) {
      p.opened = true;
      p.openedThisTurn = true;
      events.push({ type: 'open', seat, text: `${p.name} kuralı açtı! (${desc})` });
    } else {
      events.push({ type: 'lay', seat, text: `${p.name} per dizdi (${desc}).` });
    }
    if (p.hand.length === 0) events.push(...this.finishRound(seat, 'normal'));
    return events;
  }

  private doSwapJoker(seat: number, tileId: number, meldId: number): GameEvent[] {
    const s = this.state;
    const p = s.players[seat];
    if (this.contract.mode !== 'normal') throw new RuleError('Bu elde okey alınmaz.');
    if (!p.opened) throw new RuleError('Okeyi almak için önce kuralı açmalısın.');
    if (p.openedThisTurn) throw new RuleError('Kuralı açtığın sırada okey alınmaz; sonraki sıranda alabilirsin.');
    const tile = p.hand.find((t) => t.id === tileId);
    if (!tile) throw new RuleError('Bu taş elinde değil.');
    const idx = s.melds.findIndex((m) => m.id === meldId);
    if (idx < 0) throw new RuleError('Per bulunamadı.');
    const swapped = withJokerSwapped(s.melds[idx], tile);
    if (!swapped) throw new RuleError(`${tileName(tile)} bu perdeki okeyin yerine geçmez.`);
    s.melds[idx] = swapped.meld;
    p.hand = p.hand.filter((t) => t !== tile);
    p.hand.push(swapped.joker);
    const owner = swapped.meld.owner;
    const penalize = this.isOpponent(seat, owner);
    if (penalize) s.extraPenalties[owner] += OKEY_SWAP_PENALTY;
    const ownerName = owner === seat ? 'kendi' : `${s.players[owner].name}'in`;
    return [
      {
        type: 'swapJoker',
        seat,
        tile,
        target: owner,
        text: `${p.name} ${ownerName} perindeki okeyi aldı (${tileName(tile)} koydu)${penalize ? `: ${s.players[owner].name} +${OKEY_SWAP_PENALTY} ceza!` : '.'}`,
      },
    ];
  }

  private doAddToMeld(seat: number, tileId: number, meldId: number): GameEvent[] {
    const s = this.state;
    const p = s.players[seat];
    if (this.contract.mode !== 'normal') throw new RuleError('Bu elde işleme yok.');
    if (!p.opened) throw new RuleError('İşlemek için önce kuralı açmalısın.');
    if (p.openedThisTurn) throw new RuleError('Kuralı açtığın sırada işleme yapılmaz; sonraki sıranda işleyebilirsin.');
    const tile = p.hand.find((t) => t.id === tileId);
    if (!tile) throw new RuleError('Bu taş elinde değil.');
    const idx = s.melds.findIndex((m) => m.id === meldId);
    if (idx < 0) throw new RuleError('Per bulunamadı.');
    const updated = withTile(s.melds[idx], tile);
    if (!updated) throw new RuleError(`${tileName(tile)} bu pere işlenemez.`);
    s.melds[idx] = updated;
    p.hand = p.hand.filter((t) => t !== tile);
    const owner = s.players[updated.owner].name;
    const events: GameEvent[] = [
      { type: 'addToMeld', seat, tile, text: `${p.name} ${tileName(tile)} işledi (${owner}'in peri).` },
    ];
    if (p.hand.length === 0) events.push(...this.finishRound(seat, 'normal'));
    return events;
  }

  private doDiscard(seat: number, tileId: number): GameEvent[] {
    const s = this.state;
    const p = s.players[seat];
    const tile = p.hand.find((t) => t.id === tileId);
    if (!tile) throw new RuleError('Bu taş elinde değil.');
    if (p.hand.length === 1 && !p.opened) throw new RuleError('Kuralı açmadan bitilemez.');
    if (p.hand.length === 1) {
      // Son taş: işlek olsa da ortaya vurulur ve el biter (yana atılmaz, ceza yok).
      p.hand = [];
      s.finishTile = tile;
      const ft: FinishType = tile.joker ? (s.turnJokers >= 2 ? 'ciftOkey' : 'okey') : 'normal';
      return [{ type: 'discard', seat, tile, text: `${p.name} son taşını ortaya vurdu (${tileName(tile)}).` }, ...this.finishRound(seat, ft)];
    }
    if (this.isIslek(tile)) {
      // İşlek atan: taşı geri alır + ortadan 1 taş çeker, +50 ceza yer, sıra sonrakine geçer.
      s.extraPenalties[seat] += ISLEK_PENALTY;
      const extra = s.deck.pop();
      if (extra) p.hand.push(extra);
      const events: GameEvent[] = [
        {
          type: 'islek',
          seat,
          tile,
          text: `${p.name} işlek taş attı (${tileName(tile)}): taşı geri aldı${extra ? ' + ortadan 1 taş' : ''}, +${ISLEK_PENALTY} ceza!`,
        },
      ];
      s.pendingDiscard = null;
      s.current = (seat + 1) % SEATS;
      if (s.deck.length === 0) {
        events.push(...this.finishRound(null, null));
        return events;
      }
      s.phase = 'draw';
      return events;
    }
    p.hand = p.hand.filter((t) => t !== tile);
    p.discards.push(tile);
    const events: GameEvent[] = [{ type: 'discard', seat, tile, text: `${p.name} ${tileName(tile)} attı.` }];
    s.pendingDiscard = { tile, from: seat };
    s.current = (seat + 1) % SEATS;
    if (s.deck.length === 0) {
      events.push(...this.finishRound(null, null));
      return events;
    }
    s.phase = 'draw';
    return events;
  }

  private finishRound(winner: number | null, ft: FinishType | null): GameEvent[] {
    const s = this.state;
    const c = this.contract;
    const penalties = s.players.map((p) => p.hand.reduce((sum, t) => sum + tilePenalty(t), 0));
    const multiplier = winner === null || !ft ? 1 : FINISH_MULT[ft] * (c.mode === 'ciftEli' ? 2 : 1);
    const deltas = [0, 0, 0, 0];

    // Elinde okey kalan (cezası yazılan) her oyuncuya okey başına +50, herkese duyurulur.
    const heldEvents: GameEvent[] = [];
    s.players.forEach((p, i) => {
      const counted = winner === null || (s.mode === 'solo' ? i !== winner : teamOf(i) !== teamOf(winner));
      const jokers = p.hand.filter((t) => t.joker).length;
      if (!counted || !jokers) return;
      s.extraPenalties[i] += OKEY_HELD_PENALTY * jokers;
      heldEvents.push({
        type: 'okeyHeld',
        seat: i,
        text: `${p.name} elinde ${jokers > 1 ? jokers + ' okey' : 'okey'} kaldı: +${OKEY_HELD_PENALTY * jokers} ceza!`,
      });
    });
    const extras = s.extraPenalties.slice();
    if (s.mode === 'solo') {
      for (let i = 0; i < SEATS; i++) deltas[i] = (i === winner ? FINISH_BONUS * multiplier : penalties[i] * multiplier) + extras[i];
    } else {
      const team = [0, 0];
      for (let t = 0; t < 2; t++) {
        const pen = penalties.filter((_, i) => teamOf(i) === t).reduce((a, b) => a + b, 0);
        const ext = extras.filter((_, i) => teamOf(i) === t).reduce((a, b) => a + b, 0);
        team[t] = (winner !== null && teamOf(winner) === t ? FINISH_BONUS * multiplier : pen * multiplier) + ext;
      }
      for (let i = 0; i < SEATS; i++) deltas[i] = team[teamOf(i)];
    }
    s.players.forEach((p, i) => (p.score += deltas[i]));

    const result: RoundResult = {
      roundIndex: s.roundIndex,
      contractName: c.name,
      winner,
      finishType: ft,
      multiplier,
      penalties,
      extras,
      deltas,
    };
    s.history.push(result);
    s.pendingDiscard = null;
    s.claim = null;
    const last = s.roundIndex >= s.lastRound;
    s.phase = last ? 'gameOver' : 'roundOver';

    const text =
      winner === null
        ? 'Ortada taş kalmadı, el berabere bitti.'
        : `${s.players[winner].name} eli bitirdi! (${FINISH_NAMES[ft!]}${multiplier > 1 ? `, ×${multiplier}` : ''})`;
    const events: GameEvent[] = [{ type: 'roundEnd', seat: winner ?? -1, text }, ...heldEvents];
    if (last) events.push({ type: 'gameEnd', seat: -1, text: 'Oyun bitti!' });
    return events;
  }
}
