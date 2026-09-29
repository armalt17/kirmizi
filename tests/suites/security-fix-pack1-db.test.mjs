// Security Fix Pack 1 / Migration 1 — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: tests/helpers/kisg-prod-stub.sql (production audit CSV'sindeki tablo/politika/trigger tanımları).
// Mobil uyumluluk: pg_stat_statements'ta (2026-02-04 → 2026-09-30) gözlenen PostgREST yazma kalıpları
// aynı SQL biçimiyle (json_to_record + CTE, upsert ON CONFLICT) bire bir tekrarlanır.
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
const EMAIL = { [A]: 'ayse@ornek.com', [M]: 'mehmet@ornek.com', [P]: 'premium@ornek.com', [X]: 'admin@ornek.com' };
const user = id => ({ sub: id, email: EMAIL[id] });
const TYPES = { email: 'text', full_name: 'text', id: 'uuid', is_premium: 'boolean', title: 'text', phone: 'text', onesignal_notification_id: 'text',
  daily_reports_used: 'integer', monthly_reports_used: 'integer', last_report_date: 'date', about: 'text', certificate_class: 'text', city: 'text',
  current_company: 'text', instagram_url: 'text', is_discoverable: 'boolean', job_role: 'text', linkedin_url: 'text', profession: 'text',
  show_phone_publicly: 'boolean', social_links: 'jsonb', specialties: 'text[]', website_url: 'text', avatar_url: 'text', experience_range: 'text',
  last_post_at: 'timestamptz', created_at: 'timestamptz', status: 'text', content: 'text', profile_featured_order: 'smallint', category_id: 'uuid',
  image_path: 'text', title_s: 'text', description: 'text', service_region: 'text', service_mode: 'text', moderated_at: 'timestamptz', moderation_reason: 'text', post_id: 'uuid', user_id: 'uuid' };
const lit = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
const q = s => `"${s}"`;
// PostgREST PATCH ile aynı SQL biçimi
function pgUpdate(table, body, where, returning = '1') {
  const cols = Object.keys(body);
  return `WITH pgrst_source AS (UPDATE "public".${q(table)} SET ${cols.map(c => `${q(c)} = "pgrst_body".${q(c)}`).join(', ')} FROM (SELECT ${lit(body)} AS json_data) pgrst_payload, LATERAL (SELECT ${cols.map(q).join(', ')} FROM json_to_record(pgrst_payload.json_data) AS _(${cols.map(c => `${q(c)} ${TYPES[c]}`).join(', ')}) ) pgrst_body WHERE ${where} RETURNING ${returning}) SELECT count(*) FROM pgrst_source`;
}
// Mobil kayıt upsert'i (gözlenen: INSERT (email, full_name, id, is_premium, title) ON CONFLICT(id) DO UPDATE SET ... = EXCLUDED...)
function pgUpsert(body) {
  const cols = ['email', 'full_name', 'id', 'is_premium', 'title'];
  return `WITH pgrst_source AS (INSERT INTO "public"."profiles"(${cols.map(q).join(', ')}) SELECT ${cols.map(c => `"pgrst_body".${q(c)}`).join(', ')} FROM (SELECT ${lit(body)} AS json_data) pgrst_payload, LATERAL (SELECT ${cols.map(q).join(', ')} FROM json_to_record(pgrst_payload.json_data) AS _(${cols.map(c => `${q(c)} ${TYPES[c]}`).join(', ')}) ) pgrst_body ON CONFLICT("id") DO UPDATE SET ${cols.map(c => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')} RETURNING 1) SELECT count(*) FROM pgrst_source`;
}
const byId = id => `"public"."profiles"."id" = '${id}'`;
const prof = (id, cols) => psql(`select ${cols} from public.profiles where id = '${id}'`).out;
const ok = r => r.code === 0;
const errOf = r => (r.err.match(/ERROR:\s+(.*)/) || [, r.err])[1];

