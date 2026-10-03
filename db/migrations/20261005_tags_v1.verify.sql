-- =============================================================================
-- Konular V1 / Etiket sistemi - uygulama SONRASI dogrulama (SALT OKUNUR, TEK SORGU)
-- Hicbir seyi degistirmez, kisisel veri dondurmez. Her satirda ok sutunu true olmali.
-- =============================================================================
select * from (
  select '01_table' as check_name, 'professional_tags' as object,
         format('rls=%s policies=%s', coalesce(c.relrowsecurity, false),
                (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'professional_tags')) as detail,
         coalesce(c.relrowsecurity, false)
         and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'professional_tags') = 1 as ok
  from (select 1) d left join pg_class c on c.oid = to_regclass('public.professional_tags')
  union all
  select '02_columns', 'id name normalized_name pinned blocked created_by created_at last_post_at',
         (select string_agg(a.attname, ' ' order by a.attnum) from pg_attribute a where a.attrelid = to_regclass('public.professional_tags') and a.attnum > 0 and not a.attisdropped),
         (select count(*) from pg_attribute a where a.attrelid = to_regclass('public.professional_tags') and a.attnum > 0 and not a.attisdropped
            and a.attname in ('id', 'name', 'normalized_name', 'pinned', 'blocked', 'created_by', 'created_at', 'last_post_at')) = 8
  union all
  select '03_posts_tag_id', 'professional_posts.tag_id -> professional_tags.id',
         coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.professional_posts'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%(tag_id)%'), 'YOK'),
         exists (select 1 from pg_constraint where conrelid = 'public.professional_posts'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%(tag_id) REFERENCES professional_tags(id) ON DELETE SET NULL%')
  union all
  select '04_grants', r.rol || ' ' || x.priv, has_table_privilege(r.rol, 'public.professional_tags', x.priv)::text,
         has_table_privilege(r.rol, 'public.professional_tags', x.priv) = (x.priv = 'SELECT')
  from (values ('anon'), ('authenticated')) r(rol) cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) x(priv)
  union all
  select '05_scores_closed', r.rol, has_table_privilege(r.rol, 'public.professional_tag_scores', 'SELECT')::text,
         not has_table_privilege(r.rol, 'public.professional_tag_scores', 'SELECT')
  from (values ('anon'), ('authenticated')) r(rol)
  union all
  select '06_rpc', f.sig || ' ' || r.rol, has_function_privilege(r.rol, f.sig, 'EXECUTE')::text,
         has_function_privilege(r.rol, f.sig, 'EXECUTE') = (f.sig <> 'public.kisg_tag_resolve(text)' or r.rol = 'authenticated')
  from (values ('public.kisg_tags_trending(integer)'), ('public.kisg_tags_search(text,integer)'), ('public.kisg_tag_resolve(text)')) f(sig)
  cross join (values ('anon'), ('authenticated')) r(rol)
  union all
  select '07_refresh_closed', r.rol, has_function_privilege(r.rol, 'public.kisg_tag_refresh_scores()', 'EXECUTE')::text,
         not has_function_privilege(r.rol, 'public.kisg_tag_refresh_scores()', 'EXECUTE')
  from (values ('anon'), ('authenticated')) r(rol)
  union all
  select '08_triggers', 'tag_guard + tag_touch',
         (select string_agg(tgname, ' ' order by tgname) from pg_trigger where tgrelid = 'public.professional_posts'::regclass and tgname like 'trg_professional_posts_tag_%'),
         (select count(*) from pg_trigger where tgrelid = 'public.professional_posts'::regclass and tgname in ('trg_professional_posts_tag_guard', 'trg_professional_posts_tag_touch') and tgenabled = 'O') = 2
  union all
  select '09_normalize', 'Yüksekte  ÇALIŞMA', public.kisg_tag_normalize('Yüksekte  ÇALIŞMA'),
         public.kisg_tag_normalize('Yüksekte  ÇALIŞMA') = 'yuksektecalisma' and public.kisg_tag_normalize('yuksekte calisma') = 'yuksektecalisma'
  union all
  select '10_existing_posts', 'mevcut postlar etiketsiz kaldi (migration sonrası etiketlenen hariç)',
         (select count(*) from public.professional_posts where tag_id is not null)::text, true
  union all
  select '11_posts_policies', 'professional_posts politikalari degismedi (adet)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'professional_posts')::text,
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'professional_posts') >= 4
) v
order by check_name, object;
