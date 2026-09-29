// Security Fix Pack 2 — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: tests/helpers/kisg-prod-stub.sql + production kanıt CSV'sindeki (2026-10-01) abonelik fonksiyonları,
// user_subscriptions kısıt/politikaları ve storage.objects politikaları.
// Mobil uyumluluk: pg_stat_statements'ta gözlenen PostgREST yazma kalıpları (Android doğrudan INSERT,
// iki UPDATE status kalıbı, iOS activate_my_subscription RPC'si) aynı SQL biçimiyle tekrarlanır.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCluster } from '../helpers/localpg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };
const pg = startCluster();
if (!pg) { console.log('SKIP PostgreSQL bulunamadı — DB testi çalıştırılmadı'); process.exit(0); }
const { psql, runFile, as } = pg;

const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333', X = '99999999-9999-4999-8999-999999999999';
const user = id => ({ sub: id });
const ILAN = 'com.fk.kirmiziisgapp.ilan', IOS = 'com.kirmizi.premium.monthly.ios', AND = 'com.kirmizi.premium.monthly.android';
const ok = r => r.code === 0;
const errOf = r => (r.err.match(/ERROR:\s+(.*)/) || [, r.err])[1];
const days = sql => Number(psql(`select round(extract(epoch from (${sql}) - now()) / 86400)`).out);