// ---------------- kurulum ----------------
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
const snapshot = () => psql(`select string_agg(x, ' || ' order by x) from (
  select 'pol:' || tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') as x from pg_policies where schemaname = 'public'
  union all select 'tg:' || table_name || ':' || grantee || ':' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all select 'cg:' || table_name || '.' || column_name || ':' || grantee || ':' || privilege_type from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name = 'profiles'
  union all select 'rls:' || relname || ':' || relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r') s`).out;
const before = snapshot();
r = runFile(path.join(ROOT, 'db/migrations/20260930_security_fix_pack1.sql'));
check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(path.join(ROOT, 'db/migrations/20260930_security_fix_pack1.sql'));
check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(snapshot() === before, 'RLS politikaları, tablo/kolon yetkileri ve RLS durumu DEĞİŞMEDİ (A1 açık kalıyor, mobil select * çalışır)');
const T = psql(`select (now() at time zone 'Europe/Istanbul')::date`).out;
const dayShift = n => { const d = new Date(T + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prevMonth = (() => { const d = new Date(T + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();

// ---------------- A1 dokunulmadı: mobilin select * okumaları ----------------
r = as('authenticated', user(A), `select count(*) from (select "public"."profiles".* from "public"."profiles" where "public"."profiles"."id" = '${A}') s`);
check(ok(r) && r.out === '1', 'mobil: kendi profili select * (49.928 çağrı kalıbı) çalışıyor');
r = as('anon', null, `select count(*) from (select "public"."profiles".* from "public"."profiles" where not "public"."profiles"."title" is null) s`);
check(ok(r), 'mobil: anon HEAD sayaç select * (2.224 çağrı kalıbı) çalışıyor');
r = as('authenticated', user(A), `select count(*) from (select full_name, email, phone, title, is_premium, created_at from public.profiles where id = '${A}') s`);
check(ok(r) && r.out === '1', 'mobil: email/phone/is_premium okuma (2.954 çağrı kalıbı) çalışıyor');

// ---------------- A3: mobil yazma kalıpları ----------------
// onesignal (authenticated 30.916)
r = as('authenticated', user(A), pgUpdate('profiles', { onesignal_notification_id: 'os-yeni' }, byId(A)));
check(ok(r) && r.out === '1' && prof(A, 'onesignal_notification_id') === 'os-yeni', 'onesignal_notification_id güncellemesi serbest (push kaydı çalışır)');
r = as('anon', null, pgUpdate('profiles', { onesignal_notification_id: 'os-anon' }, byId(A)));
check(ok(r) && r.out === '0' && prof(A, 'onesignal_notification_id') === 'os-yeni', 'anon onesignal güncellemesi (79 çağrı) hatasız, 0 satır (değişmedi)');
// profil düzenleme kalıpları
r = as('authenticated', user(A), pgUpdate('profiles', { full_name: 'Ayşe Y.', phone: '+905550000000', title: 'A Sınıfı' }, byId(A), '"public"."profiles"."id"'));
check(ok(r) && prof(A, 'full_name||phone||title') === 'Ayşe Y.|+905550000000|A Sınıfı'.replace(/\|/g, ''), 'profil düzenleme (full_name, phone, title — 103 çağrı) uygulanıyor');
r = as('authenticated', user(A), pgUpdate('profiles', { about: 'Hakkında', certificate_class: 'A Sınıfı', city: 'İstanbul', current_company: 'Kırmızı', full_name: 'Ayşe Yılmaz', instagram_url: null, is_discoverable: true, job_role: 'Uzman', linkedin_url: 'https://linkedin.com/in/a', profession: 'İş Güvenliği Uzmanı', show_phone_publicly: false, social_links: [], specialties: ['Yüksekte çalışma'], website_url: null }, byId(A), '"public"."profiles".*'));
check(ok(r) && prof(A, "job_role || '/' || city || '/' || array_to_string(specialties, ',') || '/' || is_discoverable") === 'Uzman/İstanbul/Yüksekte çalışma/true', 'geniş profil düzenleme (job_role, specialties, is_discoverable …) uygulanıyor');
r = as('authenticated', user(A), pgUpdate('profiles', { avatar_url: 'https://x/a.webp' }, byId(A)));
check(ok(r) && prof(A, 'avatar_url') === 'https://x/a.webp', 'avatar_url güncellemesi serbest');

// is_premium (authenticated 23) — sessizce korunur
r = as('authenticated', user(A), pgUpdate('profiles', { is_premium: true }, byId(A)));
check(ok(r) && r.out === '1' && prof(A, 'is_premium') === 'f', 'normal kullanıcı is_premium=true yazamaz (hata yok, 1 satır, değer korunur)');
r = as('authenticated', user(P), pgUpdate('profiles', { is_premium: false }, byId(P)));
check(ok(r) && prof(P, 'is_premium') === 't', 'manuel premium kullanıcı kendi premium değerini kapatamaz (korunur)');

// kayıt upsert'i (authenticated 395) — satır handle_new_user ile zaten var
r = as('authenticated', user(P), pgUpsert({ email: EMAIL[P], full_name: 'Manuel Premium 2', id: P, is_premium: false, title: 'Uzman' }));
check(ok(r) && r.out === '1' && prof(P, "is_premium || '/' || full_name || '/' || title || '/' || email") === `true/Manuel Premium 2/Uzman/${EMAIL[P]}`, 'mobil signup upsert: hatasız; ad/unvan yazılır, manuel premium KORUNUR');
r = as('authenticated', user(A), pgUpsert({ email: 'baskasi@ornek.com', full_name: 'Ayşe Yılmaz', id: A, is_premium: true, title: 'A Sınıfı' }));
check(ok(r) && prof(A, "is_premium || '/' || email") === `false/${EMAIL[A]}`, 'upsert ile premium açma ve e-posta değiştirme sessizce engellenir');
// satır yoksa upsert INSERT yolu
psql(`insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'yeni@ornek.com'); delete from public.profiles where id = '44444444-4444-4444-8444-444444444444'`);
r = as('authenticated', { sub: '44444444-4444-4444-8444-444444444444', email: 'yeni@ornek.com' }, pgUpsert({ email: 'sahte@ornek.com', full_name: 'Yeni Kişi', id: '44444444-4444-4444-8444-444444444444', is_premium: true, title: null }));
check(ok(r) && prof('44444444-4444-4444-8444-444444444444', "is_premium || '/' || email || '/' || daily_reports_used") === 'false/yeni@ornek.com/0', 'profil satırı yokken upsert INSERT: premium false, e-posta JWT e-postası, sayaç 0');
// INSERT: oturum saat dilimi İstanbul dışında olsa bile last_report_date İstanbul günü olmalı.
// Şu an İstanbul gününden FARKLI takvim gününü gösteren bir dilim seçilir (UTC-12 veya UTC+14; biri her saatte farklıdır).
{
  const Q = '66666666-6666-4666-8666-666666666666';
  const TZ = psql(`select tz from (values ('Etc/GMT+12'), ('Pacific/Kiritimati')) v(tz) where (now() at time zone tz)::date <> (now() at time zone 'Europe/Istanbul')::date limit 1`).out;
  const sessionDay = psql(`select (now() at time zone '${TZ}')::date`).out;
  psql(`insert into auth.users (id, email) values ('${Q}', 'tz@ornek.com'); delete from public.profiles where id = '${Q}'`);
  r = as('authenticated', { sub: Q, email: 'tz@ornek.com' }, `set local timezone = '${TZ}'; select current_date; ` + pgUpsert({ email: 'tz@ornek.com', full_name: 'Saat Dilimi', id: Q, is_premium: false, title: null }));
  const [curDate] = r.out.split('\n');
  check(ok(r) && TZ && curDate === sessionDay && sessionDay !== T && prof(Q, 'last_report_date') === T,
    `INSERT: oturum saat dilimi ${TZ} (current_date=${curDate}) iken last_report_date İstanbul günü (${prof(Q, 'last_report_date')} = ${T})`);
}
// signup trigger'ı etkilenmedi
psql(`insert into auth.users (id, email, raw_user_meta_data) values ('55555555-5555-4555-8555-555555555555', 'kayit@ornek.com', '{"full_name":"Kayıt","phone":"0555"}')`);
check(prof('55555555-5555-4555-8555-555555555555', "full_name || '/' || phone || '/' || is_premium || '/' || email") === 'Kayıt/0555/false/kayit@ornek.com', 'handle_new_user (signup trigger) aynen çalışıyor');

// e-posta
r = as('authenticated', user(A), pgUpdate('profiles', { email: 'ele-gecir@ornek.com' }, byId(A)));
check(ok(r) && prof(A, 'email') === EMAIL[A], 'e-posta başka bir adrese çevrilemez (korunur)');
psql(`update public.profiles set email = 'eski@ornek.com' where id = '${A}'`);
r = as('authenticated', user(A), pgUpdate('profiles', { email: EMAIL[A] }, byId(A)));
check(ok(r) && prof(A, 'email') === EMAIL[A], 'e-posta JWT e-postasına eşitlenebilir (auth ile senkron)');
// sistem zaman alanları
r = as('authenticated', user(A), pgUpdate('profiles', { last_post_at: '2030-01-01T00:00:00Z', created_at: '2000-01-01T00:00:00Z' }, byId(A)));
check(ok(r) && prof(A, "coalesce(last_post_at::text, 'null') || '/' || (created_at > '2020-01-01')") === 'null/true', 'last_post_at ve created_at istemciden değişmez');

// ---------------- eski mobil sayaç yazımları (bire bir) ----------------
const counters = id => prof(id, "daily_reports_used || '/' || monthly_reports_used || '/' || last_report_date");
const setC = (d, m, date) => psql(`update public.profiles set daily_reports_used = ${d}, monthly_reports_used = ${m}, last_report_date = '${date}' where id = '${A}'`);
setC(2, 7, T);
// (a) daily + date (authenticated 2 çağrı) — aynı gün artış
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 3, last_report_date: T }, byId(A)));
check(ok(r) && counters(A) === `3/7/${T}`, `eski mobil (a) günlük artış: ${counters(A)}`);
// (a) aynı gün sıfırlama denemesi → korunur, hata yok
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 0, last_report_date: T }, byId(A)));
check(ok(r) && r.out === '1' && counters(A) === `3/7/${T}`, 'eski mobil (a) aynı gün sıfırlama denemesi: hatasız, sayaç korunur');
// (a) yeni gün sıfırlaması
setC(5, 7, dayShift(-1));
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 1, last_report_date: T }, byId(A)));
check(ok(r) && counters(A) === `1/7/${T}`, `eski mobil (a) yeni gün sıfırlaması kabul: ${counters(A)}`);
// (b) monthly + date (authenticated 17) — aynı ay artış
r = as('authenticated', user(A), pgUpdate('profiles', { last_report_date: T, monthly_reports_used: 8 }, byId(A)));
check(ok(r) && counters(A) === `1/8/${T}`, `eski mobil (b) aylık artış: ${counters(A)}`);
r = as('authenticated', user(A), pgUpdate('profiles', { last_report_date: T, monthly_reports_used: 0 }, byId(A)));
check(ok(r) && counters(A) === `1/8/${T}`, 'eski mobil (b) aynı ay sıfırlama denemesi: hatasız, sayaç korunur');
// (b) yeni ay sıfırlaması
setC(4, 15, prevMonth);
r = as('authenticated', user(A), pgUpdate('profiles', { last_report_date: T, monthly_reports_used: 1 }, byId(A)));
check(ok(r) && counters(A) === `4/1/${T}`, `eski mobil (b) yeni ay sıfırlaması kabul: ${counters(A)}`);
// (c) dört alan + is_premium (authenticated 21) ve RETURNING * varyantı (2)
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 5, is_premium: true, last_report_date: T, monthly_reports_used: 2 }, byId(A)));
check(ok(r) && counters(A) === `5/2/${T}` && prof(A, 'is_premium') === 'f', `eski mobil (c) dört alan: sayaçlar yazılır, premium korunur (${counters(A)})`);
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 6, is_premium: true, last_report_date: T, monthly_reports_used: 3 }, byId(A), '"public"."profiles".*'));
check(ok(r) && r.out === '1' && counters(A) === `6/3/${T}`, 'eski mobil (c) RETURNING * varyantı hatasız');
// uç durumlar
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 7, last_report_date: dayShift(-3) }, byId(A)));
check(ok(r) && counters(A) === `7/3/${T}`, 'tarih geri alınamaz (artış uygulanır, tarih korunur)');
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 0, last_report_date: dayShift(5) }, byId(A)));
check(ok(r) && counters(A) === `7/3/${T}`, 'tarih ileri atılarak sıfırlama yapılamaz (ileri tarih reddedilir)');
// Regression: bugün+1 tarihiyle aynı UPDATE'te günlük sayaç sıfırlanamaz (day_rolled üretilemez), hata da dönmez
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: 0, last_report_date: dayShift(1) }, byId(A)));
check(ok(r) && r.out === '1' && counters(A) === `7/3/${T}`, `regression: last_report_date=bugün+1 & daily=0 → tarih ve sayaç korunur, hata yok (${counters(A)})`);
r = as('authenticated', user(A), pgUpdate('profiles', { monthly_reports_used: 0, last_report_date: dayShift(1) }, byId(A)));
check(ok(r) && r.out === '1' && counters(A) === `7/3/${T}`, `regression: last_report_date=bugün+1 & monthly=0 → aylık sayaç da korunur (${counters(A)})`);
r = as('authenticated', user(A), pgUpdate('profiles', { daily_reports_used: -1, monthly_reports_used: null }, byId(A)));
check(ok(r) && counters(A) === `7/3/${T}`, 'negatif / NULL sayaç kabul edilmez');
// güncel sürüm: service_role (1.954 + 891) — serbest
r = as('service_role', null, pgUpdate('profiles', { last_report_date: T, monthly_reports_used: 0 }, byId(A)));
check(ok(r) && counters(A) === `7/0/${T}`, 'service_role (b) aylık yazım serbest (azaltma dahil)');
r = as('service_role', null, pgUpdate('profiles', { daily_reports_used: 0, last_report_date: T }, byId(A)));
check(ok(r) && counters(A) === `0/0/${T}`, 'service_role (a) günlük yazım serbest');
// kota okuması (authenticated 11.536 / service_role 2.858)
r = as('authenticated', user(A), `select is_premium, monthly_reports_used, last_report_date, daily_reports_used from public.profiles where id = '${A}'`);
check(ok(r) && r.out.startsWith('f|0|'), 'kota okuması çalışıyor');

