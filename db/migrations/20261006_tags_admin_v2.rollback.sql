-- =============================================================================
-- Konular V2 / Admin etiket yonetimi - GERI ALMA
-- Admin etiket RPC'leri kaldirilir. Audit log append-only oldugundan 'tag' kayitlari silinmez;
-- target_type listesindeki 'tag' bu yuzden BIRAKILIR (zararsiz). Etiketlere ve postlara
-- dokunulmaz (birlestirmeler geri alinmaz).
-- =============================================================================
begin;

drop function if exists public.admin_list_tags(text, text, text, integer, integer);
drop function if exists public.admin_update_tag(uuid, jsonb, text);
drop function if exists public.admin_merge_tags(uuid, uuid, text);

commit;
