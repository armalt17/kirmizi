-- =============================================================================
-- Kırmızı İSG Professional — Admin V1 / Migration A (yalnız ekleme)
-- DURUM: PRODUCTIONA UYGULANDI (verify 28/28 ok).
--
-- Kapsam
--   1. public.kisg_is_admin()                 : çağıran gerçek admin mi (user_roles).
--   2. public.kisg_my_active_sanction()       : çağıranın ENGELLEYEN aktif yaptırımı (suspension/ban) ya da NULL.
--   3. public.professional_admin_audit_log    : admin işlemleri, append-only, istemcilere kapalı.
--   4. public.professional_user_sanctions     : warning / suspension / ban, istemci yazımına kapalı.
--   5. public.professional_reports            : nullable çözüm alanları (reviewed_by, reviewed_at,
--                                                resolution_note, action_taken).
--   6. Yaptırım kontrolü (yalnız Professional mutationları):
--        INSERT : professional_posts, professional_post_comments, professional_services,
--                 professional_reports, professional_post_likes, professional_comment_likes
--        UPDATE : professional_posts, professional_post_comments, professional_services
--                 (yalnız kendi içeriğini kaldırma — status → deleted / archived — serbest)
--      Engelleyen yaptırım: iptal edilmemiş, başlamış ve bitmemiş suspension veya ban.
--        * warning hiçbir işlemi engellemez.
--        * suspension süreli, ends_at geçince kendiliğinden etkisiz (cleanup gerekmez).
--        * ban süresiz olabilir (ends_at NULL).
--      Admin, service_role, SECURITY DEFINER fonksiyonlar ve dashboard kontrolden muaftır.
--
-- Bilerek DOKUNULMAYANLAR
--   * profiles, job_postings, announcements, user_subscriptions, user_roles, bildirimler.
--   * Mevcut RLS politikaları, moderasyon triggerları, professional_reports INSERT triggerı
--     ve kolon yetkileri (yeni kolonlar istemciye açılmaz).
--   * get_professional_admin_overview.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1) Admin doğrulama
-- -----------------------------------------------------------------------------
create or replace function public.kisg_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')
$$;

revoke all on function public.kisg_is_admin() from public, anon, authenticated;
grant execute on function public.kisg_is_admin() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Audit log (append-only)
--    admin_id / target_id bilerek FK DEĞİL: kullanıcı veya içerik silinse de kayıt kalır.
-- -----------------------------------------------------------------------------
create table if not exists public.professional_admin_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid,
  action      text        not null,
  target_type text        not null,
  target_id   text        not null,
  reason      text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now(),
  constraint professional_admin_audit_log_action_check      check (char_length(action) between 1 and 64),
  constraint professional_admin_audit_log_target_type_check check (target_type in ('profile', 'post', 'comment', 'service', 'report', 'sanction')),
  constraint professional_admin_audit_log_target_id_check   check (char_length(target_id) between 1 and 64),
  constraint professional_admin_audit_log_reason_check      check (reason is null or char_length(reason) <= 1000)
);

comment on table public.professional_admin_audit_log is 'Kirmizi ISG Professional admin islem kaydi. Append-only, yalniz admin RPC fonksiyonlari yazar.';

create index if not exists professional_admin_audit_log_created_idx on public.professional_admin_audit_log (created_at desc);
create index if not exists professional_admin_audit_log_target_idx  on public.professional_admin_audit_log (target_type, target_id, created_at desc);
create index if not exists professional_admin_audit_log_admin_idx   on public.professional_admin_audit_log (admin_id, created_at desc);

create or replace function public.kisg_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'KISG_AUDIT_APPEND_ONLY' using errcode = '42501';
end;
$$;

revoke all on function public.kisg_audit_log_append_only() from public, anon, authenticated;

drop trigger if exists kisg_audit_log_append_only on public.professional_admin_audit_log;
create trigger kisg_audit_log_append_only
  before update or delete on public.professional_admin_audit_log
  for each row execute function public.kisg_audit_log_append_only();

drop trigger if exists kisg_audit_log_no_truncate on public.professional_admin_audit_log;
create trigger kisg_audit_log_no_truncate
  before truncate on public.professional_admin_audit_log
  for each statement execute function public.kisg_audit_log_append_only();

alter table public.professional_admin_audit_log enable row level security;
revoke all on table public.professional_admin_audit_log from public, anon, authenticated;
grant select, insert on table public.professional_admin_audit_log to service_role;
-- Bilerek politika YOK: istemci okuyamaz/yazamaz. Yazım Migration Bdeki admin RPCleri ile.

-- -----------------------------------------------------------------------------
-- 3) Yaptırımlar
--    user_id bilerek FK DEĞİL: profiles tablosuna kilit/yetki bağımlılığı yaratmaz
--    (profilesa hiç dokunulmaz). Kullanıcı silinirse kaydı kalır ama kimseyi engellemez.
-- -----------------------------------------------------------------------------
create table if not exists public.professional_user_sanctions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  type          text        not null,
  reason        text        not null,
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text,
  constraint professional_user_sanctions_type_check          check (type in ('warning', 'suspension', 'ban')),
  constraint professional_user_sanctions_reason_check        check (char_length(btrim(reason)) between 1 and 1000),
  constraint professional_user_sanctions_period_check        check (ends_at is null or ends_at > starts_at),
  constraint professional_user_sanctions_suspension_end_check check (type <> 'suspension' or ends_at is not null),
  constraint professional_user_sanctions_revoke_reason_check check (revoke_reason is null or char_length(revoke_reason) <= 1000)
);

