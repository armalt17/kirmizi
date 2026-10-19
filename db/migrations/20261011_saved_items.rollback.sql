-- =============================================================================
-- Kaydedilenler V1 - GERI ALMA
-- DIKKAT: kullanicilarin tum kayitlari SILINIR. Once web uygulamasini v4.38.0 oncesine dondurun
-- (yeni surum tablo yoksa Kaydet dugmelerini gizler; hata vermez).
-- =============================================================================
begin;
drop table if exists public.professional_saved_items;
drop function if exists public.kisg_saved_items_limit();
commit;