// ---------------- production tanımları (kanıt CSV'si) ----------------
const PROD = `
alter table public.user_subscriptions alter column id drop default;
alter table public.user_subscriptions alter column id type uuid using gen_random_uuid();
alter table public.user_subscriptions alter column id set default gen_random_uuid();
alter table public.user_subscriptions add column created_at timestamptz default now(), add column billing_issue_detected_at timestamptz, add column cancelled_at timestamptz;
alter table public.user_subscriptions alter column started_at set default timezone('utc'::text, now());
alter table public.user_subscriptions add constraint user_subscriptions_platform_transaction_id_key unique (platform, transaction_id);
alter table public.user_subscriptions add constraint user_subscriptions_status_check check (status = any (array['active','expired','cancelled','paused','billing_retry']));
alter table public.user_subscriptions enable row level security;
create policy "Admins can manage user_subscriptions" on public.user_subscriptions for all to authenticated
  using (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'))
  with check (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Kullanıcı kendi aboneliğini ekleyebilir" on public.user_subscriptions for insert with check (auth.uid() = user_id);
create policy "Kullanıcı kendi aboneliğini güncelleyebilir" on public.user_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Kullanıcı kendi aboneliğini okuyabilir" on public.user_subscriptions for select using (auth.uid() = user_id);

create or replace function public.sync_my_premium_status() returns boolean language plpgsql security definer set search_path to 'public' as $f$
declare v_user_id uuid; v_is_premium boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  update public.user_subscriptions set status = 'expired', will_renew = false
   where user_id = v_user_id and status in ('active', 'billing_retry') and expires_at is not null
     and expires_at <= timezone('utc'::text, now())
     and (grace_period_expires_at is null or grace_period_expires_at <= timezone('utc'::text, now()));
  select exists (select 1 from public.user_subscriptions us where us.user_id = v_user_id and us.status = 'active'
                   and (us.expires_at is null or us.expires_at > timezone('utc'::text, now()))) into v_is_premium;
  update public.profiles set is_premium = v_is_premium where id = v_user_id;
  return v_is_premium;
end $f$;
create or replace function public.sync_user_premium_status(p_user_id uuid) returns boolean language plpgsql security definer set search_path to 'public' as $f$
declare v_is_premium boolean;
begin
  if p_user_id is null then return false; end if;
  select exists (select 1 from public.user_subscriptions us where us.user_id = p_user_id and us.status = 'active'
                   and (us.expires_at is null or us.expires_at > timezone('utc'::text, now()))) into v_is_premium;
  update public.profiles set is_premium = v_is_premium where id = p_user_id;
  return v_is_premium;
end $f$;
create function public.expire_lapsed_subscriptions() returns integer language plpgsql security definer set search_path to 'public' as $f$
declare v_count integer;
begin
  update public.user_subscriptions set status = 'expired', will_renew = false
   where status in ('active', 'billing_retry') and expires_at is not null and expires_at <= timezone('utc'::text, now())
     and (grace_period_expires_at is null or grace_period_expires_at <= timezone('utc'::text, now()));
  get diagnostics v_count = row_count;
  update public.profiles p set is_premium = false where p.is_premium = true and not exists (
    select 1 from public.user_subscriptions us where us.user_id = p.id and us.status = 'active'
      and (us.expires_at is null or us.expires_at > timezone('utc'::text, now())));
  return v_count;
end $f$;
create function public.activate_my_subscription(p_platform text, p_product_id text, p_transaction_id text, p_original_transaction_id text,
  p_expires_at timestamp with time zone, p_raw_payload jsonb default '{}'::jsonb) returns user_subscriptions
language plpgsql security definer set search_path to 'public' as $f$
declare v_user_id uuid; v_subscription public.user_subscriptions;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'Invalid platform'; end if;
  if p_product_id is null or char_length(trim(p_product_id)) = 0 then raise exception 'Invalid product_id'; end if;
  if p_transaction_id is null or char_length(trim(p_transaction_id)) = 0 then raise exception 'Invalid transaction_id'; end if;
  insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, original_transaction_id, status, started_at, expires_at, raw_payload)
  values (v_user_id, p_platform, p_product_id, p_transaction_id, p_original_transaction_id, 'active', timezone('utc'::text, now()), p_expires_at, coalesce(p_raw_payload, '{}'::jsonb))
  on conflict (platform, transaction_id) do update
    set user_id = excluded.user_id, product_id = excluded.product_id, original_transaction_id = excluded.original_transaction_id,
        status = 'active', expires_at = excluded.expires_at, raw_payload = excluded.raw_payload, updated_at = timezone('utc'::text, now())
  returning * into v_subscription;
  perform public.sync_my_premium_status();
  return v_subscription;
end $f$;
create function public.update_user_notification_settings(p_user_id uuid, p_notifications_enabled boolean, p_notification_types text[])
returns void language plpgsql security definer as $f$
BEGIN
  UPDATE user_notifications SET notifications_enabled = p_notifications_enabled, notification_types = p_notification_types, updated_at = NOW()
   WHERE user_id = p_user_id;
END; $f$;
grant execute on all functions in schema public to public;

-- storage (Supabase taklidi) + production politikaları
create function auth.role() returns text language sql stable as $f$ select auth.jwt() ->> 'role' $f$;
grant execute on function auth.role() to anon, authenticated, service_role;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text,
  created_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $f$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $f$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
create policy "Admins can delete profile avatars" on storage.objects for delete to authenticated using (((bucket_id = 'profile-avatars'::text) AND (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.id = auth.uid()) AND (user_roles.role = 'admin'::text))))));
create policy "Admins can update profile avatars" on storage.objects for update to authenticated using (((bucket_id = 'profile-avatars'::text) AND (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.id = auth.uid()) AND (user_roles.role = 'admin'::text)))))) with check (((bucket_id = 'profile-avatars'::text) AND (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.id = auth.uid()) AND (user_roles.role = 'admin'::text))))));
create policy "Admins can upload profile avatars" on storage.objects for insert to authenticated with check (((bucket_id = 'profile-avatars'::text) AND (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.id = auth.uid()) AND (user_roles.role = 'admin'::text))))));
create policy "Authenticated Delete" on storage.objects for delete using (((bucket_id = 'announcements'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Authenticated Update" on storage.objects for update with check (((bucket_id = 'announcements'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Authenticated Upload" on storage.objects for insert with check (((bucket_id = 'announcements'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Authenticated users can upload job images" on storage.objects for insert with check (((bucket_id = 'job-images'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Authenticated users can upload report photos" on storage.objects for insert with check (((bucket_id = 'report-photos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Job images are public" on storage.objects for select using ((bucket_id = 'job-images'::text));
create policy "Public Access" on storage.objects for select using ((bucket_id = 'announcements'::text));
create policy "Public can view profile avatars" on storage.objects for select using ((bucket_id = 'profile-avatars'::text));
create policy "Report photos are public" on storage.objects for select using ((bucket_id = 'report-photos'::text));
create policy "Users can delete own professional post images" on storage.objects for delete to authenticated using (((bucket_id = 'professional-posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can delete own profile avatar" on storage.objects for delete to authenticated using (((bucket_id = 'profile-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can delete their own job images" on storage.objects for delete using (((bucket_id = 'job-images'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Users can delete their own report photos" on storage.objects for delete using (((bucket_id = 'report-photos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Users can update own professional post images" on storage.objects for update to authenticated using (((bucket_id = 'professional-posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'professional-posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can update own profile avatar" on storage.objects for update to authenticated using (((bucket_id = 'profile-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'profile-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can upload own professional post images" on storage.objects for insert to authenticated with check (((bucket_id = 'professional-posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Users can upload own profile avatar" on storage.objects for insert to authenticated with check (((bucket_id = 'profile-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- veri: X admin'in manuel premium satırı (2099), P bayrak ile manuel premium (aboneliksiz), dosyalar
insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, status, expires_at, raw_payload)
values ('${M}', 'ios', 'manual_premium', 'manual-m-1', 'active', '2099-01-01', '{"source":"admin","granted_by":"x"}');
update public.profiles set is_premium = true where id = '${M}';
insert into storage.objects (bucket_id, name, owner_id) values
  ('announcements', 'duyuru1.png', '${X}'),
  ('job-images', 'ilan/x.jpg', '${X}'), ('job-images', 'ilan/a.jpg', '${A}'),
  ('report-photos', '${A}/1.jpg', '${A}'), ('report-photos', '${M}/1.jpg', '${M}'),
  ('profile-avatars', '${A}/avatar.webp', '${A}'), ('professional-posts', '${A}/p.webp', '${A}');
`;

