#!/usr/bin/env node
/**
 * Oyun seslerini üretir: tools/sfx-src içindeki gerçek kayıtları (CC0) keser, katmanlar,
 * ses seviyesini dengeler ve apps/client/public/sfx/*.mp3 olarak yazar.
 * MP3 seçildi: iOS (WKWebView), Android WebView ve masaüstü tarayıcıların hepsi çalar.
 *
 *   node tools/build-sfx.mjs            → hepsini üret
 *   node tools/build-sfx.mjs okey tok-1 → sadece bunları
 *
 * Kaynaklar ve lisanslar: tools/sfx-src/CREDITS.md
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'tools', 'sfx-src');
const OUT = join(root, 'apps', 'client', 'public', 'sfx');

const K = (n) => join(SRC, 'kenney', `${n}.ogg`);
const O = (n) => join(SRC, 'opengameart', n);

/**
 * Katman: src dosyası, [start] sn'den başlayıp [dur] sn alınır, [at] sn gecikmeyle çalar.
 * vol: doğrusal kazanç · fadeIn/fadeOut: sn.
 * Ses: music=true → stereo 128 kbps + loudness normalizasyonu; değilse mono 96 kbps.
 */
const L = (src, o = {}) => ({ src, start: 0, dur: null, at: 0, vol: 1, fadeIn: 0, fadeOut: 0, ...o });

const SOUNDS = {
  // --- masa: taşlar seramik/kemik çip gibi ahşap-çuha üstünde
  'tok-1': [L(K('chip-lay-1'))],
  'tok-2': [L(K('chip-lay-2'))],
  'tok-3': [L(K('chip-lay-3'))],
  'select-1': [L(K('chips-collide-3'), { vol: 0.55 })],
  'select-2': [L(K('chips-collide-4'), { vol: 0.55 })],
  'draw-1': [L(K('card-slide-1'), { vol: 0.8 })],
  'draw-2': [L(K('card-slide-4'), { vol: 0.8 })],
  shuffle: [L(K('dice-shake-1'), { vol: 0.9, fadeOut: 0.3 })],
  pop: [L(K('card-fan-1'), { vol: 0.8 })],
  swap: [L(K('chips-collide-1')), L(K('chip-lay-2'), { at: 0.09, vol: 0.9 })],
  chime: [L(K('confirmation_002'), { vol: 0.55 })],
  turn: [L(K('confirmation_001'), { vol: 0.5 })],
  error: [L(K('error_003'), { vol: 0.5 })],
  lose: [L(K('card-shove-2'), { vol: 0.9 })],
  coins: [
    L(K('chips-stack-1')),
    L(K('chips-stack-3'), { at: 0.13 }),
    L(K('chips-stack-5'), { at: 0.27 }),
    L(K('chips-stack-1'), { at: 0.42, vol: 0.8 }),
    L(K('chips-stack-3'), { at: 0.58, vol: 0.7 }),
  ],
  stamp: [L(K('impactPlate_heavy_000'), { vol: 1 })],
  'double-up': [L(K('impactBell_heavy_002')), L(K('chips-stack-3'), { at: 0.1, vol: 0.8 }), L(K('chips-stack-5'), { at: 0.25, vol: 0.7 })],

  // --- zafer müzikleri (orkestral, CC0)
  // el kazanma (okeysiz): kısa, sıcak melodi
  win: { music: true, layers: [L(O('winmelody.ogg'), { dur: 3.4, fadeOut: 1.3, vol: 0.8 })] },
  // okey ile bitiş ×2: bakır + zil fanfarının dorukla biten son bölümü
  okey: { music: true, layers: [L(K('impactBell_heavy_003'), { vol: 0.6 }), L(O('fanfare.ogg'), { start: 3.5, dur: 6.2, fadeOut: 1.6, at: 0.15 })] },
  // Çift Eli'nde okey ×4: yaylılar + kornolarla daha geniş final
  'okey-royal': {
    music: true,
    layers: [L(K('impactBell_heavy_003'), { vol: 0.6 }), L(O('triumphant.mp3'), { start: 19.0, dur: 7.2, fadeIn: 0.15, fadeOut: 1.4, at: 0.1 })],
  },
  // çift okey ×4: iki okey çarpışınca çan, ardından tam zafer fanfarı ve dökülen altınlar
  'cift-okey': {
    music: true,
    layers: [
      L(K('impactBell_heavy_000'), { at: 0.5, vol: 1 }),
      L(K('impactPlate_heavy_000'), { at: 0.5, vol: 0.7 }),
      L(O('Heavy_ConceptB.mp3'), { dur: 9.0, fadeOut: 2.0, at: 0.75 }),
      L(K('chips-stack-1'), { at: 1.4, vol: 0.5 }),
      L(K('chips-stack-3'), { at: 1.55, vol: 0.45 }),
      L(K('chips-stack-5'), { at: 1.72, vol: 0.4 }),
    ],
  },
  // Çift Eli'nde çift okey ×8: en büyüğü — çift çan, orkestranın doruk finali
  'cift-okey-royal': {
    music: true,
    layers: [
      L(K('impactBell_heavy_000'), { at: 0.5, vol: 1 }),
      L(K('impactBell_heavy_001'), { at: 0.56, vol: 0.7 }),
      L(K('impactPlate_heavy_000'), { at: 0.5, vol: 0.8 }),
      L(O('Excitement_0.ogg'), { start: 22.0, dur: 8.0, fadeIn: 0.2, fadeOut: 1.0, at: 0.75 }),
      L(K('chips-stack-1'), { at: 1.4, vol: 0.5 }),
      L(K('chips-stack-3'), { at: 1.55, vol: 0.45 }),
      L(K('chips-stack-5'), { at: 1.72, vol: 0.4 }),
    ],
  },
};

