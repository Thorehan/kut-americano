/**
 * Dosyasız, WebAudio ile üretilen ses efektleri + titreşim.
 *
 * Ses dili "kahvehane": kemik/bakalit taşın ahşap masaya konması, marimba ve tahta
 * vurmalılar, sıcak bakır üflemeliler ve timpani. Doğal duyulsun diye:
 *  - taş sesleri saf ton değil, filtrelenmiş kısa bir darbe + gövde rezonansı (fiziksel model),
 *  - notalar marimba gibi kısmi seslerden (1 : 3,93 : 9,2) oluşur, tokmak vuruşu da duyulur,
 *  - üflemeliler hafif akortsuz iki testere dalgasının açılan filtreden geçmesiyle çalar,
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

  /** Marimba: tokmak vuruşu + temel ses + 3,93× ve 9,2× kısmi sesler. */
  private marimba(freq: number, gain = 0.1, when = 0, dur = 0.7) {
    this.burst(when, 0.012, gain * 0.5, 'bandpass', Math.min(5000, freq * 4), 2, 0.1);
    this.partial(freq, when, dur, gain, 0.35, 0.002);
    this.partial(freq * 3.93, when, dur * 0.28, gain * 0.32, 0.3, 0.001);
    this.partial(freq * 9.2, when, dur * 0.1, gain * 0.12, 0.2, 0.001);
  }

  /** Bakır üflemeli: iki hafif akortsuz testere dalgası, açılan filtre, hafif vibrato. */
  private brass(freq: number, when: number, dur: number, gain = 0.05) {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime + when;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(freq * 1.2, t);
    f.frequency.exponentialRampToValueAtTime(Math.min(4500, freq * 5), t + 0.07);
    f.frequency.exponentialRampToValueAtTime(Math.min(3000, freq * 3), t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.06, dur - 0.18));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    this.route(g, 0.45);
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmt = c.createGain();
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(freq * 0.004, t + Math.min(0.5, dur));
    vib.connect(vibAmt);
    for (const cents of [-6, 6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      vibAmt.connect(o.frequency);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }

  private brassChord(freqs: number[], when: number, dur: number, gain = 0.035) {
    freqs.forEach((fr) => this.brass(fr, when, dur, gain));
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

  /** Küçük metal çan / jeton: uyumsuz kısmi seslerle (2,76×, 5,4×) parlak tını. */
  private bell(freq: number, when = 0, gain = 0.04, dur = 0.5) {
    this.partial(freq, when, dur, gain, 0.4, 0.001);
    this.partial(freq * 2.76, when, dur * 0.5, gain * 0.45, 0.4, 0.001);
    this.partial(freq * 5.4, when, dur * 0.25, gain * 0.2, 0.3, 0.001);
  }

  // ------------------------------------------------------------ oyun sesleri

  /** Taşın masaya konması. */
  tok() {
    this.clack(1);
  }
  /** Taş seçme / buton: çok hafif, kuru tık. */
  select() {
    this.burst(0, 0.014, 0.28, 'bandpass', 4200, 2, 0.05);
    this.partial(2100, 0, 0.035, 0.06, 0.05, 0.001);
  }
  /** Desteden çekme: taş keçeden kayar ve elde durur. */
  draw() {
    this.burst(0, 0.14, 0.035, 'bandpass', 1500, 0.9, 0.1);
    this.clack(0.28, 0.13, 1.08);
  }
  /** Taşların karılması / dağıtılması: birbirine çarpan taşlar. */
  shuffle() {
    for (let i = 0; i < 9; i++) this.clack(0.12 + Math.random() * 0.12, i * 0.055 + Math.random() * 0.03, 0.85 + Math.random() * 0.35);
  }
  /** Yan taş isteği. */
  pop() {
    this.marimba(784, 0.09);
    this.marimba(1047, 0.08, 0.09);
  }
  /** Okeyi alma. */
  swap() {
    this.clack(0.45);
    this.marimba(659, 0.08, 0.06);
    this.marimba(988, 0.08, 0.14);
    this.marimba(1319, 0.07, 0.22, 0.9);
  }
  /** Kural açma. */
  chime() {
    this.marimba(523, 0.09);
    this.marimba(659, 0.09, 0.09);
    this.marimba(784, 0.1, 0.18, 0.9);
  }
  /** Sıra sende. */
  turn() {
    this.marimba(880, 0.06, 0, 0.5);
    this.marimba(1175, 0.055, 0.11, 0.6);
  }
  /** Uyarı: yumuşak, alçak iki tahta nota. */
  error() {
    this.marimba(330, 0.09, 0, 0.4);
    this.marimba(262, 0.09, 0.12, 0.5);
  }
  /** Eli kazanma (okeysiz). */
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.marimba(f, 0.09, i * 0.1, 0.8));
    this.marimba(1319, 0.06, 0.4, 1.1);
  }
  /**
   * Normal bitiş (okeysiz): son taş masanın ortasına vurulur — müzik yok.
   * Ağır taş darbesi + masanın gümbürtüsü + ahşabın titreşimi + sıçrayan birkaç taş.
   * mine=false (başkası bitirdi) biraz daha hafif.
   */
  finish(mine = true) {
    const k = mine ? 1 : 0.7;
    this.clack(0.95 * k, 0, 0.72);
    this.partial(92, 0, 0.32, 0.32 * k, 0.25, 0.002);
    this.partial(205, 0, 0.18, 0.12 * k, 0.25, 0.002);
    this.burst(0, 0.09, 0.3 * k, 'lowpass', 650, 0.7, 0.25);
    // masadaki taşlar hafifçe sıçrayıp yerine oturur
    [0.05, 0.09, 0.14, 0.2].forEach((t, i) => this.clack((0.12 - i * 0.02) * k, t + Math.random() * 0.02, 1.1 + Math.random() * 0.25));
  }

  lose() {
    this.marimba(440, 0.08, 0, 0.6);
    this.marimba(349, 0.08, 0.16, 0.8);
  }

  /** Okey ile bitiş (×2): timpani, kısa "ta-daa" bakır, marimba parıltısı. */
  fanfare() {
    this.timpani(98, 0, 0.28);
    this.brass(392, 0.05, 0.16, 0.045);
    this.brassChord([523, 659, 784], 0.22, 1.3, 0.032);
    [1047, 1319, 1568, 2093].forEach((f, i) => this.marimba(f, 0.045, 0.35 + i * 0.07, 0.8));
  }

  /** Çift Eli'nde okey (×4): aynı fanfar, üstte bir oktav daha ve ikinci akor. */
  fanfareRoyal() {
    this.timpani(98, 0, 0.3);
    this.brass(392, 0.05, 0.16, 0.045);
    this.brassChord([523, 659, 784], 0.22, 0.6, 0.032);
    this.brassChord([698, 880, 1047], 0.82, 0.3, 0.028);
    this.brassChord([523, 659, 784, 1047], 1.1, 1.3, 0.03);
    [1047, 1319, 1568, 2093].forEach((f, i) => this.marimba(f, 0.045, 1.15 + i * 0.07, 0.8));
  }

  /**
   * Çift okey (×4): iki taşın çarpışması (timpani + taş darbesi), ardından "ta-ta-TAAA"
   * bakır fanfarı ve dökülen jetonlar. Çift Eli'nde üstte ölçülü bir oktav katmanı eklenir.
   */
  doubleOkey(royal = false) {
    const hit = 0.5; // görseldeki çarpışma anı
    this.clack(0.6, hit - 0.01, 0.8);
    this.timpani(73, hit, 0.34);
    const G = [392, 494, 587];
    const C = [523, 659, 784];
    this.brassChord(G, hit + 0.42, 0.16, 0.03);
    this.brassChord(G, hit + 0.6, 0.16, 0.03);
    this.timpani(98, hit + 0.8, 0.22);
    this.brassChord(C, hit + 0.8, 1.6, 0.033);
    if (royal) this.brass(1047, hit + 0.8, 1.5, 0.022);
    this.coins(hit + 1.0, royal ? 12 : 9);
  }

  /** Dökülen jetonlar: rastgele, kısa çan şıkırtıları. */
  coins(when = 0, n = 10) {
    for (let i = 0; i < n; i++) this.bell(2200 + Math.random() * 1200, when + i * 0.075 + Math.random() * 0.04, 0.04, 0.35);
  }

  /** Çarpan damgası: tok "güm". */
  stamp() {
    this.timpani(82, 0, 0.26);
    this.clack(0.55, 0, 0.7);
  }

  /** Çift Eli çarpanı ikiye katlanınca: yükselen beşli + çan. */
  doubleUp() {
    this.brass(523, 0, 0.18, 0.04);
    this.brass(784, 0.16, 0.7, 0.04);
    this.bell(1568, 0.16, 0.05, 0.9);
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
