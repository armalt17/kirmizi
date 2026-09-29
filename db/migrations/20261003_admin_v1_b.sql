-- =============================================================================
-- Kirmizi ISG Professional - Admin V1 / Migration B (admin RPC fonksiyonlari)
-- DURUM: PRODUCTIONA UYGULANDI (verify 35/35 ok).
-- On kosul: Migration A (kisg_is_admin, audit log, yaptirimlar, sikayet cozum alanlari).
--
-- Ortak kurallar
--   * Tum admin fonksiyonlari SECURITY DEFINER, search_path bos, ilk satirda gercek admin kontrolu
--     (user_roles). Admin degilse KISG_ADMIN_ONLY (42501, PostgREST 403).
--   * Degisiklik ve audit log kaydi ayni transaction icinde. Hata olursa ikisi de geri alinir.
--   * EXECUTE yalniz authenticated (anon yok). Browser tarafinda service_role gerekmez.
--   * Hard delete yok. Icerik yalniz status ve moderasyon alanlariyla yonetilir.
--   * Profil duzenleme yalniz izinli alanlarda. E-posta, telefon, premium ve sayaclar DISINDA
--     (bunlar harici admin panelinde kalir).
--
-- Okuma      : admin_overview, admin_list_users, admin_get_user, admin_list_content,
--              admin_list_reports, admin_list_audit_log
-- Degisiklik : admin_update_profile, admin_moderate_content, admin_sanction_user,
--              admin_revoke_sanction, admin_resolve_report
-- Kullanici  : get_my_sanctions
--
-- Bilerek DOKUNULMAYANLAR: tablolar, RLS politikalari, triggerlar, get_professional_admin_overview.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 0) Ic yardimcilar (istemciye kapali)
-- -----------------------------------------------------------------------------
create or replace function public.kisg_admin_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kisg_is_admin() then
    raise exception 'KISG_ADMIN_ONLY' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.kisg_admin_audit(
  p_action text, p_target_type text, p_target_id text, p_reason text, p_before jsonb, p_after jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.professional_admin_audit_log (admin_id, action, target_type, target_id, reason, before, after)
  values (auth.uid(), p_action, p_target_type, p_target_id, nullif(btrim(p_reason), ''), p_before, p_after)
$$;

create or replace function public.kisg_admin_limit(p_limit integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- Tek bir icerige moderasyon uygular, before/after doner. Cagiran admin fonksiyonu audit yazar.
create or replace function public.kisg_admin_apply_moderation(p_kind text, p_id uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.kisg_admin_guard();
  cur_status text;
  new_status text;
  before_row jsonb;
  after_row jsonb;
begin
  if p_action not in ('hide', 'restore', 'delete') then
    raise exception 'KISG_ADMIN_INPUT: action' using errcode = '22023';
  end if;
  if p_action in ('hide', 'delete') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'KISG_ADMIN_INPUT: reason' using errcode = '22023';
  end if;

  if p_kind = 'post' then
    select t.status, jsonb_build_object('status', t.status, 'moderated_at', t.moderated_at, 'moderation_reason', t.moderation_reason)
      into cur_status, before_row from public.professional_posts t where t.id = p_id for update;
  elsif p_kind = 'comment' then
    select t.status, jsonb_build_object('status', t.status)
      into cur_status, before_row from public.professional_post_comments t where t.id = p_id for update;
  elsif p_kind = 'service' then
    select t.status, jsonb_build_object('status', t.status, 'moderated_at', t.moderated_at, 'moderation_reason', t.moderation_reason)
      into cur_status, before_row from public.professional_services t where t.id = p_id for update;
  else
    raise exception 'KISG_ADMIN_INPUT: kind' using errcode = '22023';
  end if;
  if cur_status is null then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_action = 'hide' then
    if cur_status <> 'active' then
      raise exception 'KISG_ADMIN_STATE: yalniz aktif icerik gizlenir' using errcode = '22023';
    end if;
    new_status := 'hidden';
  elsif p_action = 'restore' then
    if cur_status <> 'hidden' then
      raise exception 'KISG_ADMIN_STATE: yalniz gizlenmis icerik geri acilir' using errcode = '22023';
    end if;
    new_status := 'active';
  else
    if p_kind = 'service' then
      raise exception 'KISG_ADMIN_INPUT: hizmet silinmez, gizlenir' using errcode = '22023';
    end if;
    if cur_status = 'deleted' then
      raise exception 'KISG_ADMIN_STATE: zaten silinmis' using errcode = '22023';
    end if;
    new_status := 'deleted';
  end if;

  if p_kind = 'post' then
    update public.professional_posts t
       set status = new_status,
           moderated_at = now(),
           moderated_by = admin_id,
           moderation_reason = case when p_action = 'restore' then null else btrim(p_reason) end
     where t.id = p_id
    returning jsonb_build_object('status', t.status, 'moderated_at', t.moderated_at, 'moderation_reason', t.moderation_reason) into after_row;
  elsif p_kind = 'comment' then
    update public.professional_post_comments t set status = new_status where t.id = p_id
    returning jsonb_build_object('status', t.status) into after_row;
  else
    update public.professional_services t
       set status = new_status,
           moderated_at = now(),
           moderated_by = admin_id,
           moderation_reason = case when p_action = 'restore' then null else btrim(p_reason) end
     where t.id = p_id
    returning jsonb_build_object('status', t.status, 'moderated_at', t.moderated_at, 'moderation_reason', t.moderation_reason) into after_row;
  end if;

  return jsonb_build_object('before', before_row, 'after', after_row);
end;
$$;

revoke all on function public.kisg_admin_guard() from public, anon, authenticated;
revoke all on function public.kisg_admin_audit(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.kisg_admin_limit(integer) from public, anon, authenticated;
revoke all on function public.kisg_admin_apply_moderation(text, uuid, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1) Genel bakis
-- -----------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kisg_admin_guard();
  return jsonb_build_object(
    'users_total',         (select count(*) from public.profiles),
    'users_new_7d',        (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'posts',               (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_posts group by status) x),
    'comments',            (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_post_comments group by status) x),
    'services',            (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_services group by status) x),
    'reports',             (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_reports group by status) x),
    'active_suspensions',  (select count(*) from public.professional_user_sanctions s where s.type = 'suspension' and s.revoked_at is null and s.starts_at <= now() and s.ends_at > now()),
    'active_bans',         (select count(*) from public.professional_user_sanctions s where s.type = 'ban' and s.revoked_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())),
    'warnings_30d',        (select count(*) from public.professional_user_sanctions s where s.type = 'warning' and s.revoked_at is null and s.created_at >= now() - interval '30 days'),
    'admin_actions_7d',    (select count(*) from public.professional_admin_audit_log where created_at >= now() - interval '7 days')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Kullanicilar
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_q text default null, p_filter text default 'all', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, full_name text, email text, title text, city text, avatar_url text,
  is_discoverable boolean, is_premium boolean, created_at timestamptz,
  post_count bigint, service_count bigint, open_report_count bigint,
  active_sanction text, active_sanction_ends_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(p_q), '');
