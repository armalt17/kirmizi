-- =============================================================================
-- Alan aciklamasi (alani acan) - GERI ALMA. Fonksiyon kalkar; yazilmis aciklamalar (note) KALIR.
-- =============================================================================
begin;
drop function if exists public.kisg_tag_set_note(uuid, text);
commit;
