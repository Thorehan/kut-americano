/**
 * Dosyasız, WebAudio ile üretilen yumuşak ses efektleri + titreşim.
 *
 * Ses dili: ahşap masaya konan taş "tık"ı ve marimba benzeri kısa notalar.
 * Sert gürültü patlamaları, kayan (uluyan) tonlar ve kare dalga yok; her şey
 * alçak geçiren bir filtre ve yumuşak bir sıkıştırıcıdan geçer.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
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
      const c = new AC();
      this.ctx = c;
      // ana zincir: kazanç → yumuşatıcı filtre → sıkıştırıcı → hoparlör
      const master = c.createGain();
      master.gain.value = 0.55;
      const soften = c.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 5200;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 4;
      master.connect(soften).connect(comp).connect(c.destination);
      this.out = master;
      // pembe-benzeri gürültü (yumuşak hışırtı için)
      const len = Math.floor(c.sampleRate * 0.6);
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
        d[i] = last * 6;
      }
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
    if (this.muted || !this.ctx || !this.out || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  /** Yumuşak sinüs (isteğe bağlı üst harmonikle) — zarf: hızlı atak, üstel sönüm. */
  private note(freq: number, dur: number, gain: number, when = 0, harmonic = 0) {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime + when;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out!);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (harmonic > 0) {
      const hg = c.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.exponentialRampToValueAtTime(gain * harmonic, t + 0.004);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.35);
      hg.connect(this.out!);
      const h = c.createOscillator();
      h.type = 'sine';
      h.frequency.value = freq * 4;
      h.connect(hg);
      h.start(t);
      h.stop(t + dur + 0.02);
    }
  }

  /** Marimba benzeri nota. */
  private mallet(freq: number, gain = 0.09, when = 0, dur = 0.45) {
    this.note(freq, dur, gain, when, 0.18);
  }

  /** Alçak geçiren filtreli, yumuşak açılıp kapanan hışırtı. */
  private hush(dur: number, gain: number, from: number, to: number, when = 0) {
    const c = this.ready();
    if (!c || !this.noiseBuf) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.4;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
  }

  /** Taşın ahşaba konma sesi: kısa, tok bir "tık". */
  private click(gain = 1, when = 0) {
    const j = 1 + (Math.random() - 0.5) * 0.08; // her tık biraz farklı
    this.note(1150 * j, 0.03, 0.05 * gain, when);
    this.note(260 * j, 0.07, 0.09 * gain, when);
  }

  tok() {
    this.click(1);
  }
  select() {
    this.note(1900, 0.025, 0.018);
  }
  /** Desteden çekme: kısa yumuşak kayma + konma. */
  draw() {
    this.hush(0.2, 0.05, 500, 1400);
    this.click(0.7, 0.17);
  }
  /** Taş dağıtma / dizme: art arda hafif tıklar. */
  shuffle() {
    for (let i = 0; i < 6; i++) this.click(0.45 + Math.random() * 0.25, i * 0.07 + Math.random() * 0.02);
  }
  /** Yan taş isteği. */
  pop() {
    this.mallet(784, 0.08);
    this.mallet(1047, 0.07, 0.08);
  }
  /** Okeyi alma. */
  swap() {
    this.click(0.8);
    this.mallet(659, 0.07, 0.06);
    this.mallet(988, 0.07, 0.13);
    this.mallet(1319, 0.06, 0.2);
  }
  /** Kural açma. */
  chime() {
    this.mallet(523, 0.08);
    this.mallet(659, 0.08, 0.08);
    this.mallet(784, 0.08, 0.16, 0.6);
  }
  /** Sıra sende. */
  turn() {
    this.mallet(880, 0.05, 0, 0.35);
    this.mallet(1175, 0.045, 0.1, 0.4);
  }
  /** Uyarı: yumuşak, alçak iki nota (sert vızıltı yok). */
  error() {
    this.mallet(330, 0.07, 0, 0.3);
    this.mallet(262, 0.07, 0.11, 0.35);
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.mallet(f, 0.08, i * 0.1, 0.6));
  }
  /** Okeyle bitiş fanfarı: yükselen arpej + parlak akor + hafif "parıltı". */
  fanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.mallet(f, 0.1, i * 0.08, 0.7));
    [784, 1047, 1568].forEach((f) => this.mallet(f, 0.08, 0.48, 1.3));
    this.hush(0.7, 0.025, 2500, 7000, 0.35);
  }

  /** Derin, yumuşak gong: düşük sinüsler + kısa hışırtı (sert patlama değil). */
  private gong(when = 0, gain = 1) {
    this.note(73, 1.8, 0.32 * gain, when);
    this.note(110, 1.4, 0.18 * gain, when);
    this.note(147, 1.0, 0.1 * gain, when, 0.15);
    this.hush(0.9, 0.05 * gain, 1400, 180, when);
  }

  /** Bakır üflemeli benzeri akor: üst harmonikli, daha uzun sönümlü notalar. */
  private chord(freqs: number[], when: number, dur: number, gain = 0.07) {
    freqs.forEach((f) => this.note(f, dur, gain, when, 0.32));
  }

  /** Okeyle bitiş, Çift Eli: fanfar bir oktav yukarıda ve kraliyet akoruyla kapanır. */
  fanfareRoyal() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.mallet(f, 0.1, i * 0.07, 0.7));
    this.chord([523, 784, 1047, 1319], 0.5, 1.6, 0.06);
    this.hush(0.8, 0.03, 2500, 8000, 0.4);
  }

  /**
   * Çift okey: iki taşın çarpışmasına gong, ardından "ta-ta-TAAA" büyük akor fanfarı,
   * inen parıltı ve altın şıkırtısı. Çift Eli'nde bir oktav daha üst katman eklenir.
   */
  doubleOkey(royal = false) {
    const hit = 0.5; // çarpışma anı
    this.click(2.2, hit - 0.02);
    this.gong(hit, royal ? 1.15 : 1);
    const G = [392, 494, 587];
    const C = [523, 659, 784, 1047];
    this.chord(G, hit + 0.45, 0.22, 0.06);
    this.chord(G, hit + 0.62, 0.22, 0.06);
    this.chord(C, hit + 0.82, 2.0, 0.07);
    if (royal) this.chord([1319, 1568, 2093], hit + 0.82, 1.8, 0.035);
    [2637, 2349, 2093, 1760, 1568, 1319].forEach((f, i) => this.mallet(f, 0.05, hit + 1.2 + i * 0.07, 0.5));
    this.coins(hit + 0.5, royal ? 18 : 12);
  }

  /** Dökülen altınlar: rastgele, kısa, tiz şıkırtılar. */
  coins(when = 0, n = 12) {
    for (let i = 0; i < n; i++) {
      const f = 2200 + Math.random() * 1400;
      this.note(f, 0.12, 0.025, when + i * 0.07 + Math.random() * 0.04, 0.1);
    }
  }

  /** Çarpan damgası "güm". */
  stamp() {
    this.note(98, 0.35, 0.22, 0);
    this.click(1.6, 0);
  }

  /** Çift Eli çarpanı ikiye katlanınca: yükselen iki nota + parıltı. */
  doubleUp() {
    this.mallet(784, 0.1, 0, 0.5);
    this.mallet(1568, 0.1, 0.12, 0.9);
    this.chord([784, 1175, 1568], 0.12, 1.2, 0.04);
    this.hush(0.6, 0.03, 3000, 9000, 0.1);
  }

  lose() {
    this.mallet(440, 0.06, 0, 0.45);
    this.mallet(349, 0.06, 0.15, 0.55);
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
