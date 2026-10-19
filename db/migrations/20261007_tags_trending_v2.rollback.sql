-- =============================================================================
-- Konular V2 / Gundem paneli sayilari - GERI ALMA: kisg_tags_trending V1 tanimina doner.
-- =============================================================================
begin;

drop function if exists public.kisg_tags_trending(integer);
create function public.kisg_tags_trending(p_limit integer default 8)
returns table (id uuid, name text, slot text, score numeric)
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
  select x.id, x.name, x.slot, x.score
  from (select * from pinned union all select * from top union all select * from newest) x(id, name, slot, score, grp, rk)
  order by x.grp, x.rk;
end $$;

revoke all on function public.kisg_tags_trending(integer) from public, anon, authenticated;
grant execute on function public.kisg_tags_trending(integer) to anon, authenticated, service_role;

commit;
