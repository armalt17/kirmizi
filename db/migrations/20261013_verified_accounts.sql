-- =============================================================================
-- Kirmizi ISG Professional - Onayli hesap rozeti V1
-- On kosul: 20261002_admin_v1_a, 20261003_admin_v1_b (kisg_admin_guard, kisg_admin_audit).
-- Kural: rozet = aktif Pro + yonetimin onayladigi belge + onaydaki ad hala profildeki adla ayni.
--   * Pro: profiles.is_premium; kullanicinin abonelik kaydi varsa ayrica aktif ve suresi dolmamis olmali
--     (odeme kesilince rozet kendiliginden kalkar, yenilenince yeniden belge istenmeden geri gelir).
--     Aboneliksiz manuel premium (admin panelinden) is_premium ile gecerlidir.
--   * Ad degisirse rozet duser; yeniden belge gerekir.
-- public.professional_verifications: kullanici basina tek satir (pending / approved / rejected).
--   Kullanici yalniz kendi satirini okur; yazma yalniz RPC ile (kisg_submit_verification, admin_*).
-- storage 'kisg-verifications' (PRIVATE): yukleme yalniz Pro + kendi klasoru; okuma admin veya kendi klasoru;
--   silme admin veya kendi klasoru. Belge karar verilince admin paneli tarafindan Storage API ile silinir.
-- kisg_verified_users(): onayli hesap kimlikleri (herkese acik; yalniz kimlik, baska bilgi yok).
-- =============================================================================
begin;

create table if not exists public.professional_verifications (
  user_id       uuid        primary key references public.profiles (id) on delete cascade,
  status        text        not null default 'pending',
  doc_path      text,
  verified_name text,
  reason        text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid,
  constraint professional_verifications_status_check check (status in ('pending', 'approved', 'rejected'))
);
create index if not exists professional_verifications_status_idx on public.professional_verifications (status, submitted_at);
comment on table public.professional_verifications is 'Onayli hesap V1: belge onayi. Kullanici kendi satirini okur; yazma yalniz RPC.';

alter table public.professional_verifications enable row level security;
revoke all on public.professional_verifications from public, anon, authenticated;
grant select on public.professional_verifications to authenticated;
drop policy if exists "Users read own verification" on public.professional_verifications;
create policy "Users read own verification" on public.professional_verifications for select to authenticated
  using (user_id = auth.uid());

alter table public.professional_admin_audit_log drop constraint if exists professional_admin_audit_log_target_type_check;
alter table public.professional_admin_audit_log add constraint professional_admin_audit_log_target_type_check
  check (target_type in ('profile', 'post', 'comment', 'service', 'report', 'sanction', 'tag', 'service_category', 'verification'));

-- Ad karsilastirmasi: bosluk, buyuk/kucuk harf ve Turkce karakter farki (I/i, S/s...) onemsiz
create or replace function public.kisg_name_key(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(replace(replace(coalesce(p, ''), 'İ', 'i'), 'I', 'ı')), 'çğıöşüâîû', 'cgiosuaiu'), '\s+', ' ', 'g'))
$$;

create or replace function public.kisg_is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_premium from public.profiles p where p.id = p_user), false)
     and (not exists (select 1 from public.user_subscriptions s where s.user_id = p_user)
          or exists (select 1 from public.user_subscriptions s where s.user_id = p_user and s.status = 'active'
                       and (s.expires_at is null or s.expires_at > now())))
$$;

drop function if exists public.kisg_verified_users();
create function public.kisg_verified_users() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select v.user_id from public.professional_verifications v join public.profiles p on p.id = v.user_id
   where v.status = 'approved' and public.kisg_name_key(v.verified_name) = public.kisg_name_key(p.full_name)
     and public.kisg_is_pro(v.user_id)
$$;

-- Kullanici: yukledigi belgeyi onaya gonderir
create or replace function public.kisg_submit_verification(p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v public.professional_verifications;
begin
  if uid is null then raise exception 'KISG_AUTH' using errcode = '42501'; end if;
  if not public.kisg_is_pro(uid) then raise exception 'KISG_PRO_ONLY: onayli hesap Pro uyelere acik' using errcode = '42501'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'kisg-verifications' and o.name = p_path) then
    raise exception 'KISG_VERIFY_FILE: belge bulunamadi' using errcode = '22023';
  end if;
  select * into v from public.professional_verifications x where x.user_id = uid for update;
  if found and v.status = 'pending' then
    raise exception 'KISG_VERIFY_PENDING: belgen inceleniyor' using errcode = '55000';
  end if;
  if found and v.status = 'approved' and public.kisg_name_key(v.verified_name) = public.kisg_name_key((select p.full_name from public.profiles p where p.id = uid)) then
    raise exception 'KISG_VERIFY_DONE: hesabin zaten onayli' using errcode = '55000';
  end if;
  insert into public.professional_verifications as x (user_id, status, doc_path, submitted_at)
  values (uid, 'pending', p_path, now())
  on conflict (user_id) do update set status = 'pending', doc_path = excluded.doc_path, reason = null,
    submitted_at = now(), decided_at = null, decided_by = null;
  return 'pending';
