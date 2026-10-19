-- =============================================================================
-- Kirmizi ISG - Konular V1 / Etiket sistemi
-- DURUM: HENUZ UYGULANMADI. Supabase SQL Editor'da TEK SEFERDE calistirilir; tekrar calistirmak zararsizdir.
-- Sonra: 20261005_tags_v1.verify.sql (her satirda ok = true). Geri alma: 20261005_tags_v1.rollback.sql
--
-- Karar: Konu ayri bir varlik degil, posta eklenen hafif bir etiket. Post basina en fazla 1 etiket,
-- zorunlu degil; paylasildiktan sonra degismez. Eski (etiketsiz) postlar degismez.
--
-- Nesneler
--   public.kisg_tag_normalize(text)      : esleme anahtari (buyuk/kucuk harf, bosluk, Turkce karakter farki yok)
--   public.professional_tags             : id, name (<= 20), normalized_name (benzersiz), pinned, blocked,
--                                          created_by, created_at, last_post_at
--   public.professional_posts.tag_id     : professional_tags.id, null olabilir
--   public.professional_tag_scores       : saatlik gundem skoru onbellegi (istemciye kapali)
--   RPC kisg_tags_trending(p_limit)      : sabitler + skora gore ilk p_limit (8) + son 24 saatin en yeni etiketi
--   RPC kisg_tags_search(p_q, p_limit)   : canli arama (normalize edilmis isimde)
--   RPC kisg_tag_resolve(p_name)         : yaziya gore var olan etiketi dondurur, yoksa olusturur (yalniz oturum)
--
-- Gundem skoru (spesifikasyon): 3 x (son 24s farkli kullanici) + 1 x (son 7g farkli kullanici)
--                               + 0.5 x ln(son 7g toplam post + 1)
--   * toplam post terimine kullanici basina gunde (Istanbul saati) en fazla 3 post sayilir (manipulasyon siniri)
--   * yalniz aktif postlar ve engellenmemis etiketler; 7 gunden eski postlar kendiliginden duser
--   * skor en fazla saatte bir hesaplanir: kisg_tags_trending cagrildiginda onbellek 1 saatten eskiyse
--     yenilenir (pg_cron gerekmez), o saat boyunca sabit kalir
--
-- Guvenlik
--   * Etiketler herkese okunur; istemci etiket tablosuna dogrudan yazamaz (yalniz kisg_tag_resolve).
--   * Bir kullanici 24 saatte en fazla 10 YENI etiket olusturabilir (var olani secmek sinirsiz).
--   * Engellenmis etikete yeni post eklenemez; var olan postlarda gorunmeye devam eder.
--   * Paylasilmis postun tag_id'si istemciden degistirilemez (tetikleyici eski degeri korur).
--   * Admin islemleri (birlestirme, yeniden adlandirma, sabitleme, engelleme) V2'de; o zamana kadar SQL ile:
--       update public.professional_tags set pinned = true  where normalized_name = public.kisg_tag_normalize('Bakanliga Sikayet');
--       update public.professional_tags set blocked = true where normalized_name = public.kisg_tag_normalize('...');
--
-- Bilerek DOKUNULMAYANLAR: professional_post_categories ve posts.category_id (eski postlarin kategorisi gorunmeye
-- devam eder), mevcut RLS politikalari, mevcut tetikleyiciler, profiles, auth.
-- =============================================================================
begin;

