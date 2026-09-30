-- =============================================================================
-- Legal V1 - uygulama SONRASI dogrulama (SALT OKUNUR, TEK SORGU)
-- Hicbir seyi degistirmez, kisisel veri dondurmez. Her satirda ok sutunu true olmali.
-- =============================================================================
with
t as (select to_regclass('public.legal_acceptances') as oid)
select * from (
  select '01_table' as check_name, 'legal_acceptances' as object,
         case when (select oid from t) is null then 'YOK'
              else format('rls=%s policies=%s', c.relrowsecurity,
                     (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'legal_acceptances')) end as detail,
         coalesce(c.relrowsecurity, false)
         and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'legal_acceptances') = 2 as ok
  from (select 1) d left join pg_class c on c.oid = (select oid from t)
  union all
  select '02_columns', 'id user_id document_type document_version accepted_at source',
         (select string_agg(a.attname, ' ' order by a.attnum) from pg_attribute a where a.attrelid = (select oid from t) and a.attnum > 0 and not a.attisdropped),
         (select count(*) from pg_attribute a where a.attrelid = (select oid from t) and a.attnum > 0 and not a.attisdropped
            and a.attname in ('id', 'user_id', 'document_type', 'document_version', 'accepted_at', 'source')) = 6
  union all
  select '03_grants', r.rol || ' ' || x.priv,
         case when (select oid from t) is null then 'YOK' else (case when x.priv = 'DELETE' then has_table_privilege(r.rol, (select oid from t), x.priv) else has_any_column_privilege(r.rol, (select oid from t), x.priv) end)::text end,
         (select oid from t) is not null
         and (case when x.priv = 'DELETE' then has_table_privilege(r.rol, (select oid from t), x.priv) else has_any_column_privilege(r.rol, (select oid from t), x.priv) end) = (r.rol = 'authenticated' and x.priv in ('SELECT', 'INSERT'))
  from (values ('anon'), ('authenticated')) r(rol) cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) x(priv)
  union all
  select '04_insert_columns', a.attname,
         has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')::text,
         has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') = (a.attname in ('document_type', 'document_version', 'source'))
  from pg_attribute a where a.attrelid = (select oid from t) and a.attnum > 0 and not a.attisdropped
  union all
  select '05_trigger', tg.tgname, pg_get_triggerdef(tg.oid), tg.tgenabled = 'O'
  from pg_trigger tg where tg.tgrelid = (select oid from t) and not tg.tgisinternal
  union all
  select '05_trigger', 'adet', (select count(*) from pg_trigger where tgrelid = (select oid from t) and not tgisinternal)::text,
         (select count(*) from pg_trigger where tgrelid = (select oid from t) and not tgisinternal) = 2
  union all
  select '06_type_check', 'document_type degerleri',
         coalesce((select pg_get_constraintdef(oid) from pg_constraint where conname = 'legal_acceptances_document_type_check'), 'YOK'),
         coalesce((select pg_get_constraintdef(oid) from pg_constraint where conname = 'legal_acceptances_document_type_check') like '%kvkk_notice_informed%', false)
  union all
  select '07_signup_trigger', 'handle_new_user degismedi (var)', (to_regprocedure('public.handle_new_user()') is not null)::text,
         to_regprocedure('public.handle_new_user()') is not null
) v
order by check_name, object;