end $$;

drop function if exists public.admin_list_verifications(text);
create function public.admin_list_verifications(p_status text default 'pending')
returns table (user_id uuid, full_name text, role text, city text, status text, doc_path text, verified_name text, reason text,
               submitted_at timestamptz, decided_at timestamptz, is_pro boolean, pro_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kisg_admin_guard();
  return query
  select v.user_id, p.full_name, coalesce(nullif(p.profession, ''), p.title), p.city, v.status, v.doc_path, v.verified_name, v.reason,
         v.submitted_at, v.decided_at, public.kisg_is_pro(v.user_id),
         (select max(s.expires_at) from public.user_subscriptions s where s.user_id = v.user_id and s.status = 'active')
    from public.professional_verifications v join public.profiles p on p.id = v.user_id
   where p_status is null or v.status = p_status
   order by case when v.status = 'pending' then v.submitted_at end asc nulls last, v.decided_at desc nulls last
   limit 200;
end $$;

-- Admin: onayla / reddet. Belge yolu dondurulur; admin paneli dosyayi Storage API ile siler.
create or replace function public.admin_decide_verification(p_user uuid, p_approve boolean, p_reason text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.professional_verifications;
  v_name text;
begin
  perform public.kisg_admin_guard();
  select * into v from public.professional_verifications x where x.user_id = p_user for update;
  if not found then raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'KISG_VERIFY_STATE: karar verilmis' using errcode = '55000'; end if;
  if p_approve is null or (not p_approve and nullif(btrim(p_reason), '') is null) then
    raise exception 'KISG_ADMIN_INPUT: reddetme sebebi gerekli' using errcode = '22023';
  end if;
  if p_approve and not public.kisg_is_pro(p_user) then
    raise exception 'KISG_NOT_PRO: kullanicinin Pro uyeligi aktif degil' using errcode = '55000';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_user;
  update public.professional_verifications x
     set status = case when p_approve then 'approved' else 'rejected' end,
         verified_name = case when p_approve then v_name else x.verified_name end,
         reason = case when p_approve then null else left(btrim(p_reason), 200) end,
         doc_path = null, decided_at = now(), decided_by = auth.uid()
   where x.user_id = p_user;
  perform public.kisg_admin_audit(case when p_approve then 'verification.approve' else 'verification.reject' end, 'verification', p_user::text,
    p_reason, jsonb_build_object('status', v.status), jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'name', v_name));
  return v.doc_path;
end $$;

-- Admin: onayi geri al (sikayet / kotuye kullanim)
create or replace function public.admin_revoke_verification(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kisg_admin_guard();
  if nullif(btrim(p_reason), '') is null then raise exception 'KISG_ADMIN_INPUT: sebep gerekli' using errcode = '22023'; end if;
  update public.professional_verifications x set status = 'rejected', reason = left(btrim(p_reason), 200), decided_at = now(), decided_by = auth.uid()
   where x.user_id = p_user and x.status = 'approved';
  if not found then raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.kisg_admin_audit('verification.revoke', 'verification', p_user::text, p_reason, jsonb_build_object('status', 'approved'), jsonb_build_object('status', 'rejected'));
end $$;

revoke all on function public.kisg_name_key(text) from public, anon, authenticated;
revoke all on function public.kisg_is_pro(uuid) from public, anon, authenticated;
revoke all on function public.kisg_verified_users() from public, anon, authenticated;
revoke all on function public.kisg_submit_verification(text) from public, anon, authenticated;
revoke all on function public.admin_list_verifications(text) from public, anon, authenticated;
revoke all on function public.admin_decide_verification(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_verification(uuid, text) from public, anon, authenticated;
-- kisg_is_pro storage politikasinda cagrilir (profiles.is_premium zaten herkese acik; ek bilgi sizmaz)
grant execute on function public.kisg_is_pro(uuid) to authenticated;
grant execute on function public.kisg_verified_users() to anon, authenticated;
grant execute on function public.kisg_submit_verification(text) to authenticated;
grant execute on function public.admin_list_verifications(text) to authenticated;
grant execute on function public.admin_decide_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_revoke_verification(uuid, text) to authenticated;

-- Belge deposu: PRIVATE, en fazla 8 MB, yalniz fotograf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kisg-verifications', 'kisg-verifications', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kisg_verifications_pro_insert" on storage.objects;
drop policy if exists "kisg_verifications_select" on storage.objects;
drop policy if exists "kisg_verifications_delete" on storage.objects;
create policy "kisg_verifications_pro_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kisg-verifications' and (storage.foldername(name))[1] = (auth.uid())::text and public.kisg_is_pro(auth.uid()));
create policy "kisg_verifications_select" on storage.objects for select to authenticated
  using (bucket_id = 'kisg-verifications'
         and ((storage.foldername(name))[1] = (auth.uid())::text
              or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')));
create policy "kisg_verifications_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kisg-verifications'
         and ((storage.foldername(name))[1] = (auth.uid())::text
              or exists (select 1 from public.user_roles ur where ur.id = auth.uid() and ur.role = 'admin')));

commit;
