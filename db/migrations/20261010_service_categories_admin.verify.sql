-- =============================================================================
-- Hizmet kategorileri admin - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_columns' as check_name, 'professional_service_categories' as object,
         (select string_agg(attname || ':' || format_type(atttypid, atttypmod), ', ' order by attnum) from pg_attribute where attrelid = 'public.professional_service_categories'::regclass and attnum > 0 and not attisdropped) as detail,
         (select count(*) from pg_attribute where attrelid = 'public.professional_service_categories'::regclass and not attisdropped and attname in ('id', 'name', 'slug', 'sort_order', 'is_active')) = 5
         and (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.professional_service_categories'::regclass and attname = 'id') = 'uuid' as ok
  union all
  select '02_audit_target', 'professional_admin_audit_log_target_type_check',
         (select pg_get_constraintdef(oid) from pg_constraint where conname = 'professional_admin_audit_log_target_type_check'),
         (select pg_get_constraintdef(oid) from pg_constraint where conname = 'professional_admin_audit_log_target_type_check') like '%service_category%'
  union all
  select '03_grants', f.sig || ' ' || r.rol, has_function_privilege(r.rol, f.sig, 'EXECUTE')::text,
         has_function_privilege(r.rol, f.sig, 'EXECUTE') = (r.rol = 'authenticated')
  from (values ('public.admin_list_service_categories()'), ('public.admin_create_service_category(text,text)'), ('public.admin_update_service_category(uuid,jsonb,text)'),
               ('public.admin_reorder_service_categories(uuid[],text)'), ('public.admin_delete_service_category(uuid,text)')) f(sig)
  cross join (values ('anon'), ('authenticated')) r(rol)
  union all
  select '04_definer', p.proname, p.prosecdef::text || ' ' || coalesce(array_to_string(p.proconfig, ','), ''),
         p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=""%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'admin_%service_categor%'
) v
order by check_name, object;
