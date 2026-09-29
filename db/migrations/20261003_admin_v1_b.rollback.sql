-- =============================================================================
-- Admin V1 / Migration B - GERI ALMA
-- Yalniz Migration B fonksiyonlarini kaldirir. Tablolar, veriler, audit log ve
-- yaptirim kayitlari (Migration A) DEGISMEZ.
-- =============================================================================
begin;

drop function if exists public.get_my_sanctions();
drop function if exists public.admin_resolve_report(uuid, text, text, text);
drop function if exists public.admin_revoke_sanction(uuid, text);
drop function if exists public.admin_sanction_user(uuid, text, text, timestamptz, boolean);
drop function if exists public.admin_moderate_content(text, uuid, text, text);
drop function if exists public.admin_update_profile(uuid, jsonb, text);
drop function if exists public.admin_list_audit_log(text, text, uuid, integer, integer);
drop function if exists public.admin_list_reports(text, text, integer, integer);
drop function if exists public.admin_list_content(text, text, text, uuid, integer, integer);
drop function if exists public.admin_get_user(uuid);
drop function if exists public.admin_list_users(text, text, integer, integer);
drop function if exists public.admin_overview();
drop function if exists public.kisg_admin_apply_moderation(text, uuid, text, text);
drop function if exists public.kisg_admin_limit(integer);
drop function if exists public.kisg_admin_audit(text, text, text, text, jsonb, jsonb);
drop function if exists public.kisg_admin_guard();

commit;
