-- =============================================================================
-- Kirmizi ISG Professional - Hizmet kategorileri admin yonetimi
-- On kosul: 20261002_admin_v1_a, 20261003_admin_v1_b (kisg_admin_guard, kisg_admin_audit),
--           20261006_tags_admin_v2 (audit target_type listesi).
-- Tablo: public.professional_service_categories (id uuid, name, slug, sort_order, is_active) - mevcut.
-- Site (Hizmet Bul cipleri + Hizmet Yayinla formu) zaten is_active = true olanlari sort_order'a gore okur;
-- burada yalniz admin RPC'leri eklenir:
--   admin_list_service_categories()                         : tum kategoriler + aktif hizmet sayisi
--   admin_create_service_category(p_name, p_reason)         : yeni kategori (sona eklenir, aktif)
--   admin_update_service_category(p_id, p_patch, p_reason)  : patch {name, is_active}
--   admin_reorder_service_categories(p_ids, p_reason)       : tam liste sirasi -> sort_order 10, 20, ...
--   admin_delete_service_category(p_id, p_reason)           : yalniz hic hizmeti yoksa (yoksa KISG_CATEGORY_IN_USE)
-- Kurallar admin V1 ile ayni: SECURITY DEFINER, search_path bos, ilk satir kisg_admin_guard,
-- degisiklik + audit ayni transaction, EXECUTE yalniz authenticated. Audit target_type'a 'service_category' eklenir.
-- =============================================================================
begin;

alter table public.professional_service_categories add column if not exists sort_order integer not null default 0;
alter table public.professional_service_categories add column if not exists is_active boolean not null default true;

alter table public.professional_admin_audit_log drop constraint if exists professional_admin_audit_log_target_type_check;
alter table public.professional_admin_audit_log add constraint professional_admin_audit_log_target_type_check
  check (target_type in ('profile', 'post', 'comment', 'service', 'report', 'sanction', 'tag', 'service_category'));

-- Ad -> slug: Turkce karakterler sadelesir, harf/rakam disi '-' olur (ornek: "Is Hijyeni / Ortam Olcumleri" -> is-hijyeni-ortam-olcumleri)
create or replace function public.kisg_category_slug(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(replace(replace(coalesce(p, ''), 'İ', 'i'), 'I', 'ı')), 'çğıöşüâîû', 'cgiosuaiu'), '[^a-z0-9]+', '-', 'g'), '-')
$$;

create or replace function public.kisg_category_name(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) not between 2 and 60 or public.kisg_category_slug(v) = '' then
    raise exception 'KISG_ADMIN_INPUT: kategori adi 2-60 karakter olmali' using errcode = '22023';
  end if;
  return v;
end $$;

