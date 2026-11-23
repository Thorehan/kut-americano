/**
 * Dosyasız, WebAudio ile üretilen ses efektleri + titreşim.
 *
 * Ses dili "kahvehane": sadece fiziksel sesler — kemik/bakalit taşın ahşap masaya konması,
 * masaya vuruş, sıçrayan taşlar, tok damga. Müzikal nota yok. Doğal duyulsun diye:
 *  - taş sesleri saf ton değil, filtrelenmiş kısa bir darbe + gövde rezonansı (fiziksel model),
 *  - hepsi kısa, karanlık bir oda yankısından geçer (kuru/steril değil).
 * Sürekli çalan hiçbir şey yoktur: ses bitince grafik sessizdir (arka plan hışırtısı yok).
 */
class Sfx {
  private ctx: AudioContext | null = null;
  /** Kuru yol (doğrudan). */
  private out: GainNode | null = null;
  /** Yankı gönderimi. */
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
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
      // ana zincir: kuru + yankı → yumuşatıcı → sınırlayıcı (sadece tepe; sessizliği yükseltmez)
      const bus = c.createGain();
      bus.gain.value = 0.6;
      const soften = c.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 7000;
      const limit = c.createDynamicsCompressor();
      limit.threshold.value = -4;
      limit.knee.value = 6;
      limit.ratio.value = 8;
      limit.attack.value = 0.003;
      limit.release.value = 0.15;
      bus.connect(soften).connect(limit).connect(c.destination);

      const dry = c.createGain();
      dry.connect(bus);
      this.out = dry;

      // kısa, karanlık oda yankısı (üretilmiş dürtü tepkisi)
      const verb = c.createConvolver();
      verb.buffer = this.impulse(c, 0.9, 3.2);
      const verbTone = c.createBiquadFilter();
      verbTone.type = 'lowpass';
      verbTone.frequency.value = 3200;
      const wetGain = c.createGain();
      wetGain.gain.value = 0.22;
      const send = c.createGain();
      send.connect(verb).connect(verbTone).connect(wetGain).connect(bus);
      this.wet = send;

