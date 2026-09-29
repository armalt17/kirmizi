-- =============================================================================
-- Security Fix Pack 2 — GERİ ALMA (veri değiştirmez)
-- Yetkileri, trigger'ı ve storage politikalarını migration öncesi production haline döndürür
-- (politika tanımları 2026-10-01 production kanıt CSV'sinden birebir).
-- =============================================================================
begin;

grant execute on function public.expire_lapsed_subscriptions() to public, anon, authenticated, service_role;
grant execute on function public.sync_user_premium_status(uuid) to public, anon, authenticated, service_role;
grant execute on function public.update_user_notification_settings(uuid, boolean, text[]) to public, anon, authenticated, service_role;
alter function public.update_user_notification_settings(uuid, boolean, text[]) reset search_path;

drop trigger if exists kisg_guard_subscription_expiry on public.user_subscriptions;
drop function if exists public.kisg_guard_subscription_expiry();

drop policy if exists "kisg_announcements_admin_insert" on storage.objects;
drop policy if exists "kisg_announcements_admin_update" on storage.objects;
drop policy if exists "kisg_announcements_admin_delete" on storage.objects;
drop policy if exists "kisg_job_images_owner_delete" on storage.objects;
drop policy if exists "kisg_report_photos_own_insert" on storage.objects;
drop policy if exists "kisg_report_photos_own_delete" on storage.objects;
drop policy if exists "kisg_report_photos_own_select" on storage.objects;

drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated Update" on storage.objects;
drop policy if exists "Authenticated Delete" on storage.objects;
drop policy if exists "Users can delete their own job images" on storage.objects;
drop policy if exists "Authenticated users can upload report photos" on storage.objects;
drop policy if exists "Users can delete their own report photos" on storage.objects;
drop policy if exists "Report photos are public" on storage.objects;
create policy "Authenticated Upload" on storage.objects for insert
  with check ((bucket_id = 'announcements'::text) and (auth.role() = 'authenticated'::text));
create policy "Authenticated Update" on storage.objects for update
  with check ((bucket_id = 'announcements'::text) and (auth.role() = 'authenticated'::text));
create policy "Authenticated Delete" on storage.objects for delete
  using ((bucket_id = 'announcements'::text) and (auth.role() = 'authenticated'::text));
create policy "Users can delete their own job images" on storage.objects for delete
  using ((bucket_id = 'job-images'::text) and (auth.role() = 'authenticated'::text));
create policy "Authenticated users can upload report photos" on storage.objects for insert
  with check ((bucket_id = 'report-photos'::text) and (auth.role() = 'authenticated'::text));
create policy "Users can delete their own report photos" on storage.objects for delete
  using ((bucket_id = 'report-photos'::text) and (auth.role() = 'authenticated'::text));
create policy "Report photos are public" on storage.objects for select
  using (bucket_id = 'report-photos'::text);

commit;
