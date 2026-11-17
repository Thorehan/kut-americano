/** Dosyasız, WebAudio ile üretilen kısa ses efektleri + titreşim. */
class Sfx {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('kut-muted') === '1';
    } catch {
      /* depolama yok */
    }
  }

  /** İlk dokunuşta çağrılmalı (tarayıcılar sesi kullanıcı etkileşimi olmadan başlatmaz). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('kut-muted', m ? '1' : '0');
    } catch {
      /* depolama yok */
    }
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, when = 0, slideTo?: number) {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number, when = 0, q = 1) {
    const c = this.ready();
    if (!c || !this.noiseBuf) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Taşın masaya konma sesi ("tak"). */
  tok() {
    this.noise(0.05, 0.5, 2600, 0, 2.5);
    this.tone(1250, 0.045, 'triangle', 0.07);
  }
  select() {
    this.tone(1650, 0.035, 'sine', 0.035);
  }
  draw() {
    this.noise(0.14, 0.16, 1400, 0, 0.8);
  }
  pop() {
    this.tone(420, 0.12, 'sine', 0.16, 0, 880);
  }
  chime() {
    this.tone(880, 0.3, 'sine', 0.1);
    this.tone(1318, 0.42, 'sine', 0.09, 0.09);
  }
  turn() {
    this.tone(740, 0.12, 'sine', 0.06);
    this.tone(988, 0.2, 'sine', 0.055, 0.09);
  }
  error() {
    this.tone(196, 0.16, 'square', 0.045);
    this.tone(165, 0.2, 'square', 0.04, 0.08);
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.09, i * 0.09));
  }
  lose() {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.07, i * 0.12));
  }
  shuffle() {
    for (let i = 0; i < 7; i++) this.noise(0.05, 0.12, 2000 + i * 120, i * 0.045, 2);
  }
}

export const sfx = new Sfx();

export function haptic(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* desteklenmiyor */
  }
}
