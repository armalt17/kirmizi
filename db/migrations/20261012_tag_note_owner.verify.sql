-- =============================================================================
-- Alan aciklamasi (alani acan) - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_function' as check_name, 'kisg_tag_set_note' as object,
         coalesce((select p.prosecdef::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'kisg_tag_set_note'), 'YOK') as detail,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'kisg_tag_set_note' and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=""%') as ok
  union all
  select '02_grants', r.rol, has_function_privilege(r.rol, 'public.kisg_tag_set_note(uuid,text)', 'EXECUTE')::text,
         has_function_privilege(r.rol, 'public.kisg_tag_set_note(uuid,text)', 'EXECUTE') = (r.rol = 'authenticated')
  from (values ('anon'), ('authenticated')) r(rol)
  union all
  select '03_columns', 'professional_tags.note + created_by',
         (select string_agg(attname, ',' order by attname) from pg_attribute where attrelid = 'public.professional_tags'::regclass and attname in ('note', 'created_by') and not attisdropped),
         (select count(*) from pg_attribute where attrelid = 'public.professional_tags'::regclass and attname in ('note', 'created_by') and not attisdropped) = 2
) v
order by check_name, object;