function build(name, spec) {
  const music = !Array.isArray(spec) && spec.music;
  const layers = Array.isArray(spec) ? spec : spec.layers;
  const args = ['-v', 'error', '-y'];
  layers.forEach((l) => {
    if (l.start) args.push('-ss', String(l.start));
    if (l.dur) args.push('-t', String(l.dur));
    args.push('-i', l.src);
  });
  const parts = layers.map((l, i) => {
    const f = ['aformat=sample_rates=44100:channel_layouts=stereo', `volume=${l.vol}`];
    if (l.fadeIn) f.push(`afade=t=in:d=${l.fadeIn}`);
    if (l.fadeOut && l.dur) f.push(`afade=t=out:st=${Math.max(0, l.dur - l.fadeOut)}:d=${l.fadeOut}`);
    if (l.at) f.push(`adelay=${Math.round(l.at * 1000)}:all=1`);
    return `[${i}:a]${f.join(',')}[a${i}]`;
  });
  const mix = layers.length > 1 ? `${layers.map((_, i) => `[a${i}]`).join('')}amix=inputs=${layers.length}:normalize=0:duration=longest` : '[a0]anull';
  const post = music ? 'loudnorm=I=-15:TP=-1.5:LRA=11,aresample=44100' : 'alimiter=limit=0.89';
  const filter = `${parts.join(';')};${mix},${post}[out]`;
  const out = join(OUT, `${name}.mp3`);
  args.push('-filter_complex', filter, '-map', '[out]');
  if (music) args.push('-ac', '2', '-b:a', '128k');
  else args.push('-ac', '1', '-b:a', '96k');
  args.push('-codec:a', 'libmp3lame', out);
  execFileSync(ffmpeg, args);
  return statSync(out).size;
}

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
let total = 0;
for (const [name, spec] of Object.entries(SOUNDS)) {
  if (only.length && !only.includes(name)) continue;
  const size = build(name, spec);
  total += size;
  console.log(`✓ ${name.padEnd(16)} ${(size / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`toplam ${(total / 1024).toFixed(0)} KB → apps/client/public/sfx/`);
