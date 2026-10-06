# Kırmızı İSG Professional — React Native Entegrasyon Kılavuzu

Sürüm: App Shell **v4.42.0** · Admin **v1.8.0** · Tarih: 06.10.2026

Bu belge, web'de yayında olan **Kırmızı İSG Professional** uygulamasının (Akış, Uzmanlar, Hizmet Bul, Profil, Alanlar,
Kaydedilenler, Onaylı hesap) mevcut **Kırmızı İSG React Native** uygulamasına eklenmesi içindir.

---

## 1. Teslim edilen dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `kisg-professional-app.html` | **Kaynak kod.** Tüm açıklama notları ve sürüm geçmişi buradadır. Değişiklik bu dosyada yapılır. |
| `dist/kisg-professional-app-v{sürüm}.html` | **Yayın dosyası** (`npm run build` üretir). Küçültülmüştür; Hostinger'a ve WebView'a bu konur. Elle düzenlenmez. |
| `kisg-pro-admin.html` | Yönetim paneli (`/pro-admin`). Uygulamaya girmez; yalnız web. |
| `kisg-yasal.html` | Yasal metinler sayfası (`/yasal`). |
| `db/migrations/*.sql` | Supabase değişiklikleri. Her birinin yanında `.verify.sql` (kontrol) ve `.rollback.sql` (geri alma) vardır. |
| `tests/` | Tarayıcı ve veritabanı testleri (`npm test`). |
| `docs/` | Bu kılavuz ve notlar. |

## 2. Mimari özet

- **Tek HTML dosyası:** HTML + CSS + JavaScript tek dosyada; framework yok. Sayfalar arası geçiş sayfa yenilemeden yapılır
  (History API).
- **Veri:** Uygulamanın kullandığı **aynı Supabase projesi** (`twaptpofhbnnfciowoig`). Tarayıcıda yalnız publishable (anon)
  anahtar var; yetki tamamen RLS politikaları ve `SECURITY DEFINER` fonksiyonlarla sunucudadır.
- **Dış bağımlılıklar (CDN, jsDelivr):** `@supabase/supabase-js@2.57.4`; PDF için gerektiğinde `jspdf@2.5.2`,
  `qrcode-generator@1.4.4` ve Inter yazı tipi. İnternet bağlantısı gerekir.
