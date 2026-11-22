# Görsel kimlik: "Kahvehane Premium"

Okey'in doğal mekânı kahvehane ve ev masası. Hedef: sıcak, el yapımı, kaliteli bir masa oyunu hissi — "AI şablonu" gibi duran düz, parlak, yuvarlak köşeli kutular yerine **malzeme** hissi (ahşap, pirinç, emaye, çuha, çini).

## Malzemeler ve renkler
| Rol | Malzeme | Renk |
|---|---|---|
| Zemin | koyu ceviz ahşap, loş sıcak ışık | `#2a170b` → `#5a3418` |
| Masa | yeşil çuha (temalarla değişir) | `#1b7349` |
| Çerçeve / kenar | fırçalanmış pirinç | `#c9a24a` gölge `#7a5a1c` parlama `#f6dc8f` |
| Ana buton | yeşil emaye + pirinç çerçeve | `#2f7d4f` |
| İkincil buton | ceviz ahşap + pirinç çerçeve | `#6b4423` |
| Tehlike / ceza | nar kırmızısı emaye | `#a8323a` |
| Vurgu | çini turkuaz / lacivert | `#2a9d8f` / `#1f4f7a` |
| Yazı | krem, koyu kabartma gölgeli | `#f6ecd6` |

## Biçim kuralları
- **Butonlar:** düz renk yok. Pirinç çerçeve (2 kademe: koyu dış hat + parlak iç hat), içi emaye ya da ahşap; üstte yumuşak ışık, altta gölge. Basınca içe göçer (gölge kalkar, 2 px aşağı iner).
- **Paneller:** koyu ceviz çerçeve, pirinç iç çizgi, köşelerde küçük pirinç süs; içi deri/çuha koyuluğunda.
- **Başlıklar:** serif, kabartmalı (Fraunces). Gövde yazıları okunaklılık için Nunito kalır.
- **Süs:** çini geometrik motif (8 köşeli yıldız geçmesi) sadece ince şeritlerde ve başlık altlarında; dini sembol kullanılmaz.
- **İkonlar:** pirinç, kabartma; tek renk silüet + ışık.
- **Yapay zekâ görselleri:** sadece doku, arka plan, süs, amblem ve ikon için. **Görselde yazı olmaz** (Türkçe harfler bozuluyor); yazılar oyunda fontla basılır.

## Üretim
- Komutlar: `tools/art-prompts.json`
- Betik: `node tools/gen-art.mjs` (eksik olanları üretir), `--force` hepsini yeniden üretir, `--only=id1,id2` seçili olanları.
- Anahtar: depo kökünde `.env.local` dosyasına `OPENAI_API_KEY=...` (git'e girmez). Model `OPENAI_IMAGE_MODEL` ile değiştirilebilir.
- Çıktı: `apps/client/public/art/*.png` — oyun bu dosyalar varsa onları, yoksa koddaki çizimleri kullanır.
