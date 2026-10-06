-- =============================================================================
-- Post'ta ikinci fotograf - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_column' as check_name, 'professional_posts.image_path_2' as object,
         coalesce((select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.professional_posts'::regclass and attname = 'image_path_2' and not attisdropped), 'YOK') as detail,
         exists (select 1 from pg_attribute where attrelid = 'public.professional_posts'::regclass and attname = 'image_path_2' and not attisdropped and atttypid = 'text'::regtype) as ok
  union all
  select '02_check', 'professional_posts_image_path_2_check',
         coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.professional_posts'::regclass and conname = 'professional_posts_image_path_2_check'), 'YOK'),
         exists (select 1 from pg_constraint where conrelid = 'public.professional_posts'::regclass and conname = 'professional_posts_image_path_2_check' and convalidated)
  union all
  select '03_select_grant', 'anon/authenticated select image_path_2',
         has_column_privilege('anon', 'public.professional_posts', 'image_path_2', 'SELECT')::text || '/' || has_column_privilege('authenticated', 'public.professional_posts', 'image_path_2', 'SELECT')::text,
         has_column_privilege('anon', 'public.professional_posts', 'image_path_2', 'SELECT') and has_column_privilege('authenticated', 'public.professional_posts', 'image_path_2', 'UPDATE')
) v
order by check_name;
