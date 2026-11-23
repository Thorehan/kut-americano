# Küt: Kural Okey

Küt (Amerikano) kurallarıyla oynanan okey.

101 Okey görselliğinde, okey taşlarıyla oynanan kontratlı rummy. 13 el, her elde ayrı bir kural.
Kurallar ve kararlar: [docs/ISTISARE.md](docs/ISTISARE.md)

**Durum:** Faz 3 — botlarla tekli/takım + online oda (sunucu Cloudflare'de yayında).

**Oyna:** https://thorehan.github.io/kut-americano/ (telefonda yan çevirerek)

## Çalıştırma

Gerekli: Node.js 20+

```bash
npm install
npm run dev      # http://localhost:5173 (aynı ağdaki telefondan da açılır)
npm test         # kural motoru testleri
npm run build    # apps/client/dist içine yayın çıktısı
npm run server   # online oyun sunucusu (Node): ws://localhost:2567
npm run worker   # online oyun sunucusu (Cloudflare yerel): ws://localhost:8787
```

**Modlar:** Tekli (1 + 3 bot) ya da Takım (2'ye 2). Menüdeki **Kurallar** seçimiyle **Sıralı** (1 → 11) ya da **🎲 Rastgele Mod** (her elin kuralı oranlarla çekilir; oranlar menüde ve [docs/ISTISARE.md](docs/ISTISARE.md) içinde).

Deneme parametreleri: `?mod=rastgele` → rastgele mod seçili açılır · `?el=12` → 12. elden (Elden Bitme) başlar · `?seed=42` → aynı dağıtım tekrar gelir.

## Nasıl oynanır

- **Taş seç:** taşa dokun (yukarı kalkar). **Taşı taşı:** ıstakada sürükle-bırak.
- **Çek:** sıran gelince masanın ortasındaki desteye (parlar) ya da sol alt köşedeki yan taşa dokun.
- **Masa:** herkesin açtığı perler kendi önünde durur; atılan taşlar sıradaki oyuncuya bakan köşededir. Hazırladığın perler kendi alanında yeşil (geçerli) / kırmızı (geçersiz) çerçeveyle önizlenir; ıstakadan kendi alanına sürüklediğin taş da hazırlığa eklenir.
- **Ses:** sağ üstteki **Ses** butonuyla açılıp kapanır.
- **Kural aç:** taşları seç → **Per Ekle** → (kural iki perse ikincisi de) → **Kuralı Aç**. **Öner** butonu kuralı otomatik hazırlar. Açtığın sırada **sadece kural iner**, fazlalıklar inemez.
- **Diz ve işle:** sonraki sıralarında perlerini **Per Ekle → Yere Koy** ile diz; tek taş seçip parlayan pere dokunarak (ya da sürükleyerek) işle.
- **Okeyi al:** yerdeki bir perde okeyin yerini tutan taş elindeyse seç → o pere dokun: taş okeyin yerine geçer, okey eline gelir, perin sahibine +50 ceza yazılır.
- **İşlek taş:** yerdeki bir pere işlenebilen ya da okeyin yerini tutan taş. Gerçek oyunda gösterilmez ve uyarılmaz: atarsan taş geri gelir, ortadan 1 taş daha çekersin, +50 ceza yersin ve sıra geçer.
- **Profil ve Küt Puanı (KP):** sol üstteki profil çipinden avatar, renk, istatistik, seviye ve rozetler; **Mağaza**dan KP ile taş temaları ve masa renkleri. KP oynayarak, günlük ödülle ve ödüllü video izleyerek kazanılır (video şimdilik simülasyon; mobil sürümde gerçek reklama bağlanacak). KP satılmaz.
- **Okeyle bitiş:** son taş okeyse okeyle bitiş (×2); elde sadece iki okey kaldıysa ikisi birden vurulur, çift okey (×4). Çift Eli'nde ×4 / ×8. Özel kutlama ve çarpanı adım adım gösteren el sonu ekranı var.
- **Önizleme:** `?onizleme` adresiyle tüm bitiş türleri (normal / okey / çift okey, normal el ve Çift Eli) hazır ellerle denenebilir.
- **Öğretici:** ana ekrandaki **🎓 Öğretici** (~2 dk) bir eli adım adım oynatır; ipuçları sadece orada açıktır.
- **At:** bir taş seç → **Taş At** (ya da taşı "Taş at" alanına sürükle).
- **İstek:** sıradaki oyuncu yan taşı almazsa sana sorulur: **İSTE** dersen yan taş + ortadaki üst taş gelir. Sıradaki oyuncu ortadan istek bittikten sonra çeker.
- **Toplu sürükleme:** birden çok taş seç, birini sürükle — hepsi birlikte gider (ıstakada, kendi alanında per olarak ya da bir pere işlenerek).
- **Menü:** oyun içinde Menü → ses aç/kapat, maçtan çık. Online maçtan çıkan ceza alır (KP kesintisi + 1 → 5 → 10 dk online kilidi).

## Online oyun

- **Yerelde deneme:** bir terminalde `npm run server`, diğerinde `npm run dev`. Aynı Wi-Fi'deki telefonlar `http://<bilgisayarın-IP>:5173` adresinden girip **Online Oda**'dan oda kurar/katılır.
- **Akış:** Oda Kur → 4 harfli kod (ya da **Davet Et** linki) → arkadaşlar katılır → kurucu **Başlat** der; boş koltuklarda bot oynar.
- **Kopma:** sayfa yenilense ya da bağlantı kopsa oyuncu 15 sn içinde aynı koltuğa döner; dönmezse sırasını bot oynar. Sırada 45 sn içinde oynanmazsa otomatik hamle yapılır.
- **Yerelde Cloudflare sürümü:** `npm run worker` (ws://localhost:8787). İstemciyi ona bağlamak için `apps/client/.env.local` içine `VITE_SERVER_URL=ws://localhost:8787` yaz.
- **Yayın:** sunucu Cloudflare Workers + Durable Objects üzerinde çalışır (her oda ayrı bir Durable Object; ücretsiz plan, uyumaz). Ayarlar depo kökündeki `wrangler.jsonc` dosyasında. Kurulum: Cloudflare panelinde **Workers & Pages → Create → Import a repository** → bu depo → proje adı `kut-americano` (wrangler.jsonc içindeki "name" ile aynı olmalı) → Deploy. Çıkan `https://kut-americano.<hesap>.workers.dev` adresi istemciye `wss://…` olarak verilir.

## Yapı

```
packages/core/   kural motoru (TypeScript, UI'dan bağımsız) + botlar + testler
apps/client/     Phaser 3 + Vite oyun istemcisi
apps/server/     Node WebSocket sunucusu (yerel geliştirme ve testler)
apps/worker/     Cloudflare Worker + Durable Object sunucusu (yayın)
docs/            istişare ve kural dokümanı
```
