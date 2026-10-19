-- =============================================================================
-- Konular V2 / Admin etiket yonetimi - uygulama SONRASI dogrulama (SALT OKUNUR, TEK SORGU)
-- Her satirda ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_rpc' as check_name, f.sig || ' ' || r.rol as object,
         has_function_privilege(r.rol, f.sig, 'EXECUTE')::text as detail,
         has_function_privilege(r.rol, f.sig, 'EXECUTE') = (r.rol = 'authenticated') as ok
  from (values ('public.admin_list_tags(text,text,text,integer,integer)'), ('public.admin_update_tag(uuid,jsonb,text)'),
               ('public.admin_merge_tags(uuid,uuid,text)')) f(sig)
  cross join (values ('anon'), ('authenticated')) r(rol)
  union all
  select '02_definer', p.proname, format('secdef=%s config=%s', p.prosecdef, p.proconfig),
         p.prosecdef and 'search_path=""' = any(p.proconfig)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_list_tags', 'admin_update_tag', 'admin_merge_tags')
  union all
  select '03_audit_tag', 'professional_admin_audit_log target_type',
         (select pg_get_constraintdef(oid) from pg_constraint where conname = 'professional_admin_audit_log_target_type_check'),
         (select pg_get_constraintdef(oid) from pg_constraint where conname = 'professional_admin_audit_log_target_type_check') like '%''tag''%'
  union all
  select '04_guard_trigger', 'tags_v1 tetikleyicileri yerinde',
         (select count(*) from pg_trigger where tgrelid = 'public.professional_posts'::regclass and tgname like 'trg_professional_posts_tag_%')::text,
         (select count(*) from pg_trigger where tgrelid = 'public.professional_posts'::regclass and tgname like 'trg_professional_posts_tag_%') = 2
) v
order by check_name, object;
