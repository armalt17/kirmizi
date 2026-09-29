-- Geri alma: professional_reports tablosunu ve tetikleyici fonksiyonunu kaldırır (kayıtlar silinir).
begin;
drop table if exists public.professional_reports;
drop function if exists public.professional_reports_before_insert();
commit;
