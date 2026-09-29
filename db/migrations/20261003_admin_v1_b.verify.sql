-- =============================================================================
-- Admin V1 / Migration B - uygulama SONRASI dogrulama (SALT OKUNUR, TEK SORGU)
-- Hicbir seyi degistirmez, kisisel veri dondurmez. Her satirda ok sutunu true olmali.
-- =============================================================================
with
expected(name, client) as (values
  ('kisg_admin_guard', false), ('kisg_admin_audit', false), ('kisg_admin_limit', false), ('kisg_admin_apply_moderation', false),
  ('admin_overview', true), ('admin_list_users', true), ('admin_get_user', true), ('admin_list_content', true),
  ('admin_list_reports', true), ('admin_list_audit_log', true), ('admin_update_profile', true), ('admin_moderate_content', true),
  ('admin_sanction_user', true), ('admin_revoke_sanction', true), ('admin_resolve_report', true), ('get_my_sanctions', true)
),
fn as (
  select e.name, e.client, p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ' , '), '') as cfg
  from expected e
  left join pg_proc p on p.proname = e.name and p.pronamespace = 'public'::regnamespace
)
select * from (
  select '01_function' as check_name, f.name as object,
         case when f.oid is null then 'YOK'
              else format('definer=%s %s | public=%s anon=%s auth=%s', f.prosecdef, f.cfg,
                     has_function_privilege('public', f.oid, 'EXECUTE'), has_function_privilege('anon', f.oid, 'EXECUTE'),
                     has_function_privilege('authenticated', f.oid, 'EXECUTE')) end as detail,
         f.oid is not null
         and f.cfg like 'search_path=%'
         and (f.prosecdef or f.name = 'kisg_admin_limit')
         and not has_function_privilege('anon', f.oid, 'EXECUTE')
         and has_function_privilege('authenticated', f.oid, 'EXECUTE') = f.client as ok
  from fn f
  union all
  select '01_function', 'adet', (select count(*) from fn where oid is not null)::text, (select count(*) from fn where oid is not null) = 16
  union all
  select '02_overload', p.proname::text, count(*)::text, count(*) = 1
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in (select name from expected)
  group by p.proname
  union all
  select '03_existing', 'get_professional_admin_overview var', (to_regprocedure('public.get_professional_admin_overview()') is not null)::text,
         to_regprocedure('public.get_professional_admin_overview()') is not null
  union all
  select '03_existing', 'Migration A tablolari', (to_regclass('public.professional_admin_audit_log') is not null and to_regclass('public.professional_user_sanctions') is not null)::text,
         to_regclass('public.professional_admin_audit_log') is not null and to_regclass('public.professional_user_sanctions') is not null
) v
order by check_name, object;
