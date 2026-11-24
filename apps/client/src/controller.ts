import { Action, Game, GameEvent, GameLength, GameMode, GameState, RuleOrder, ServerMsg, decideBotAction } from '@kut/core';
import { writeSave } from './savegame';
import { Connection } from './net/connection';
import { TutorialStage, setupTutorialGame, tutorialBotAction } from './tutorial';
import { profile } from './profile';
import { PreviewSpec, setupPreviewGame, CIFT_ELI_ROUND } from './preview';

export type ChangeListener = (events: GameEvent[]) => void;
export type ErrorListener = (message: string) => void;

/** Masa sahnesinin konuştuğu ortak arayüz: yerel (botlarla) ya da online. */
export interface GameController {
  readonly game: Game;
  readonly online: boolean;
  /** Online: koltuk bağlı mı (görünüm sırasıyla). Yerelde hepsi true. */
  readonly presence: boolean[];
  /** Hamle; yerelde hata hemen döner, online'da hata onError ile gelir. */
  act(action: Action): string | null;
  onChange(fn: ChangeListener): void;
  onError(fn: ErrorListener): void;
  start(): void;
  hold(ms: number): void;
  destroy(): void;
}

export interface ControllerOptions {
  mode: GameMode;
  seed?: number;
  startRound?: number;
  ruleOrder?: RuleOrder;
  /** Öğretici: hazır el, tek el, senaryolu botlar. */
  tutorial?: boolean | TutorialStage;
  /** Bitiş ekranı önizlemesi: hazır tek el. */
  preview?: PreviewSpec;
  /** Bot hızı çarpanı (1 = normal). */
  speed?: number;
  /** Kısa (5 el) / tam (15 el). */
  length?: GameLength;
  /** Kayıttan sürdürülecek oyun (kaldığın yerden devam). */
  restore?: GameState;
}

/** Yerel oyun: insanın hamlelerini motora iletir, botları gecikmeli oynatır. */
export class LocalController implements GameController {
  readonly game: Game;
  readonly online = false;
  readonly presence = [true, true, true, true];
  readonly human = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<ChangeListener>();
  private speed: number;
  private destroyed = false;

  constructor(opts: ControllerOptions) {
    const names = opts.mode === 'team' ? ['Sen', 'Bot 1', 'Ortak', 'Bot 3'] : ['Sen', 'Bot 1', 'Bot 2', 'Bot 3'];
    const me = profile();
    const grey = 0x4a4f57;
    const profiles = [
      { avatar: me.avatar, color: me.color },
      { avatar: '🤖', color: grey },
      opts.mode === 'team' ? { avatar: '🤝', color: me.color } : { avatar: '🎲', color: grey },
      { avatar: '👾', color: grey },
    ];
    if (opts.restore) {
      this.game = Game.restore(opts.restore);
      this.autosave = true;
    } else if (opts.tutorial) {
      this.game = new Game({ mode: 'solo', names, seed: 7, startRound: 0, endRound: 0, profiles });
      setupTutorialGame(this.game, opts.tutorial === 'okey' ? 'okey' : 'basic');
      this.tutorial = true;
    } else if (opts.preview) {
      const r = opts.preview.ciftEli ? CIFT_ELI_ROUND : 0;
      this.game = new Game({ mode: 'solo', names, seed: 11, startRound: r, endRound: r, profiles });
      setupPreviewGame(this.game, opts.preview);
    } else {
      this.game = new Game({ mode: opts.mode, names, seed: opts.seed, startRound: opts.startRound, ruleOrder: opts.ruleOrder, length: opts.length, profiles });
      this.autosave = true;
      writeSave(this.game.state); // yeni oyun eski yarım oyunun yerine geçer
    }
    this.speed = opts.speed ?? 1;
  }

  /** Öğretici ve önizleme dışında her hamleden sonra kaydedilir. */
  private autosave = false;

  onChange(fn: ChangeListener) {
    this.listeners.add(fn);
  }

  onError(_fn: ErrorListener) {
    /* yerelde hatalar act() dönüşüyle gelir */
  }

