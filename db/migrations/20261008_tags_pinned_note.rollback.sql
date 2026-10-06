-- =============================================================================
-- Konular V2 / Sabit konu aciklamasi - GERI ALMA
-- Fonksiyonlar 20261006/20261007 tanimlarina doner; DIKKAT: yazilmis aciklamalar (note) SILINIR.
-- =============================================================================
begin;

drop function if exists public.admin_list_tags(text, text, text, integer, integer);
create function public.admin_list_tags(
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

drop function if exists public.kisg_tags_trending(integer);
create function public.kisg_tags_trending(p_limit integer default 8)
returns table (id uuid, name text, slot text, score numeric, posts bigint, posts_24h bigint)
language plpgsql security definer set search_path = public as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 8), 0), 20);
begin
  if coalesce((select r.computed_at from public.professional_tag_score_runs r), '-infinity'::timestamptz) < now() - interval '1 hour' then
    perform public.kisg_tag_refresh_scores();
  end if;
  return query
  with pinned as (
    select t.id, t.name, 'pinned'::text as slot, null::numeric as score, 1 as grp, row_number() over (order by t.name) as rk
    from public.professional_tags t where t.pinned and not t.blocked
  ), top as (
    select t.id, t.name, 'trending'::text, s.score, 2, row_number() over (order by s.score desc, t.last_post_at desc nulls last, t.id)
    from public.professional_tag_scores s join public.professional_tags t on t.id = s.tag_id
    where not t.pinned and not t.blocked and s.score > 0
    order by s.score desc, t.last_post_at desc nulls last, t.id
    limit v_limit
  ), newest as (
    select t.id, t.name, 'new'::text, null::numeric, 3, 1::bigint
    from public.professional_tags t
    where not t.pinned and not t.blocked and t.created_at > now() - interval '24 hours'
      and not exists (select 1 from top where top.id = t.id)
      and exists (select 1 from public.professional_posts p where p.tag_id = t.id and p.status = 'active')
    order by t.created_at desc limit 1
  )
  select x.id, x.name, x.slot, x.score, c.n, c.n24
  from (select * from pinned union all select * from top union all select * from newest) x(id, name, slot, score, grp, rk)
  cross join lateral (
    select count(*) as n, count(*) filter (where p.created_at > now() - interval '24 hours') as n24
    from public.professional_posts p where p.tag_id = x.id and p.status = 'active') c
  order by x.grp, x.rk;
end $$;

alter table public.professional_tags drop column if exists note;

revoke all on function public.admin_list_tags(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_update_tag(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.kisg_tags_trending(integer) from public, anon, authenticated;
grant execute on function public.admin_list_tags(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_update_tag(uuid, jsonb, text) to authenticated;
grant execute on function public.kisg_tags_trending(integer) to anon, authenticated, service_role;

commit;