drop function if exists public.admin_list_service_categories();
create function public.admin_list_service_categories()
returns table (id uuid, name text, slug text, sort_order integer, is_active boolean, services bigint, all_services bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kisg_admin_guard();
  return query
  select c.id, c.name, c.slug, c.sort_order::integer, c.is_active,
         (select count(*) from public.professional_services s where s.category_id = c.id and s.status = 'active'),
         (select count(*) from public.professional_services s where s.category_id = c.id)
    from public.professional_service_categories c
   order by c.sort_order, c.id;
end $$;

create or replace function public.admin_create_service_category(p_name text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_slug text;
  v_try text;
  n integer := 1;
  row jsonb;
begin
  perform public.kisg_admin_guard();
  v_name := public.kisg_category_name(p_name);
  if exists (select 1 from public.professional_service_categories c where public.kisg_category_slug(c.name) = public.kisg_category_slug(v_name)) then
    raise exception 'KISG_CATEGORY_EXISTS: bu adda kategori var' using errcode = '23505';
  end if;
  v_slug := public.kisg_category_slug(v_name); v_try := v_slug;
  while exists (select 1 from public.professional_service_categories c where c.slug = v_try) loop
    n := n + 1; v_try := v_slug || '-' || n;
  end loop;
  insert into public.professional_service_categories as c (name, slug, sort_order, is_active)
  values (v_name, v_try, coalesce((select max(x.sort_order) from public.professional_service_categories x), 0) + 10, true)
  returning jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'sort_order', c.sort_order, 'is_active', c.is_active) into row;
  perform public.kisg_admin_audit('service_category.create', 'service_category', row ->> 'id', p_reason, null, row);
  return row;
end $$;

create or replace function public.admin_update_service_category(p_id uuid, p_patch jsonb, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.professional_service_categories;
  v_name text;
  before_row jsonb;
  after_row jsonb;
begin
  perform public.kisg_admin_guard();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('name', 'is_active'))
     or (p_patch ? 'is_active' and jsonb_typeof(p_patch -> 'is_active') <> 'boolean') then
    raise exception 'KISG_ADMIN_INPUT: patch' using errcode = '22023';
  end if;
  select * into c from public.professional_service_categories x where x.id = p_id for update;
  if not found then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  before_row := jsonb_build_object('name', c.name, 'is_active', c.is_active);
  v_name := c.name;
  if p_patch ? 'name' then
    v_name := public.kisg_category_name(p_patch ->> 'name');
    if exists (select 1 from public.professional_service_categories x where x.id <> c.id and public.kisg_category_slug(x.name) = public.kisg_category_slug(v_name)) then
      raise exception 'KISG_CATEGORY_EXISTS: bu adda kategori var' using errcode = '23505';
    end if;
  end if;
  -- slug degismez: mevcut baglantilar ve ikon eslesmesi korunur
  update public.professional_service_categories x
     set name = v_name, is_active = coalesce((p_patch ->> 'is_active')::boolean, x.is_active)
   where x.id = c.id
  returning jsonb_build_object('name', x.name, 'is_active', x.is_active) into after_row;
  if after_row = before_row then
    return after_row;
  end if;
  perform public.kisg_admin_audit('service_category.update', 'service_category', c.id::text, p_reason, before_row, after_row);
  return after_row;
end $$;

create or replace function public.admin_reorder_service_categories(p_ids uuid[], p_reason text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb;
  total integer;
begin
  perform public.kisg_admin_guard();
  select count(*) into total from public.professional_service_categories;
  if p_ids is null or cardinality(p_ids) <> total or (select count(distinct x) from unnest(p_ids) x) <> total
     or exists (select 1 from public.professional_service_categories c where not (c.id = any (p_ids))) then
    raise exception 'KISG_ADMIN_INPUT: tum kategoriler bir kez verilmeli' using errcode = '22023';
  end if;
  select jsonb_agg(c.id order by c.sort_order, c.id) into before_row from public.professional_service_categories c;
  update public.professional_service_categories c set sort_order = o.ord * 10
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id;
  perform public.kisg_admin_audit('service_category.reorder', 'service_category', 'all', p_reason, before_row, to_jsonb(p_ids));
  return total;
end $$;

create or replace function public.admin_delete_service_category(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.professional_service_categories;
  before_row jsonb;
begin
  perform public.kisg_admin_guard();
  select * into c from public.professional_service_categories x where x.id = p_id for update;
  if not found then
    raise exception 'KISG_ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.professional_services s where s.category_id = c.id) then
    raise exception 'KISG_CATEGORY_IN_USE: bu kategoride hizmet var, gizlemeyi kullan' using errcode = '23503';
  end if;
  before_row := jsonb_build_object('name', c.name, 'slug', c.slug, 'sort_order', c.sort_order, 'is_active', c.is_active);
  delete from public.professional_service_categories x where x.id = c.id;
  perform public.kisg_admin_audit('service_category.delete', 'service_category', c.id::text, p_reason, before_row, null);
  return before_row;
end $$;

revoke all on function public.kisg_category_slug(text) from public, anon, authenticated;
revoke all on function public.kisg_category_name(text) from public, anon, authenticated;
revoke all on function public.admin_list_service_categories() from public, anon, authenticated;
revoke all on function public.admin_create_service_category(text, text) from public, anon, authenticated;
revoke all on function public.admin_update_service_category(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_reorder_service_categories(uuid[], text) from public, anon, authenticated;
revoke all on function public.admin_delete_service_category(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_service_categories() to authenticated;
grant execute on function public.admin_create_service_category(text, text) to authenticated;
grant execute on function public.admin_update_service_category(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_reorder_service_categories(uuid[], text) to authenticated;
grant execute on function public.admin_delete_service_category(uuid, text) to authenticated;

commit;
