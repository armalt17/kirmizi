-- =============================================================================
-- Konular V2 / Sabit konu aciklamasi - dogrulama (SALT OKUNUR, TEK SORGU). ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_column' as check_name, 'professional_tags.note' as object,
         coalesce((select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.professional_tags'::regclass and attname = 'note' and not attisdropped), 'YOK') as detail,
         exists (select 1 from pg_attribute where attrelid = 'public.professional_tags'::regclass and attname = 'note' and not attisdropped) as ok
  union all
  select '02_trending', 'kisg_tags_trending note sutunu', pg_get_function_result('public.kisg_tags_trending(integer)'::regprocedure),
         pg_get_function_result('public.kisg_tags_trending(integer)'::regprocedure) like '%posts_24h bigint, note text%'
  union all
  select '03_admin_list', 'admin_list_tags note sutunu', pg_get_function_result('public.admin_list_tags(text,text,text,integer,integer)'::regprocedure),
         pg_get_function_result('public.admin_list_tags(text,text,text,integer,integer)'::regprocedure) like '%note text%'
  union all
  select '04_grants', f.sig || ' ' || r.rol, has_function_privilege(r.rol, f.sig, 'EXECUTE')::text,
         has_function_privilege(r.rol, f.sig, 'EXECUTE') = (r.rol = 'authenticated' or f.sig like '%trending%')
  from (values ('public.kisg_tags_trending(integer)'), ('public.admin_list_tags(text,text,text,integer,integer)'), ('public.admin_update_tag(uuid,jsonb,text)')) f(sig)
  cross join (values ('anon'), ('authenticated')) r(rol)
) v
order by check_name, object;
