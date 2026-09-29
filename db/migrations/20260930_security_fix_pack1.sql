-- =============================================================================
-- Kırmızı İSG Professional — Security Fix Pack 1 / Migration 1 (mobile-safe)
-- DURUM: HAZIRLANDI, PRODUCTION'A UYGULANMADI.
--
-- Kapsam
--   * get_public_phone(profile_id)     : yalnız show_phone_publicly = true ise telefonu döndürür.
--   * get_my_private_profile()          : yalnız çağıranın kendi özel alanları.
--   * A3 profiles sistem alanı koruması : normal kullanıcı is_premium, email, rapor sayaçları,
--                                          last_post_at, created_at alanlarını değiştiremez (HATA YOK,
--                                          değer sessizce korunur → eski mobil upsert/UPDATE kırılmaz).
--   * A5 status geçiş koruması          : sahip, admin'in gizlediği (hidden) içeriği geri açamaz.
--
-- Bilerek DOKUNULMAYANLAR
--   * profiles RLS politikaları ve SELECT/UPDATE yetkileri (A1 henüz kapatılmıyor; mobil select * çalışır).
--   * onesignal_notification_id yazımı, signup trigger'ı (handle_new_user), Auth ayarları,
--     reports tablosu, user_roles, abonelik fonksiyonları (A6/A7/A8).
--
-- Ayrıcalıklı istek (korumalar uygulanmaz):
--   current_user anon/authenticated DEĞİLSE (service_role, SECURITY DEFINER fonksiyonlar, dashboard)
--   veya kullanıcı user_roles'ta role = 'admin' ise.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 0) Ortak yardımcı: istek ayrıcalıklı mı?
--    SECURITY INVOKER: current_user çağıranın rolünü gösterir. user_roles'u çağıranın
--    RLS'iyle okur (politika: kendi satırı) — admin kendi rolünü görebilir.
-- -----------------------------------------------------------------------------
create or replace function public.kisg_request_is_privileged()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated')
      or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')
$$;

-- -----------------------------------------------------------------------------
-- 1) RPC: herkese açık telefon
-- -----------------------------------------------------------------------------
create or replace function public.get_public_phone(profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(p.phone), '')
    from public.profiles p
   where p.id = profile_id
     and p.show_phone_publicly is true
$$;

