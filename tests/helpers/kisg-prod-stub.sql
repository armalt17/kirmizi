-- YALNIZ YEREL TEST: production audit CSV'sinden (2026-09-30) çıkarılan Professional şemasının asgari kopyası.
-- Tablolar, kolonlar, RLS politikaları ve ilgili trigger/fonksiyonlar production tanımlarıyla aynıdır;
-- Supabase'in rol modeli (anon / authenticated / service_role, varsayılan tam yetkiler) taklit edilir.
create extension if not exists pgcrypto;
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------- profiles (production kolonları) ----------
create table public.profiles (
  id uuid primary key references auth.users (id),
  full_name text, email text, phone text, title text, profession text, job_role text, specialties text[],
  certificate_class text, city text, current_company text, experience_range text, about text,
  avatar_url text, linkedin_url text, instagram_url text, website_url text,
  social_links jsonb not null default '[]'::jsonb,
  is_discoverable boolean not null default false, show_phone_publicly boolean not null default false,
  is_premium boolean default false, daily_reports_used integer default 0, monthly_reports_used integer default 0,
  last_report_date date default current_date, onesignal_notification_id text, last_post_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create table public.user_roles (id uuid primary key references auth.users (id), role text);
create table public.user_subscriptions (id bigserial primary key, user_id uuid references public.profiles (id) on delete cascade,
  platform text, product_id text, transaction_id text, original_transaction_id text, status text,
  started_at timestamptz, expires_at timestamptz, grace_period_expires_at timestamptz, will_renew boolean,
  raw_payload jsonb, updated_at timestamptz);
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
create policy "Admins can update all profiles" on public.profiles for update to authenticated
  using (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'))
  with check (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Kullanıcılar kendi profilini güncelleyebilir" on public.profiles for update using (auth.uid() = id);
create policy "Kullanıcılar kendi profilini oluşturabilir" on public.profiles for insert with check (auth.uid() = id);
create policy "Profiller herkes tarafından görülebilir" on public.profiles for select using (true);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile or admins manage" on public.profiles for update
  using (auth.uid() = id or exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Users can view own profile or admins see all" on public.profiles for select
  using (auth.uid() = id or exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "user_roles own" on public.user_roles for select using (auth.uid() = id);

-- signup trigger (production tanımı, dokunulmayacak)
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, phone, title, is_premium)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'title', false)
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, title = excluded.title;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- premium senkronu (production tanımı)
create function public.sync_my_premium_status() returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_user_id uuid; v_is_premium boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select exists (select 1 from public.user_subscriptions us where us.user_id = v_user_id and us.status = 'active'
                   and (us.expires_at is null or us.expires_at > timezone('utc'::text, now()))) into v_is_premium;
  update public.profiles set is_premium = v_is_premium where id = v_user_id;
  return v_is_premium;
end $$;
create function public.sync_user_premium_status(p_user_id uuid) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_is_premium boolean;
begin
  select exists (select 1 from public.user_subscriptions us where us.user_id = p_user_id and us.status = 'active') into v_is_premium;
  update public.profiles set is_premium = v_is_premium where id = p_user_id;
  return v_is_premium;
end $$;

-- ---------- Professional içerik tabloları ----------
create table public.professional_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles (id) on delete cascade,
  content text, image_path text, category_id uuid, profile_featured_order smallint,
  status text not null default 'active' check (status = any (array['active', 'hidden', 'deleted'])),
  moderated_at timestamptz, moderated_by uuid references public.profiles (id) on delete set null, moderation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.professional_post_comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.professional_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade, content text not null,
  status text not null default 'active' check (status = any (array['active', 'hidden', 'deleted'])),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.professional_services (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null, description text not null, category_id uuid, service_region text, service_mode text,
  status text not null default 'active' check (status = any (array['active', 'archived', 'hidden'])),
  moderated_at timestamptz, moderated_by uuid references public.profiles (id) on delete set null, moderation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.professional_posts enable row level security;
alter table public.professional_post_comments enable row level security;
alter table public.professional_services enable row level security;
create policy "Admins can update all posts" on public.professional_posts for update to authenticated
  using (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'))
  with check (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Public can read active posts" on public.professional_posts for select
  using (status = 'active' or user_id = auth.uid() or exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Users can create own posts" on public.professional_posts for insert to authenticated
  with check (user_id = auth.uid() and status = 'active' and moderated_at is null and moderated_by is null and moderation_reason is null);
create policy "Users can update own posts" on public.professional_posts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Admins can manage all comments" on public.professional_post_comments for all to authenticated
  using (exists (select 1 from user_roles ur where ur.id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from user_roles ur where ur.id = auth.uid() and ur.role = 'admin'));
create policy "Authenticated users can create comments" on public.professional_post_comments for insert to authenticated
  with check (user_id = auth.uid() and status = 'active' and exists (select 1 from professional_posts p where p.id = professional_post_comments.post_id and p.status = 'active'));
create policy "Public can read active comments" on public.professional_post_comments for select
  using (status = 'active' or user_id = auth.uid() or exists (select 1 from user_roles ur where ur.id = auth.uid() and ur.role = 'admin'));
create policy "Users can update own comments" on public.professional_post_comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = any (array['active', 'deleted']));
create policy "Admins can update all services" on public.professional_services for update to authenticated
  using (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'))
  with check (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Public can read active services" on public.professional_services for select
  using (status = 'active' or user_id = auth.uid() or exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Users can create own services" on public.professional_services for insert to authenticated
  with check (user_id = auth.uid() and status = 'active' and moderated_at is null and moderated_by is null and moderation_reason is null);
create policy "Users can update own services" on public.professional_services for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- production'daki moderasyon alanı koruması ve aktif hizmet sınırı (aynı tanımlar)
create function public.kisg_protect_post_moderation_fields() returns trigger language plpgsql set search_path to 'public' as $$
declare is_admin boolean;
begin
  if new.moderated_at is not distinct from old.moderated_at and new.moderated_by is not distinct from old.moderated_by
     and new.moderation_reason is not distinct from old.moderation_reason then return new; end if;
  select exists (select 1 from public.user_roles where id = auth.uid() and role = 'admin') into is_admin;
  if not is_admin then raise exception 'Moderasyon alanlarını yalnızca admin değiştirebilir.'; end if;
  return new;
end $$;
create trigger trg_protect_post_moderation_fields before update on public.professional_posts for each row execute function public.kisg_protect_post_moderation_fields();
create trigger trg_protect_service_moderation_fields before update on public.professional_services for each row execute function public.kisg_protect_post_moderation_fields();
create function public.kisg_limit_active_services() returns trigger language plpgsql set search_path to 'public' as $$
declare active_count integer;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'active' then return new; end if;
  select count(*) into active_count from public.professional_services where user_id = new.user_id and status = 'active' and id <> new.id;
  if active_count >= 5 then raise exception 'Bir kullanıcı en fazla 5 aktif hizmet yayınlayabilir.'; end if;
  return new;
end $$;
create trigger trg_limit_active_services before insert or update of status on public.professional_services for each row execute function public.kisg_limit_active_services();
create function public.kisg_refresh_last_post_at() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare affected_user_id uuid;
begin
  affected_user_id := coalesce(new.user_id, old.user_id);
  update public.profiles set last_post_at = (select max(p.created_at) from public.professional_posts p where p.user_id = affected_user_id and p.status = 'active')
   where id = affected_user_id;
  return coalesce(new, old);
end $$;
create trigger trg_professional_posts_refresh_activity after insert or delete or update of status on public.professional_posts for each row execute function public.kisg_refresh_last_post_at();

-- ---------- veri ----------
-- A: normal kullanıcı (telefonu gizli)  M: normal kullanıcı (telefonu açık)  P: manuel premium  X: admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'ayse@ornek.com', '{"full_name":"Ayşe Yılmaz"}'),
  ('22222222-2222-4222-8222-222222222222', 'mehmet@ornek.com', '{"full_name":"Mehmet Öztürk","phone":"05324445566"}'),
  ('33333333-3333-4333-8333-333333333333', 'premium@ornek.com', '{"full_name":"Manuel Premium"}'),
  ('99999999-9999-4999-8999-999999999999', 'admin@ornek.com', '{"full_name":"Admin"}');
insert into public.user_roles values ('99999999-9999-4999-8999-999999999999', 'admin');
update public.profiles set phone = '+905551112233', show_phone_publicly = false, onesignal_notification_id = 'os-a',
       daily_reports_used = 2, monthly_reports_used = 7, last_report_date = (now() at time zone 'Europe/Istanbul')::date
 where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set phone = '+905324445566', show_phone_publicly = true where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set is_premium = true where id = '33333333-3333-4333-8333-333333333333';   -- admin panelinden manuel premium (aboneliksiz)
