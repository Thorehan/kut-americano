#!/usr/bin/env node
/**
 * Oyun görsellerini OpenAI görsel API'siyle üretir.
 *
 *   node tools/gen-art.mjs             → eksik görselleri üret
 *   node tools/gen-art.mjs --force     → hepsini yeniden üret
 *   node tools/gen-art.mjs --only=bg-menu,emblem
 *   node tools/gen-art.mjs --list      → listeyi göster, üretme
 *
 * Anahtar: depo kökündeki .env.local içinde OPENAI_API_KEY=... (git'e girmez)
 * ya da ortam değişkeni. Model: OPENAI_IMAGE_MODEL (varsayılan gpt-image-2).
 * Çıktı: apps/client/public/art/<id>.png
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/client/public/art');

function loadEnv() {
  const f = join(root, '.env.local');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv();
const args = process.argv.slice(2);
const force = args.includes('--force');
const listOnly = args.includes('--list');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
// gpt-image-2 saydam arka planı desteklemiyor: saydam parçalar (ikon, amblem, süs) bu modelle üretilir.
const modelTransparent = process.env.OPENAI_IMAGE_MODEL_TRANSPARENT || 'gpt-image-1.5';
const spec = JSON.parse(readFileSync(join(root, 'tools/art-prompts.json'), 'utf8'));

const todo = spec.assets.filter((a) => (!only || only.includes(a.id)) && (force || !existsSync(join(outDir, `${a.id}.png`))));

if (listOnly) {
  for (const a of spec.assets) console.log(`${existsSync(join(outDir, `${a.id}.png`)) ? '✓' : '·'} ${a.id.padEnd(16)} ${a.size} ${a.background}`);
  process.exit(0);
}
if (!todo.length) {
  console.log('Üretilecek görsel yok (hepsi mevcut). Yeniden üretmek için --force.');
  process.exit(0);
}
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY bulunamadı. Depo kökünde .env.local dosyasına OPENAI_API_KEY=... satırını ekle.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

async function generate(a) {
  const transparent = a.background === 'transparent';
  const body = {
    model: transparent ? modelTransparent : model,
    prompt: `${spec.style}\n\n${a.prompt}`,
    size: a.size,
    n: 1,
    quality: 'high',
    background: transparent ? 'transparent' : 'opaque',
    output_format: 'png',
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.data?.[0]?.b64_json) {
      writeFileSync(join(outDir, `${a.id}.png`), Buffer.from(json.data[0].b64_json, 'base64'));
      return;
    }
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || res.status === 400) throw new Error(msg);
    console.warn(`  ${a.id}: deneme ${attempt} başarısız (${msg}), tekrar…`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error('3 denemede üretilemedi');
}

console.log(`Model: ${model} (saydam: ${modelTransparent}) · ${todo.length} görsel üretilecek → apps/client/public/art/`);
let ok = 0;
// Aynı anda en fazla 3 istek
const queue = [...todo];
await Promise.all(
  Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const t0 = Date.now();
      try {
        await generate(a);
        ok++;
        console.log(`✓ ${a.id} (${Math.round((Date.now() - t0) / 1000)} sn)`);
      } catch (e) {
        console.error(`✗ ${a.id}: ${e.message}`);
      }
    }
  }),
);
console.log(`${ok}/${todo.length} görsel üretildi.`);
process.exit(ok === todo.length ? 0 : 1);
