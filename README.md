# Küt (Amerikano) Okey

101 Okey görselliğinde, okey taşlarıyla oynanan kontratlı rummy. 11 el, her elde ayrı bir kural.
Kurallar ve kararlar: [docs/ISTISARE.md](docs/ISTISARE.md)

**Durum:** Faz 1 — tarayıcıda deneme sürümü (1 kişi + 3 bot, tekli ve takım modu).

## Çalıştırma

Gerekli: Node.js 20+

```bash
npm install
npm run dev      # http://localhost:5173 (aynı ağdaki telefondan da açılır)
npm test         # kural motoru testleri
npm run build    # apps/client/dist içine yayın çıktısı
```

Deneme parametreleri: `?el=10` → 10. elden (Elden Bitme) başlar · `?seed=42` → aynı dağıtım tekrar gelir.

## Nasıl oynanır

- **Taş seç:** taşa dokun (yukarı kalkar). **Taşı taşı:** ıstakada sürükle-bırak.
- **Çek:** sıran gelince ortadaki desteye ya da soldaki yan taşa dokun.
- **Kural aç:** taşları seç → **Per Ekle** → (gerekirse başka per) → **Kuralı Aç**. **Öner** butonu açılabilecek perleri otomatik hazırlar.
- **İşle:** kural açtıktan sonraki sıralarında bir taş seç → parlayan pere dokun (ya da taşı pere sürükle).
- **At:** bir taş seç → **Taş At** (ya da taşı "Taş at" alanına sürükle).
- **İstek:** sıradaki oyuncu yan taşı almazsa sana sorulur: **İSTE** dersen yan taş + ortadan 1 taş gelir.

## Yapı

```
packages/core/   kural motoru (TypeScript, UI'dan bağımsız) + botlar + testler
apps/client/     Phaser 3 + Vite oyun istemcisi
docs/            istişare ve kural dokümanı
```
