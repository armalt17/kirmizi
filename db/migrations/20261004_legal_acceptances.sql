-- =============================================================================
-- Kirmizi ISG - Legal V1 / hukuki metin kabul ve bilgilendirme kaydi
-- DURUM: PRODUCTIONA UYGULANDI (verify 21/21 ok).
--
-- public.legal_acceptances (append-only)
--   document_type
--     terms_of_use          : Kullanim Kosullari KABUL kaydi
--     kvkk_notice_informed  : KVKK Aydinlatma Metni ile BILGILENDIRME yapildi kaydi
--                             (acik riza veya KVKK kabulu DEGILDIR)
--   document_version : dokuman surumu, ilk surum 2026-09-30 (YYYY-AA-GG)
--   accepted_at      : kaydin sunucu zamani (kvkk_notice_informed icin bilgilendirme zamani)
--
-- Guvenlik
--   * anon hicbir sey yapamaz.
--   * authenticated yalniz kendi adina INSERT (document_type, document_version, source) yapar
--     ve yalniz kendi kayitlarini okur. user_id ve accepted_at sunucuda belirlenir.
--   * Istemci UPDATE veya DELETE yapamaz. Trigger ayrica UPDATE ve DELETE islemini yalniz
--     sunucu tarafina (service_role veya dashboard) birakir, gecmis surum kayitlari korunur.
--   * Ayni kullanici ayni dokuman surumunu bir kez kaydeder (tekrar denemede 23505 zararsiz).
--
-- Bilerek DOKUNULMAYANLAR: signup trigger (handle_new_user), profiles, auth ayarlari, diger tablolar.
-- user_id bilerek FK degil: auth ve profiles tablolarina kilit veya yetki bagimliligi yaratmaz.
-- =============================================================================
begin;

create table if not exists public.legal_acceptances (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null default auth.uid(),
  document_type    text        not null,
  document_version text        not null,
  accepted_at      timestamptz not null default now(),
  source           text        not null default 'web_signup',
  constraint legal_acceptances_document_type_check    check (document_type in ('terms_of_use', 'kvkk_notice_informed')),
  constraint legal_acceptances_document_version_check check (document_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint legal_acceptances_source_check           check (source in ('web_signup', 'web', 'mobile')),
  constraint legal_acceptances_once                   unique (user_id, document_type, document_version)
);

comment on table public.legal_acceptances is 'Kirmizi ISG hukuki metin kayitlari. terms_of_use kabul, kvkk_notice_informed yalniz bilgilendirme (acik riza degil). Append-only.';

create index if not exists legal_acceptances_user_idx on public.legal_acceptances (user_id, accepted_at desc);

-- INSERT: kimlik ve zaman sunucuda
create or replace function public.kisg_legal_acceptances_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'KISG_LEGAL_AUTH' using errcode = '42501';
    end if;
    new.user_id := auth.uid();
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

-- UPDATE / DELETE: yalniz sunucu tarafi (istemci rolleri reddedilir)
create or replace function public.kisg_legal_acceptances_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'KISG_LEGAL_APPEND_ONLY' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.kisg_legal_acceptances_before_insert() from public, anon, authenticated;
revoke all on function public.kisg_legal_acceptances_append_only() from public, anon, authenticated;

drop trigger if exists kisg_legal_acceptances_before_insert on public.legal_acceptances;
create trigger kisg_legal_acceptances_before_insert
  before insert on public.legal_acceptances
  for each row execute function public.kisg_legal_acceptances_before_insert();

drop trigger if exists kisg_legal_acceptances_append_only on public.legal_acceptances;
create trigger kisg_legal_acceptances_append_only
  before update or delete on public.legal_acceptances
  for each row execute function public.kisg_legal_acceptances_append_only();

-- Yetkiler + RLS
alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from public, anon, authenticated;
grant select on table public.legal_acceptances to authenticated;
grant insert (document_type, document_version, source) on table public.legal_acceptances to authenticated;

drop policy if exists legal_acceptances_insert_own on public.legal_acceptances;
create policy legal_acceptances_insert_own on public.legal_acceptances
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own on public.legal_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

commit;