      // beyaz gürültü (darbe ve fırça sesleri için; her seferinde kısa pencere kullanılır)
      const len = Math.floor(c.sampleRate * 1);
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Üstel sönen stereo gürültü → yankı dürtüsü. */
  private impulse(c: AudioContext, sec: number, decay: number) {
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
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

  /** Bir sesi kuru yola ve (isteğe bağlı oranda) yankıya bağlar. */
  private route(node: AudioNode, send = 0.3) {
    node.connect(this.out!);
    if (send > 0 && this.wet) {
      const s = this.ctx!.createGain();
      s.gain.value = send;
      node.connect(s).connect(this.wet);
    }
  }

  // ------------------------------------------------------------ yapı taşları

  /** Kısa, filtrelenmiş gürültü darbesi (vuruş/temas). */
  private burst(when: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1, send = 0.2) {
    const c = this.ready();
    if (!c || !this.noise) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.route(g, send);
    src.start(t, Math.random() * 0.8, dur + 0.05);
  }

  /** Sönümlü sinüs (rezonans / kısmi ses). */
  private partial(freq: number, when: number, dur: number, gain: number, send = 0.3, attack = 0.003) {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.route(g, send);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Taşın ahşap masaya konması: tık (temas) + taşın gövde tınısı + masanın tok sesi. */
  private clack(gain = 1, when = 0, pitch = 1) {
    gain *= 2.8;
    const j = pitch * (1 + (Math.random() - 0.5) * 0.12);
    this.burst(when, 0.018, 0.22 * gain, 'bandpass', 3200 * j, 1.4, 0.12);
    this.partial(1650 * j, when, 0.045, 0.05 * gain, 0.15, 0.001);
    this.partial(920 * j, when, 0.07, 0.07 * gain, 0.15, 0.001);
    this.partial(170 * j, when, 0.09, 0.16 * gain, 0.1, 0.002);
  }

  /** Timpani: derin, hafif aşağı kayan gövde + deri vuruşu. */
  private timpani(freq: number, when = 0, gain = 0.3) {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g);
    this.route(g, 0.4);
    o.start(t);
    o.stop(t + 1.4);
    this.partial(freq * 1.5, when, 0.5, gain * 0.25, 0.3);
    this.burst(when, 0.06, gain * 0.35, 'lowpass', 900, 0.7, 0.3);
  }

  /**
   * Yumuşak koyma: taş keçeye/ıstakaya usulca konur. Kulağı yoran tiz temas tıkı yok;
   * sadece boğuk orta frekans ve kısa gövde sesi. Her hamlede çalar, bu yüzden kısık.
   */
  private tap(gain = 1, when = 0, pitch = 1) {
    const j = pitch * (1 + (Math.random() - 0.5) * 0.1);
    this.burst(when, 0.025, 0.09 * gain, 'bandpass', 1300 * j, 0.8, 0.08);
    this.partial(480 * j, when, 0.05, 0.035 * gain, 0.08, 0.002);
    this.partial(150 * j, when, 0.07, 0.07 * gain, 0.05, 0.003);
  }

  /** Masaya tok bir vuruş: gövde gümbürtüsü + ahşap titreşimi + kısa boğuk darbe. */
  private thump(gain = 1, when = 0, low = 92) {
    this.partial(low, when, 0.32, 0.32 * gain, 0.25, 0.002);
    this.partial(low * 2.23, when, 0.18, 0.12 * gain, 0.25, 0.002);
    this.burst(when, 0.09, 0.3 * gain, 'lowpass', 650, 0.7, 0.25);
  }

  /** Masadaki birkaç taşın sıçrayıp yerine oturması. */
  private rattle(n: number, when: number, gain = 0.12, spread = 0.05) {
    for (let i = 0; i < n; i++) {
      const g = gain * (1 - (i / n) * 0.6);
      this.clack(g, when + i * spread + Math.random() * 0.02, 1.05 + Math.random() * 0.35);
    }
  }

  // ------------------------------------------------------------ oyun sesleri
  // Hepsi fiziksel: taş, masa, ahşap. Müzikal nota (marimba, fanfar, çan) yok.

  /** Taşın masaya konması (her hamle): yumuşak ve kısık. Sert vuruş sadece bitişte. */
  tok() {
    this.tap(2.5);
  }
  /** Taş seçme / buton: çok hafif, kuru tık. */
  select() {
    this.burst(0, 0.014, 0.28, 'bandpass', 4200, 2, 0.05);
    this.partial(2100, 0, 0.035, 0.06, 0.05, 0.001);
  }
  /** Desteden çekme: taş keçeden kayar ve elde durur. */
  draw() {
    this.burst(0, 0.14, 0.035, 'bandpass', 1500, 0.9, 0.1);
    this.tap(0.9, 0.13, 1.05);
  }
  /** Taşların karılması / dağıtılması: birbirine çarpan taşlar. */
  shuffle() {
    for (let i = 0; i < 9; i++) this.tap(0.5 + Math.random() * 0.4, i * 0.055 + Math.random() * 0.03, 0.85 + Math.random() * 0.35);
  }
  /** Yan taş isteği / küçük bildirim: iki hafif taş tıkı. */
  pop() {
    this.tap(1.2, 0, 1.1);
    this.tap(1, 0.09, 1.25);
  }
  /** Okeyi alma: taş yerine oturur, okey çekilip alınır. */
  swap() {
    this.tap(1.4, 0, 0.95);
    this.burst(0.07, 0.1, 0.03, 'bandpass', 1700, 0.9, 0.1);
    this.tap(1.1, 0.17, 1.1);
  }
  /** Kural açma / ödül: perin taşları art arda masaya dizilir. */
  chime() {
    [0, 0.07, 0.14, 0.21].forEach((t, i) => this.tap(1.1 + i * 0.1, t, 0.95 + i * 0.04));
  }
  /** Sıra sende: masaya iki hafif parmak vuruşu ("tık tık"). */
  turn() {
    this.thump(0.25, 0, 140);
    this.tap(0.9, 0, 0.8);
    this.thump(0.22, 0.13, 140);
    this.tap(0.8, 0.13, 0.8);
  }
  /** Uyarı: boğuk, alçak tek vuruş. */
  error() {
    this.thump(0.4, 0, 78);
    this.clack(0.25, 0, 0.6);
  }
  /** Kazanma (oyun sonu / öğretici / mağaza): taş vuruşu + dökülen çipler. */
  win() {
    this.finish(true);
    this.coins(0.25, 8);
  }
  lose() {
    this.thump(0.8, 0, 85);
  }

  /**
   * Normal bitiş (okeysiz): son taş masanın ortasına vurulur — müzik yok.
   * mine=false (başkası bitirdi) biraz daha hafif.
   */
  finish(mine = true) {
    const k = mine ? 1 : 0.7;
    this.clack(0.95 * k, 0, 0.72);
    this.thump(k, 0);
    this.rattle(4, 0.05, 0.12 * k);
  }

  /** Okey ile bitiş (×2): okey taşı daha ağır vurulur, masa sarsılır, taşlar sıçrar. */
  fanfare() {
    this.clack(1.1, 0, 0.66);
    this.thump(1.25, 0, 82);
    this.timpani(73, 0, 0.18);
    this.rattle(6, 0.05, 0.14);
  }

  /** Çift Eli'nde okey (×4): aynı vuruş, damga anında ikinci bir tok darbe gelir (doubleUp). */
  fanfareRoyal() {
    this.fanfare();
  }

  /**
   * Çift okey (×4): iki okeyin çarpışması (taş darbesi + timpani), ardından sadece
   * masadaki taşların sıçrayıp oturması — müzik yok. Çift Eli'nde çarpışma biraz daha ağır.
   */
  doubleOkey(royal = false) {
    const hit = 0.5; // görseldeki çarpışma anı
    this.clack(0.6, hit - 0.01, 0.8);
    this.timpani(73, hit, royal ? 0.4 : 0.34);
    this.thump(royal ? 0.9 : 0.7, hit, 80);
    this.rattle(7, hit + 0.06, 0.13, 0.045);
  }

  /** Dökülen çipler: birbirine çarpan küçük taş sesleri. */
  coins(when = 0, n = 10) {
    for (let i = 0; i < n; i++) this.tap(0.6 + Math.random() * 0.4, when + i * 0.06 + Math.random() * 0.03, 1.3 + Math.random() * 0.4);
  }

  /** Çarpan damgası: tok "güm". */
  stamp() {
    this.timpani(82, 0, 0.26);
    this.clack(0.55, 0, 0.7);
  }

  /** Çift Eli çarpanı ikiye katlanınca: ikinci, daha ağır damga. */
  doubleUp() {
    this.timpani(65, 0, 0.3);
    this.thump(0.8, 0, 70);
    this.clack(0.6, 0, 0.62);
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
