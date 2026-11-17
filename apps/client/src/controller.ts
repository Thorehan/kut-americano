import { Action, Game, GameEvent, GameMode, RuleOrder, decideBotAction } from '@kut/core';

export type ChangeListener = (events: GameEvent[]) => void;

export interface ControllerOptions {
  mode: GameMode;
  seed?: number;
  startRound?: number;
  ruleOrder?: RuleOrder;
  /** Bot hızı çarpanı (1 = normal). */
  speed?: number;
}

/** Oyunu yürütür: insanın hamlelerini motora iletir, botları gecikmeli oynatır. */
export class Controller {
  readonly game: Game;
  readonly human = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<ChangeListener>();
  private speed: number;
  private destroyed = false;

  constructor(opts: ControllerOptions) {
    const names = opts.mode === 'team' ? ['Sen', 'Bot 1', 'Ortak', 'Bot 3'] : ['Sen', 'Bot 1', 'Bot 2', 'Bot 3'];
    this.game = new Game({ mode: opts.mode, names, seed: opts.seed, startRound: opts.startRound, ruleOrder: opts.ruleOrder });
    this.speed = opts.speed ?? 1;
  }

  onChange(fn: ChangeListener) {
    this.listeners.add(fn);
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
    for (const l of this.listeners) l(events);
  }

  private schedule() {
    if (this.timer || this.destroyed) return;
    const s = this.game.state;
    let seat: number | null = null;
    if (s.phase === 'claim') seat = s.claim!.queue[0];
    else if (s.phase === 'draw' || s.phase === 'action') seat = s.current;
    if (seat === null || !s.players[seat].isBot) return;
    const base = s.phase === 'claim' ? 420 : s.phase === 'draw' ? 650 : 560;
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

  private botStep(seat: number) {
    if (this.destroyed) return;
    const s = this.game.state;
    const action = decideBotAction(this.game, seat);
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
    this.emit(r.events);
    this.schedule();
  }
}