// ---------------- yetkili yollar ----------------
psql(`insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, status, expires_at) values ('${M}', 'ios', 'p', 't1', 'active', now() + interval '30 days')`);
r = as('authenticated', user(M), 'select public.sync_my_premium_status()');
check(ok(r) && r.out === 't' && prof(M, 'is_premium') === 't', 'sync_my_premium_status (SECURITY DEFINER) premiumu açabiliyor');
r = as('service_role', null, `select public.sync_user_premium_status('${M}')`);
check(ok(r) && prof(M, 'is_premium') === 't', 'webhook yolu sync_user_premium_status (service_role) çalışıyor');
r = as('authenticated', user(X), pgUpdate('profiles', { is_premium: true, daily_reports_used: 0 }, byId(A)));
check(ok(r) && r.out === '1' && prof(A, 'is_premium') === 't', 'admin (user_roles) premium ve sayaçları değiştirebilir');
r = psql(`update public.profiles set is_premium = false where id = '${A}'`);
check(ok(r) && prof(A, 'is_premium') === 'f', 'dashboard (postgres) değişiklikleri serbest');
r = as('authenticated', user(A), `insert into public.professional_posts (user_id, content, status) values ('${A}', 'Post', 'active')`);
check(ok(r) && prof(A, 'last_post_at is not null') === 't', 'kisg_refresh_last_post_at (SECURITY DEFINER) last_post_at güncelliyor');

