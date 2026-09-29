-- =============================================================================
-- Kırmızı İSG Professional — Şikâyet / Bildir V1: public.professional_reports
-- DURUM: HAZIRLANDI, PRODUCTION'A UYGULANMADI. Önce staging'de çalıştırılıp
--        npm test -- --only reports-db ile (yerel) ve staging'de doğrulanmalıdır.
--
-- Hedefler: Post (professional_posts), Yorum (professional_post_comments),
--           Profil (profiles), Hizmet (professional_services).
-- target_id metin tutulur (yorum kimliği bigint/uuid olabilir); tetikleyici hedefin
-- varlığını doğrular ve kimliği kanonik biçime (id::text) çevirir.
--
-- Güvenlik:
--   * anon: hiçbir yetki yok (SELECT/INSERT/UPDATE/DELETE).
--   * authenticated: yalnız INSERT ve yalnız (target_type, target_id, reason, details)
--     kolonları. reporter_id / status / created_at istemciden yazılamaz.
--   * reporter_id = auth.uid() (tetikleyici zorlar + RLS WITH CHECK) → spoof edilemez.
--   * SELECT / UPDATE / DELETE politikası yok → normal kullanıcı hiçbir raporu
--     (kendisininkiler dahil) okuyamaz, durum değiştiremez, silemez.
--   * Kendi içeriğini/profilini/hizmetini bildirmek DB'de reddedilir.
--   * Aynı kullanıcı aynı hedefi bir kez bildirebilir (unique).
--   * Bildirim içeriği gizlemez/silmez; hedef tablolara yazılmaz.
--   * Admin rolü / moderasyon politikaları BU MIGRATION'DA YOK (sonraki iş).
--     Moderasyon kuyruğu şimdilik yalnız service_role (RLS bypass) ile okunabilir.
-- =============================================================================
begin;

create table if not exists public.professional_reports (
  id           uuid        primary key default gen_random_uuid(),
  reporter_id  uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  target_type  text        not null,
  target_id    text        not null,
  reason       text        not null,
  details      text,
  status       text        not null default 'pending',
  created_at   timestamptz not null default now(),
  constraint professional_reports_target_type_check check (target_type in ('post', 'comment', 'profile', 'service')),
  constraint professional_reports_target_id_check   check (char_length(target_id) between 1 and 64),
  constraint professional_reports_reason_check      check (reason in ('spam', 'inappropriate', 'misleading', 'harassment', 'fake_profile', 'other')),
  constraint professional_reports_fake_profile_check check (reason <> 'fake_profile' or target_type = 'profile'),
  constraint professional_reports_details_check     check (details is null or char_length(details) <= 1000),
  constraint professional_reports_status_check      check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  constraint professional_reports_once_per_reporter unique (reporter_id, target_type, target_id)
);

comment on table public.professional_reports is 'Kırmızı İSG Professional şikâyet/bildir kayıtları (moderasyon kuyruğu kaynağı). İçeriği otomatik gizlemez.';

-- Moderasyon kuyruğu (durum + tarih) ve hedef bazlı toplama için
create index if not exists professional_reports_queue_idx  on public.professional_reports (status, created_at desc);
create index if not exists professional_reports_target_idx on public.professional_reports (target_type, target_id);

-- -----------------------------------------------------------------------------
-- INSERT tetikleyicisi: reporter/status/created_at'i sunucu belirler, hedefi doğrular,
-- kendi içeriğini bildirmeyi reddeder. SECURITY DEFINER: hedef tabloların RLS'inden
-- bağımsız okur; yalnız okur, hiçbir tabloya yazmaz.
-- -----------------------------------------------------------------------------
create or replace function public.professional_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  owner uuid;
  canon text;
  tid   text := lower(btrim(new.target_id));
begin
  if uid is null then
    raise exception 'KISG_REPORT_AUTH' using errcode = '42501';
  end if;

  new.reporter_id := uid;
  new.status      := 'pending';
  new.created_at  := now();
  new.details     := nullif(btrim(new.details), '');

  if new.target_type = 'post' then
    select t.user_id, t.id::text into owner, canon from public.professional_posts t where t.id::text = tid;
  elsif new.target_type = 'comment' then
    select t.user_id, t.id::text into owner, canon from public.professional_post_comments t where t.id::text = tid;
  elsif new.target_type = 'profile' then
    select t.id, t.id::text into owner, canon from public.profiles t where t.id::text = tid;
  elsif new.target_type = 'service' then
    select t.user_id, t.id::text into owner, canon from public.professional_services t where t.id::text = tid;
  end if;

  if canon is null then
    raise exception 'KISG_REPORT_TARGET' using errcode = 'P0001';
  end if;
  if owner = uid then
    raise exception 'KISG_REPORT_OWN' using errcode = 'P0001';
  end if;

  new.target_id := canon;
  return new;
end;
$$;

revoke all on function public.professional_reports_before_insert() from public, anon, authenticated;

drop trigger if exists professional_reports_before_insert on public.professional_reports;
create trigger professional_reports_before_insert
  before insert on public.professional_reports
  for each row execute function public.professional_reports_before_insert();

-- -----------------------------------------------------------------------------
-- Yetkiler + RLS
-- -----------------------------------------------------------------------------
alter table public.professional_reports enable row level security;

revoke all on table public.professional_reports from public, anon, authenticated;
grant insert (target_type, target_id, reason, details) on table public.professional_reports to authenticated;

drop policy if exists professional_reports_insert_own on public.professional_reports;
create policy professional_reports_insert_own
  on public.professional_reports
  for insert
  to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'pending');

-- Bilerek YOK: select / update / delete politikaları (admin yetkilendirmesi sonraki çalışma).

commit;
