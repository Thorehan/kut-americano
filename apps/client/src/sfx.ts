/**
 * Oyun sesleri: gerçek kayıtlar (CC0) — public/sfx/*.mp3, tools/build-sfx.mjs ile üretilir.
 *
 * Masa sesleri seramik çip / kart / zar kayıtlarından (Kenney), zafer müzikleri orkestral
 * parçalardan (OpenGameArt) kesilip katmanlanmıştır. Kaynaklar: tools/sfx-src/CREDITS.md
 *
 * Tarayıcılar sesi ancak bir dokunuştan sonra başlatır: ilk dokunuşta unlock() çağrılır,
 * dosyalar o anda indirilip çözülür. Yüklenmemiş bir ses sessizce atlanır.
 */

const SOUNDS = [
  'tok-1',
  'tok-2',
  'tok-3',
  'select-1',
  'select-2',
  'draw-1',
  'draw-2',
  'shuffle',
  'pop',
  'swap',
  'chime',
  'turn',
  'error',
  'lose',
  'coins',
  'stamp',
  'double-up',
  'win',
  'okey',
  'okey-royal',
  'cift-okey',
  'cift-okey-royal',
] as const;

type SoundName = (typeof SOUNDS)[number];

/** Uzun zafer parçaları: aynı anda tek biri çalar, yenisi gelince eskisi kısılır. */
const MUSIC = new Set<SoundName>(['win', 'okey', 'okey-royal', 'cift-okey', 'cift-okey-royal']);

const url = (n: SoundName) => `${import.meta.env.BASE_URL}sfx/${n}.mp3`;

interface PlayOpts {
  vol?: number;
  /** Çalma hızı (1 = normal); küçük oynamalar aynı sesin tekrarını doğal kılar. */
  rate?: number;
  /** Saniye cinsinden gecikme. */
  when?: number;
}

class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loading = false;
  private music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
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
      const master = c.createGain();
      master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 3;
      master.connect(comp).connect(c.destination);
      this.out = master;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.load();
  }

  /** Dosyaları bir kez indirip çözer (kısa sesler önce, müzikler sonra). */
  private load() {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const c = this.ctx;
    const order = [...SOUNDS].sort((a, b) => Number(MUSIC.has(a)) - Number(MUSIC.has(b)));
    void (async () => {
      for (const n of order) {
        try {
          const res = await fetch(url(n));
          if (!res.ok) continue;
          const data = await res.arrayBuffer();
          // eski Safari decodeAudioData'yı sadece geri çağırmayla destekler
          const buf = await new Promise<AudioBuffer>((ok, fail) => {
            const p = c.decodeAudioData(data, ok, fail);
            if (p && typeof p.then === 'function') p.then(ok, fail);
          });
          this.buffers.set(n, buf);
        } catch {
          /* ağ ya da çözme hatası: o ses çalmaz */
        }
      }
    })();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.stopMusic(0.2);
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

  private play(name: SoundName, o: PlayOpts = {}) {
    const c = this.ready();
    const buf = this.buffers.get(name);
    if (!c || !buf) return null;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = c.createGain();
    g.gain.value = o.vol ?? 1;
    src.connect(g).connect(this.out!);
    src.start(c.currentTime + (o.when ?? 0));
    return { src, gain: g };
  }

  /** Birkaç varyanttan rastgele birini, hafif hız oynamasıyla çalar. */
  private any(names: SoundName[], vol = 1) {
    const n = names[Math.floor(Math.random() * names.length)];
    this.play(n, { vol, rate: 0.95 + Math.random() * 0.1 });
  }

  private playMusic(name: SoundName) {
    this.stopMusic(0.25);
    const h = this.play(name);
    if (h) {
      this.music = h;
      h.src.onended = () => {
        if (this.music === h) this.music = null;
      };
    }
  }

  /** Çalan zafer müziğini yumuşakça kısar (ör. masadan çıkınca). */
  stopMusic(fade = 0.4) {
    const m = this.music;
    const c = this.ctx;
    this.music = null;
    if (!m || !c) return;
    const t = c.currentTime;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    try {
      m.src.stop(t + fade + 0.05);
    } catch {
      /* zaten durmuş */
    }
  }

  /** Taşın masaya konması. */
  tok() {
    this.any(['tok-1', 'tok-2', 'tok-3']);
  }
  /** Taş seçme / buton. */
  select() {
    this.any(['select-1', 'select-2'], 0.8);
  }
  /** Desteden çekme. */
  draw() {
    this.any(['draw-1', 'draw-2']);
  }
  /** Taşların karılması / dağıtılması. */
  shuffle() {
    this.play('shuffle');
  }
  /** Yan taş isteği. */
  pop() {
    this.play('pop');
  }
  /** Okeyi alma. */
  swap() {
    this.play('swap');
  }
  /** Kural açma. */
  chime() {
    this.play('chime');
  }
  /** Sıra sende. */
  turn() {
    this.play('turn');
  }
  /** Uyarı. */
  error() {
    this.play('error');
  }
  /** Eli (okeysiz) kazanma. */
  win() {
    this.playMusic('win');
  }
  lose() {
    this.play('lose');
  }
  /** Okey ile bitiş (×2). */
  fanfare() {
    this.playMusic('okey');
  }
  /** Çift Eli'nde okey ile bitiş (×4). */
  fanfareRoyal() {
    this.playMusic('okey-royal');
  }
  /** Çift okey: çarpışma çanı + zafer fanfarı (Çift Eli'nde daha büyük final). */
  doubleOkey(royal = false) {
    this.playMusic(royal ? 'cift-okey-royal' : 'cift-okey');
  }
  /** Dökülen çipler (ödül). */
  coins() {
    this.play('coins');
  }
  /** Çarpan damgası. */
  stamp() {
    this.play('stamp', { vol: 0.9 });
  }
  /** Çift Eli çarpanı ikiye katlanınca. */
  doubleUp() {
    this.play('double-up');
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