// ---------------- RPC'ler ----------------
r = as('anon', null, `select public.get_public_phone('${M}')`);
check(ok(r) && r.out === '+905324445566', 'get_public_phone: anon, telefonu açık profil → telefon');
r = as('anon', null, `select coalesce(public.get_public_phone('${A}'), 'NULL')`);
check(ok(r) && r.out === 'NULL', 'get_public_phone: telefonu gizli profil → NULL');
r = as('authenticated', user(M), `select coalesce(public.get_public_phone('00000000-0000-4000-8000-000000000000'), 'NULL')`);
check(ok(r) && r.out === 'NULL', 'get_public_phone: olmayan profil → NULL');
r = as('authenticated', user(A), 'select id, email, phone, show_phone_publicly, is_premium from public.get_my_private_profile()');
check(ok(r) && r.out === `${A}|${EMAIL[A]}|+905550000000|f|f`, `get_my_private_profile: yalnız kendi satırı (${r.out.split('\n').length} satır)`);
r = as('anon', null, 'select * from public.get_my_private_profile()');
check(!ok(r) && /permission denied/.test(r.err), 'get_my_private_profile: anon çağıramaz');
const acl = psql(`select string_agg(p.proname || ':' || r.rolname || '=' || has_function_privilege(r.rolname, p.oid, 'EXECUTE'), ',' order by p.proname, r.rolname)
  from pg_proc p cross join (values ('anon'), ('authenticated')) r(rolname)
 where p.pronamespace = 'public'::regnamespace and p.proname in ('get_public_phone', 'get_my_private_profile', 'kisg_protect_profile_system_fields', 'kisg_guard_owner_status')`).out;
