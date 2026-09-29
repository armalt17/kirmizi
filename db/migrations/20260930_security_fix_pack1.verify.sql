-- =============================================================================
-- Security Fix Pack 1 / Migration 1 — uygulama SONRASI doğrulama (SALT OKUNUR, TEK SORGU)
-- SQL Editor'de çalıştırın. Hiçbir şeyi değiştirmez; kişisel veri döndürmez.
-- Her satırda "ok" sütunu true olmalı.
-- =============================================================================
with fn as (
  select p.proname::text as name, p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ';'), '') as cfg
  from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('kisg_request_is_privileged', 'get_public_phone', 'get_my_private_profile', 'kisg_protect_profile_system_fields', 'kisg_guard_owner_status')
)
select * from (
  -- 1) Fonksiyonlar var, doğru güvenlik modu ve sabit search_path
  select '01_function' as check_name, f.name as object,
         format('security_definer=%s %s', f.prosecdef, f.cfg) as detail,
         (f.cfg like 'search_path=%' and f.prosecdef = (f.name in ('get_public_phone', 'get_my_private_profile'))) as ok
  from fn f
  union all
  select '01_function', 'adet', (select count(*) from fn)::text, (select count(*) from fn) = 5
  union all
  -- 2) EXECUTE yetkileri
  select '02_execute', f.name || ' / ' || r.rol, has_function_privilege(r.rol, f.oid, 'EXECUTE')::text,
         has_function_privilege(r.rol, f.oid, 'EXECUTE') = case
           when f.name = 'get_public_phone' then true
           when f.name = 'get_my_private_profile' then r.rol = 'authenticated'
           when f.name = 'kisg_request_is_privileged' then true
           else false end
  from fn f cross join (values ('anon'), ('authenticated')) r(rol)
  union all
  -- 3) Trigger'lar doğru tablolarda ve etkin
  select '03_trigger', tg.tgrelid::regclass::text || ' :: ' || tg.tgname, pg_get_triggerdef(tg.oid), tg.tgenabled = 'O'
  from pg_trigger tg
  where not tg.tgisinternal and tg.tgname in ('kisg_protect_profile_system_fields', 'kisg_guard_owner_status')
  union all
  select '03_trigger', 'adet', (select count(*) from pg_trigger where not tgisinternal and tgname in ('kisg_protect_profile_system_fields', 'kisg_guard_owner_status'))::text,
         (select count(*) from pg_trigger where not tgisinternal and tgname in ('kisg_protect_profile_system_fields', 'kisg_guard_owner_status')) = 4
  union all
  -- 4) A1 bilerek DEĞİŞMEDİ: profiles SELECT hâlâ açık (mobil select * çalışır)
  select '04_a1_unchanged', 'profiles SELECT (anon/authenticated)',
         format('anon=%s authenticated=%s phone(anon)=%s', has_table_privilege('anon', 'public.profiles', 'SELECT'),
                has_table_privilege('authenticated', 'public.profiles', 'SELECT'), has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT')),
         has_table_privilege('anon', 'public.profiles', 'SELECT') and has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  union all
  select '04_a1_unchanged', 'profiles politika sayısı', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles')::text,
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 7
  union all
  -- 5) Mevcut veri etkilenmedi (yalnız sayı): premium sayısı ve aboneliksiz premium sayısı audit'teki gibi
  select '05_data', 'premium_total / premium_without_active_subscription',
         (select count(*) from public.profiles where is_premium is true)::text || ' / ' ||
         (select count(*) from public.profiles p where p.is_premium is true and not exists (
            select 1 from public.user_subscriptions us where us.user_id = p.id and us.status = 'active' and (us.expires_at is null or us.expires_at > now())))::text,
         true
  union all
  -- 6) RPC davranışı (kişisel veri döndürmez; yalnız sayı)
  select '06_rpc', 'get_public_phone yalnız açık telefonları döndürür',
         format('public_ok=%s private_leak=%s',
           (select count(*) from public.profiles p where p.show_phone_publicly is true and nullif(btrim(p.phone), '') is not null and public.get_public_phone(p.id) is not null),
           (select count(*) from public.profiles p where p.show_phone_publicly is not true and public.get_public_phone(p.id) is not null)),
         (select count(*) from public.profiles p where p.show_phone_publicly is not true and public.get_public_phone(p.id) is not null) = 0
) v
order by check_name, object;