comment on table public.professional_user_sanctions is 'Kirmizi ISG Professional kullanici yaptirimlari. warning engellemez, aktif suspension veya ban Professional yazimlarini engeller.';

create index if not exists professional_user_sanctions_user_idx on public.professional_user_sanctions (user_id, created_at desc);
create index if not exists professional_user_sanctions_blocking_idx on public.professional_user_sanctions (user_id)
  where type in ('suspension', 'ban') and revoked_at is null;

alter table public.professional_user_sanctions enable row level security;
revoke all on table public.professional_user_sanctions from public, anon, authenticated;
grant select, insert, update on table public.professional_user_sanctions to service_role;
-- Bilerek politika YOK: istemci okuyamaz/yazamaz. Kullanıcı kendi kaydını Migration Bdeki RPC ile görür.

-- Çağıranın engelleyen aktif yaptırımı (yalnız kendisi, başkasını sorgulayamaz)
create or replace function public.kisg_my_active_sanction()
returns table (sanction_type text, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.type, s.ends_at
    from public.professional_user_sanctions s
   where s.user_id = auth.uid()
     and s.type in ('suspension', 'ban')
     and s.revoked_at is null
     and s.starts_at <= now()
     and (s.ends_at is null or s.ends_at > now())
   order by (s.type = 'ban') desc, s.ends_at desc nulls first
   limit 1
$$;

revoke all on function public.kisg_my_active_sanction() from public, anon, authenticated;
grant execute on function public.kisg_my_active_sanction() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Professional yazımlarında yaptırım kontrolü
--    SECURITY INVOKER: current_user çağıranı gösterir (kisg_request_is_privileged, Fix Pack 1).
-- -----------------------------------------------------------------------------
create or replace function public.kisg_block_sanctioned_professional_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s record;
begin
  if auth.uid() is null or public.kisg_request_is_privileged() then
    return new;
  end if;

  -- Kendi içeriğini kaldırmak her zaman serbest: status → deleted/archived ve içerik alanları aynı
  -- (web Post silerken profile_featured_orderı da boşaltıyor).
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'status') is distinct from (to_jsonb(old) ->> 'status')
       and (to_jsonb(new) ->> 'status') in ('deleted', 'archived')
       and (to_jsonb(new) - array['status', 'updated_at', 'profile_featured_order'])
         = (to_jsonb(old) - array['status', 'updated_at', 'profile_featured_order']) then
      return new;
    end if;
  end if;

  select * into s from public.kisg_my_active_sanction();
  if found then
    if s.sanction_type = 'ban' then
      raise exception 'KISG_USER_BANNED' using errcode = '42501',
        detail = coalesce('until=' || s.ends_at::text, 'until=permanent');
    end if;
    raise exception 'KISG_USER_SUSPENDED' using errcode = '42501', detail = 'until=' || s.ends_at::text;
  end if;
  return new;
end;
$$;

revoke all on function public.kisg_block_sanctioned_professional_write() from public, anon, authenticated;

drop trigger if exists kisg_block_sanctioned_write on public.professional_posts;
create trigger kisg_block_sanctioned_write
  before insert or update on public.professional_posts
  for each row execute function public.kisg_block_sanctioned_professional_write();

drop trigger if exists kisg_block_sanctioned_write on public.professional_post_comments;
create trigger kisg_block_sanctioned_write
  before insert or update on public.professional_post_comments
  for each row execute function public.kisg_block_sanctioned_professional_write();

drop trigger if exists kisg_block_sanctioned_write on public.professional_services;
create trigger kisg_block_sanctioned_write
  before insert or update on public.professional_services
  for each row execute function public.kisg_block_sanctioned_professional_write();

drop trigger if exists kisg_block_sanctioned_write on public.professional_reports;
create trigger kisg_block_sanctioned_write
  before insert on public.professional_reports
  for each row execute function public.kisg_block_sanctioned_professional_write();

drop trigger if exists kisg_block_sanctioned_write on public.professional_post_likes;
create trigger kisg_block_sanctioned_write
  before insert on public.professional_post_likes
  for each row execute function public.kisg_block_sanctioned_professional_write();

drop trigger if exists kisg_block_sanctioned_write on public.professional_comment_likes;
create trigger kisg_block_sanctioned_write
  before insert on public.professional_comment_likes
  for each row execute function public.kisg_block_sanctioned_professional_write();

-- -----------------------------------------------------------------------------
-- 5) professional_reports: nullable admin çözüm alanları
--    İstemci INSERT yetkisi yalnız (target_type, target_id, reason, details) kolonlarında kalır.
-- -----------------------------------------------------------------------------
alter table public.professional_reports add column if not exists reviewed_by     uuid;
alter table public.professional_reports add column if not exists reviewed_at     timestamptz;
alter table public.professional_reports add column if not exists resolution_note text;
alter table public.professional_reports add column if not exists action_taken    text;

alter table public.professional_reports drop constraint if exists professional_reports_resolution_note_check;
alter table public.professional_reports add constraint professional_reports_resolution_note_check
  check (resolution_note is null or char_length(resolution_note) <= 1000);
alter table public.professional_reports drop constraint if exists professional_reports_action_taken_check;
alter table public.professional_reports add constraint professional_reports_action_taken_check
  check (action_taken is null or action_taken in ('none', 'content_hidden', 'content_deleted', 'user_warned', 'user_suspended', 'user_banned', 'other'));

commit;