check(acl === 'get_my_private_profile:anon=false,get_my_private_profile:authenticated=true,get_public_phone:anon=true,get_public_phone:authenticated=true,kisg_guard_owner_status:anon=false,kisg_guard_owner_status:authenticated=false,kisg_protect_profile_system_fields:anon=false,kisg_protect_profile_system_fields:authenticated=false', `EXECUTE yetkileri (${acl})`);
const defs = psql(`select string_agg(proname || ':' || prosecdef || ':' || array_to_string(proconfig, ';'), ',' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_public_phone', 'get_my_private_profile', 'kisg_protect_profile_system_fields', 'kisg_guard_owner_status', 'kisg_request_is_privileged')`).out;
check(defs === ['get_my_private_profile:true', 'get_public_phone:true', 'kisg_guard_owner_status:false', 'kisg_protect_profile_system_fields:false', 'kisg_request_is_privileged:false'].map(x => x + ':search_path=""').join(','), `SECURITY DEFINER yalnız iki RPC, hepsinde search_path sabit (${defs})`);

// ---------------- A5: status geçişleri ----------------
const newPost = (uid, status = 'active') => psql(`insert into public.professional_posts (user_id, content, status) values ('${uid}', 'x', '${status}') returning id`).out.split('\n')[0];
const status = (t, id) => psql(`select status from public.${t} where id = '${id}'`).out;
const pid = t => `"public".${q(t)}."id"`;
let p1 = newPost(A);
r = as('authenticated', user(A), pgUpdate('professional_posts', { category_id: null, content: 'düzenlendi', image_path: null }, `${pid('professional_posts')} = '${p1}' AND "public"."professional_posts"."user_id" = '${A}' AND "public"."professional_posts"."status" = 'active'`));
check(ok(r) && r.out === '1', 'web Post düzenleme (status değişmeden) çalışıyor');
r = as('authenticated', user(A), pgUpdate('professional_posts', { profile_featured_order: null, status: 'deleted' }, `${pid('professional_posts')} = '${p1}' AND "public"."professional_posts"."user_id" = '${A}'`));
check(ok(r) && status('professional_posts', p1) === 'deleted', 'web Post silme (active → deleted) çalışıyor');
r = as('authenticated', user(A), pgUpdate('professional_posts', { status: 'active' }, `${pid('professional_posts')} = '${p1}'`));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'sahip silinmiş Post’u geri açamaz (deleted → active)');
let p2 = newPost(A);
r = as('authenticated', user(A), pgUpdate('professional_posts', { status: 'hidden' }, `${pid('professional_posts')} = '${p2}'`));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'sahip Post’u hidden yapamaz');
r = as('authenticated', user(X), pgUpdate('professional_posts', { status: 'hidden', moderated_at: new Date().toISOString(), moderation_reason: 'şikâyet' }, `${pid('professional_posts')} = '${p2}'`));
check(ok(r) && status('professional_posts', p2) === 'hidden', 'admin Post’u gizleyebilir');
r = as('authenticated', user(A), pgUpdate('professional_posts', { status: 'active' }, `${pid('professional_posts')} = '${p2}'`));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err) && status('professional_posts', p2) === 'hidden', 'A5: sahip admin’in gizlediği Post’u tekrar active YAPAMAZ');
r = as('authenticated', user(A), pgUpdate('professional_posts', { profile_featured_order: null, status: 'deleted' }, `${pid('professional_posts')} = '${p2}' AND "public"."professional_posts"."user_id" = '${A}'`));
check(ok(r) && status('professional_posts', p2) === 'deleted', 'sahip gizlenmiş Post’unu silebilir (hidden → deleted)');
r = as('authenticated', user(A), pgUpdate('professional_posts', { status: 'active' }, `${pid('professional_posts')} = '${p2}'`));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'gizle → sil → geri aç yolu da kapalı');
let p3 = newPost(A, 'active');
psql(`update public.professional_posts set status = 'hidden' where id = '${p3}'`);
r = as('authenticated', user(X), pgUpdate('professional_posts', { status: 'active' }, `${pid('professional_posts')} = '${p3}'`));
check(ok(r) && status('professional_posts', p3) === 'active', 'admin gizlenmiş Post’u geri açabilir');
r = as('service_role', null, pgUpdate('professional_posts', { status: 'hidden' }, `${pid('professional_posts')} = '${p3}'`));
check(ok(r) && status('professional_posts', p3) === 'hidden', 'service_role status değiştirebilir');

