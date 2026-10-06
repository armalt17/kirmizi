-- =============================================================================
-- Alan aciklamasi: kullanici yazmasi GERI ALINDI (v4.40.1). Aciklamayi yalniz yonetim yazar (admin_update_tag).
-- 20261012_tag_note_owner.sql Supabase'de UYGULANDIYSA bu dosyayi calistirin; uygulanmadiysa gerek yok (zararsiz).
-- Fonksiyon kalkar; yazilmis aciklamalar (note) KALIR.
-- =============================================================================
begin;
drop function if exists public.kisg_tag_set_note(uuid, text);
commit;
