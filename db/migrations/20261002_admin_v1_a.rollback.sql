-- =============================================================================
-- Admin V1 / Migration A — GERİ ALMA
-- DİKKAT: professional_admin_audit_log ve professional_user_sanctions tabloları ile
-- professional_reports çözüm kolonlarındaki veriler SİLİNİR. Mevcut Professional verisine
-- (post/yorum/hizmet/şikâyet satırları) dokunulmaz.
-- =============================================================================
begin;

drop trigger if exists kisg_block_sanctioned_write on public.professional_posts;
drop trigger if exists kisg_block_sanctioned_write on public.professional_post_comments;
drop trigger if exists kisg_block_sanctioned_write on public.professional_services;
drop trigger if exists kisg_block_sanctioned_write on public.professional_reports;
drop trigger if exists kisg_block_sanctioned_write on public.professional_post_likes;
drop trigger if exists kisg_block_sanctioned_write on public.professional_comment_likes;
drop function if exists public.kisg_block_sanctioned_professional_write();
drop function if exists public.kisg_my_active_sanction();
drop function if exists public.kisg_is_admin();

drop table if exists public.professional_user_sanctions;
drop table if exists public.professional_admin_audit_log;
drop function if exists public.kisg_audit_log_append_only();

alter table public.professional_reports drop constraint if exists professional_reports_resolution_note_check;
alter table public.professional_reports drop constraint if exists professional_reports_action_taken_check;
alter table public.professional_reports drop column if exists reviewed_by;
alter table public.professional_reports drop column if exists reviewed_at;
alter table public.professional_reports drop column if exists resolution_note;
alter table public.professional_reports drop column if exists action_taken;

commit;
