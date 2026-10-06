-- =============================================================================
-- Kirmizi ISG Professional - Post'ta ikinci fotograf
-- professional_posts.image_path_2 : ikinci gorselin depolama yolu (professional-posts bucket), bos olabilir.
-- Kurallar (CHECK):
--   * ikinci gorsel varsa birinci de vardir (eski istemciler yalniz image_path'i gosterir, bozulmaz)
--   * ikisi ayni dosya olamaz
--   * yol, postun sahibinin klasorundedir: {user_id}/{dosya}.webp|jpg (baskasinin gorseline isaret edilemez)
-- Mevcut postlara, politikalara ve image_path'e dokunulmaz.
-- =============================================================================
begin;

alter table public.professional_posts add column if not exists image_path_2 text;
alter table public.professional_posts drop constraint if exists professional_posts_image_path_2_check;
alter table public.professional_posts add constraint professional_posts_image_path_2_check check (
  image_path_2 is null or (
    image_path is not null
    and image_path_2 <> image_path
    and char_length(image_path_2) <= 200
    and image_path_2 ~ '^[0-9a-f-]{36}/[0-9A-Za-z-]+\.(webp|jpg)$'
    and split_part(image_path_2, '/', 1) = user_id::text));

comment on column public.professional_posts.image_path_2 is 'Ikinci post gorseli (istege bagli); image_path olmadan dolu olamaz.';

commit;