-- ---------- normalize ----------
create or replace function public.kisg_tag_normalize(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(lower(translate(coalesce(p, ''), 'ÇĞIİÖŞÜçğıöşüÂâÎîÛû', 'cgiiosucgiosuaaiiuu')), '[^a-z0-9]', '', 'g')
$$;

-- ---------- etiketler ----------
create table if not exists public.professional_tags (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  normalized_name text        not null,
  pinned          boolean     not null default false,
  blocked         boolean     not null default false,
  created_by      uuid        default auth.uid(),
  created_at      timestamptz not null default now(),
  last_post_at    timestamptz,
  constraint professional_tags_name_check       check (char_length(name) between 1 and 20 and name = btrim(name)),
  constraint professional_tags_normalized_check check (normalized_name <> '' and normalized_name = public.kisg_tag_normalize(name)),
  constraint professional_tags_normalized_unique unique (normalized_name)
);
comment on table public.professional_tags is 'Kirmizi ISG Konular V1: posta eklenen etiketler. Istemci yalniz okur; olusturma kisg_tag_resolve ile.';

alter table public.professional_tags enable row level security;
drop policy if exists "Public can read tags" on public.professional_tags;
create policy "Public can read tags" on public.professional_tags for select to anon, authenticated using (true);
revoke all on public.professional_tags from anon, authenticated;
grant select on public.professional_tags to anon, authenticated;

-- ---------- posts.tag_id ----------
alter table public.professional_posts add column if not exists tag_id uuid references public.professional_tags (id) on delete set null;
create index if not exists professional_posts_tag_created_idx on public.professional_posts (tag_id, created_at desc) where tag_id is not null;

-- Yeni postta engellenmis etiket reddedilir; paylasilmis postun etiketi istemciden degismez (sessiz koruma).
-- Etiketi yalniz sunucu tarafi (security definer fonksiyonlar, service_role, dashboard) degistirebilir.
create or replace function public.kisg_post_tag_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.tag_id is distinct from old.tag_id and current_user in ('authenticated', 'anon') then new.tag_id := old.tag_id; end if;
    return new;
  end if;
  if new.tag_id is not null and exists (select 1 from public.professional_tags t where t.id = new.tag_id and t.blocked) then
    raise exception 'Bu etiket kullanilamiyor.' using errcode = 'P0001', hint = 'tag_blocked';
  end if;
  return new;
end $$;
drop trigger if exists trg_professional_posts_tag_guard on public.professional_posts;
create trigger trg_professional_posts_tag_guard before insert or update of tag_id on public.professional_posts
  for each row execute function public.kisg_post_tag_guard();

-- Etiketin son aktivitesi (admin listesi ve "en yeni" slotu icin)
create or replace function public.kisg_post_tag_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tag_id is not null and new.status = 'active' then
    update public.professional_tags set last_post_at = greatest(coalesce(last_post_at, new.created_at), new.created_at) where id = new.tag_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_professional_posts_tag_touch on public.professional_posts;
create trigger trg_professional_posts_tag_touch after insert on public.professional_posts
  for each row execute function public.kisg_post_tag_touch();

-- ---------- gundem skoru onbellegi ----------
create table if not exists public.professional_tag_scores (
  tag_id      uuid        primary key references public.professional_tags (id) on delete cascade,
  score       numeric     not null,
  users_24h   integer     not null,
  users_7d    integer     not null,
  posts_7d    integer     not null,
  computed_at timestamptz not null default now()
);
create table if not exists public.professional_tag_score_runs (
  id          boolean     primary key default true check (id),
  computed_at timestamptz not null
);
alter table public.professional_tag_scores enable row level security;
alter table public.professional_tag_score_runs enable row level security;
revoke all on public.professional_tag_scores, public.professional_tag_score_runs from anon, authenticated;

create or replace function public.kisg_tag_refresh_scores() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('kisg_tag_refresh_scores')) then return; end if;
  delete from public.professional_tag_scores where true;
  insert into public.professional_tag_scores (tag_id, score, users_24h, users_7d, posts_7d, computed_at)
  select p.tag_id,
         3 * count(distinct p.user_id) filter (where p.created_at > now() - interval '24 hours')
           + count(distinct p.user_id)
           + 0.5 * ln(count(*) filter (where p.n <= 3) + 1),
         count(distinct p.user_id) filter (where p.created_at > now() - interval '24 hours'),
         count(distinct p.user_id),
         count(*) filter (where p.n <= 3),
         now()
  from (
    select tag_id, user_id, created_at,
           row_number() over (partition by tag_id, user_id, (created_at at time zone 'Europe/Istanbul')::date order by created_at) as n
    from public.professional_posts
    where tag_id is not null and status = 'active' and created_at > now() - interval '7 days'
  ) p
  join public.professional_tags t on t.id = p.tag_id and not t.blocked
  group by p.tag_id;
  insert into public.professional_tag_score_runs (id, computed_at) values (true, now())
    on conflict (id) do update set computed_at = excluded.computed_at;
end $$;

