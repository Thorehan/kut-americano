# Alan adı alma ve sunucuya bağlama

## Neden gerekli (mobil uygulama için de)

Oyun bir **mobil uygulama** olacak (App Store + Google Play). Tarayıcı sürümü sadece uygulama çıkana
kadar deneme kanalı. Ama uygulama da online oyun için aynı sunucuya internetten bağlanır:

- Sunucu şu an `kut-americano.torehan-anbarli.workers.dev` adresinde. Türkiye'deki internet sağlayıcıları
  `*.workers.dev` adreslerini engelliyor → **uygulamada da** Türkiye'den bağlanılamaz.
- Kendi alan adımızla (`api.kuralokey.com` gibi) bu engel kalkar.
- Mağazalar ayrıca **gizlilik politikası** ve **destek** adresi ister → `kuralokey.com/gizlilik`,
  `kuralokey.com/destek` sayfaları aynı alan adında durur.

## Hangi alan adı

22.11.2026'da boş olduğu kontrol edilenler:

| Alan adı | Not |
|---|---|
| **kuralokey.com** | Önerilen: oyunun adıyla aynı ("Küt: Kural Okey"), kısa |
| kutkuralokey.com | Tam ad, biraz uzun |
| kutoyun.com | Kısa ama daha genel |

(`kutokey.com` ve `kutokey.app` başkasına ait.)

## Nereden: Cloudflare (önerilen)

Sunucu zaten Cloudflare'de. Alan adını Cloudflare'den almak:
- Ek ücret yok (maliyetine satış, `.com` yıllık yaklaşık 10–11 $),
- DNS ve sunucu bağlantısını aynı panelde tek tıkla yapar,
- Ayrıca nameserver değiştirme vb. gerekmez.

### Adımlar (ödeme kısmını sen yaparsın)

1. https://dash.cloudflare.com adresine gir (sunucuyu kurduğun hesap).
2. Sol menü: **Domain Registration → Register Domains** (Türkçe arayüzde *Alan Adı Kaydı → Alan Adlarını Kaydet*).
   Doğrudan: https://dash.cloudflare.com/?to=/:account/domains/register
3. Arama kutusuna `kuralokey.com` yaz → **Purchase / Satın al**.
4. Süre: 1 yıl yeterli. **Auto-renew (otomatik yenileme) açık** kalsın; süre biterse oyun bağlanamaz.
5. İletişim bilgileri: Cloudflare WHOIS gizliliği ücretsiz ve varsayılan açık (adresin herkese görünmez).
6. Ödeme: kayıtlı kart / sanal kart.
7. Birkaç dakika içinde alan adı **Websites** listesinde "Active" görünür.

**Durum (22.11.2026):** `kuralokey.com` Cloudflare üzerinden alındı; sunucu `api.kuralokey.com` adresine bağlandı.

## Bağlama (Claude yapar)

1. `wrangler.jsonc` → `"routes": [{ "pattern": "api.kuralokey.com", "custom_domain": true }]`
   (Cloudflare DNS kaydını ve SSL sertifikasını otomatik oluşturur.)
2. İstemci: `PROD_SERVER_URL = 'wss://api.kuralokey.com'` (workers.dev yedek olarak kalır).
3. Push → Cloudflare Workers Builds otomatik yayınlar.
4. Türkiye'den test: `https://api.kuralokey.com/` → "kut-server ok (cloudflare)".
5. Sonra (mağaza adımında): `kuralokey.com/gizlilik`, `/destek`, `/hesap-silme` sayfaları.

İzinli kaynaklar (`ALLOWED_ORIGINS`) şimdiden mobil uygulamanın WebView adreslerini de içeriyor:
`capacitor://localhost` (iOS) ve `https://localhost` (Android).
