# Kırmızı İSG Professional — tarayıcı regresyon testleri

`kisg-professional-app.html` gerçek bir Chromium'da, Hostinger üst sayfası + `srcdoc` iframe içinde çalıştırılır.
Supabase (REST, Auth, Storage, Realtime) ve CDN kitaplıkları tamamen sahte/yereldir; production'a hiçbir istek gitmez.

```
npm install
npm test                      # tüm paketler
npm test -- --only auth       # adı "auth" içeren paketler
```

- `helpers/harness.mjs` — ortak altyapı: test verisi (`db`, `resetDb`), sahte PostgREST (`handleRest`),
  sahte Realtime (`realtimeMock`), Hostinger üst sayfası (`hostPage`, varsayılan `html,body{height:100%}`),
  CDN kitaplıklarının yerelden servis edilmesi, `setup()`, `check()`.
- `helpers/auth.mjs` — durumlu Supabase Auth mock'u (`authMock`, `boot`) ve UI yardımcıları.
- `helpers/postgrest-logic.mjs` — `or/and/ilike/eq/is/cs` filtre çözücüsü.
- `suites/*.test.mjs` — özellik paketleri. Her paket `PASS …` / `FAIL …` satırları basar ve kendi tarayıcısını açar.

Ortam değişkenleri: `CHROMIUM_PATH` (tarayıcı), `OUT` (log/ekran görüntüsü klasörü, varsayılan `tests/output`),
`APPFILE` (farklı bir HTML sürümünü test etmek için), `HOSTINGER_HEIGHT=0` (eski, `height:100%` olmayan host sayfası),
`SAFARI=1` (WebKit'in canvas'tan WebP üretememesi simülasyonu).

Mock'ta doğrulanamayanlar (gerçek Supabase trigger/RLS, gerçek cihazlar, Hostinger canlı sayfası) ayrıca elle test edilir.
