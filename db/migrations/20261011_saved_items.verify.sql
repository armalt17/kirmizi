-- =============================================================================
-- Kaydedilenler V1 - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_table' as check_name, 'professional_saved_items' as object,
         coalesce((select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = to_regclass('public.professional_saved_items') and attnum > 0 and not attisdropped), 'YOK') as detail,
         to_regclass('public.professional_saved_items') is not null as ok
  union all
  select '02_rls', 'row level security', (select relrowsecurity::text from pg_class where oid = to_regclass('public.professional_saved_items')),
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.professional_saved_items')), false)
  union all
  select '03_policies', 'select/insert/delete (update yok)', (select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'professional_saved_items'),
         (select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'professional_saved_items') = 'DELETE,INSERT,SELECT'
  union all
  select '04_grants', r.rol || ' ' || p.priv, has_table_privilege(r.rol, 'public.professional_saved_items', p.priv)::text,
         has_table_privilege(r.rol, 'public.professional_saved_items', p.priv) = (r.rol = 'authenticated' and p.priv <> 'UPDATE')
  from (values ('anon'), ('authenticated')) r(rol) cross join (values ('SELECT'), ('INSERT'), ('DELETE'), ('UPDATE')) p(priv)
  union all
  select '05_limit_trigger', 'kisg_saved_items_limit', (select tgname from pg_trigger where tgrelid = to_regclass('public.professional_saved_items') and tgname = 'kisg_saved_items_limit'),
         exists (select 1 from pg_trigger where tgrelid = to_regclass('public.professional_saved_items') and tgname = 'kisg_saved_items_limit')
) v
order by check_name, object;
