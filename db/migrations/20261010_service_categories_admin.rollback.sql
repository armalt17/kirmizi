-- =============================================================================
-- Hizmet kategorileri admin - GERI ALMA
-- Admin fonksiyonlari kaldirilir. Kategoriler, sira ve gizleme durumu (veri) KALIR.
-- Audit kayitlari silinmez (append-only); bu yuzden 'service_category' target_type listede birakilir.
-- =============================================================================
begin;
drop function if exists public.admin_list_service_categories();
drop function if exists public.admin_create_service_category(text, text);
drop function if exists public.admin_update_service_category(uuid, jsonb, text);
drop function if exists public.admin_reorder_service_categories(uuid[], text);
drop function if exists public.admin_delete_service_category(uuid, text);
drop function if exists public.kisg_category_name(text);
drop function if exists public.kisg_category_slug(text);
commit;
