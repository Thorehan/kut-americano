# Mobil uygulama (Android / iOS)

Uygulama, web oyununun Capacitor ile paketlenmiş halidir. Proje: `apps/client/android`
(iOS sonra eklenecek). Uygulama kimliği **`com.kuralokey.app`** — mağazaya ilk yüklemeden sonra değiştirilemez.

## Deneme APK'sını telefona kurmak

1. GitHub'da depo → **Actions** → **Android derlemesi** → en son yeşil çalıştırma.
2. Sayfanın altındaki **Artifacts** bölümünden **kut-android-apk** dosyasını indir (zip).
3. Zip'ten çıkan `app-debug.apk` dosyasını Android telefona at (kablo, Drive, Telegram…).
4. Telefonda dosyaya dokun; "bilinmeyen kaynaklardan yükleme" izni istenirse ver → **Yükle**.

Bu deneme sürümüdür (debug): Play Store'a yüklenmez, sadece kendi telefonunda denemek içindir.
Her push'ta yenisi üretilir; eskisinin üstüne kurulur.

## Play Store'a yükleme için gerekenler

1. **Google Play Console** hesabı (kişisel, tek seferlik 25 $). Kimlik doğrulaması birkaç gün sürebilir.
2. **Yükleme anahtarı (upload key):** Play'e gönderilen paketi imzalar. Kaybolursa Play Console'dan
   sıfırlatılabilir (Play App Signing açık olduğu için asıl imza anahtarını Google saklar).
   - Anahtar dosyası ve şifresi **depoya konmaz**; güvenli bir yerde (ör. şifre yöneticisi) saklanır.
3. GitHub → depo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `KUT_KEYSTORE_BASE64` — anahtar dosyasının base64 hali
   - `KUT_KEYSTORE_PASSWORD`, `KUT_KEY_ALIAS`, `KUT_KEY_PASSWORD`
4. Bunlar eklenince her derlemede **kut-android-aab** (imzalı) de üretilir → Play Console'da
   **Test → Kapalı test** sürümüne yüklenir.

## Uygulamada neler hazır

- Yatay ekran kilidi, tam ekran (durum ve gezinme çubukları gizli; kenardan kaydırınca görünür)
- Oyun sırasında ekran kararmaz
- Android geri tuşu: masada oyun menüsünü açar, açık pencereyi kapatır; ana menüde uygulamayı arka plana alır
- Uygulama arka plana alınınca ses durur
- Yerel titreşim

## Sırada

- Uygulama ikonu ve açılış ekranı (şu an Capacitor'ın varsayılanı)
- iOS projesi (Mac yok → GitHub Actions macOS ya da Codemagic)
- Davet linkiyle uygulamayı açma (kuralokey.com üzerinden)