  start() {
    this.schedule();
  }

  /** İnsan hamlesi. Hata varsa mesajı döner. */
  act(action: Action): string | null {
    const r = this.game.act(this.human, action);
    if (!r.ok) return r.error;
    this.emit(r.events);
    this.schedule();
    return null;
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }

  private emit(events: GameEvent[]) {
    if (this.autosave && !this.destroyed) writeSave(this.game.state);
    for (const l of this.listeners) l(events);
  }

  private schedule() {
    if (this.timer || this.destroyed) return;
    const s = this.game.state;
    let seat: number | null = null;
    if (s.phase === 'claim') seat = s.claim!.queue[0];
    else if (s.phase === 'draw' || s.phase === 'action') seat = s.current;
    if (seat === null || !s.players[seat].isBot) return;
    // Tempo: hamleler okunabilsin diye ölçülü (yan taş sorusu < çekme < oynama)
    const base = s.phase === 'claim' ? 650 : s.phase === 'draw' ? 950 : 850;
    const hold = Math.max(0, this.holdUntil - Date.now());
    const who = seat;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.botStep(who);
    }, hold + base / this.speed);
  }

  /** Botları kısa süre bekletir (ör. el başı duyurusu ve dağıtım animasyonu sırasında). */
  hold(ms: number) {
    this.holdUntil = Math.max(this.holdUntil, Date.now() + ms);
  }

  private holdUntil = 0;

  private tutorial = false;
  /** Öğreticide her botun en son eline aldığı taş (onu geri atar). */
  private lastGot = new Map<number, number>();

  private botStep(seat: number) {
    if (this.destroyed) return;
    const s = this.game.state;
    const action = this.tutorial ? tutorialBotAction(this.game, seat, this.lastGot) : decideBotAction(this.game, seat);
    let r = this.game.act(seat, action);
    if (!r.ok) {
      console.warn('Bot hamlesi reddedildi:', r.error, action);
      const fallback: Action =
        s.phase === 'draw'
          ? { type: 'drawDeck' }
          : s.phase === 'claim'
            ? { type: 'claim', want: false }
            : { type: 'discard', tileId: s.players[seat].hand[0].id };
      r = this.game.act(seat, fallback);
      if (!r.ok) {
        console.error('Bot takıldı:', r.error);
        return;
      }
    }
    if (this.tutorial && (action.type === 'drawDeck' || action.type === 'takeDiscard')) {
      const hand = s.players[seat].hand;
      this.lastGot.set(seat, hand[hand.length - 1].id);
    }
    this.emit(r.events);
    this.schedule();
  }
}

/**
 * Online oyun: durum sunucudadır. Gelen görünüm (alıcı = koltuk 0) bir Game kabuğuna
 * konur; masa sahnesi yerel oyundaki gibi okur. Hamleler sunucuya gider.
 */
export class OnlineController implements GameController {
  readonly game: Game;
  readonly online = true;
  presence: boolean[];
  private listeners = new Set<ChangeListener>();
  private errorListeners = new Set<ErrorListener>();
  private unsub: () => void;

  constructor(
    private conn: Connection,
    initial: { view: GameState; online: boolean[] },
  ) {
    this.game = Game.fromState(initial.view);
    this.presence = initial.online;
    this.unsub = conn.on((m: ServerMsg) => {
      if (m.t === 'state') {
        this.game.state = m.view;
        this.presence = m.online;
        for (const l of this.listeners) l(m.events);
      } else if (m.t === 'error') {
        for (const l of this.errorListeners) l(m.message);
      }
    });
  }

  act(action: Action): string | null {
    this.conn.send({ t: 'act', action });
    return null;
  }
  onChange(fn: ChangeListener) {
    this.listeners.add(fn);
  }
  onError(fn: ErrorListener) {
    this.errorListeners.add(fn);
  }
  start() {
    /* sunucu yönetir */
  }
  hold(_ms: number) {
    /* botları sunucu bekletir */
  }
  destroy() {
    this.unsub();
    this.listeners.clear();
    this.errorListeners.clear();
  }
}
