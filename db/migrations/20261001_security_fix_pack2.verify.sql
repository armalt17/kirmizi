-- =============================================================================
-- Security Fix Pack 2 - uygulama SONRASI dogrulama (SALT OKUNUR, TEK SORGU)
-- SQL Editor icinde calistirin. Hicbir seyi degistirmez, kisisel veri dondurmez.
-- Her satirda ok sutunu true olmali.
-- =============================================================================
with
fn as (
  select p.oid, p.proname::text as name, coalesce(array_to_string(p.proconfig, ' , '), '') as cfg
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('expire_lapsed_subscriptions', 'sync_user_premium_status', 'update_user_notification_settings',
                      'activate_my_subscription', 'sync_my_premium_status', 'kisg_guard_subscription_expiry')
),
sp as (
  select policyname::text as name from pg_policies where schemaname = 'storage' and tablename = 'objects'
)
select * from (
  -- 1) Sunucu fonksiyonlari istemciye kapali, mobilin kullandiklari acik
  select '01_execute' as check_name, f.name || ' / ' || r.rol as object,
         has_function_privilege(r.rol, f.oid, 'EXECUTE')::text as detail,
         has_function_privilege(r.rol, f.oid, 'EXECUTE') = (f.name in ('activate_my_subscription', 'sync_my_premium_status')) as ok
  from fn f cross join (values ('anon'), ('authenticated')) r(rol)
  where f.name <> 'kisg_guard_subscription_expiry'
  union all
  select '01_execute', f.name || ' / service_role', has_function_privilege('service_role', f.oid, 'EXECUTE')::text,
         has_function_privilege('service_role', f.oid, 'EXECUTE')
  from fn f where f.name in ('expire_lapsed_subscriptions', 'sync_user_premium_status', 'update_user_notification_settings')
  union all
  select '02_search_path', f.name, f.cfg, f.cfg like 'search_path=%'
  from fn f where f.name in ('update_user_notification_settings', 'kisg_guard_subscription_expiry')

  -- 2) Trigger kurulu ve etkin
  union all
  select '03_trigger', tg.tgrelid::regclass::text || ' :: ' || tg.tgname, pg_get_triggerdef(tg.oid), tg.tgenabled = 'O'
  from pg_trigger tg where not tg.tgisinternal and tg.tgname = 'kisg_guard_subscription_expiry'
  union all
  select '03_trigger', 'adet',
         (select count(*) from pg_trigger where not tgisinternal and tgname = 'kisg_guard_subscription_expiry')::text,
         (select count(*) from pg_trigger where not tgisinternal and tgname = 'kisg_guard_subscription_expiry') = 1

  -- 3) Storage politikalari: yeniler var, eskiler yok, digerleri duruyor
  union all
  select '04_policy_new', x.name, case when x.name in (select name from sp) then 'var' else 'YOK' end, x.name in (select name from sp)
  from (values ('kisg_announcements_admin_insert'), ('kisg_announcements_admin_update'), ('kisg_announcements_admin_delete'),
               ('kisg_job_images_owner_delete'), ('kisg_report_photos_own_insert'), ('kisg_report_photos_own_delete'),
               ('kisg_report_photos_own_select')) x(name)
  union all
  select '05_policy_removed', x.name, case when x.name in (select name from sp) then 'HALA VAR' else 'kaldirildi' end, x.name not in (select name from sp)
  from (values ('Authenticated Upload'), ('Authenticated Update'), ('Authenticated Delete'), ('Users can delete their own job images'),
               ('Authenticated users can upload report photos'), ('Users can delete their own report photos'), ('Report photos are public')) x(name)
  union all
  select '06_policy_kept', x.name, case when x.name in (select name from sp) then 'var' else 'YOK' end, x.name in (select name from sp)
  from (values ('Public Access'), ('Job images are public'), ('Authenticated users can upload job images'),
               ('Public can view profile avatars'), ('Users can upload own profile avatar'), ('Users can update own profile avatar'),
               ('Users can delete own profile avatar'), ('Admins can upload profile avatars'), ('Admins can update profile avatars'),
               ('Admins can delete profile avatars'), ('Users can upload own professional post images'),
               ('Users can update own professional post images'), ('Users can delete own professional post images')) x(name)

  -- 4) user_subscriptions RLS politikalari degismedi (mobil dogrudan yaziyor)
  union all
  select '07_subs_policies', 'user_subscriptions politika sayisi',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_subscriptions')::text,
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_subscriptions') = 4

  -- 5) Veri degismedi (yalniz sayi, bilgi amacli)
  union all
  select '08_data', 'premium_total / premium_without_active_subscription / active_subscriptions',
         (select count(*) from public.profiles where is_premium is true)::text || ' / ' ||
         (select count(*) from public.profiles p where p.is_premium is true and not exists (
            select 1 from public.user_subscriptions us where us.user_id = p.id and us.status = 'active'
              and (us.expires_at is null or us.expires_at > now())))::text || ' / ' ||
         (select count(*) from public.user_subscriptions where status = 'active')::text,
         true
) v
order by check_name, object;