// PostgREST ile aynı SQL biçimleri (production pg_stat_statements'tan)
const lit = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
const androidInsert = body => `WITH pgrst_source AS (INSERT INTO "public"."user_subscriptions"("expires_at", "platform", "product_id", "raw_payload", "status", "transaction_id", "user_id", "will_renew") SELECT "pgrst_body"."expires_at", "pgrst_body"."platform", "pgrst_body"."product_id", "pgrst_body"."raw_payload", "pgrst_body"."status", "pgrst_body"."transaction_id", "pgrst_body"."user_id", "pgrst_body"."will_renew" FROM (SELECT ${lit(body)} AS json_data) pgrst_payload, LATERAL (SELECT "expires_at", "platform", "product_id", "raw_payload", "status", "transaction_id", "user_id", "will_renew" FROM json_to_record(pgrst_payload.json_data) AS _("expires_at" timestamptz, "platform" text, "product_id" text, "raw_payload" jsonb, "status" text, "transaction_id" text, "user_id" uuid, "will_renew" boolean) ) pgrst_body RETURNING 1) SELECT count(*) FROM pgrst_source`;
const updStatusByProduct = (status, uid, product, cur) => `WITH pgrst_source AS (UPDATE "public"."user_subscriptions" SET "status" = "pgrst_body"."status" FROM (SELECT ${lit({ status })} AS json_data) pgrst_payload, LATERAL (SELECT "status" FROM json_to_record(pgrst_payload.json_data) AS _("status" text) ) pgrst_body WHERE "public"."user_subscriptions"."user_id" = '${uid}' AND "public"."user_subscriptions"."product_id" = '${product}' AND "public"."user_subscriptions"."status" = '${cur}' RETURNING 1) SELECT count(*) FROM pgrst_source`;
const updStatusRenew = (status, willRenew, uid, cur) => `WITH pgrst_source AS (UPDATE "public"."user_subscriptions" SET "status" = "pgrst_body"."status", "will_renew" = "pgrst_body"."will_renew" FROM (SELECT ${lit({ status, will_renew: willRenew })} AS json_data) pgrst_payload, LATERAL (SELECT "status", "will_renew" FROM json_to_record(pgrst_payload.json_data) AS _("status" text, "will_renew" boolean) ) pgrst_body WHERE "public"."user_subscriptions"."user_id" = '${uid}' AND "public"."user_subscriptions"."status" = '${cur}' RETURNING 1) SELECT count(*) FROM pgrst_source`;
const activate = (platform, product, txn, expires) => `select (public.activate_my_subscription('${platform}', '${product}', '${txn}', null, ${expires}, '{"entitlements":{}}'::jsonb)).id is not null`;
const sub = (txn, col = 'expires_at') => psql(`select ${col} from public.user_subscriptions where transaction_id = '${txn}'`).out;
const premium = id => psql(`select is_premium from public.profiles where id = '${id}'`).out;
const obj = (bucket, name) => psql(`select count(*) from storage.objects where bucket_id = '${bucket}' and name = '${name}'`).out;

