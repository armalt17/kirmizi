-- =============================================================================
-- Kirmizi ISG Professional - Alan aciklamasi: alani acan da yazabilir (v4.40.0)
-- On kosul: 20261005_tags_v1 (created_by), 20261008_tags_pinned_note (note), 20261002_admin_v1_a (yaptirim).
--   kisg_tag_set_note(p_id, p_note) : alani acan kullanici (created_by = auth.uid()) kendi alaninin aciklamasini
--                                     yazar / degistirir / bos birakip kaldirir (en fazla 160 karakter).
--   Sabit alanlarin aciklamasi yalniz admin'de (admin_update_tag, degismedi). Engelli alan ve yaptirimli kullanici yazamaz.
-- Tablo, politikalar ve diger fonksiyonlar degismez; aciklama zorunlu degildir.
-- =============================================================================
begin;

create or replace function public.kisg_tag_set_note(p_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.professional_tags;
  v text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  if v_uid is null then
    raise exception 'KISG_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.kisg_my_active_sanction()) then
    raise exception 'KISG_USER_SUSPENDED' using errcode = '42501';
  end if;
  select * into t from public.professional_tags x where x.id = p_id for update;
  if not found or t.blocked then
    raise exception 'KISG_TAG_NOT_FOUND' using errcode = 'P0002';
  end if;
  if t.pinned then
    raise exception 'KISG_TAG_PINNED: sabit alanin aciklamasini yonetim yazar' using errcode = '42501';
  end if;
  if t.created_by is distinct from v_uid then
    raise exception 'KISG_TAG_NOT_OWNER' using errcode = '42501';
  end if;
  if char_length(v) > 160 then
    raise exception 'KISG_ADMIN_INPUT: aciklama en fazla 160 karakter' using errcode = '22023';
  end if;
  update public.professional_tags x set note = v where x.id = t.id;
  return v;
end;
$$;

revoke all on function public.kisg_tag_set_note(uuid, text) from public, anon, authenticated;
grant execute on function public.kisg_tag_set_note(uuid, text) to authenticated;

commit;
