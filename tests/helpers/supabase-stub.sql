-- YALNIZ YEREL TEST: Supabase rollerinin ve hedef tabloların asgari taklidi.
-- Production şemasının birebir kopyası değildir; migration'ın yetki/RLS/tetikleyici
-- davranışını izole doğrulamak içindir.
create extension if not exists pgcrypto;
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase varsayılanı: public'teki yeni tablolara anon/authenticated/service_role tam yetki
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table public.profiles (id uuid primary key references auth.users (id), full_name text, is_discoverable boolean default true);
create table public.professional_posts (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles (id), content text, status text default 'active');
create table public.professional_post_comments (id bigint generated always as identity primary key, post_id uuid references public.professional_posts (id), user_id uuid not null references public.profiles (id), content text, status text default 'active');
create table public.professional_services (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles (id), title text, status text default 'active');
-- Hedef tablolar RLS'li ve politikasız: tetikleyici yine de (SECURITY DEFINER) hedefi doğrulayabilmeli
alter table public.professional_posts enable row level security;
alter table public.professional_post_comments enable row level security;
alter table public.professional_services enable row level security;
alter table public.profiles enable row level security;

insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.profiles values ('11111111-1111-4111-8111-111111111111', 'Ayşe', true), ('22222222-2222-4222-8222-222222222222', 'Mehmet', false);
insert into public.professional_posts (id, user_id, content) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ayşe postu');
insert into public.professional_post_comments (post_id, user_id, content) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ayşe yorumu'), ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Mehmet yorumu');
insert into public.professional_services (id, user_id, title) values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ayşe hizmeti');