-- ---------- RPC: gundem seridi ----------
create or replace function public.kisg_tags_trending(p_limit integer default 8)
returns table (id uuid, name text, slot text, score numeric)
language plpgsql security definer set search_path = public as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 8), 0), 20);
begin
  if coalesce((select r.computed_at from public.professional_tag_score_runs r), '-infinity'::timestamptz) < now() - interval '1 hour' then
    perform public.kisg_tag_refresh_scores();
  end if;
  return query
  with pinned as (
    select t.id, t.name, 'pinned'::text as slot, null::numeric as score, 1 as grp, row_number() over (order by t.name) as rk
    from public.professional_tags t where t.pinned and not t.blocked
  ), top as (
    select t.id, t.name, 'trending'::text, s.score, 2, row_number() over (order by s.score desc, t.last_post_at desc nulls last, t.id)
    from public.professional_tag_scores s join public.professional_tags t on t.id = s.tag_id
    where not t.pinned and not t.blocked and s.score > 0
    order by s.score desc, t.last_post_at desc nulls last, t.id
    limit v_limit
  ), newest as (
    select t.id, t.name, 'new'::text, null::numeric, 3, 1::bigint
    from public.professional_tags t
    where not t.pinned and not t.blocked and t.created_at > now() - interval '24 hours'
      and not exists (select 1 from top where top.id = t.id)
      and exists (select 1 from public.professional_posts p where p.tag_id = t.id and p.status = 'active')
    order by t.created_at desc limit 1
  )
  select x.id, x.name, x.slot, x.score
  from (select * from pinned union all select * from top union all select * from newest) x(id, name, slot, score, grp, rk)
  order by x.grp, x.rk;
end $$;

-- ---------- RPC: canli arama ----------
create or replace function public.kisg_tags_search(p_q text, p_limit integer default 20)
returns table (id uuid, name text, pinned boolean, exact boolean)
language sql stable set search_path = public as $$
  with q as (select public.kisg_tag_normalize(p_q) as n)
  select t.id, t.name, t.pinned, t.normalized_name = q.n
  from public.professional_tags t, q
  where not t.blocked and q.n <> '' and t.normalized_name like '%' || q.n || '%'
  order by (t.normalized_name = q.n) desc, (t.normalized_name like q.n || '%') desc, t.last_post_at desc nulls last, t.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- ---------- RPC: etiket sec / olustur ----------
create or replace function public.kisg_tag_resolve(p_name text)
returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_norm text := public.kisg_tag_normalize(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
  v_tag  public.professional_tags;
begin
  if v_uid is null then raise exception 'Etiket eklemek icin giris yap.' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 20 or v_norm = '' then
    raise exception 'Etiket 1-20 karakter olmali.' using errcode = '22023', hint = 'tag_invalid';
  end if;
  select * into v_tag from public.professional_tags t where t.normalized_name = v_norm;
  if not found then
    if (select count(*) from public.professional_tags t where t.created_by = v_uid and t.created_at > now() - interval '24 hours') >= 10 then
      raise exception 'Bugun cok fazla yeni etiket olusturdun. Var olan bir etiketi sec.' using errcode = 'P0001', hint = 'tag_rate';
    end if;
    insert into public.professional_tags (name, normalized_name, created_by) values (v_name, v_norm, v_uid)
      on conflict (normalized_name) do nothing;
    select * into v_tag from public.professional_tags t where t.normalized_name = v_norm;
  end if;
  if v_tag.blocked then raise exception 'Bu etiket kullanilamiyor.' using errcode = 'P0001', hint = 'tag_blocked'; end if;
  return query select v_tag.id, v_tag.name;
end $$;

revoke all on function public.kisg_tag_normalize(text) from public;
revoke all on function public.kisg_post_tag_guard(), public.kisg_post_tag_touch(), public.kisg_tag_refresh_scores() from public, anon, authenticated;
revoke all on function public.kisg_tags_trending(integer), public.kisg_tags_search(text, integer), public.kisg_tag_resolve(text) from public, anon, authenticated;
grant execute on function public.kisg_tag_normalize(text) to anon, authenticated, service_role;
grant execute on function public.kisg_tags_trending(integer), public.kisg_tags_search(text, integer) to anon, authenticated, service_role;
grant execute on function public.kisg_tag_resolve(text) to authenticated, service_role;
grant execute on function public.kisg_tag_refresh_scores() to service_role;

-- Ilk sabit etiket (tasarimdaki ornek). Istenmezse: update ... set pinned = false.
insert into public.professional_tags (name, normalized_name, pinned, created_by)
values ('Bakanlığa Şikayet', public.kisg_tag_normalize('Bakanlığa Şikayet'), true, null)
on conflict (normalized_name) do nothing;

commit;
