-- =============================================================================
-- Admin V1 / Migration A - uygulama SONRASI dogrulama (SALT OKUNUR, TEK SORGU)
-- Hicbir seyi degistirmez, kisisel veri dondurmez. Her satirda ok sutunu true olmali.
-- =============================================================================
with
fn as (
  select p.oid, p.proname::text as name, p.prosecdef, coalesce(array_to_string(p.proconfig, ' , '), '') as cfg
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('kisg_is_admin', 'kisg_my_active_sanction', 'kisg_block_sanctioned_professional_write', 'kisg_audit_log_append_only')
),
tb as (
  select c.oid, c.relname::text as name, c.relrowsecurity as rls
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname in ('professional_admin_audit_log', 'professional_user_sanctions')
)
select * from (
  -- 1) Fonksiyonlar: guvenlik modu, sabit search_path, istemci yetkisi
  select '01_function' as check_name, f.name as object,
         format('definer=%s %s | anon=%s auth=%s', f.prosecdef, f.cfg,
           has_function_privilege('anon', f.oid, 'EXECUTE'), has_function_privilege('authenticated', f.oid, 'EXECUTE')) as detail,
         f.cfg like 'search_path=%'
         and f.prosecdef = (f.name in ('kisg_is_admin', 'kisg_my_active_sanction'))
         and not has_function_privilege('anon', f.oid, 'EXECUTE')
         and has_function_privilege('authenticated', f.oid, 'EXECUTE') = (f.name in ('kisg_is_admin', 'kisg_my_active_sanction')) as ok
  from fn f
  union all
  select '01_function', 'adet', (select count(*) from fn)::text, (select count(*) from fn) = 4

  -- 2) Yeni tablolar: RLS acik, politika yok, istemci yetkisi yok
  union all
  select '02_table', t.name,
         format('rls=%s policies=%s | anon S/I/U/D=%s/%s/%s/%s | auth S/I/U/D=%s/%s/%s/%s', t.rls,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.name),
           has_table_privilege('anon', t.oid, 'SELECT'), has_table_privilege('anon', t.oid, 'INSERT'), has_table_privilege('anon', t.oid, 'UPDATE'), has_table_privilege('anon', t.oid, 'DELETE'),
           has_table_privilege('authenticated', t.oid, 'SELECT'), has_table_privilege('authenticated', t.oid, 'INSERT'), has_table_privilege('authenticated', t.oid, 'UPDATE'), has_table_privilege('authenticated', t.oid, 'DELETE')),
         t.rls
         and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.name) = 0
         and not (has_table_privilege('anon', t.oid, 'SELECT') or has_table_privilege('anon', t.oid, 'INSERT') or has_table_privilege('anon', t.oid, 'UPDATE') or has_table_privilege('anon', t.oid, 'DELETE'))
         and not (has_table_privilege('authenticated', t.oid, 'SELECT') or has_table_privilege('authenticated', t.oid, 'INSERT') or has_table_privilege('authenticated', t.oid, 'UPDATE') or has_table_privilege('authenticated', t.oid, 'DELETE'))
  from tb t
  union all
  select '02_table', 'adet', (select count(*) from tb)::text, (select count(*) from tb) = 2

  -- 3) Triggerlar
  union all
  select '03_trigger', tg.tgrelid::regclass::text || ' :: ' || tg.tgname, pg_get_triggerdef(tg.oid), tg.tgenabled = 'O'
  from pg_trigger tg
  where not tg.tgisinternal and tg.tgname in ('kisg_block_sanctioned_write', 'kisg_audit_log_append_only', 'kisg_audit_log_no_truncate')
  union all
  select '03_trigger', 'adet',
         (select count(*) from pg_trigger where not tgisinternal and tgname in ('kisg_block_sanctioned_write', 'kisg_audit_log_append_only', 'kisg_audit_log_no_truncate'))::text,
         (select count(*) from pg_trigger where not tgisinternal and tgname in ('kisg_block_sanctioned_write', 'kisg_audit_log_append_only', 'kisg_audit_log_no_truncate')) = 8

  -- 4) professional_reports: yeni kolonlar var, istemciye kapali, mevcut INSERT yetkisi ayni
  union all
  select '04_reports_column', x.col,
         case when a.attname is null then 'YOK'
              else format('var | auth_insert=%s auth_update=%s',
                     has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT'),
                     has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')) end,
         a.attname is not null
         and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
         and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
  from (values ('reviewed_by'), ('reviewed_at'), ('resolution_note'), ('action_taken')) x(col)
  left join pg_attribute a on a.attrelid = 'public.professional_reports'::regclass and a.attname = x.col and not a.attisdropped
  union all
  select '04_reports_insert_grant', x.col, has_column_privilege('authenticated', 'public.professional_reports', x.col, 'INSERT')::text,
         has_column_privilege('authenticated', 'public.professional_reports', x.col, 'INSERT')
  from (values ('target_type'), ('target_id'), ('reason'), ('details')) x(col)
  union all
  select '04_reports_policy', 'professional_reports politika sayisi',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'professional_reports')::text,
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'professional_reports') = 1

  -- 5) Yeni tablolar var mi (tablo yoksa sorgu cokmez, satir false olur)
  union all
  select '05_exists', x.rel, case when to_regclass(x.rel) is null then 'YOK' else 'var' end, to_regclass(x.rel) is not null
  from (values ('public.professional_admin_audit_log'), ('public.professional_user_sanctions')) x(rel)
) v
order by check_name, object;
