-- =============================================================================
-- Legal V1 - GERI ALMA
-- DIKKAT: legal_acceptances tablosundaki kayitlar SILINIR. Baska tabloya dokunulmaz.
-- =============================================================================
begin;

drop table if exists public.legal_acceptances;
drop function if exists public.kisg_legal_acceptances_before_insert();
drop function if exists public.kisg_legal_acceptances_append_only();

commit;
