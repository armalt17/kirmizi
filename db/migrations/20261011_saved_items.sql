-- =============================================================================
-- Kirmizi ISG Professional - Kaydedilenler V1 (Post + Hizmet)
-- public.professional_saved_items: kullanicinin kaydettigi postlar ve hizmetler. Tamamen kullaniciya ozel:
--   * SELECT / INSERT / DELETE yalniz kendi satirlari (user_id = auth.uid()); UPDATE yok; misafir erisemez.
--   * Yalniz yayindaki (status = 'active') post / hizmet kaydedilebilir; sonradan kalkan icerigin kaydi
--     kullaniciya "artik yayinda degil" olarak gosterilir ve silinebilir (icerik okunamaz, RLS korur).
--   * Kullanici basina en fazla 1000 kayit. Public kaydetme sayisi yok (baska kullanicinin satiri okunamaz).
-- Profil / konu / is ilani / koleksiyon V1 kapsami disinda.
-- =============================================================================
begin;

create table if not exists public.professional_saved_items (
  user_id     uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text        not null,
  target_id   uuid        not null,
  created_at  timestamptz not null default now(),
  constraint professional_saved_items_pkey primary key (user_id, target_type, target_id),
  constraint professional_saved_items_type_check check (target_type in ('post', 'service'))
);
create index if not exists professional_saved_items_user_created_idx on public.professional_saved_items (user_id, created_at desc);
comment on table public.professional_saved_items is 'Kaydedilenler V1: kullaniciya ozel kayitlar (post, service). Yalniz sahibi okur/ekler/siler.';

alter table public.professional_saved_items enable row level security;
revoke all on public.professional_saved_items from public, anon, authenticated;
grant select, insert, delete on public.professional_saved_items to authenticated;

drop policy if exists "Users read own saved items" on public.professional_saved_items;
drop policy if exists "Users save active content" on public.professional_saved_items;
drop policy if exists "Users remove own saved items" on public.professional_saved_items;
create policy "Users read own saved items" on public.professional_saved_items for select to authenticated
  using (user_id = auth.uid());
create policy "Users save active content" on public.professional_saved_items for insert to authenticated
  with check (user_id = auth.uid() and (
    (target_type = 'post' and exists (select 1 from public.professional_posts p where p.id = target_id and p.status = 'active'))
    or (target_type = 'service' and exists (select 1 from public.professional_services s where s.id = target_id and s.status = 'active'))));
create policy "Users remove own saved items" on public.professional_saved_items for delete to authenticated
  using (user_id = auth.uid());

-- Kullanici basina sinir (kotuye kullanim / sinirsiz buyume onlemi)
create or replace function public.kisg_saved_items_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.professional_saved_items s where s.user_id = new.user_id) >= 1000 then
    raise exception 'KISG_SAVED_LIMIT: en fazla 1000 kayit' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.kisg_saved_items_limit() from public, anon, authenticated;
drop trigger if exists kisg_saved_items_limit on public.professional_saved_items;
create trigger kisg_saved_items_limit before insert on public.professional_saved_items
  for each row execute function public.kisg_saved_items_limit();

commit;
