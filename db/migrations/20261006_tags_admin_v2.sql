-- =============================================================================
-- Kirmizi ISG Professional - Konular V2 / Admin etiket yonetimi
-- On kosul: 20261002_admin_v1_a, 20261003_admin_v1_b, 20261005_tags_v1.
--
--   admin_list_tags(p_q, p_sort, p_filter, p_limit, p_offset)
--       ad, aktif post sayisi, olusturma, son aktivite. sort: posts | new | az. filter: pinned | blocked
--   admin_update_tag(p_id, p_patch, p_reason)
--       patch anahtarlari: name (yeniden adlandir; postlar id ile bagli, etkilenmez), pinned, blocked
--       engelli etikete yeni post eklenemez (tags_v1 tetikleyicisi); eski postlar gorunmeye devam eder
--   admin_merge_tags(p_source, p_target, p_reason)
--       kaynak etiketin TUM postlari hedefe tasinir, kaynak etiket silinir
--
-- Kurallar admin V1 ile ayni: SECURITY DEFINER, search_path bos, ilk satir kisg_admin_guard,
-- degisiklik + audit ayni transaction, EXECUTE yalniz authenticated.
-- Audit target_type listesine 'tag' eklenir.
-- =============================================================================
begin;

alter table public.professional_admin_audit_log drop constraint if exists professional_admin_audit_log_target_type_check;
alter table public.professional_admin_audit_log add constraint professional_admin_audit_log_target_type_check
  check (target_type in ('profile', 'post', 'comment', 'service', 'report', 'sanction', 'tag'));

create or replace function public.admin_list_tags(
  p_q text default null, p_sort text default 'posts', p_filter text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, name text, pinned boolean, blocked boolean, created_at timestamptz, last_post_at timestamptz,
  post_count bigint, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(public.kisg_tag_normalize(p_q), '');
begin
  perform public.kisg_admin_guard();
  if coalesce(p_sort, 'posts') not in ('posts', 'new', 'az') or p_filter is not null and p_filter not in ('pinned', 'blocked') then
    raise exception 'KISG_ADMIN_INPUT: sort/filter' using errcode = '22023';
  end if;
  return query
  select t.id, t.name, t.pinned, t.blocked, t.created_at, t.last_post_at, coalesce(c.n, 0), count(*) over ()
    from public.professional_tags t
    left join lateral (select count(*) n from public.professional_posts p where p.tag_id = t.id and p.status = 'active') c on true
   where (q is null or t.normalized_name like '%' || q || '%')
     and (p_filter is null or (p_filter = 'pinned' and t.pinned) or (p_filter = 'blocked' and t.blocked))
   order by case when coalesce(p_sort, 'posts') = 'posts' then coalesce(c.n, 0) end desc nulls last,
            case when p_sort = 'az' then t.normalized_name end,
            t.created_at desc, t.id
   limit public.kisg_admin_limit(p_limit) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_update_tag(p_id uuid, p_patch jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.professional_tags;
  v_name text;
  v_norm text;
  before_row jsonb;
  after_row jsonb;
begin
  perform public.kisg_admin_guard();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('name', 'pinned', 'blocked'))
     or (p_patch ? 'pinned' and jsonb_typeof(p_patch -> 'pinned') <> 'boolean')
     or (p_patch ? 'blocked' and jsonb_typeof(p_patch -> 'blocked') <> 'boolean') then
    raise exception 'KISG_ADMIN_INPUT: patch' using errcode = '22023';
  end if;
  select * into t from public.professional_tags x where x.id = p_id for update;
  if not found then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  before_row := jsonb_build_object('name', t.name, 'pinned', t.pinned, 'blocked', t.blocked);

  v_name := t.name;
  if p_patch ? 'name' then
    v_name := btrim(regexp_replace(coalesce(p_patch ->> 'name', ''), '\s+', ' ', 'g'));
    v_norm := public.kisg_tag_normalize(v_name);
    if char_length(v_name) not between 1 and 20 or v_norm = '' then
      raise exception 'KISG_ADMIN_INPUT: etiket 1-20 karakter olmali' using errcode = '22023';
    end if;
    if exists (select 1 from public.professional_tags x where x.normalized_name = v_norm and x.id <> t.id) then
      raise exception 'KISG_TAG_EXISTS: bu adda etiket var, birlestirmeyi kullan' using errcode = '23505';
    end if;
  end if;

  update public.professional_tags x
     set name = v_name,
         normalized_name = public.kisg_tag_normalize(v_name),
         pinned = coalesce((p_patch ->> 'pinned')::boolean, x.pinned),
         blocked = coalesce((p_patch ->> 'blocked')::boolean, x.blocked)
   where x.id = t.id
  returning jsonb_build_object('name', x.name, 'pinned', x.pinned, 'blocked', x.blocked) into after_row;

  if after_row = before_row then
    return after_row;
  end if;
  perform public.kisg_admin_audit('tag.update', 'tag', t.id::text, p_reason, before_row, after_row);
  return after_row;
end;
$$;

create or replace function public.admin_merge_tags(p_source uuid, p_target uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.professional_tags;
  t public.professional_tags;
  moved integer;
begin
  perform public.kisg_admin_guard();
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'KISG_ADMIN_INPUT: kaynak ve hedef farkli olmali' using errcode = '22023';
  end if;
  select * into s from public.professional_tags x where x.id = p_source for update;
  select * into t from public.professional_tags x where x.id = p_target for update;
  if s.id is null or t.id is null then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- definer olarak calisir: tags_v1 guard tetikleyicisi tag_id degisimine izin verir
  update public.professional_posts p set tag_id = t.id where p.tag_id = s.id;
  get diagnostics moved = row_count;
  update public.professional_tags x
     set last_post_at = nullif(greatest(coalesce(x.last_post_at, '-infinity'), coalesce(s.last_post_at, '-infinity')), '-infinity')
   where x.id = t.id;
  delete from public.professional_tags x where x.id = s.id;

  perform public.kisg_admin_audit('tag.merge', 'tag', t.id::text, p_reason,
    jsonb_build_object('source_id', s.id, 'source_name', s.name, 'target_name', t.name),
    jsonb_build_object('moved_posts', moved));
  return jsonb_build_object('target_id', t.id, 'moved_posts', moved);
end;
$$;

revoke all on function public.admin_list_tags(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_tag(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_merge_tags(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_tags(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_update_tag(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_merge_tags(uuid, uuid, text) to authenticated;

commit;
