# DB migration'ları (Kırmızı İSG Professional)

Bu klasördeki SQL dosyaları **otomatik uygulanmaz**. Production'a uygulamadan önce staging'de çalıştırılır.

| Dosya | Durum |
|---|---|
| `migrations/20260929_professional_reports.sql` | Production'a uygulandı (Şikâyet / Bildir V1, web v4.14.0) |
| `migrations/20260929_professional_reports.rollback.sql` | Geri alma (raporlar silinir) |
| `migrations/20260930_security_fix_pack1.sql` | Production'a uygulandı, verify 25/25 `ok` (Security Fix Pack 1 / Migration 1: A3 + A5 + telefon RPC'leri, web v4.15.0) |
| `migrations/20260930_security_fix_pack1.rollback.sql` | Geri alma (veri değiştirmez) |
| `migrations/20260930_security_fix_pack1.verify.sql` | Uygulama sonrası salt okunur doğrulama (her satır `ok = true`) |
| `migrations/20261001_security_fix_pack2_part1_public.sql` | Production'a uygulandı, verify 46/46 `ok` (Security Fix Pack 2 / Parça 1: A6 sunucu RPC yetkileri + abonelik süre sınırı, A7) |
| `migrations/20261001_security_fix_pack2_part2_storage.sql` | Production'a uygulandı, verify 46/46 `ok` (Security Fix Pack 2 / Parça 2: A8 storage politikaları; Parça 1'den sonra, tek seferlik) |
| `migrations/20261001_security_fix_pack2.rollback.sql` | Geri alma (veri değiştirmez, politikaları production tanımlarına döndürür) |
| `migrations/20261001_security_fix_pack2.verify.sql` | Uygulama sonrası salt okunur doğrulama (her satır `ok = true`) |
| `migrations/20261002_admin_v1_a.sql` | Production'a uygulandı, verify 28/28 `ok` (Admin V1 / Migration A: kisg_is_admin, audit log, yaptırımlar, şikâyet çözüm alanları, yaptırım kontrolü) |
| `migrations/20261002_admin_v1_a.rollback.sql` | Geri alma (audit log, yaptırımlar ve şikâyet çözüm alanlarındaki veriler silinir) |
| `migrations/20261002_admin_v1_a.verify.sql` | Uygulama sonrası salt okunur doğrulama (her satır `ok = true`) |

Uygulama: Supabase SQL Editor'de dosyanın tamamı tek seferde çalıştırılır (kendi `begin/commit`'i var, tekrar çalıştırılabilir).

Doğrulama: `npm test -- --only reports-db` / `npm test -- --only security-fix-pack1` / `npm test -- --only security-fix-pack2` / `npm test -- --only admin-v1-a` migration'ı yerel geçici bir PostgreSQL kümesinde
`tests/helpers/supabase-stub.sql` üzerine uygular ve anon / authenticated / service_role davranışını sınar.
Bu, gerçek Supabase şemasının birebir kopyası değildir; staging'de ayrıca kontrol edilmelidir:

1. Giriş yapmış bir kullanıcıyla web'den başka birinin Postunu bildir → "Bildiriminiz alındı."
2. Aynı Postu tekrar bildir → "Bunu daha önce bildirdin…"
3. SQL: `select target_type, target_id, reason, status from professional_reports order by created_at desc limit 5;`
4. anon anahtarıyla `GET /rest/v1/professional_reports` → 401/403 (permission denied).
