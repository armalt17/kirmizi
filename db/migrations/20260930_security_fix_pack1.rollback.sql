-- Geri alma: Security Fix Pack 1 / Migration 1. Veri değiştirmez; yalnız eklenen trigger ve fonksiyonları kaldırır.
-- Not: Web v4.15 RPC bulunamazsa eski doğrudan okumaya döner (bkz. kisg-professional-app.html), rollback sonrası da çalışır.
begin;
drop trigger if exists kisg_guard_owner_status on public.professional_services;
drop trigger if exists kisg_guard_owner_status on public.professional_post_comments;
drop trigger if exists kisg_guard_owner_status on public.professional_posts;
drop trigger if exists kisg_protect_profile_system_fields on public.profiles;
drop function if exists public.kisg_guard_owner_status();
drop function if exists public.kisg_protect_profile_system_fields();
drop function if exists public.get_my_private_profile();
drop function if exists public.get_public_phone(uuid);
drop function if exists public.kisg_request_is_privileged();
commit;