// yorumlar
const mp = newPost(M);
const newComment = () => { const r = as('authenticated', user(A), `insert into public.professional_post_comments (post_id, user_id, content, status) values ('${mp}', '${A}', 'yorum', 'active') returning id`); return r.out.split('\n')[0]; };
let c1 = newComment();
r = as('authenticated', user(A), pgUpdate('professional_post_comments', { content: 'düzenlendi' }, `${pid('professional_post_comments')} = '${c1}' AND "public"."professional_post_comments"."user_id" = '${A}' AND "public"."professional_post_comments"."status" = 'active'`));
check(ok(r) && r.out === '1', 'web yorum düzenleme çalışıyor');
r = as('authenticated', user(A), pgUpdate('professional_post_comments', { status: 'deleted' }, `${pid('professional_post_comments')} = '${c1}' AND "public"."professional_post_comments"."user_id" = '${A}'`));
check(ok(r) && status('professional_post_comments', c1) === 'deleted', 'web yorum silme (active → deleted) çalışıyor');
let c2 = newComment();
r = as('authenticated', user(X), pgUpdate('professional_post_comments', { status: 'hidden' }, `${pid('professional_post_comments')} = '${c2}'`));
check(ok(r) && status('professional_post_comments', c2) === 'hidden', 'admin yorumu gizleyebilir');
r = as('authenticated', user(A), pgUpdate('professional_post_comments', { status: 'active' }, `${pid('professional_post_comments')} = '${c2}'`));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'A5: sahip gizlenmiş yorumu tekrar active YAPAMAZ (politika izin verse de)');
r = as('authenticated', user(A), pgUpdate('professional_post_comments', { status: 'deleted' }, `${pid('professional_post_comments')} = '${c2}'`));
check(ok(r) && status('professional_post_comments', c2) === 'deleted', 'sahip gizlenmiş yorumunu silebilir');

