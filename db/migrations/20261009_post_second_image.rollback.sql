-- =============================================================================
-- Post'ta ikinci fotograf - GERI ALMA
-- DIKKAT: postlardaki ikinci gorsel baglantilari (image_path_2) SILINIR; depodaki dosyalar kalir.
-- Once web uygulamasini v4.35.0 oncesine dondurun (yoksa ikinci gorsel secimi kayitta hata verir;
-- okuma tarafi sutun yoksa kendiliginden tek gorsele duser).
-- =============================================================================
begin;
alter table public.professional_posts drop constraint if exists professional_posts_image_path_2_check;
alter table public.professional_posts drop column if exists image_path_2;
commit;
