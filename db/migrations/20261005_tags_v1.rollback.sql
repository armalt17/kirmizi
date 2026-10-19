-- =============================================================================
-- Konular V1 / Etiket sistemi - GERI ALMA
-- DIKKAT: etiketler ve postlarin etiket baglantisi (professional_posts.tag_id) SILINIR.
-- Postlarin kendisine, kategorilere ve diger tablolara dokunulmaz.
-- =============================================================================
begin;

drop function if exists public.kisg_tags_trending(integer);
drop function if exists public.kisg_tags_search(text, integer);
drop function if exists public.kisg_tag_resolve(text);
drop function if exists public.kisg_tag_refresh_scores();
drop trigger if exists trg_professional_posts_tag_guard on public.professional_posts;
drop trigger if exists trg_professional_posts_tag_touch on public.professional_posts;
drop function if exists public.kisg_post_tag_guard();
drop function if exists public.kisg_post_tag_touch();
drop index if exists public.professional_posts_tag_created_idx;
alter table public.professional_posts drop column if exists tag_id;
drop table if exists public.professional_tag_scores;
drop table if exists public.professional_tag_score_runs;
drop table if exists public.professional_tags;
drop function if exists public.kisg_tag_normalize(text);

commit;