// ---------------- kurulum ----------------
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
r = runFile(path.join(ROOT, 'db/migrations/20260930_security_fix_pack1.sql'));
check(ok(r), `Fix Pack 1 (production'da uygulanmış) kuruldu ${r.err}`);
r = psql(PROD);
check(ok(r), `abonelik fonksiyonları, user_subscriptions ve storage politikaları kuruldu ${r.err}`);

const snapshot = () => psql(`select string_agg(x, ' || ' order by x) from (
  select 'pol:' || schemaname || '.' || tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') as x from pg_policies
  union all select 'fx:' || p.proname || ':' || r.rol || ':' || has_function_privilege(r.rol, p.oid, 'EXECUTE') || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
   where p.pronamespace = 'public'::regnamespace and p.proname in ('expire_lapsed_subscriptions', 'sync_user_premium_status', 'update_user_notification_settings', 'activate_my_subscription', 'sync_my_premium_status')
  union all select 'tg:' || tgname from pg_trigger where not tgisinternal and tgrelid = 'public.user_subscriptions'::regclass) s`).out;
const pubPolicies = () => psql(`select string_agg(schemaname || tablename || policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by 1) from pg_policies where schemaname = 'public'`).out;
const keptStorage = () => psql(`select string_agg(policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname) from pg_policies where schemaname = 'storage' and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(profile-avatars|professional-posts)'`).out;
const dataSnap = () => psql(`select string_agg(x, '|' order by x) from (select id || ':' || coalesce(is_premium::text, '-') as x from public.profiles union all select transaction_id || ':' || status || ':' || coalesce(expires_at::text, '-') || ':' || user_id from public.user_subscriptions) s`).out;
const before = snapshot(), beforePub = pubPolicies(), beforeKept = keptStorage(), beforeData = dataSnap();

// Migration öncesi açıklar gerçekten var (test şemasının production'ı yansıttığının kanıtı)
r = as('anon', {}, `select public.expire_lapsed_subscriptions()`);
check(ok(r) && premium(P) === 'f', 'ÖNCE: anon expire_lapsed_subscriptions() ile manuel premium (P) düşürülebiliyor');
psql(`update public.profiles set is_premium = true where id = '${P}'`);
r = as('authenticated', user(A), `select count(*) from storage.objects where bucket_id = 'report-photos'`);
check(r.out.trim() === '2', 'ÖNCE: kullanıcı herkesin report-photos dosyalarını listeleyebiliyor');
psql(`update public.profiles set is_premium = true where id = '${P}'`);
const beforeData2 = dataSnap();

const PART1 = path.join(ROOT, 'db/migrations/20261001_security_fix_pack2_part1_public.sql');
const PART2 = path.join(ROOT, 'db/migrations/20261001_security_fix_pack2_part2_storage.sql');
r = runFile(PART1);
check(ok(r), `Fix Pack 2 Parça 1 (public) uygulandı ${r.err}`);
r = runFile(PART1);
check(ok(r), `Parça 1 tekrar çalıştırılabilir ${r.err}`);
r = runFile(PART2);
check(ok(r), `Fix Pack 2 Parça 2 (storage) uygulandı ${r.err}`);
const afterBoth = snapshot();
r = runFile(PART2);
check(!ok(r) && /already exists/.test(r.err) && snapshot() === afterBoth, 'Parça 2 ikinci kez çalıştırılırsa hata verir ve hiçbir şeyi değiştirmez');
check(dataSnap() === beforeData2, 'migration hiçbir profil / abonelik verisini değiştirmedi (manuel premium\'lar aynı)');
check(pubPolicies() === beforePub, 'public şemasındaki tüm RLS politikaları (profiles, user_subscriptions, reports…) DEĞİŞMEDİ');
check(keptStorage() === beforeKept, 'profile-avatars ve professional-posts storage politikaları DEĞİŞMEDİ');