begin
  perform public.kisg_admin_guard();
  if coalesce(p_filter, 'all') not in ('all', 'sanctioned', 'reported', 'discoverable') then
    raise exception 'KISG_ADMIN_INPUT: filter' using errcode = '22023';
  end if;

  return query
  with base as (
    select p.id, p.full_name, p.email, p.title, p.city, p.avatar_url, p.is_discoverable, p.is_premium, p.created_at,
           (select count(*) from public.professional_posts x where x.user_id = p.id and x.status <> 'deleted') as post_count,
           (select count(*) from public.professional_services x where x.user_id = p.id and x.status <> 'archived') as service_count,
           (select count(*) from public.professional_reports r
             where r.status = 'pending'
               and ((r.target_type = 'profile' and r.target_id = p.id::text)
                 or (r.target_type = 'post' and r.target_id in (select x.id::text from public.professional_posts x where x.user_id = p.id))
                 or (r.target_type = 'comment' and r.target_id in (select x.id::text from public.professional_post_comments x where x.user_id = p.id))
                 or (r.target_type = 'service' and r.target_id in (select x.id::text from public.professional_services x where x.user_id = p.id)))) as open_report_count,
           s.type as active_sanction, s.ends_at as active_sanction_ends_at
      from public.profiles p
      left join lateral (
        select s.type, s.ends_at from public.professional_user_sanctions s
         where s.user_id = p.id and s.type in ('suspension', 'ban') and s.revoked_at is null
           and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
         order by (s.type = 'ban') desc, s.ends_at desc nulls first limit 1) s on true
     where (q is null or p.full_name ilike '%' || q || '%' or p.email ilike '%' || q || '%' or p.id::text = q)
  )
  select b.id, b.full_name, b.email, b.title, b.city, b.avatar_url, b.is_discoverable, b.is_premium, b.created_at,
         b.post_count, b.service_count, b.open_report_count, b.active_sanction, b.active_sanction_ends_at,
         count(*) over () as total_count
    from base b
   where case coalesce(p_filter, 'all')
           when 'sanctioned'   then b.active_sanction is not null
           when 'reported'     then b.open_report_count > 0
           when 'discoverable' then b.is_discoverable
           else true end
   order by b.created_at desc, b.id
   limit public.kisg_admin_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prof jsonb;
