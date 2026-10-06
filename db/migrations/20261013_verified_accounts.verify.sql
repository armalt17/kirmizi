-- =============================================================================
-- Onayli hesap V1 - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_table' as check_name, 'professional_verifications' as object,
         coalesce((select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = to_regclass('public.professional_verifications') and attnum > 0 and not attisdropped), 'YOK') as detail,
         to_regclass('public.professional_verifications') is not null as ok
  union all
  select '02_rls', 'row level security', (select relrowsecurity::text from pg_class where oid = to_regclass('public.professional_verifications')),
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.professional_verifications')), false)
  union all
  select '03_policies', 'yalniz kendi satirini okur', (select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'professional_verifications'),
         (select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'professional_verifications') = 'SELECT'
  union all
  select '04_grants', r.rol || ' ' || p.priv, has_table_privilege(r.rol, 'public.professional_verifications', p.priv)::text,
         has_table_privilege(r.rol, 'public.professional_verifications', p.priv) = (r.rol = 'authenticated' and p.priv = 'SELECT')
  from (values ('anon'), ('authenticated')) r(rol) cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
  union all
  select '05_functions', f.sig, coalesce((select p.prosecdef::text from pg_proc p where p.oid = to_regprocedure(f.sig)), 'YOK'),
         coalesce((select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f.sig)), false)
  from (values ('public.kisg_is_pro(uuid)'), ('public.kisg_verified_users()'), ('public.kisg_submit_verification(text)'),
               ('public.admin_list_verifications(text)'), ('public.admin_decide_verification(uuid,boolean,text)'),
               ('public.admin_revoke_verification(uuid,text)')) f(sig)
  union all
  select '06_execute', f.sig || ' ' || r.rol, has_function_privilege(r.rol, f.sig, 'EXECUTE')::text,
         has_function_privilege(r.rol, f.sig, 'EXECUTE') = (r.rol = 'authenticated' or f.sig = 'public.kisg_verified_users()')
  from (values ('public.kisg_verified_users()'), ('public.kisg_submit_verification(text)'), ('public.admin_decide_verification(uuid,boolean,text)')) f(sig)
  cross join (values ('anon'), ('authenticated')) r(rol)
  union all
  select '07_bucket', 'kisg-verifications', coalesce((select 'public=' || public::text from storage.buckets where id = 'kisg-verifications'), 'YOK'),
         coalesce((select not public from storage.buckets where id = 'kisg-verifications'), false)
  union all
  select '08_storage_policies', 'insert/select/delete', (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'storage' and policyname like 'kisg_verifications_%'),
         (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'storage' and policyname like 'kisg_verifications_%') = 'DELETE,INSERT,SELECT'
  union all
  select '09_audit_target', 'verification', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'professional_admin_audit_log_target_type_check'),
         coalesce((select pg_get_constraintdef(oid) like '%verification%' from pg_constraint where conname = 'professional_admin_audit_log_target_type_check'), false)
) v
order by check_name, object;