// ---------------- A6-1 + A7: sunucu fonksiyonları ----------------
for (const [role, claims] of [['anon', {}], ['authenticated', user(A)]]) {
  r = as(role, claims, `select public.expire_lapsed_subscriptions()`);
  check(!ok(r) && /permission denied/.test(r.err), `${role}: expire_lapsed_subscriptions() → izin yok`);
  r = as(role, claims, `select public.sync_user_premium_status('${P}')`);
  check(!ok(r) && /permission denied/.test(r.err), `${role}: sync_user_premium_status(başkası) → izin yok`);
  r = as(role, claims, `select public.update_user_notification_settings('${M}', false, array['x'])`);
  check(!ok(r) && /permission denied/.test(r.err), `${role}: update_user_notification_settings(başkası) → izin yok (A7)`);
}
check(premium(P) === 't', 'manuel premium (P, aboneliksiz) korunuyor');
r = as('service_role', { role: 'service_role' }, `select public.sync_user_premium_status('${M}')`);
check(ok(r), `service_role: sync_user_premium_status çalışıyor ${errOf(r)}`);
r = psql(`select public.expire_lapsed_subscriptions()`);
check(ok(r), `postgres (dashboard): expire_lapsed_subscriptions çalışıyor ${errOf(r)}`);
psql(`update public.profiles set is_premium = true where id = '${P}'`);
check(psql(`select array_to_string(proconfig, ',') from pg_proc where proname = 'update_user_notification_settings'`).out === 'search_path=public',
  'update_user_notification_settings search_path sabitlendi');
r = as('authenticated', user(A), `select public.sync_my_premium_status()`);
check(ok(r), `authenticated: sync_my_premium_status hâlâ çalışıyor (mobil 44k çağrı) ${errOf(r)}`);
r = as('authenticated', user(A), `select public.activate_my_subscription('ios', '${IOS}', 'noop-0', null, now() + interval '30 days')`);
check(ok(r), `authenticated: activate_my_subscription hâlâ çalışıyor (mobil 2.6k çağrı) ${errOf(r)}`);

// ---------------- A6-2: iOS activate_my_subscription ----------------
r = as('authenticated', user(A), activate('ios', IOS, 'ios-ok', `now() + interval '31 days'`));
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'ios-ok')`) === 31 && premium(A) === 't',
  `iOS activate: gerçek aylık süre (31 gün) aynen yazılır, premium açılır ${errOf(r)}`);
r = as('authenticated', user(A), activate('ios', IOS, 'ios-fake', `'2099-01-01'`));
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'ios-fake')`) === 45,
  `iOS activate: sahte 2099 bitişi HATA VERMEDEN 45 güne indirilir ${errOf(r)}`);
r = as('authenticated', user(A), activate('ios', IOS, 'ios-null', 'null'));
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'ios-null')`) === 45,
  `iOS activate: aylık üründe boş bitiş (süresiz) 45 güne indirilir ${errOf(r)}`);
r = as('authenticated', user(A), activate('ios', ILAN, 'ilan-1', 'null'));
check(ok(r) && sub('ilan-1') === '' && premium(A) === 't', `iOS activate: ilan ürünü süresiz kalır ve premium verir (karar 2) ${errOf(r)}`);
r = as('authenticated', user(A), activate('ios', 'manual_premium', 'fake-manual', `'2099-01-01'`));
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'fake-manual')`) === 45,
  `istemci manual_premium ürününü taklit ederse de 45 gün sınırı uygulanır ${errOf(r)}`);

// ---------------- A6-2: Android doğrudan INSERT (gözlenen PostgREST kalıbı) ----------------
const aBody = (txn, expires, product = AND) => ({ expires_at: expires, platform: 'android', product_id: product, raw_payload: { entitlements: {} }, status: 'active', transaction_id: txn, user_id: A, will_renew: true });
const in20 = psql(`select (now() + interval '20 days')::text`).out;
r = as('authenticated', user(A), androidInsert(aBody('GPA.ok', in20)));
check(ok(r) && sub('GPA.ok') === in20, `Android INSERT: gerçek süre (20 gün) aynen yazılır ${errOf(r)}`);
r = as('authenticated', user(A), androidInsert(aBody('GPA.fake', '2099-01-01T00:00:00Z')));
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'GPA.fake')`) === 45,
  `Android INSERT: sahte 2099 bitişi hata vermeden 45 güne indirilir ${errOf(r)}`);
r = as('authenticated', user(A), androidInsert(aBody('GPA.null', null)));
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'GPA.null')`) === 45,
  `Android INSERT: boş bitiş 45 güne indirilir ${errOf(r)}`);
r = as('authenticated', user(A), androidInsert({ ...aBody('GPA.other', in20), user_id: M }));
check(!ok(r) && sub('GPA.other', 'count(*)') === '0', 'Android INSERT: başkası adına satır eklenemez (mevcut RLS, değişmedi)');

