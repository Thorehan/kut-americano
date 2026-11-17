# Küt: Kural Okey

Küt (Amerikano) kurallarıyla oynanan okey.

101 Okey görselliğinde, okey taşlarıyla oynanan kontratlı rummy. 11 el, her elde ayrı bir kural.
Kurallar ve kararlar: [docs/ISTISARE.md](docs/ISTISARE.md)

**Durum:** Faz 3 — botlarla tekli/takım + online oda (sunucu yayına alınmayı bekliyor).

**Oyna:** https://thorehan.github.io/kut-americano/ (telefonda yan çevirerek)

## Çalıştırma

Gerekli: Node.js 20+

```bash
npm install
npm run dev      # http://localhost:5173 (aynı ağdaki telefondan da açılır)
npm test         # kural motoru testleri
npm run build    # apps/client/dist içine yayın çıktısı
npm run server   # online oyun sunucusu: ws://localhost:2567
```

**Modlar:** Tekli (1 + 3 bot) ya da Takım (2'ye 2). Menüdeki **Kurallar** seçimiyle **Sıralı** (1 → 11) ya da **🎲 Rastgele Mod** (her elin kuralı oranlarla çekilir; oranlar menüde ve [docs/ISTISARE.md](docs/ISTISARE.md) içinde).

Deneme parametreleri: `?mod=rastgele` → rastgele mod seçili açılır · `?el=10` → 10. elden (Elden Bitme) başlar · `?seed=42` → aynı dağıtım tekrar gelir.

## Nasıl oynanır

- **Taş seç:** taşa dokun (yukarı kalkar). **Taşı taşı:** ıstakada sürükle-bırak.
- **Çek:** sıran gelince masanın ortasındaki desteye (parlar) ya da sol alt köşedeki yan taşa dokun.
- **Masa:** herkesin açtığı perler kendi önünde durur; atılan taşlar sıradaki oyuncuya bakan köşededir. Hazırladığın perler kendi alanında yeşil (geçerli) / kırmızı (geçersiz) çerçeveyle önizlenir; ıstakadan kendi alanına sürüklediğin taş da hazırlığa eklenir.
- **Ses:** sağ üstteki **Ses** butonuyla açılıp kapanır.
- **Kural aç:** taşları seç → **Per Ekle** → (kural iki perse ikincisi de) → **Kuralı Aç**. **Öner** butonu kuralı otomatik hazırlar. Açtığın sırada **sadece kural iner**, fazlalıklar inemez.
- **Diz ve işle:** sonraki sıralarında perlerini **Per Ekle → Yere Koy** ile diz; tek taş seçip parlayan pere dokunarak (ya da sürükleyerek) işle.
- **Okeyi al:** yerdeki bir perde okeyin yerini tutan taş elindeyse ıstakada **mavi parlar**. Seç → mavi çerçeveli pere dokun: taş okeyin yerine geçer, okey eline gelir, perin sahibine +50 ceza yazılır.
- **İşlek taş:** yerdeki bir pere işlenebilen ya da okeyin yerini tutan taş ıstakada mavi parlar. İşlek taşı atarsan taş geri gelir, ortadan 1 taş daha çekersin, sana +50 yazılır ve sıra geçer (oyun önce uyarır).
- **At:** bir taş seç → **Taş At** (ya da taşı "Taş at" alanına sürükle).
- **İstek:** sıradaki oyuncu yan taşı almazsa sana sorulur: **İSTE** dersen yan taş + ortadan 1 taş gelir.

## Online oyun

- **Yerelde deneme:** bir terminalde `npm run server`, diğerinde `npm run dev`. Aynı Wi-Fi'deki telefonlar `http://<bilgisayarın-IP>:5173` adresinden girip **Online Oda**'dan oda kurar/katılır.
- **Akış:** Oda Kur → 4 harfli kod (ya da **Davet Et** linki) → arkadaşlar katılır → kurucu **Başlat** der; boş koltuklarda bot oynar.
- **Kopma:** sayfa yenilense ya da bağlantı kopsa oyuncu 15 sn içinde aynı koltuğa döner; dönmezse sırasını bot oynar. Sırada 45 sn içinde oynanmazsa otomatik hamle yapılır.
- **Yayına alma (bir kez):**
  1. [Render](https://render.com) hesabıyla **New → Blueprint** → bu depo. `render.yaml` sunucuyu kurar.
  2. Çıkan adresi (ör. `kut-server.onrender.com`) GitHub deposunda **Settings → Secrets and variables → Actions → Variables** altına `VITE_SERVER_URL = wss://kut-server.onrender.com` olarak ekle.
  3. Actions'tan yayını yeniden çalıştır. Ücretsiz planda sunucu 15 dk boşta kalınca uyur; ilk girişte ~1 dk sürebilir.

## Yapı

```
packages/core/   kural motoru (TypeScript, UI'dan bağımsız) + botlar + testler
apps/client/     Phaser 3 + Vite oyun istemcisi
apps/server/     WebSocket oyun sunucusu (oda, botlar, yeniden bağlanma)
docs/            istişare ve kural dokümanı
```
