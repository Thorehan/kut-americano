# Küt (Amerikano) Okey

101 Okey görselliğinde, okey taşlarıyla oynanan kontratlı rummy. 11 el, her elde ayrı bir kural.
Kurallar ve kararlar: [docs/ISTISARE.md](docs/ISTISARE.md)

**Durum:** Faz 2 — tarayıcıda deneme sürümü (1 kişi + 3 bot, tekli ve takım modu).

**Oyna:** https://thorehan.github.io/kut-americano/ (telefonda yan çevirerek)

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
- **Çek:** sıran gelince masanın ortasındaki desteye (parlar) ya da sol alt köşedeki yan taşa dokun.
- **Masa:** herkesin açtığı perler kendi önünde durur; atılan taşlar sıradaki oyuncuya bakan köşededir. Hazırladığın perler kendi alanında yeşil (geçerli) / kırmızı (geçersiz) çerçeveyle önizlenir; ıstakadan kendi alanına sürüklediğin taş da hazırlığa eklenir.
- **Ses:** sağ üstteki **Ses** butonuyla açılıp kapanır.
- **Kural aç:** taşları seç → **Per Ekle** → (kural iki perse ikincisi de) → **Kuralı Aç**. **Öner** butonu kuralı otomatik hazırlar. Açtığın sırada **sadece kural iner**, fazlalıklar inemez.
- **Diz ve işle:** sonraki sıralarında perlerini **Per Ekle → Yere Koy** ile diz; tek taş seçip parlayan pere dokunarak (ya da sürükleyerek) işle.
- **At:** bir taş seç → **Taş At** (ya da taşı "Taş at" alanına sürükle).
- **İstek:** sıradaki oyuncu yan taşı almazsa sana sorulur: **İSTE** dersen yan taş + ortadan 1 taş gelir.

## Yapı

```
packages/core/   kural motoru (TypeScript, UI'dan bağımsız) + botlar + testler
apps/client/     Phaser 3 + Vite oyun istemcisi
docs/            istişare ve kural dokümanı
```
