-- =============================================================================
-- Konular V2 / Gundem paneli sayilari - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_columns' as check_name, 'kisg_tags_trending donus sutunlari' as object,
         pg_get_function_result('public.kisg_tags_trending(integer)'::regprocedure) as detail,
         pg_get_function_result('public.kisg_tags_trending(integer)'::regprocedure) like '%posts bigint, posts_24h bigint%' as ok
  union all
  select '02_grants', r.rol, has_function_privilege(r.rol, 'public.kisg_tags_trending(integer)', 'EXECUTE')::text,
         has_function_privilege(r.rol, 'public.kisg_tags_trending(integer)', 'EXECUTE')
  from (values ('anon'), ('authenticated')) r(rol)
  union all
  select '03_call', 'kisg_tags_trending(8) calisiyor', (select count(*) from public.kisg_tags_trending(8))::text, true
) v
order by check_name, object;