// ---------------- mobil UPDATE kalıpları (değişmeden çalışır) ----------------
r = as('authenticated', user(A), updStatusByProduct('expired', A, AND, 'active'));
check(ok(r) && r.out.trim() === '3' && sub('GPA.ok', 'status') === 'expired', `UPDATE status (user_id+product_id+status) çalışıyor ${errOf(r)}`);
r = as('authenticated', user(A), updStatusRenew('cancelled', false, A, 'active'));
check(ok(r) && sub('ios-ok', 'status') === 'cancelled' && sub('ios-ok', 'will_renew') === 'f', `UPDATE status + will_renew (iptal) çalışıyor ${errOf(r)}`);
r = as('authenticated', user(A), updStatusByProduct('active', A, AND, 'expired'));
check(ok(r) && sub('GPA.ok') === in20, 'UPDATE: süresi 45 gün içinde olan satır yeniden aktifleşirse süresi değişmez');
r = as('authenticated', user(A), `update public.user_subscriptions set expires_at = '2099-01-01' where transaction_id = 'GPA.ok'`);
check(ok(r) && days(`(select expires_at from public.user_subscriptions where transaction_id = 'GPA.ok')`) === 45,
  'doğrudan PATCH ile aktif satırın bitişi 2099 yapılamaz → 45 gün');

// Admin'in verdiği manuel premium satırı (M, 2099) istemci UPDATE'inden etkilenmez
r = as('authenticated', user(M), updStatusRenew('active', false, M, 'active'));
check(ok(r) && sub('manual-m-1').startsWith('2099-01-01'), 'M: kendi manual_premium satırındaki status/will_renew UPDATE\'i süreyi kısaltmaz (2099 korunur)');
r = as('authenticated', user(M), `select public.sync_my_premium_status()`);
check(ok(r) && premium(M) === 't', 'M: sync_my_premium_status sonrası manuel premium sürüyor');

// Yetkili yollar etkilenmez
r = as('authenticated', user(X), `insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, status, expires_at) values ('${P}', 'ios', 'manual_premium', 'admin-grant', 'active', '2099-01-01')`);
check(ok(r) && sub('admin-grant').startsWith('2099-01-01'), `admin (JWT) manuel premium satırını 2099 ile yazabiliyor ${errOf(r)}`);
r = as('service_role', { role: 'service_role' }, `insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, status, expires_at) values ('${P}', 'ios', 'manual_premium', 'svc-grant', 'active', '2099-01-01')`);
check(ok(r) && sub('svc-grant').startsWith('2099-01-01'), `service_role 2099 ile yazabiliyor ${errOf(r)}`);
r = psql(`insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, status, expires_at) values ('${P}', 'ios', 'manual_premium', 'sql-grant', 'active', '2099-01-01')`);
check(ok(r) && sub('sql-grant').startsWith('2099-01-01'), `dashboard / SQL Editor (JWT yok) 2099 ile yazabiliyor ${errOf(r)}`);

// ---------------- A8: storage ----------------
const put = (role, claims, bucket, name) => as(role, claims, `insert into storage.objects (bucket_id, name, owner_id) values ('${bucket}', '${name}', ${claims?.sub ? `'${claims.sub}'` : 'null'})`);
const del = (role, claims, bucket, name) => as(role, claims, `with d as (delete from storage.objects where bucket_id = '${bucket}' and name = '${name}' returning 1) select count(*) from d`);
const upd = (role, claims, bucket, name) => as(role, claims, `with u as (update storage.objects set metadata = '{"x":1}' where bucket_id = '${bucket}' and name = '${name}' returning 1) select count(*) from u`);
const cnt = (role, claims, bucket) => as(role, claims, `select count(*) from storage.objects where bucket_id = '${bucket}'`).out.trim();