// hizmetler
const newSvc = () => as('authenticated', user(A), `insert into public.professional_services (user_id, title, description, status) values ('${A}', 'Hizmet', 'Açıklama', 'active') returning id`).out.split('\n')[0];
let s1 = newSvc();
const svcWhere = id => `${pid('professional_services')} = '${id}' AND "public"."professional_services"."user_id" = '${A}' AND "public"."professional_services"."status" = 'active'`;
r = as('authenticated', user(A), pgUpdate('professional_services', { category_id: null, description: 'yeni', service_mode: 'onsite', service_region: 'İstanbul', title: 'Hizmet 2' }, svcWhere(s1)));
check(ok(r) && r.out === '1', 'web hizmet düzenleme çalışıyor');
r = as('authenticated', user(A), pgUpdate('professional_services', { status: 'archived' }, svcWhere(s1)));
check(ok(r) && status('professional_services', s1) === 'archived', 'web hizmet kaldırma (active → archived) çalışıyor');
r = as('authenticated', user(A), pgUpdate('professional_services', { status: 'active' }, `${pid('professional_services')} = '${s1}'`));
check(ok(r) && status('professional_services', s1) === 'active', 'sahip arşivlediği (moderasyonsuz) hizmeti yeniden yayınlayabilir');
r = as('authenticated', user(X), pgUpdate('professional_services', { status: 'hidden', moderated_at: new Date().toISOString(), moderation_reason: 'yanıltıcı' }, `${pid('professional_services')} = '${s1}'`));
check(ok(r) && status('professional_services', s1) === 'hidden', 'admin hizmeti gizleyebilir');
for (const to of ['active', 'archived']) {
  r = as('authenticated', user(A), pgUpdate('professional_services', { status: to }, `${pid('professional_services')} = '${s1}'`));
  check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), `A5: sahip gizlenmiş hizmeti ${to} yapamaz`);
}
psql(`update public.professional_services set status = 'archived' where id = '${s1}'`);   // moderated_at dolu, arşivde
r = as('authenticated', user(A), pgUpdate('professional_services', { status: 'active' }, `${pid('professional_services')} = '${s1}'`));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'moderasyon izi olan arşiv hizmet sahibince yeniden yayınlanamaz');
r = as('authenticated', user(X), pgUpdate('professional_services', { status: 'active' }, `${pid('professional_services')} = '${s1}'`));
check(ok(r) && status('professional_services', s1) === 'active', 'admin hizmeti yeniden açabilir');

// ---------------- rollback ----------------
r = runFile(path.join(ROOT, 'db/migrations/20260930_security_fix_pack1.rollback.sql'));
check(ok(r) && psql(`select count(*) from pg_trigger where tgname in ('kisg_protect_profile_system_fields', 'kisg_guard_owner_status')`).out === '0'
  && psql(`select count(*) from pg_proc where proname in ('get_public_phone', 'get_my_private_profile', 'kisg_request_is_privileged')`).out === '0', `rollback temiz ${r.err}`);
check(snapshot() === before, 'rollback sonrası politika/yetkiler başlangıçla aynı');
r = as('authenticated', user(A), pgUpdate('profiles', { is_premium: true }, byId(A)));
check(ok(r) && prof(A, 'is_premium') === 't', 'rollback sonrası davranış eski hâline döner (koruma kalktı)');