revoke all on function public.get_public_phone(uuid) from public, anon, authenticated;
grant execute on function public.get_public_phone(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) RPC: kendi özel profil alanlarım
-- -----------------------------------------------------------------------------
create or replace function public.get_my_private_profile()
returns table (
  id uuid,
  email text,
  phone text,
  show_phone_publicly boolean,
  is_premium boolean,
  daily_reports_used integer,
  monthly_reports_used integer,
  last_report_date date,
  onesignal_notification_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.phone, p.show_phone_publicly, p.is_premium,
         p.daily_reports_used, p.monthly_reports_used, p.last_report_date, p.onesignal_notification_id
    from public.profiles p
   where p.id = auth.uid()
$$;

revoke all on function public.get_my_private_profile() from public, anon, authenticated;
grant execute on function public.get_my_private_profile() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) A3: profiles sistem alanları (INSERT + UPDATE, sessiz koruma)
--
--   is_premium     : normal kullanıcı değiştiremez (manuel verilen premium'lar korunur).
--                    Yetkili yollar: sync_my_premium_status / activate_my_subscription /
--                    sync_user_premium_status (SECURITY DEFINER), service_role, admin.
--   email          : yalnız JWT'deki gerçek e-postaya eşitlenebilir.
--   last_post_at, created_at : sistem.
--   Rapor sayaçları (eski mobil sürümler doğrudan yazıyor; güncel sürüm service_role):
--     last_report_date : geri alınamaz, İstanbul tarihine göre bugünden ileri olamaz
--                        (ileri tarihle aynı UPDATE'te sahte gün/ay sıfırlaması yapılamasın).
--     daily_reports_used   : artış serbest; azaltma yalnız gün ilerlerken (sıfırlama).
--     monthly_reports_used : artış serbest; azaltma yalnız ay ilerlerken (sıfırlama).
--     Negatif / NULL değerler kabul edilmez.
--   onesignal_notification_id ve profil alanları serbest.
-- -----------------------------------------------------------------------------
create or replace function public.kisg_protect_profile_system_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_email   text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  today       date := (now() at time zone 'Europe/Istanbul')::date;
  day_rolled  boolean;
  month_rolled boolean;
begin
  if public.kisg_request_is_privileged() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Satır normalde handle_new_user ile oluşur; istemci INSERT'i (upsert'in ilk adımı dahil)
    -- sistem alanlarını belirleyemez.
    new.is_premium           := false;
    new.daily_reports_used   := 0;
    new.monthly_reports_used := 0;
    new.last_report_date     := today;
    new.last_post_at         := null;
    new.created_at           := timezone('utc'::text, now());
    if new.email is not null and lower(new.email) is distinct from jwt_email then
      new.email := jwt_email;
    end if;
    return new;
  end if;

  -- UPDATE
  new.is_premium   := old.is_premium;
  new.last_post_at := old.last_post_at;
  new.created_at   := old.created_at;

  if new.email is distinct from old.email
     and (new.email is null or jwt_email is null or lower(new.email) <> jwt_email) then
    new.email := old.email;
  end if;

  if new.last_report_date is distinct from old.last_report_date
     and (new.last_report_date is null
          or (old.last_report_date is not null and new.last_report_date < old.last_report_date)
          or new.last_report_date > today) then
    new.last_report_date := old.last_report_date;
  end if;

  day_rolled   := old.last_report_date is null
                  or (new.last_report_date is not null and new.last_report_date > old.last_report_date);
  month_rolled := old.last_report_date is null
                  or (new.last_report_date is not null
                      and date_trunc('month', new.last_report_date) > date_trunc('month', old.last_report_date));

  if new.daily_reports_used is distinct from old.daily_reports_used
     and (new.daily_reports_used is null
          or new.daily_reports_used < 0
          or (new.daily_reports_used < coalesce(old.daily_reports_used, 0) and not day_rolled)) then
    new.daily_reports_used := old.daily_reports_used;
  end if;

  if new.monthly_reports_used is distinct from old.monthly_reports_used
     and (new.monthly_reports_used is null
          or new.monthly_reports_used < 0
          or (new.monthly_reports_used < coalesce(old.monthly_reports_used, 0) and not month_rolled)) then
    new.monthly_reports_used := old.monthly_reports_used;
  end if;

  return new;
end;
$$;

revoke all on function public.kisg_protect_profile_system_fields() from public, anon, authenticated;

drop trigger if exists kisg_protect_profile_system_fields on public.profiles;
create trigger kisg_protect_profile_system_fields
  before insert or update on public.profiles
  for each row execute function public.kisg_protect_profile_system_fields();

-- -----------------------------------------------------------------------------
-- 4) A5: sahip için status geçiş modeli (hata fırlatır; normal akış bu durumlara girmez)
--   Post / Yorum : active → deleted, hidden → deleted
--   Hizmet       : active → archived, archived → active (yalnız moderated_at IS NULL)
--   Diğer her geçiş (→ hidden, hidden → active, deleted → active, ...) yalnız admin/sunucu.
-- -----------------------------------------------------------------------------
create or replace function public.kisg_guard_owner_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if new.status is not distinct from old.status or public.kisg_request_is_privileged() then
    return new;
  end if;

  if tg_table_name in ('professional_posts', 'professional_post_comments') then
    allowed := new.status = 'deleted' and old.status in ('active', 'hidden');
  elsif tg_table_name = 'professional_services' then
    allowed := (old.status = 'active' and new.status = 'archived')
            or (old.status = 'archived' and new.status = 'active' and old.moderated_at is null);
  end if;

  if not allowed then
    raise exception 'KISG_STATUS_LOCKED: % -> %', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.kisg_guard_owner_status() from public, anon, authenticated;

drop trigger if exists kisg_guard_owner_status on public.professional_posts;
create trigger kisg_guard_owner_status
  before update of status on public.professional_posts
  for each row execute function public.kisg_guard_owner_status();

drop trigger if exists kisg_guard_owner_status on public.professional_post_comments;
create trigger kisg_guard_owner_status
  before update of status on public.professional_post_comments
  for each row execute function public.kisg_guard_owner_status();

drop trigger if exists kisg_guard_owner_status on public.professional_services;
create trigger kisg_guard_owner_status
  before update of status on public.professional_services
  for each row execute function public.kisg_guard_owner_status();

commit;