// announcements
r = put('authenticated', user(A), 'announcements', 'sahte.png');
check(!ok(r) && /row-level security/.test(r.err), 'announcements: normal kullanıcı yükleyemez');
r = del('authenticated', user(A), 'announcements', 'duyuru1.png');
check(ok(r) && r.out.trim() === '0' && obj('announcements', 'duyuru1.png') === '1', 'announcements: normal kullanıcı admin dosyasını silemez');
r = upd('authenticated', user(A), 'announcements', 'duyuru1.png');
check(ok(r) && r.out.trim() === '0', 'announcements: normal kullanıcı güncelleyemez');
r = put('authenticated', user(X), 'announcements', 'yeni.png');
check(ok(r), `announcements: admin yükleyebilir ${errOf(r)}`);
r = upd('authenticated', user(X), 'announcements', 'yeni.png');
check(ok(r) && r.out.trim() === '1', 'announcements: admin güncelleyebilir');
r = del('authenticated', user(X), 'announcements', 'yeni.png');
check(ok(r) && r.out.trim() === '1', 'announcements: admin silebilir');
check(cnt('anon', {}, 'announcements') === '1', 'announcements: herkese açık okuma sürüyor');

// job-images
r = put('authenticated', user(M), 'job-images', 'ilan/m.jpg');
check(ok(r), `job-images: giriş yapan kullanıcı yükleyebilir (değişmedi) ${errOf(r)}`);
r = del('authenticated', user(M), 'job-images', 'ilan/a.jpg');
check(ok(r) && r.out.trim() === '0' && obj('job-images', 'ilan/a.jpg') === '1', 'job-images: başkasının görselini silemez');
r = del('authenticated', user(M), 'job-images', 'ilan/m.jpg');
check(ok(r) && r.out.trim() === '1', 'job-images: kendi görselini silebilir');
r = del('authenticated', user(X), 'job-images', 'ilan/a.jpg');
check(ok(r) && r.out.trim() === '1', 'job-images: admin silebilir');
check(cnt('anon', {}, 'job-images') === '1', 'job-images: herkese açık okuma sürüyor');

// report-photos
r = put('authenticated', user(A), 'report-photos', `${A}/2.jpg`);
check(ok(r), `report-photos: kendi klasörüne yükleyebilir ${errOf(r)}`);
r = put('authenticated', user(A), 'report-photos', `${M}/sahte.jpg`);
check(!ok(r) && /row-level security/.test(r.err), 'report-photos: başkasının klasörüne yükleyemez');
r = del('authenticated', user(A), 'report-photos', `${M}/1.jpg`);
check(ok(r) && r.out.trim() === '0' && obj('report-photos', `${M}/1.jpg`) === '1', 'report-photos: başkasının fotoğrafını silemez');
check(cnt('authenticated', user(A), 'report-photos') === '2', 'report-photos: kullanıcı yalnız kendi fotoğraflarını görür/listeler');
check(cnt('anon', {}, 'report-photos') === '0', 'report-photos: anon API ile listeleyemez (KVKK)');
check(cnt('authenticated', user(X), 'report-photos') === '3', 'report-photos: admin tümünü görür');
r = del('authenticated', user(A), 'report-photos', `${A}/2.jpg`);
check(ok(r) && r.out.trim() === '1', 'report-photos: kendi fotoğrafını silebilir');
r = del('authenticated', user(X), 'report-photos', `${M}/1.jpg`);
check(ok(r) && r.out.trim() === '1', 'report-photos: admin silebilir');

// dokunulmayan bucket'lar
r = put('authenticated', user(A), 'professional-posts', `${A}/q.webp`);
check(ok(r), `professional-posts: kendi klasörüne yükleme sürüyor ${errOf(r)}`);
r = del('authenticated', user(A), 'profile-avatars', `${A}/avatar.webp`);
check(ok(r) && r.out.trim() === '1', 'profile-avatars: kendi avatarını silme sürüyor');

// ---------------- rollback ----------------
r = runFile(path.join(ROOT, 'db/migrations/20261001_security_fix_pack2.rollback.sql'));
check(ok(r), `rollback çalıştı ${r.err}`);
check(snapshot() === before, 'rollback: politikalar, fonksiyon yetkileri/ayarları ve trigger migration öncesiyle birebir aynı');
r = runFile(PART1); const r2 = runFile(PART2);
check(ok(r) && ok(r2) && snapshot() === afterBoth, `rollback sonrası iki parça yeniden uygulanabilir ${r.err} ${r2.err}`);

// ---------------- verify ----------------
r = runFile(path.join(ROOT, 'db/migrations/20261001_security_fix_pack2.verify.sql'));
const rows = r.out.split('\n').filter(Boolean);
const bad = rows.filter(l => !l.endsWith('|t'));
check(ok(r) && rows.length > 30 && bad.length === 0, `verify: ${rows.length} satırın hepsi ok ${bad.join(' ; ')} ${r.err}`);
