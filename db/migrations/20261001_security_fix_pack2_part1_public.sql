-- =============================================================================
-- Kırmızı İSG — Security Fix Pack 2 — PARÇA 1/2: public şema (A6 + A7)
-- DURUM: PRODUCTION'A UYGULANDI (verify 46/46 ok).
--
-- Kanıt (production pg_stat_statements + katalog, 2026-10-01):
--   * expire_lapsed_subscriptions / sync_user_premium_status / update_user_notification_settings
--     yalnız postgres rolüyle çağrılmış; anon/authenticated çağrısı yok, cron işi yok.
--   * Mobil: activate_my_subscription (iOS) ve user_subscriptions'a doğrudan INSERT (Android,
--     expires_at RevenueCat'ten) + iki UPDATE status kalıbı. Bunlar DEĞİŞMEDEN çalışır.
--   * Aylık aboneliklerin geçerli expires_at değerleri en fazla 40 gün ileride.
--   * announcements dosyalarının 47/48'i admin'e ait; report-photos yollarının ilk klasörü
--     44/44 dosya sahibinin kullanıcı kimliği; istemci storage listelemesi yok.
--
-- Bu parça yalnız public şemaya dokunur. Tekrar çalıştırılabilir.
-- Parça 2 (storage, A8) ayrı dosyadadır: 20261001_security_fix_pack2_part2_storage.sql
--
-- Kapsam (iki parçanın toplamı)
--   A6-1  expire_lapsed_subscriptions / sync_user_premium_status: anon/authenticated EXECUTE kaldırılır
--         (anon'un tek çağrıyla manuel premium'ları düşürmesi kapanır).
--   A6-2  user_subscriptions: istemci isteğinin (JWT rolü anon/authenticated, admin değil) yazdığı
--         AKTİF satırda expires_at boş veya 45 günden ileri olamaz → 45 güne indirilir. Hata YOK.
--         İstisna: 'com.fk.kirmiziisgapp.ilan' (karar: ilan premium verir, süresiz kalır).
--         activate_my_subscription (SECURITY DEFINER) içindeki yazım da JWT rolüne göre kapsanır.
--   A7    update_user_notification_settings: anon/authenticated EXECUTE kaldırılır, search_path sabitlenir.
--   A8    storage: announcements yazma/silme yalnız admin; job-images silme yalnız dosya sahibi/admin;
--         report-photos yükleme/silme/okuma yalnız kendi klasörü (ilk klasör = auth.uid()) veya admin.
--
-- Bilerek DOKUNULMAYANLAR
--   * Mevcut abonelik ve profil VERİSİ (manuel premium'lar, is_premium) — hiçbir satır güncellenmez.
--   * activate_my_subscription / sync_my_premium_status tanımları ve yetkileri (mobil kullanıyor).
--   * user_subscriptions RLS politikaları (mobil doğrudan INSERT/UPDATE yapıyor).
--   * Transaction'ın başka kullanıcıya geçmesi (RevenueCat transfer davranışı; kapatılması Faz B).
--   * profile-avatars ve professional-posts politikaları, bucket'ların public ayarı, job-images yükleme.
--   * profiles, reports, signup trigger'ı, Auth ayarları.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- A6-1 + A7: sunucu fonksiyonlarının istemci yetkileri
-- -----------------------------------------------------------------------------
revoke execute on function public.expire_lapsed_subscriptions() from public, anon, authenticated;
revoke execute on function public.sync_user_premium_status(uuid) from public, anon, authenticated;
revoke execute on function public.update_user_notification_settings(uuid, boolean, text[]) from public, anon, authenticated;
grant execute on function public.expire_lapsed_subscriptions() to service_role;
grant execute on function public.sync_user_premium_status(uuid) to service_role;
grant execute on function public.update_user_notification_settings(uuid, boolean, text[]) to service_role;
alter function public.update_user_notification_settings(uuid, boolean, text[]) set search_path = public;

-- -----------------------------------------------------------------------------
-- A6-2: user_subscriptions — istemcinin yazdığı aktif satıra süre sınırı
--   İstemci isteği: JWT rolü anon/authenticated VE kullanıcı admin değil.
--   (current_user değil JWT rolü kullanılır: SECURITY DEFINER activate_my_subscription
--    içinde current_user postgres olur, JWT rolü ise çağıran mobil kullanıcıdır.)
--   Dashboard / SQL Editor (JWT yok), service_role ve admin etkilenmez.
-- -----------------------------------------------------------------------------
create or replace function public.kisg_guard_subscription_expiry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  max_expiry timestamptz := now() + interval '45 days';
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated')
     or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin') then
    return new;
  end if;

  if new.status is distinct from 'active' or new.product_id is not distinct from 'com.fk.kirmiziisgapp.ilan' then
    return new;
  end if;

  -- Mevcut aktif satırın süresine istemci dokunmuyorsa (ör. yalnız status/will_renew UPDATE'i) koru.
  if tg_op = 'UPDATE' and old.status = 'active'
     and new.expires_at is not distinct from old.expires_at
     and new.product_id is not distinct from old.product_id then
    return new;
  end if;

  if new.expires_at is null or new.expires_at > max_expiry then
    new.expires_at := max_expiry;
  end if;
  return new;
end;
$$;

revoke all on function public.kisg_guard_subscription_expiry() from public, anon, authenticated;

drop trigger if exists kisg_guard_subscription_expiry on public.user_subscriptions;
create trigger kisg_guard_subscription_expiry
  before insert or update on public.user_subscriptions
  for each row execute function public.kisg_guard_subscription_expiry();

commit;
