# DB migration'ları (Kırmızı İSG Professional)

Bu klasördeki SQL dosyaları **otomatik uygulanmaz**. Production'a uygulamadan önce staging'de çalıştırılır.

| Dosya | Durum |
|---|---|
| `migrations/20260929_professional_reports.sql` | Hazır, **uygulanmadı** (Şikâyet / Bildir V1, web v4.14.0) |
| `migrations/20260929_professional_reports.rollback.sql` | Geri alma (raporlar silinir) |

Uygulama: Supabase SQL Editor'de dosyanın tamamı tek seferde çalıştırılır (kendi `begin/commit`'i var, tekrar çalıştırılabilir).

Doğrulama: `npm test -- --only reports-db` migration'ı yerel geçici bir PostgreSQL kümesinde
`tests/helpers/supabase-stub.sql` üzerine uygular ve anon / authenticated / service_role davranışını sınar.
Bu, gerçek Supabase şemasının birebir kopyası değildir; staging'de ayrıca kontrol edilmelidir:

1. Giriş yapmış bir kullanıcıyla web'den başka birinin Postunu bildir → "Bildiriminiz alındı."
2. Aynı Postu tekrar bildir → "Bunu daha önce bildirdin…"
3. SQL: `select target_type, target_id, reason, status from professional_reports order by created_at desc limit 5;`
4. anon anahtarıyla `GET /rest/v1/professional_reports` → 401/403 (permission denied).
