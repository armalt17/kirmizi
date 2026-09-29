-- =============================================================================
-- Kırmızı İSG — Security Fix Pack 2 — PARÇA 2/2: storage politikaları (A8)
-- DURUM: PRODUCTION'A UYGULANDI (verify 46/46 ok).
--
-- announcements : yazma/güncelleme/silme yalnız admin (okuma herkese açık kalır)
-- job-images    : silme yalnız dosya sahibi veya admin (yükleme ve okuma değişmez)
-- report-photos : yükleme/silme/API okuma yalnız kendi klasörü (ilk klasör = auth.uid()) veya admin
--                 (bucket public kalır; public URL ile görüntüleme değişmez)
-- profile-avatars ve professional-posts politikalarına dokunulmaz.
--
-- Not: Tek seferliktir. kisg_* politikaları zaten varsa "already exists" hatası verir ve
-- transaction hiçbir şeyi değiştirmeden geri alınır (zararsız). Geri alma: *.rollback.sql
-- =============================================================================
begin;

-- announcements: okuma herkese açık kalır ("Public Access"); yazma/güncelleme/silme yalnız admin
drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated Update" on storage.objects;
drop policy if exists "Authenticated Delete" on storage.objects;
create policy "kisg_announcements_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcements'
              and exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin'));
create policy "kisg_announcements_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'announcements'
         and exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin'))
  with check (bucket_id = 'announcements'
              and exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin'));
create policy "kisg_announcements_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcements'
         and exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin'));

-- job-images: yükleme ve okuma aynen kalır; silme yalnız dosya sahibi veya admin
drop policy if exists "Users can delete their own job images" on storage.objects;
create policy "kisg_job_images_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'job-images'
         and (owner_id = (auth.uid())::text
              or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')));

-- report-photos: kendi klasörü (ilk klasör = auth.uid()) veya admin.
--   Bucket public kaldığı için public URL ile görüntüleme değişmez; kapanan, API ile listeleme/okuma.
drop policy if exists "Authenticated users can upload report photos" on storage.objects;
drop policy if exists "Users can delete their own report photos" on storage.objects;
drop policy if exists "Report photos are public" on storage.objects;
create policy "kisg_report_photos_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "kisg_report_photos_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos'
         and ((storage.foldername(name))[1] = (auth.uid())::text
              or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')));
create policy "kisg_report_photos_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'report-photos'
         and ((storage.foldername(name))[1] = (auth.uid())::text
              or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')));

commit;