- **Web'deki yerleşim:** Hostinger sayfasına "Custom HTML/Embed" olarak yapıştırılır. Hostinger bunu aynı kökenli bir
  iframe içinde çalıştırır; uygulama üst sayfaya erişip menüyü (shadow DOM) ve genişliği ayarlar. Iframe içinde değilse
  (ör. doğrudan WebView'a yüklenirse) kendi penceresini kullanır.

### Adresler

| Ekran | Adres |
|---|---|
| Akış | `/` |
| Uzmanlar | `/uzmanlar` |
| Hizmet Bul | `/hizmetler` |
| Profil | `/profil?id={kullanıcı-id}` |
| Post detayı | `/calisma-detay?id={post-id}` |
| Hizmet detayı | `/hizmet-detay?id={hizmet-id}` |
| Hesap & Gizlilik | `/hesaplar-ve-gizlilik` |
| Alanlar | `/?sayfa=alanlar` |
| Bir alanın akışı | `/?konu={alan-slug}` |
| Kaydedilenler | `/?sayfa=kaydedilenler` |

Bildirim (push) yönlendirmesi için bu adresler kullanılabilir.

## 3. Entegrasyon seçenekleri

### Seçenek A — Canlı siteyi WebView'da açmak (önerilen)

```tsx
<WebView source={{ uri: 'https://isgcalisanplatformu.com/?app=1' }} ... />
```

- **Artı:** Web'de yapılan her güncelleme uygulamaya anında gelir; mağaza güncellemesi gerekmez. Web ve uygulama aynı kod.
- **Artı:** `?app=1` ya da `window.ReactNativeWebView` görüldüğünde uygulama modu açılır (bkz. §4): Hostinger'ın üst ve alt
  bölümleri gizlenir.
- **Eksi:** Hostinger sayfasının yüklenme süresi kadar açılış gecikmesi olur.

### Seçenek B — HTML'i uygulamaya gömmek

```tsx
<WebView source={{ html: yayinDosyasi, baseUrl: 'https://isgcalisanplatformu.com' }} ... />
```

- **Artı:** Hostinger katmanı yok; açılış daha hızlı.
- **Eksi:** Her web güncellemesi için yeni dosya yerleştirmek gerekir. Bunun yerine dosya açılışta sunucudan çekilip
  önbelleğe alınabilir.
- `baseUrl` mutlaka `https://isgcalisanplatformu.com` olmalı; adres yönetimi ve oturum bu kökene bağlıdır.
- Uygulamanın "yenile" ya da "bilinmeyen adres" durumlarında canlı siteye gidebileceğini unutmayın; `onShouldStartLoadWithRequest`
  ile kontrol edin.

## 4. Uygulama modu (v4.42.0)

Uygulama, **`window.ReactNativeWebView` varsa** ya da **ilk adreste `?app=1` varsa** uygulama moduna geçer. Bu seçim aynı
oturum (sekme) boyunca `sessionStorage` ile hatırlanır. Uygulama modunda:

- Hostinger'ın üst menüsü, alt bilgisi ve sayfadaki diğer bölümler gizlenir. Yalnız Professional uygulaması kalır.
- Üst menüdeki **"Uygulamayı İndir"** düğmesi kaldırılır.
- **Pro'ya geç** gereken yerde mağaza bağlantısı yerine uygulamaya `kisg:pro` mesajı gönderilir.
- **Paylaş**, **PDF indir** ve **dış bağlantılar** uygulamaya mesaj olarak iletilir. WebView bunları kendi başına yapamaz.
- Oturum değişiklikleri uygulamaya bildirilir; uygulama da web'in oturumunu ayarlayabilir.

## 5. Köprü sözleşmesi

### Web → Uygulama (`onMessage`)

Mesajlar `window.ReactNativeWebView.postMessage(JSON.stringify(mesaj))` ile gönderilir.

| `type` | Alanlar | Ne zaman | Uygulamanın yapması gereken |
|---|---|---|---|
| `kisg:ready` | `version` | Uygulama açıldığında | (İsteğe bağlı) Oturumu aktarmak için `setSession` çağrısı |
| `kisg:session` | `event`, `access_token`, `refresh_token` | Giriş, çıkış, token yenileme | Oturumu senkronlamak (bkz. §6) |
| `kisg:pro` | `from` | Kullanıcı "Pro'ya geç"e bastı | Uygulamanın Pro satın alma ekranını açmak |
| `kisg:share` | `url`, `title`, `text` | Profil / Post / Hizmet paylaşımı | `Share.share({ message, url })` |
| `kisg:file` | `name`, `title`, `mime`, `base64` | Profil PDF'i (Kişi Kartı) | Dosyayı kaydetmek ya da paylaşmak (ör. `react-native-fs` + `Share`) |
| `kisg:open` | `url` | Dış bağlantı (kullanıcı uyarıyı onayladıktan sonra) | `Linking.openURL(url)` |

### Uygulama → Web (`injectJavaScript`)

Web, sayfaya `window.kisgApp` nesnesini koyar (yalnız uygulama modunda):

| Çağrı | Döner | Açıklama |
|---|---|---|
| `kisgApp.setSession(access_token, refresh_token)` | `Promise<boolean>` | Uygulamadaki oturumu web'e aktarır; kullanıcı yeniden giriş yapmaz. |
| `kisgApp.signOut()` | `Promise<boolean>` | Web oturumunu kapatır (uygulamadan çıkış yapıldığında). |
| `kisgApp.version` | `string` | Web uygulamasının sürümü. |

### Örnek

```tsx
import { WebView } from 'react-native-webview';
import { Linking, Share } from 'react-native';

const ref = useRef<WebView>(null);

const onMessage = async (e) => {
  let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
  switch (m.type) {
    case 'kisg:ready': {
      const { data } = await supabase.auth.getSession();
      if (data.session) ref.current?.injectJavaScript(
        `window.kisgApp && kisgApp.setSession(${JSON.stringify(data.session.access_token)}, ${JSON.stringify(data.session.refresh_token)}); true;`);
      break;
    }
    case 'kisg:pro':   navigation.navigate('ProPaywall'); break;
    case 'kisg:share': Share.share({ message: m.text ? `${m.text}\n${m.url}` : m.url, url: m.url, title: m.title }); break;
    case 'kisg:open':  Linking.openURL(m.url); break;
    case 'kisg:file':  await savePdf(m.name, m.base64); break;   // uygulamanın dosya kaydetme yardımcısı
    case 'kisg:session': /* bkz. §6 */ break;
  }
};

<WebView
  ref={ref}
  source={{ uri: 'https://isgcalisanplatformu.com/?app=1' }}
  onMessage={onMessage}
  sharedCookiesEnabled
  domStorageEnabled
  allowsBackForwardNavigationGestures
  setSupportMultipleWindows={false}
  onShouldStartLoadWithRequest={req => {
    const ok = /^https:\/\/(www\.)?isgcalisanplatformu\.com|^about:|^blob:|^data:/.test(req.url) || req.url.includes('supabase.co');
    if (!ok) Linking.openURL(req.url);
    return ok;
  }}
/>
```

## 6. Oturum (giriş) paylaşımı — dikkat

Web ve uygulama **aynı Supabase projesini** kullandığı için kullanıcının iki kez giriş yapması gerekmez: `kisg:ready`
geldiğinde `kisgApp.setSession(...)` çağrılır.

**Refresh token dönüşümü:** Supabase her yenilemede refresh token'ı değiştirir ve eskisini geçersiz kılar. Aynı oturumu iki
istemci (uygulama + WebView) ayrı ayrı yenilerse biri bir süre sonra oturumdan düşebilir. Önerilen çözüm:

1. Web'den `kisg:session` (`event: 'TOKEN_REFRESHED'` veya `'SIGNED_IN'`) gelince uygulama da
   `supabase.auth.setSession({ access_token, refresh_token })` ile **aynı token'lara** geçer.
2. Uygulama kendi tarafında token yenilediğinde (`onAuthStateChange` → `TOKEN_REFRESHED`) yeni token'ları
   `kisgApp.setSession(...)` ile web'e verir.
3. `kisg:session` ile `event: 'SIGNED_OUT'` gelirse uygulamadaki çıkış akışını çalıştırın. Uygulamadan çıkışta da
   `kisgApp.signOut()` çağırın.

Bu senkronizasyon gerçek cihazda, uzun süre açık kalan bir oturumla (en az 1 saat) test edilmelidir.

## 7. Pro üyelik ve Onaylı hesap

- **Pro bilgisi:** `profiles.is_premium` + `user_subscriptions` (`status`, `expires_at`). Mobil uygulamanın mevcut satın alma
  akışı (`activate_my_subscription`, `expire_lapsed_subscriptions`) aynen geçerlidir; web ayrıca bir şey yazmaz.
- **Onaylı hesap rozeti** sunucuda hesaplanır (`kisg_verified_users()`): aktif Pro **ve** yönetimin onayladığı belge **ve**
  profildeki ad onaydaki adla aynı. Abonelik bitince rozet kendiliğinden kalkar, yenilenince geri gelir.
- Pro satın alındıktan sonra web'in yeni durumu görmesi için WebView'ı yenilemek (`ref.current?.reload()`) yeterlidir.
- Ayrıntılı onay prosedürü: `Onaylı Hesap Prosedürü v1.0` (PDF).

## 8. WebView ayarları ve kontrol listesi

- [ ] **Güvenli alan:** Web'in üst menüsü `position: fixed; top: 0`. WebView'ı `SafeAreaView` içine koyun; çentik ve durum
      çubuğunun altında kalmasın.
- [ ] **Fotoğraf yükleme** (Post fotoğrafı, profil fotoğrafı, onay belgesi): `<input type="file">` kullanılır.
      iOS'ta `NSPhotoLibraryUsageDescription` ve `NSCameraUsageDescription` gerekir. Android'de react-native-webview dosya
      seçiciyi destekler; kamera için `CAMERA` izni gerekir.
- [ ] **Android geri tuşu:** `BackHandler` ile `canGoBack` ise `ref.current.goBack()`. Web, sayfa geçişlerini geçmişe yazar.
- [ ] **Dış bağlantılar:** `kisg:open` mesajı + `onShouldStartLoadWithRequest`. `target="_blank"` bağlantıları için
      `setSupportMultipleWindows={false}` ya da `onOpenWindow`.
- [ ] **Paylaş / PDF:** `kisg:share`, `kisg:file` mesajları (§5).
- [ ] **Bildirimler:** Web'deki zil, uygulama içi bildirim listesidir (`professional_notifications` + Supabase Realtime). Push
      bildirimleri uygulamanın mevcut OneSignal altyapısıyla gönderilir; tıklanınca §2'deki adrese yönlendirin
      (`ref.current.injectJavaScript("location.href='...'")` ya da `source` değişimi).
- [ ] **Klavye:** Android'de `android:windowSoftInputMode="adjustResize"`. Yorum ve Post pencereleri klavyeye göre yerleşir.
- [ ] **Bağlantı yok:** `renderError` / `onError` ile yeniden dene ekranı gösterin.
- [ ] **E-posta doğrulama / şifre sıfırlama bağlantıları** web adresine döner (`/#access_token=...`). Uygulama içinde açılması
      isteniyorsa bu adresler uygulamanın deep link ayarına eklenmeli.

## 9. Veritabanı (Supabase)

Migration'lar `db/migrations/` altında, **tarih sırasıyla** uygulanır. Her biri tek bir transaction'dır ve tekrar
çalıştırılabilir. Sonra aynı adlı `.verify.sql` çalıştırılır; tüm satırlarda `ok = true` beklenir.

Son eklenenler (production'a uygulanması gerekenler):

1. `20261009_post_second_image.sql`: Post'ta ikinci fotoğraf
2. `20261010_service_categories_admin.sql`: hizmet kategorileri yönetimi
3. `20261011_saved_items.sql`: Kaydedilenler
4. `20261013_verified_accounts.sql`: Onaylı hesap (gizli `kisg-verifications` deposu dahil)

Migration uygulanmadan önce web, ilgili özelliği gizleyerek çalışmaya devam eder (hata vermez).

## 10. Geliştirme ve test

```bash
npm install
npm run build        # dist/kisg-professional-app-v{sürüm}.html üretir (esbuild ile küçültür; sınır 490.000 karakter)
npm test             # tüm paketler (Playwright + yerel geçici PostgreSQL)
npm test -- --only verified       # adı eşleşen paketler
APPFILE=dist/kisg-professional-app-v4.42.0.html node tests/suites/verified-web.test.mjs   # tek paket, yayın dosyasıyla
```

- Testler gerçek Supabase'e **bağlanmaz**: web testleri sahte sunucu, veritabanı testleri yerel geçici PostgreSQL kullanır.
- Sürüm değişince kaynak dosyanın başındaki başlık ve `CONFIG.version` birlikte güncellenir; yayın dosyasının adı sürümü taşır.
- **490.000 karakter sınırı** yalnız Hostinger içindir (büyük gömme kodlarında Hostinger adresleri yanlış servis ediyordu).
  WebView'da böyle bir sınır yoktur.

## 11. Bilinen sınırlamalar

- Uygulama tamamen çevrimiçidir; çevrimdışı önbellek yoktur.
- Admin paneli (`/pro-admin`) yalnız web içindir; uygulamaya eklenmesi gerekmez.
