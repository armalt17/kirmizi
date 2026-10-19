-- =============================================================================
-- Onayli hesap V1 - GERI ALMA
-- DIKKAT: tum onay kayitlari SILINIR, rozetler kalkar. Once web uygulamasini v4.41.0 oncesine dondurun
-- (yeni surum fonksiyon yoksa rozet gostermez; hata vermez).
-- Depodaki belgeler (bekleyen onaylar) Supabase panelinden Storage > kisg-verifications altindan silinmeli;
-- bucket bos degilse silinmez, bu dosya yalniz politikalari kaldirir.
-- Audit target_type listesindeki 'verification' kalir (eski kayitlar gecerli kalsin diye).
-- =============================================================================
begin;
drop policy if exists "kisg_verifications_pro_insert" on storage.objects;
drop policy if exists "kisg_verifications_select" on storage.objects;
drop policy if exists "kisg_verifications_delete" on storage.objects;
drop function if exists public.admin_revoke_verification(uuid, text);
drop function if exists public.admin_decide_verification(uuid, boolean, text);
drop function if exists public.admin_list_verifications(text);
drop function if exists public.kisg_submit_verification(text);
drop function if exists public.kisg_verified_users();
drop function if exists public.kisg_is_pro(uuid);
drop function if exists public.kisg_name_key(text);
drop table if exists public.professional_verifications;
commit;