begin
  perform public.kisg_admin_guard();
  select to_jsonb(p) - array['daily_reports_used', 'monthly_reports_used', 'last_report_date', 'onesignal_notification_id']
    into prof from public.profiles p where p.id = p_user_id;
  if prof is null then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'profile', prof,
    'is_admin', exists (select 1 from public.user_roles ur where ur.id = p_user_id and ur.role = 'admin'),
    'counts', jsonb_build_object(
      'posts',    (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_posts where user_id = p_user_id group by status) x),
      'comments', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_post_comments where user_id = p_user_id group by status) x),
      'services', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.professional_services where user_id = p_user_id group by status) x),
      'reports_made', (select count(*) from public.professional_reports where reporter_id = p_user_id)),
    'reports_against', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'target_type', r.target_type, 'target_id', r.target_id,
                                'reason', r.reason, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                          from public.professional_reports r
                         where (r.target_type = 'profile' and r.target_id = p_user_id::text)
                            or (r.target_type = 'post' and r.target_id in (select x.id::text from public.professional_posts x where x.user_id = p_user_id))
                            or (r.target_type = 'comment' and r.target_id in (select x.id::text from public.professional_post_comments x where x.user_id = p_user_id))
                            or (r.target_type = 'service' and r.target_id in (select x.id::text from public.professional_services x where x.user_id = p_user_id))),
    'sanctions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
                    from public.professional_user_sanctions s where s.user_id = p_user_id),
    'recent_admin_actions', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
                               from (select * from public.professional_admin_audit_log l
                                      where (l.target_type = 'profile' and l.target_id = p_user_id::text)
                                         or (l.target_type = 'sanction' and l.after ->> 'user_id' = p_user_id::text)
                                      order by l.created_at desc limit 20) a)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Icerik listeleri (post / yorum / hizmet)
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_content(
  p_kind text, p_status text default null, p_q text default null, p_user_id uuid default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  kind text, id uuid, user_id uuid, author_name text, title text, body text, status text,
  created_at timestamptz, moderated_at timestamptz, moderation_reason text, parent_id uuid,
  open_report_count bigint, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(p_q), '');
  lim integer := public.kisg_admin_limit(p_limit);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.kisg_admin_guard();

  if p_kind = 'post' then
    return query
    select 'post'::text, t.id, t.user_id, p.full_name, null::text, t.content, t.status, t.created_at, t.moderated_at, t.moderation_reason, null::uuid,
           (select count(*) from public.professional_reports r where r.target_type = 'post' and r.target_id = t.id::text and r.status = 'pending'),
           count(*) over ()
      from public.professional_posts t left join public.profiles p on p.id = t.user_id
     where (p_status is null or t.status = p_status) and (p_user_id is null or t.user_id = p_user_id)
       and (q is null or t.content ilike '%' || q || '%' or p.full_name ilike '%' || q || '%')
     order by t.created_at desc, t.id limit lim offset off;
  elsif p_kind = 'comment' then
    return query
    select 'comment'::text, t.id, t.user_id, p.full_name, null::text, t.content, t.status, t.created_at, null::timestamptz, null::text, t.post_id,
           (select count(*) from public.professional_reports r where r.target_type = 'comment' and r.target_id = t.id::text and r.status = 'pending'),
           count(*) over ()
      from public.professional_post_comments t left join public.profiles p on p.id = t.user_id
     where (p_status is null or t.status = p_status) and (p_user_id is null or t.user_id = p_user_id)
       and (q is null or t.content ilike '%' || q || '%' or p.full_name ilike '%' || q || '%')
     order by t.created_at desc, t.id limit lim offset off;
  elsif p_kind = 'service' then
    return query
    select 'service'::text, t.id, t.user_id, p.full_name, t.title, t.description, t.status, t.created_at, t.moderated_at, t.moderation_reason, t.category_id,
           (select count(*) from public.professional_reports r where r.target_type = 'service' and r.target_id = t.id::text and r.status = 'pending'),
           count(*) over ()
      from public.professional_services t left join public.profiles p on p.id = t.user_id
     where (p_status is null or t.status = p_status) and (p_user_id is null or t.user_id = p_user_id)
       and (q is null or t.title ilike '%' || q || '%' or t.description ilike '%' || q || '%' or p.full_name ilike '%' || q || '%')
     order by t.created_at desc, t.id limit lim offset off;
  else
    raise exception 'KISG_ADMIN_INPUT: kind' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Sikayet kuyrugu
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_reports(
  p_status text default 'pending', p_target_type text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, reporter_id uuid, reporter_name text, target_type text, target_id text, reason text, details text,
  status text, created_at timestamptz, reviewed_by uuid, reviewed_at timestamptz, resolution_note text, action_taken text,
  target_owner_id uuid, target_owner_name text, target_preview text, target_status text, same_target_pending bigint, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kisg_admin_guard();
  return query
  select r.id, r.reporter_id, rp.full_name, r.target_type, r.target_id, r.reason, r.details,
         r.status, r.created_at, r.reviewed_by, r.reviewed_at, r.resolution_note, r.action_taken,
         tgt.owner_id, op.full_name, left(tgt.preview, 280), tgt.status,
         (select count(*) from public.professional_reports r2 where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.status = 'pending'),
         count(*) over ()
    from public.professional_reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join lateral (
      select x.user_id as owner_id, x.content as preview, x.status from public.professional_posts x where r.target_type = 'post' and x.id::text = r.target_id
      union all
      select x.user_id, x.content, x.status from public.professional_post_comments x where r.target_type = 'comment' and x.id::text = r.target_id
      union all
      select x.user_id, x.title || ' - ' || x.description, x.status from public.professional_services x where r.target_type = 'service' and x.id::text = r.target_id
      union all
      select x.id, coalesce(x.full_name, '') || coalesce(' - ' || x.title, ''), null::text from public.profiles x where r.target_type = 'profile' and x.id::text = r.target_id
    ) tgt on true
    left join public.profiles op on op.id = tgt.owner_id
   where (p_status is null or r.status = p_status) and (p_target_type is null or r.target_type = p_target_type)
   order by r.created_at desc, r.id
   limit public.kisg_admin_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Audit log okuma
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_audit_log(
  p_target_type text default null, p_target_id text default null, p_admin_id uuid default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, admin_id uuid, admin_name text, action text, target_type text, target_id text, reason text,
  before jsonb, after jsonb, created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kisg_admin_guard();
  return query
  select l.id, l.admin_id, p.full_name, l.action, l.target_type, l.target_id, l.reason, l.before, l.after, l.created_at, count(*) over ()
    from public.professional_admin_audit_log l left join public.profiles p on p.id = l.admin_id
   where (p_target_type is null or l.target_type = p_target_type)
     and (p_target_id is null or l.target_id = p_target_id)
     and (p_admin_id is null or l.admin_id = p_admin_id)
   order by l.created_at desc, l.id
   limit public.kisg_admin_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Profil duzenleme (izinli alanlar)
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_profile(p_user_id uuid, p_patch jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array['full_name', 'title', 'profession', 'job_role', 'specialties', 'certificate_class', 'city',
                          'current_company', 'experience_range', 'about', 'avatar_url', 'linkedin_url', 'instagram_url',
                          'website_url', 'social_links', 'is_discoverable', 'show_phone_publicly'];
  bad text;
  before_row jsonb;
  after_row jsonb;
  changed_keys text[];
begin
  perform public.kisg_admin_guard();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'KISG_ADMIN_INPUT: patch' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'KISG_ADMIN_INPUT: reason' using errcode = '22023';
  end if;
  select k into bad from jsonb_object_keys(p_patch) k where k <> all (allowed) limit 1;
  if bad is not null then
    raise exception 'KISG_ADMIN_FIELD: %', bad using errcode = '22023';
  end if;

  select to_jsonb(p) into before_row from public.profiles p where p.id = p_user_id for update;
  if before_row is null then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.profiles p set
    full_name           = case when p_patch ? 'full_name'           then p_patch ->> 'full_name'           else p.full_name end,
    title               = case when p_patch ? 'title'               then p_patch ->> 'title'               else p.title end,
    profession          = case when p_patch ? 'profession'          then p_patch ->> 'profession'          else p.profession end,
    job_role            = case when p_patch ? 'job_role'            then p_patch ->> 'job_role'            else p.job_role end,
    specialties         = case when p_patch ? 'specialties'
                               then case when jsonb_typeof(p_patch -> 'specialties') = 'array'
                                         then array(select jsonb_array_elements_text(p_patch -> 'specialties')) else null end
                               else p.specialties end,
    certificate_class   = case when p_patch ? 'certificate_class'   then p_patch ->> 'certificate_class'   else p.certificate_class end,
    city                = case when p_patch ? 'city'                then p_patch ->> 'city'                else p.city end,
    current_company     = case when p_patch ? 'current_company'     then p_patch ->> 'current_company'     else p.current_company end,
    experience_range    = case when p_patch ? 'experience_range'    then p_patch ->> 'experience_range'    else p.experience_range end,
    about               = case when p_patch ? 'about'               then p_patch ->> 'about'               else p.about end,
    avatar_url          = case when p_patch ? 'avatar_url'          then p_patch ->> 'avatar_url'          else p.avatar_url end,
    linkedin_url        = case when p_patch ? 'linkedin_url'        then p_patch ->> 'linkedin_url'        else p.linkedin_url end,
    instagram_url       = case when p_patch ? 'instagram_url'       then p_patch ->> 'instagram_url'       else p.instagram_url end,
    website_url         = case when p_patch ? 'website_url'         then p_patch ->> 'website_url'         else p.website_url end,
    social_links        = case when p_patch ? 'social_links'        then coalesce(p_patch -> 'social_links', '[]'::jsonb) else p.social_links end,
    is_discoverable     = case when p_patch ? 'is_discoverable'     then (p_patch ->> 'is_discoverable')::boolean     else p.is_discoverable end,
    show_phone_publicly = case when p_patch ? 'show_phone_publicly' then (p_patch ->> 'show_phone_publicly')::boolean else p.show_phone_publicly end
  where p.id = p_user_id
  returning to_jsonb(p) into after_row;

  select array_agg(k order by k) into changed_keys
    from unnest(allowed) k where (before_row -> k) is distinct from (after_row -> k);

  if changed_keys is not null then
    perform public.kisg_admin_audit('profile.update', 'profile', p_user_id::text, p_reason,
      (select jsonb_object_agg(k, before_row -> k) from unnest(changed_keys) k),
      (select jsonb_object_agg(k, after_row -> k) from unnest(changed_keys) k));
  end if;

  return jsonb_build_object('changed', coalesce(to_jsonb(changed_keys), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Icerik moderasyonu
-- -----------------------------------------------------------------------------
create or replace function public.admin_moderate_content(p_kind text, p_id uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  res jsonb;
begin
  perform public.kisg_admin_guard();
  res := public.kisg_admin_apply_moderation(p_kind, p_id, p_action, p_reason);
  perform public.kisg_admin_audit(p_kind || '.' || p_action, p_kind, p_id::text, p_reason, res -> 'before', res -> 'after');
  return res -> 'after';
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Yaptirimlar
-- -----------------------------------------------------------------------------
create or replace function public.admin_sanction_user(
  p_user_id uuid, p_type text, p_reason text, p_ends_at timestamptz default null, p_hide_content boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.kisg_admin_guard();
  new_row public.professional_user_sanctions;
  hidden jsonb := null;
  n_posts integer := 0;
  n_comments integer := 0;
  n_services integer := 0;
  hide_reason text;
begin
  if p_type not in ('warning', 'suspension', 'ban') then
    raise exception 'KISG_ADMIN_INPUT: type' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'KISG_ADMIN_INPUT: reason' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_user_id = admin_id or exists (select 1 from public.user_roles ur where ur.id = p_user_id and ur.role = 'admin') then
    raise exception 'KISG_ADMIN_TARGET: admin hesabina yaptirim uygulanmaz' using errcode = '22023';
  end if;
  if p_type = 'suspension' and (p_ends_at is null or p_ends_at <= now()) then
    raise exception 'KISG_ADMIN_INPUT: suspension icin gelecekte bir bitis tarihi gerekir' using errcode = '22023';
  end if;
  if p_type = 'warning' and p_ends_at is not null then
    raise exception 'KISG_ADMIN_INPUT: warning icin bitis tarihi olmaz' using errcode = '22023';
  end if;
  if p_hide_content and p_type = 'warning' then
    raise exception 'KISG_ADMIN_INPUT: warning icerik gizlemez' using errcode = '22023';
  end if;

  insert into public.professional_user_sanctions (user_id, type, reason, ends_at, created_by)
  values (p_user_id, p_type, btrim(p_reason), p_ends_at, admin_id)
  returning * into new_row;

  if p_hide_content then
    hide_reason := 'Yaptirim: ' || btrim(p_reason);
    update public.professional_posts t set status = 'hidden', moderated_at = now(), moderated_by = admin_id, moderation_reason = hide_reason
     where t.user_id = p_user_id and t.status = 'active';
    get diagnostics n_posts = row_count;
    update public.professional_post_comments t set status = 'hidden' where t.user_id = p_user_id and t.status = 'active';
    get diagnostics n_comments = row_count;
    update public.professional_services t set status = 'hidden', moderated_at = now(), moderated_by = admin_id, moderation_reason = hide_reason
     where t.user_id = p_user_id and t.status = 'active';
    get diagnostics n_services = row_count;
    hidden := jsonb_build_object('posts', n_posts, 'comments', n_comments, 'services', n_services);
  end if;

  perform public.kisg_admin_audit('sanction.create', 'sanction', new_row.id::text, p_reason, null,
    to_jsonb(new_row) || jsonb_build_object('content_hidden', hidden));
  return new_row.id;
end;
$$;

create or replace function public.admin_revoke_sanction(p_sanction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.kisg_admin_guard();
  before_row jsonb;
  after_row jsonb;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'KISG_ADMIN_INPUT: reason' using errcode = '22023';
  end if;
  select to_jsonb(s) into before_row from public.professional_user_sanctions s where s.id = p_sanction_id for update;
  if before_row is null then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if before_row ->> 'revoked_at' is not null then
    raise exception 'KISG_ADMIN_STATE: zaten iptal edilmis' using errcode = '22023';
  end if;

  update public.professional_user_sanctions s
     set revoked_at = now(), revoked_by = admin_id, revoke_reason = btrim(p_reason)
   where s.id = p_sanction_id
  returning to_jsonb(s) into after_row;

  perform public.kisg_admin_audit('sanction.revoke', 'sanction', p_sanction_id::text, p_reason, before_row, after_row);
  return after_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9) Sikayet sonuclandirma
--    p_content_action: none / hide / delete (profil hedefinde yalniz none)
--    Ayni hedefe ait diger BEKLEYEN sikayetler de ayni sonuc ile kapatilir.
-- -----------------------------------------------------------------------------
create or replace function public.admin_resolve_report(
  p_report_id uuid, p_status text, p_note text default null, p_content_action text default 'none')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.kisg_admin_guard();
  rep public.professional_reports;
  action_label text := 'none';
  moderation jsonb := null;
  closed integer;
begin
  if p_status not in ('reviewed', 'resolved', 'dismissed') then
    raise exception 'KISG_ADMIN_INPUT: status' using errcode = '22023';
  end if;
  if coalesce(p_content_action, 'none') not in ('none', 'hide', 'delete') then
    raise exception 'KISG_ADMIN_INPUT: content_action' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'KISG_ADMIN_INPUT: note' using errcode = '22023';
  end if;

  select * into rep from public.professional_reports r where r.id = p_report_id for update;
  if rep.id is null then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if rep.status <> 'pending' then
    raise exception 'KISG_ADMIN_STATE: sikayet zaten sonuclandirilmis' using errcode = '22023';
  end if;

  if coalesce(p_content_action, 'none') <> 'none' then
    if rep.target_type = 'profile' then
      raise exception 'KISG_ADMIN_INPUT: profil sikayetinde icerik islemi yok, yaptirim kullanin' using errcode = '22023';
    end if;
    if p_status = 'dismissed' then
      raise exception 'KISG_ADMIN_INPUT: reddedilen sikayette icerik islemi yapilmaz' using errcode = '22023';
    end if;
    moderation := public.kisg_admin_apply_moderation(rep.target_type, rep.target_id::uuid, p_content_action,
                    coalesce(nullif(btrim(p_note), ''), 'Sikayet: ' || rep.reason));
    action_label := case p_content_action when 'hide' then 'content_hidden' else 'content_deleted' end;
    perform public.kisg_admin_audit(rep.target_type || '.' || p_content_action, rep.target_type, rep.target_id,
      coalesce(nullif(btrim(p_note), ''), 'Sikayet: ' || rep.reason), moderation -> 'before', moderation -> 'after');
  end if;

  update public.professional_reports r
     set status = p_status, reviewed_by = admin_id, reviewed_at = now(),
         resolution_note = nullif(btrim(p_note), ''), action_taken = action_label
   where r.target_type = rep.target_type and r.target_id = rep.target_id and (r.id = rep.id or r.status = 'pending');
  get diagnostics closed = row_count;

  perform public.kisg_admin_audit('report.resolve', 'report', rep.id::text, p_note,
    jsonb_build_object('status', rep.status),
    jsonb_build_object('status', p_status, 'action_taken', action_label, 'target_type', rep.target_type,
                       'target_id', rep.target_id, 'reports_closed', closed));
  return jsonb_build_object('status', p_status, 'action_taken', action_label, 'reports_closed', closed,
                            'content', moderation -> 'after');
end;
$$;

-- -----------------------------------------------------------------------------
-- 10) Kullanici: kendi yaptirimlari (iptal edilmemis olanlar, en yeni 20)
-- -----------------------------------------------------------------------------
create or replace function public.get_my_sanctions()
returns table (id uuid, type text, reason text, starts_at timestamptz, ends_at timestamptz, is_active boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.type, s.reason, s.starts_at, s.ends_at,
         s.starts_at <= now() and (s.ends_at is null or s.ends_at > now()),
         s.created_at
    from public.professional_user_sanctions s
   where s.user_id = auth.uid() and s.revoked_at is null
   order by s.created_at desc
   limit 20
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler: yalniz authenticated (anon ve public yok)
-- -----------------------------------------------------------------------------
revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_user(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_content(text, text, text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_reports(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_audit_log(text, text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_profile(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_moderate_content(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_sanction_user(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_revoke_sanction(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_resolve_report(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_my_sanctions() from public, anon, authenticated;

grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_list_content(text, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.admin_list_reports(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_audit_log(text, text, uuid, integer, integer) to authenticated;
grant execute on function public.admin_update_profile(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_moderate_content(text, uuid, text, text) to authenticated;
grant execute on function public.admin_sanction_user(uuid, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_revoke_sanction(uuid, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text, text) to authenticated;
grant execute on function public.get_my_sanctions() to authenticated;

commit;
